import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { Session } from "../types";
const SESSION_KEY = "epitime.session";

const canUseSecureStore = Platform.OS !== "web";

export async function saveSession(session: Session) {
	const raw = JSON.stringify(session);
	if (canUseSecureStore) {
		await SecureStore.setItemAsync(SESSION_KEY, raw);
		return;
	}
	await AsyncStorage.setItem(SESSION_KEY, raw);
}
export async function getSession() {
	const raw = canUseSecureStore ? await SecureStore.getItemAsync(SESSION_KEY) : await AsyncStorage.getItem(SESSION_KEY);
	if (!raw) return null;
	try {
		return JSON.parse(raw) as Session;
	} catch {
		await clearSession();
		return null;
	}
}
export async function clearSession() {
	if (canUseSecureStore) {
		await SecureStore.deleteItemAsync(SESSION_KEY);
		return;
	}
	await AsyncStorage.removeItem(SESSION_KEY);
}
export async function setJSON<T>(key: string, value: T) {
	await AsyncStorage.setItem(key, JSON.stringify(value));
}
export async function getJSON<T>(key: string, fallback: T) {
	const raw = await AsyncStorage.getItem(key);
	if (!raw) return fallback;
	try {
		return JSON.parse(raw) as T;
	} catch {
		await AsyncStorage.removeItem(key);
		return fallback;
	}
}
