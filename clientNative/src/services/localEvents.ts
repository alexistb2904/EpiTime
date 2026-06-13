import { ZeusEvent } from "../types";
import { getJSON, setJSON } from "./storage";

const MANUAL_EVENTS_KEY = "manualEvents";
const DELETED_REAL_EVENTS_KEY = "deletedRealEvents";
const IGNORED_COURSE_SIGNATURES_KEY = "ignoredCourseSignatures";

export type ManualEventInput = {
	title: string;
	startDate: Date;
	endDate: Date;
	room?: string;
};

export type IgnoredCourseSignature = {
	key: string;
	title: string;
	code?: string;
	createdAt: string;
};

export const getLocalEventKey = (event: Pick<ZeusEvent, "id" | "idReservation" | "startDate">) => `${event.idReservation || event.id || "event"}-${event.startDate}`;

export const isEventCancelled = (event: ZeusEvent) => Boolean(event.isCancelled || event.isCanceled);

export const isEventIgnored = (event: ZeusEvent) => Boolean(event.isIgnored);

export const stripCancellationState = (event: ZeusEvent): ZeusEvent => {
	const { isCancelled, isCanceled, cancelledAt, cancellationReason, ...cleanEvent } = event;
	return cleanEvent;
};

export const isManualEvent = (event: ZeusEvent) => Boolean(event.isManual || String(event.id || "").startsWith("manual-"));

const getManualEvents = () => getJSON<ZeusEvent[]>(MANUAL_EVENTS_KEY, []);

const normalizeSignaturePart = (value?: string | number | null) =>
	String(value ?? "")
		.trim()
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/\s+/g, " ");

const getCourseTitleForSignature = (event: ZeusEvent) => event.name || event.typeName || event.courseTypeName || event.code || "Cours";

export function getEventIgnoreSignature(event: ZeusEvent): IgnoredCourseSignature | null {
	if (isManualEvent(event)) return null;
	const title = getCourseTitleForSignature(event).trim();
	const code = event.code?.trim();
	const normalizedTitle = normalizeSignaturePart(title);
	const normalizedCode = normalizeSignaturePart(code);
	const key = [normalizedTitle, normalizedCode].filter(Boolean).join("|");
	if (!key) return null;
	return { key, title: title || "Cours", code, createdAt: new Date().toISOString() };
}

export const getIgnoredCourseSignatures = () => getJSON<IgnoredCourseSignature[]>(IGNORED_COURSE_SIGNATURES_KEY, []);

export function eventMatchesIgnoredCourse(event: ZeusEvent, ignoredSignatures: IgnoredCourseSignature[]) {
	const signature = getEventIgnoreSignature(event);
	if (!signature) return false;
	return ignoredSignatures.some((ignored) => ignored.key === signature.key);
}

const eventOverlapsRange = (event: ZeusEvent, start?: Date, end?: Date) => {
	if (!start || !end) return true;
	const eventStart = new Date(event.startDate).getTime();
	const eventEnd = new Date(event.endDate).getTime();
	return eventStart < end.getTime() && eventEnd > start.getTime();
};

export async function addManualEvent(input: ManualEventInput) {
	const title = input.title.trim();
	const room = input.room?.trim();
	const event: ZeusEvent = {
		id: `manual-${Date.now()}`,
		isManual: true,
		name: title,
		typeName: "Événement perso",
		courseTypeName: "Événement perso",
		startDate: input.startDate.toISOString(),
		endDate: input.endDate.toISOString(),
		rooms: room ? [{ name: room }] : [],
	};
	const events = await getManualEvents();
	await setJSON(MANUAL_EVENTS_KEY, [...events, event]);
	return event;
}

export async function ignoreCourse(event: ZeusEvent) {
	const signature = getEventIgnoreSignature(event);
	if (!signature) return;
	const ignoredSignatures = await getIgnoredCourseSignatures();
	if (!ignoredSignatures.some((ignored) => ignored.key === signature.key)) {
		await setJSON(IGNORED_COURSE_SIGNATURES_KEY, [...ignoredSignatures, signature]);
	}
}

export async function deleteLocalEvent(event: ZeusEvent) {
	if (isManualEvent(event)) {
		const events = await getManualEvents();
		await setJSON(
			MANUAL_EVENTS_KEY,
			events.filter((item) => getLocalEventKey(item) !== getLocalEventKey(event))
		);
		return;
	}
	const deletedKeys = await getJSON<string[]>(DELETED_REAL_EVENTS_KEY, []);
	const key = getLocalEventKey(event);
	if (!deletedKeys.includes(key)) await setJSON(DELETED_REAL_EVENTS_KEY, [...deletedKeys, key]);
}

export async function restoreDeletedRealEvents() {
	await Promise.all([setJSON(DELETED_REAL_EVENTS_KEY, []), setJSON(IGNORED_COURSE_SIGNATURES_KEY, [])]);
}

export async function getDeletedRealEventsCount() {
	const [deletedKeys, ignoredSignatures] = await Promise.all([getJSON<string[]>(DELETED_REAL_EVENTS_KEY, []), getIgnoredCourseSignatures()]);
	return deletedKeys.length + ignoredSignatures.length;
}

export async function mergeEventsWithLocal(events: ZeusEvent[], start?: Date, end?: Date) {
	const [manualEvents, deletedKeys, ignoredSignatures] = await Promise.all([getManualEvents(), getJSON<string[]>(DELETED_REAL_EVENTS_KEY, []), getIgnoredCourseSignatures()]);
	const deleted = new Set(deletedKeys);
	const visibleRemoteEvents = events
		.filter((event) => !isManualEvent(event) && !deleted.has(getLocalEventKey(event)))
		.map((event) => ({ ...event, isIgnored: eventMatchesIgnoredCourse(event, ignoredSignatures) }));
	return [...visibleRemoteEvents, ...manualEvents.filter((event) => eventOverlapsRange(event, start, end))];
}

export function reconcileEventsWithCache(freshEvents: ZeusEvent[], cachedEvents: ZeusEvent[] | null | undefined) {
	void cachedEvents;
	return freshEvents.map(stripCancellationState);
}

export async function reactivateCourse(event: ZeusEvent) {
	const signature = getEventIgnoreSignature(event);
	if (!signature) return;
	const ignoredSignatures = await getIgnoredCourseSignatures();
	await setJSON(
		IGNORED_COURSE_SIGNATURES_KEY,
		ignoredSignatures.filter((ignored) => ignored.key !== signature.key)
	);
}
