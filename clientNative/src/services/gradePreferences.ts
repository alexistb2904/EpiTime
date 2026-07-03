import { getJSON, setJSON } from "./storage";

const GRADE_WEIGHTING_KEY = "grades.useWeightedAverages";

export async function getUseWeightedAverages(): Promise<boolean> {
	return getJSON<boolean>(GRADE_WEIGHTING_KEY, true);
}

export async function setUseWeightedAverages(enabled: boolean): Promise<void> {
	await setJSON(GRADE_WEIGHTING_KEY, enabled);
}
