import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Building2, CalendarDays, Check, MapPin, Minus, Plus, Search, X } from "lucide-react";
import Modal from "./Modal";
import { trackEvent } from "../utils/analyticsTracker";
import { fetchApi } from "../utils/api";

const LOCATION_LABEL_OVERRIDES = {
	2: "Kremlin-Bicêtre",
	7: "Partialie",
	8: "Pasteur",
	9: "Voltaire",
	10: "Campus Cyber (La Défense)",
};

const ROOM_TYPE_LABEL_OVERRIDES = {
	"roomtype.classroom": "Salle de classe",
	"roomtype.hall": "Hall",
	"roomtype.machineroom": "Salle Machine",
	"roomtype.other": "Autre",
};

const capitalizeFirst = (value = "") => {
	if (!value) return value;
	return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
};

const getLocationLabel = (node) => {
	if (LOCATION_LABEL_OVERRIDES[node.id]) {
		return LOCATION_LABEL_OVERRIDES[node.id];
	}
	return capitalizeFirst(node.name || `Localisation #${node.id}`);
};

const getRoomTypeLabel = (typeName = "") => {
	const key = typeName.toLowerCase();
	if (ROOM_TYPE_LABEL_OVERRIDES[key]) {
		return ROOM_TYPE_LABEL_OVERRIDES[key];
	}

	if (key.startsWith("roomtype.")) {
		const raw = typeName.split(".").pop() || typeName;
		return capitalizeFirst(raw);
	}

	return capitalizeFirst(typeName);
};

const getMapUrl = (room, locations = []) => {
	const BASE_URL = "https://maps.forge.epita.fr";
	const PARITALIE_ID = 7;
	const PASTEUR_ID = 8;
	const VOLTAIRE_ID = 9;

	const findParentFromRaw = () => {
		const search = (nodes) => {
			for (const node of nodes) {
				const isLocation = (node.type || "").toLowerCase().includes("location") || node.id_type === 0;
				if (!isLocation && node.id === room.id) {
					return node.id_parent;
				}
				if (Array.isArray(node.children) && node.children.length > 0) {
					const result = search(node.children);
					if (result !== null && result !== undefined) return result;
				}
			}
			return null;
		};
		return search(locations);
	};

	const locationParentId = findParentFromRaw();
	const roomName = room.name || "";

	if (locationParentId === PARITALIE_ID) {
		let floor = "f0";
		if (roomName.includes("RDC")) floor = "f0";
		else if (roomName.includes("1er")) floor = "f1";
		else if (roomName.includes("2ème")) floor = "f2";
		else if (roomName.includes("3ème")) floor = "f3";
		else if (roomName.includes("4ème")) floor = "f4";
		else if (roomName.includes("5ème")) floor = "f5";
		return `${BASE_URL}/campus/kb/building/paritalie/floor/${floor}`;
	}

	if (locationParentId === PASTEUR_ID) {
		return `${BASE_URL}/campus/kb/building/pasteur`;
	}

	if (locationParentId === VOLTAIRE_ID || roomName.toUpperCase().includes("KB")) {
		const kbMatch = roomName.toUpperCase().match(/KB\s*([0-6])/);
		if (kbMatch) {
			return `${BASE_URL}/campus/kb/building/voltaire/floor/f${kbMatch[1]}`;
		}
		return `${BASE_URL}/campus/kb/building/voltaire`;
	}

	return BASE_URL;
};

const sanitizeLocationTree = (nodes = []) => {
	return nodes
		.map((node) => {
			const normalizedType = (node.type || "").toLowerCase();
			const isLocation = normalizedType.includes("location") || node.id_type === 0;
			if (!isLocation) return null;

			return {
				id: node.id,
				name: getLocationLabel(node),
				children: sanitizeLocationTree(node.children || []),
			};
		})
		.filter(Boolean);
};

const enforceKbTree = (tree = []) => {
	const kbId = 2;
	const kbChildrenIds = new Set([7, 8, 9]);

	const flatNodes = [];
	const walk = (nodes) => {
		nodes.forEach((node) => {
			flatNodes.push({ ...node, children: [...(node.children || [])] });
			if (node.children?.length) walk(node.children);
		});
	};
	walk(tree);

	const byId = new Map(flatNodes.map((n) => [n.id, { ...n, children: [] }]));
	const roots = [];

	flatNodes.forEach((node) => {
		const originalChildren = node.children || [];
		const parentFromOriginal = flatNodes.find((candidate) => (candidate.children || []).some((c) => c.id === node.id));
		const forcedParentId = kbChildrenIds.has(node.id) ? kbId : parentFromOriginal?.id;

		if (forcedParentId && byId.has(forcedParentId) && forcedParentId !== node.id) {
			byId.get(forcedParentId).children.push(byId.get(node.id));
		} else {
			roots.push(byId.get(node.id));
		}

		originalChildren.forEach((child) => {
			if (byId.has(child.id) && !byId.get(node.id).children.some((c) => c.id === child.id)) {
				byId.get(node.id).children.push(byId.get(child.id));
			}
		});
	});

	const dedupeRoots = Array.from(new Map(roots.map((r) => [r.id, r])).values());
	const seen = new Set();
	const clean = (nodes) =>
		nodes
			.filter(Boolean)
			.map((node) => {
				if (seen.has(node.id)) return null;
				seen.add(node.id);
				return {
					...node,
					children: clean(Array.from(new Map((node.children || []).map((c) => [c.id, c])).values())).filter(Boolean),
				};
			})
			.filter(Boolean);

	return clean(dedupeRoots);
};

const LocationTree = ({ nodes, selectedLocation, onSelect }) => (
	<ul className="tree">
		{nodes.map((node) => (
			<li key={node.id} className="tree-node">
				<label className="tree-row">
					<input type="radio" name="location-filter" checked={selectedLocation === String(node.id)} onChange={() => onSelect(String(node.id))} />
					<span>{node.name}</span>
				</label>
				{node.children?.length > 0 && <LocationTree nodes={node.children} selectedLocation={selectedLocation} onSelect={onSelect} />}
			</li>
		))}
	</ul>
);

const RoomAvailabilityModal = ({ onClose, zeusToken, selectedGroups = [], onApplyRoomFilter }) => {
	const [durationMinutes, setDurationMinutes] = useState(30);

	const [selectedLocation, setSelectedLocation] = useState("");
	const [selectedRoomType, setSelectedRoomType] = useState("");
	const [selectedRoom, setSelectedRoom] = useState("");
	const [capacity, setCapacity] = useState("");

	const [rooms, setRooms] = useState([]);
	const [roomTypes, setRoomTypes] = useState([]);
	const [locationTree, setLocationTree] = useState([]);
	const [locationsRaw, setLocationsRaw] = useState([]);

	const [searchLoading, setSearchLoading] = useState(false);
	const [metaLoading, setMetaLoading] = useState(false);
	const [error, setError] = useState("");
	const [availableRooms, setAvailableRooms] = useState([]);
	const [hasSearched, setHasSearched] = useState(false);

	useEffect(() => {
		if (!zeusToken) return;

		const loadMeta = async () => {
			setMetaLoading(true);
			setError("");
			try {
				const [roomsRes, roomTypesRes, locationsRes] = await Promise.all([
					fetchApi("/api/rooms", { headers: { Authorization: `Bearer ${zeusToken}` } }),
					fetchApi("/api/roomtypes", { headers: { Authorization: `Bearer ${zeusToken}` } }),
					fetchApi("/api/locations", { headers: { Authorization: `Bearer ${zeusToken}` } }),
				]);

				if (!roomsRes.ok || !roomTypesRes.ok || !locationsRes.ok) {
					throw new Error("Impossible de charger les données de salles.");
				}

				const [roomsData, roomTypesData, locationsData] = await Promise.all([roomsRes.json(), roomTypesRes.json(), locationsRes.json()]);

				setRooms(Array.isArray(roomsData) ? roomsData : []);
				setRoomTypes(Array.isArray(roomTypesData) ? roomTypesData : []);

				const sanitizedTree = sanitizeLocationTree(Array.isArray(locationsData) ? locationsData : []);
				setLocationTree(enforceKbTree(sanitizedTree));
				setLocationsRaw(Array.isArray(locationsData) ? locationsData : []);
			} catch (err) {
				setError(err.message || "Erreur lors du chargement des données.");
			} finally {
				setMetaLoading(false);
			}
		};

		loadMeta();
	}, [zeusToken]);

	const availableRoomIds = useMemo(() => new Set(availableRooms.map((r) => r.id)), [availableRooms]);

	const selectedRoomStatus = useMemo(() => {
		if (!selectedRoom || !hasSearched) return null;
		return availableRoomIds.has(Number(selectedRoom)) ? "free" : "busy";
	}, [selectedRoom, availableRoomIds, hasSearched]);

	const availableRoomsSorted = useMemo(() => {
		return [...availableRooms].sort((a, b) => a.name.localeCompare(b.name, "fr"));
	}, [availableRooms]);

	const submitSearch = async (e) => {
		e.preventDefault();
		trackEvent("room_search_submitted", {
			has_location_filter: !!selectedLocation,
			has_room_type_filter: !!selectedRoomType,
			has_capacity_filter: !!capacity,
			has_specific_room_filter: !!selectedRoom,
			duration_minutes: Number(durationMinutes) || 30,
		});
		setSearchLoading(true);
		setError("");
		setHasSearched(false);

		try {
			const start = new Date();
			const safeDuration = Number.isFinite(Number(durationMinutes)) ? Math.max(5, Number(durationMinutes)) : 30;
			const end = new Date(start.getTime() + safeDuration * 60 * 1000);

			const payload = {
				startDate: start.toISOString(),
				endDate: end.toISOString(),
			};

			if (selectedGroups.length > 0) {
				payload.groups = selectedGroups.map(Number);
			}
			if (selectedLocation) {
				payload.location = Number(selectedLocation);
			}
			if (selectedRoomType) {
				payload.roomType = Number(selectedRoomType);
			}
			if (capacity) {
				payload.capacity = Number(capacity);
			}

			const res = await fetchApi("/api/rooms/available", {
				method: "POST",
				headers: {
					Authorization: `Bearer ${zeusToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(payload),
			});

			if (!res.ok) {
				const errorData = await res.json().catch(() => ({}));
				throw new Error(errorData.error || "Erreur pendant la recherche de salles libres.");
			}

			const data = await res.json();
			setAvailableRooms(Array.isArray(data) ? data : []);
			setHasSearched(true);
			trackEvent("room_search_results", {
				available_count: Array.isArray(data) ? data.length : 0,
			});
		} catch (err) {
			setError(err.message || "Erreur pendant la recherche.");
			trackEvent("room_search_failed");
		} finally {
			setSearchLoading(false);
		}
	};

	const handlePickRoom = (room) => {
		trackEvent("room_search_result_clicked", {
			has_capacity: Number(room?.capacity || 0) > 0,
		});
		if (typeof onApplyRoomFilter === "function") {
			onApplyRoomFilter(room);
			onClose();
		}
	};

	const until = new Date(Date.now() + (Math.max(5, Number(durationMinutes)) || 30) * 60000);

	return (
		<Modal className="rooms-sheet" hue={160} icon={<Building2 size={18} strokeWidth={2.2} />} title="Salles libres" onClose={onClose}>
			<form className="rooms-form" onSubmit={submitSearch}>
				<div className="rooms-fields">
					<div className="field">
						<span id="rf-duration">Libre pendant</span>
						<div className="stepper" role="group" aria-labelledby="rf-duration">
							<button
								type="button"
								className="tool"
								onClick={() => setDurationMinutes((prev) => Math.max(5, Number(prev || 30) - 5))}
								aria-label="5 minutes de moins">
								<Minus size={16} strokeWidth={2.4} aria-hidden="true" />
							</button>
							<input
								type="number"
								className="input"
								min="5"
								step="5"
								value={durationMinutes}
								onChange={(e) => setDurationMinutes(e.target.value)}
								aria-label="Durée en minutes"
							/>
							<button
								type="button"
								className="tool"
								onClick={() => setDurationMinutes((prev) => Math.min(24 * 60, Number(prev || 30) + 5))}
								aria-label="5 minutes de plus">
								<Plus size={16} strokeWidth={2.4} aria-hidden="true" />
							</button>
							<span>min, jusqu'à {until.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>
						</div>
					</div>
					<label className="field">
						<span>Capacité minimum</span>
						<input type="number" min="1" placeholder="ex. 25" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
					</label>
					<label className="field">
						<span>Type de salle</span>
						<select value={selectedRoomType} onChange={(e) => setSelectedRoomType(e.target.value)}>
							<option value="">Tous</option>
							{roomTypes
								.slice()
								.sort((a, b) => getRoomTypeLabel(a.type).localeCompare(getRoomTypeLabel(b.type), "fr"))
								.map((roomType) => (
									<option key={roomType.id} value={roomType.id}>
										{getRoomTypeLabel(roomType.type)}
									</option>
								))}
						</select>
					</label>
					<label className="field">
						<span>Vérifier une salle précise</span>
						<select value={selectedRoom} onChange={(e) => setSelectedRoom(e.target.value)}>
							<option value="">Aucune</option>
							{rooms
								.slice()
								.sort((a, b) => a.name.localeCompare(b.name, "fr"))
								.map((room) => (
									<option key={room.id} value={room.id}>
										{room.name} ({room.capacity} places)
									</option>
								))}
						</select>
					</label>
				</div>

				<fieldset className="rooms-where">
					<legend className="label">Où</legend>
					<ul className="tree tree-root">
						<li className="tree-node">
							<label className="tree-row">
								<input type="radio" name="location-filter" checked={selectedLocation === ""} onChange={() => setSelectedLocation("")} />
								<span>Partout</span>
							</label>
						</li>
					</ul>
					<LocationTree nodes={locationTree} selectedLocation={selectedLocation} onSelect={setSelectedLocation} />
				</fieldset>

				<button className="ticket is-ink is-compact rooms-submit" type="submit" disabled={searchLoading || metaLoading}>
					<span className="ticket-stub">{searchLoading ? <span className="ticket-spinner" /> : <Search size={18} strokeWidth={2.4} aria-hidden="true" />}</span>
					<span className="ticket-text">
						<strong>{searchLoading ? "Recherche…" : metaLoading ? "Chargement des salles…" : "Voir les salles libres"}</strong>
					</span>
				</button>
			</form>

			{error && (
				<p className="pen-note" role="alert">
					<AlertTriangle size={18} strokeWidth={2.2} aria-hidden="true" />
					{error}
				</p>
			)}

			{selectedRoomStatus && (
				<p className={`room-status ${selectedRoomStatus}`}>
					{selectedRoomStatus === "free" ? <Check size={18} strokeWidth={2.4} aria-hidden="true" /> : <X size={18} strokeWidth={2.4} aria-hidden="true" />}
					{selectedRoomStatus === "free" ? "Cette salle est libre sur ce créneau." : "Cette salle n'est pas libre sur ce créneau."}
				</p>
			)}

			{hasSearched && (
				<section className="rooms-results" aria-live="polite">
					<h3>
						{availableRoomsSorted.length === 0
							? "Aucune salle libre"
							: `${availableRoomsSorted.length} salle${availableRoomsSorted.length > 1 ? "s" : ""} libre${availableRoomsSorted.length > 1 ? "s" : ""}`}
					</h3>
					{availableRoomsSorted.length === 0 ? (
						<p className="modal-hint">Aucune salle ne correspond. Essaie une durée plus courte ou un autre bâtiment.</p>
					) : (
						<table className="rooms-table">
							<thead>
								<tr>
									<th scope="col">Salle</th>
									<th scope="col">Places</th>
									<th scope="col" className="rooms-type">
										Type
									</th>
									<th scope="col">
										<span className="visually-hidden">Actions</span>
									</th>
								</tr>
							</thead>
							<tbody>
								{availableRoomsSorted.map((room) => (
									<tr key={room.id}>
										<th scope="row">{room.name}</th>
										<td>{room.capacity}</td>
										<td className="rooms-type">{getRoomTypeLabel(roomTypes.find((rt) => rt.id === room.idRoomType)?.type || "Type inconnu")}</td>
										<td>
											<span className="rooms-actions">
												<a
													className="btn is-small"
													href={getMapUrl(room, locationsRaw)}
													target="_blank"
													rel="noopener noreferrer"
													onClick={() => trackEvent("room_map_opened", { source: "room_search" })}>
													<MapPin size={14} strokeWidth={2.2} aria-hidden="true" />
													Plan
												</a>
												<button type="button" className="btn is-small" onClick={() => handlePickRoom(room)}>
													<CalendarDays size={14} strokeWidth={2.2} aria-hidden="true" />
													Planning
												</button>
											</span>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					)}
				</section>
			)}
		</Modal>
	);
};

export default RoomAvailabilityModal;
