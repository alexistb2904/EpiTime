"use no memo";

import React from "react";
import { FlexWidget, TextWidget } from "react-native-android-widget";
import type { WidgetCourse } from "../services/widgets";
import { courseUri, dayLabel, dayPlan, formatTime, relativeStart } from "./courseWidgetFormat";
import type { CourseWidgetTheme } from "./courseWidgetTheme";
import { CourseList, WidgetShell, type CourseWidgetProps } from "./widgetParts";


export function TodayCoursesWidget({ payload, theme, width, height }: CourseWidgetProps) {
	const now = Date.now();
	const plan = dayPlan(payload, now);
	const tall = height >= 220;
	const wide = !tall && width >= 250;
	const small = !tall && !wide && (width < 130 || height < 130);
	const timeSize = tall ? 40 : wide ? 34 : small ? 28 : 36;
	// At the 110dp minimum only the end time and the strip fit.
	const captionLines = small ? 0 : tall ? 1 : 2;
	const padding = small || tall || wide ? 12 : 14;

	if (!plan) {
		return (
			<WidgetShell theme={theme} uri={courseUri()} label="Aucun cours prévu" padding={padding}>
				<Summary theme={theme} time="Libre" line="Aucun cours prévu" caption="Ouvre EpiTime pour synchroniser ton planning" timeSize={timeSize} captionLines={2} />
			</WidgetShell>
		);
	}

	const { courses, next, today, endMillis } = plan;
	const time = formatTime(today ? endMillis : next.startMillis);
	const line = today ? "Fin des cours" : `Reprise ${dayLabel(next.startMillis, now).toLowerCase()}`;
	const caption = today ? `${relativeStart(next, now)} · ${next.title}` : next.title;
	const remaining = courses.filter((course) => course.endMillis > now);
	const summary = (
		<Summary theme={theme} time={time} line={line} caption={caption} timeSize={timeSize} captionLines={captionLines} strip={<DayStrip courses={courses} now={now} theme={theme} />} />
	);

	return (
		<WidgetShell theme={theme} uri={courseUri(next)} label={`${line} ${time}. ${caption}`} padding={padding}>
			{tall ? (
				<FlexWidget style={{ flex: 1, width: "match_parent" }}>
					<FlexWidget style={{ width: "match_parent", height: 112, padding: 2 }}>{summary}</FlexWidget>
					<FlexWidget style={{ flex: 1, width: "match_parent", marginTop: 10 }}>
						<CourseList courses={remaining} theme={theme} />
					</FlexWidget>
				</FlexWidget>
			) : wide ? (
				<FlexWidget style={{ flex: 1, width: "match_parent", flexDirection: "row" }}>
					<FlexWidget style={{ width: Math.max(118, Math.round(width * 0.38)), height: "match_parent", padding: 2 }}>{summary}</FlexWidget>
					<FlexWidget style={{ flex: 1, height: "match_parent", marginLeft: 10 }}>
						<CourseList courses={remaining} theme={theme} />
					</FlexWidget>
				</FlexWidget>
			) : (
				summary
			)}
		</WidgetShell>
	);
}

type SummaryProps = {
	theme: CourseWidgetTheme;
	time: string;
	line: string;
	caption: string;
	timeSize: number;
	captionLines: number;
	strip?: React.ReactElement;
};

function Summary({ theme, time, line, caption, timeSize, captionLines, strip }: SummaryProps) {
	return (
		<FlexWidget style={{ flex: 1, width: "match_parent" }}>
			<TextWidget text={time} maxLines={1} style={{ color: theme.text, fontSize: timeSize, fontWeight: "700", letterSpacing: -0.02 }} />
			<TextWidget text={line} maxLines={1} truncate="END" style={{ color: theme.textMuted, fontSize: 13, fontWeight: "500" }} />
			<FlexWidget style={{ flex: 1 }} />
			{captionLines ? <TextWidget text={caption} maxLines={captionLines} truncate="END" style={{ color: theme.primary, fontSize: 13, fontWeight: "700" }} /> : null}
			{strip ? <FlexWidget style={{ width: "match_parent", marginTop: timeSize < 30 ? 6 : 8 }}>{strip}</FlexWidget> : null}
		</FlexWidget>
	);
}

function DayStrip({ courses, now, theme }: { courses: WidgetCourse[]; now: number; theme: CourseWidgetTheme }) {
	const minutes = (ms: number) => Math.max(1, Math.round(ms / 60000));
	const parts: React.ReactElement[] = [];
	let cursor = courses[0].startMillis;
	courses.forEach((course, index) => {
		const start = Math.max(course.startMillis, cursor);
		if (start > cursor) parts.push(<FlexWidget key={`gap-${index}`} style={{ flex: minutes(start - cursor), height: 6 }} />);
		const length = course.endMillis - start;
		if (length <= 0) return;
		const elapsed = Math.min(Math.max(now - start, 0), length);
		parts.push(
			<FlexWidget
				key={`course-${index}`}
				style={{ flex: minutes(length), height: 6, marginLeft: index ? 2 : 0, borderRadius: 3, overflow: "hidden", flexDirection: "row", backgroundColor: theme.container }}>
				{elapsed > 0 ? <FlexWidget style={{ flex: minutes(elapsed), height: 6, backgroundColor: theme.primary }} /> : null}
				{elapsed < length ? <FlexWidget style={{ flex: minutes(length - elapsed), height: 6 }} /> : null}
			</FlexWidget>
		);
		cursor = Math.max(cursor, course.endMillis);
	});
	return <FlexWidget style={{ width: "match_parent", height: 6, flexDirection: "row" }}>{parts}</FlexWidget>;
}
