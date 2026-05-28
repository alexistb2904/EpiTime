import React from "react";
import { NativeModules, Platform } from "react-native";
import type { WidgetTaskHandlerProps } from "react-native-android-widget";
import { getStoredCourseWidgetPayload, refreshCourseWidgetsFromStoredConfig } from "../services/widgets";
import { NextCourseWidget } from "./NextCourseWidget";
import { UpcomingCoursesWidget } from "./UpcomingCoursesWidget";
import { emptyWidgetPayload } from "./courseWidgetFormat";

const widgets = {
	NextCourse: NextCourseWidget,
	UpcomingCourses: UpcomingCoursesWidget,
};

const CourseWidgets = NativeModules.EpiTimeCourseWidgets as
	| {
			consumePendingTimelineRefresh?: (widgetName: string) => Promise<boolean>;
	  }
	| undefined;

export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
	const Widget = widgets[props.widgetInfo.widgetName as keyof typeof widgets];
	if (!Widget || props.widgetAction === "WIDGET_DELETED") return;

	const payload = (await shouldUseStoredPayload(props)) ? await getStoredCourseWidgetPayload() : await refreshCourseWidgetsFromStoredConfig();
	const safePayload = payload || emptyWidgetPayload;
	props.renderWidget({
		light: React.createElement(Widget, { payload: safePayload, theme: "light" }),
		dark: React.createElement(Widget, { payload: safePayload, theme: "dark" }),
	});
}

async function shouldUseStoredPayload(props: WidgetTaskHandlerProps) {
	if (props.widgetAction !== "WIDGET_UPDATE") return true;
	if (Platform.OS !== "android") return false;
	return (await CourseWidgets?.consumePendingTimelineRefresh?.(props.widgetInfo.widgetName).catch(() => false)) ?? false;
}
