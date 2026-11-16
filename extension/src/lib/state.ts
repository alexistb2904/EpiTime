import type { EventChange, ScheduleSnapshot } from "../../../shared/src/changes.ts";
import type { PlannedReminder } from "../../../shared/src/reminders.ts";
import { browser } from "./platform";
import { DEFAULT_SETTINGS, migrateSettings, type Settings } from "./settingsModel";

export * from "./settingsModel";

export type Link = {
	origin: string;
	user: { username: string; name?: string };
	groups: string[];

	webPush: { enabled: boolean; minutesBefore: number; days: number[] };
	theme?: "light" | "dark";
	linkedAt: number;
	updatedAt: number;
};

export type Session = { token: string; expiresAt: number | null };

export type SyncError = { kind: "auth" | "network" | "invalid" | "server" | "offline"; message: string; at: number };

export type ScheduleState = {
	reference: ScheduleSnapshot | null;
	lastSync: number | null;
	lastError: SyncError | null;

	pendingSuspicious: string | null;
};

export type ChangeLog = { items: Array<EventChange & { detectedAt: number }>; unseen: number; notifiedKeys: string[] };

type LocalShape = {
	settings: Settings;
	link: Link | null;
	linkRequestedAt: number | null;
	schedule: ScheduleState;
	changes: ChangeLog;
	plannedReminders: Record<string, PlannedReminder>;
	firedReminders: Record<string, number>;
};

const LOCAL_DEFAULTS: LocalShape = {
	settings: DEFAULT_SETTINGS,
	link: null,
	linkRequestedAt: null,
	schedule: { reference: null, lastSync: null, lastError: null, pendingSuspicious: null },
	changes: { items: [], unseen: 0, notifiedKeys: [] },
	plannedReminders: {},
	firedReminders: {},
};

export async function getLocal<K extends keyof LocalShape>(key: K): Promise<LocalShape[K]> {
	const stored = (await browser.storage.local.get(key))[key] as LocalShape[K] | undefined;
	return stored ?? structuredClone(LOCAL_DEFAULTS[key]);
}

export async function setLocal<K extends keyof LocalShape>(key: K, value: LocalShape[K]) {
	await browser.storage.local.set({ [key]: value });
}

export async function getSettings(): Promise<Settings> {
	const stored = (await browser.storage.local.get("settings")).settings as Partial<Settings> | undefined;
	return migrateSettings(stored);
}

export async function getSession(): Promise<Session | null> {
	return ((await browser.storage.local.get("session")).session as Session | undefined) ?? null;
}

export async function setSession(session: Session | null) {
	if (session) await browser.storage.local.set({ session });
	else await browser.storage.local.remove("session");
}
