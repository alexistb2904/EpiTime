import { palettes, type ResolvedThemeMode } from "../theme/palettes";

export type CourseWidgetThemeName = "light" | "dark";

export type CourseWidgetTheme = {
	surface: `#${string}`;
	outline: `#${string}`;
	primary: `#${string}`;
	primaryContainer: `#${string}`;
	onPrimaryContainer: `#${string}`;
	rowMuted: `#${string}`;
	text: `#${string}`;
	textMuted: `#${string}`;
	textDisabled: `#${string}`;
	transparent: `#${string}`;
};

export function courseWidgetTheme(theme: CourseWidgetThemeName = "light") {
	const palette = palettes[theme as ResolvedThemeMode];
	return {
		surface: hex(palette.surface),
		outline: hex(palette.border),
		primary: hex(palette.accent),
		primaryContainer: hex(palette.accentSoft, hex(palette.surfaceSoft)),
		onPrimaryContainer: hex(palette.text),
		rowMuted: hex(palette.surfaceSoft),
		text: hex(palette.text),
		textMuted: hex(palette.muted),
		textDisabled: hex(palette.muted),
		transparent: "#00000000",
	} satisfies CourseWidgetTheme;
}

function hex(value: string, fallback: `#${string}` = "#000000") {
	return value.startsWith("#") ? (value as `#${string}`) : fallback;
}
