import React from "react";
import { FlexWidget, ListWidget, SvgWidget, TextWidget } from "react-native-android-widget";
import type { CourseWidgetPayload, WidgetCourse } from "../services/widgets";
import { courseUri, dayLabel, formatTime, safeColor } from "./courseWidgetFormat";
import type { CourseWidgetTheme } from "./courseWidgetTheme";

export type CourseWidgetProps = {
	payload: CourseWidgetPayload;
	theme: CourseWidgetTheme;
	/** Current widget size in dp. */
	width: number;
	height: number;
};

type ShellProps = {
	theme: CourseWidgetTheme;
	uri: string;
	label: string;
	padding?: number;
	children: React.ReactNode;
};

/** Widget background: one surface, launcher-like corner radius, opens the app on tap. */
export function WidgetShell({ theme, uri, label, padding = 12, children }: ShellProps) {
	return (
		<FlexWidget
			clickAction="OPEN_URI"
			clickActionData={{ uri }}
			accessibilityLabel={label}
			style={{ height: "match_parent", width: "match_parent", padding, backgroundColor: theme.background, borderRadius: 24, overflow: "hidden" }}>
			{children}
		</FlexWidget>
	);
}

export function CourseDot({ color, size = 8 }: { color?: string; size?: number }) {
	return <FlexWidget style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: safeColor(color) }} />;
}

export function PlaceIcon({ color, size = 16 }: { color: string; size?: number }) {
	return (
		<SvgWidget
			style={{ width: size, height: size }}
			svg={`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="${color}" d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z"/></svg>`}
		/>
	);
}

export function EmptyNote({ theme, title, hint }: { theme: CourseWidgetTheme; title: string; hint?: string }) {
	return (
		<FlexWidget style={{ flex: 1, width: "match_parent", justifyContent: "center", paddingHorizontal: 4 }}>
			<TextWidget text={title} maxLines={2} truncate="END" style={{ color: theme.text, fontSize: 14, fontWeight: "700" }} />
			{hint ? <TextWidget text={hint} maxLines={2} truncate="END" style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }} /> : null}
		</FlexWidget>
	);
}

/** Scrollable course list grouped under day headings; the next course sits on the tonal container. */
export function CourseList({ courses, theme }: { courses: WidgetCourse[]; theme: CourseWidgetTheme }) {
	const now = Date.now();
	const items: React.ReactElement[] = [];
	let lastDay = "";
	courses.forEach((course, index) => {
		const day = dayLabel(course.startMillis, now);
		if (day !== lastDay) {
			items.push(<DayHeading key={`day-${day}`} label={day} theme={theme} first={index === 0} />);
			lastDay = day;
		}
		items.push(<CourseRow key={`${course.id || course.startMillis}-${index}`} course={course} next={index === 0} theme={theme} />);
	});
	return <ListWidget style={{ height: "match_parent", width: "match_parent", backgroundColor: theme.transparent }}>{items}</ListWidget>;
}

function DayHeading({ label, theme, first }: { label: string; theme: CourseWidgetTheme; first: boolean }) {
	return (
		<FlexWidget style={{ width: "match_parent", paddingTop: first ? 0 : 8, paddingBottom: 4, paddingHorizontal: 4 }}>
			<TextWidget text={label} maxLines={1} truncate="END" style={{ color: theme.primary, fontSize: 12, fontWeight: "700" }} />
		</FlexWidget>
	);
}

function CourseRow({ course, next, theme }: { course: WidgetCourse; next: boolean; theme: CourseWidgetTheme }) {
	const text = next ? theme.onContainer : theme.text;
	const muted = next ? theme.onContainerMuted : theme.textMuted;
	const meta = [course.room, course.type].filter(Boolean).join(" · ");
	return (
		<FlexWidget
			clickAction="OPEN_URI"
			clickActionData={{ uri: courseUri(course) }}
			accessibilityLabel={`${course.title}, ${formatTime(course.startMillis)}, ${course.room}`}
			style={{
				width: "match_parent",
				height: 52,
				marginBottom: 2,
				paddingHorizontal: 8,
				borderRadius: 14,
				backgroundColor: next ? theme.container : theme.transparent,
				flexDirection: "row",
				alignItems: "center",
			}}>
			<FlexWidget style={{ width: 44 }}>
				<TextWidget text={formatTime(course.startMillis)} maxLines={1} style={{ color: text, fontSize: 14, fontWeight: "700" }} />
				<TextWidget text={formatTime(course.endMillis)} maxLines={1} style={{ color: muted, fontSize: 12 }} />
			</FlexWidget>
			<FlexWidget style={{ marginLeft: 6, marginRight: 8 }}>
				<CourseDot color={course.color} />
			</FlexWidget>
			<FlexWidget style={{ flex: 1 }}>
				<TextWidget text={course.title} maxLines={1} truncate="END" style={{ color: text, fontSize: 14, fontWeight: "700" }} />
				<TextWidget text={meta} maxLines={1} truncate="END" style={{ color: muted, fontSize: 12 }} />
			</FlexWidget>
		</FlexWidget>
	);
}

/** Semester average on the tonal container, shared by both semester widgets. */
export function AveragePanel({ payload, theme, width }: { payload: CourseWidgetPayload; theme: CourseWidgetTheme; width: number }) {
	const summary = payload.gradeSummary;
	const average = summary?.average || "–";
	const numeric = /^[0-9]+(?:[,.][0-9]+)?$/.test(average.trim());
	return (
		<FlexWidget style={{ width, height: "match_parent", padding: 10, borderRadius: 16, backgroundColor: theme.container }}>
			<TextWidget text="Moyenne" maxLines={1} style={{ color: theme.onContainerMuted, fontSize: 12, fontWeight: "700" }} />
			<FlexWidget style={{ flex: 1, flexDirection: "row", alignItems: "center" }}>
				<TextWidget text={average} maxLines={1} truncate="END" style={{ color: theme.onContainer, fontSize: 26, fontWeight: "700" }} />
				{numeric ? <TextWidget text="/20" maxLines={1} style={{ color: theme.onContainerMuted, fontSize: 12, fontWeight: "700", marginLeft: 2, marginTop: 8 }} /> : null}
			</FlexWidget>
			<TextWidget text={summary?.semesterLabel || "Semestre"} maxLines={1} truncate="END" style={{ color: theme.onContainerMuted, fontSize: 12 }} />
		</FlexWidget>
	);
}

export function averagePanelWidth(width: number) {
	return width < 300 ? 92 : 108;
}
