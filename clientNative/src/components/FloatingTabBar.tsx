import React, { useEffect } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from "react-native-reanimated";
import { Bell, CalendarDots, GearSix, GraduationCap, House, type Icon } from "phosphor-react-native";
import { useTheme } from "../context/ThemeContext";

const ICONS: Record<string, Icon> = {
	Accueil: House,
	Agenda: CalendarDots,
	Notes: GraduationCap,
	Notifications: Bell,
	Réglages: GearSix,
};

const SPRING = { damping: 20, stiffness: 240, mass: 0.8 };

export default function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
	const { theme } = useTheme();
	const insets = useSafeAreaInsets();

	return (
		<View style={[s.wrap, { backgroundColor: theme.bg, paddingBottom: Math.max(insets.bottom, 12) }]}>
			<View style={[s.bar, { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.cardShadow }]}>
				{state.routes.map((route, index) => {
					const { options } = descriptors[route.key];
					const label = typeof options.tabBarLabel === "string" ? options.tabBarLabel : (options.title ?? route.name);
					const focused = state.index === index;
					const onPress = () => {
						const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
						if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
					};
					const onLongPress = () => navigation.emit({ type: "tabLongPress", target: route.key });
					return <Tab key={route.key} label={label} Icon={ICONS[route.name] ?? House} focused={focused} onPress={onPress} onLongPress={onLongPress} />;
				})}
			</View>
		</View>
	);
}

type TabProps = { label: string; Icon: Icon; focused: boolean; onPress: () => void; onLongPress: () => void };

function Tab({ label, Icon, focused, onPress, onLongPress }: TabProps) {
	const { theme } = useTheme();
	const progress = useSharedValue(focused ? 1 : 0);
	const pop = useSharedValue(1);

	useEffect(() => {
		progress.value = withSpring(focused ? 1 : 0, SPRING);
		if (focused) pop.value = withSequence(withTiming(1.12, { duration: 70 }), withSpring(1, { damping: 16, stiffness: 420 }));
	}, [focused]);

	const tabStyle = useAnimatedStyle(() => ({ flexGrow: 1 + 1.7 * progress.value }));
	const pillStyle = useAnimatedStyle(() => ({
		opacity: progress.value,
		transform: [{ scaleX: interpolate(progress.value, [0, 1], [0.6, 1]) }],
	}));
	const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
	const labelStyle = useAnimatedStyle(() => ({
		opacity: interpolate(progress.value, [0.4, 1], [0, 1], "clamp"),
		maxWidth: interpolate(progress.value, [0, 1], [0, 96]),
		marginLeft: 6 * progress.value,
		transform: [{ translateX: interpolate(progress.value, [0, 1], [-6, 0]) }],
	}));

	return (
		<Animated.View style={[s.tabSlot, tabStyle]}>
			<Pressable
				onPress={onPress}
				onLongPress={onLongPress}
				accessibilityRole="tab"
				accessibilityLabel={label}
				accessibilityState={{ selected: focused }}
				hitSlop={4}
				style={s.tab}>
				<Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, s.pill, { backgroundColor: theme.accentSoft }, pillStyle]} />
				<Animated.View style={iconStyle}>
					<Icon size={23} color={focused ? theme.accent : theme.muted} weight={focused ? "fill" : "regular"} />
				</Animated.View>
				<Animated.Text numberOfLines={1} style={[s.label, { color: theme.accent }, labelStyle]}>
					{label}
				</Animated.Text>
			</Pressable>
		</Animated.View>
	);
}

const s = StyleSheet.create({
	wrap: { paddingHorizontal: 12, paddingTop: 6 },
	bar: {
		flexDirection: "row",
		height: 64,
		padding: 6,
		borderRadius: 26,
		borderWidth: StyleSheet.hairlineWidth,
		shadowOpacity: 0.16,
		shadowRadius: 18,
		shadowOffset: { width: 0, height: 8 },
		elevation: 8,
	},
	tabSlot: { flexBasis: 0, flexShrink: 1 },
	tab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
	pill: { borderRadius: 20 },
	label: { fontSize: 12.5, fontWeight: "700", letterSpacing: 0.1 },
});
