import React from "react";
import { Pressable, StyleProp, Text, View, ViewStyle } from "react-native";
import { TriangleAlert } from "lucide-react-native";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { s } from "./calendar/calendarStyles";

/** Shown instead of the login screen: the saved planning stays usable until the user reconnects. */
export default function SessionExpiredBanner({ style }: { style?: StyleProp<ViewStyle> }) {
	const { session, login } = useAuth();
	const { theme } = useTheme();
	if (!session?.reconnectRequired) return null;
	return (
		<View style={[s.banner, style, { backgroundColor: theme.surface, borderColor: theme.warn }]}>
			<TriangleAlert color={theme.warn} size={17} />
			<Pressable style={s.bannerBody} onPress={login} accessibilityRole="button">
				<Text style={[s.bannerText, { color: theme.text }]} numberOfLines={2}>
					Session expirée : planning enregistré affiché.
				</Text>
				<Text style={[s.bannerHint, { color: theme.accent }]}>Se reconnecter</Text>
			</Pressable>
		</View>
	);
}
