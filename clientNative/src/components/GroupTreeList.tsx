import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Check, Minus, Plus } from "lucide-react-native";
import { useTheme } from "../context/ThemeContext";
import type { GroupTreeNode } from "../utils/groups";

type Props = {
	groups: GroupTreeNode[];
	selected: Array<string | number>;
	onToggle: (id: string | number) => void;
	searchActive?: boolean;
};

type GroupTreeItemProps = {
	group: GroupTreeNode;
	selectedIds: ReadonlySet<string>;
	onToggle: (id: string | number) => void;
	depth: number;
	searchActive: boolean;
	expanded: Readonly<Record<string, boolean>>;
	onToggleExpand: (id: string | number) => void;
};

const GroupTreeItem = memo(function GroupTreeItem({ group, selectedIds, onToggle, depth, searchActive, expanded, onToggleExpand }: GroupTreeItemProps) {
	const { theme } = useTheme();
	const active = selectedIds.has(String(group.id));
	const hasChildren = group.children.length > 0;
	const isExpanded = Boolean(searchActive || expanded[String(group.id)]);

	return (
		<View>
			<View style={[s.row, { marginLeft: depth * 16 }]}>
				{hasChildren ? (
					<Pressable
						style={[s.expandButton, { backgroundColor: theme.accentSoft }]}
						onPress={() => onToggleExpand(group.id)}
						hitSlop={6}
						accessibilityRole="button"
						accessibilityState={{ expanded: isExpanded }}
						accessibilityLabel={isExpanded ? `Réduire ${group.name}` : `Développer ${group.name}`}>
						{isExpanded ? <Minus color={theme.accent} size={17} strokeWidth={2.5} /> : <Plus color={theme.accent} size={17} strokeWidth={2.5} />}
					</Pressable>
				) : (
					<View style={s.expandSpacer} />
				)}
				<Pressable style={[s.groupRow, { backgroundColor: theme.surface, borderColor: active ? theme.accent : theme.border }]} onPress={() => onToggle(group.id)}>
					<View style={[s.check, { backgroundColor: active ? theme.accent : "transparent", borderColor: active ? theme.accent : theme.border }]}>
						{active ? <Check color="#fff" size={14} /> : null}
					</View>
					<Text style={[s.groupName, { color: theme.text }]} numberOfLines={1}>
						{group.name}
					</Text>
				</Pressable>
			</View>
			{hasChildren && isExpanded
				? group.children.map((child) => (
						<GroupTreeItem
							key={String(child.id)}
							group={child}
							selectedIds={selectedIds}
							onToggle={onToggle}
							depth={depth + 1}
							searchActive={searchActive}
							expanded={expanded}
							onToggleExpand={onToggleExpand}
						/>
					))
				: null}
		</View>
	);
});

export default function GroupTreeList({ groups, selected, onToggle, searchActive = false }: Props) {
	const [expanded, setExpanded] = useState<Record<string, boolean>>({});
	const selectedIds = useMemo(() => new Set(selected.map(String)), [selected]);
	const toggleExpand = useCallback((id: string | number) => {
		setExpanded((current) => ({ ...current, [String(id)]: !current[String(id)] }));
	}, []);

	useEffect(() => {
		if (!searchActive) setExpanded({});
	}, [searchActive]);

	return (
		<View style={s.list}>
			{groups.map((group) => (
				<GroupTreeItem
					key={String(group.id)}
					group={group}
					selectedIds={selectedIds}
					onToggle={onToggle}
					depth={0}
					searchActive={searchActive}
					expanded={expanded}
					onToggleExpand={toggleExpand}
				/>
			))}
		</View>
	);
}

const s = StyleSheet.create({
	list: { gap: 2 },
	row: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
	expandButton: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
	expandSpacer: { width: 32 },
	groupRow: { flex: 1, minHeight: 50, borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 10 },
	check: { width: 22, height: 22, borderWidth: 1, borderRadius: 6, alignItems: "center", justifyContent: "center" },
	groupName: { flex: 1, fontWeight: "800" },
});
