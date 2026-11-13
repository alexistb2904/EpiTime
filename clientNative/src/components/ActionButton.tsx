import React from "react";
import { ActivityIndicator, Pressable, StyleProp, StyleSheet, Text, ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import type { Icon } from "phosphor-react-native";
import { useTheme } from "../context/ThemeContext";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const SPRING = { damping: 18, stiffness: 320 };

type Props = {
	label: string;
	onPress: () => void;
	icon?: Icon;
	variant?: "primary" | "secondary";
	disabled?: boolean;
	busy?: boolean;
	style?: StyleProp<ViewStyle>;
};

export default function ActionButton({ label, onPress, icon: ButtonIcon, variant = "primary", disabled, busy, style }: Props) {
	const { theme } = useTheme();
	const scale = useSharedValue(1);
	const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
	const filled = variant === "primary" && !disabled;
	const color = filled ? theme.onAccent : variant === "primary" ? theme.muted : theme.text;

	return (
		<AnimatedPressable
			onPress={onPress}
			onPressIn={() => (scale.value = withSpring(0.97, SPRING))}
			onPressOut={() => (scale.value = withSpring(1, SPRING))}
			disabled={disabled || busy}
			accessibilityRole="button"
			accessibilityState={{ disabled: Boolean(disabled || busy), busy: Boolean(busy) }}
			style={[s.button, filled ? { backgroundColor: theme.accent } : { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border }, busy && s.busy, pressStyle, style]}>
			{busy ? <ActivityIndicator color={color} /> : ButtonIcon ? <ButtonIcon color={color} size={20} weight="bold" /> : null}
			<Text style={[s.label, { color }]}>{label}</Text>
		</AnimatedPressable>
	);
}

const s = StyleSheet.create({
	button: { minHeight: 56, borderRadius: 18, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
	busy: { opacity: 0.76 },
	label: { fontWeight: "900", fontSize: 16, textAlign: "center" },
});
