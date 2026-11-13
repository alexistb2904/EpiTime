import assert from "node:assert/strict";
import test from "node:test";
import { buildGroupTree, filterGroupTree, getAssociatedGroups, getDisplayedGroupNames } from "./groups.ts";

const groups = [
	{ id: 1, name: "ING1" },
	{ id: 2, name: "A1", idParent: 1 },
	{ id: "3", name: "B2", idParent: "1" },
	{ id: 4, name: "C3", idParent: 1 },
	{ id: 5, name: "SRS" },
];

test("buildGroupTree nests children under their parent even when ID types differ", () => {
	const tree = buildGroupTree(groups);

	assert.deepEqual(tree.map((group) => group.name), ["ING1", "SRS"]);
	assert.deepEqual(tree[0].children.map((group) => group.name), ["A1", "B2", "C3"]);
});

test("buildGroupTree lists EPITA, EPITECH, other parents, then orphan groups", () => {
	const tree = buildGroupTree([
		{ id: 1, name: "B7" },
		{ id: 2, name: "ESME" },
		{ id: 3, name: "ESME child", idParent: 2 },
		{ id: 4, name: "Epitech" },
		{ id: 5, name: "Epitech child", idParent: 4 },
		{ id: 6, name: "EPITA" },
		{ id: 7, name: "EPITA child", idParent: 6 },
		{ id: 8, name: "ACU" },
	]);

	assert.deepEqual(tree.map((group) => group.name), ["EPITA", "Epitech", "ESME", "ACU", "B7"]);
});

test("filterGroupTree keeps the matching child and its parent", () => {
	const filtered = filterGroupTree(buildGroupTree(groups), "b2");

	assert.deepEqual(filtered.map((group) => group.name), ["ING1"]);
	assert.deepEqual(filtered[0].children.map((group) => group.name), ["B2"]);
});

test("getAssociatedGroups returns only groups selected by the user", () => {
	const associated = getAssociatedGroups(
		[
			{ id: "2", name: "A1" },
			{ id: "3", name: "B2" },
			{ id: "4", name: "C3" },
		],
		[3, 42]
	);

	assert.deepEqual(associated, [{ id: "3", name: "B2" }]);
});

test("getDisplayedGroupNames resolves API group ids through the onboarding directory", () => {
	const names = getDisplayedGroupNames(
		[
			{ idGroup: "3" },
			{ groupId: 5 },
		],
		[3, 5],
		[
			{ id: 1, name: "ING1" },
			{ id: 3, name: "B2" },
			{ id: 5, name: "SRS" },
		]
	);

	assert.deepEqual(names, ["B2", "SRS"]);
});

test("getDisplayedGroupNames supports named event groups and hides the chip for one filter", () => {
	assert.deepEqual(getDisplayedGroupNames([{ group: { name: "B2" } }, { name: "SRS" }], [1, 2, 3]), ["B2", "SRS"]);
	assert.deepEqual(getDisplayedGroupNames([{ id: 1, name: "ING1" }], [1]), []);
});
