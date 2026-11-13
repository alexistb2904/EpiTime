"use no memo";

import { FlexWidget, ListWidget, TextWidget } from "react-native-android-widget";
import type { WidgetGrade } from "../services/widgets";
import type { CourseWidgetTheme } from "./courseWidgetTheme";
import { AveragePanel, averagePanelWidth, EmptyNote, WidgetShell, type CourseWidgetProps } from "./widgetParts";

/** Semester average beside a scrollable ledger of the latest grades. */
export function SemesterGradesWidget({ payload, theme, width }: CourseWidgetProps) {
	const grades = payload.gradeSummary?.latestGrades || [];
	return (
		<WidgetShell theme={theme} uri="epitime://notes" label="Moyenne du semestre et dernières notes" padding={10}>
			<FlexWidget style={{ flex: 1, width: "match_parent", flexDirection: "row" }}>
				<AveragePanel payload={payload} theme={theme} width={averagePanelWidth(width)} />
				<FlexWidget style={{ flex: 1, height: "match_parent", marginLeft: 6 }}>
					{grades.length ? (
						<ListWidget style={{ height: "match_parent", width: "match_parent", backgroundColor: theme.transparent }}>
							{grades.map((grade, index) => (
								<GradeRow key={`${grade.subject}-${grade.label || "note"}-${grade.score}-${index}`} grade={grade} theme={theme} />
							))}
						</ListWidget>
					) : (
						<EmptyNote theme={theme} title="Pas encore de notes" hint="Ouvre Notes dans EpiTime pour les charger" />
					)}
				</FlexWidget>
			</FlexWidget>
		</WidgetShell>
	);
}

function GradeRow({ grade, theme }: { grade: WidgetGrade; theme: CourseWidgetTheme }) {
	const score = grade.score.replace(/\/20$/, "");
	return (
		<FlexWidget
			clickAction="OPEN_URI"
			clickActionData={{ uri: "epitime://notes" }}
			accessibilityLabel={`${grade.subject}, ${grade.label || "évaluation"} : ${grade.score}`}
			style={{ width: "match_parent", height: 52, paddingHorizontal: 4, flexDirection: "row", alignItems: "center" }}>
			<FlexWidget style={{ width: 48, height: 36, borderRadius: 12, backgroundColor: theme.chip, justifyContent: "center", alignItems: "center" }}>
				<TextWidget text={score} maxLines={1} truncate="END" style={{ color: theme.text, fontSize: 14, fontWeight: "700" }} />
			</FlexWidget>
			<FlexWidget style={{ flex: 1, marginLeft: 10 }}>
				<TextWidget text={grade.subject} maxLines={1} truncate="END" style={{ color: theme.text, fontSize: 14, fontWeight: "700" }} />
				<TextWidget text={grade.label || "Évaluation"} maxLines={1} truncate="END" style={{ color: theme.textMuted, fontSize: 12 }} />
			</FlexWidget>
		</FlexWidget>
	);
}
