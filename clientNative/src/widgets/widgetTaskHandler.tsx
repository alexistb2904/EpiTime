import React from "react";
import type { WidgetTaskHandlerProps } from "react-native-android-widget";
import { getStoredCourseWidgetPayload, refreshCourseWidgetsFromStoredConfig } from "../services/widgets";
import { NextCourseWidget } from "./NextCourseWidget";
import { UpcomingCoursesWidget } from "./UpcomingCoursesWidget";
import { emptyWidgetPayload } from "./courseWidgetFormat";

const widgets = {
	NextCourse: NextCourseWidget,
	UpcomingCourses: UpcomingCoursesWidget,
};

export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
	const Widget = widgets[props.widgetInfo.widgetName as keyof typeof widgets];
	if (!Widget || props.widgetAction === "WIDGET_DELETED") return;

	const payload = props.widgetAction === "WIDGET_UPDATE" ? await refreshCourseWidgetsFromStoredConfig() : await getStoredCourseWidgetPayload();
	const safePayload = payload || emptyWidgetPayload;
	props.renderWidget({
		light: React.createElement(Widget, { payload: safePayload, theme: "light" }),
		dark: React.createElement(Widget, { payload: safePayload, theme: "dark" }),
	});
}
