"use no memo";

import React from "react";
import { FlexWidget, TextWidget } from "react-native-android-widget";
import type { CourseWidgetPayload } from "../services/widgets";
import { courseUri, formatDay, formatTime, relativeStart, safeColor, upcomingCourses } from "./courseWidgetFormat";
import { courseWidgetTheme, type CourseWidgetThemeName } from "./courseWidgetTheme";
import { RefreshWidgetButton } from "./RefreshWidgetButton";

type NextCourseWidgetProps = {
	payload?: CourseWidgetPayload | null;
	theme?: CourseWidgetThemeName;
};

export function NextCourseWidget({ payload, theme: themeName = "light" }: NextCourseWidgetProps) {
	const theme = courseWidgetTheme(themeName);
	const course = upcomingCourses(payload, 1)[0];
	const accent = course ? safeColor(course.color) : theme.outline;

	return (
		<FlexWidget
			clickAction="OPEN_URI"
			clickActionData={{ uri: courseUri(course) }}
			accessibilityLabel={course ? `Prochain cours ${course.title}` : "Aucun cours a venir"}
			style={{
				height: "match_parent",
				width: "match_parent",
				flexDirection: "row",
				padding: 16,
				backgroundColor: theme.surface,
				borderRadius: 18,
				overflow: "hidden",
			}}>
			<FlexWidget
				style={{
					width: 6,
					height: "match_parent",
					backgroundColor: accent,
					borderRadius: 3,
				}}
			/>
			<FlexWidget
				style={{
					flex: 1,
					height: "match_parent",
					marginLeft: 12,
				}}>
				<FlexWidget style={{ width: "match_parent", flexDirection: "row", alignItems: "flex-start" }}>
					<FlexWidget style={{ flex: 1, marginTop: 5 }}>
						<TextWidget
							text={course ? relativeStart(course) : "Planning"}
							maxLines={1}
							truncate="END"
							style={{ color: course ? accent : theme.textMuted, fontSize: 12, fontWeight: "700" }}
						/>
					</FlexWidget>
					<RefreshWidgetButton label="Rafraîchir le widget" theme={theme} />
				</FlexWidget>
				<FlexWidget style={{ flex: 1, width: "match_parent", justifyContent: "center", paddingRight: 2 }}>
					<TextWidget text={course?.title || "Aucun cours a venir"} maxLines={2} truncate="END" style={{ color: theme.text, fontSize: 20, fontWeight: "700" }} />
					<TextWidget
						text={course ? `${formatDay(course.startMillis)} - ${formatTime(course.startMillis)}-${formatTime(course.endMillis)}` : "Ouvre EpiTime pour synchroniser"}
						maxLines={1}
						truncate="END"
						style={{ color: theme.textMuted, fontSize: 13, fontWeight: "700", marginTop: 8 }}
					/>
					<TextWidget text={course?.room || "EpiTime"} maxLines={1} truncate="END" style={{ color: theme.textMuted, fontSize: 12, marginTop: 3 }} />
				</FlexWidget>
			</FlexWidget>
		</FlexWidget>
	);
}
