import React from "react";
import { Pressable, PressableProps, StyleSheet, View, ViewProps } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { useTheme } from "../context/ThemeContext";

type CardProps = ViewProps & {
	onPress?: PressableProps["onPress"];
	disabled?: boolean;
	accent?: boolean;
	accentColor?: string;
	variant?: "default" | "flat" | "glass" | "compact";
	glow?: boolean;
	children?: React.ReactNode;
};

export default function Card({ onPress, disabled, accent = false, accentColor, variant = "default", glow = true, children, style, ...props }: CardProps) {
	const { theme } = useTheme();
	const scale = useSharedValue(1);
	const translateY = useSharedValue(0);
	const color = accentColor || theme.accent;

	const animatedStyle = useAnimatedStyle(() => ({
		transform: [{ scale: scale.value }, { translateY: translateY.value }],
	}));

	const content = (
		<Animated.View
			{...props}
			style={[
				s.card,
				variant === "flat" && s.flat,
				variant === "glass" && s.glass,
				variant === "compact" && s.compact,
				{
					backgroundColor: variant === "glass" ? theme.accentSoft : theme.surface,
					borderColor: accent ? color : theme.border,
					shadowColor: theme.cardShadow,
				},
				animatedStyle,
				style,
			]}>
			{glow ? <View pointerEvents="none" style={[s.glow, { backgroundColor: accent ? color : theme.accentSoft }]} /> : null}
			{accent ? <View pointerEvents="none" style={[s.accentLine, { backgroundColor: color }]} /> : null}
			{children}
		</Animated.View>
	);

	if (!onPress) return content;

	return (
		<Pressable
			disabled={disabled}
			onPress={onPress}
			onPressIn={() => {
				scale.value = withSpring(0.975, { damping: 18, stiffness: 260 });
				translateY.value = withSpring(2, { damping: 18, stiffness: 260 });
			}}
			onPressOut={() => {
				scale.value = withSpring(1, { damping: 16, stiffness: 220 });
				translateY.value = withSpring(0, { damping: 16, stiffness: 220 });
			}}>
			{content}
		</Pressable>
	);
}

const s = StyleSheet.create({
	card: {
		borderWidth: 1,
		borderRadius: 22,
		padding: 16,
		shadowOpacity: 0.1,
		shadowRadius: 22,
		shadowOffset: { width: 0, height: 12 },
		elevation: 3,
		overflow: "hidden",
	},
	flat: {
		shadowOpacity: 0,
		elevation: 0,
	},
	glass: {
		shadowOpacity: 0.06,
		elevation: 1,
	},
	compact: {
		borderRadius: 16,
		padding: 12,
		shadowOpacity: 0.06,
		shadowRadius: 14,
		shadowOffset: { width: 0, height: 7 },
		elevation: 1,
	},
	glow: {
		position: "absolute",
		top: -80,
		right: -70,
		width: 150,
		height: 150,
		borderRadius: 100,
		opacity: 0.8,
	},
	accentLine: {
		position: "absolute",
		left: 0,
		top: 0,
		bottom: 0,
		width: 5,
	},
});
