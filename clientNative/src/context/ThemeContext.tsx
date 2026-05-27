import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";
import { isDynamicThemeSupported, useMaterial3Theme } from "@pchmn/expo-material3-theme";
import { getJSON, setJSON } from "../services/storage";
import { mapMaterial3SchemeToAppTheme, palettes, type AppTheme, type ResolvedThemeMode, type ThemeMode } from "../theme/palettes";

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

function normalizeThemeMode(value: unknown): ThemeMode {
	return value === "light" || value === "dark" || value === "system" ? value : "system";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
	const systemColorScheme = useColorScheme();
	const { theme: material3Theme } = useMaterial3Theme({ fallbackSourceColor: palettes.light.accent, colorFidelity: true });
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
		if (!materialYouActive) return palettes[resolvedMode];
		return mapMaterial3SchemeToAppTheme(material3Theme[resolvedMode], resolvedMode);
	}, [material3Theme, materialYouActive, resolvedMode]);

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
