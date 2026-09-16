import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Check, ChevronDown } from "lucide-react-native";
import { useTheme } from "../context/ThemeContext";
import type { GroupTreeNode } from "../utils/groups";

type Props = {
	groups: GroupTreeNode[];
	selected: Array<string | number>;
	onToggle: (id: string | number) => void;
	searchActive?: boolean;
};

function GroupTreeItem({ group, selected, onToggle, depth, searchActive, expanded, onToggleExpand }: Omit<Props, "groups"> & { group: GroupTreeNode; depth: number; expanded: Record<string, boolean>; onToggleExpand: (id: string | number) => void }) {
	const { theme } = useTheme();
	const active = selected.some((id) => String(id) === String(group.id));
	const hasChildren = group.children.length > 0;
	const isExpanded = Boolean(searchActive || expanded[String(group.id)]);

	return (
		<View>
			<View style={[s.row, { marginLeft: depth * 16 }]}>
				{hasChildren ? (
					<Pressable
						style={[s.expandButton, { borderColor: theme.border, backgroundColor: theme.surfaceSoft }]}
						onPress={() => onToggleExpand(group.id)}
						accessibilityLabel={isExpanded ? `Réduire ${group.name}` : `Développer ${group.name}`}>
						<ChevronDown color={theme.muted} size={16} style={{ transform: [{ rotate: isExpanded ? "0deg" : "-90deg" }] }} />
					</Pressable>
				) : (
					<View style={s.expandSpacer} />
				)}
				<Pressable
					style={[s.groupRow, { backgroundColor: theme.surface, borderColor: active ? theme.accent : theme.border }]}
					onPress={() => onToggle(group.id)}>
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
							selected={selected}
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
}

export default function GroupTreeList({ groups, selected, onToggle, searchActive = false }: Props) {
	const [expanded, setExpanded] = useState<Record<string, boolean>>({});

	useEffect(() => {
		if (!searchActive) setExpanded({});
	}, [searchActive]);

	return (
		<View style={s.list}>
			{groups.map((group) => (
				<GroupTreeItem
					key={String(group.id)}
					group={group}
					selected={selected}
					onToggle={onToggle}
					depth={0}
					searchActive={searchActive}
					expanded={expanded}
					onToggleExpand={(id) => setExpanded((current) => ({ ...current, [String(id)]: !current[String(id)] }))}
				/>
			))}
		</View>
	);
}

const s = StyleSheet.create({
	list: { gap: 8 },
	row: { flexDirection: "row", alignItems: "center", gap: 8 },
	expandButton: { width: 28, height: 28, borderWidth: 1, borderRadius: 9, alignItems: "center", justifyContent: "center" },
	expandSpacer: { width: 28 },
	groupRow: { flex: 1, minHeight: 50, borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 10 },
	check: { width: 22, height: 22, borderWidth: 1, borderRadius: 6, alignItems: "center", justifyContent: "center" },
	groupName: { flex: 1, fontWeight: "800" },
});
