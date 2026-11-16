import test from "node:test";
import assert from "node:assert/strict";
import { changesForSubscriber, createScheduleWatcher } from "./scheduleChanges.js";

const HOUR = 3_600_000;
const now = Date.parse("2026-11-16T08:00:00Z");
const range = [now - 24 * HOUR, now + 14 * 24 * HOUR];
const course = (id, hoursFromNow, extra = {}) => ({
	idReservation: id,
	name: `Cours ${id}`,
	startDate: new Date(now + hoursFromNow * HOUR).toISOString(),
	endDate: new Date(now + (hoursFromNow + 2) * HOUR).toISOString(),
	groups: [{ id: 10, name: "A" }],
	rooms: [{ name: "S1" }],
	...extra,
});

test("first fetch is a baseline, then a cancellation is reported with the event groups", () => {
	const watcher = createScheduleWatcher();
	assert.deepEqual(watcher.observe(["10"], ...range, [course(1, 24), course(2, 48)], now), []);
	const changes = watcher.observe(["10"], ...range, [course(1, 24, { isCancelled: true }), course(2, 48)], now);
	assert.equal(changes.length, 1);
	assert.equal(changes[0].kind, "cancelled");
	assert.deepEqual(changes[0].groupIds, ["10"]);
});

test("a narrower fetch does not report events outside its window as deleted", () => {
	const watcher = createScheduleWatcher();
	watcher.observe(["10"], ...range, [course(1, 24), course(2, 200)], now);
	assert.deepEqual(watcher.observe(["10"], now, now + 72 * HOUR, [course(1, 24)], now), []);
	assert.equal(watcher.observe(["10"], ...range, [course(1, 24)], now).length, 1);
});

test("a mass deletion is only reported once a second fetch confirms it", () => {
	const watcher = createScheduleWatcher();
	watcher.observe(["10"], ...range, [course(1, 24), course(2, 30), course(3, 48), course(4, 50)], now);
	assert.deepEqual(watcher.observe(["10"], ...range, [course(4, 50)], now), []);
	assert.equal(watcher.observe(["10"], ...range, [course(4, 50)], now).length, 3);
});

test("subscribers get changes for their groups, within their window, unless disabled", () => {
	const watcher = createScheduleWatcher();
	watcher.observe(["10", "20"], ...range, [course(1, 24), course(2, 24, { groups: [{ id: 20 }] }), course(3, 24 * 6)], now);
	const changes = watcher.observe(["10", "20"], ...range, [course(1, 24, { rooms: [{ name: "S2" }] }), course(2, 24, { groups: [{ id: 20 }], isCancelled: true })], now);
	const settings = { changeDetectionEnabled: true, changeDetectionWindowDays: 3 };

	assert.deepEqual(changesForSubscriber(changes, ["10", "20"], { groups: ["10"], settings }, now).map((c) => c.identity), ["r:1"]);
	assert.deepEqual(changesForSubscriber(changes, ["10", "20"], { groups: ["10", "20"], settings: { ...settings, changeDetectionWindowDays: 14 } }, now).length, 3);
	assert.deepEqual(changesForSubscriber(changes, ["10", "20"], { groups: ["30"], settings }, now), []);
	assert.deepEqual(changesForSubscriber(changes, ["10", "20"], { groups: ["10"], settings: { ...settings, changeDetectionEnabled: false } }, now), []);
});
