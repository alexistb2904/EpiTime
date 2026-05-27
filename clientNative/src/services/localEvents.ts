import { ZeusEvent } from "../types";
import { getJSON, setJSON } from "./storage";

const MANUAL_EVENTS_KEY = "manualEvents";
const DELETED_REAL_EVENTS_KEY = "deletedRealEvents";

export type ManualEventInput = {
	title: string;
	startDate: Date;
	endDate: Date;
	room?: string;
};

export const getLocalEventKey = (event: Pick<ZeusEvent, "id" | "idReservation" | "startDate">) => `${event.idReservation || event.id || "event"}-${event.startDate}`;

export const isEventCancelled = (event: ZeusEvent) => Boolean(event.isCancelled || event.isCanceled);

export const stripCancellationState = (event: ZeusEvent): ZeusEvent => {
	const { isCancelled, isCanceled, cancelledAt, cancellationReason, ...cleanEvent } = event;
	return cleanEvent;
};

export const isManualEvent = (event: ZeusEvent) => Boolean(event.isManual || String(event.id || "").startsWith("manual-"));

const getManualEvents = () => getJSON<ZeusEvent[]>(MANUAL_EVENTS_KEY, []);

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
	await setJSON(DELETED_REAL_EVENTS_KEY, []);
}

export async function getDeletedRealEventsCount() {
	return (await getJSON<string[]>(DELETED_REAL_EVENTS_KEY, [])).length;
}

export async function mergeEventsWithLocal(events: ZeusEvent[], start?: Date, end?: Date) {
	const [manualEvents, deletedKeys] = await Promise.all([getManualEvents(), getJSON<string[]>(DELETED_REAL_EVENTS_KEY, [])]);
	const deleted = new Set(deletedKeys);
	const visibleRemoteEvents = events.filter((event) => !isManualEvent(event) && !deleted.has(getLocalEventKey(event)));
	return [...visibleRemoteEvents, ...manualEvents.filter((event) => eventOverlapsRange(event, start, end))];
}

export function reconcileEventsWithCache(freshEvents: ZeusEvent[], cachedEvents: ZeusEvent[] | null | undefined) {
	const fresh = freshEvents.map(stripCancellationState);
	const freshKeys = new Set(fresh.map(getLocalEventKey));
	const cancelledFromCache = (cachedEvents || [])
		.filter((event) => !isManualEvent(event) && !freshKeys.has(getLocalEventKey(event)))
		.map((event) => ({
			...event,
			isCancelled: true,
			isCanceled: true,
			cancelledAt: event.cancelledAt || new Date().toISOString(),
			cancellationReason: event.cancellationReason || "Absent du dernier retour Zeus",
		}));

	const byKey = new Map<string, ZeusEvent>();
	[...fresh, ...cancelledFromCache].forEach((event) => byKey.set(getLocalEventKey(event), event));
	return Array.from(byKey.values());
}
