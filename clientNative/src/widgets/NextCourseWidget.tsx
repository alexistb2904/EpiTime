"use no memo";

import { FlexWidget, TextWidget } from "react-native-android-widget";
import { courseUri, formatTime, relativeStart, upcomingCourses } from "./courseWidgetFormat";
import { CourseDot, EmptyNote, PlaceIcon, WidgetShell, type CourseWidgetProps } from "./widgetParts";

export function NextCourseWidget({ payload, theme, height }: CourseWidgetProps) {
	const course = upcomingCourses(payload, 1)[0];
	const roomy = height >= 140;

	if (!course) {
		return (
			<WidgetShell theme={theme} uri={courseUri()} label="Aucun cours à venir" padding={16}>
				<EmptyNote theme={theme} title="Aucun cours à venir" hint="Ouvre EpiTime pour synchroniser ton planning" />
			</WidgetShell>
		);
	}

	const detail = [course.type, course.teacher].filter(Boolean).join(" · ");
	return (
		<WidgetShell theme={theme} uri={courseUri(course)} label={`Prochain cours ${course.title}, ${relativeStart(course)}, salle ${course.room}`} padding={14}>
			<FlexWidget style={{ flexDirection: "row" }}>
				<FlexWidget style={{ height: 24, paddingHorizontal: 10, borderRadius: 12, backgroundColor: theme.container, justifyContent: "center" }}>
					<TextWidget text={relativeStart(course)} maxLines={1} style={{ color: theme.onContainer, fontSize: 12, fontWeight: "700" }} />
				</FlexWidget>
			</FlexWidget>

			<FlexWidget style={{ flex: 1, width: "match_parent", justifyContent: "center" }}>
				<FlexWidget style={{ flexDirection: "row", alignItems: "center" }}>
					<CourseDot color={course.color} />
					<FlexWidget style={{ flex: 1, marginLeft: 8 }}>
						<TextWidget text={course.title} maxLines={roomy ? 2 : 1} truncate="END" style={{ color: theme.text, fontSize: 16, fontWeight: "700" }} />
					</FlexWidget>
				</FlexWidget>
				{roomy && detail ? <TextWidget text={detail} maxLines={1} truncate="END" style={{ color: theme.textMuted, fontSize: 12, marginTop: 2, marginLeft: 16 }} /> : null}
			</FlexWidget>

			<FlexWidget style={{ width: "match_parent", flexDirection: "row", alignItems: "flex-end" }}>
				<TextWidget text={formatTime(course.startMillis)} maxLines={1} style={{ color: theme.text, fontSize: 28, fontWeight: "700" }} />
				<TextWidget text={`– ${formatTime(course.endMillis)}`} maxLines={1} style={{ color: theme.textMuted, fontSize: 13, marginLeft: 6, marginBottom: 5 }} />
				<FlexWidget style={{ flex: 1, flexDirection: "row", justifyContent: "flex-end", alignItems: "center", marginLeft: 8, marginBottom: 4 }}>
					<PlaceIcon color={theme.primary} />
					<TextWidget text={course.room || "Salle ?"} maxLines={1} truncate="END" style={{ color: theme.primary, fontSize: 15, fontWeight: "700", marginLeft: 3 }} />
				</FlexWidget>
			</FlexWidget>
		</WidgetShell>
	);
}
