import { diffSnapshots } from "../shared/src/changes.ts";
import { eventIdentity } from "../shared/src/events.ts";

const DAY = 86_400_000;
const MINUTE = 60_000;
const SNAPSHOT_TTL_MS = 2 * DAY;
const MAX_CHANGES_PER_DEVICE = 6;

const startOf = (event) => new Date(event?.startDate).getTime();
const eventGroupIds = (event) => (event?.groups || []).map((group) => String(group?.id ?? "")).filter(Boolean);


export function createScheduleWatcher() {
	const snapshots = new Map();

	return {
		observe(groupIds, rangeStart, rangeEnd, events, now = Date.now()) {
			if (!Array.isArray(events) || !Number.isFinite(rangeStart) || !Number.isFinite(rangeEnd) || rangeEnd <= rangeStart) return [];
			const scope = [...new Set(groupIds.map(String))].sort().join(",");
			const fresh = { scope, rangeStart, rangeEnd, fetchedAt: now, events };
			const previous = snapshots.get(scope);
			const diff = diffSnapshots(previous, fresh, { now, windowDays: 14 });

			if (diff.status === "suspicious" && previous.pendingSignature !== diff.signature) {
				previous.pendingSignature = diff.signature;
				return [];
			}

			snapshots.set(scope, mergeSnapshots(previous, fresh, now));
			const byIdentity = new Map([...(previous?.events || []), ...events].map((event) => [eventIdentity(event), event]));
			return diff.changes.map((change) => ({ ...change, groupIds: eventGroupIds(byIdentity.get(change.identity)) }));
		},
		cleanup(now = Date.now()) {
			for (const [scope, snapshot] of snapshots) {
				if (snapshot.fetchedAt < now - SNAPSHOT_TTL_MS) snapshots.delete(scope);
			}
		},
	};
}

function mergeSnapshots(previous, fresh, now) {
	if (!previous || previous.rangeEnd < fresh.rangeStart || previous.rangeStart > fresh.rangeEnd) return fresh;
	const kept = previous.events.filter((event) => {
		const start = startOf(event);
		return (start < fresh.rangeStart || start >= fresh.rangeEnd) && start >= now - DAY;
	});
	return {
		...fresh,
		rangeStart: Math.max(Math.min(previous.rangeStart, fresh.rangeStart), now - DAY),
		rangeEnd: Math.max(previous.rangeEnd, fresh.rangeEnd),
		events: [...kept, ...fresh.events],
	};
}

export function changesForSubscriber(changes, scopeGroupIds, subscription, now = Date.now()) {
	const settings = subscription.settings || {};
	if (settings.changeDetectionEnabled === false) return [];
	const groups = new Set((subscription.groups || []).map(String));
	const scope = scopeGroupIds.map(String);
	const coversScope = scope.every((id) => groups.has(id));
	const windowEnd = now + (settings.changeDetectionWindowDays || 3) * DAY;

	return changes
		.filter((change) => {
			const start = new Date(change.startDate).getTime();
			if (!(start >= now - MINUTE && start <= windowEnd)) return false;
			if (change.groupIds.some((id) => groups.has(id))) return true;
			return coversScope && !change.groupIds.some((id) => scope.includes(id));
		})
		.slice(0, MAX_CHANGES_PER_DEVICE);
}
