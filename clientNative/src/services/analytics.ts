import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { AppState, Platform } from "react-native";
import { publicConfig } from "./config";
import { isNetworkOnline, subscribeNetworkState } from "./networkStatus";
import {
	ANALYTICS_QUEUE_TTL_MS,
	MAX_ANALYTICS_QUEUE_SIZE,
	canTrackAnalytics,
	pruneAnalyticsQueue,
	sanitizeAnalyticsEventName,
	sanitizeAnalyticsProperties,
	type AnalyticsProperties,
	type QueuedAnalyticsEvent,
} from "./analyticsUtils";

export type { AnalyticsProperties } from "./analyticsUtils";

const CONSENT_KEY = "epitime_analytics_consent_native";
const QUEUE_KEY = "epitime_analytics_queue_native";
const REQUEST_TIMEOUT_MS = 2500;
const API_BASE = (publicConfig.apiBase || "").replace(/\/$/, "");
const DEBUG = process.env.EXPO_PUBLIC_ANALYTICS_DEBUG === "true";

let networkUnsubscribe: (() => void) | null = null;
let flushPromise: Promise<void> | null = null;
let lastNetworkStatus: "online" | "offline" | null = null;

const getMetadata = () => ({
	platform: Platform.OS === "ios" ? "ios" : "android",
	app_version: Constants.nativeAppVersion || Constants.expoConfig?.version || "unknown",
	build_version: Constants.nativeBuildVersion || "unknown",
	environment: typeof __DEV__ === "boolean" && __DEV__ ? "development" : "production",
});

async function readQueue() {
	try {
		const raw = await AsyncStorage.getItem(QUEUE_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw) as QueuedAnalyticsEvent[];
		return Array.isArray(parsed) ? pruneAnalyticsQueue(parsed) : [];
	} catch {
		return [];
	}
}

async function writeQueue(queue: QueuedAnalyticsEvent[]) {
	try {
		await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(pruneAnalyticsQueue(queue)));
	} catch {
		// Analytics storage is best effort.
	}
}

async function sendToBackend(item: QueuedAnalyticsEvent) {
	if (!API_BASE) throw new Error("Analytics API base is not configured");
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
	try {
		const response = await fetch(`${API_BASE}/api/analytics/event`, {
			method: "POST",
			headers: { "Content-Type": "application/json", Accept: "application/json" },
			body: JSON.stringify({ event: item.event, properties: item.properties }),
			signal: controller.signal,
		});
		if (!response.ok) throw new Error(`Analytics HTTP ${response.status}`);
	} finally {
		clearTimeout(timeout);
	}
}

async function enqueue(item: QueuedAnalyticsEvent) {
	const queue = await readQueue();
	await writeQueue([...queue, item].slice(-MAX_ANALYTICS_QUEUE_SIZE));
}

async function flushPendingEvents() {
	if (flushPromise) return flushPromise;
	flushPromise = (async () => {
		if (!(await getAnalyticsConsent())) return;
		const queue = await readQueue();
		if (!queue.length) return;
		const remaining: QueuedAnalyticsEvent[] = [];
		for (let index = 0; index < queue.length; index++) {
			try {
				await sendToBackend(queue[index]);
			} catch {
				remaining.push(...queue.slice(index));
				break;
			}
		}
		await writeQueue(remaining);
	})().finally(() => {
		flushPromise = null;
	});
	return flushPromise;
}

function subscribeToNetwork() {
	if (networkUnsubscribe) return;
	networkUnsubscribe = subscribeNetworkState((state) => {
		const status = isNetworkOnline(state) ? "online" : "offline";
		if (status !== lastNetworkStatus) {
			lastNetworkStatus = status;
			void trackEvent("network_status_changed", { status });
		}
		if (status === "online") void flushPendingEvents();
	});
}

export async function getAnalyticsConsent() {
	try {
		return canTrackAnalytics(await AsyncStorage.getItem(CONSENT_KEY));
	} catch {
		return false;
	}
}

export async function setAnalyticsConsent(accepted: boolean) {
	try {
		await AsyncStorage.setItem(CONSENT_KEY, accepted ? "accepted" : "declined");
		if (!accepted) {
			networkUnsubscribe?.();
			networkUnsubscribe = null;
			await AsyncStorage.removeItem(QUEUE_KEY);
			return;
		}
		subscribeToNetwork();
		await flushPendingEvents();
	} catch {
		// Consent changes must never interrupt the user flow.
	}
}

export async function initializeAnalytics() {
	if (!(await getAnalyticsConsent())) return;
	subscribeToNetwork();
	await flushPendingEvents();
}

export async function trackEvent(eventName: string, properties: AnalyticsProperties = {}) {
	if (!(await getAnalyticsConsent())) return;
	const safeEventName = sanitizeAnalyticsEventName(eventName);
	if (!safeEventName) return;
	const item: QueuedAnalyticsEvent = {
		event: safeEventName,
		properties: { ...sanitizeAnalyticsProperties(safeEventName, properties), ...getMetadata() },
		expiresAt: Date.now() + ANALYTICS_QUEUE_TTL_MS,
	};
	if (DEBUG) console.log(`[analytics] ${safeEventName}`);
	try {
		await sendToBackend(item);
	} catch {
		await enqueue(item);
	}
}

export function startAnalyticsLifecycleTracking() {
	let backgrounded = false;
	const subscription = AppState.addEventListener("change", (state) => {
		if (state === "active" && backgrounded) {
			backgrounded = false;
			void trackEvent("app_became_active");
		} else if (state !== "active" && !backgrounded) {
			backgrounded = true;
			void trackEvent("app_backgrounded");
		}
	});
	return () => subscription.remove();
}
