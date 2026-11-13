import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Modal, Pressable, ScrollView, SectionList, StyleSheet, Text, TextInput, View } from "react-native";
import Animated, { FadeInDown, LinearTransition } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Check, CaretDown, CaretRight, Clock, DoorOpen, Funnel, GraduationCap, Stack, MapPin, NavigationArrow, ArrowCounterClockwise, MagnifyingGlass, SlidersHorizontal, Users, X } from "phosphor-react-native";
import { useTheme } from "../../context/ThemeContext";
import { getAvailableRooms, getLocations, getRooms, getRoomTypes } from "../../services/api";
import { Group, LocationNode, Room, RoomType, Teacher } from "../../types";
import type { GroupTreeNode } from "../../utils/groups";
import GroupTreeList from "../GroupTreeList";
import { openUrl } from "../../utils/calendar";
import { getRoomMapUrl } from "../../utils/rooms";
import { normalizeSearchText, searchByKey } from "../../utils/scheduleFilters";
import { s } from "./calendarStyles";

const getLocationLabel = (node: LocationNode) => {
	const overrides: Record<string, string> = { "2": "Kremlin-Bicêtre", "7": "Partialie", "8": "Pasteur", "9": "Voltaire", "10": "Campus Cyber" };
	return overrides[String(node.id)] || node.name || `Lieu #${node.id}`;
};

const flattenLocations = (nodes: LocationNode[] = []): Array<{ id: string | number; name: string }> => {
	const result: Array<{ id: string | number; name: string }> = [];
	const walk = (items: LocationNode[]) => {
		items.forEach((node) => {
			const type = (node.type || "").toLowerCase();
			if (type.includes("location") || node.id_type === 0) result.push({ id: node.id, name: getLocationLabel(node) });
			if (node.children?.length) walk(node.children);
		});
	};
	walk(nodes);
	return Array.from(new Map(result.map((item) => [String(item.id), item])).values());
};

export function GroupModal({
	visible,
	groups,
	selected,
	search,
	onSearch,
	onApply,
	onClose,
}: {
	visible: boolean;
	groups: GroupTreeNode[];
	selected: (string | number)[];
	search: string;
	onSearch: (value: string) => void;
	onApply: (ids: (string | number)[]) => void;
	onClose: () => void;
}) {
	const { theme } = useTheme();
	const insets = useSafeAreaInsets();
	const [draftSelected, setDraftSelected] = useState<(string | number)[]>(selected);

	useEffect(() => {
		if (visible) setDraftSelected(selected);
	}, [selected, visible]);

	const toggleGroup = (id: string | number) => {
		setDraftSelected((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
	};

	return (
		<Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
			<View style={[s.modalRoot, { backgroundColor: theme.bg }]}>
				<ModalHeader title="Mes groupes" onClose={onClose} />
				<View style={[s.searchBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
					<MagnifyingGlass color={theme.muted} size={18} />
					<TextInput
						value={search}
						onChangeText={onSearch}
						placeholder="Rechercher un groupe"
						placeholderTextColor={theme.muted}
						style={[s.searchInput, { color: theme.text }]}
					/>
				</View>
				<Text style={[s.modalMeta, { color: theme.muted }]}>
					{draftSelected.length
						? `${draftSelected.length} groupe${draftSelected.length > 1 ? "s" : ""} sélectionné${draftSelected.length > 1 ? "s" : ""}`
						: "Choisis au moins un groupe"}
				</Text>
				<ScrollView contentContainerStyle={s.modalList} keyboardShouldPersistTaps="handled">
					<GroupTreeList groups={groups} selected={draftSelected} onToggle={toggleGroup} searchActive={Boolean(search.trim())} />
				</ScrollView>
				<View style={[s.groupModalFooter, { backgroundColor: theme.bg, borderTopColor: theme.border, paddingBottom: Math.max(insets.bottom, 16) }]}>
					<Pressable
						style={[s.groupModalApply, { backgroundColor: draftSelected.length ? theme.accent : theme.border }]}
						disabled={!draftSelected.length}
						onPress={() => {
							onApply(draftSelected);
							onClose();
						}}>
						<Check color={theme.onAccent} size={18} />
						<Text style={[s.primaryText, { color: theme.onAccent }]}>
							Choisir {draftSelected.length} groupe{draftSelected.length > 1 ? "s" : ""}
						</Text>
					</Pressable>
				</View>
			</View>
		</Modal>
	);
}

type FilterSelectionId = string | number;
type FilterSelection = { groups: FilterSelectionId[]; rooms: FilterSelectionId[]; teachers: FilterSelectionId[] };

export const sameId = (first: FilterSelectionId, second: FilterSelectionId) => String(first) === String(second);
export const toggleSelectionId = (items: FilterSelectionId[], id: FilterSelectionId) => (items.some((item) => sameId(item, id)) ? items.filter((item) => !sameId(item, id)) : [...items, id]);
export const FILTER_RESULT_LIMIT = 60;
const OTHER_ROOMS = "Autres salles";
const CAMPUS_LABELS: Record<string, string> = { "2": "Kremlin-Bicêtre", "10": "La Défense" };
const isLocationNode = (node: LocationNode) => (node.type || "").toLowerCase().includes("location") || node.id_type === 0;
const campusLabel = (node: LocationNode) => {
	const name = (node.name || "").trim();
	return CAMPUS_LABELS[String(node.id)] || (name ? name.charAt(0).toUpperCase() + name.slice(1) : `Campus #${node.id}`);
};
/** Location id → name of its top-level campus (a building such as Voltaire maps to Kremlin-Bicêtre). */
const buildCampusByLocation = (roots: LocationNode[]) => {
	const campusByLocation = new Map<string, string>();
	const walk = (nodes: LocationNode[], campus?: string) =>
		nodes.forEach((node) => {
			if (!isLocationNode(node)) return;
			const label = campus ?? campusLabel(node);
			campusByLocation.set(String(node.id), label);
			walk(node.children || [], label);
		});
	walk(roots);
	return campusByLocation;
};
export const teacherLabel = (teacher: Teacher) => `${teacher.firstname || ""} ${teacher.name || ""}`.trim() || `Enseignant #${teacher.id}`;

type FilterTab = keyof FilterSelection;

const FILTER_TABS: Array<{ key: FilterTab; label: string; search: string; noun: string }> = [
	{ key: "groups", label: "Groupes", search: "Rechercher un groupe", noun: "groupe" },
	{ key: "rooms", label: "Salles", search: "Rechercher une salle", noun: "salle" },
	{ key: "teachers", label: "Enseignants", search: "Rechercher un enseignant", noun: "enseignant" },
];
export const FILTER_ICONS = { groups: Users, rooms: DoorOpen, teachers: GraduationCap };

export function FiltersModal({
	visible,
	groups,
	allGroups,
	rooms,
	teachers,
	locations = [],
	selectedGroups,
	selectedRooms,
	selectedTeachers,
	groupSearch,
	onGroupSearch,
	filterOptionsLoading,
	onLoadFilterOptions,
	onApply,
	onClose,
}: {
	visible: boolean;
	groups: GroupTreeNode[];
	allGroups: Group[];
	rooms: Room[];
	teachers: Teacher[];
	locations?: LocationNode[];
	selectedGroups: FilterSelectionId[];
	selectedRooms: FilterSelectionId[];
	selectedTeachers: FilterSelectionId[];
	groupSearch: string;
	onGroupSearch: (value: string) => void;
	filterOptionsLoading: boolean;
	onLoadFilterOptions: () => void | Promise<void>;
	onApply: (filters: FilterSelection) => void;
	onClose: () => void;
}) {
	const { theme } = useTheme();
	const insets = useSafeAreaInsets();
	const onAccent = theme.onAccent;
	const [draft, setDraft] = useState<FilterSelection>({ groups: selectedGroups, rooms: selectedRooms, teachers: selectedTeachers });
	const [tab, setTab] = useState<FilterTab>("groups");
	const [roomSearch, setRoomSearch] = useState("");
	const [teacherSearch, setTeacherSearch] = useState("");
	const [collapsedCampuses, setCollapsedCampuses] = useState<ReadonlySet<string>>(new Set());

	useEffect(() => {
		if (!visible) return;
		setDraft({ groups: selectedGroups, rooms: selectedRooms, teachers: selectedTeachers });
		setTab("groups");
		setRoomSearch("");
		setTeacherSearch("");
		setCollapsedCampuses(new Set());
	}, [selectedGroups, selectedRooms, selectedTeachers, visible]);

	const groupNames = useMemo(() => new Map(allGroups.map((group) => [String(group.id), group.name])), [allGroups]);
	// MagnifyingGlass keys are computed once per list, not for 2 000 teachers on every keystroke.
	const roomKeys = useMemo(() => rooms.map((room) => normalizeSearchText(room.name || "")), [rooms]);
	const teacherKeys = useMemo(() => teachers.map((teacher) => normalizeSearchText(teacherLabel(teacher))), [teachers]);
	const visibleRooms = useMemo(() => searchByKey(rooms, roomKeys, roomSearch, Infinity), [roomKeys, roomSearch, rooms]);
	const visibleTeachers = useMemo(() => searchByKey(teachers, teacherKeys, teacherSearch, Infinity), [teacherKeys, teacherSearch, teachers]);
	const campusByLocation = useMemo(() => buildCampusByLocation(locations), [locations]);
	const roomSections = useMemo(() => {
		const sections = new Map<string, Room[]>();
		visibleRooms.forEach((room) => {
			const campus = campusByLocation.get(String(room.idLocation)) || OTHER_ROOMS;
			sections.set(campus, [...(sections.get(campus) || []), room]);
		});
		// A search shows every match, even in collapsed campuses.
		const searching = Boolean(roomSearch.trim());
		return [...sections]
			.map(([title, rooms]) => {
				const collapsed = !searching && collapsedCampuses.has(title);
				return { title, total: rooms.length, rooms, collapsed, data: collapsed ? [] : rooms };
			})
			.sort((a, b) => Number(a.title === OTHER_ROOMS) - Number(b.title === OTHER_ROOMS) || a.title.localeCompare(b.title, "fr"));
	}, [campusByLocation, collapsedCampuses, roomSearch, visibleRooms]);
	const toggleCampus = (title: string) =>
		setCollapsedCampuses((current) => {
			const next = new Set(current);
			if (!next.delete(title)) next.add(title);
			return next;
		});
	const draftRoomIds = useMemo(() => new Set(draft.rooms.map(String)), [draft.rooms]);
	const draftTeacherIds = useMemo(() => new Set(draft.teachers.map(String)), [draft.teachers]);
	const activeSelections = useMemo(
		() => [
			...draft.groups.map((id) => ({ id, type: "groups" as const, label: groupNames.get(String(id)) || String(id) })),
			...draft.rooms.map((id) => ({ id, type: "rooms" as const, label: rooms.find((room) => sameId(room.id, id))?.name || `Salle #${id}` })),
			...draft.teachers.map((id) => ({ id, type: "teachers" as const, label: teacherLabel(teachers.find((teacher) => sameId(teacher.id, id)) || { id }) })),
		],
		[draft, groupNames, rooms, teachers]
	);
	const totalSelected = activeSelections.length;
	const hadFilters = selectedGroups.length + selectedRooms.length + selectedTeachers.length > 0;
	const canApply = totalSelected > 0 || hadFilters;
	const toggle = (type: FilterTab, id: FilterSelectionId) => setDraft((current) => ({ ...current, [type]: toggleSelectionId(current[type], id) }));

	const activeTab = FILTER_TABS.find((item) => item.key === tab)!;
	const search = tab === "groups" ? groupSearch : tab === "rooms" ? roomSearch : teacherSearch;
	const setSearch = tab === "groups" ? onGroupSearch : tab === "rooms" ? setRoomSearch : setTeacherSearch;
	const source = tab === "rooms" ? rooms : teachers;

	const selectTab = (next: FilterTab) => {
		if (next !== "groups") void onLoadFilterOptions();
		setTab(next);
	};

	const renderStatus = (text: string, action?: { label: string; onPress: () => void }) => (
		<View style={filterStyles.status}>
			<Text style={[filterStyles.statusText, { color: theme.muted }]}>{text}</Text>
			{action ? (
				<Pressable style={[filterStyles.statusAction, { borderColor: theme.border }]} onPress={action.onPress}>
					<ArrowCounterClockwise color={theme.text} size={15} />
					<Text style={[filterStyles.statusActionText, { color: theme.text }]}>{action.label}</Text>
				</Pressable>
			) : null}
		</View>
	);

	return (
		<Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
			<View style={[s.modalRoot, { backgroundColor: theme.bg }]}>
				<ModalHeader title="Mes filtres" onClose={onClose} />

				<View style={[filterStyles.tabs, { backgroundColor: theme.surfaceSoft, borderColor: theme.border }]} accessibilityRole="tablist">
					{FILTER_TABS.map((item) => {
						const active = item.key === tab;
						const count = draft[item.key].length;
						return (
							<Pressable
								key={item.key}
								style={[filterStyles.tab, active && { backgroundColor: theme.accentSoft }]}
								onPress={() => selectTab(item.key)}
								accessibilityRole="tab"
								accessibilityState={{ selected: active }}
								accessibilityLabel={count ? `${item.label}, ${count} sélectionné${count > 1 ? "s" : ""}` : item.label}>
								<Text style={[filterStyles.tabText, { color: active ? theme.accent : theme.muted }]} numberOfLines={1}>
									{item.label}
								</Text>
								{count ? <Text style={[filterStyles.tabCount, { color: theme.accent }]}>{count}</Text> : null}
							</Pressable>
						);
					})}
				</View>

				<View style={[filterStyles.searchBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
					<MagnifyingGlass color={theme.muted} size={18} />
					<TextInput
						value={search}
						onChangeText={setSearch}
						placeholder={activeTab.search}
						placeholderTextColor={theme.muted}
						autoCorrect={false}
						returnKeyType="search"
						style={[s.searchInput, { color: theme.text }]}
					/>
					{search ? (
						<Pressable onPress={() => setSearch("")} hitSlop={12} accessibilityRole="button" accessibilityLabel="Effacer la recherche">
							<X color={theme.muted} size={18} />
						</Pressable>
					) : null}
				</View>

				{tab === "groups" ? (
					<ScrollView style={filterStyles.list} contentContainerStyle={filterStyles.listContent} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
						{groups.length ? (
							<GroupTreeList groups={groups} selected={draft.groups} onToggle={(id) => toggle("groups", id)} searchActive={Boolean(groupSearch.trim())} />
						) : (
							renderStatus(groupSearch.trim() ? `Aucun groupe pour « ${groupSearch.trim()} ».` : "Aucun groupe disponible.")
						)}
					</ScrollView>
				) : !source.length ? (
					<View style={[filterStyles.list, filterStyles.listContent]}>
						{filterOptionsLoading ? (
							<View style={filterStyles.status}>
								<ActivityIndicator color={theme.accent} />
								<Text style={[filterStyles.statusText, { color: theme.muted }]}>Chargement des {activeTab.noun}s…</Text>
							</View>
						) : (
							renderStatus(`Impossible de charger les ${activeTab.noun}s.`, { label: "Réessayer", onPress: () => void onLoadFilterOptions() })
						)}
					</View>
				) : tab === "rooms" ? (
					<SectionList
						key="rooms"
						style={filterStyles.list}
						contentContainerStyle={filterStyles.listContent}
						sections={roomSections}
						keyExtractor={(room) => String(room.id)}
						extraData={draftRoomIds}
						stickySectionHeadersEnabled
						keyboardShouldPersistTaps="handled"
						keyboardDismissMode="on-drag"
						initialNumToRender={20}
						windowSize={9}
						ListEmptyComponent={renderStatus(`Aucune salle pour « ${roomSearch.trim()} ».`)}
						renderSectionHeader={({ section }) => {
							if (roomSections.length < 2 && section.title === OTHER_ROOMS) return null;
							const selectedCount = section.rooms.filter((room) => draftRoomIds.has(String(room.id))).length;
							const Chevron = section.collapsed ? CaretRight : CaretDown;
							return (
								<Pressable
									style={[filterStyles.sectionHeader, { backgroundColor: theme.bg }]}
									onPress={() => toggleCampus(section.title)}
									disabled={Boolean(roomSearch.trim())}
									accessibilityRole="button"
									accessibilityState={{ expanded: !section.collapsed }}
									accessibilityLabel={`${section.title}, ${section.total} salle${section.total > 1 ? "s" : ""}${selectedCount ? `, ${selectedCount} sélectionnée${selectedCount > 1 ? "s" : ""}` : ""}`}>
									<Chevron color={theme.muted} size={18} weight="bold" />
									<Text style={[filterStyles.sectionTitle, { color: theme.text }]} numberOfLines={1}>
										{section.title}
									</Text>
									{selectedCount ? (
										<View style={filterStyles.sectionSelectedRow}>
											<Check color={theme.accent} size={14} weight="bold" />
											<Text style={[filterStyles.sectionSelected, { color: theme.accent }]}>{selectedCount}</Text>
										</View>
									) : null}
									<Text style={[filterStyles.sectionCount, { color: theme.muted }]}>{section.total}</Text>
								</Pressable>
							);
						}}
						renderItem={({ item: room }) => (
							<FilterOption label={room.name || `Salle #${room.id}`} selected={draftRoomIds.has(String(room.id))} onPress={() => toggle("rooms", room.id)} />
						)}
					/>
				) : (
					<FlatList
						key="teachers"
						style={filterStyles.list}
						contentContainerStyle={filterStyles.listContent}
						data={visibleTeachers}
						keyExtractor={(teacher) => String(teacher.id)}
						extraData={draftTeacherIds}
						keyboardShouldPersistTaps="handled"
						keyboardDismissMode="on-drag"
						initialNumToRender={20}
						windowSize={9}
						ListEmptyComponent={renderStatus(`Aucun enseignant pour « ${teacherSearch.trim()} ».`)}
						renderItem={({ item: teacher }) => (
							<FilterOption label={teacherLabel(teacher)} selected={draftTeacherIds.has(String(teacher.id))} onPress={() => toggle("teachers", teacher.id)} />
						)}
					/>
				)}

				<View style={[filterStyles.footer, { backgroundColor: theme.bg, borderTopColor: theme.border, paddingBottom: Math.max(insets.bottom, 16) }]}>
					{totalSelected ? (
						<View style={filterStyles.selectionRow}>
							<ScrollView horizontal showsHorizontalScrollIndicator={false} style={filterStyles.chipScroll} contentContainerStyle={filterStyles.chips} keyboardShouldPersistTaps="handled">
								{activeSelections.map((selection) => {
									const Icon = FILTER_ICONS[selection.type];
									return (
										<Pressable
											key={`${selection.type}-${selection.id}`}
											style={[filterStyles.chip, { backgroundColor: theme.accentSoft }]}
											onPress={() => toggle(selection.type, selection.id)}
											accessibilityRole="button"
											accessibilityLabel={`Retirer ${selection.label}`}>
											<Icon color={theme.accent} size={14} weight="bold" />
											<Text style={[filterStyles.chipText, { color: theme.text }]} numberOfLines={1}>
												{selection.label}
											</Text>
											<X color={theme.muted} size={14} />
										</Pressable>
									);
								})}
							</ScrollView>
							<Pressable onPress={() => setDraft({ groups: [], rooms: [], teachers: [] })} hitSlop={8} style={filterStyles.clearAll} accessibilityRole="button" accessibilityLabel="Retirer tous les filtres">
								<Text style={[filterStyles.clearAllText, { color: theme.muted }]}>Tout retirer</Text>
							</Pressable>
						</View>
					) : null}
					<Pressable
						style={[s.groupModalApply, { backgroundColor: canApply ? theme.accent : theme.surface, borderWidth: canApply ? 0 : 1, borderColor: theme.border }]}
						disabled={!canApply}
						accessibilityState={{ disabled: !canApply }}
						onPress={() => {
							onApply(draft);
							onClose();
						}}>
						<Check color={canApply ? onAccent : theme.muted} size={18} />
						<Text style={[s.primaryText, { color: canApply ? onAccent : theme.muted }]}>
							{totalSelected ? `Appliquer ${totalSelected} filtre${totalSelected > 1 ? "s" : ""}` : hadFilters ? "Retirer tous les filtres" : "Coche au moins un filtre"}
						</Text>
					</Pressable>
				</View>
			</View>
		</Modal>
	);
}

export function FilterOption({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
	const { theme } = useTheme();
	return (
		<Pressable
			style={[filterStyles.option, { backgroundColor: theme.surface, borderColor: selected ? theme.accent : theme.border }]}
			onPress={onPress}
			accessibilityRole="checkbox"
			accessibilityState={{ checked: selected }}>
			<View style={[filterStyles.optionCheck, { backgroundColor: selected ? theme.accent : "transparent", borderColor: selected ? theme.accent : theme.border }]}>
				{selected ? <Check color={theme.onAccent} size={14} weight="bold" /> : null}
			</View>
			<Text style={[filterStyles.optionText, { color: theme.text }]} numberOfLines={1}>
				{label}
			</Text>
		</Pressable>
	);
}

type RoomFilterId = string | number;

type RoomFilterItem = { id: RoomFilterId; name: string };

const normalizeRoomText = (value: unknown) =>
	String(value ?? "")
		.trim()
		.toLowerCase();

const uniqRoomItems = (items: RoomFilterItem[]) => Array.from(new Map(items.map((item) => [String(item.id), item])).values());

const getRawRoomLocationId = (room: Room) => {
	const raw = room as any;
	return raw.location?.id ?? raw.location_id ?? raw.id_location ?? raw.idLocation ?? raw.locationId ?? raw.campus?.id ?? raw.site?.id ?? null;
};

const getRawRoomTypeId = (room: Room) => {
	const raw = room as any;
	return raw.roomType?.id ?? raw.room_type?.id ?? raw.id_room_type ?? raw.idRoomType ?? raw.roomTypeId ?? raw.typeId ?? raw.type?.id ?? null;
};

const cleanRoomTypeLabel = (value: unknown) => {
	const cleaned = String(value ?? "")
		.replace("RoomType.", "")
		.replace(/_/g, " ")
		.trim();
	return cleaned || "Type inconnu";
};

const getRoomTypeLabelFromRoom = (room: Room, roomTypes: RoomFilterItem[] = []) => {
	const raw = room as any;
	const roomTypeId = getRawRoomTypeId(room);
	const fromList = roomTypeId !== null ? roomTypes.find((type) => String(type.id) === String(roomTypeId))?.name : "";
	return fromList || cleanRoomTypeLabel(raw.roomType?.type || raw.room_type?.type || raw.type?.type || raw.type || raw.roomTypeName || raw.typeName);
};

const getRoomLocationLabelFromRoom = (room: Room, locations: RoomFilterItem[] = []) => {
	const raw = room as any;
	const locationId = getRawRoomLocationId(room);
	const fromList = locationId !== null ? locations.find((location) => String(location.id) === String(locationId))?.name : "";
	const direct = [
		raw.location?.name,
		raw.locationName,
		raw.location_label,
		raw.locationLabel,
		raw.campus?.name,
		raw.campusName,
		raw.site?.name,
		raw.siteName,
		raw.building?.name,
		raw.building,
	]
		.filter((value) => typeof value === "string" && value.trim())
		.join(" · ");
	if (fromList || direct) return fromList || direct;

	const haystack = normalizeRoomText([room.name, raw.code, raw.path, raw.fullName].filter(Boolean).join(" "));
	const guessed = locations.find((location) => haystack.includes(normalizeRoomText(location.name)));
	return guessed?.name || "Campus inconnu";
};

const roomMatchesLocation = (room: Room, selectedLocations: RoomFilterId[], locations: RoomFilterItem[]) => {
	if (!selectedLocations.length) return true;
	const raw = room as any;
	const locationId = getRawRoomLocationId(room);
	if (locationId !== null && selectedLocations.some((id) => String(id) === String(locationId))) return true;

	const locationLabel = getRoomLocationLabelFromRoom(room, locations);
	const haystack = normalizeRoomText(
		[room.name, raw.code, raw.location?.name, raw.locationName, raw.location, raw.campusName, raw.siteName, raw.building, locationLabel].filter(Boolean).join(" ")
	);
	return selectedLocations.some((id) => {
		const item = locations.find((location) => String(location.id) === String(id));
		return item ? haystack.includes(normalizeRoomText(item.name)) : false;
	});
};

const roomMatchesType = (room: Room, selectedRoomTypes: RoomFilterId[], roomTypes: RoomFilterItem[]) => {
	if (!selectedRoomTypes.length) return true;
	const raw = room as any;
	const roomTypeId = getRawRoomTypeId(room);
	if (roomTypeId !== null && selectedRoomTypes.some((id) => String(id) === String(roomTypeId))) return true;

	const typeLabel = getRoomTypeLabelFromRoom(room, roomTypes);
	const haystack = normalizeRoomText([raw.roomType?.type, raw.room_type?.type, raw.type?.type, raw.type, raw.roomTypeName, raw.typeName, typeLabel].filter(Boolean).join(" "));
	return selectedRoomTypes.some((id) => {
		const item = roomTypes.find((type) => String(type.id) === String(id));
		return item ? haystack.includes(normalizeRoomText(item.name)) : false;
	});
};

const toggleRoomFilterValue = (values: RoomFilterId[], value: RoomFilterId) => {
	const exists = values.some((item) => String(item) === String(value));
	return exists ? values.filter((item) => String(item) !== String(value)) : [...values, value];
};

export function RoomFinderModal({
	visible,
	selectedGroups,
	onApplyRoom,
	onClose,
}: {
	visible: boolean;
	selectedGroups: (string | number)[];
	onApplyRoom: (room: Room) => void;
	onClose: () => void;
}) {
	const { theme } = useTheme();
	const [duration, setDuration] = useState(60);
	const [capacity, setCapacity] = useState("");
	const [roomSearch, setRoomSearch] = useState("");
	const [selectedLocations, setSelectedLocations] = useState<RoomFilterId[]>([]);
	const [selectedRoomTypes, setSelectedRoomTypes] = useState<RoomFilterId[]>([]);
	const [rooms, setRooms] = useState<Room[]>([]);
	const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
	const [locations, setLocations] = useState<RoomFilterItem[]>([]);
	const [results, setResults] = useState<Room[]>([]);
	const [loading, setLoading] = useState(false);
	const [bootLoading, setBootLoading] = useState(false);
	const [searched, setSearched] = useState(false);
	const [error, setError] = useState("");

	useEffect(() => {
		if (!visible) return;
		setBootLoading(true);
		setError("");
		Promise.all([getRooms(), getRoomTypes(), getLocations()])
			.then(([roomsData, roomTypesData, locationsData]) => {
				setRooms((roomsData || []).sort((a, b) => a.name.localeCompare(b.name, "fr")));
				setRoomTypes(roomTypesData || []);
				setLocations(flattenLocations(locationsData || []));
			})
			.catch((err) => setError(err?.message || "Impossible de charger les salles."))
			.finally(() => setBootLoading(false));
	}, [visible]);

	const roomTypeItems = useMemo(() => uniqRoomItems(roomTypes.map((type) => ({ id: type.id, name: cleanRoomTypeLabel(type.type) }))), [roomTypes]);

	const selectedLocationLabel = useMemo(() => {
		if (!selectedLocations.length) return "Tous les campus";
		if (selectedLocations.length === 1) return locations.find((location) => String(location.id) === String(selectedLocations[0]))?.name || "1 campus";
		return `${selectedLocations.length} campus`;
	}, [locations, selectedLocations]);

	const selectedRoomTypeLabel = useMemo(() => {
		if (!selectedRoomTypes.length) return "Tous les types";
		if (selectedRoomTypes.length === 1) return roomTypeItems.find((type) => String(type.id) === String(selectedRoomTypes[0]))?.name || "1 type";
		return `${selectedRoomTypes.length} types`;
	}, [roomTypeItems, selectedRoomTypes]);

	const activeFiltersCount = selectedLocations.length + selectedRoomTypes.length + (capacity.trim() ? 1 : 0) + (roomSearch.trim() ? 1 : 0);

	const clearFilters = () => {
		setDuration(60);
		setCapacity("");
		setRoomSearch("");
		setSelectedLocations([]);
		setSelectedRoomTypes([]);
		setResults([]);
		setSearched(false);
		setError("");
	};

	const search = async () => {
		setLoading(true);
		setError("");
		setSearched(false);
		try {
			const start = new Date();
			const end = new Date(start.getTime() + Math.max(5, duration) * 60_000);
			const locationFilters = selectedLocations.length ? selectedLocations : [null];
			const typeFilters = selectedRoomTypes.length ? selectedRoomTypes : [null];
			const requests = locationFilters.flatMap((locationId) =>
				typeFilters.map((roomTypeId) => {
					const payload: Parameters<typeof getAvailableRooms>[0] = {
						startDate: start.toISOString(),
						endDate: end.toISOString(),
						groups: selectedGroups.map(Number).filter(Number.isFinite),
					};
					if (locationId !== null) {
						const numericLocation = Number(locationId);
						if (Number.isFinite(numericLocation)) payload.location = numericLocation;
					}
					if (roomTypeId !== null) {
						const numericRoomType = Number(roomTypeId);
						if (Number.isFinite(numericRoomType)) payload.roomType = numericRoomType;
					}
					if (capacity.trim()) payload.capacity = Number(capacity);
					return getAvailableRooms(payload);
				})
			);

			const responses = await Promise.all(requests);
			const merged = new Map<string, Room>();
			responses.flat().forEach((room) => {
				if (!room) return;
				merged.set(String(room.id || room.name), room);
			});
			setResults([...merged.values()].sort((a, b) => a.name.localeCompare(b.name, "fr")));
			setSearched(true);
		} catch (err: any) {
			setError(err?.message || "Recherche impossible.");
		} finally {
			setLoading(false);
		}
	};

	const visibleRooms = useMemo(() => {
		const term = roomSearch.trim().toLowerCase();
		const minCapacity = capacity.trim() ? Number(capacity) : null;
		const source = searched ? results : rooms;
		return source
			.filter((room) => {
				const raw = room as any;
				const locationLabel = getRoomLocationLabelFromRoom(room, locations);
				const typeLabel = getRoomTypeLabelFromRoom(room, roomTypeItems);
				const haystack = [room.name, raw.code, raw.path, raw.fullName, locationLabel, typeLabel].filter(Boolean).join(" ").toLowerCase();
				const capacityOk = !minCapacity || (Number(room.capacity) || 0) >= minCapacity;
				return (
					(!term || haystack.includes(term)) &&
					capacityOk &&
					roomMatchesLocation(room, selectedLocations, locations) &&
					roomMatchesType(room, selectedRoomTypes, roomTypeItems)
				);
			})
			.slice(0, searched ? 100 : 60);
	}, [capacity, locations, roomSearch, rooms, results, roomTypeItems, searched, selectedLocations, selectedRoomTypes]);

	const resultTitle = searched ? `${visibleRooms.length} salle${visibleRooms.length > 1 ? "s" : ""} libre${visibleRooms.length > 1 ? "s" : ""}` : "Annuaire des salles";
	const resultSubtitle = searched
		? `Disponibles pendant ${duration} min · ${selectedLocationLabel} · ${selectedRoomTypeLabel}${capacity ? ` · ${capacity}+ places` : ""}`
		: `${visibleRooms.length}/${rooms.length || 0} salles affichées · filtres instantanés`;

	return (
		<Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
			<View style={[s.modalRoot, { backgroundColor: theme.bg }]}>
				<ModalHeader title="Trouver une salle" onClose={onClose} />

				<ScrollView contentContainerStyle={s.roomFinderScroll} showsVerticalScrollIndicator={false}>
					<Animated.View entering={FadeInDown.duration(280)} style={[s.roomHeroCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
						<View pointerEvents="none" style={[s.roomHeroGlow, { backgroundColor: theme.accentSoft }]} />
						<View style={s.roomHeroTop}>
							<View style={[s.roomHeroIcon, { backgroundColor: theme.accent }]}>
								<DoorOpen color={theme.onAccent} size={23} />
							</View>
							<View style={s.roomHeroCopy}>
								<Text style={[s.roomHeroEyebrow, { color: theme.accent }]}>Recherche</Text>
								<Text style={[s.roomHeroTitle, { color: theme.text }]}>Salle libre, annuaire et carte</Text>
							</View>
						</View>
						<Text style={[s.roomHeroText, { color: theme.muted }]}>
							Les campus, types, capacité et texte filtrent l’annuaire immédiatement. Le bouton chercher vérifie ensuite les disponibilités réelles.
						</Text>

						<View style={s.roomHeroStats}>
							<View style={[s.roomHeroStat, { backgroundColor: theme.surfaceSoft }]}>
								<Clock color={theme.accent} size={16} />
								<Text style={[s.roomHeroStatText, { color: theme.text }]}>{duration} min</Text>
							</View>
							<View style={[s.roomHeroStat, { backgroundColor: theme.surfaceSoft }]}>
								<MapPin color={theme.accent} size={16} />
								<Text style={[s.roomHeroStatText, { color: theme.text }]} numberOfLines={1}>
									{selectedLocationLabel}
								</Text>
							</View>
							<View style={[s.roomHeroStat, { backgroundColor: theme.surfaceSoft }]}>
								<Stack color={theme.accent} size={16} />
								<Text style={[s.roomHeroStatText, { color: theme.text }]} numberOfLines={1}>
									{selectedRoomTypeLabel}
								</Text>
							</View>
						</View>
					</Animated.View>

					<Animated.View entering={FadeInDown.delay(50).duration(280)} style={[s.roomSearchCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
						<View style={[s.roomSearchBox, { backgroundColor: theme.surfaceSoft, borderColor: theme.border }]}>
							<MagnifyingGlass color={theme.muted} size={18} />
							<TextInput
								value={roomSearch}
								onChangeText={setRoomSearch}
								placeholder="Nom de salle, bâtiment, campus..."
								placeholderTextColor={theme.muted}
								style={[s.roomSearchInput, { color: theme.text }]}
								autoCorrect={false}
							/>
							{roomSearch ? (
								<Pressable onPress={() => setRoomSearch("")} hitSlop={10}>
									<X color={theme.muted} size={18} />
								</Pressable>
							) : null}
						</View>

						<View style={s.roomDurationHead}>
							<View style={s.roomSectionTitleWrap}>
								<SlidersHorizontal color={theme.accent} size={18} />
								<Text style={[s.roomSectionTitle, { color: theme.text }]}>Disponibilité</Text>
							</View>
							<Pressable style={[s.roomResetBtn, { borderColor: theme.border }]} onPress={clearFilters}>
								<ArrowCounterClockwise color={theme.muted} size={15} />
								<Text style={[s.roomResetText, { color: theme.muted }]}>{activeFiltersCount ? `${activeFiltersCount} filtre(s)` : "Reset"}</Text>
							</Pressable>
						</View>

						<View style={s.durationGrid}>
							{[30, 60, 90, 120].map((value) => {
								const active = duration === value;
								return (
									<Pressable
										key={value}
										style={[
											s.durationPreset,
											{ backgroundColor: active ? theme.accent : theme.surfaceSoft, borderColor: active ? theme.accent : theme.border },
										]}
										onPress={() => setDuration(value)}>
										<Text style={[s.durationPresetText, { color: active ? theme.onAccent : theme.text }]}>{value} min</Text>
									</Pressable>
								);
							})}
						</View>

						<View style={s.roomInlineFields}>
							<View style={[s.capacityField, { backgroundColor: theme.surfaceSoft, borderColor: theme.border }]}>
								<Users color={theme.muted} size={17} />
								<TextInput
									keyboardType="number-pad"
									value={capacity}
									onChangeText={setCapacity}
									placeholder="Places min."
									placeholderTextColor={theme.muted}
									style={[s.capacityInput, { color: theme.text }]}
								/>
							</View>
							<Pressable style={[s.searchRoomBtn, { backgroundColor: theme.accent }]} onPress={search} disabled={loading}>
								{loading ? <ActivityIndicator color={theme.onAccent} /> : <MagnifyingGlass color={theme.onAccent} size={18} />}
								<Text style={[s.searchRoomText, { color: theme.onAccent }]}>Chercher</Text>
							</Pressable>
						</View>
					</Animated.View>

					<RoomCheckboxFilter
						title="Campus"
						items={locations}
						selected={selectedLocations}
						onToggle={(id) => setSelectedLocations((values) => toggleRoomFilterValue(values, id))}
						onClear={() => setSelectedLocations([])}
					/>
					<RoomCheckboxFilter
						title="Type de salle"
						items={roomTypeItems}
						selected={selectedRoomTypes}
						onToggle={(id) => setSelectedRoomTypes((values) => toggleRoomFilterValue(values, id))}
						onClear={() => setSelectedRoomTypes([])}
					/>

					{bootLoading ? (
						<View style={[s.roomLoadingCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
							<ActivityIndicator color={theme.accent} />
							<Text style={[s.roomLoadingText, { color: theme.muted }]}>Chargement des salles...</Text>
						</View>
					) : null}

					{error ? <Text style={[s.error, { color: theme.warn }]}>{error}</Text> : null}

					<View style={s.roomResultHeader}>
						<View style={s.roomResultHeaderCopy}>
							<Text style={[s.roomResultTitle, { color: theme.text }]}>{resultTitle}</Text>
							<Text style={[s.roomResultSub, { color: theme.muted }]} numberOfLines={2}>
								{resultSubtitle}
							</Text>
						</View>
						{searched ? (
							<View style={[s.roomResultBadge, { backgroundColor: theme.accentSoft }]}>
								<Check color={theme.accent} size={15} />
								<Text style={[s.roomResultBadgeText, { color: theme.accent }]}>Libre</Text>
							</View>
						) : null}
					</View>

					{visibleRooms.length === 0 && !bootLoading ? (
						<View style={[s.noRoomCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
							<DoorOpen color={theme.accent} size={26} />
							<Text style={[s.noRoomTitle, { color: theme.text }]}>Aucune salle trouvée</Text>
							<Text style={[s.noRoomText, { color: theme.muted }]}>Essaie d’enlever un campus, un type de salle ou de baisser la capacité.</Text>
						</View>
					) : null}

					{visibleRooms.map((room, index) => (
						<RoomResultCard
							key={`${room.id || room.name}-${index}`}
							room={room}
							index={index}
							locations={locations}
							roomTypes={roomTypeItems}
							onApplyRoom={onApplyRoom}
						/>
					))}
				</ScrollView>
			</View>
		</Modal>
	);
}

function RoomCheckboxFilter({
	title,
	items,
	selected,
	onToggle,
	onClear,
}: {
	title: string;
	items: RoomFilterItem[];
	selected: RoomFilterId[];
	onToggle: (id: RoomFilterId) => void;
	onClear: () => void;
}) {
	const { theme } = useTheme();
	if (!items.length) return null;
	return (
		<Animated.View entering={FadeInDown.delay(80).duration(260)} style={[s.roomFilterCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
			<View style={s.roomFilterHeader}>
				<View>
					<Text style={[s.roomFilterTitle, { color: theme.text }]}>{title}</Text>
					<Text style={[s.roomFilterCount, { color: theme.muted }]}>{selected.length ? `${selected.length} sélectionné(s)` : "Tout afficher"}</Text>
				</View>
				{selected.length ? (
					<Pressable style={[s.roomFilterClearBtn, { borderColor: theme.border }]} onPress={onClear}>
						<X color={theme.muted} size={14} />
						<Text style={[s.roomFilterClearText, { color: theme.muted }]}>Effacer</Text>
					</Pressable>
				) : null}
			</View>

			<View style={s.roomCheckboxGrid}>
				{items.slice(0, 60).map((item) => {
					const active = selected.some((id) => String(id) === String(item.id));
					return (
						<Pressable
							key={String(item.id)}
							style={[s.roomCheckboxItem, { backgroundColor: active ? theme.accentSoft : theme.surfaceSoft, borderColor: active ? theme.accent : theme.border }]}
							onPress={() => onToggle(item.id)}>
							<View style={[s.roomCheckboxBox, { backgroundColor: active ? theme.accent : "transparent", borderColor: active ? theme.accent : theme.border }]}>
								{active ? <Check color={theme.onAccent} size={13} /> : null}
							</View>
							<Text style={[s.roomCheckboxText, { color: active ? theme.text : theme.muted }]} numberOfLines={1}>
								{item.name}
							</Text>
						</Pressable>
					);
				})}
			</View>
		</Animated.View>
	);
}

function RoomResultCard({
	room,
	index,
	locations,
	roomTypes,
	onApplyRoom,
}: {
	room: Room;
	index: number;
	locations: RoomFilterItem[];
	roomTypes: RoomFilterItem[];
	onApplyRoom: (room: Room) => void;
}) {
	const { theme } = useTheme();
	const name = room.name || `Salle #${room.id}`;
	const locationLabel = getRoomLocationLabelFromRoom(room, locations);
	const typeLabel = getRoomTypeLabelFromRoom(room, roomTypes);
	const capacityLabel = room.capacity ? `${room.capacity} places` : "Capacité inconnue";

	return (
		<Animated.View entering={FadeInDown.delay(Math.min(index, 14) * 25).duration(260)} layout={LinearTransition.springify()}>
			<View style={[s.roomResultCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
				<View style={[s.roomResultIcon, { backgroundColor: theme.accentSoft }]}>
					<DoorOpen color={theme.accent} size={20} />
				</View>

				<View style={s.roomResultContent}>
					<View style={s.roomResultTopLine}>
						<Text style={[s.roomName, { color: theme.text }]} numberOfLines={1}>
							{name}
						</Text>
						<View style={[s.roomCapacityBadge, { backgroundColor: theme.surfaceSoft }]}>
							<Users color={theme.muted} size={13} />
							<Text style={[s.roomCapacityText, { color: theme.muted }]}>{capacityLabel}</Text>
						</View>
					</View>

					<View style={s.roomMetaTags}>
						<View style={[s.roomMetaTag, { backgroundColor: theme.surfaceSoft }]}>
							<MapPin color={theme.accent} size={13} />
							<Text style={[s.roomMetaTagText, { color: theme.text }]} numberOfLines={1}>
								{locationLabel}
							</Text>
						</View>
						<View style={[s.roomMetaTag, { backgroundColor: theme.surfaceSoft }]}>
							<Stack color={theme.accent} size={13} />
							<Text style={[s.roomMetaTagText, { color: theme.text }]} numberOfLines={1}>
								{typeLabel}
							</Text>
						</View>
					</View>

					<View style={s.roomActions}>
						<Pressable style={[s.roomMapAction, { backgroundColor: theme.surfaceSoft, borderColor: theme.border }]} onPress={() => openUrl(getRoomMapUrl(name))}>
							<NavigationArrow color={theme.accent} size={16} />
							<Text style={[s.roomMapActionText, { color: theme.text }]}>Carte</Text>
						</Pressable>

						<Pressable style={[s.roomApplyAction, { backgroundColor: theme.accent }]} onPress={() => onApplyRoom(room)}>
							<Funnel color={theme.onAccent} size={16} />
							<Text style={[s.roomApplyText, { color: theme.onAccent }]}>Voir l'agenda</Text>
						</Pressable>
					</View>
				</View>
			</View>
		</Animated.View>
	);
}

export function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
	const { theme } = useTheme();
	const insets = useSafeAreaInsets();
	return (
		<View style={[s.modalHeader, { borderBottomColor: theme.border, paddingTop: Math.max(insets.top, 18) }]}>
			<Text style={[s.modalTitle, { color: theme.text }]}>{title}</Text>
			<Pressable style={[s.iconBtn, { borderColor: theme.border }]} onPress={onClose}>
				<X color={theme.text} size={20} />
			</Pressable>
		</View>
	);
}

export const filterStyles = StyleSheet.create({
	// Same look as the Jour / Semaine switch (calendarStyles segment).
	tabs: { marginHorizontal: 16, marginTop: 14, padding: 3, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, flexDirection: "row" },
	tab: { flex: 1, minHeight: 44, borderRadius: 11, paddingHorizontal: 6, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
	tabText: { flexShrink: 1, fontSize: 14, fontWeight: "900" },
	tabCount: { fontSize: 13, fontWeight: "900", fontVariant: ["tabular-nums"] },
	searchBox: { marginHorizontal: 16, marginTop: 10, marginBottom: 2, borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 8 },
	list: { flex: 1 },
	listContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24, gap: 8 },
	status: { paddingVertical: 32, alignItems: "center", gap: 12 },
	statusText: { fontSize: 14, fontWeight: "700", textAlign: "center", lineHeight: 20 },
	statusAction: { minHeight: 40, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 6 },
	statusActionText: { fontSize: 14, fontWeight: "800" },
	limitNote: { marginTop: 6, fontSize: 13, lineHeight: 18, textAlign: "center" },
	sectionHeader: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8 },
	sectionTitle: { flex: 1, fontSize: 15, fontWeight: "900" },
	sectionSelectedRow: { flexDirection: "row", alignItems: "center", gap: 3 },
	sectionSelected: { fontSize: 13, fontWeight: "900", fontVariant: ["tabular-nums"] },
	sectionCount: { fontSize: 13, fontWeight: "700", fontVariant: ["tabular-nums"] },
	option: { minHeight: 50, borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 10 },
	optionCheck: { width: 22, height: 22, borderRadius: 6, borderWidth: 1, alignItems: "center", justifyContent: "center" },
	optionText: { flex: 1, fontWeight: "800" },
	footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, paddingTop: 12, gap: 12 },
	selectionRow: { flexDirection: "row", alignItems: "center", gap: 10 },
	chipScroll: { flex: 1 },
	chips: { gap: 6, paddingRight: 4 },
	chip: { maxWidth: 220, minHeight: 36, borderRadius: 18, paddingLeft: 10, paddingRight: 9, flexDirection: "row", alignItems: "center", gap: 6 },
	chipText: { flexShrink: 1, fontSize: 13, fontWeight: "700" },
	clearAll: { minHeight: 36, justifyContent: "center" },
	clearAllText: { fontSize: 13, fontWeight: "800", textDecorationLine: "underline" },
});
