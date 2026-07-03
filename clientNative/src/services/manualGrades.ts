import { getJSON, setJSON } from "./storage";

const MANUAL_GRADES_KEY = "grades.manual";

export type ManualGrade = {
	id: string;
	subjectId: string;
	subjectCode: string;
	syllabusId?: number;
	examId?: number;
	examType?: string;
	examIndex?: number;
	description: string;
	grade: number;
	coefficient?: number;
	createdAt: number;
};

export async function getManualGrades(): Promise<ManualGrade[]> {
	return getJSON<ManualGrade[]>(MANUAL_GRADES_KEY, []);
}

export async function saveManualGrades(grades: ManualGrade[]): Promise<void> {
	await setJSON(MANUAL_GRADES_KEY, grades);
}

export async function addManualGrade(input: Omit<ManualGrade, "id" | "createdAt">): Promise<ManualGrade[]> {
	const grades = await getManualGrades();
	const next: ManualGrade = {
		...input,
		id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
		createdAt: Date.now(),
	};
	const updated = [...grades, next];
	await saveManualGrades(updated);
	return updated;
}

export async function deleteManualGrade(id: string): Promise<ManualGrade[]> {
	const updated = (await getManualGrades()).filter((grade) => grade.id !== id);
	await saveManualGrades(updated);
	return updated;
}
