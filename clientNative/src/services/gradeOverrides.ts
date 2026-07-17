import { getJSON, setJSON } from "./storage";
import { normalizeSubjectCoefficient } from "./gradeCoefficientOverrides";

const GRADE_OVERRIDES_KEY = "grades.gradeOverrides";

export type GradeOverride = {
	coefficient?: number;
	/** `null` means that the grade is deliberately not linked to a syllabus exam. */
	examId?: number | null;
};

export type GradeOverrides = Record<string, GradeOverride>;

export async function getGradeOverrides(): Promise<GradeOverrides> {
	const stored = await getJSON<Record<string, GradeOverride>>(GRADE_OVERRIDES_KEY, {});
	const result: GradeOverrides = {};
	for (const [key, value] of Object.entries(stored || {})) {
		const coefficient = value ? normalizeSubjectCoefficient(value.coefficient) : null;
		const hasExam = Boolean(value && (typeof value.examId === "number" || value.examId === null));
		if (coefficient !== null || hasExam) result[key] = { ...(coefficient !== null ? { coefficient } : {}), ...(hasExam ? { examId: value.examId } : {}) };
	}
	return result;
}

export async function setGradeOverride(key: string, patch: GradeOverride): Promise<GradeOverrides> {
	const current = await getGradeOverrides();
	const coefficient = patch.coefficient === undefined ? current[key]?.coefficient : normalizeSubjectCoefficient(patch.coefficient);
	if (patch.coefficient !== undefined && coefficient === null) throw new Error("Le coefficient doit être un nombre supérieur à 0.");
	const examId = patch.examId === undefined ? current[key]?.examId : patch.examId;
	const next = { ...current, [key]: { ...(coefficient !== undefined && coefficient !== null ? { coefficient } : {}), ...(examId !== undefined ? { examId } : {}) } };
	await setJSON(GRADE_OVERRIDES_KEY, next);
	return next;
}

export async function clearGradeOverride(key: string, field?: keyof GradeOverride): Promise<GradeOverrides> {
	const current = await getGradeOverrides();
	if (!current[key]) return current;
	if (!field) {
		const { [key]: _discarded, ...next } = current;
		await setJSON(GRADE_OVERRIDES_KEY, next);
		return next;
	}
	const { [field]: _discarded, ...remaining } = current[key];
	const next = Object.keys(remaining).length ? { ...current, [key]: remaining } : Object.fromEntries(Object.entries(current).filter(([currentKey]) => currentKey !== key));
	await setJSON(GRADE_OVERRIDES_KEY, next);
	return next;
}

export async function clearGradeOverrides(): Promise<void> {
	await setJSON<GradeOverrides>(GRADE_OVERRIDES_KEY, {});
}
