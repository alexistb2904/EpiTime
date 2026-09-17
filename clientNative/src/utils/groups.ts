import type { Group, ZeusEvent } from "../types";

export type GroupTreeNode = Group & { children: GroupTreeNode[] };

const groupCollator = new Intl.Collator("fr", { sensitivity: "base", numeric: true });
const compareGroups = (first: Group, second: Group) => groupCollator.compare(first.name, second.name);

export function buildGroupTree(groups: Group[]): GroupTreeNode[] {
	const nodes = new Map<string, GroupTreeNode>();
	groups.forEach((group) => nodes.set(String(group.id), { ...group, children: [] }));

	const roots: GroupTreeNode[] = [];
	nodes.forEach((node) => {
		const parentId = node.idParent === null || node.idParent === undefined ? null : String(node.idParent);
		const parent = parentId ? nodes.get(parentId) : undefined;
		if (parent && parent !== node) parent.children.push(node);
		else roots.push(node);
	});

	const sortNodes = (items: GroupTreeNode[]) => {
		items.sort(compareGroups);
		items.forEach((item) => sortNodes(item.children));
	};
	sortNodes(roots);
	return roots;
}

export function filterGroupTree(nodes: GroupTreeNode[], search: string): GroupTreeNode[] {
	const term = search.trim().toLocaleLowerCase("fr-FR");
	if (!term) return nodes;

	const filterNode = (node: GroupTreeNode): GroupTreeNode | null => {
		const children = node.children.map(filterNode).filter((child): child is GroupTreeNode => child !== null);
		if (!node.name.toLocaleLowerCase("fr-FR").includes(term) && !children.length) return null;
		return { ...node, children };
	};

	return nodes.map(filterNode).filter((node): node is GroupTreeNode => node !== null);
}

export function getAssociatedGroups(eventGroups: ZeusEvent["groups"], selectedGroupIds: Array<string | number>) {
	const selectedIds = new Set(selectedGroupIds.map(String));
	return (eventGroups || []).filter((group) => group.id !== undefined && group.id !== null && selectedIds.has(String(group.id)));
}

type EventGroupReference = {
	id?: string | number | null;
	name?: string | null;
};

function readEventGroupReference(value: unknown): EventGroupReference {
	if (typeof value === "string" || typeof value === "number") return { id: value };
	if (!value || typeof value !== "object") return {};

	const group = value as Record<string, unknown>;
	const nestedGroup = group.group && typeof group.group === "object" ? (group.group as Record<string, unknown>) : undefined;
	const id = group.id ?? group.idGroup ?? group.groupId ?? group.id_group ?? nestedGroup?.id;
	const name = group.name ?? group.groupName ?? group.group_name ?? nestedGroup?.name;

	return {
		id: typeof id === "string" || typeof id === "number" ? id : null,
		name: typeof name === "string" && name.trim() ? name.trim() : null,
	};
}

/** Resolve the active group names for an event when several groups are selected. */
export function getDisplayedGroupNames(
	eventGroups: unknown,
	selectedGroupIds: Array<string | number>,
	availableGroups: Array<Pick<Group, "id" | "name">> = []
) {
	if (selectedGroupIds.length <= 1) return [];

	const values = Array.isArray(eventGroups) ? eventGroups : eventGroups == null ? [] : [eventGroups];
	const references = values.map(readEventGroupReference);
	const namesById = new Map(availableGroups.map((group) => [String(group.id), group.name]));
	const hasEventGroupIds = references.some((group) => group.id !== undefined && group.id !== null);
	const names = selectedGroupIds
		.map((selectedId) => {
			const eventGroup = references.find((group) => group.id !== undefined && group.id !== null && String(group.id) === String(selectedId));
			return eventGroup?.name || (eventGroup ? namesById.get(String(selectedId)) : undefined);
		})
		.filter((name): name is string => Boolean(name));

	if (names.length || hasEventGroupIds) return Array.from(new Set(names));

	// Some responses return named group objects without their id.
	return Array.from(new Set(references.map((group) => group.name).filter((name): name is string => Boolean(name))));
}
