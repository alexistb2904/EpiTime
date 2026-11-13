import { NativeModules, Platform } from "react-native";
import type { WidgetTaskHandlerProps } from "react-native-android-widget";
import { trackEvent } from "../services/analytics";
import { getStoredCourseWidgetPayload, refreshCourseWidgetsFromStoredConfig } from "../services/widgets";
import { emptyWidgetPayload } from "./courseWidgetFormat";
import { courseWidgets, renderCourseWidget, type CourseWidgetName } from "./renderCourseWidget";

const CourseWidgets = NativeModules.EpiTimeCourseWidgets as
	| {
			consumePendingTimelineRefresh?: (widgetName: string) => Promise<boolean>;
	  }
	| undefined;

export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
	const name = props.widgetInfo.widgetName as CourseWidgetName;
	if (!courseWidgets[name] || props.widgetAction === "WIDGET_DELETED") return;
	const widgetType = widgetTypeForName(name);
	if (props.widgetAction === "WIDGET_CLICK") void trackEvent("widget_opened", { widget_type: widgetType, source: "manual" });

	const payload = (await shouldUseStoredPayload(props)) ? await getStoredCourseWidgetPayload() : await refreshCourseWidgetsFromStoredConfig();
	void trackEvent("widget_data_refreshed", { widget_type: widgetType, source: "automatic", result: "success" });
	props.renderWidget(await renderCourseWidget(name, payload || emptyWidgetPayload, props.widgetInfo));
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
