import { ZeusEvent } from "../types";
import { getRoomName } from "../utils/calendar";
import { getLocalEventKey, isEventCancelled, isManualEvent } from "./localEvents";
import { getJSON, setJSON } from "./storage";

export type EventsCacheQuery = {
	groups?: (string | number)[];
	teachers?: (string | number)[];
	rooms?: (string | number)[];
};

export const LAST_EVENTS_KEY = "lastEvents";

const normalizeQueryForKey = (query: EventsCacheQuery) => ({
	groups: query.groups || [],
	teachers: query.teachers || [],
	rooms: query.rooms || [],
});

export const buildEventsCacheKey = (start: Date, end: Date, query: EventsCacheQuery) =>
	`events_${start.toISOString()}_${end.toISOString()}_${JSON.stringify(normalizeQueryForKey(query))}`;

export const eventsDiffer = (left?: ZeusEvent[] | null, right?: ZeusEvent[] | null) => JSON.stringify(left || []) !== JSON.stringify(right || []);

export type RoomChange = {
	key: string;
	title: string;
	startDate: string;
	oldRooms: string;
	newRooms: string;
};

const normalizeRoomName = (value = "") => value.trim().replace(/\s+/g, " ");

const roomList = (event: ZeusEvent) => (event.rooms || []).map(getRoomName).map(normalizeRoomName).filter(Boolean);

const roomSignature = (event: ZeusEvent) =>
	roomList(event)
		.map((room) => room.toLowerCase())
		.sort()
		.join("|");

const formatRooms = (rooms: string[]) => rooms.join(", ") || "Lieu à confirmer";

export function findRoomChanges(cachedEvents?: ZeusEvent[] | null, freshEvents?: ZeusEvent[] | null, now = Date.now()): RoomChange[] {
	if (!cachedEvents?.length || !freshEvents?.length) return [];

	const cachedByKey = new Map(cachedEvents.filter((event) => !isManualEvent(event)).map((event) => [getLocalEventKey(event), event]));

	return freshEvents
		.filter((event) => !isManualEvent(event) && !isEventCancelled(event))
		.map((event) => {
			const cached = cachedByKey.get(getLocalEventKey(event));
			if (!cached || isEventCancelled(cached)) return null;
			const startsAt = new Date(event.startDate).getTime();
			if (!Number.isFinite(startsAt) || startsAt < now - 60_000) return null;
			if (roomSignature(cached) === roomSignature(event)) return null;
			return {
				key: `${getLocalEventKey(event)}:${roomSignature(cached)}->${roomSignature(event)}`,
				title: event.name || event.typeName || "Cours",
				startDate: event.startDate,
				oldRooms: formatRooms(roomList(cached)),
				newRooms: formatRooms(roomList(event)),
			};
		})
		.filter((change): change is RoomChange => Boolean(change));
}

export async function readEventsCache(cacheKey: string, includeFallback = true) {
	const scopedCache = cacheKey ? await getJSON<ZeusEvent[] | null>(cacheKey, null) : null;
	if (Array.isArray(scopedCache)) return scopedCache;
	if (!includeFallback) return [];
	const lastEvents = await getJSON<ZeusEvent[]>(LAST_EVENTS_KEY, []);
	return Array.isArray(lastEvents) ? lastEvents : [];
}

export async function writeEventsCache(cacheKey: string, events: ZeusEvent[]) {
	if (cacheKey) await setJSON(cacheKey, events);
	await setJSON(LAST_EVENTS_KEY, events);
}
