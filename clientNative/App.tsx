import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { createNavigationContainerRef, NavigationContainer, type LinkingOptions } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import * as Notifications from "expo-notifications";
import { StatusBar } from "expo-status-bar";
import { Bell, CalendarDays, GraduationCap, Home, Settings } from "lucide-react-native";
import { AuthProvider, useAuth } from "./src/context/AuthContext";
import { ThemeProvider, useTheme } from "./src/context/ThemeContext";
import { VersionProvider } from "./src/context/VersionContext";
import { registerPlanningNotificationBackgroundSync, unregisterPlanningNotificationBackgroundSync } from "./src/services/backgroundSync";
import { stopLiveCourseNotification } from "./src/services/liveCourse";
import { getJSON } from "./src/services/storage";
import LoginScreen from "./src/screens/LoginScreen";
import OnboardingScreen from "./src/screens/OnboardingScreen";
import HomeScreen from "./src/screens/HomeScreen";
import CalendarScreen from "./src/screens/CalendarScreen";
import GradesScreen from "./src/screens/GradesScreen";
import NotificationsScreen from "./src/screens/NotificationsScreen";
import SettingsScreen from "./src/screens/SettingsScreen";

type RootTabParamList = {
	Accueil: undefined;
	Agenda:
		| {
				targetDate?: string;
				eventId?: string;
				eventReservationId?: string;
				eventStartDate?: string;
				openChangesPanel?: boolean;
				changeKey?: string;
		  }
		| undefined;
	Notes: undefined;
	Notifications: undefined;
	Réglages: undefined;
};

const navigationRef = createNavigationContainerRef<RootTabParamList>();

const linking: LinkingOptions<RootTabParamList> = {
	prefixes: ["epitime://"],
	config: {
		screens: {
			Accueil: "home",
			Agenda: "agenda",
			Notes: "notes",
			Notifications: "notifications",
			Réglages: "settings",
		},
	},
};

const Tab = createBottomTabNavigator<RootTabParamList>();
function Root() {
	const { session, loading } = useAuth();
	const { theme, resolvedMode } = useTheme();
	const [checkingOnboarding, setCheckingOnboarding] = useState(true);
	const [onboardingReady, setOnboardingReady] = useState(false);
	const handledNotificationResponseId = useRef<string | null>(null);

	useEffect(() => {
		if (!session) {
			stopLiveCourseNotification().catch(() => {});
			unregisterPlanningNotificationBackgroundSync().catch(() => {});
			setCheckingOnboarding(false);
			setOnboardingReady(false);
			return;
		}
		setCheckingOnboarding(true);
		Promise.all([getJSON<boolean>("onboardingCompleted", false), getJSON<(string | number)[]>("selectedGroups", [])])
			.then(([completed, selectedGroups]) => {
				setOnboardingReady(Boolean(completed && selectedGroups.length > 0) || selectedGroups.length > 0);
			})
			.finally(() => setCheckingOnboarding(false));
	}, [session]);

	useEffect(() => {
		if (!session || !onboardingReady) return;
		registerPlanningNotificationBackgroundSync().catch(() => {});
	}, [session, onboardingReady]);

	useEffect(() => {
		if (!session || !onboardingReady) return;
		const openCourseChanges = (response: Notifications.NotificationResponse | null) => {
			if (!response) return;
			const notificationId = response.notification.request.identifier;
			if (handledNotificationResponseId.current === notificationId) return;
			const data = response.notification.request.content.data as { type?: unknown; startsAt?: unknown; changeKey?: unknown; openPanel?: unknown } | undefined;
			if (data?.type !== "course-change" && data?.openPanel !== "event-changes") return;
			handledNotificationResponseId.current = notificationId;
			const params = {
				openChangesPanel: true,
				changeKey: typeof data.changeKey === "string" ? data.changeKey : undefined,
				targetDate: typeof data.startsAt === "string" ? data.startsAt : undefined,
			};
			if (navigationRef.isReady()) {
				navigationRef.navigate("Agenda", params);
			} else {
				setTimeout(() => {
					if (navigationRef.isReady()) navigationRef.navigate("Agenda", params);
				}, 250);
			}
		};
		const subscription = Notifications.addNotificationResponseReceivedListener(openCourseChanges);
		Notifications.getLastNotificationResponseAsync().then(openCourseChanges).catch(() => {});
		return () => subscription.remove();
	}, [session, onboardingReady]);

	if (loading || !session) return <LoginScreen />;
	if (checkingOnboarding) {
		return (
			<View style={[s.loading, { backgroundColor: theme.bg }]}>
				<ActivityIndicator color={theme.accent} size="large" />
			</View>
		);
	}
	if (!onboardingReady) return <OnboardingScreen onDone={() => setOnboardingReady(true)} />;
	return (
		<NavigationContainer
			ref={navigationRef}
			linking={linking}
			theme={{
				dark: resolvedMode === "dark",
				colors: {
					primary: theme.accent,
					background: theme.bg,
					card: theme.surface,
					text: theme.text,
					border: theme.border,
					notification: theme.accent,
				},
				fonts: {
					regular: { fontFamily: "System", fontWeight: "400" },
					medium: { fontFamily: "System", fontWeight: "600" },
					bold: { fontFamily: "System", fontWeight: "700" },
					heavy: { fontFamily: "System", fontWeight: "900" },
				},
			}}>
			<StatusBar style={resolvedMode === "dark" ? "light" : "dark"} />
			<Tab.Navigator
				screenOptions={{
					headerShown: false,
					tabBarStyle: {
						backgroundColor: theme.surface,
						borderTopColor: theme.border,
						height: 72,
						paddingTop: 8,
						paddingBottom: 10,
					},
					tabBarLabelStyle: { fontSize: 11, fontWeight: "700" },
					tabBarActiveTintColor: theme.accent,
					tabBarInactiveTintColor: theme.muted,
				}}>
				<Tab.Screen name="Accueil" component={HomeScreen} options={{ tabBarIcon: ({ color, size }) => <Home color={color} size={size} /> }} />
				<Tab.Screen name="Agenda" component={CalendarScreen} options={{ tabBarIcon: ({ color, size }) => <CalendarDays color={color} size={size} /> }} />
				<Tab.Screen name="Notes" component={GradesScreen} options={{ tabBarIcon: ({ color, size }) => <GraduationCap color={color} size={size} /> }} />
				<Tab.Screen name="Notifications" component={NotificationsScreen} options={{ tabBarIcon: ({ color, size }) => <Bell color={color} size={size} /> }} />
				<Tab.Screen name="Réglages" component={SettingsScreen} options={{ tabBarIcon: ({ color, size }) => <Settings color={color} size={size} /> }} />
			</Tab.Navigator>
		</NavigationContainer>
	);
}
export default function App() {
	return (
		<GestureHandlerRootView style={{ flex: 1 }}>
			<ThemeProvider>
				<AuthProvider>
					<VersionProvider>
						<Root />
					</VersionProvider>
				</AuthProvider>
			</ThemeProvider>
		</GestureHandlerRootView>
	);
}

const s = StyleSheet.create({
	loading: { flex: 1, alignItems: "center", justifyContent: "center" },
});
