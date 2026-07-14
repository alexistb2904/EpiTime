"use no memo";

import React from "react";
import { FlexWidget, ListWidget, TextWidget } from "react-native-android-widget";
import type { CourseWidgetPayload, WidgetGrade } from "../services/widgets";
import { courseWidgetTheme, type CourseWidgetTheme, type CourseWidgetThemeName } from "./courseWidgetTheme";
import { RefreshWidgetButton } from "./RefreshWidgetButton";

type SemesterGradesWidgetProps = {
	payload?: CourseWidgetPayload | null;
	theme?: CourseWidgetThemeName;
};

/** A 4 x 2 results ledger: one stable average, then a vertically scrollable feed of grades. */
export function SemesterGradesWidget({ payload, theme: themeName = "light" }: SemesterGradesWidgetProps) {
	const theme = courseWidgetTheme(themeName);
	const summary = payload?.gradeSummary;
	const latestGrades = summary?.latestGrades || [];
	const semesterLabel = summary?.semesterLabel || "Semestre en cours";
	const average = summary?.average || "—";

	return (
		<FlexWidget
			clickAction="OPEN_URI"
			clickActionData={{ uri: "epitime://notes" }}
			accessibilityLabel="Moyenne du semestre et liste défilable des notes récentes"
			style={{ height: "match_parent", width: "match_parent", padding: 8, backgroundColor: theme.surface, borderRadius: 18, overflow: "hidden" }}>
			<FlexWidget style={{ width: "match_parent", height: 32, flexDirection: "row", alignItems: "center" }}>
				<FlexWidget style={{ flex: 1 }}>
					<TextWidget text={`Notes · ${semesterLabel}`} maxLines={1} truncate="END" style={{ color: theme.text, fontSize: 12, fontWeight: "700" }} />
				</FlexWidget>
				<RefreshWidgetButton label="Actualiser les notes enregistrées" theme={theme} />
			</FlexWidget>

			<FlexWidget style={{ flex: 1, width: "match_parent", marginTop: 4, flexDirection: "row" }}>
				<FlexWidget style={{ width: 70, height: "match_parent", padding: 6, borderRadius: 12, backgroundColor: theme.primaryContainer }}>
					<FlexWidget style={{ width: 18, height: 2, borderRadius: 2, backgroundColor: theme.primary }} />
					<TextWidget text="MOYENNE /20" maxLines={1} style={{ color: theme.textMuted, fontSize: 7, fontWeight: "700", marginTop: 3 }} />
					<FlexWidget style={{ flex: 1, alignItems: "flex-start", justifyContent: "center" }}>
						<TextWidget text={average} maxLines={1} truncate="END" style={{ color: theme.onPrimaryContainer, fontSize: 19, fontWeight: "700" }} />
					</FlexWidget>
				</FlexWidget>

				<FlexWidget style={{ flex: 1, height: "match_parent", marginLeft: 8 }}>
					<TextWidget text="DERNIÈRES NOTES" maxLines={1} truncate="END" style={{ color: theme.textMuted, fontSize: 7, fontWeight: "700", marginLeft: 1 }} />
					{latestGrades.length ? (
						<FlexWidget style={{ flex: 1, width: "match_parent", marginTop: 2 }}>
							<ListWidget style={{ height: "match_parent", width: "match_parent", backgroundColor: theme.transparent }}>
								{latestGrades.map((grade, index) => <GradeRow key={`${grade.subject}-${grade.label || "note"}-${grade.score}-${index}`} grade={grade} theme={theme} />)}
							</ListWidget>
						</FlexWidget>
					) : (
						<FlexWidget style={{ flex: 1, justifyContent: "center", paddingLeft: 2 }}>
							<TextWidget text="Synchronise Notes pour afficher tes résultats" maxLines={2} truncate="END" style={{ color: theme.textMuted, fontSize: 8, fontWeight: "700" }} />
						</FlexWidget>
					)}
				</FlexWidget>
			</FlexWidget>
		</FlexWidget>
	);
}

function GradeRow({ grade, theme }: { grade: WidgetGrade; theme: CourseWidgetTheme }) {
	return (
		<FlexWidget
			clickAction="OPEN_URI"
			clickActionData={{ uri: "epitime://notes" }}
			accessibilityLabel={`${grade.subject}, ${grade.score}`}
			style={{ width: "match_parent", height: 24, marginBottom: 2, paddingHorizontal: 1, flexDirection: "row", alignItems: "center" }}>
			<FlexWidget style={{ width: 38, height: 18, borderRadius: 6, backgroundColor: theme.primaryContainer, justifyContent: "center", alignItems: "center" }}>
				<TextWidget text={grade.score} maxLines={1} truncate="END" style={{ color: theme.primary, fontSize: 8, fontWeight: "700" }} />
			</FlexWidget>
			<FlexWidget style={{ flex: 1, marginLeft: 5 }}>
				<TextWidget text={grade.subject} maxLines={1} truncate="END" style={{ color: theme.text, fontSize: 9, fontWeight: "700" }} />
				<TextWidget text={grade.label || "Évaluation"} maxLines={1} truncate="END" style={{ color: theme.textMuted, fontSize: 7, marginTop: 1 }} />
			</FlexWidget>
		</FlexWidget>
	);
}
