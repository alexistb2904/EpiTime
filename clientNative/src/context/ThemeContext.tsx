import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { NativeModules, useColorScheme } from "react-native";
import { getJSON, setJSON } from "../services/storage";
import { readableTextOn } from "../utils/calendar";
import { mapDynamicSchemeToAppTheme, palettes, type DynamicScheme, type AppTheme, type ResolvedThemeMode, type ThemeMode } from "../theme/palettes";

type ThemeContextValue = {
	theme: AppTheme;
	mode: ThemeMode;
	resolvedMode: ResolvedThemeMode;
	materialYouEnabled: boolean;
	materialYouAvailable: boolean;
	materialYouActive: boolean;
	toggleTheme: () => Promise<void>;
	setThemeMode: (mode: ThemeMode) => Promise<void>;
	setMaterialYouEnabled: (enabled: boolean) => Promise<void>;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const THEME_MODE_KEY = "themeMode";
const MATERIAL_YOU_ENABLED_KEY = "materialYouEnabled";
const dynamicSchemes = NativeModules.EpiTimeDynamicColors?.getConstants?.() as Partial<Record<ResolvedThemeMode, DynamicScheme>> | undefined;
const isDynamicThemeSupported = Boolean(dynamicSchemes?.light && dynamicSchemes?.dark);

function normalizeThemeMode(value: unknown): ThemeMode {
	return value === "light" || value === "dark" || value === "system" ? value : "system";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
	const systemColorScheme = useColorScheme();
	const [mode, setMode] = useState<ThemeMode>("system");
	const [materialYouEnabled, setMaterialYouEnabledState] = useState(true);
	const resolvedMode: ResolvedThemeMode = mode === "system" ? (systemColorScheme === "dark" ? "dark" : "light") : mode;
	const materialYouActive = materialYouEnabled && isDynamicThemeSupported;

	useEffect(() => {
		getJSON<ThemeMode>(THEME_MODE_KEY, "system")
			.then((storedMode) => setMode(normalizeThemeMode(storedMode)))
			.catch(() => {});
		getJSON<boolean>(MATERIAL_YOU_ENABLED_KEY, true)
			.then((enabled) => setMaterialYouEnabledState(enabled !== false))
			.catch(() => {});
	}, []);

	const setThemeMode = async (next: ThemeMode) => {
		const normalized = normalizeThemeMode(next);
		setMode(normalized);
		await setJSON(THEME_MODE_KEY, normalized);
	};

	const setMaterialYouEnabled = async (enabled: boolean) => {
		setMaterialYouEnabledState(enabled);
		await setJSON(MATERIAL_YOU_ENABLED_KEY, enabled);
	};

	const theme = useMemo(() => {
		const scheme = dynamicSchemes?.[resolvedMode];
		const base = materialYouActive && scheme ? mapDynamicSchemeToAppTheme(scheme, resolvedMode) : palettes[resolvedMode];
		return { ...base, onAccent: readableTextOn(base.accent), onDanger: readableTextOn(base.danger), onWarn: readableTextOn(base.warn) };
	}, [materialYouActive, resolvedMode]);

	const toggleTheme = async () => {
		const next = resolvedMode === "dark" ? "light" : "dark";
		setMode(next);
		await setJSON(THEME_MODE_KEY, next);
	};

	const value = useMemo(
		() => ({
			theme,
			mode,
			resolvedMode,
			materialYouEnabled,
			materialYouAvailable: isDynamicThemeSupported,
			materialYouActive,
			toggleTheme,
			setThemeMode,
			setMaterialYouEnabled,
		}),
		[materialYouActive, materialYouEnabled, mode, resolvedMode, theme]
	);

	return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
	const value = useContext(ThemeContext);
	if (!value) throw new Error("useTheme hors ThemeProvider");
	return value;
}
