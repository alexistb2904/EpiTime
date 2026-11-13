export type DynamicScheme = Record<
	"primary" | "primaryContainer" | "tertiaryContainer" | "background" | "onBackground" | "surface" | "surfaceContainerLow" | "surfaceContainer" | "onSurfaceVariant" | "outlineVariant",
	string
>;

export function mixHex(a: string, b: string, ratio: number): string {
	const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
	return "#" + [0, 1, 2].map((i) => Math.round(channel(a, i) * (1 - ratio) + channel(b, i) * ratio).toString(16).padStart(2, "0")).join("").toUpperCase();
}

export type ResolvedThemeMode = "dark" | "light";
export type ThemeMode = ResolvedThemeMode | "system";

export type BaseTheme = {
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

/** Text/icon colors that stay readable on accent/danger/warn backgrounds (derived in ThemeContext). */
export type AppTheme = BaseTheme & { onAccent: string; onDanger: string; onWarn: string };

export const palettes: Record<ResolvedThemeMode, BaseTheme> = {
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

export function mapDynamicSchemeToAppTheme(scheme: DynamicScheme, mode: ResolvedThemeMode): BaseTheme {
	return {
		mode,
		bg: scheme.background,
		surface: scheme.surfaceContainerLow,
		surfaceSoft: scheme.surfaceContainer,
		border: scheme.outlineVariant,
		text: scheme.onBackground,
		muted: scheme.onSurfaceVariant,
		accent: scheme.primary,
		accentHover: scheme.primaryContainer,
		accentSoft: scheme.primaryContainer,
		gridLine: scheme.outlineVariant,
		timeLine: scheme.tertiaryContainer,
		warn: mode === "dark" ? "#f59e0b" : "#b45309",
		danger: mode === "dark" ? "#93000A" : "#FFDAD6",
		cardShadow: "#000000",
		elevation: {
			low: mixHex(scheme.surface, scheme.primary, 0.05),
			medium: mixHex(scheme.surface, scheme.primary, 0.11),
			high: mixHex(scheme.surface, scheme.primary, 0.14),
		},
	};
}
