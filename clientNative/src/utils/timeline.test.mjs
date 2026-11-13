import test from "node:test";
import assert from "node:assert/strict";
import { buildTimeline, elapsedShare, formatDuration } from "./timeline.ts";

const ev = (start, end, active = true) => ({ startDate: `2026-11-13T${start}:00`, endDate: `2026-11-13T${end}:00`, active });
const at = (time) => +new Date(`2026-11-13T${time}:00`);
const kinds = (items) => items.map((item) => (item.kind === "break" ? `break:${item.minutes}` : item.kind));
const isActive = (event) => event.active;

test("formatDuration", () => {
	assert.equal(formatDuration(45), "45 min");
	assert.equal(formatDuration(90), "1 h 30");
	assert.equal(formatDuration(120), "2 h");
});

test("breaks are inserted between active courses only when long enough", () => {
	const events = [ev("08:30", "10:30"), ev("10:40", "12:00"), ev("13:30", "15:00")];
	assert.deepEqual(kinds(buildTimeline(events, at("07:00"), false, isActive)), ["event", "event", "break:90", "event"]);
});

test("now marker sits before the next course today, and not while a course runs", () => {
	const events = [ev("08:30", "10:30"), ev("13:30", "15:00")];
	assert.deepEqual(kinds(buildTimeline(events, at("11:00"), true, isActive)), ["event", "now", "break:180", "event"]);
	assert.deepEqual(kinds(buildTimeline(events, at("09:00"), true, isActive)), ["event", "break:180", "event"]);
	assert.deepEqual(kinds(buildTimeline(events, at("16:00"), true, isActive)), ["event", "break:180", "event", "now"]);
});

test("cancelled courses neither create breaks nor anchor the now marker", () => {
	const events = [ev("08:30", "10:30"), ev("10:30", "12:00", false), ev("13:30", "15:00")];
	assert.deepEqual(kinds(buildTimeline(events, at("11:00"), true, isActive)), ["event", "event", "now", "break:180", "event"]);
});

test("elapsedShare clamps to the span", () => {
	assert.equal(elapsedShare(at("10:00"), at("12:00"), at("09:00")), 0);
	assert.equal(elapsedShare(at("10:00"), at("12:00"), at("11:00")), 0.5);
	assert.equal(elapsedShare(at("10:00"), at("12:00"), at("13:00")), 1);
});
