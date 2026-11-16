import {
	eventIdentity,
	eventTitle,
	formatDay,
	formatTime,
	formatTimeRange,
	groupNames,
	isEventCancelled,
	normalizeText,
	roomNames,
	startMs,
	teacherNames,
	type ZeusEvent,
} from "./events.ts";

export type ChangeKind = "created" | "updated" | "deleted" | "cancelled" | "reactivated";
export type ChangeField = "status" | "day" | "time" | "title" | "type" | "code" | "room" | "teachers" | "groups" | "course";

export type ChangeCategory = "room" | "time" | "cancelled" | "created" | "other";

export type ChangeDetail = { field: ChangeField; label: string; before?: string | null; after?: string | null };

export type EventChange = {
	key: string;
	identity: string;
	kind: ChangeKind;
	category: ChangeCategory;
	title: string;
	startDate: string;
	details: ChangeDetail[];

	headline: string;
	notification: { title: string; message: string };
};

export type ScheduleSnapshot = {
	scope: string;
	rangeStart: number;
	rangeEnd: number;
	fetchedAt: number;
	events: ZeusEvent[];
};

const DAY = 86_400_000;
const MINUTE = 60_000;

const typeOf = (event: ZeusEvent) => event.courseTypeName || event.typeName || "";
const list = (values: string[]) => values.map(normalizeText).filter(Boolean).sort().join("|");
const shown = (values: string[]) => (values.length ? values.join(", ") : "Aucune");

function describeChangedFields(before: ZeusEvent, after: ZeusEvent) {
	const details: ChangeDetail[] = [];
	if (isEventCancelled(before) !== isEventCancelled(after)) {
		details.push({ field: "status", label: "Statut", before: isEventCancelled(before) ? "Annulé" : "Actif", after: isEventCancelled(after) ? "Annulé" : "Actif" });
	}
	if (formatDay(before.startDate) !== formatDay(after.startDate)) {
		details.push({ field: "day", label: "Jour", before: formatDay(before.startDate), after: formatDay(after.startDate) });
	}
	if (formatTimeRange(before) !== formatTimeRange(after)) {
		details.push({ field: "time", label: "Horaire", before: formatTimeRange(before), after: formatTimeRange(after) });
	}
	if (normalizeText(eventTitle(before)) !== normalizeText(eventTitle(after))) {
		details.push({ field: "title", label: "Cours", before: eventTitle(before), after: eventTitle(after) });
	}
	if (normalizeText(typeOf(before)) !== normalizeText(typeOf(after))) {
		details.push({ field: "type", label: "Type", before: typeOf(before) || "Aucun", after: typeOf(after) || "Aucun" });
	}
	if (normalizeText(before.code) !== normalizeText(after.code)) {
		details.push({ field: "code", label: "Code", before: before.code || "Aucun", after: after.code || "Aucun" });
	}
	if (list(roomNames(before)) !== list(roomNames(after))) {
		details.push({ field: "room", label: "Salle", before: shown(roomNames(before)), after: shown(roomNames(after)) });
	}
	if (list(teacherNames(before)) !== list(teacherNames(after))) {
		details.push({ field: "teachers", label: "Intervenants", before: shown(teacherNames(before)), after: shown(teacherNames(after)) });
	}
	if (list(groupNames(before)) !== list(groupNames(after))) {
		details.push({ field: "groups", label: "Groupes", before: shown(groupNames(before)), after: shown(groupNames(after)) });
	}
	return details;
}

const stateSignature = (event: ZeusEvent | null) =>
	event
		? JSON.stringify([
				event.startDate,
				event.endDate,
				normalizeText(eventTitle(event)),
				normalizeText(typeOf(event)),
				normalizeText(event.code),
				list(roomNames(event)),
				list(teacherNames(event)),
				list(groupNames(event)),
				isEventCancelled(event),
			])
		: "none";

function categorize(kind: ChangeKind, details: ChangeDetail[]): ChangeCategory {
	if (kind === "created") return "created";
	if (kind === "deleted" || kind === "cancelled") return "cancelled";
	if (details.some((detail) => detail.field === "day" || detail.field === "time")) return "time";
	if (details.some((detail) => detail.field === "room")) return "room";
	return "other";
}

const when = (event: ZeusEvent) => `${formatDay(event.startDate)}, ${formatTime(event.startDate)}`;

function describe(kind: ChangeKind, before: ZeusEvent | null, after: ZeusEvent | null, details: ChangeDetail[]) {
	const event = (after || before) as ZeusEvent;
	const title = eventTitle(event);
	const field = (name: ChangeField) => details.find((detail) => detail.field === name);

	let what: string;
	let inline = "";
	let message = when(event);
	if (kind === "created") {
		what = "nouveau cours";
		message = [when(event), ...roomNames(event)].join(" · ");
	} else if (kind === "deleted") {
		what = "cours retiré du planning";
	} else if (kind === "cancelled") {
		what = "cours annulé";
	} else if (kind === "reactivated") {
		what = "cours rétabli";
	} else if (field("day")) {
		what = "cours déplacé";
		inline = ` du ${formatDay(before!.startDate)} ${formatTime(before!.startDate)} au ${formatDay(after!.startDate)} ${formatTime(after!.startDate)}`;
		message = inline.trim();
	} else if (field("time") && formatTime(before!.startDate) !== formatTime(after!.startDate)) {
		what = "cours déplacé";
		inline = ` de ${formatTime(before!.startDate)} à ${formatTime(after!.startDate)}`;
		message = `${inline.trim()} · ${formatDay(event.startDate)}`;
	} else if (field("time")) {
		what = "horaire modifié";
		inline = ` : ${field("time")!.before} → ${field("time")!.after}`;
		message = `${field("time")!.before} → ${field("time")!.after} · ${formatDay(event.startDate)}`;
	} else if (field("room") && details.length === 1) {
		what = "salle modifiée";
		inline = ` : ${field("room")!.before} → ${field("room")!.after}`;
		message = `${field("room")!.before} → ${field("room")!.after} · ${when(event)}`;
	} else {
		what = `${details.map((detail) => detail.label.toLowerCase()).join(", ")} modifié${details.length > 1 ? "s" : ""}`;
		message = `${details
			.slice(0, 2)
			.map((detail) => `${detail.before ?? "?"} → ${detail.after ?? "?"}`)
			.join(" · ")} · ${when(event)}`;
	}
	return { headline: `${title} · ${what}${inline}`, notification: { title: `${title} · ${what}`, message } };
}

function buildChange(identity: string, before: ZeusEvent | null, after: ZeusEvent | null, kind: ChangeKind, details: ChangeDetail[]): EventChange {
	const event = (after || before) as ZeusEvent;
	return {
		key: `${identity}:${stateSignature(before)}->${stateSignature(after)}`,
		identity,
		kind,
		category: categorize(kind, details),
		title: eventTitle(event),
		startDate: event.startDate,
		details,
		...describe(kind, before, after, details),
	};
}

export type FindChangesOptions = {
	now?: number;

	windowDays?: number;

	range?: { start: number; end: number };
};

export function findEventChanges(cached: ZeusEvent[] | null | undefined, fresh: ZeusEvent[] | null | undefined, options: FindChangesOptions = {}): EventChange[] {
	if (!cached?.length || !fresh) return [];
	const now = options.now ?? Date.now();
	const windowDays = Math.min(14, Math.max(1, Math.trunc(options.windowDays ?? 3)));
	const windowEnd = now + windowDays * DAY;
	const range = options.range ?? { start: -Infinity, end: Infinity };
	const relevant = (event: ZeusEvent | undefined) => {
		if (!event) return false;
		const start = startMs(event);
		return start >= now - MINUTE && start <= windowEnd && start >= range.start && start < range.end;
	};

	const before = new Map(cached.map((event) => [eventIdentity(event), event]));
	const after = new Map(fresh.map((event) => [eventIdentity(event), event]));
	const changes: EventChange[] = [];

	for (const [identity, freshEvent] of after) {
		const cachedEvent = before.get(identity);
		if (!cachedEvent) {
			if (relevant(freshEvent)) changes.push(buildChange(identity, null, freshEvent, "created", []));
			continue;
		}
		if (!relevant(cachedEvent) && !relevant(freshEvent)) continue;
		const details = describeChangedFields(cachedEvent, freshEvent);
		if (!details.length) continue;
		const kind: ChangeKind =
			!isEventCancelled(cachedEvent) && isEventCancelled(freshEvent)
				? "cancelled"
				: isEventCancelled(cachedEvent) && !isEventCancelled(freshEvent)
					? "reactivated"
					: "updated";
		changes.push(buildChange(identity, cachedEvent, freshEvent, kind, details));
	}

	for (const [identity, cachedEvent] of before) {
		if (after.has(identity) || !relevant(cachedEvent)) continue;
		changes.push(buildChange(identity, cachedEvent, null, "deleted", []));
	}

	return changes.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
}

export type SnapshotDiff = { status: "baseline"; changes: [] } | { status: "suspicious"; changes: EventChange[]; signature: string } | { status: "ok"; changes: EventChange[] };

export const MASS_DELETION_MIN = 3;

export function diffSnapshots(reference: ScheduleSnapshot | null | undefined, fresh: ScheduleSnapshot, options: { now?: number; windowDays?: number } = {}): SnapshotDiff {
	if (!reference || reference.scope !== fresh.scope || !reference.events.length) return { status: "baseline", changes: [] };
	const range = { start: Math.max(reference.rangeStart, fresh.rangeStart), end: Math.min(reference.rangeEnd, fresh.rangeEnd) };
	if (range.end <= range.start) return { status: "baseline", changes: [] };
	const changes = findEventChanges(reference.events, fresh.events, { ...options, range });
	const removed = changes.filter((change) => change.kind === "deleted").length;
	const now = options.now ?? Date.now();
	const watched = reference.events.filter((event) => !isEventCancelled(event) && startMs(event) >= now && startMs(event) >= range.start && startMs(event) < range.end).length;
	if (removed >= MASS_DELETION_MIN && removed * 2 >= watched) {
		return { status: "suspicious", changes, signature: changes.map((change) => change.key).join("\n") };
	}
	return { status: "ok", changes };
}
