import { clearRememberedAurigaCredentials, logoutAuriga } from "./aurigaAuth";
import { clearAurigaCache } from "./aurigaCache";
import { clearSubjectCoefficientOverrides } from "./gradeCoefficientOverrides";
import { clearGradeOverrides } from "./gradeOverrides";
import { clearAurigaGradeNotificationHistory } from "./notifications";
import { clearGradeWidgetSummary } from "./widgets";

export async function clearAllAurigaData(): Promise<void> {
	await clearGradeWidgetSummary().catch(() => {});
	await Promise.all([
		logoutAuriga(),
		clearRememberedAurigaCredentials(),
		clearAurigaCache(),
		clearSubjectCoefficientOverrides(),
		clearGradeOverrides(),
		clearAurigaGradeNotificationHistory(),
	]);
}
