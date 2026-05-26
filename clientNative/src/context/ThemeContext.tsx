import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getJSON, setJSON } from "../services/storage";

type ThemeMode = "dark" | "light";

const palettes = {
	dark: {
		mode: "dark" as ThemeMode,
		bg: "#0f1115",
		surface: "#1a1d23",
		surfaceSoft: "#15171c",
		border: "#2d3340",
		text: "#f0f4f8",
		muted: "#94a3b8",
		accent: "#818cf8",
		accentHover: "#a5b4fc",
		accentSoft: "rgba(129, 140, 248, 0.15)",
		gridLine: "#2d3340",
		timeLine: "#fb7185",
		warn: "#f59e0b",
		danger: "#ef4444",
		cardShadow: "#000000",
	},
	light: {
		mode: "light" as ThemeMode,
		bg: "#f2f4f8",
		surface: "#ffffff",
		surfaceSoft: "#f2f4f8",
		border: "#e2e8f0",
		text: "#1a1c20",
		muted: "#6e7a8a",
		accent: "#5b5fef",
		accentHover: "#484bbf",
		accentSoft: "rgba(91, 95, 239, 0.1)",
		gridLine: "#edf2f7",
		timeLine: "#f43f5e",
		warn: "#b45309",
		danger: "#dc2626",
		cardShadow: "#000000",
	},
};

type ThemeContextValue = {
	theme: typeof palettes.dark;
	mode: ThemeMode;
	toggleTheme: () => Promise<void>;
	setThemeMode: (mode: ThemeMode) => Promise<void>;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
	const [mode, setMode] = useState<ThemeMode>("dark");

	useEffect(() => {
		getJSON<ThemeMode>("themeMode", "dark").then(setMode).catch(() => {});
	}, []);

	const setThemeMode = async (next: ThemeMode) => {
		setMode(next);
		await setJSON("themeMode", next);
	};

	const value = useMemo(
		() => ({
			theme: palettes[mode],
			mode,
			toggleTheme: async () => setThemeMode(mode === "dark" ? "light" : "dark"),
			setThemeMode,
		}),
		[mode]
	);

	return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
	const value = useContext(ThemeContext);
	if (!value) throw new Error("useTheme hors ThemeProvider");
	return value;
}
