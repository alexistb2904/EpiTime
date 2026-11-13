import React, { useEffect, useState } from "react";
import { Appearance, Image, StyleSheet, View } from "react-native";
import Animated, { Easing, useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";
import * as SplashScreen from "expo-splash-screen";
import Svg, { Circle } from "react-native-svg";
import { useAuth } from "../context/AuthContext";
import { palettes } from "../theme/palettes";
import { coursePalette } from "../utils/calendar";

// The native splash stays up until this overlay has painted the same frame.
void SplashScreen.preventAutoHideAsync().catch(() => {});

// Logo size and background must match the native splash (app.json, android res/values*/colors.xml).
const LOGO = 180;
const BOX = 200;
const RADIUS = 92;
const STROKE = 7;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const DRAW_MS = 640;
const EXIT_MS = 280;

// A day on the dial, clockwise from noon: five courses in their colours, a longer gap for lunch.
const ARCS = [
	{ from: 7, span: 62, color: coursePalette[0] },
	{ from: 83, span: 40, color: coursePalette[2] },
	{ from: 153, span: 84, color: coursePalette[4] },
	{ from: 251, span: 48, color: coursePalette[1] },
	{ from: 313, span: 40, color: coursePalette[6] },
];

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function Arc({ from, span, color, sweep }: { from: number; span: number; color: string; sweep: SharedValue<number> }) {
	const length = (span / 360) * CIRCUMFERENCE;
	// One sweep value draws every course as the hand passes it.
	const animatedProps = useAnimatedProps(() => {
		const t = Math.min(Math.max((sweep.value * 360 - from) / span, 0), 1);
		return { strokeDashoffset: length * (1 - t), opacity: t > 0 ? 1 : 0 };
	});
	return (
		<AnimatedCircle
			cx={BOX / 2}
			cy={BOX / 2}
			r={RADIUS}
			fill="none"
			stroke={color}
			strokeWidth={STROKE}
			strokeLinecap="round"
			strokeDasharray={[length, CIRCUMFERENCE]}
			rotation={from - 90}
			origin={`${BOX / 2}, ${BOX / 2}`}
			animatedProps={animatedProps}
		/>
	);
}

/** Animated launch screen: takes over from the native splash, draws the day ring, then opens onto the app. Shown once per cold start. */
export default function SplashOverlay() {
	const { loading } = useAuth();
	const reduced = useReducedMotion();
	const [stage, setStage] = useState<"native" | "drawing" | "drawn" | "gone">("native");
	// The native splash follows the system scheme, not the in-app theme choice.
	const [bg] = useState(() => palettes[Appearance.getColorScheme() === "dark" ? "dark" : "light"].bg);
	const sweep = useSharedValue(0);
	const exit = useSharedValue(0);

	const takeOver = () => {
		SplashScreen.hide();
		setStage((current) => (current === "native" ? "drawing" : current));
	};

	useEffect(() => {
		// Never leave the native splash stuck if the logo neither loads nor errors.
		const failsafe = setTimeout(takeOver, 3000);
		return () => clearTimeout(failsafe);
	}, []);

	useEffect(() => {
		if (stage !== "drawing") return;
		sweep.value = reduced ? 1 : withTiming(1, { duration: DRAW_MS, easing: Easing.bezier(0.4, 0, 0.1, 1) });
		const timer = setTimeout(() => setStage("drawn"), reduced ? 300 : DRAW_MS);
		return () => clearTimeout(timer);
	}, [reduced, stage, sweep]);

	useEffect(() => {
		if (stage !== "drawn" || loading) return;
		exit.value = withTiming(1, { duration: EXIT_MS, easing: Easing.bezier(0.4, 0, 1, 1) });
		const timer = setTimeout(() => setStage("gone"), EXIT_MS);
		return () => clearTimeout(timer);
	}, [exit, loading, stage]);

	const move = reduced ? 0 : 1;
	const overlayStyle = useAnimatedStyle(() => ({ opacity: 1 - exit.value }));
	const ringStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + 0.45 * move * exit.value }] }));
	// The logo leaves first so it never doubles the login screen's own logo.
	const logoStyle = useAnimatedStyle(() => ({ opacity: 1 - Math.min(exit.value * 2, 1), transform: [{ scale: 1 - 0.08 * move * exit.value }] }));

	if (stage === "gone") return null;

	return (
		<Animated.View style={[StyleSheet.absoluteFill, s.center, { backgroundColor: bg }, overlayStyle]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
			<Animated.View style={[s.ring, ringStyle]}>
				<Svg width={BOX} height={BOX}>
					{ARCS.map((arc) => (
						<Arc key={arc.from} {...arc} sweep={sweep} />
					))}
				</Svg>
			</Animated.View>
			<Animated.View style={logoStyle}>
				<Image source={require("../../assets/splash_logo.png")} style={s.logo} fadeDuration={0} onLoad={takeOver} onError={takeOver} />
			</Animated.View>
		</Animated.View>
	);
}

const s = StyleSheet.create({
	center: { alignItems: "center", justifyContent: "center" },
	ring: { position: "absolute" },
	logo: { width: LOGO, height: LOGO },
});
