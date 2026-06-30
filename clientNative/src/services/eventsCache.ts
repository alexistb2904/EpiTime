import { ZeusEvent } from "../types";
import { getCourseTypeLabel, getEventTitle, getRoomName, getTeacherName } from "../utils/calendar";
import { getLocalEventKey, isEventCancelled, isManualEvent } from "./localEvents";
import { getJSON, getStorageKeys, removeStorageKeys, setJSON } from "./storage";

export type EventsCacheQuery = {
	groups?: (string | number)[];
	teachers?: (string | number)[];
	rooms?: (string | number)[];
};

export type NormalizedEventsCacheQuery = {
	groups: string[];
	teachers: string[];
	rooms: string[];
};

export type EventsCacheEntry = {
	version: 2;
	key: string;
	query: NormalizedEventsCacheQuery;
	start: string;
	end: string;
	fetchedAt: string;
	signature: string;
	events: ZeusEvent[];
};

type EventsCacheStore = {
	version: 2;
	entries: Record<string, EventsCacheEntry>;
};

export type EventChange = {
	key: string;
	title: string;
	startDate: string;
	summary: string;
	body: string;
	kind: "created" | "updated" | "deleted" | "cancelled" | "reactivated";
};

export type RoomChange = EventChange;

export const LEGACY_LAST_EVENTS_KEY = "lastEvents";

const EVENTS_CACHE_STORE_KEY = "eventsCacheV2";
const LEGACY_MIGRATION_KEY = "eventsCacheV2LegacyMigrated";
const CACHE_VERSION = 2;
const MAX_CACHE_ENTRIES = 90;
const day = 86_400_000;
const minute = 60_000;

let legacyMigrationPromise: Promise<void> | null = null;

export const normalizeEventsCacheQuery = (query: EventsCacheQuery = {}): NormalizedEventsCacheQuery => ({
	groups: normalizeQueryValues(query.groups),
	teachers: normalizeQueryValues(query.teachers),
	rooms: normalizeQueryValues(query.rooms),
});

export const hasEventsCacheQuery = (query: EventsCacheQuery) => {
	const normalized = normalizeEventsCacheQuery(query);
	return Boolean(normalized.groups.length || normalized.teachers.length || normalized.rooms.length);
};

export const buildEventsCacheKey = (start: Date, end: Date, query: EventsCacheQuery) => {
	const normalized = normalizeEventsCacheQuery(query);
	return `eventsCacheV2:${start.toISOString()}:${end.toISOString()}:${querySignature(normalized)}`;
};

export const eventsDiffer = (left?: ZeusEvent[] | null, right?: ZeusEvent[] | null) => createEventsSignature(left || []) !== createEventsSignature(right || []);

export async function migrateLegacyEventsCache(context?: { start: Date; end: Date; query: EventsCacheQuery }) {
	if (!legacyMigrationPromise) {
		legacyMigrationPromise = migrateLegacyEventsCacheInternal(context).finally(() => {
			legacyMigrationPromise = null;
		});
	}
	await legacyMigrationPromise;
}

export async function readEventsCacheEntry(start: Date, end: Date, query: EventsCacheQuery, includeFallback = true) {
	await migrateLegacyEventsCache({ start, end, query });
	const store = await readEventsCacheStore();
	const normalized = normalizeEventsCacheQuery(query);
	const exactKey = buildEventsCacheKey(start, end, normalized);
	const exact = store.entries[exactKey];
	if (exact) return exact;
	if (!includeFallback) return null;
	return findBestFallbackEntry(Object.values(store.entries), start, end, normalized);
}

export async function readEventsCache(start: Date, end: Date, query: EventsCacheQuery, includeFallback = true) {
	const entry = await readEventsCacheEntry(start, end, query, includeFallback);
	return entry ? filterEventsByRange(entry.events, start, end) : [];
}

export async function writeEventsCache(start: Date, end: Date, query: EventsCacheQuery, events: ZeusEvent[]) {
	await migrateLegacyEventsCache({ start, end, query });
	const store = await readEventsCacheStore();
	const normalized = normalizeEventsCacheQuery(query);
	const key = buildEventsCacheKey(start, end, normalized);
	const entry: EventsCacheEntry = {
		version: CACHE_VERSION,
		key,
		query: normalized,
		start: start.toISOString(),
		end: end.toISOString(),
		fetchedAt: new Date().toISOString(),
		signature: createEventsSignature(events),
		events,
	};
	store.entries[key] = entry;
	await writeEventsCacheStore(pruneEventsCacheStore(store));
	return entry;
}

export function reconcileEventsWithCache(freshEvents: ZeusEvent[], cachedEvents: ZeusEvent[] | null | undefined) {
	void cachedEvents;
	return freshEvents;
}

export function findEventChanges(
	cachedEvents?: ZeusEvent[] | null,
	freshEvents?: ZeusEvent[] | null,
	options: { now?: number; windowDays?: number } = {}
): EventChange[] {
	if (!cachedEvents?.length || !freshEvents) return [];

	const now = options.now ?? Date.now();
	const windowDays = clampInteger(options.windowDays, 1, 14, 3);
	const cachedByIdentity = new Map(cachedEvents.filter((event) => !isManualEvent(event)).map((event) => [getEventIdentity(event), event]));
	const freshByIdentity = new Map(freshEvents.filter((event) => !isManualEvent(event)).map((event) => [getEventIdentity(event), event]));
	const changes: EventChange[] = [];

	for (const fresh of freshByIdentity.values()) {
		const identity = getEventIdentity(fresh);
		const cached = cachedByIdentity.get(identity);
		if (!cached) {
			if (isRelevantUpcomingChange(null, fresh, now, windowDays)) {
				changes.push(buildEventChange(identity, null, fresh, ["nouveau cours"], "created"));
			}
			continue;
		}

		if (!isRelevantUpcomingChange(cached, fresh, now, windowDays)) continue;

		const changedFields = describeChangedFields(cached, fresh);
		if (!changedFields.length) continue;

		const kind = getChangeKind(cached, fresh);
		changes.push(buildEventChange(identity, cached, fresh, changedFields, kind));
	}

	for (const cached of cachedByIdentity.values()) {
		const identity = getEventIdentity(cached);
		if (freshByIdentity.has(identity)) continue;
		if (!isRelevantUpcomingChange(cached, null, now, windowDays)) continue;
		changes.push(buildEventChange(identity, cached, null, ["cours retiré"], "deleted"));
	}

	return changes;
}

export function findRoomChanges(cachedEvents?: ZeusEvent[] | null, freshEvents?: ZeusEvent[] | null, now = Date.now()): RoomChange[] {
	return findEventChanges(cachedEvents, freshEvents, { now, windowDays: 3 });
}

export function filterEventsByRange(events: ZeusEvent[], start: Date, end: Date) {
	return events.filter((event) => eventOverlapsRange(event, start, end));
}

export function createEventsSignature(events: ZeusEvent[]) {
	return JSON.stringify(
		events
			.filter((event) => !isManualEvent(event))
			.map((event) => ({
				identity: getEventIdentity(event),
				localKey: getLocalEventKey(event),
				startDate: event.startDate,
				endDate: event.endDate,
				name: getEventTitle(event),
				type: getCourseTypeLabel(event),
				code: event.code || "",
				rooms: listRooms(event),
				teachers: listTeachers(event),
				groups: listGroups(event),
				cancelled: isEventCancelled(event),
			}))
			.sort((a, b) => `${a.identity}:${a.startDate}`.localeCompare(`${b.identity}:${b.startDate}`))
	);
}

function normalizeQueryValues(values?: (string | number)[]) {
	return Array.from(new Set((values || []).map((value) => String(value)).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function querySignature(query: EventsCacheQuery) {
	return JSON.stringify(normalizeEventsCacheQuery(query));
}

function sameQuery(left: EventsCacheQuery, right: EventsCacheQuery) {
	return querySignature(left) === querySignature(right);
}

async function migrateLegacyEventsCacheInternal(context?: { start: Date; end: Date; query: EventsCacheQuery }) {
	const alreadyMigrated = await getJSON<boolean>(LEGACY_MIGRATION_KEY, false);
	if (alreadyMigrated) return;

	const keys = await getStorageKeys();
	const legacyScopedKeys = keys.filter((key) => key.startsWith("events_"));
	const hasLegacyLastEvents = keys.includes(LEGACY_LAST_EVENTS_KEY);

	if (!legacyScopedKeys.length && !hasLegacyLastEvents) {
		await setJSON(LEGACY_MIGRATION_KEY, true);
		return;
	}

	const store = await readEventsCacheStore();
	const keysToRemove: string[] = [];

	for (const key of legacyScopedKeys) {
		const parsed = parseLegacyScopedCacheKey(key);
		if (!parsed) {
			keysToRemove.push(key);
			continue;
		}

		const events = await getJSON<ZeusEvent[] | null>(key, null);
		if (Array.isArray(events)) {
			const cacheKey = buildEventsCacheKey(parsed.start, parsed.end, parsed.query);
			store.entries[cacheKey] = {
				version: CACHE_VERSION,
				key: cacheKey,
				query: normalizeEventsCacheQuery(parsed.query),
				start: parsed.start.toISOString(),
				end: parsed.end.toISOString(),
				fetchedAt: new Date().toISOString(),
				signature: createEventsSignature(events),
				events,
			};
		}
		keysToRemove.push(key);
	}

	let canFinishMigration = true;
	if (hasLegacyLastEvents) {
		const events = await getJSON<ZeusEvent[] | null>(LEGACY_LAST_EVENTS_KEY, null);
		if (Array.isArray(events) && events.length && context && hasEventsCacheQuery(context.query)) {
			const cacheKey = buildEventsCacheKey(context.start, context.end, context.query);
			store.entries[cacheKey] = {
				version: CACHE_VERSION,
				key: cacheKey,
				query: normalizeEventsCacheQuery(context.query),
				start: context.start.toISOString(),
				end: context.end.toISOString(),
				fetchedAt: new Date().toISOString(),
				signature: createEventsSignature(events),
				events: filterEventsByRange(events, context.start, context.end),
			};
			keysToRemove.push(LEGACY_LAST_EVENTS_KEY);
		} else if (!Array.isArray(events) || !events.length || context) {
			keysToRemove.push(LEGACY_LAST_EVENTS_KEY);
		} else {
			canFinishMigration = false;
		}
	}

	await writeEventsCacheStore(pruneEventsCacheStore(store));
	await removeStorageKeys(Array.from(new Set(keysToRemove)));
	if (canFinishMigration) await setJSON(LEGACY_MIGRATION_KEY, true);
}

function parseLegacyScopedCacheKey(key: string) {
	const match = key.match(/^events_([^_]+)_([^_]+)_(.+)$/);
	if (!match) return null;
	const start = new Date(match[1]);
	const end = new Date(match[2]);
	if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return null;
	try {
		return { start, end, query: normalizeEventsCacheQuery(JSON.parse(match[3]) as EventsCacheQuery) };
	} catch {
		return null;
	}
}

async function readEventsCacheStore(): Promise<EventsCacheStore> {
	const saved = await getJSON<EventsCacheStore | null>(EVENTS_CACHE_STORE_KEY, null);
	if (!saved || saved.version !== CACHE_VERSION || !saved.entries || typeof saved.entries !== "object") {
		return { version: CACHE_VERSION, entries: {} };
	}
	return saved;
}

async function writeEventsCacheStore(store: EventsCacheStore) {
	await setJSON(EVENTS_CACHE_STORE_KEY, store);
}

function pruneEventsCacheStore(store: EventsCacheStore): EventsCacheStore {
	const entries = Object.values(store.entries)
		.filter((entry) => entry.version === CACHE_VERSION && Array.isArray(entry.events))
		.sort((a, b) => new Date(b.fetchedAt).getTime() - new Date(a.fetchedAt).getTime())
		.slice(0, MAX_CACHE_ENTRIES);
	return { version: CACHE_VERSION, entries: Object.fromEntries(entries.map((entry) => [entry.key, entry])) };
}

function findBestFallbackEntry(entries: EventsCacheEntry[], start: Date, end: Date, query: NormalizedEventsCacheQuery) {
	const startMs = start.getTime();
	const endMs = end.getTime();
	return entries
		.filter((entry) => sameQuery(entry.query, query))
		.map((entry) => {
			const entryStart = new Date(entry.start).getTime();
			const entryEnd = new Date(entry.end).getTime();
			const overlap = Math.max(0, Math.min(endMs, entryEnd) - Math.max(startMs, entryStart));
			return { entry, overlap, fetchedAt: new Date(entry.fetchedAt).getTime() };
		})
		.filter((item) => item.overlap > 0)
		.sort((a, b) => b.overlap - a.overlap || b.fetchedAt - a.fetchedAt)[0]?.entry ?? null;
}

function eventOverlapsRange(event: ZeusEvent, start: Date, end: Date) {
	const eventStart = new Date(event.startDate).getTime();
	const eventEnd = new Date(event.endDate).getTime();
	return Number.isFinite(eventStart) && Number.isFinite(eventEnd) && eventStart < end.getTime() && eventEnd > start.getTime();
}

function getEventIdentity(event: ZeusEvent) {
	return String(event.idReservation || event.id || getLocalEventKey(event));
}

function isRelevantUpcomingChange(oldEvent: ZeusEvent | null, newEvent: ZeusEvent | null, now: number, windowDays: number) {
	const max = now + windowDays * day;
	return [oldEvent, newEvent].some((event) => {
		if (!event) return false;
		const startsAt = new Date(event.startDate).getTime();
		return Number.isFinite(startsAt) && startsAt >= now - minute && startsAt <= max;
	});
}

function describeChangedFields(oldEvent: ZeusEvent, newEvent: ZeusEvent) {
	const fields: string[] = [];
	const wasCancelled = isEventCancelled(oldEvent);
	const isCancelledNow = isEventCancelled(newEvent);
	if (wasCancelled !== isCancelledNow) fields.push(isCancelledNow ? "annulation" : "réactivation");
	if (oldEvent.startDate !== newEvent.startDate || oldEvent.endDate !== newEvent.endDate) fields.push("horaire");
	if (normalizeText(getEventTitle(oldEvent)) !== normalizeText(getEventTitle(newEvent)) || normalizeText(getCourseTypeLabel(oldEvent)) !== normalizeText(getCourseTypeLabel(newEvent))) {
		fields.push("infos");
	}
	if (normalizeText(oldEvent.code) !== normalizeText(newEvent.code)) fields.push("code");
	if (listSignature(listRooms(oldEvent)) !== listSignature(listRooms(newEvent))) fields.push("salle");
	if (listSignature(listTeachers(oldEvent)) !== listSignature(listTeachers(newEvent))) fields.push("intervenants");
	if (listSignature(listGroups(oldEvent)) !== listSignature(listGroups(newEvent))) fields.push("groupes");
	return fields;
}

function getChangeKind(oldEvent: ZeusEvent, newEvent: ZeusEvent): EventChange["kind"] {
	if (!isEventCancelled(oldEvent) && isEventCancelled(newEvent)) return "cancelled";
	if (isEventCancelled(oldEvent) && !isEventCancelled(newEvent)) return "reactivated";
	return "updated";
}

function buildEventChange(identity: string, oldEvent: ZeusEvent | null, newEvent: ZeusEvent | null, fields: string[], kind: EventChange["kind"]): EventChange {
	const event = newEvent || oldEvent;
	const title = event ? getEventTitle(event) : "Cours";
	const startDate = event?.startDate || new Date().toISOString();
	const summary = fields.join(", ");
	const oldSignature = oldEvent ? eventChangeSignature(oldEvent) : "none";
	const newSignature = newEvent ? eventChangeSignature(newEvent) : "none";
	const bodyPrefix = kind === "created" ? "Nouveau cours" : kind === "deleted" ? "Cours retiré" : kind === "cancelled" ? "Cours annulé" : "Cours modifié";
	return {
		key: `${identity}:${oldSignature}->${newSignature}`,
		title,
		startDate,
		summary,
		body: `${bodyPrefix} le ${formatChangeDate(startDate)} : ${summary}`,
		kind,
	};
}

function eventChangeSignature(event: ZeusEvent) {
	return JSON.stringify({
		startDate: event.startDate,
		endDate: event.endDate,
		title: normalizeText(getEventTitle(event)),
		type: normalizeText(getCourseTypeLabel(event)),
		code: normalizeText(event.code),
		rooms: listRooms(event),
		teachers: listTeachers(event),
		groups: listGroups(event),
		cancelled: isEventCancelled(event),
	});
}

function listRooms(event: ZeusEvent) {
	return (event.rooms || []).map(getRoomName).map(normalizeText).filter(Boolean).sort();
}

function listTeachers(event: ZeusEvent) {
	return (event.teachers || []).map(getTeacherName).map(normalizeText).filter(Boolean).sort();
}

function listGroups(event: ZeusEvent) {
	return (event.groups || []).map((group) => group.name || String(group.id || "")).map(normalizeText).filter(Boolean).sort();
}

function listSignature(values: string[]) {
	return values.join("|");
}

function normalizeText(value?: string | number | null) {
	return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function formatChangeDate(rawDate: string) {
	const date = new Date(rawDate);
	if (Number.isNaN(date.getTime())) return "date inconnue";
	return `${date.toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit" })} à ${date.toLocaleTimeString("fr-FR", {
		hour: "2-digit",
		minute: "2-digit",
	})}`;
}

function clampInteger(value: unknown, min: number, max: number, fallback: number) {
	const numeric = typeof value === "number" ? value : Number(value);
	if (!Number.isFinite(numeric)) return fallback;
	return Math.min(max, Math.max(min, Math.trunc(numeric)));
}
