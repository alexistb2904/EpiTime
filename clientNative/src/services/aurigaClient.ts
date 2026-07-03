import gradesPayload from "./aurigaPayloads/grades.json";
import syllabusPayload from "./aurigaPayloads/syllabus.json";
import { AURIGA_API, AurigaAuthError, forceRefreshAurigaAccessToken, getValidAurigaAccessToken } from "./aurigaAuth";
import {
	getCachedAurigaGrades,
	saveAurigaCoeffs,
	saveAurigaGrades,
	saveAurigaLastSync,
	saveAurigaSyllabus,
	saveAurigaUser,
} from "./aurigaCache";
import { extractSubjectCode, type AurigaCoeff, type AurigaGrade, type AurigaSyllabus } from "./aurigaTypes";

const REQUEST_TIMEOUT_MS = 15_000;

type SearchResultResponse = {
	content?: {
		lines?: unknown[][];
		totalPages?: number;
		number?: number;
		last?: boolean;
	};
	lines?: unknown[][];
	totalPages?: number;
	last?: boolean;
};

function clonePayload<T>(payload: T): T {
	return JSON.parse(JSON.stringify(payload)) as T;
}

function getLines(response: SearchResultResponse): unknown[][] {
	const lines = response.content?.lines || response.lines || [];
	return Array.isArray(lines) ? lines.filter(Array.isArray) : [];
}

function getPageInfo(response: SearchResultResponse) {
	return {
		totalPages: response.content?.totalPages ?? response.totalPages,
		number: response.content?.number,
		last: response.content?.last ?? response.last,
	};
}

async function fetchWithTimeout(url: string, init: RequestInit) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
	try {
		return await fetch(url, { ...init, signal: controller.signal });
	} finally {
		clearTimeout(timer);
	}
}

async function requestWithToken<T>(path: string, init: RequestInit | undefined, accessToken: string): Promise<T> {
	const url = path.startsWith("http") ? path : `${AURIGA_API}${path}`;
	const headers = {
		Accept: "application/json",
		...(init?.body ? { "Content-Type": "application/json" } : null),
		...(init?.headers as Record<string, string> | undefined),
		Authorization: `Bearer ${accessToken}`,
	};
	const response = await fetchWithTimeout(url, { ...init, headers });
	if (response.status === 401) throw new AurigaAuthError();
	if (!response.ok) {
		console.warn("Auriga request failed", { status: response.status, endpoint: path });
		throw new Error(`Auriga ${response.status}`);
	}
	if (response.status === 204) return undefined as T;
	return (await response.json()) as T;
}

export async function aurigaRequest<T>(path: string, init?: RequestInit): Promise<T> {
	const accessToken = await getValidAurigaAccessToken();
	if (!accessToken) throw new AurigaAuthError();
	try {
		return await requestWithToken<T>(path, init, accessToken);
	} catch (error) {
		if (!(error instanceof AurigaAuthError)) throw error;
		const refreshed = await forceRefreshAurigaAccessToken();
		if (!refreshed) throw error;
		return requestWithToken<T>(path, init, refreshed);
	}
}

export async function fetchAurigaUser(): Promise<unknown> {
	return aurigaRequest<unknown>("/me");
}

export function parseGradeRow(row: unknown[]): AurigaGrade | null {
	if (!Array.isArray(row) || row.length < 5) return null;

	const itemCode = row[0];
	const gradeValue = row[1];
	const coefficient = row[2];
	const itemName = row[3];
	const typeName = row[4];

	if (gradeValue === null || gradeValue === undefined) return null;

	const gradeStr = String(gradeValue).trim();
	if (gradeStr === "") return null;

	let semester = 0;
	const match = String(itemName).match(/_S(\d+)_/i);
	if (match) semester = Number(match[1]);

	let alphaMark: string | undefined;
	let numericGrade = 0;

	if (gradeStr === "VA" || gradeStr === "Valide" || gradeStr === "Validé") {
		alphaMark = "VA";
	} else if (gradeStr === "NV" || gradeStr === "Non valide" || gradeStr === "Non validé") {
		alphaMark = "NV";
	} else {
		const parsed = Number(gradeStr.replace(",", "."));
		if (Number.isNaN(parsed)) return null;
		numericGrade = parsed;
	}

	const coeffNum = Number(String(coefficient).replace(",", "."));

	return {
		code: String(itemCode ?? ""),
		type: String(typeName ?? ""),
		name: String(itemName ?? ""),
		semester,
		grade: numericGrade,
		coefficient: Number.isFinite(coeffNum) ? coeffNum : undefined,
		alphaMark,
		syncedAt: Date.now(),
	};
}

export async function fetchAurigaGrades(): Promise<AurigaGrade[]> {
	const size = 100;
	const allRows: unknown[][] = [];
	let page = 1;

	while (page < 30) {
		const response = await aurigaRequest<SearchResultResponse>(`/menuEntries/1036/searchResult?size=${size}&page=${page}&sort=id&disableWarnings=true`, {
			method: "POST",
			body: JSON.stringify(gradesPayload),
		});
		const lines = getLines(response);
		allRows.push(...lines);
		const info = getPageInfo(response);
		if (info.last || (typeof info.totalPages === "number" && page >= info.totalPages) || lines.length < size) break;
		page += 1;
	}

	return allRows.map(parseGradeRow).filter((grade): grade is AurigaGrade => Boolean(grade));
}

function readCatalogs(raw: unknown): Array<{ id: number | string }> {
	if (Array.isArray(raw)) return raw.filter((item): item is { id: number | string } => Boolean(item && typeof item === "object" && "id" in item));
	const content = (raw as { content?: unknown })?.content;
	if (Array.isArray(content)) return content.filter((item): item is { id: number | string } => Boolean(item && typeof item === "object" && "id" in item));
	return [];
}

function mapSyllabusDetail(row: any, coeffs: AurigaCoeff[]): AurigaSyllabus | null {
	if (!row || typeof row !== "object" || row.id === undefined || row.id === null) return null;
	const fileName = row.documents?.[0]?.fileName || "";
	const syllabusCode = row.code || (typeof fileName === "string" ? fileName.replace(/_(FR|EN)$/i, "") : "");
	const name = String(syllabusCode || row.caption?.fr || row.id);
	const semesterMatch = name.match(/_S(\d+)_/i);
	const semester = semesterMatch ? Number(semesterMatch[1]) : 0;
	const subjectCode = extractSubjectCode(name);
	const ueCode = subjectCode.split("_")[0] || "Unknown";
	const coeff = coeffs.find((item) => item.name === name || extractSubjectCode(item.name) === subjectCode);
	const mediaLanguages = Array.isArray(row.customAttributes?.MediaLanguage)
		? row.customAttributes.MediaLanguage.map((item: any) => Number(item?.id)).filter((id: number) => Number.isFinite(id))
		: [];

	return {
		id: Number(row.id),
		UE: ueCode,
		semester,
		name,
		code: row.field?.code,
		minScore: row.customAttributes?.miniScore,
		coeff: coeff?.value,
		duration: row.duration,
		estimatedStudentWorkload: row.estimatedStudentWorkload,
		mediaLanguages,
		prerequisites: row.customAttributes?.PrerequisitesDescription,
		documents:
			row.documents?.map((document: any) => ({
				id: document.id,
				fileName: document.fileName,
				fileExtension: document.fileExtension,
				fileSize: document.fileSize,
				status: document.documentStatus?.caption?.fr || document.documentStatus?.code,
				language: /_EN$/i.test(String(document.fileName || "")) ? "en" : /_FR$/i.test(String(document.fileName || "")) ? "fr" : undefined,
			})) || [],
		period: {
			startDate: row.period?.startDate,
			endDate: row.period?.endDate,
		},
		exams:
			row.syllabusAssessmentComponents?.map((exam: any, index: number) => ({
				id: Number(exam.id ?? index + 1),
				index: Number(exam.index ?? index + 1),
				description: exam.description,
				type: String(exam.examType?.code ?? ""),
				typeName: exam.examType?.caption?.fr,
				weighting: exam.weighting,
			})) || [],
		courseDescription: {
			coursPlan: row.customAttributes?.CoursePlan,
			expected: [],
		},
		caption: {
			name: row.caption?.fr,
			goals: row.outline?.fr ? { fr: row.outline.fr } : undefined,
			program: row.learningOutcome?.fr ? { fr: row.learningOutcome.fr } : undefined,
		},
		responsables:
			row.syllabusResponsibles?.map((responsable: any) => ({
				uid: responsable.person?.id,
				login: responsable.person?.customAttributes?.LOGIN,
				firstName: responsable.person?.currentFirstName,
				lastName: responsable.person?.currentLastName,
			})) || [],
		activities:
			row.syllabusActivityTypes?.map((activity: any) => ({
				id: Number(activity.id),
				type: String(activity.activityType?.code ?? ""),
				typeName: activity.activityType?.caption?.fr,
				duration: activity.duration,
			})) || [],
		locations:
			row.syllabusSites?.map((site: any) => ({
				code: site.site?.code,
				name: site.site?.caption?.fr,
			})) || [],
	};
}

export async function fetchAurigaSyllabus(coeffs: AurigaCoeff[] = []): Promise<AurigaSyllabus[]> {
	const catalogsRaw = await aurigaRequest<unknown>("/menuEntries/166/courseCatalogDefinitions?sortBy=code,asc");
	const catalogs = readCatalogs(catalogsRaw);
	const ids = new Set<number>();

	for (const catalog of catalogs) {
		const payload = clonePayload<any>(syllabusPayload);
		if (!payload.searchResultDefinition) payload.searchResultDefinition = {};
		if (!payload.searchResultDefinition.filtersCustom) payload.searchResultDefinition.filtersCustom = {};
		payload.searchResultDefinition.filtersCustom.id = catalog.id;
		const response = await aurigaRequest<SearchResultResponse>("/menuEntries/166/searchResult?size=100&page=1&sort=id", {
			method: "POST",
			body: JSON.stringify(payload),
		});
		for (const line of getLines(response)) {
			const id = Number(line[0]);
			if (Number.isFinite(id)) ids.add(id);
		}
	}

	const syllabus: AurigaSyllabus[] = [];
	for (const id of ids) {
		try {
			const detail = await aurigaRequest<any>(`/menuEntries/166/syllabuses/${id}`);
			const mapped = mapSyllabusDetail(detail, coeffs);
			if (mapped) syllabus.push(mapped);
		} catch (error) {
			console.warn("Auriga syllabus detail failed", { status: error instanceof Error ? error.message : "unknown", endpoint: `/menuEntries/166/syllabuses/${id}` });
		}
	}
	return syllabus;
}

async function preserveGradeSyncDates(grades: AurigaGrade[]) {
	const cached = await getCachedAurigaGrades();
	if (!cached.length) return grades;
	const byIdentity = new Map(cached.map((grade) => [`${grade.code}|${grade.name}`, grade.syncedAt]));
	const now = Date.now();
	return grades.map((grade) => ({
		...grade,
		syncedAt: byIdentity.get(`${grade.code}|${grade.name}`) || grade.syncedAt || now,
	}));
}

export async function syncAurigaData(): Promise<{
	grades: AurigaGrade[];
	coeffs: AurigaCoeff[];
	syllabus: AurigaSyllabus[];
	user: unknown;
}> {
	const user = await fetchAurigaUser();
	const grades = await preserveGradeSyncDates(await fetchAurigaGrades());
	const coeffs: AurigaCoeff[] = [];
	let syllabus: AurigaSyllabus[] = [];
	try {
		syllabus = await fetchAurigaSyllabus(coeffs);
	} catch (error) {
		console.warn("Auriga syllabus sync skipped", { status: error instanceof Error ? error.message : "unknown", endpoint: "/menuEntries/166" });
	}
	await Promise.all([saveAurigaUser(user), saveAurigaGrades(grades), saveAurigaCoeffs(coeffs), saveAurigaSyllabus(syllabus), saveAurigaLastSync()]);
	return { grades, coeffs, syllabus, user };
}
