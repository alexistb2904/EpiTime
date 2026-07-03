import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import Animated, { FadeInDown, Layout } from "react-native-reanimated";
import {
	Check,
	Clock,
	DoorOpen,
	Filter,
	Layers,
	MapPin,
	Navigation,
	RotateCcw,
	Search,
	SlidersHorizontal,
	Users,
	X,
} from "lucide-react-native";
import { useTheme } from "../../context/ThemeContext";
import { getAvailableRooms, getLocations, getRooms, getRoomTypes } from "../../services/api";
import { Group, LocationNode, Room, RoomType } from "../../types";
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
	selectedLabels,
	onSearch,
	onToggle,
	onClose,
}: {
	visible: boolean;
	groups: Group[];
	selected: (string | number)[];
	search: string;
	selectedLabels: string[];
	onSearch: (value: string) => void;
	onToggle: (id: string | number) => void;
	onClose: () => void;
}) {
	const { theme } = useTheme();
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
				<Text style={[s.modalMeta, { color: theme.muted }]} numberOfLines={2}>
					{selected.length ? selectedLabels.join(", ") : "Aucun groupe sélectionné"}
				</Text>
				<ScrollView contentContainerStyle={s.modalList}>
					{groups.map((group) => {
						const active = selected.includes(group.id);
						return (
							<Animated.View key={String(group.id)} entering={FadeInDown.delay(Math.min(groups.indexOf(group), 18) * 20).duration(250)} layout={Layout.springify()}>
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
							</Animated.View>
						);
					})}
				</ScrollView>
			</View>
		</Modal>
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
	return (
		<View style={[s.modalHeader, { borderBottomColor: theme.border }]}>
			<Text style={[s.modalTitle, { color: theme.text }]}>{title}</Text>
			<Pressable style={[s.iconBtn, { borderColor: theme.border }]} onPress={onClose}>
				<X color={theme.text} size={20} />
			</Pressable>
		</View>
	);
}
