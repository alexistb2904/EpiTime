import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { StatusBar } from "expo-status-bar";
import { Bell, CalendarDays, Home, Settings } from "lucide-react-native";
import { AuthProvider, useAuth } from "./src/context/AuthContext";
import { ThemeProvider, useTheme } from "./src/context/ThemeContext";
import { VersionProvider } from "./src/context/VersionContext";
import { stopLiveCourseNotification } from "./src/services/liveCourse";
import { getJSON } from "./src/services/storage";
import LoginScreen from "./src/screens/LoginScreen";
import OnboardingScreen from "./src/screens/OnboardingScreen";
import HomeScreen from "./src/screens/HomeScreen";
import CalendarScreen from "./src/screens/CalendarScreen";
import NotificationsScreen from "./src/screens/NotificationsScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
const Tab = createBottomTabNavigator();
function Root() {
	const { session, loading } = useAuth();
	const { theme, mode } = useTheme();
	const [checkingOnboarding, setCheckingOnboarding] = useState(true);
	const [onboardingReady, setOnboardingReady] = useState(false);

	useEffect(() => {
		if (!session) {
			stopLiveCourseNotification().catch(() => {});
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
			theme={{
				dark: mode === "dark",
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
			<StatusBar style={mode === "dark" ? "light" : "dark"} />
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
