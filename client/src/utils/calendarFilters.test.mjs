import test from "node:test";
import assert from "node:assert/strict";
import { buildCalendarFilterParams, filterCalendarFilterOptions } from "./calendarFilters.js";

test("buildCalendarFilterParams keeps every selected group, room and teacher in the same request", () => {
	const params = buildCalendarFilterParams({
		groups: [12, 13],
		rooms: [42],
		teachers: [7, 8],
	});

	assert.deepEqual(Array.from(params.entries()), [
		["groups", "12"],
		["groups", "13"],
		["rooms", "42"],
		["teachers", "7"],
		["teachers", "8"],
	]);
});

test("buildCalendarFilterParams leaves empty filter categories out of the request", () => {
	const params = buildCalendarFilterParams({ groups: [], rooms: [], teachers: [] });

	assert.deepEqual(Array.from(params.entries()), []);
});

test("filterCalendarFilterOptions finds teachers by first name or last name without case sensitivity", () => {
	const results = filterCalendarFilterOptions(
		[
			{ id: 1, name: "Dupont", firstname: "Camille" },
			{ id: 2, name: "Martin", firstname: "Alex" },
		],
		"cAmIlLe duPONT",
		(item) => `${item.firstname} ${item.name}`,
	);

	assert.deepEqual(results.map((item) => item.id), [1]);
});
