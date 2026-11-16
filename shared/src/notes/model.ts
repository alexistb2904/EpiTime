import { eventIdentity, eventTitle, roomNames, subjectKey, type ZeusEvent } from "../events.ts";

export const NOTE_SCHEMA = 1;
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const MAX_HTML_CHARS = 2_000_000;

export type VersionVector = Record<string, number>;

export type CourseRef = {
	key: string;

	subject: string;
	title: string;
	startDate: string;
	endDate: string;
	rooms: string[];
};

export type AttachmentMeta = { id: string; name: string; type: string; size: number };

export type Note = {
	schema: typeof NOTE_SCHEMA;
	id: string;

	course: CourseRef | null;
	title: string;

	html: string;

	text: string;
	attachments: AttachmentMeta[];
	createdAt: number;
	updatedAt: number;
	vv: VersionVector;
	deleted: boolean;
};

export const courseRefOf = (event: ZeusEvent): CourseRef => ({
	key: eventIdentity(event),
	subject: subjectKey(event),
	title: eventTitle(event),
	startDate: event.startDate,
	endDate: event.endDate,
	rooms: roomNames(event),
});

export const newId = () => globalThis.crypto.randomUUID();

export function createNote(course: CourseRef | null, now = Date.now()): Note {
	return { schema: NOTE_SCHEMA, id: newId(), course, title: "", html: "", text: "", attachments: [], createdAt: now, updatedAt: now, vv: {}, deleted: false };
}

export const bump = (vv: VersionVector, replica: string): VersionVector => ({ ...vv, [replica]: (vv[replica] ?? 0) + 1 });

export function compareVV(a: VersionVector, b: VersionVector): "equal" | "newer" | "older" | "concurrent" {
	let aAhead = false;
	let bAhead = false;
	for (const replica of new Set([...Object.keys(a), ...Object.keys(b)])) {
		const left = a[replica] ?? 0;
		const right = b[replica] ?? 0;
		if (left > right) aAhead = true;
		if (right > left) bAhead = true;
	}
	if (aAhead && bAhead) return "concurrent";
	if (aAhead) return "newer";
	if (bAhead) return "older";
	return "equal";
}

const maxVV = (a: VersionVector, b: VersionVector): VersionVector => {
	const merged: VersionVector = { ...a };
	for (const [replica, count] of Object.entries(b)) merged[replica] = Math.max(merged[replica] ?? 0, count);
	return merged;
};

const sameContent = (a: Note, b: Note) => a.deleted === b.deleted && a.title === b.title && a.html === b.html && JSON.stringify(a.attachments) === JSON.stringify(b.attachments);

const vvSignature = (vv: VersionVector) =>
	Object.keys(vv)
		.sort()
		.map((replica) => `${replica}.${vv[replica]}`)
		.join("_");

export type MergeResult = {
	next: Note | null;

	conflictCopy: Note | null;
};

export function mergeNote(local: Note | undefined, remote: Note): MergeResult {
	if (!local) return { next: remote, conflictCopy: null };
	const order = compareVV(local.vv, remote.vv);
	if (order === "equal" || order === "newer") return { next: null, conflictCopy: null };
	if (order === "older") return { next: remote, conflictCopy: null };

	const vv = maxVV(local.vv, remote.vv);
	if (sameContent(local, remote)) return { next: { ...local, vv, updatedAt: Math.max(local.updatedAt, remote.updatedAt) }, conflictCopy: null };

	const [winner, loser] =
		local.deleted !== remote.deleted
			? local.deleted
				? [remote, local]
				: [local, remote]
			: local.updatedAt !== remote.updatedAt
				? local.updatedAt > remote.updatedAt
					? [local, remote]
					: [remote, local]
				: vvSignature(local.vv) > vvSignature(remote.vv)
					? [local, remote]
					: [remote, local];

	const conflictCopy: Note | null = loser.deleted
		? null
		: {
				...loser,
				id: `${loser.id}~${vvSignature(loser.vv)}`,
				title: `Conflit · ${loser.title || "sans titre"}`,
				vv: { conflict: 1 },
			};
	return { next: { ...winner, vv }, conflictCopy };
}

const isString = (value: unknown, max = 10_000): value is string => typeof value === "string" && value.length <= max;
const isTime = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;

export function parseNote(value: unknown): Note | null {
	if (!value || typeof value !== "object") return null;
	const note = value as Record<string, unknown>;
	if (note.schema !== NOTE_SCHEMA || !isString(note.id, 200) || !note.id) return null;
	if (!isString(note.title) || !isString(note.html, MAX_HTML_CHARS) || !isString(note.text, MAX_HTML_CHARS)) return null;
	if (!isTime(note.createdAt) || !isTime(note.updatedAt) || typeof note.deleted !== "boolean") return null;
	if (!note.vv || typeof note.vv !== "object" || Object.entries(note.vv).some(([key, count]) => key.length > 100 || !isTime(count))) return null;
	if (!Array.isArray(note.attachments) || note.attachments.length > 200) return null;
	const attachments: AttachmentMeta[] = [];
	for (const raw of note.attachments) {
		const attachment = raw as Record<string, unknown>;
		if (!isString(attachment?.id, 200) || !isString(attachment.name, 500) || !isString(attachment.type, 200) || !isTime(attachment.size)) return null;
		attachments.push({ id: attachment.id, name: attachment.name, type: attachment.type, size: attachment.size });
	}
	let course: CourseRef | null = null;
	if (note.course !== null) {
		const ref = note.course as Record<string, unknown>;
		if (!ref || !isString(ref.key, 500) || !isString(ref.subject, 500) || !isString(ref.title, 500) || !isString(ref.startDate, 100) || !isString(ref.endDate, 100))
			return null;
		if (!Array.isArray(ref.rooms) || !ref.rooms.every((room) => isString(room, 200))) return null;
		course = { key: ref.key, subject: ref.subject, title: ref.title, startDate: ref.startDate, endDate: ref.endDate, rooms: ref.rooms as string[] };
	}
	return {
		schema: NOTE_SCHEMA,
		id: note.id,
		course,
		title: note.title,
		html: note.html,
		text: note.text,
		attachments,
		createdAt: note.createdAt,
		updatedAt: note.updatedAt,
		vv: { ...(note.vv as VersionVector) },
		deleted: note.deleted,
	};
}

export const noteLabel = (note: Note) => note.title.trim() || note.text.trim().split("\n")[0]?.slice(0, 80) || "Note sans titre";

export function matchesSearch(note: Note, query: string) {
	const terms = query.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/\s+/).filter(Boolean);
	if (!terms.length) return true;
	const haystack = [note.title, note.text, note.course?.title, ...note.attachments.map((attachment) => attachment.name)]
		.join(" ")
		.toLowerCase()
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "");
	return terms.every((term) => haystack.includes(term));
}
