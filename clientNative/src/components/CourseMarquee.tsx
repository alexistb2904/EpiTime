import React, { useEffect, useState } from "react";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Animated, { cancelAnimation, Easing, FadeInLeft, FadeInRight, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { BellRinging, BookOpenText, CalendarDots, DoorOpen, GraduationCap, type Icon } from "phosphor-react-native";
import { useTheme } from "../context/ThemeContext";
import { mixHex } from "../theme/palettes";
import { coursePalette, hexToRgba } from "../utils/calendar";

export type MarqueeChip = { label: string; icon?: Icon };

export const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);

// What the app holds, as it will look once signed in: subjects in their colours, next to the features that serve them.
export const MARQUEE_ROWS: MarqueeChip[][] = [
	[{ label: "Algorithmique" }, { label: "Agenda", icon: CalendarDots }, { label: "Réseaux" }, { label: "TD" }, { label: "Anglais" }, { label: "Partiel" }],
	[{ label: "Salles libres", icon: DoorOpen }, { label: "Maths" }, { label: "Amphi" }, { label: "Projet" }, { label: "Rappels", icon: BellRinging }, { label: "TP" }],
	[{ label: "Systèmes" }, { label: "Notes", icon: GraduationCap }, { label: "Conférence" }, { label: "SQL" }, { label: "Moyennes" }, { label: "Soutenance" }],
	[{ label: "Syllabus", icon: BookOpenText }, { label: "Sécurité" }, { label: "Cours" }, { label: "Électronique" }, { label: "Atelier" }, { label: "Physique" }],
];

const GAP = 10;

function Row({ chips, index, compact }: { chips: MarqueeChip[]; index: number; compact?: boolean }) {
	const { theme } = useTheme();
	const { width: screen } = useWindowDimensions();
	const reduced = useReducedMotion();
	const [setWidth, setSetWidth] = useState(0);
	const x = useSharedValue(0);
	const reverse = index % 2 === 1;
	const dark = theme.mode === "dark";

	useEffect(() => {
		if (!setWidth || reduced) return;
		x.value = withRepeat(withTiming(1, { duration: (setWidth / (18 + index * 5)) * 1000, easing: Easing.linear }), -1, false);
		return () => cancelAnimation(x);
	}, [index, reduced, setWidth, x]);

	// One set scrolls out exactly as its copy scrolls in, so the loop has no seam.
	const drift = useAnimatedStyle(() => ({ transform: [{ translateX: (reverse ? x.value - 1 : -x.value) * setWidth }] }));
	const copies = setWidth ? Math.ceil(screen / setWidth) + 1 : 1;

	return (
		<Animated.View entering={(reverse ? FadeInLeft : FadeInRight).delay(index * 80).duration(700).easing(EASE_OUT)}>
			<Animated.View style={[s.row, { marginLeft: -((index * 37) % 80) }, drift]}>
				{Array.from({ length: copies }, (_, copy) => (
					<View key={copy} style={s.set} onLayout={copy === 0 ? (event) => setSetWidth(event.nativeEvent.layout.width) : undefined}>
						{chips.map((chip, i) => {
							const color = coursePalette[(index * 4 + i * 2) % coursePalette.length];
							const ink = dark ? color : mixHex(color, "#000000", 0.35);
							const ChipIcon = chip.icon;
							return (
								<View
									key={chip.label}
									style={[s.chip, compact && s.chipCompact, { backgroundColor: hexToRgba(color, dark ? 0.15 : 0.09), borderColor: hexToRgba(color, dark ? 0.4 : 0.3) }]}>
									{ChipIcon ? <ChipIcon color={ink} size={compact ? 16 : 18} weight="bold" /> : null}
									<Text allowFontScaling={false} style={[s.label, compact && s.labelCompact, { color: ink }]}>
										{chip.label}
									</Text>
								</View>
							);
						})}
					</View>
				))}
			</Animated.View>
		</Animated.View>
	);
}

/** Rows of course-coloured chips drifting in opposite directions. Decorative: hidden from screen readers. */
export default function CourseMarquee({ rows, startIndex = 0, compact }: { rows: MarqueeChip[][]; startIndex?: number; compact?: boolean }) {
	return (
		<View pointerEvents="none" style={s.rows} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
			{rows.map((chips, i) => (
				<Row key={i} chips={chips} index={startIndex + i} compact={compact} />
			))}
		</View>
	);
}

const s = StyleSheet.create({
	rows: { gap: 12 },
	row: { flexDirection: "row" },
	set: { flexDirection: "row", gap: GAP, paddingRight: GAP },
	chip: { height: 48, borderRadius: 18, borderWidth: 1, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 8 },
	chipCompact: { height: 40, borderRadius: 15, paddingHorizontal: 13, gap: 6 },
	label: { fontSize: 18, fontWeight: "900" },
	labelCompact: { fontSize: 15 },
});
