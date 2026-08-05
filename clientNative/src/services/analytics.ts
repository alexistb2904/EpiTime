import AsyncStorage from "@react-native-async-storage/async-storage";
import rybbit from "@rybbit/react-native";
import Constants from "expo-constants";
import { AppState, Platform } from "react-native";
import { publicConfig } from "./config";
import { isNetworkOnline, subscribeNetworkState } from "./networkStatus";
import { canTrackAnalytics, sanitizeAnalyticsEventName, sanitizeAnalyticsProperties, type AnalyticsProperties } from "./analyticsUtils";

export type { AnalyticsProperties } from "./analyticsUtils";

const CONSENT_KEY = "epitime_analytics_consent_native";
const RYBBIT_API_BASE = (publicConfig.rybbitAnalyticsHost || "").replace(/\/$/, "");
const RYBBIT_SITE_ID = publicConfig.rybbitSiteId || "";
const DEBUG = process.env.EXPO_PUBLIC_ANALYTICS_DEBUG === "true";

let networkUnsubscribe: (() => void) | null = null;
let lastNetworkStatus: "online" | "offline" | null = null;
let initializationPromise: Promise<boolean> | null = null;
let initialized = false;

const getMetadata = () => ({
	platform: Platform.OS === "ios" ? "ios" : "android",
	app_version: Constants.nativeAppVersion || Constants.expoConfig?.version || "unknown",
	build_version: Constants.nativeBuildVersion || "unknown",
	environment: typeof __DEV__ === "boolean" && __DEV__ ? "development" : "production",
});

async function initializeRybbit() {
	if (initialized) return true;
	if (!RYBBIT_API_BASE || !RYBBIT_SITE_ID) {
		if (DEBUG) console.warn("[analytics] Rybbit native config is incomplete");
		return false;
	}
	if (initializationPromise) return initializationPromise;

	initializationPromise = rybbit
		.init({
			analyticsHost: RYBBIT_API_BASE,
			siteId: RYBBIT_SITE_ID,
			appIdentifier: Constants.expoConfig?.android?.package || Constants.expoConfig?.ios?.bundleIdentifier || "fr.alexistb2904.epitime",
			appVersion: Constants.nativeAppVersion || Constants.expoConfig?.version || "unknown",
			storage: AsyncStorage,
			autoTrackAppLifecycle: false,
			debug: DEBUG,
		})
		.then(() => {
			initialized = true;
			return true;
		})
		.catch((error) => {
			if (DEBUG) console.warn("[analytics] Rybbit initialization failed", error);
			return false;
		})
		.finally(() => {
			initializationPromise = null;
		});

	return initializationPromise;
}

function subscribeToNetwork() {
	if (networkUnsubscribe) return;
	networkUnsubscribe = subscribeNetworkState((state) => {
		const status = isNetworkOnline(state) ? "online" : "offline";
		if (status !== lastNetworkStatus) {
			lastNetworkStatus = status;
			void trackEvent("network_status_changed", { status });
		}
		if (status === "online" && initialized) void rybbit.flush();
	});
}

export async function getAnalyticsConsent() {
	try {
		return canTrackAnalytics(await AsyncStorage.getItem(CONSENT_KEY));
	} catch {
		return false;
	}
}

export async function setAnalyticsConsent(accepted: boolean, userId?: string) {
	try {
		await AsyncStorage.setItem(CONSENT_KEY, accepted ? "accepted" : "declined");
		if (!accepted) {
			networkUnsubscribe?.();
			networkUnsubscribe = null;
			if (initialized) await rybbit.clearUserId();
			initialized = false;
			return;
		}
		subscribeToNetwork();
		await initializeRybbit();
		if (userId) await identifyAnalyticsUser(userId);
	} catch {
		// Consent changes must never interrupt the user flow.
	}
}

export async function initializeAnalytics() {
	if (!(await getAnalyticsConsent())) return;
	subscribeToNetwork();
	await initializeRybbit();
}

export async function trackEvent(eventName: string, properties: AnalyticsProperties = {}) {
	if (!(await getAnalyticsConsent())) return;
	const safeEventName = sanitizeAnalyticsEventName(eventName);
	if (!safeEventName) return;
	if (!(await initializeRybbit())) return;
	try {
		await rybbit.event(safeEventName, { ...sanitizeAnalyticsProperties(safeEventName, properties), ...getMetadata() });
	} catch (error) {
		if (DEBUG) console.warn(`[analytics] ${safeEventName} failed`, error);
	}
}

export async function identifyAnalyticsUser(userId: string) {
	if (!(await getAnalyticsConsent())) return;
	const normalizedUserId = userId.trim();
	if (!normalizedUserId || !(await initializeRybbit()) || rybbit.getUserId() === normalizedUserId) return;
	await rybbit.identify(normalizedUserId);
}

export async function clearAnalyticsUser() {
	if (!initialized) return;
	await rybbit.clearUserId();
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
