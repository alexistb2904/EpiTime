import React, { useEffect, useState } from "react";
import { Pressable, StatusBar, Text, View } from "react-native";
import { WidgetPreview } from "react-native-android-widget";
import type { CourseWidgetPayload, WidgetCourse } from "../services/widgets";
import { courseWidgetThemes, fallbackWidgetTheme, type CourseWidgetTheme } from "../widgets/courseWidgetTheme";
import { courseWidgets, type CourseWidgetName } from "../widgets/renderCourseWidget";

// Dev-only screen (EXPO_PUBLIC_WIDGET_PREVIEWS=1)

const NOW = new Date(2026, 10, 16, 10, 35).getTime();
Date.now = () => NOW;

const at = (h: number, m = 0, day = 0) => new Date(2026, 10, 16 + day, h, m).getTime();
const course = (title: string, type: string, room: string, color: string, start: number, end: number): WidgetCourse => ({
	id: `${title}-${start}`,
	title,
	type,
	room,
	teacher: "",
	startDate: new Date(start).toISOString(),
	startMillis: start,
	endMillis: end,
	color,
});

const payload: CourseWidgetPayload = {
	generatedAt: NOW,
	groups: ["demo"],
	courses: [
		course("Mathématiques discrètes", "TD", "S-201", "#7A5AC8", at(8, 30), at(10)),
		course("Algorithmique", "Cours", "Amphi 4", "#2F7DD1", at(11), at(12, 30)),
		course("Programmation C", "TP", "SM-14", "#D9822B", at(14), at(16)),
		course("Anglais", "TD", "B-102", "#2E9E6B", at(16, 15), at(17, 30)),
		course("Physique", "Cours", "Amphi 2", "#C8475A", at(9, 0, 1), at(10, 30, 1)),
		course("Systèmes d'exploitation", "TP", "SM-08", "#2F7DD1", at(10, 45, 1), at(12, 45, 1)),
	],
	gradeSummary: {
		semesterLabel: "Semestre 3",
		average: "14,25",
		latestGrades: [
			{ subject: "Algorithmique", label: "Partiel", score: "16,5/20" },
			{ subject: "Réseaux", label: "Contrôle continu", score: "15/20" },
			{ subject: "Anglais", label: "Oral", score: "13/20" },
			{ subject: "Mathématiques", label: "Interrogation", score: "12/20" },
		],
	},
};

type Slot = { name: CourseWidgetName; x: number; y: number; w: number; h: number; dark?: boolean };

export const PREVIEW_PAGES: Slot[][] = [
	[
		{ name: "TodayCourses", x: 16, y: 40, w: 150, h: 150 },
		{ name: "NextCourse", x: 16, y: 210, w: 260, h: 130 },
		{ name: "UpcomingCourses", x: 16, y: 360, w: 260, h: 190 },
	],
	[
		{ name: "SemesterGrades", x: 16, y: 40, w: 340, h: 220 },
		{ name: "SemesterOverview", x: 16, y: 280, w: 340, h: 220 },
	],
	[
		{ name: "TodayCourses", x: 16, y: 40, w: 110, h: 110 },
		{ name: "TodayCourses", x: 140, y: 40, w: 150, h: 150 },
		{ name: "TodayCourses", x: 16, y: 210, w: 300, h: 150 },
		{ name: "TodayCourses", x: 16, y: 380, w: 150, h: 300 },
		{ name: "TodayCourses", x: 180, y: 380, w: 230, h: 300 },
	],
];
PREVIEW_PAGES.push(PREVIEW_PAGES[2].map((slot) => ({ ...slot, dark: true })));

export default function WidgetPreviews() {
	const [page, setPage] = useState(0);
	const [white, setWhite] = useState(false);
	const [dark, setDark] = useState<CourseWidgetTheme>(fallbackWidgetTheme);
	useEffect(() => {
		courseWidgetThemes().then((themes) => setDark(themes.dark));
	}, []);

	return (
		<Pressable style={{ flex: 1, backgroundColor: white ? "#FFFFFF" : "#000000" }} onPress={(e) => (e.nativeEvent.locationY < 400 ? setWhite(!white) : setPage((page + 1) % PREVIEW_PAGES.length))}>
			<StatusBar hidden />
			{PREVIEW_PAGES[page].map((slot, index) => {
				const Widget = courseWidgets[slot.name];
				const theme = slot.dark ? dark : fallbackWidgetTheme;
				return (
					<View key={`${page}-${index}`} style={{ position: "absolute", left: slot.x, top: slot.y, width: slot.w, height: slot.h }}>
						<WidgetPreview width={slot.w} height={slot.h} renderWidget={({ width, height }) => <Widget payload={payload} theme={theme} width={width} height={height} />} />
					</View>
				);
			})}
			<Text style={{ position: "absolute", bottom: 8, right: 12, color: "#808080", fontSize: 10 }}>{`p${page}`}</Text>
		</Pressable>
	);
}
