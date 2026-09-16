import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Animated, { FadeInDown, Layout } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Check, ChevronDown, Clock, DoorOpen, Filter, Layers, MapPin, Navigation, RotateCcw, Search, SlidersHorizontal, Users, X } from "lucide-react-native";
import { useTheme } from "../../context/ThemeContext";
import { getAvailableRooms, getLocations, getRooms, getRoomTypes } from "../../services/api";
import { Group, LocationNode, Room, RoomType, Teacher } from "../../types";
import type { GroupTreeNode } from "../../utils/groups";
import GroupTreeList from "../GroupTreeList";
import { openUrl } from "../../utils/calendar";
import { getRoomMapUrl } from "../../utils/rooms";
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
					<Search color={theme.muted} size={18} />
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
						<Check color="#fff" size={18} />
						<Text style={s.primaryText}>
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

const sameId = (first: FilterSelectionId, second: FilterSelectionId) => String(first) === String(second);
const toggleSelectionId = (items: FilterSelectionId[], id: FilterSelectionId) => (items.some((item) => sameId(item, id)) ? items.filter((item) => !sameId(item, id)) : [...items, id]);
const normalizeFilterSearch = (value: string) =>
	value
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLocaleLowerCase("fr-FR")
		.trim();
const matchesFilterSearch = (value: string, search: string) => {
	const terms = normalizeFilterSearch(search).split(/\s+/).filter(Boolean);
	const normalizedValue = normalizeFilterSearch(value);
	return terms.every((term) => normalizedValue.includes(term));
};
const teacherLabel = (teacher: Teacher) => `${teacher.firstname || ""} ${teacher.name || ""}`.trim() || `Enseignant #${teacher.id}`;

function FilterAccordion({ title, count, expanded, onToggle, children }: { title: string; count: number; expanded: boolean; onToggle: () => void; children: React.ReactNode }) {
	const { theme } = useTheme();
	return (
		<View style={[filterStyles.accordion, { backgroundColor: theme.surface, borderColor: theme.border }]}>
			<Pressable style={filterStyles.accordionHead} onPress={onToggle} accessibilityRole="button" accessibilityState={{ expanded }}>
				<View style={filterStyles.accordionTitleRow}>
					<Text style={[filterStyles.accordionTitle, { color: theme.text }]}>{title}</Text>
					{count ? <Text style={[filterStyles.accordionCount, { color: theme.accent, backgroundColor: theme.accentSoft }]}>{count}</Text> : null}
				</View>
				<ChevronDown color={theme.muted} size={20} style={{ transform: [{ rotate: expanded ? "0deg" : "-90deg" }] }} />
			</Pressable>
			{expanded ? <View style={filterStyles.accordionContent}>{children}</View> : null}
		</View>
	);
}

export function FiltersModal({
	visible,
	groups,
	allGroups,
	rooms,
	teachers,
	selectedGroups,
	selectedRooms,
	selectedTeachers,
	groupSearch,
	onGroupSearch,
	onApply,
	onClose,
}: {
	visible: boolean;
	groups: GroupTreeNode[];
	allGroups: Group[];
	rooms: Room[];
	teachers: Teacher[];
	selectedGroups: FilterSelectionId[];
	selectedRooms: FilterSelectionId[];
	selectedTeachers: FilterSelectionId[];
	groupSearch: string;
	onGroupSearch: (value: string) => void;
	onApply: (filters: FilterSelection) => void;
	onClose: () => void;
}) {
	const { theme } = useTheme();
	const insets = useSafeAreaInsets();
	const [draft, setDraft] = useState<FilterSelection>({ groups: selectedGroups, rooms: selectedRooms, teachers: selectedTeachers });
	const [roomSearch, setRoomSearch] = useState("");
	const [teacherSearch, setTeacherSearch] = useState("");
	const [expanded, setExpanded] = useState({ groups: true, rooms: false, teachers: false });

	useEffect(() => {
		if (!visible) return;
		setDraft({ groups: selectedGroups, rooms: selectedRooms, teachers: selectedTeachers });
		setRoomSearch("");
		setTeacherSearch("");
		setExpanded({ groups: true, rooms: false, teachers: false });
	}, [selectedGroups, selectedRooms, selectedTeachers, visible]);

	const groupNames = useMemo(() => new Map(allGroups.map((group) => [String(group.id), group.name])), [allGroups]);
	const visibleRooms = useMemo(() => rooms.filter((room) => matchesFilterSearch(room.name || "", roomSearch)).slice(0, 60), [roomSearch, rooms]);
	const visibleTeachers = useMemo(() => teachers.filter((teacher) => matchesFilterSearch(teacherLabel(teacher), teacherSearch)).slice(0, 60), [teacherSearch, teachers]);
	const activeSelections = useMemo(
		() => [
			...draft.groups.map((id) => ({ id, type: "groups" as const, label: `Groupe · ${groupNames.get(String(id)) || id}` })),
			...draft.rooms.map((id) => ({ id, type: "rooms" as const, label: `Salle · ${rooms.find((room) => sameId(room.id, id))?.name || id}` })),
			...draft.teachers.map((id) => ({ id, type: "teachers" as const, label: `Enseignant · ${teacherLabel(teachers.find((teacher) => sameId(teacher.id, id)) || { id })}` })),
		],
		[draft, groupNames, rooms, teachers]
	);
	const totalSelected = activeSelections.length;
	const toggle = (type: keyof FilterSelection, id: FilterSelectionId) => setDraft((current) => ({ ...current, [type]: toggleSelectionId(current[type], id) }));

	return (
		<Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
			<View style={[s.modalRoot, { backgroundColor: theme.bg }]}>
				<ModalHeader title="Mes filtres" onClose={onClose} />
				<ScrollView contentContainerStyle={filterStyles.filtersBody} keyboardShouldPersistTaps="handled">
					<View style={[filterStyles.activeCard, { backgroundColor: theme.accentSoft, borderColor: theme.border }]}>
						<Text style={[filterStyles.activeTitle, { color: theme.text }]}>Sélections actives</Text>
						<Text style={[filterStyles.activeSubtitle, { color: theme.muted }]}>Retire un filtre ici sans avoir à le rechercher.</Text>
						{activeSelections.length ? (
							<View style={filterStyles.activeChips}>
								{activeSelections.map((selection) => (
									<Pressable key={`${selection.type}-${selection.id}`} style={[filterStyles.activeChip, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={() => toggle(selection.type, selection.id)}>
										<Text style={[filterStyles.activeChipText, { color: theme.text }]} numberOfLines={1}>
											{selection.label}
										</Text>
										<X color={theme.muted} size={14} />
									</Pressable>
								))}
							</View>
						) : (
							<Text style={[filterStyles.emptySelection, { color: theme.muted }]}>Aucun filtre sélectionné</Text>
						)}
					</View>

					<FilterAccordion title="Groupes" count={draft.groups.length} expanded={expanded.groups} onToggle={() => setExpanded((current) => ({ ...current, groups: !current.groups }))}>
						<View style={[s.searchBox, { backgroundColor: theme.surfaceSoft, borderColor: theme.border }]}>
							<Search color={theme.muted} size={18} />
							<TextInput value={groupSearch} onChangeText={onGroupSearch} placeholder="Rechercher un groupe" placeholderTextColor={theme.muted} style={[s.searchInput, { color: theme.text }]} />
						</View>
						<GroupTreeList groups={groups} selected={draft.groups} onToggle={(id) => toggle("groups", id)} searchActive={Boolean(groupSearch.trim())} />
					</FilterAccordion>

					<FilterAccordion title="Salles" count={draft.rooms.length} expanded={expanded.rooms} onToggle={() => setExpanded((current) => ({ ...current, rooms: !current.rooms }))}>
						<View style={[s.searchBox, { backgroundColor: theme.surfaceSoft, borderColor: theme.border }]}>
							<Search color={theme.muted} size={18} />
							<TextInput value={roomSearch} onChangeText={setRoomSearch} placeholder="Rechercher une salle" placeholderTextColor={theme.muted} style={[s.searchInput, { color: theme.text }]} />
						</View>
						{visibleRooms.map((room) => (
							<FilterOption key={String(room.id)} label={room.name} selected={draft.rooms.some((id) => sameId(id, room.id))} onPress={() => toggle("rooms", room.id)} />
						))}
					</FilterAccordion>

					<FilterAccordion title="Enseignants" count={draft.teachers.length} expanded={expanded.teachers} onToggle={() => setExpanded((current) => ({ ...current, teachers: !current.teachers }))}>
						<View style={[s.searchBox, { backgroundColor: theme.surfaceSoft, borderColor: theme.border }]}>
							<Search color={theme.muted} size={18} />
							<TextInput value={teacherSearch} onChangeText={setTeacherSearch} placeholder="Rechercher un enseignant" placeholderTextColor={theme.muted} style={[s.searchInput, { color: theme.text }]} />
						</View>
						{visibleTeachers.map((teacher) => (
							<FilterOption key={String(teacher.id)} label={teacherLabel(teacher)} selected={draft.teachers.some((id) => sameId(id, teacher.id))} onPress={() => toggle("teachers", teacher.id)} />
						))}
					</FilterAccordion>
				</ScrollView>
				<View style={[s.groupModalFooter, { backgroundColor: theme.bg, borderTopColor: theme.border, paddingBottom: Math.max(insets.bottom, 16) }]}>
					<Pressable
						style={[s.groupModalApply, { backgroundColor: totalSelected ? theme.accent : theme.border }]}
						disabled={!totalSelected}
						onPress={() => {
							onApply(draft);
							onClose();
						}}>
						<Check color="#fff" size={18} />
						<Text style={s.primaryText}>Appliquer {totalSelected} filtre{totalSelected > 1 ? "s" : ""}</Text>
					</Pressable>
				</View>
			</View>
		</Modal>
	);
}

function FilterOption({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
	const { theme } = useTheme();
	return (
		<Pressable style={[filterStyles.option, { backgroundColor: theme.surfaceSoft, borderColor: selected ? theme.accent : theme.border }]} onPress={onPress}>
			<View style={[filterStyles.optionCheck, { backgroundColor: selected ? theme.accent : "transparent", borderColor: selected ? theme.accent : theme.border }]}>{selected ? <Check color="#fff" size={14} /> : null}</View>
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
								<DoorOpen color="#fff" size={23} />
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
								<Layers color={theme.accent} size={16} />
								<Text style={[s.roomHeroStatText, { color: theme.text }]} numberOfLines={1}>
									{selectedRoomTypeLabel}
								</Text>
							</View>
						</View>
					</Animated.View>

					<Animated.View entering={FadeInDown.delay(50).duration(280)} style={[s.roomSearchCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
						<View style={[s.roomSearchBox, { backgroundColor: theme.surfaceSoft, borderColor: theme.border }]}>
							<Search color={theme.muted} size={18} />
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
								<RotateCcw color={theme.muted} size={15} />
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
										<Text style={[s.durationPresetText, { color: active ? "#fff" : theme.text }]}>{value} min</Text>
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
								{loading ? <ActivityIndicator color="#fff" /> : <Search color="#fff" size={18} />}
								<Text style={s.searchRoomText}>Chercher</Text>
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
								{active ? <Check color="#fff" size={13} /> : null}
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
		<Animated.View entering={FadeInDown.delay(Math.min(index, 14) * 25).duration(260)} layout={Layout.springify()}>
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
							<Layers color={theme.accent} size={13} />
							<Text style={[s.roomMetaTagText, { color: theme.text }]} numberOfLines={1}>
								{typeLabel}
							</Text>
						</View>
					</View>

					<View style={s.roomActions}>
						<Pressable style={[s.roomMapAction, { backgroundColor: theme.surfaceSoft, borderColor: theme.border }]} onPress={() => openUrl(getRoomMapUrl(name))}>
							<Navigation color={theme.accent} size={16} />
							<Text style={[s.roomMapActionText, { color: theme.text }]}>Carte</Text>
						</Pressable>

						<Pressable style={[s.roomApplyAction, { backgroundColor: theme.accent }]} onPress={() => onApplyRoom(room)}>
							<Filter color="#fff" size={16} />
							<Text style={s.roomApplyText}>Voir l'agenda</Text>
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

const filterStyles = StyleSheet.create({
	filtersBody: { padding: 16, gap: 12 },
	activeCard: { borderWidth: 1, borderRadius: 18, padding: 14, gap: 5 },
	activeTitle: { fontSize: 16, fontWeight: "900" },
	activeSubtitle: { fontSize: 13, lineHeight: 18 },
	activeChips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 5 },
	activeChip: { maxWidth: "100%", minHeight: 34, borderWidth: 1, borderRadius: 17, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 6 },
	activeChipText: { flexShrink: 1, fontWeight: "700", fontSize: 12 },
	emptySelection: { fontSize: 13, fontStyle: "italic", marginTop: 3 },
	accordion: { borderWidth: 1, borderRadius: 18, overflow: "hidden" },
	accordionHead: { minHeight: 56, paddingHorizontal: 15, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
	accordionTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
	accordionTitle: { fontSize: 16, fontWeight: "900" },
	accordionCount: { minWidth: 24, height: 24, borderRadius: 12, overflow: "hidden", textAlign: "center", textAlignVertical: "center", fontSize: 12, fontWeight: "900" },
	accordionContent: { paddingHorizontal: 12, paddingBottom: 12, gap: 8 },
	option: { minHeight: 48, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 10 },
	optionCheck: { width: 21, height: 21, borderRadius: 6, borderWidth: 1, alignItems: "center", justifyContent: "center" },
	optionText: { flex: 1, fontWeight: "700" },
});
