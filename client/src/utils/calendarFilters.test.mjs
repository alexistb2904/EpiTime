import test from "node:test";
import assert from "node:assert/strict";
import { buildCalendarFilterParams, buildEffectiveCalendarFilters, filterCalendarFilterOptions } from "./calendarFilters.js";

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


test("buildEffectiveCalendarFilters keeps global categories combined in the normal context", () => {
	assert.deepEqual(
		buildEffectiveCalendarFilters(
			{ groups: [12], rooms: [42], teachers: [7] },
			{ type: "group", ids: [12], label: "Mes filtres" },
		),
		{ groups: [12], rooms: [42], teachers: [7] },
	);
});

test("buildEffectiveCalendarFilters replaces global filters for a temporary room context", () => {
	assert.deepEqual(
		buildEffectiveCalendarFilters(
			{ groups: [12], rooms: [42], teachers: [7] },
			{ type: "room", ids: [99], label: "KB191" },
		),
		{ groups: [], rooms: [99], teachers: [] },
	);
});

test("buildEffectiveCalendarFilters replaces global filters for a temporary teacher context", () => {
	assert.deepEqual(
		buildEffectiveCalendarFilters(
			{ groups: [12], rooms: [42], teachers: [7] },
			{ type: "teacher", ids: [99], label: "Ada Lovelace" },
		),
		{ groups: [], rooms: [], teachers: [99] },
	);
});
