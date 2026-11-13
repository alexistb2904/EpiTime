import React from "react";
import type { WidgetInfo, WidgetRepresentation } from "react-native-android-widget";
import type { CourseWidgetPayload } from "../services/widgets";
import { courseWidgetThemes } from "./courseWidgetTheme";
import { NextCourseWidget } from "./NextCourseWidget";
import { SemesterGradesWidget } from "./SemesterGradesWidget";
import { SemesterOverviewWidget } from "./SemesterOverviewWidget";
import { UpcomingCoursesWidget } from "./UpcomingCoursesWidget";

export const courseWidgets = {
	NextCourse: NextCourseWidget,
	UpcomingCourses: UpcomingCoursesWidget,
	SemesterGrades: SemesterGradesWidget,
	SemesterOverview: SemesterOverviewWidget,
};

export type CourseWidgetName = keyof typeof courseWidgets;

/** Light and dark renders of one placed widget, sized to it. */
export async function renderCourseWidget(name: CourseWidgetName, payload: CourseWidgetPayload, info: Pick<WidgetInfo, "width" | "height">): Promise<WidgetRepresentation> {
	const themes = await courseWidgetThemes();
	const Widget = courseWidgets[name];
	const props = { payload, width: info.width, height: info.height };
	return {
		light: React.createElement(Widget, { ...props, theme: themes.light }),
		dark: React.createElement(Widget, { ...props, theme: themes.dark }),
	};
}
