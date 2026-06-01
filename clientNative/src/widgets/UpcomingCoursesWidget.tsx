"use no memo";

import React from "react";
import { FlexWidget, ListWidget, TextWidget } from "react-native-android-widget";
import type { CourseWidgetPayload, WidgetCourse } from "../services/widgets";
import { courseWidgetTheme, type CourseWidgetTheme, type CourseWidgetThemeName } from "./courseWidgetTheme";
import { courseUri, formatDay, formatTime, safeColor, upcomingCourses } from "./courseWidgetFormat";
import { RefreshWidgetButton } from "./RefreshWidgetButton";

type UpcomingCoursesWidgetProps = {
	payload?: CourseWidgetPayload | null;
	theme?: CourseWidgetThemeName;
};

export function UpcomingCoursesWidget({ payload, theme: themeName = "light" }: UpcomingCoursesWidgetProps) {
	const theme = courseWidgetTheme(themeName);
	const courses = upcomingCourses(payload, 8);

	return (
		<FlexWidget
			clickAction="OPEN_URI"
			clickActionData={{ uri: "epitime://agenda" }}
			accessibilityLabel="Prochains cours EpiTime"
			style={{
				height: "match_parent",
				width: "match_parent",
				padding: 12,
				backgroundColor: theme.surface,
				borderRadius: 18,
				overflow: "hidden",
			}}>
			<FlexWidget style={{ width: "match_parent", flexDirection: "row", alignItems: "center" }}>
				<FlexWidget style={{ flex: 1 }}>
					<TextWidget text="Prochains cours" maxLines={1} truncate="END" style={{ color: theme.text, fontSize: 15, fontWeight: "700" }} />
				</FlexWidget>
				<RefreshWidgetButton label="Rafraîchir les cours" theme={theme} />
			</FlexWidget>

			{courses.length === 0 ? (
				<FlexWidget style={{ flex: 1, width: "match_parent", alignItems: "center", justifyContent: "center", marginTop: 6 }}>
					<TextWidget text="Aucun cours synchronisé" maxLines={2} style={{ color: theme.textMuted, fontSize: 13, fontWeight: "700", textAlign: "center" }} />
				</FlexWidget>
			) : (
				<FlexWidget style={{ flex: 1, width: "match_parent", marginTop: 6 }}>
					<ListWidget style={{ height: "match_parent", width: "match_parent", backgroundColor: theme.transparent }}>
						{courses.map((course, index) => (
							<CourseRow key={`${course.id || course.startMillis}-${index}`} course={course} active={index === 0} theme={theme} />
						))}
					</ListWidget>
				</FlexWidget>
			)}
		</FlexWidget>
	);
}

function CourseRow({ course, active, theme }: { course: WidgetCourse; active: boolean; theme: CourseWidgetTheme }) {
	const accent = active ? safeColor(course.color) : theme.outline;
	return (
		<FlexWidget
			clickAction="OPEN_URI"
			clickActionData={{ uri: courseUri(course) }}
			accessibilityLabel={course.title}
			style={{
				width: "match_parent",
				height: 54,
				flexDirection: "row",
				alignItems: "center",
				padding: 9,
				marginBottom: 8,
				backgroundColor: active ? theme.primaryContainer : theme.rowMuted,
				borderColor: theme.outline,
				borderRadius: 12,
				borderWidth: 1,
				overflow: "hidden",
			}}>
			<FlexWidget style={{ width: 5, height: "match_parent", borderRadius: 3, backgroundColor: accent }} />
			<TextWidget
				text={formatTime(course.startMillis)}
				maxLines={1}
				truncate="END"
				style={{ width: 42, marginLeft: 8, color: active ? accent : theme.textDisabled, fontSize: 12, fontWeight: "700" }}
			/>
			<FlexWidget style={{ flex: 1, marginLeft: 7 }}>
				<TextWidget
					text={course.title}
					maxLines={1}
					truncate="END"
					style={{ color: active ? theme.onPrimaryContainer : theme.textMuted, fontSize: 13, fontWeight: "700" }}
				/>
				<TextWidget
					text={`${formatDay(course.startMillis)} - ${course.room}`}
					maxLines={1}
					truncate="END"
					style={{ color: active ? theme.textMuted : theme.textDisabled, fontSize: 11, marginTop: 1 }}
				/>
			</FlexWidget>
		</FlexWidget>
	);
}
