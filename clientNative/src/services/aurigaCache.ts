import { getJSON, removeJSON, setJSON } from "./storage";
import type { AurigaCoeff, AurigaGrade, AurigaSyllabus } from "./aurigaTypes";

const AURIGA_GRADES_KEY = "auriga.grades";
const AURIGA_SYLLABUS_KEY = "auriga.syllabus";
const AURIGA_COEFFS_KEY = "auriga.coeffs";
const AURIGA_USER_KEY = "auriga.user";
const AURIGA_LAST_SYNC_KEY = "auriga.lastSync";
export const AURIGA_AUTO_REFRESH_MAX_AGE_MS = 5 * 60_000;

export function isAurigaSyncStale(lastSync: string | null, maxAgeMs = AURIGA_AUTO_REFRESH_MAX_AGE_MS) {
	if (!lastSync) return true;
	const timestamp = new Date(lastSync).getTime();
	if (Number.isNaN(timestamp)) return true;
	return Date.now() - timestamp > maxAgeMs;
}

export async function saveAurigaGrades(grades: AurigaGrade[]): Promise<void> {
	await setJSON(AURIGA_GRADES_KEY, grades);
}

export async function getCachedAurigaGrades(): Promise<AurigaGrade[]> {
	return getJSON<AurigaGrade[]>(AURIGA_GRADES_KEY, []);
}

export async function saveAurigaSyllabus(syllabus: AurigaSyllabus[]): Promise<void> {
	await setJSON(AURIGA_SYLLABUS_KEY, syllabus);
}

export async function getCachedAurigaSyllabus(): Promise<AurigaSyllabus[]> {
	return getJSON<AurigaSyllabus[]>(AURIGA_SYLLABUS_KEY, []);
}

export async function saveAurigaCoeffs(coeffs: AurigaCoeff[]): Promise<void> {
	await setJSON(AURIGA_COEFFS_KEY, coeffs);
}

export async function getCachedAurigaCoeffs(): Promise<AurigaCoeff[]> {
	return getJSON<AurigaCoeff[]>(AURIGA_COEFFS_KEY, []);
}

export async function saveAurigaUser(user: unknown): Promise<void> {
	await setJSON(AURIGA_USER_KEY, user);
}

export async function getCachedAurigaUser<T = unknown>(): Promise<T | null> {
	return getJSON<T | null>(AURIGA_USER_KEY, null);
}

export async function saveAurigaLastSync(date = new Date()): Promise<void> {
	await setJSON(AURIGA_LAST_SYNC_KEY, date.toISOString());
}

export async function getAurigaLastSync(): Promise<string | null> {
	return getJSON<string | null>(AURIGA_LAST_SYNC_KEY, null);
}

export async function clearAurigaCache(): Promise<void> {
	await Promise.all([
		removeJSON(AURIGA_GRADES_KEY),
		removeJSON(AURIGA_SYLLABUS_KEY),
		removeJSON(AURIGA_COEFFS_KEY),
		removeJSON(AURIGA_USER_KEY),
		removeJSON(AURIGA_LAST_SYNC_KEY),
	]);
}
