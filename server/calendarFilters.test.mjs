import test from "node:test";
import assert from "node:assert/strict";
import { eventMatchesCalendarFilters, filterEventsByCalendarFilters } from "./calendarFilters.js";

const events = [
	{
		id: "d2-kb191-ada",
		groups: [{ id: "D2" }],
		rooms: [{ room: { id: "KB191" } }],
		teachers: [{ id: 7 }],
	},
	{
		id: "d2-kb192-grace",
		groups: [{ id: "D2" }],
		rooms: [{ id: "KB192" }],
		teachers: [{ id: 8 }],
	},
	{
		id: "d3-kb191-ada",
		groups: [{ id: "D3" }],
		rooms: [{ id: "KB191" }],
		teachers: [{ id: 7 }],
	},
];

test("filters use AND between categories", () => {
	assert.deepEqual(
		filterEventsByCalendarFilters(events, { groups: ["D2"], rooms: ["KB191"] }).map((event) => event.id),
		["d2-kb191-ada"],
	);
});

test("filters keep OR semantics inside a category", () => {
	assert.deepEqual(
		filterEventsByCalendarFilters(events, { groups: ["D2", "D3"], rooms: ["KB191"] }).map((event) => event.id),
		["d2-kb191-ada", "d3-kb191-ada"],
	);
});

test("all active categories must match", () => {
	assert.equal(
		eventMatchesCalendarFilters(events[0], { groups: ["D2"], rooms: ["KB191"], teachers: [7] }),
		true,
	);
	assert.equal(
		eventMatchesCalendarFilters(events[1], { groups: ["D2"], rooms: ["KB191"], teachers: [8] }),
		false,
	);
});

test("room ids nested under room are supported", () => {
	assert.equal(eventMatchesCalendarFilters(events[0], { rooms: ["KB191"] }), true);
});
