"use no memo";

import { upcomingCourses } from "./courseWidgetFormat";
import { CourseList, EmptyNote, WidgetShell, type CourseWidgetProps } from "./widgetParts";

export function UpcomingCoursesWidget({ payload, theme }: CourseWidgetProps) {
	const courses = upcomingCourses(payload, 8);
	return (
		<WidgetShell theme={theme} uri="epitime://agenda" label="Prochains cours EpiTime" padding={10}>
			{courses.length ? (
				<CourseList courses={courses} theme={theme} />
			) : (
				<EmptyNote theme={theme} title="Aucun cours à venir" hint="Ouvre EpiTime pour synchroniser ton planning" />
			)}
		</WidgetShell>
	);
}
