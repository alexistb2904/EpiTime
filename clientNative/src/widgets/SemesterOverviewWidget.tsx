"use no memo";

import { FlexWidget } from "react-native-android-widget";
import { upcomingCourses } from "./courseWidgetFormat";
import { AveragePanel, averagePanelWidth, CourseList, EmptyNote, WidgetShell, type CourseWidgetProps } from "./widgetParts";

export function SemesterOverviewWidget({ payload, theme, width }: CourseWidgetProps) {
	const courses = upcomingCourses(payload, 8);
	return (
		<WidgetShell theme={theme} uri="epitime://notes" label="Moyenne du semestre et prochains cours" padding={10}>
			<FlexWidget style={{ flex: 1, width: "match_parent", flexDirection: "row" }}>
				<AveragePanel payload={payload} theme={theme} width={averagePanelWidth(width)} />
				<FlexWidget style={{ flex: 1, height: "match_parent", marginLeft: 6 }}>
					{courses.length ? <CourseList courses={courses} theme={theme} /> : <EmptyNote theme={theme} title="Aucun cours à venir" />}
				</FlexWidget>
			</FlexWidget>
		</WidgetShell>
	);
}
