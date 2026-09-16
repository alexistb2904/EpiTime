import test from "node:test";
import assert from "node:assert/strict";
import { buildScheduleFilterQuery, hasScheduleFilters } from "./scheduleFilters.ts";

test("buildScheduleFilterQuery combines selected groups, rooms and teachers", () => {
	assert.deepEqual(
		buildScheduleFilterQuery(
			{ groups: [12, 13], rooms: [42], teachers: [7] },
			{ type: "group", ids: [12, 13], label: "Mes filtres" },
		),
		{ groups: [12, 13], rooms: [42], teachers: [7] },
	);
});

test("buildScheduleFilterQuery keeps global filters when a teacher context is opened", () => {
	assert.deepEqual(
		buildScheduleFilterQuery(
			{ groups: [12], rooms: [42], teachers: [7] },
			{ type: "teacher", ids: [99], label: "Ada Lovelace" },
		),
		{ groups: [12], rooms: [42], teachers: [99, 7] },
	);
});

test("hasScheduleFilters accepts a room-only calendar selection", () => {
	assert.equal(hasScheduleFilters({ groups: [], rooms: [42], teachers: [] }), true);
});
