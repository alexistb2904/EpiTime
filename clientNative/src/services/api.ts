import { getSession } from "./storage";
import { Platform } from "react-native";
import { LocationNode, Room, RoomType } from "../types";
import { publicConfig } from "./config";

const API_BASE = (publicConfig.apiBase || "").replace(/\/$/, "");

async function request<T>(path: string, init: RequestInit = {}) {
	if (!API_BASE && Platform.OS !== "web") throw new Error("EXPO_PUBLIC_API_BASE manquant");
	const session = await getSession();
	const headers = new Headers(init.headers);
	headers.set("Content-Type", headers.get("Content-Type") || "application/json");
	if (session?.zeusToken) headers.set("Authorization", `Bearer ${session.zeusToken}`);
	const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
	const text = await res.text();
	let data: any = null;
	try {
		data = text ? JSON.parse(text) : null;
	} catch {
		data = text;
	}
	if (!res.ok) {
		const error = new Error(data?.error || `HTTP ${res.status}`) as Error & { status?: number; data?: unknown };
		error.status = res.status;
		error.data = data;
		throw error;
	}
	return data as T;
}
export async function exchangeMicrosoftToken(accessToken: string) {
	return request<{ token: string }>("/api/auth", { method: "POST", body: JSON.stringify({ accessToken }) });
}
export async function getGroups() {
	return request<any[]>("/api/groups");
}
export type CalendarQuery = {
	groups?: (string | number)[];
	teachers?: (string | number)[];
	rooms?: (string | number)[];
};
export async function getEvents(start: Date, end: Date, query: (string | number)[] | CalendarQuery) {
	const p = new URLSearchParams({ start: start.toISOString(), end: end.toISOString() });
	const normalized = Array.isArray(query) ? { groups: query } : query;
	normalized.groups?.forEach((g) => p.append("groups", String(g)));
	normalized.teachers?.forEach((t) => p.append("teachers", String(t)));
	normalized.rooms?.forEach((r) => p.append("rooms", String(r)));
	return request<any[]>(`/api/events?${p.toString()}`);
}
export async function getReservationDetails(id: string | number) {
	return request<any>(`/api/reservation/${encodeURIComponent(String(id))}/details`);
}
export async function getCourseType(id: string | number) {
	return request<{ type?: string }>(`/api/coursetype/${encodeURIComponent(String(id))}`);
}
export async function getRooms() {
	return request<Room[]>("/api/rooms");
}
export async function getRoomTypes() {
	return request<RoomType[]>("/api/roomtypes");
}
export async function getLocations() {
	return request<LocationNode[]>("/api/locations");
}
export async function getAvailableRooms(payload: {
	startDate: string;
	endDate: string;
	groups?: number[];
	location?: number;
	roomType?: number;
	capacity?: number;
}) {
	return request<Room[]>("/api/rooms/available", { method: "POST", body: JSON.stringify(payload) });
}
export async function getUniqueUsers() {
	return request<{ enabled?: boolean; users?: number }>("/api/analytics/overview");
}
export async function registerExpoPushToken(token: string, userId: string, groups: (string | number)[], settings: any) {
	return request("/api/mobile/subscribe", {
		method: "POST",
		headers: { "X-User-ID": userId },
		body: JSON.stringify({ expoPushToken: token, userId, groups, settings, platform: Platform.OS }),
	});
}
export async function unregisterExpoPushToken(token: string, userId: string) {
	return request("/api/mobile/unsubscribe", {
		method: "POST",
		headers: { "X-User-ID": userId },
		body: JSON.stringify({ expoPushToken: token, userId }),
	});
}
export async function sendMobileTestNotification(userId: string) {
	return request("/api/mobile/notify-test", {
		method: "POST",
		headers: { "X-User-ID": userId },
		body: JSON.stringify({ userId }),
	});
}
