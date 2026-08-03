"use no memo";

import React from "react";
import { FlexWidget, ListWidget, TextWidget } from "react-native-android-widget";
import type { CourseWidgetPayload, WidgetCourse } from "../services/widgets";
import { courseUri, formatDay, formatTime, safeColor, upcomingCourses } from "./courseWidgetFormat";
import { courseWidgetTheme, type CourseWidgetTheme, type CourseWidgetThemeName } from "./courseWidgetTheme";
import { RefreshWidgetButton } from "./RefreshWidgetButton";

type SemesterOverviewWidgetProps = {
	payload?: CourseWidgetPayload | null;
	theme?: CourseWidgetThemeName;
};

/** A compact 4 x 2 semester dashboard that prioritises the next classes over decoration. */
export function SemesterOverviewWidget({ payload, theme: themeName = "light" }: SemesterOverviewWidgetProps) {
	const theme = courseWidgetTheme(themeName);
	const summary = payload?.gradeSummary;
	const semesterLabel = summary?.semesterLabel || "Semestre en cours";
	const average = summary?.average || "-";
	const averageSuffix = /^[0-9]+(?:[,.][0-9]+)?$/.test(average.trim()) ? "/20" : "";
	const courses = upcomingCourses(payload, 8);

	return (
		<FlexWidget
			clickAction="OPEN_URI"
			clickActionData={{ uri: "epitime://notes" }}
			accessibilityLabel="Aperçu du semestre avec moyenne et liste défilable des prochains cours"
			style={{ height: "match_parent", width: "match_parent", padding: 8, backgroundColor: theme.surface, borderRadius: 18, overflow: "hidden" }}>
			<FlexWidget style={{ width: "match_parent", height: 32, flexDirection: "row", alignItems: "center" }}>
				<FlexWidget style={{ flex: 1 }}>
					<TextWidget text={semesterLabel} maxLines={1} truncate="END" style={{ color: theme.textMuted, fontSize: 8, fontWeight: "700" }} />
					<TextWidget text="Aperçu semestre" maxLines={1} truncate="END" style={{ color: theme.text, fontSize: 11, fontWeight: "700", marginTop: 1 }} />
				</FlexWidget>
				<FlexWidget
					style={{
						width: 55,
						height: "match_parent",
						paddingHorizontal: 5,
						borderRadius: 9,
						backgroundColor: theme.primaryContainer,
						flexDirection: "row",
						alignItems: "center",
					}}>
					<TextWidget text={average} maxLines={1} truncate="END" style={{ color: theme.onPrimaryContainer, fontSize: 12, fontWeight: "700" }} />
					{averageSuffix ? (
						<TextWidget text={averageSuffix} maxLines={1} style={{ color: theme.textMuted, fontSize: 6, fontWeight: "700", marginLeft: 1, marginTop: 3 }} />
					) : null}
				</FlexWidget>
				<FlexWidget style={{ marginLeft: 4 }}>
					<RefreshWidgetButton label="Actualiser les cours et la moyenne enregistrée" theme={theme} />
				</FlexWidget>
			</FlexWidget>

			<FlexWidget style={{ flex: 1, width: "match_parent", marginTop: 4 }}>
				<TextWidget text="PROCHAINS COURS" maxLines={1} style={{ color: theme.textMuted, fontSize: 7, fontWeight: "700", marginLeft: 1 }} />
				{courses.length ? (
					<FlexWidget style={{ flex: 1, width: "match_parent", marginTop: 2 }}>
						<ListWidget style={{ height: "match_parent", width: "match_parent", backgroundColor: theme.transparent }}>
							{courses.map((course, index) => (
								<CourseRow key={`${course.id || course.startMillis}-${index}`} course={course} active={index === 0} theme={theme} />
							))}
						</ListWidget>
					</FlexWidget>
				) : (
					<FlexWidget style={{ flex: 1, justifyContent: "center", paddingLeft: 1 }}>
						<TextWidget text="Aucun cours à venir" maxLines={1} truncate="END" style={{ color: theme.textMuted, fontSize: 10, fontWeight: "700" }} />
					</FlexWidget>
				)}
			</FlexWidget>
		</FlexWidget>
	);
}

function CourseRow({ course, active, theme }: { course: WidgetCourse; active: boolean; theme: CourseWidgetTheme }) {
	const accent = active ? safeColor(course.color) : theme.outline;
	const timeColor = active ? accent : theme.textMuted;
	return (
		<FlexWidget
			clickAction="OPEN_URI"
			clickActionData={{ uri: courseUri(course) }}
			accessibilityLabel={`Cours ${course.title}`}
			style={{
				width: "match_parent",
				height: 24,
				marginBottom: 2,
				paddingHorizontal: 1,
				borderRadius: 7,
				backgroundColor: active ? theme.primaryContainer : theme.transparent,
				flexDirection: "row",
				alignItems: "center",
			}}>
			<FlexWidget style={{ width: 2, height: 16, borderRadius: 2, backgroundColor: accent }} />
			<TextWidget text={formatTime(course.startMillis)} maxLines={1} truncate="END" style={{ width: 29, marginLeft: 4, color: timeColor, fontSize: 8, fontWeight: "700" }} />
			<FlexWidget style={{ flex: 1, marginLeft: 4 }}>
				<TextWidget text={course.title} maxLines={1} truncate="END" style={{ color: active ? theme.onPrimaryContainer : theme.text, fontSize: 9, fontWeight: "700" }} />
				<TextWidget text={`${formatDay(course.startMillis)} · ${course.room}`} maxLines={1} truncate="END" style={{ color: theme.textMuted, fontSize: 7, marginTop: 1 }} />
			</FlexWidget>
		</FlexWidget>
	);
}
