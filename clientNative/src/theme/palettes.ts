import type { Material3Scheme } from "@pchmn/expo-material3-theme";

export type ResolvedThemeMode = "dark" | "light";
export type ThemeMode = ResolvedThemeMode | "system";

export type AppTheme = {
	mode: ResolvedThemeMode;
	bg: string;
	surface: string;
	surfaceSoft: string;
	border: string;
	text: string;
	muted: string;
	accent: string;
	accentHover: string;
	accentSoft: string;
	gridLine: string;
	timeLine: string;
	warn: string;
	danger: string;
	cardShadow: string;
	elevation?: {
		low: string;
		medium: string;
		high: string;
	};
};

export const palettes: Record<ResolvedThemeMode, AppTheme> = {
	dark: {
		mode: "dark",
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
		elevation: {
			low: "#1D252F",
			medium: "#212A36",
			high: "#252F3C",
		},
	},

	light: {
		mode: "light",
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
		elevation: {
			low: "#FFFFFF",
			medium: "#FFFFFF",
			high: "#FFFFFF",
		},
	},
};

export function mapMaterial3SchemeToAppTheme(scheme: Material3Scheme, mode: ResolvedThemeMode): AppTheme {
	console.log(scheme);
	return {
		mode,
		bg: scheme.background,
		surface: scheme.surfaceContainerLow || scheme.surface,
		surfaceSoft: scheme.surfaceContainer || scheme.surfaceVariant,
		border: scheme.outlineVariant || scheme.outline,
		text: scheme.onBackground,
		muted: scheme.onSurfaceVariant,
		accent: scheme.primary,
		accentHover: scheme.primaryContainer,
		accentSoft: scheme.primaryContainer,
		gridLine: scheme.outlineVariant || scheme.outline,
		timeLine: scheme.tertiaryContainer,
		warn: mode === "dark" ? "#f59e0b" : "#b45309",
		danger: scheme.errorContainer,
		cardShadow: scheme.shadow,
		elevation: scheme.elevation
			? {
					low: scheme.elevation.level1,
					medium: scheme.elevation.level3,
					high: scheme.elevation.level5,
				}
			: undefined,
	};
}
