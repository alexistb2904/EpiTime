import { getEvents } from "./api";
import {
	EventChange,
	EventsCacheQuery,
	eventsDiffer,
	filterEventsByRange,
	findEventChanges,
	hasEventsCacheQuery,
	readEventsCacheEntry,
	reconcileEventsWithCache,
	writeEventsCache,
} from "./eventsCache";
import { isEventCancelled, isEventIgnored, mergeEventsWithLocal } from "./localEvents";
import { getJSON } from "./storage";
import { ZeusEvent } from "../types";
import { startOfDay } from "../utils/calendar";

export type ScheduleSource = "network" | "cache" | "local";

export type ScheduleSyncResult = {
	source: ScheduleSource;
	events: ZeusEvent[];
	visibleEvents: ZeusEvent[];
	activeEvents: ZeusEvent[];
	cacheHit: boolean;
	exactCacheHit: boolean;
	changed: boolean;
	changes: EventChange[];
	error?: unknown;
};

type SyncScheduleOptions = {
	start: Date;
	end: Date;
	query: EventsCacheQuery;
	includeFallback?: boolean;
	changeDetectionWindowDays?: number;
	onCached?: (result: ScheduleSyncResult) => void | Promise<void>;
};

export async function syncSchedule(options: SyncScheduleOptions): Promise<ScheduleSyncResult> {
	const { start, end, query, includeFallback = true, changeDetectionWindowDays = 3, onCached } = options;

	if (!hasEventsCacheQuery(query)) {
		const visibleEvents = await mergeEventsWithLocal([], start, end);
		return buildResult({
			source: "local",
			events: [],
			visibleEvents,
			cacheHit: false,
			exactCacheHit: false,
			changed: false,
			changes: [],
		});
	}

	const exactEntry = await readEventsCacheEntry(start, end, query, false);
	const fallbackEntry = exactEntry ? null : await readEventsCacheEntry(start, end, query, includeFallback);
	const cacheEntry = exactEntry || fallbackEntry;
	const cachedEvents = cacheEntry ? filterEventsByRange(cacheEntry.events, start, end) : [];

	if (cacheEntry && onCached) {
		const visibleEvents = await mergeEventsWithLocal(cachedEvents, start, end);
		await onCached(
			buildResult({
				source: "cache",
				events: cachedEvents,
				visibleEvents,
				cacheHit: true,
				exactCacheHit: Boolean(exactEntry),
				changed: false,
				changes: [],
			})
		);
	}

	try {
		const freshEvents = await getEvents(start, end, query);
		const safeEvents: ZeusEvent[] = Array.isArray(freshEvents) ? (freshEvents as ZeusEvent[]) : [];
		const reconciledEvents = reconcileEventsWithCache(safeEvents, cachedEvents);
		const changed = eventsDiffer(reconciledEvents, cachedEvents);
		const changes = findEventChanges(cachedEvents, reconciledEvents, { windowDays: changeDetectionWindowDays });
		const visibleEvents = await mergeEventsWithLocal(reconciledEvents, start, end);

		if (changed || !exactEntry) {
			await writeEventsCache(start, end, query, reconciledEvents);
		}

		return buildResult({
			source: "network",
			events: reconciledEvents,
			visibleEvents,
			cacheHit: Boolean(cacheEntry),
			exactCacheHit: Boolean(exactEntry),
			changed,
			changes,
		});
	} catch (error) {
		const visibleEvents = await mergeEventsWithLocal(cachedEvents, start, end);
		return buildResult({
			source: "cache",
			events: cachedEvents,
			visibleEvents,
			cacheHit: Boolean(cacheEntry),
			exactCacheHit: Boolean(exactEntry),
			changed: false,
			changes: [],
			error,
		});
	}
}

export async function readCachedSchedule(start: Date, end: Date, query: EventsCacheQuery, includeFallback = true): Promise<ScheduleSyncResult> {
	if (!hasEventsCacheQuery(query)) {
		const visibleEvents = await mergeEventsWithLocal([], start, end);
		return buildResult({
			source: "local",
			events: [],
			visibleEvents,
			cacheHit: false,
			exactCacheHit: false,
			changed: false,
			changes: [],
		});
	}

	const exactEntry = await readEventsCacheEntry(start, end, query, false);
	const cacheEntry = exactEntry || (includeFallback ? await readEventsCacheEntry(start, end, query, true) : null);
	const events = cacheEntry ? filterEventsByRange(cacheEntry.events, start, end) : [];
	const visibleEvents = await mergeEventsWithLocal(events, start, end);
	return buildResult({
		source: "cache",
		events,
		visibleEvents,
		cacheHit: Boolean(cacheEntry),
		exactCacheHit: Boolean(exactEntry),
		changed: false,
		changes: [],
	});
}

export async function readCachedSelectedGroupsSchedule(windowDays = 14) {
	const groups = await getJSON<(string | number)[]>("selectedGroups", []);
	const start = startOfDay(new Date());
	const end = new Date(start);
	end.setDate(end.getDate() + windowDays);
	return readCachedSchedule(start, end, { groups }, true);
}

function buildResult(input: Omit<ScheduleSyncResult, "activeEvents">): ScheduleSyncResult {
	return {
		...input,
		activeEvents: input.visibleEvents.filter((event) => !isEventCancelled(event) && !isEventIgnored(event)),
	};
}
