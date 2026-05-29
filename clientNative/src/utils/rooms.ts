import EPITA_MAPS_DATA_RAW from "./epitaMapsData.json";

export type CampusId = string;
export type BuildingId = string;
export type FloorId = string;
export type RoomId = string;

export interface EpitaRoom {
	id: RoomId;
	name: string;
	type?: string;
	aliases?: string[];
	[key: string]: unknown;
}

export interface EpitaFloor {
	id: FloorId;
	name: string;
	url: string;
	aliases?: string[];
	rooms?: EpitaRoom[];
	[key: string]: unknown;
}

export interface EpitaBuilding {
	id: BuildingId;
	name: string;
	url: string;
	aliases?: string[];
	floors: Record<FloorId, EpitaFloor>;
	[key: string]: unknown;
}

export interface EpitaCampus {
	id: CampusId;
	name: string;
	city?: string;
	address?: string;
	available?: boolean;
	url: string;
	aliases?: string[];
	buildings: Record<BuildingId, EpitaBuilding>;
	[key: string]: unknown;
}

export interface RoomIndexTarget {
	campusId: CampusId;
	buildingId: BuildingId;
	floorId: FloorId;
	roomId?: RoomId;
	name?: string;
	type?: string;
	url: string;
	[key: string]: unknown;
}

export interface EpitaMapsData {
	baseUrl: string;
	campuses: Record<CampusId, EpitaCampus>;
	roomIndex?: Record<string, RoomIndexTarget>;
}

export interface RoomMapTarget {
	url: string;
	campusId?: CampusId;
	buildingId?: BuildingId;
	floorId?: FloorId;
	roomId?: RoomId;
	name?: string;
	type?: string;
	source: "room" | "building" | "campus" | "home";
}

const EPITA_MAPS_DATA = EPITA_MAPS_DATA_RAW as unknown as EpitaMapsData;
const DEFAULT_BASE_URL = "https://maps.forge.epita.fr";

export function normalizeMapText(value = ""): string {
	return String(value)
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[’'`´]/g, " ")
		.replace(/[^a-z0-9+-]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function getBaseUrl(): string {
	return EPITA_MAPS_DATA?.baseUrl || DEFAULT_BASE_URL;
}

function buildUrl(campusId?: CampusId | null, buildingId?: BuildingId | null, floorId?: FloorId | null): string {
	const baseUrl = getBaseUrl();

	if (!campusId) return baseUrl;
	if (!buildingId) return `${baseUrl}/campus/${campusId}`;
	if (!floorId) return `${baseUrl}/campus/${campusId}/building/${buildingId}`;

	return `${baseUrl}/campus/${campusId}/building/${buildingId}/floor/${floorId}`;
}

function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tokenRegex(alias: string): RegExp {
	const escaped = escapeRegex(normalizeMapText(alias)).replace(/\s+/g, "\\s*");
	return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i");
}

function hasAliasMatch(normalized: string, aliases: readonly string[] = []): boolean {
	return aliases.some((alias) => tokenRegex(alias).test(normalized));
}

function getCampuses(): Record<CampusId, EpitaCampus> {
	return EPITA_MAPS_DATA?.campuses || {};
}

function findCampus(normalized: string): CampusId | null {
	for (const campus of Object.values(getCampuses())) {
		if (hasAliasMatch(normalized, campus.aliases)) return campus.id;
	}

	return null;
}

function findBuilding(normalized: string, preferredCampusId: CampusId | null = null): { campusId: CampusId; buildingId: BuildingId } | null {
	const campuses = getCampuses();
	const campusEntries =
		preferredCampusId && campuses[preferredCampusId] ? ([[preferredCampusId, campuses[preferredCampusId]]] as Array<[CampusId, EpitaCampus]>) : Object.entries(campuses);

	for (const [campusId, campus] of campusEntries) {
		for (const building of Object.values(campus.buildings || {})) {
			if (hasAliasMatch(normalized, building.aliases)) {
				return { campusId, buildingId: building.id };
			}
		}
	}

	return null;
}

function findFloor(normalized: string, campusId: CampusId, buildingId: BuildingId): FloorId | null {
	const floors = getCampuses()[campusId]?.buildings?.[buildingId]?.floors || {};

	for (const floor of Object.values(floors)) {
		if (hasAliasMatch(normalized, floor.aliases)) return floor.id;
	}

	const kbRoom = normalized.match(/(?:^|\s)kb\s*([0-6])\d{2}[a-z]?\b/);
	if (kbRoom && campusId === "kb") {
		const floorId = `f${kbRoom[1]}`;
		if (floors[floorId]) return floorId;
	}

	const ordinal = normalized.match(/(?:^|[^a-z0-9])(?:etage|floor|niveau)?\s*(-?\d+)\s*(?:er|ere|eme|e)?\b/);
	if (ordinal) {
		const floorId = `f${Number(ordinal[1])}`;
		if (floors[floorId]) return floorId;
	}

	if (/\brdc\b|rez de chaussee|ground floor/.test(normalized) && floors.f0) {
		return "f0";
	}

	if (/sous sol|sous-sol|basement/.test(normalized) && floors["f-1"]) {
		return "f-1";
	}

	if (/bas|lower/.test(normalized) && floors.f0b) return "f0b";
	if (/haut|upper/.test(normalized) && floors.f0h) return "f0h";

	return null;
}

function compactMapText(value = ""): string {
	return normalizeMapText(value).replace(/\s+/g, "");
}

function getRoomLookupCandidates(normalized: string): string[] {
	const candidates = new Set<string>();
	const compact = normalized.replace(/\s+/g, "");

	candidates.add(normalized);
	candidates.add(compact);

	const explicitKbRooms = normalized.matchAll(/(?:^|\s)kb\s*([0-9]{3,4}[a-z]?)(?=\s|$)/g);
	for (const match of explicitKbRooms) {
		candidates.add(`kb${match[1]}`);
	}

	const roomNumbers = normalized.matchAll(/(?:^|\s)([0-9]{3,4}[a-z]?)(?=\s|$)/g);
	for (const match of roomNumbers) {
		candidates.add(`kb${match[1]}`);
	}

	return [...candidates].filter(Boolean);
}

function findRoomTarget(normalized: string): RoomIndexTarget | null {
	const roomIndex = EPITA_MAPS_DATA?.roomIndex || {};
	const compactNormalized = normalized.replace(/\s+/g, "");
	const roomCandidates = getRoomLookupCandidates(normalized);

	for (const candidate of roomCandidates) {
		const normalizedCandidate = normalizeMapText(candidate);
		const compactCandidate = compactMapText(candidate);

		if (roomIndex[normalizedCandidate]) return roomIndex[normalizedCandidate];
		if (roomIndex[compactCandidate]) return roomIndex[compactCandidate];
	}

	for (const [candidate, target] of Object.entries(roomIndex)) {
		if (compactMapText(candidate) === compactNormalized) return target;
	}

	const alias = Object.keys(roomIndex)
		.sort((a, b) => b.length - a.length)
		.find((candidate) => {
			if (candidate.length < 3) return false;
			if (tokenRegex(candidate).test(normalized)) return true;

			const compactCandidate = compactMapText(candidate);
			return compactCandidate.length >= 3 && compactNormalized.includes(compactCandidate);
		});

	return alias ? roomIndex[alias] : null;
}

export function getRoomMapTarget(roomName = ""): RoomMapTarget {
	const normalized = normalizeMapText(roomName);

	if (!normalized) {
		return {
			url: getBaseUrl(),
			source: "home",
		};
	}

	const roomTarget = findRoomTarget(normalized);
	if (roomTarget?.url) {
		return {
			url: roomTarget.url,
			campusId: roomTarget.campusId,
			buildingId: roomTarget.buildingId,
			floorId: roomTarget.floorId,
			roomId: roomTarget.roomId,
			name: roomTarget.name,
			type: roomTarget.type,
			source: "room",
		};
	}

	const campusId = findCampus(normalized);
	const buildingTarget = findBuilding(normalized, campusId) || findBuilding(normalized);

	if (buildingTarget) {
		const floorId = findFloor(normalized, buildingTarget.campusId, buildingTarget.buildingId);

		return {
			url: buildUrl(buildingTarget.campusId, buildingTarget.buildingId, floorId),
			campusId: buildingTarget.campusId,
			buildingId: buildingTarget.buildingId,
			floorId: floorId ?? undefined,
			source: "building",
		};
	}

	if (campusId) {
		return {
			url: buildUrl(campusId),
			campusId,
			source: "campus",
		};
	}

	return {
		url: getBaseUrl(),
		source: "home",
	};
}

export function getRoomMapUrl(roomName = ""): string {
	return getRoomMapTarget(roomName).url;
}

export { EPITA_MAPS_DATA };
export default getRoomMapUrl;
