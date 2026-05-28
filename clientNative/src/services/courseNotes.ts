import * as Notifications from "expo-notifications";
import * as FileSystem from "expo-file-system/legacy";
import { Linking, Platform } from "react-native";
import { ZeusEvent } from "../types";
import { getEventTitle, getRoomName } from "../utils/calendar";
import { getLocalEventKey, isEventCancelled } from "./localEvents";
import { COURSES_CHANNEL_ID, ensureAndroidChannel, requestNotificationPermission } from "./notifications";
import { getJSON, setJSON } from "./storage";

const COURSE_NOTES_KEY = "courseNotesByEvent";
const COURSE_NOTES_DIR = "course-notes";

export type CourseNoteReminder = {
	enabled: boolean;
	offsetMinutes: number;
	notificationId?: string;
};

export type CourseNoteAttachment = {
	id: string;
	kind: "file" | "photo";
	name: string;
	localUri: string;
	mimeType?: string;
	size?: number;
	createdAt: string;
};

export type CourseNote = {
	id: string;
	eventKey: string;
	body: string;
	links: string[];
	attachments: CourseNoteAttachment[];
	reminder?: CourseNoteReminder;
	createdAt: string;
	updatedAt: string;
};

export type CourseNoteSummary = {
	count: number;
	hasAttachments: boolean;
	hasReminder: boolean;
};

export type CourseNotesByEvent = Record<string, CourseNote[]>;

export type CopyCourseNoteAttachmentInput = {
	eventKey: string;
	noteId: string;
	sourceUri: string;
	name?: string | null;
	kind: CourseNoteAttachment["kind"];
	mimeType?: string | null;
	size?: number | null;
};

export async function getCourseNotesByEvent() {
	return getJSON<CourseNotesByEvent>(COURSE_NOTES_KEY, {});
}

export async function getCourseNotes(eventKey: string) {
	const byEvent = await getCourseNotesByEvent();
	return normalizeNotes(byEvent[eventKey] || [], eventKey);
}

export async function getCourseNoteSummaries() {
	const byEvent = await getCourseNotesByEvent();
	return Object.fromEntries(
		Object.entries(byEvent).map(([eventKey, notes]) => {
			const normalized = normalizeNotes(notes, eventKey);
			return [
				eventKey,
				{
					count: normalized.length,
					hasAttachments: normalized.some((note) => note.attachments.length > 0),
					hasReminder: normalized.some((note) => Boolean(note.reminder?.enabled)),
				} satisfies CourseNoteSummary,
			];
		})
	) as Record<string, CourseNoteSummary>;
}

export async function createCourseNote(event: ZeusEvent) {
	const eventKey = getLocalEventKey(event);
	const now = new Date().toISOString();
	const note: CourseNote = {
		id: createLocalId("note"),
		eventKey,
		body: "",
		links: [],
		attachments: [],
		createdAt: now,
		updatedAt: now,
	};
	await upsertNote(event, note);
	return note;
}

export async function upsertNote(event: ZeusEvent, note: CourseNote) {
	const eventKey = getLocalEventKey(event);
	const byEvent = await getCourseNotesByEvent();
	const notes = normalizeNotes(byEvent[eventKey] || [], eventKey);
	const noteId = note.id.startsWith("draft-") ? createLocalId("note") : note.id;
	const nextNote = await prepareNoteForSave(event, { ...note, id: noteId, eventKey, updatedAt: new Date().toISOString() });
	const nextNotes = notes.some((item) => item.id === nextNote.id) ? notes.map((item) => (item.id === nextNote.id ? nextNote : item)) : [...notes, nextNote];
	await writeNotesForEvent(byEvent, eventKey, nextNotes);
	return nextNote;
}

export async function deleteCourseNote(eventKey: string, noteId: string) {
	const byEvent = await getCourseNotesByEvent();
	const notes = normalizeNotes(byEvent[eventKey] || [], eventKey);
	const note = notes.find((item) => item.id === noteId);
	if (!note) return;

	await cancelNoteReminder(note);
	await Promise.all(note.attachments.map((attachment) => deleteCourseNoteAttachmentFile(attachment).catch(() => undefined)));
	await writeNotesForEvent(
		byEvent,
		eventKey,
		notes.filter((item) => item.id !== noteId)
	);
}

export async function copyCourseNoteAttachment(input: CopyCourseNoteAttachmentInput) {
	const root = FileSystem.documentDirectory;
	if (!root) throw new Error("Stockage local indisponible.");
	const dir = `${root}${COURSE_NOTES_DIR}/${safePathPart(input.eventKey)}/${safePathPart(input.noteId)}/`;
	await FileSystem.makeDirectoryAsync(dir, { intermediates: true });

	const name = input.name?.trim() || (input.kind === "photo" ? "photo.jpg" : "fichier");
	const targetName = `${Date.now()}-${safeFileName(name)}`;
	const localUri = `${dir}${targetName}`;
	await FileSystem.copyAsync({ from: input.sourceUri, to: localUri });

	return {
		id: createLocalId("attachment"),
		kind: input.kind,
		name,
		localUri,
		mimeType: input.mimeType || undefined,
		size: typeof input.size === "number" ? input.size : undefined,
		createdAt: new Date().toISOString(),
	} satisfies CourseNoteAttachment;
}

export async function deleteCourseNoteAttachment(event: ZeusEvent, noteId: string, attachmentId: string) {
	const eventKey = getLocalEventKey(event);
	const notes = await getCourseNotes(eventKey);
	const note = notes.find((item) => item.id === noteId);
	const attachment = note?.attachments.find((item) => item.id === attachmentId);
	if (!note || !attachment) return;

	await deleteCourseNoteAttachmentFile(attachment).catch(() => undefined);
	await upsertNote(event, {
		...note,
		attachments: note.attachments.filter((item) => item.id !== attachmentId),
	});
}

export async function openCourseNoteAttachment(attachment: CourseNoteAttachment) {
	const uri = Platform.OS === "android" ? await FileSystem.getContentUriAsync(attachment.localUri).catch(() => attachment.localUri) : attachment.localUri;
	await Linking.openURL(uri);
}

export async function rescheduleCourseNoteReminders(events: ZeusEvent[]) {
	if (Platform.OS === "web") return;
	const byEvent = await getCourseNotesByEvent();
	const eventByKey = new Map(events.map((event) => [getLocalEventKey(event), event]));
	let changed = false;

	for (const [eventKey, rawNotes] of Object.entries(byEvent)) {
		const event = eventByKey.get(eventKey);
		const notes = normalizeNotes(rawNotes, eventKey);
		const nextNotes: CourseNote[] = [];
		for (const note of notes) {
			const nextNote = event ? await prepareNoteForSave(event, note, { requestPermission: false }) : await cancelNoteReminder(note);
			if (nextNote.reminder?.notificationId !== note.reminder?.notificationId || nextNote.reminder?.enabled !== note.reminder?.enabled) changed = true;
			nextNotes.push(nextNote);
		}
		byEvent[eventKey] = nextNotes;
	}

	if (changed) await setJSON(COURSE_NOTES_KEY, byEvent);
}

async function prepareNoteForSave(event: ZeusEvent, note: CourseNote, options: { requestPermission?: boolean } = {}) {
	if (!note.reminder?.enabled) return cancelNoteReminder(note);
	if (isEventCancelled(event)) return cancelNoteReminder(note);

	const startMillis = new Date(event.startDate).getTime();
	const offsetMinutes = clampReminderOffset(note.reminder.offsetMinutes);
	const reminderMillis = startMillis - offsetMinutes * 60_000;
	if (!Number.isFinite(startMillis) || reminderMillis <= Date.now()) return cancelNoteReminder(note);

	if (note.reminder.notificationId) await Notifications.cancelScheduledNotificationAsync(note.reminder.notificationId).catch(() => undefined);

	const shouldRequestPermission = options.requestPermission ?? true;
	const granted = shouldRequestPermission ? await requestNotificationPermission() : (await Notifications.getPermissionsAsync()).status === "granted";
	if (!granted) return { ...note, reminder: { enabled: false, offsetMinutes } };

	await ensureAndroidChannel();
	const room = event.rooms?.map(getRoomName).filter(Boolean).join(", ");
	const notificationId = await Notifications.scheduleNotificationAsync({
		content: {
			title: "Note de cours",
			body: `${getEventTitle(event)} dans ${formatReminderOffset(offsetMinutes)}${room ? ` en ${room}` : ""}`,
			data: { type: "course-note-reminder", eventKey: note.eventKey, noteId: note.id, startsAt: event.startDate },
			sound: "default",
		},
		trigger: {
			type: Notifications.SchedulableTriggerInputTypes.DATE,
			date: new Date(reminderMillis),
			...(Platform.OS === "android" ? { channelId: COURSES_CHANNEL_ID } : {}),
		},
	});
	return { ...note, reminder: { enabled: true, offsetMinutes, notificationId } };
}

async function cancelNoteReminder(note: CourseNote) {
	if (Platform.OS !== "web" && note.reminder?.notificationId) {
		await Notifications.cancelScheduledNotificationAsync(note.reminder.notificationId).catch(() => undefined);
	}
	if (!note.reminder) return note;
	return { ...note, reminder: { enabled: false, offsetMinutes: clampReminderOffset(note.reminder.offsetMinutes) } };
}

async function writeNotesForEvent(byEvent: CourseNotesByEvent, eventKey: string, notes: CourseNote[]) {
	const nextNotes = normalizeNotes(notes, eventKey).filter((note) => hasNoteContent(note));
	const next = { ...byEvent };
	if (nextNotes.length) next[eventKey] = nextNotes;
	else delete next[eventKey];
	await setJSON(COURSE_NOTES_KEY, next);
}

async function deleteCourseNoteAttachmentFile(attachment: CourseNoteAttachment) {
	if (!attachment.localUri) return;
	await FileSystem.deleteAsync(attachment.localUri, { idempotent: true });
}

function normalizeNotes(notes: CourseNote[], eventKey: string) {
	return notes.filter(Boolean).map((note) => ({
		...note,
		eventKey,
		body: note.body || "",
		links: Array.isArray(note.links) ? note.links.filter(Boolean) : [],
		attachments: Array.isArray(note.attachments) ? note.attachments.filter((attachment) => attachment?.localUri) : [],
		createdAt: note.createdAt || new Date().toISOString(),
		updatedAt: note.updatedAt || note.createdAt || new Date().toISOString(),
	}));
}

function hasNoteContent(note: CourseNote) {
	return Boolean(note.body.trim() || note.links.length || note.attachments.length || note.reminder?.enabled);
}

function clampReminderOffset(value: unknown) {
	const numeric = typeof value === "number" ? value : Number(value);
	if (!Number.isFinite(numeric)) return 15;
	return Math.min(14 * 24 * 60, Math.max(1, Math.trunc(numeric)));
}

function formatReminderOffset(offsetMinutes: number) {
	if (offsetMinutes % 1440 === 0) return `${offsetMinutes / 1440} j`;
	if (offsetMinutes % 60 === 0) return `${offsetMinutes / 60} h`;
	return `${offsetMinutes} min`;
}

function createLocalId(prefix: string) {
	return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function safePathPart(value: string) {
	return encodeURIComponent(value).replace(/%/g, "_").slice(0, 120);
}

function safeFileName(value: string) {
	const cleaned = value.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").trim();
	return cleaned || "piece-jointe";
}
