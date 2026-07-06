import { clearSession, getSession } from "./storage";
import { Platform } from "react-native";
import { LocationNode, Room, RoomType } from "../types";
import { publicConfig } from "./config";
import type { Session } from "../types";

const API_BASE = (publicConfig.apiBase || "").replace(/\/$/, "");
const REQUEST_TIMEOUT_MS = 15_000;
const AUTH_RECONNECT_REQUIRED_CODE = "AUTH_RECONNECT_REQUIRED";

type AuthReconnectRequiredError = Error & { status: 401; code: typeof AUTH_RECONNECT_REQUIRED_CODE };

let refreshPromise: Promise<Session> | null = null;
let refreshSessionImpl: (() => Promise<Session>) | null = null;

export function setRefreshSessionHandler(handler: (() => Promise<Session>) | null) {
	refreshSessionImpl = handler;
}

export function createAuthReconnectRequiredError(message = "Session expirée, reconnecte-toi pour continuer.") {
	const error = new Error(message) as AuthReconnectRequiredError;
	error.status = 401;
	error.code = AUTH_RECONNECT_REQUIRED_CODE;
	return error;
}

export function isAuthReconnectRequiredError(error: unknown): error is AuthReconnectRequiredError {
	return Boolean(
		error &&
		typeof error === "object" &&
		"status" in error &&
		(error as { status?: unknown }).status === 401 &&
		"code" in error &&
		(error as { code?: unknown }).code === AUTH_RECONNECT_REQUIRED_CODE
	);
}

async function readResponse<T>(res: Response) {
	const text = await res.text();
	let data: any = null;
	try {
		data = text ? JSON.parse(text) : null;
	} catch {
		data = text;
	}

	if (!res.ok) {
		const error = new Error(data?.error || `HTTP ${res.status}`) as Error & { status?: number; data?: unknown; code?: string };
		error.status = res.status;
		error.data = data;
		if (res.status === 401 && !error.code) error.code = AUTH_RECONNECT_REQUIRED_CODE;
		throw error;
	}

	return data as T;
}

async function performRequest<T>(path: string, init: RequestInit = {}, withAuth: boolean, retried = false): Promise<T> {
	if (!API_BASE && Platform.OS !== "web") throw new Error("EXPO_PUBLIC_API_BASE manquant");
	const headers = new Headers(init.headers);
	headers.set("Content-Type", headers.get("Content-Type") || "application/json");

	if (withAuth) {
		const session = await getSession();
		if (!session?.zeusToken) throw createAuthReconnectRequiredError();

		if (session.microsoftRefreshToken && session.microsoftExpiresAt && session.microsoftExpiresAt <= Date.now()) {
			await refreshSessionOnce();
		}

		const currentSession = await getSession();
		if (!currentSession?.zeusToken) throw createAuthReconnectRequiredError();
		headers.set("Authorization", `Bearer ${currentSession.zeusToken}`);
	}

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
	let res: Response;
	try {
		res = await fetch(`${API_BASE}${path}`, {
			...init,
			headers,
			signal: init.signal || controller.signal,
		});
	} catch (err: any) {
		if (err?.name === "AbortError") throw new Error("Requête expirée");
		throw err;
	} finally {
		clearTimeout(timeout);
	}

	if (withAuth && res.status === 401 && !retried && path !== "/api/auth") {
		try {
			await refreshSessionOnce();
			return await performRequest<T>(path, init, true, true);
		} catch {
			await clearSession();
			throw createAuthReconnectRequiredError();
		}
	}

	if (withAuth && res.status === 401) {
		await clearSession();
		throw createAuthReconnectRequiredError();
	}

	return readResponse<T>(res);
}

async function refreshSessionOnce() {
	if (refreshPromise) return refreshPromise;
	if (!refreshSessionImpl) {
		await clearSession();
		throw createAuthReconnectRequiredError();
	}
	refreshPromise = refreshSessionImpl()
		.catch((error) => {
			throw error;
		})
		.finally(() => {
			refreshPromise = null;
		});
	return refreshPromise;
}

export async function publicRequest<T>(path: string, init: RequestInit = {}) {
	return performRequest<T>(path, init, false);
}

export async function request<T>(path: string, init: RequestInit = {}) {
	return performRequest<T>(path, init, true);
}

export async function exchangeMicrosoftToken(accessToken: string) {
	return publicRequest<{ token: string }>("/api/auth", { method: "POST", body: JSON.stringify({ accessToken }) });
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
export async function getAvailableRooms(payload: { startDate: string; endDate: string; groups?: number[]; location?: number; roomType?: number; capacity?: number }) {
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
