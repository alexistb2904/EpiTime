export type AurigaTokenSet = {
	accessToken: string;
	refreshToken?: string;
	idToken?: string;
	expiresAt: number;
	refreshExpiresAt?: number;
};

export type AurigaGrade = {
	code: string;
	type: string;
	name: string;
	semester: number;
	grade: number;
	coefficient?: number;
	alphaMark?: "VA" | "NV" | string;
	syncedAt?: number;
};

export type AurigaCoeff = {
	name: string;
	value: number;
};

export type AurigaSyllabus = {
	id: number;
	UE: string;
	semester: number;
	name: string;
	code?: string;
	minScore?: number;
	coeff?: number;
	duration?: number;
	estimatedStudentWorkload?: number;
	mediaLanguages?: number[];
	prerequisites?: { fr?: string; en?: string };
	documents?: AurigaDocument[];
	period?: {
		startDate?: string;
		endDate?: string;
	};
	exams: AurigaExam[];
	courseDescription?: {
		coursPlan?: { fr?: string; en?: string };
		expected?: { fr?: string; en?: string }[];
	};
	caption?: {
		name?: string;
		goals?: { fr?: string; en?: string };
		program?: { fr?: string; en?: string };
	};
	responsables?: AurigaPerson[];
	activities?: AurigaActivity[];
	locations?: AurigaLocation[];
};

export type AurigaExam = {
	id: number;
	index: number;
	description?: { fr?: string; en?: string };
	type: string;
	typeName?: string;
	weighting?: number;
};

export type AurigaPerson = {
	uid?: number;
	login?: string;
	firstName?: string;
	lastName?: string;
};

export type AurigaActivity = {
	id: number;
	type: string;
	typeName?: string;
	duration?: number;
};

export type AurigaLocation = {
	code?: string;
	name?: string;
};

export type AurigaDocument = {
	id?: number;
	fileName?: string;
	fileExtension?: string;
	fileSize?: number;
	status?: string;
	language?: "fr" | "en";
};

export function extractSubjectCode(name: string): string {
	const match = name.match(/_S\d{2}_(.+)$/);
	return match ? match[1] : name;
}

export function isBachelorSection(name: string): boolean {
	return /^\d{4}_B_/.test(name);
}

export function cleanHtml(raw?: string | null): string {
	if (!raw) return "";
	return raw
		.replace(/<br\s*\/?>/gi, "\n")
		.replace(/<li[^>]*>/gi, "\n- ")
		.replace(/<\/li>/gi, "")
		.replace(/<\/?(ul|ol)[^>]*>/gi, "\n")
		.replace(/<strong[^>]*>/gi, "**")
		.replace(/<\/strong>/gi, "**")
		.replace(/<b[^>]*>/gi, "**")
		.replace(/<\/b>/gi, "**")
		.replace(/<em[^>]*>/gi, "_")
		.replace(/<\/em>/gi, "_")
		.replace(/<i[^>]*>/gi, "_")
		.replace(/<\/i>/gi, "_")
		.replace(/<p[^>]*>/gi, "\n")
		.replace(/<\/p>/gi, "\n")
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
		.replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
		.replace(/&apos;/gi, "'")
		.replace(/&#39;?/gi, "'")
		.replace(/&quot;/gi, "\"")
		.replace(/&nbsp;/gi, " ")
		.replace(/&amp;/gi, "&")
		.replace(/&lt;/gi, "<")
		.replace(/&gt;/gi, ">")
		.replace(/<[^>]+>/g, "")
		.replace(/[ \t]+\n/g, "\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}
