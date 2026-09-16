import assert from "node:assert/strict";
import test from "node:test";
import { buildGroupTree, filterGroupTree, getAssociatedGroups } from "./groups.ts";

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
