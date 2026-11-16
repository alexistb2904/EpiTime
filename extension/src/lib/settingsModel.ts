export const SETTINGS_VERSION = 1;

export type ChangeCategories = { room: boolean; time: boolean; cancelled: boolean; created: boolean; other: boolean };

export type Settings = {
	version: number;
	reminders: {
		enabled: boolean;
		minutesBefore: number;

		source: "auto" | "always";
	};
	changes: { enabled: boolean; categories: ChangeCategories; windowDays: number };
	syncMinutes: number;
	ignoredSubjects: string[];
	theme: "auto" | "light" | "dark";
};

export const DEFAULT_SETTINGS: Settings = {
	version: SETTINGS_VERSION,
	reminders: { enabled: true, minutesBefore: 10, source: "auto" },
	changes: { enabled: true, categories: { room: true, time: true, cancelled: true, created: true, other: false }, windowDays: 7 },
	syncMinutes: 5,
	ignoredSubjects: [],
	theme: "auto",
};

export function migrateSettings(stored: Partial<Settings> | undefined): Settings {
	const base = structuredClone(DEFAULT_SETTINGS);
	if (!stored || typeof stored !== "object") return base;
	return {
		...base,
		...stored,
		version: SETTINGS_VERSION,
		reminders: { ...base.reminders, ...stored.reminders },
		changes: { ...base.changes, ...stored.changes, categories: { ...base.changes.categories, ...stored.changes?.categories } },
		ignoredSubjects: Array.isArray(stored.ignoredSubjects) ? stored.ignoredSubjects.filter((value) => typeof value === "string") : [],
	};
}
