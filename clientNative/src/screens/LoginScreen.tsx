import React, { useEffect } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Animated, { Easing, FadeInDown, FadeInUp, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { BellRing, CalendarDays, DoorOpen, LogIn, ShieldCheck } from "lucide-react-native";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";

const features = [
	{ icon: CalendarDays, title: "Agenda", text: "Cours, intervenants et salles." },
	{ icon: DoorOpen, title: "Salles", text: "Disponibilités en direct." },
	{ icon: BellRing, title: "Rappels", text: "Notifications pour ne rater aucun cours." },
];

export default function LoginScreen() {
	const { login, loading } = useAuth();
	const { theme } = useTheme();
	const { width, height } = useWindowDimensions();
	const compact = width < 380 || height < 720;
	const drift = useSharedValue(0);
	const pulse = useSharedValue(1);

	useEffect(() => {
		drift.value = withRepeat(withTiming(1, { duration: 9000, easing: Easing.inOut(Easing.quad) }), -1, true);
		pulse.value = withRepeat(
			withSequence(withTiming(1.08, { duration: 1800, easing: Easing.inOut(Easing.quad) }), withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.quad) })),
			-1,
			false
		);
	}, [drift, pulse]);

	const orbA = useAnimatedStyle(() => ({
		transform: [{ translateX: drift.value * 42 }, { translateY: drift.value * -24 }, { scale: pulse.value }],
	}));
	const orbB = useAnimatedStyle(() => ({
		transform: [{ translateX: drift.value * -34 }, { translateY: drift.value * 32 }, { scale: 1.08 - (pulse.value - 1) }],
	}));
	const logoStyle = useAnimatedStyle(() => ({
		transform: [{ scale: pulse.value }],
	}));

	return (
		<View style={[s.root, { backgroundColor: theme.bg }]}>
			<Animated.View pointerEvents="none" style={[s.orb, s.orbA, { backgroundColor: theme.accent }, orbA]} />
			<Animated.View pointerEvents="none" style={[s.orb, s.orbB, { backgroundColor: theme.accentHover }, orbB]} />
			<ScrollView contentContainerStyle={[s.content, compact && s.contentCompact]} showsVerticalScrollIndicator={false}>
				<Animated.View entering={FadeInUp.duration(560)} style={[s.card, { backgroundColor: theme.surface, borderColor: theme.border, maxWidth: 460 }]}>
					<Animated.View style={[s.logoPlate, { borderColor: theme.border, borderWidth: 0 }, logoStyle]}>
						<Image source={require("../../assets/logo.png")} style={[s.logo, compact && s.logoCompact]} resizeMode="contain" />
					</Animated.View>
					<Text style={[s.sub, { color: theme.muted }]}>Ton agenda EPITA, tes salles et tes rappels dans une app pensée pour le quotidien.</Text>
					<Pressable disabled={loading} onPress={login} style={({ pressed }) => [s.btn, { backgroundColor: theme.accent, opacity: pressed || loading ? 0.76 : 1 }]}>
						{loading ? <ActivityIndicator color="#fff" /> : <LogIn color="#fff" size={20} />}
						<Text style={s.btnText}>Connexion Microsoft</Text>
					</Pressable>
				</Animated.View>

				<View style={[s.featureGrid, { maxWidth: 460 }]}>
					{features.map((feature, index) => {
						const Icon = feature.icon;
						return (
							<Animated.View
								key={feature.title}
								entering={FadeInDown.delay(120 + index * 70).duration(420)}
								style={[s.feature, { backgroundColor: theme.surface, borderColor: theme.border }]}>
								<View style={[s.featureIcon, { backgroundColor: theme.accentSoft }]}>
									<Icon color={theme.accent} size={20} />
								</View>
								<Text style={[s.featureTitle, { color: theme.text }]}>{feature.title}</Text>
								<Text style={[s.featureText, { color: theme.muted }]}>{feature.text}</Text>
							</Animated.View>
						);
					})}
				</View>

				<Animated.View entering={FadeInDown.delay(360).duration(420)} style={[s.privacy, { backgroundColor: theme.accentSoft, borderColor: theme.border, maxWidth: 460 }]}>
					<ShieldCheck color={theme.accent} size={18} />
					<Text style={[s.privacyText, { color: theme.text }]}>
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
	content: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 24, paddingVertical: 54 },
	contentCompact: { paddingVertical: 28 },
	orb: { position: "absolute", width: 280, height: 280, borderRadius: 180, opacity: 0.16 },
	orbA: { top: -80, left: -80 },
	orbB: { right: -100, bottom: -70 },
	card: {
		width: "100%",
		borderWidth: 1,
		borderRadius: 28,
		padding: 26,
		alignItems: "center",
		shadowColor: "#000",
		shadowOpacity: 0.1,
		shadowRadius: 28,
		shadowOffset: { width: 0, height: 18 },
		elevation: 5,
		overflow: "hidden",
	},
	badge: { flexDirection: "row", alignItems: "center", gap: 7, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, marginBottom: 18 },
	badgeText: { fontSize: 12, fontWeight: "900", textTransform: "uppercase" },
	logoPlate: { width: 132, height: 132, borderRadius: 32, borderWidth: 1, alignItems: "center", justifyContent: "center", marginBottom: 20 },
	logo: { width: 134, height: 134 },
	logoCompact: { width: 112, height: 112 },
	title: { fontSize: 48, fontWeight: "900", letterSpacing: 0 },
	titleCompact: { fontSize: 40 },
	sub: { textAlign: "center", marginTop: 10, marginBottom: 26, fontSize: 16, lineHeight: 23 },
	btn: { minHeight: 56, borderRadius: 18, paddingHorizontal: 22, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, alignSelf: "stretch" },
	btnText: { color: "white", fontWeight: "900", fontSize: 16 },
	featureGrid: { width: "100%", flexDirection: "row", gap: 10, marginTop: 14 },
	feature: { flex: 1, borderWidth: 1, borderRadius: 18, minHeight: 116, padding: 12, alignItems: "center", justifyContent: "center" },
	featureIcon: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center", marginBottom: 8 },
	featureTitle: { fontWeight: "900", fontSize: 13 },
	featureText: { textAlign: "center", marginTop: 4, fontSize: 11, lineHeight: 15 },
	privacy: { width: "100%", borderWidth: 1, borderRadius: 16, padding: 12, flexDirection: "row", gap: 10, marginTop: 14, alignItems: "flex-start" },
	privacyText: { flex: 1, fontSize: 12, lineHeight: 17, fontWeight: "700" },
});
