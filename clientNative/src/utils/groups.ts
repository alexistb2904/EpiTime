import type { Group, ZeusEvent } from "../types";

export type GroupTreeNode = Group & { children: GroupTreeNode[] };

const compareGroups = (first: Group, second: Group) => first.name.localeCompare(second.name, "fr", { sensitivity: "base", numeric: true });

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
