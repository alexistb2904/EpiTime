import { NativeModules } from "react-native";
import { getJSON } from "../services/storage";
import { mixHex, palettes, type DynamicScheme, type ResolvedThemeMode } from "../theme/palettes";

export type CourseWidgetThemeName = ResolvedThemeMode;

type Hex = `#${string}`;

export type CourseWidgetTheme = {
	background: Hex;
	container: Hex;
	onContainer: Hex;
	onContainerMuted: Hex;
	chip: Hex;
	primary: Hex;
	text: Hex;
	textMuted: Hex;
	transparent: Hex;
};

const dynamicSchemes = NativeModules.EpiTimeDynamicColors?.getConstants?.() as Partial<Record<ResolvedThemeMode, DynamicScheme>> | undefined;

function build(mode: ResolvedThemeMode, scheme?: DynamicScheme): CourseWidgetTheme {
	const dark = mode === "dark";
	if (scheme) {
		const background = hex(scheme.surfaceContainer);
		return {
			background,
			container: hex(scheme.primaryContainer),
			onContainer: hex(scheme.onBackground),
			onContainerMuted: mixHex(scheme.onBackground, scheme.primaryContainer, 0.3) as Hex,
			chip: mixHex(background, scheme.primary, dark ? 0.16 : 0.1) as Hex,
			primary: hex(scheme.primary),
			text: hex(scheme.onBackground),
			textMuted: hex(scheme.onSurfaceVariant),
			transparent: "#00000000",
		};
	}
	const palette = palettes[mode];
	const background = hex(palette.surface);
	const container = mixHex(background, palette.accent, dark ? 0.26 : 0.14) as Hex;
	return {
		background,
		container,
		onContainer: hex(palette.text),
		onContainerMuted: mixHex(palette.text, container, 0.3) as Hex,
		chip: mixHex(background, palette.accent, dark ? 0.16 : 0.08) as Hex,
		primary: hex(palette.accent),
		text: hex(palette.text),
		textMuted: hex(palette.muted),
		transparent: "#00000000",
	};
}

export async function courseWidgetThemes(): Promise<Record<ResolvedThemeMode, CourseWidgetTheme>> {
	const materialYou = (await getJSON<boolean>("materialYouEnabled", true).catch(() => true)) !== false;
	const use = materialYou && dynamicSchemes?.light && dynamicSchemes?.dark;
	return {
		light: build("light", use ? dynamicSchemes.light : undefined),
		dark: build("dark", use ? dynamicSchemes.dark : undefined),
	};
}

export const fallbackWidgetTheme = build("light");

function hex(value: string): Hex {
	return value.startsWith("#") ? (value as Hex) : "#000000";
}
