import { startOfDay } from "../../utils/calendar";

export type UsefulLink = {
	title: string;
	description: string;
	url: string;
	accent: string;
	badge: string;
	image: number;
};

export const usefulLinks: UsefulLink[] = [
	{
		title: "Moodle",
		description: "Plateforme d'enseignement et accès aux cours.",
		url: "https://moodle.epita.fr",
		accent: "#6f7cff",
		badge: "Cours",
		image: require("../../../assets/moodle_logo_small.png"),
	},
	{
		title: "CRI",
		description: "Portail Forge avec raccourcis utiles et services EPITA.",
		url: "https://cri.epita.fr",
		accent: "#4bc3a7",
		badge: "Hub",
		image: require("../../../assets/cri.png"),
	},
	{
		title: "Auriga",
		description: "Centre administratif : infos perso, syllabus et notes.",
		url: "https://auriga.epita.fr",
		accent: "#f0a94a",
		badge: "Admin",
		image: require("../../../assets/logo_auriga_main_menu.png"),
	},
	{
		title: "Maps",
		description: "Plans du campus pour retrouver rapidement les lieux.",
		url: "https://maps.forge.epita.fr",
		accent: "#ff6b81",
		badge: "Campus",
		image: require("../../../assets/maps.png"),
	},
	{
		title: "Intranet",
		description: "Portail Forge pour accéder aux outils internes et pratiques.",
		url: "https://intra.forge.epita.fr",
		accent: "#8f7cff",
		badge: "Forge",
		image: require("../../../assets/cri.png"),
	},
];

export const minute = 60_000;
export const day = 86_400_000;

export const formatTime = (date: Date) => date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

export const formatInputDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export const parseLocalDateTime = (dateValue: string, timeValue: string) => {
	const dateMatch = dateValue.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
	const timeMatch = timeValue.trim().match(/^(\d{1,2}):(\d{2})$/);
	if (!dateMatch || !timeMatch) return null;
	const year = Number(dateMatch[1]);
	const month = Number(dateMatch[2]) - 1;
	const dayValue = Number(dateMatch[3]);
	const hour = Number(timeMatch[1]);
	const minuteValue = Number(timeMatch[2]);
	const date = new Date(year, month, dayValue, hour, minuteValue, 0, 0);
	if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== dayValue || date.getHours() !== hour || date.getMinutes() !== minuteValue) return null;
	return date;
};

export const parseInputDate = (dateValue: string) => {
	const dateMatch = dateValue.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (!dateMatch) return null;
	const year = Number(dateMatch[1]);
	const month = Number(dateMatch[2]) - 1;
	const dayValue = Number(dateMatch[3]);
	const date = new Date(year, month, dayValue, 0, 0, 0, 0);
	if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== dayValue) return null;
	return date;
};

export const formatDuration = (ms: number) => {
	const totalMinutes = Math.max(0, Math.round(ms / minute));
	if (totalMinutes < 60) return `${totalMinutes} min`;
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	return minutes ? `${hours} h ${minutes}` : `${hours} h`;
};

export const formatDurationHumanLong = (ms: number) => {
	const totalMinutes = Math.max(0, Math.round(ms / minute));
	if (totalMinutes < 60) return `${totalMinutes} min${totalMinutes > 1 ? "s" : ""}`;
	const hours = Math.floor(totalMinutes / 60);
	if (hours < 24) {
		const minutes = totalMinutes % 60;
		return minutes ? `${hours} h ${minutes} min` : `${hours} h`;
	}
	return `${Math.floor(totalMinutes / 1440)} jour${Math.floor(totalMinutes / 1440) > 1 ? "s" : ""}`;
};

const relativeDayOffset = (date: Date, reference: Date) => Math.round((startOfDay(date).getTime() - startOfDay(reference).getTime()) / day);

const formatShortDay = (date: Date) => date.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });

export const formatUntilSuffix = (date: Date, reference: Date) => {
	const offset = relativeDayOffset(date, reference);
	if (offset === 0) return `à ${formatTime(date)}`;
	if (offset === 1) return `à demain ${formatTime(date)}`;
	return `au ${formatShortDay(date)} à ${formatTime(date)}`;
};

export const formatEndSuffix = (date: Date, reference: Date) => {
	const offset = relativeDayOffset(date, reference);
	if (offset === 0) return `à ${formatTime(date)}`;
	if (offset === 1) return `demain à ${formatTime(date)}`;
	return `le ${formatShortDay(date)} à ${formatTime(date)}`;
};

export const formatStartLabel = (date: Date, reference: Date) => {
	const offset = relativeDayOffset(date, reference);
	if (offset === 0) return `Aujourd'hui à ${formatTime(date)}`;
	if (offset === 1) return `Demain à ${formatTime(date)}`;
	return `${formatShortDay(date)} à ${formatTime(date)}`;
};

export const formatAverage = (score?: { value: number; outOf?: number; status?: string }) => {
	if (!score) return "-";
	if (score.status) return score.status;
	return score.outOf ? score.value.toFixed(2) : "-";
};
