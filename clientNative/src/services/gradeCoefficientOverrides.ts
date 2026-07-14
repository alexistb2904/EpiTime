import { getJSON, setJSON } from "./storage";

const SUBJECT_COEFFICIENT_OVERRIDES_KEY = "grades.subjectCoefficientOverrides";
const MIN_COEFFICIENT = 0.0001;
const MAX_COEFFICIENT = 1000;

export type SubjectCoefficientReference = {
	syllabusId?: number | null;
	subjectId?: string | null;
};

export type SubjectCoefficientOverrides = Record<string, number>;

export function normalizeSubjectCoefficient(value: unknown): number | null {
	const numeric = typeof value === "number" ? value : Number(String(value).trim().replace(",", "."));
	if (!Number.isFinite(numeric) || numeric < MIN_COEFFICIENT || numeric > MAX_COEFFICIENT) return null;
	return Math.round(numeric * 10_000) / 10_000;
}

export function getSubjectCoefficientOverrideKey(reference: SubjectCoefficientReference): string | null {
	if (typeof reference.syllabusId === "number" && Number.isFinite(reference.syllabusId)) return `syllabus:${reference.syllabusId}`;
	const subjectId = reference.subjectId?.trim();
	return subjectId ? `subject:${subjectId}` : null;
}

export function getSubjectCoefficientOverride(reference: SubjectCoefficientReference, overrides: SubjectCoefficientOverrides): number | undefined {
	const key = getSubjectCoefficientOverrideKey(reference);
	if (!key) return undefined;
	return normalizeSubjectCoefficient(overrides[key]) ?? undefined;
}

export async function getSubjectCoefficientOverrides(): Promise<SubjectCoefficientOverrides> {
	const stored = await getJSON<Record<string, unknown>>(SUBJECT_COEFFICIENT_OVERRIDES_KEY, {});
	const normalized: SubjectCoefficientOverrides = {};

	for (const [key, value] of Object.entries(stored || {})) {
		const coefficient = normalizeSubjectCoefficient(value);
		if (coefficient !== null) normalized[key] = coefficient;
	}

	return normalized;
}

export async function setSubjectCoefficientOverride(reference: SubjectCoefficientReference, value: number): Promise<SubjectCoefficientOverrides> {
	const key = getSubjectCoefficientOverrideKey(reference);
	const coefficient = normalizeSubjectCoefficient(value);
	if (!key || coefficient === null) throw new Error("Le coefficient doit être un nombre supérieur à 0.");

	const next = { ...(await getSubjectCoefficientOverrides()), [key]: coefficient };
	await setJSON(SUBJECT_COEFFICIENT_OVERRIDES_KEY, next);
	return next;
}

export async function clearSubjectCoefficientOverride(reference: SubjectCoefficientReference): Promise<SubjectCoefficientOverrides> {
	const key = getSubjectCoefficientOverrideKey(reference);
	const current = await getSubjectCoefficientOverrides();
	if (!key || !(key in current)) return current;

	const { [key]: _discarded, ...next } = current;
	await setJSON(SUBJECT_COEFFICIENT_OVERRIDES_KEY, next);
	return next;
}

export async function clearSubjectCoefficientOverrides(): Promise<void> {
	await setJSON<SubjectCoefficientOverrides>(SUBJECT_COEFFICIENT_OVERRIDES_KEY, {});
}
