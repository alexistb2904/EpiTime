import React, { useEffect } from "react";
import { Image, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Animated, { FadeInDown, ZoomIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import { StatusBar } from "expo-status-bar";
import { WindowsLogo } from "phosphor-react-native";
import ActionButton from "../components/ActionButton";
import CourseMarquee, { EASE_OUT, MARQUEE_ROWS } from "../components/CourseMarquee";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { trackScreen } from "../services/analytics";

export default function LoginScreen() {
	const { login, loading } = useAuth();
	const { theme, resolvedMode } = useTheme();
	const insets = useSafeAreaInsets();
	const { height } = useWindowDimensions();
	const compact = height < 700;

	useEffect(() => {
		void trackScreen("login");
	}, []);

	return (
		<View style={[s.root, { backgroundColor: theme.bg }]}>
			<StatusBar style={resolvedMode === "dark" ? "light" : "dark"} />
			<ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false} bounces={false}>
				<View style={{ paddingTop: insets.top + 20 }}>
					<CourseMarquee rows={MARQUEE_ROWS.slice(0, 2)} compact={compact} />
					<View style={[s.logoZone, compact && s.logoZoneCompact]} />
					<CourseMarquee rows={MARQUEE_ROWS.slice(2)} startIndex={2} compact={compact} />
					{/* Clears the middle of the field so the logo sits on calm ground. */}
					<Svg pointerEvents="none" style={StyleSheet.absoluteFill}>
						<Defs>
							<RadialGradient id="calm" cx="50%" cy="54%" rx="62%" ry="40%">
								<Stop offset="0.3" stopColor={theme.bg} stopOpacity={1} />
								<Stop offset="1" stopColor={theme.bg} stopOpacity={0} />
							</RadialGradient>
						</Defs>
						<Rect width="100%" height="100%" fill="url(#calm)" />
					</Svg>
					<View pointerEvents="none" style={[StyleSheet.absoluteFill, s.logoCenter, { paddingTop: insets.top + 20 }]}>
						<Animated.View
							entering={ZoomIn.delay(180).duration(620).easing(EASE_OUT)}
							style={[s.logoTile, compact && s.logoTileCompact, { borderColor: theme.border, shadowColor: theme.cardShadow }]}>
							<Image source={require("../../assets/logo.png")} style={s.logo} resizeMode="contain" accessibilityLabel="EpiTime" />
						</Animated.View>
					</View>
				</View>

				<Animated.View entering={FadeInDown.delay(300).duration(520).easing(EASE_OUT)} style={s.copy}>
					<Text style={[s.title, compact && s.titleCompact, { color: theme.text }]} accessibilityRole="header">
						Tout ton campus,{"\n"}à tes couleurs.
					</Text>
					<Text style={[s.sub, { color: theme.muted }]}>Planning, salles libres, notes Auriga et rappels avant chaque cours.</Text>
				</Animated.View>

				<Animated.View entering={FadeInDown.delay(400).duration(520).easing(EASE_OUT)} style={[s.actions, { paddingBottom: Math.max(insets.bottom, 12) + 12 }]}>
					<ActionButton label={loading ? "Connexion…" : "Connexion Microsoft"} icon={WindowsLogo} onPress={login} busy={loading} />
					<Text style={[s.legal, { color: theme.text }]}>
						Données stockées localement. EpiTime ne partage aucune information sur tes activités ou ta localisation. EpiTime n'est pas affilié à Zeus, IONIS Education
						Group ou EPITA.
					</Text>
				</Animated.View>
			</ScrollView>
		</View>
	);
}

const s = StyleSheet.create({
	root: { flex: 1, overflow: "hidden" },
	content: { flexGrow: 1 },
	logoZone: { height: 168 },
	logoZoneCompact: { height: 124 },
	logoCenter: { alignItems: "center", justifyContent: "center" },
	logoTile: {
		width: 120,
		height: 120,
		borderRadius: 34,
		borderWidth: StyleSheet.hairlineWidth,
		// The mark is drawn for a white ground, like the launcher icon.
		backgroundColor: "#FFFFFF",
		alignItems: "center",
		justifyContent: "center",
		shadowOpacity: 0.18,
		shadowRadius: 22,
		shadowOffset: { width: 0, height: 12 },
		elevation: 8,
	},
	logoTileCompact: { width: 92, height: 92, borderRadius: 26 },
	logo: { width: "112%", height: "112%" },
	copy: { flexGrow: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 28, paddingVertical: 24, gap: 10 },
	title: { fontSize: 30, lineHeight: 36, fontWeight: "900", letterSpacing: -0.4, textAlign: "center", maxWidth: 340 },
	titleCompact: { fontSize: 26, lineHeight: 31 },
	sub: { fontSize: 16, lineHeight: 23, fontWeight: "600", textAlign: "center", maxWidth: 320 },
	actions: { paddingHorizontal: 24, gap: 14, alignSelf: "center", width: "100%", maxWidth: 460 },
	legal: { fontSize: 12, lineHeight: 17, fontWeight: "600", textAlign: "center", opacity: 0.72 },
});
