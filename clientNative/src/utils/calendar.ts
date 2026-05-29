import { Linking } from "react-native";
import { ZeusEvent } from "../types";

export const daysOfWeek = [
	{ label: "Lun", value: 1 },
	{ label: "Mar", value: 2 },
	{ label: "Mer", value: 3 },
	{ label: "Jeu", value: 4 },
	{ label: "Ven", value: 5 },
	{ label: "Sam", value: 6 },
	{ label: "Dim", value: 0 },
];

export const courseTypeLabels: Record<string, string> = {
	"CourseType.IntegratedLecture": "Cours Intégré",
	"CourseType.FollowUp": "Suivi de Cours",
	"CourseType.Practice": "Travaux Pratiques",
	"CourseType.Lecture": "Cours Magistral",
	"CourseType.Meeting": "Réunion",
	"CourseType.Exam": "Examen",
	"CourseType.Permanence": "Permanence",
	"CourseType.Conference": "Conférence",
	"CourseType.Workshop": "Atelier",
	"CourseType.Defense": "Soutenance",
};

export function startOfDay(date: Date) {
	const d = new Date(date);
	d.setHours(0, 0, 0, 0);
	return d;
}

export function getWeekRange(date: Date) {
	const current = new Date(date);
	const day = current.getDay() || 7;
	if (day !== 1) current.setDate(current.getDate() - day + 1);
	const start = startOfDay(current);
	const end = new Date(start);
	end.setDate(end.getDate() + 7);
	return { start, end };
}

export function getEventTitle(event: ZeusEvent) {
	return event.name || event.typeName || "Cours";
}

export function getRoomName(room: NonNullable<ZeusEvent["rooms"]>[number]) {
	return room.name || room.room?.name || "Salle";
}

export function getTeacherName(teacher: NonNullable<ZeusEvent["teachers"]>[number]) {
	return [teacher.firstname, teacher.name].filter(Boolean).join(" ") || teacher.displayname || teacher.name || "Intervenant";
}

export function generatePastelColor(value = "") {
	let hash = 0;
	for (let i = 0; i < value.length; i++) hash = value.charCodeAt(i) + ((hash << 5) - hash);
	const hue = Math.abs(hash % 360);
	return `hsl(${hue}, 58%, 64%)`;
}

export const coursePalette = ["#0ea5e9", "#14b8a6", "#f97316", "#ef4444", "#8b5cf6", "#22c55e", "#ec4899", "#eab308", "#06b6d4"];

export function hashString(value = "") {
	let hash = 0;
	for (let i = 0; i < value.length; i++) hash = value.charCodeAt(i) + ((hash << 5) - hash);
	return Math.abs(hash);
}

export function hexToRgba(hex: string, alpha: number) {
	const normalized = hex.replace("#", "");
	const value = parseInt(normalized, 16);
	const r = (value >> 16) & 255;
	const g = (value >> 8) & 255;
	const b = value & 255;
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function getCourseColor(event: ZeusEvent) {
	const seed = event.courseTypeName || event.typeName || event.code || getEventTitle(event);
	return coursePalette[hashString(seed) % coursePalette.length];
}

export function getCourseTypeLabel(event: ZeusEvent) {
	const raw = event.courseTypeName || event.typeName;
	if (!raw) return "Cours";
	return courseTypeLabels[raw] || raw.replace("CourseType.", "");
}

export function formatDateRange(event: ZeusEvent) {
	const start = new Date(event.startDate);
	const end = new Date(event.endDate);
	const sameDay = start.toDateString() === end.toDateString();
	if (sameDay) {
		return `${start.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })} · ${start.toLocaleTimeString("fr-FR", {
			hour: "2-digit",
			minute: "2-digit",
		})} - ${end.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
	}
	return `Du ${start.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} ${start.toLocaleTimeString("fr-FR", {
		hour: "2-digit",
		minute: "2-digit",
	})} au ${end.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} ${end.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
}

export function openUrl(url?: string) {
	if (!url) return;
	Linking.openURL(url).catch(() => {});
}
