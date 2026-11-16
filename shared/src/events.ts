export type ZeusEvent = {
	id?: string | number;
	idReservation?: string | number;
	name?: string;
	typeName?: string;
	courseTypeName?: string;
	code?: string;
	url?: string;
	startDate: string;
	endDate: string;
	rooms?: Array<{ id?: string | number; name?: string; room?: { id?: string | number; name?: string } }>;
	teachers?: Array<{ id?: string | number; displayname?: string; firstname?: string; name?: string }>;
	groups?: Array<{ id?: string | number; name?: string }>;
	isOnline?: boolean;
	isCancelled?: boolean;
	isCanceled?: boolean;
	idType?: string | number;
};

const MULTI_DAY_MS = 12 * 3_600_000;

export const eventTitle = (event: ZeusEvent) => event.name || event.typeName || "Cours";

export const roomNames = (event: ZeusEvent) => (event.rooms || []).map((room) => room.name || room.room?.name || "").filter(Boolean);

export const teacherNames = (event: ZeusEvent) =>
	(event.teachers || []).map((teacher) => [teacher.firstname, teacher.name].filter(Boolean).join(" ") || teacher.displayname || "").filter(Boolean);

export const groupNames = (event: ZeusEvent) => (event.groups || []).map((group) => group.name || String(group.id ?? "")).filter(Boolean);

export const isEventCancelled = (event: ZeusEvent) => Boolean(event.isCancelled || event.isCanceled);

export const startMs = (event: ZeusEvent) => new Date(event.startDate).getTime();
export const endMs = (event: ZeusEvent) => new Date(event.endDate).getTime();

export const isValidEvent = (event: unknown): event is ZeusEvent =>
	Boolean(event) &&
	typeof event === "object" &&
	Number.isFinite(new Date((event as ZeusEvent).startDate).getTime()) &&
	Number.isFinite(new Date((event as ZeusEvent).endDate).getTime());

export const isMultiDay = (event: ZeusEvent) => endMs(event) - startMs(event) >= MULTI_DAY_MS;

export const normalizeText = (value?: string | number | null) =>
	String(value ?? "")
		.trim()
		.toLowerCase()
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/\s+/g, " ");

export const eventIdentity = (event: ZeusEvent) => {
	if (event.idReservation !== undefined && event.idReservation !== null && event.idReservation !== "") return `r:${event.idReservation}`;
	if (event.id !== undefined && event.id !== null && event.id !== "") return `e:${event.id}`;
	return `t:${normalizeText(eventTitle(event))}@${event.startDate}`;
};

export const subjectKey = (event: Pick<ZeusEvent, "name" | "typeName">) => normalizeText(event.name || event.typeName || "Cours");

export const formatTime = (value: number | string | Date) => new Date(value).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

export const formatDay = (value: number | string | Date) => new Date(value).toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit" });

export const formatTimeRange = (event: ZeusEvent) => `${formatTime(event.startDate)}–${formatTime(event.endDate)}`;

export const isExamEvent = (event: ZeusEvent) => Number(event.idType) === 2 || event.typeName === "CourseType.Exam" || event.courseTypeName === "CourseType.Exam";

export const placeLabel = (event: ZeusEvent) => [roomNames(event).join(", "), event.isOnline ? "En ligne" : ""].filter(Boolean).join(" · ") || "Salle non précisée";

const COURSE_HUES = [18, 42, 64, 150, 170, 192, 216, 242, 268, 294, 320, 344];
export const courseHue = (name: string = "") => {
	let hash = 0;
	for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
	return COURSE_HUES[Math.abs(hash) % COURSE_HUES.length];
};
