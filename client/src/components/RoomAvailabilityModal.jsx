import React, { useEffect, useMemo, useState } from "react";

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

const LocationTree = ({ nodes, selectedLocation, onSelect, depth = 0 }) => {
	return nodes.map((node) => (
		<div key={node.id} className="rf-tree-node" style={{ marginLeft: `${depth * 16}px` }}>
			<label className="rf-tree-row">
				<input type="radio" name="location-filter" checked={selectedLocation === String(node.id)} onChange={() => onSelect(String(node.id))} />
				<span>{node.name}</span>
			</label>
			{node.children?.length > 0 && <LocationTree nodes={node.children} selectedLocation={selectedLocation} onSelect={onSelect} depth={depth + 1} />}
		</div>
	));
};

const RoomAvailabilityModal = ({ show, onClose, zeusToken, selectedGroups = [], onApplyRoomFilter }) => {
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
		if (!show || !zeusToken) return;

		const loadMeta = async () => {
			setMetaLoading(true);
			setError("");
			try {
				const [roomsRes, roomTypesRes, locationsRes] = await Promise.all([
					fetch("/api/rooms", { headers: { Authorization: `Bearer ${zeusToken}` } }),
					fetch("/api/roomtypes", { headers: { Authorization: `Bearer ${zeusToken}` } }),
					fetch("/api/locations", { headers: { Authorization: `Bearer ${zeusToken}` } }),
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
	}, [show, zeusToken]);

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

			const res = await fetch("/api/rooms/available", {
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
		} catch (err) {
			setError(err.message || "Erreur pendant la recherche.");
		} finally {
			setSearchLoading(false);
		}
	};

	const handlePickRoom = (room) => {
		if (typeof onApplyRoomFilter === "function") {
			onApplyRoomFilter(room);
			onClose();
		}
	};

	if (!show) return null;

	return (
		<div
			className="modal-overlay"
			onClick={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}>
			<div className="modal-content room-finder-modal" onClick={(e) => e.stopPropagation()}>
				<div className="modal-header room-finder-header">
					<h2>Disponibilité des salles</h2>
					<button className="btn-icon" onClick={onClose}>
						✕
					</button>
				</div>

				<div className="modal-body room-finder-body">
					<form className="room-finder-form" onSubmit={submitSearch}>
						<div className="rf-grid">
							<label className="rf-field">
								<span>Durée (à partir de maintenant)</span>
								<div className="rf-duration-counter">
									<button type="button" onClick={() => setDurationMinutes((prev) => Math.max(5, Number(prev || 30) - 5))}>
										−
									</button>
									<input type="number" min="5" step="5" value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} />
									<button type="button" onClick={() => setDurationMinutes((prev) => Math.min(24 * 60, Number(prev || 30) + 5))}>
										+
									</button>
								</div>
							</label>
							<label className="rf-field">
								<span>Salle à vérifier (optionnel)</span>
								<select value={selectedRoom} onChange={(e) => setSelectedRoom(e.target.value)}>
									<option value="">Toutes les salles</option>
									{rooms
										.slice()
										.sort((a, b) => a.name.localeCompare(b.name, "fr"))
										.map((room) => (
											<option key={room.id} value={room.id}>
												{room.name} (cap. {room.capacity})
											</option>
										))}
								</select>
							</label>
							<label className="rf-field">
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
							<label className="rf-field">
								<span>Capacité minimum</span>
								<input type="number" min="1" placeholder="ex: 25" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
							</label>
						</div>

						<div className="rf-location-tree-card">
							<div className="rf-location-head">
								<span>Localisation</span>
								<button type="button" className="rf-clear-link" onClick={() => setSelectedLocation("")}>
									Tout réinitialiser
								</button>
							</div>
							<div className="rf-tree-row rf-tree-partout">
								<label>
									<input type="radio" name="location-filter" checked={selectedLocation === ""} onChange={() => setSelectedLocation("")} />
									<span>Partout</span>
								</label>
							</div>
							<div className="rf-location-tree">
								<LocationTree nodes={locationTree} selectedLocation={selectedLocation} onSelect={setSelectedLocation} />
							</div>
						</div>

						<div className="rf-actions">
							<button className="btn-primary" type="submit" disabled={searchLoading || metaLoading}>
								{searchLoading ? "Recherche..." : "Voir les salles libres"}
							</button>
						</div>
					</form>

					{metaLoading && <p className="rf-feedback">Chargement des options…</p>}
					{error && <p className="rf-feedback rf-error">{error}</p>}

					{selectedRoomStatus && (
						<div className={`rf-status-card ${selectedRoomStatus === "free" ? "free" : "busy"}`}>
							{selectedRoomStatus === "free" ? "✅ Cette salle est libre sur ce créneau" : "⛔ Cette salle n'est pas libre sur ce créneau"}
						</div>
					)}

					{hasSearched && (
						<div className="rf-results">
							<h3>{availableRoomsSorted.length} salle(s) disponible(s)</h3>
							{availableRoomsSorted.length === 0 ? (
								<p className="rf-feedback">Aucune salle ne correspond à ces critères.</p>
							) : (
								<div className="rf-room-list">
									{availableRoomsSorted.map((room) => {
										const type = getRoomTypeLabel(roomTypes.find((rt) => rt.id === room.idRoomType)?.type || "Type inconnu");
										return (
											<article
												key={room.id}
												className="rf-room-card"
												onClick={() => handlePickRoom(room)}
												onKeyDown={(e) => {
													if (e.key === "Enter" || e.key === " ") {
														e.preventDefault();
														handlePickRoom(room);
													}
												}}
												role="button"
												tabIndex={0}>
												<div className="rf-room-title">{room.name}</div>
												<div className="rf-room-meta">Capacité: {room.capacity}</div>
												<div className="rf-room-meta">Type: {type}</div>
												<div className="rf-room-actions">
													<button
														type="button"
														className="rf-room-map-btn"
														onClick={(e) => {
															e.stopPropagation();
															window.open(getMapUrl(room, locationsRaw), "_blank", "noopener,noreferrer");
														}}>
														Voir la carte
													</button>
													<div className="rf-room-action">Cliquer pour filtrer le calendrier</div>
												</div>
											</article>
										);
									})}
								</div>
							)}
						</div>
					)}
				</div>
			</div>
		</div>
	);
};

export default RoomAvailabilityModal;
