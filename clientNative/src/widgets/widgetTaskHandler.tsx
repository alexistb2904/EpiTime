import React from "react";
import { NativeModules, Platform } from "react-native";
import type { WidgetTaskHandlerProps } from "react-native-android-widget";
import { COURSE_WIDGET_REFRESH_ACTION, getStoredCourseWidgetPayload, refreshCourseWidgetsFromStoredConfig, requestCourseWidgetUpdates } from "../services/widgets";
import { NextCourseWidget } from "./NextCourseWidget";
import { SemesterGradesWidget } from "./SemesterGradesWidget";
import { SemesterOverviewWidget } from "./SemesterOverviewWidget";
import { UpcomingCoursesWidget } from "./UpcomingCoursesWidget";
import { emptyWidgetPayload } from "./courseWidgetFormat";
import { trackEvent } from "../services/analytics";

const widgets = {
	NextCourse: NextCourseWidget,
	UpcomingCourses: UpcomingCoursesWidget,
	SemesterGrades: SemesterGradesWidget,
	SemesterOverview: SemesterOverviewWidget,
};

const CourseWidgets = NativeModules.EpiTimeCourseWidgets as
	| {
			consumePendingTimelineRefresh?: (widgetName: string) => Promise<boolean>;
	  }
	| undefined;

export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
	const Widget = widgets[props.widgetInfo.widgetName as keyof typeof widgets];
	if (!Widget || props.widgetAction === "WIDGET_DELETED") return;
	const widgetType = widgetTypeForName(props.widgetInfo.widgetName);
	if (props.widgetAction === "WIDGET_CLICK") void trackEvent("widget_opened", { widget_type: widgetType, source: "manual" });

	const shouldForceRefresh = props.widgetAction === "WIDGET_CLICK" && props.clickAction === COURSE_WIDGET_REFRESH_ACTION;
	const payload = shouldForceRefresh
		? await refreshWidgetPayload()
		: (await shouldUseStoredPayload(props))
			? await getStoredCourseWidgetPayload()
			: await refreshCourseWidgetsFromStoredConfig();
	const safePayload = payload || emptyWidgetPayload;
	void trackEvent("widget_data_refreshed", { widget_type: widgetType, source: shouldForceRefresh ? "manual" : "automatic", result: "success" });
	props.renderWidget({
		light: React.createElement(Widget, { payload: safePayload, theme: "light" }),
		dark: React.createElement(Widget, { payload: safePayload, theme: "dark" }),
	});
}

function widgetTypeForName(name: string) {
	if (name === "NextCourse") return "next_course";
	if (name === "UpcomingCourses") return "upcoming_courses";
	if (name === "SemesterGrades") return "semester_grades";
	return "semester_overview";
}

async function shouldUseStoredPayload(props: WidgetTaskHandlerProps) {
	if (props.widgetAction !== "WIDGET_UPDATE") return true;
	if (Platform.OS !== "android") return false;
	return (await CourseWidgets?.consumePendingTimelineRefresh?.(props.widgetInfo.widgetName).catch(() => false)) ?? false;
}

async function refreshWidgetPayload() {
	const payload = await refreshCourseWidgetsFromStoredConfig();
	if (payload) {
		await requestCourseWidgetUpdates(payload).catch(() => false);
	}
	return payload;
}
