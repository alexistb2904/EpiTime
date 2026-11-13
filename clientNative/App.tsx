import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, Easing, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { createNavigationContainerRef, NavigationContainer, type LinkingOptions } from "@react-navigation/native";
import { createBottomTabNavigator, type BottomTabNavigationOptions } from "@react-navigation/bottom-tabs";
import { useReducedMotion } from "react-native-reanimated";
import * as Notifications from "expo-notifications";
import { StatusBar } from "expo-status-bar";
import { Bell } from "phosphor-react-native";
import FloatingTabBar from "./src/components/FloatingTabBar";
import SplashOverlay from "./src/components/SplashOverlay";
import { AuthProvider, useAuth } from "./src/context/AuthContext";
import { ThemeProvider, useTheme } from "./src/context/ThemeContext";
import { VersionProvider } from "./src/context/VersionContext";
import { registerExpoPushToken } from "./src/services/api";
import { registerPlanningNotificationBackgroundSync, unregisterPlanningNotificationBackgroundSync } from "./src/services/backgroundSync";
import { getRememberedAurigaCredentials, hasAurigaRefreshToken } from "./src/services/aurigaAuth";
import { getAurigaLastSync, isAurigaSyncStale } from "./src/services/aurigaCache";
import { syncAurigaData } from "./src/services/aurigaClient";
import { stopLiveCourseNotification } from "./src/services/liveCourse";
import { getNotificationPermissionStatus, getNotificationSettings, requestPushToken } from "./src/services/notifications";
import { getRequiredAppPermissions, openAppPermissionSettings, requestRequiredAppPermissions, type RequiredPermissionState } from "./src/services/permissions";
import { getJSON, setJSON } from "./src/services/storage";
import { hasScheduleFilters } from "./src/utils/scheduleFilters";
import LoginScreen from "./src/screens/LoginScreen";
import OnboardingScreen from "./src/screens/OnboardingScreen";
import HomeScreen from "./src/screens/HomeScreen";
import CalendarScreen from "./src/screens/CalendarScreen";
import GradesScreen from "./src/screens/GradesScreen";
import NotificationsScreen from "./src/screens/NotificationsScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import { clearAnalyticsUser, identifyAnalyticsUser, initializeAnalytics, startAnalyticsLifecycleTracking, trackEvent, trackScreen } from "./src/services/analytics";

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
	Notes:
		| {
				mode?: "notes" | "syllabus";
				syllabusId?: number;
				syllabusRequestAt?: number;
		  }
		| undefined;
	Notifications: undefined;
	Réglages: undefined;
};

const navigationRef = createNavigationContainerRef<RootTabParamList>();
const screenNames: Record<string, string> = {
	Accueil: "home",
	Agenda: "calendar",
	Notes: "grades",
	Notifications: "notifications",
	Réglages: "settings",
};
let lastTrackedScreen: string | null = null;

function trackCurrentScreen() {
	const screen = screenNames[navigationRef.getCurrentRoute()?.name || ""];
	if (!screen || screen === lastTrackedScreen) return;
	lastTrackedScreen = screen;
	void trackScreen(screen);
}

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

// The old page is gone by mid-course so two screens of text never ghost over each other;
// the slide follows the direction the tab pill travels.
const TAB_TRANSITION: BottomTabNavigationOptions = {
	transitionSpec: { animation: "timing", config: { duration: 240, easing: Easing.bezier(0.16, 1, 0.3, 1) } },
	sceneStyleInterpolator: ({ current }) => ({
		sceneStyle: {
			opacity: current.progress.interpolate({ inputRange: [-1, -0.5, 0, 0.5, 1], outputRange: [0, 0, 1, 0, 0] }),
			transform: [{ translateX: current.progress.interpolate({ inputRange: [-1, 0, 1], outputRange: [-24, 0, 24] }) }],
		},
	}),
};
const NOTIFICATION_PERMISSION_PROMPT_DISABLED_KEY = "notificationPermissionPromptDisabled";

function Root() {
	const { session, loading } = useAuth();
	const { theme, resolvedMode } = useTheme();
	const reducedMotion = useReducedMotion();
	const [checkingOnboarding, setCheckingOnboarding] = useState(true);
	const [onboardingReady, setOnboardingReady] = useState(false);
	const [notificationPermissionPrompt, setNotificationPermissionPrompt] = useState<{ visible: boolean; missing: RequiredPermissionState[] }>({ visible: false, missing: [] });
	const [pushRegistrationKey, setPushRegistrationKey] = useState(0);
	const [requestingNotificationPermission, setRequestingNotificationPermission] = useState(false);
	const handledNotificationResponseId = useRef<string | null>(null);
	const aurigaAutoRefreshTriggeredRef = useRef(false);
	const analyticsUserId = (session?.account as { id?: string } | null | undefined)?.id?.trim() || "";
	const identifiedAnalyticsUserRef = useRef<string | null>(null);

	useEffect(() => {
		if (loading) return;
		if (analyticsUserId) {
			identifiedAnalyticsUserRef.current = analyticsUserId;
			void identifyAnalyticsUser(analyticsUserId);
			return;
		}
		if (identifiedAnalyticsUserRef.current) {
			identifiedAnalyticsUserRef.current = null;
			void clearAnalyticsUser();
		}
	}, [analyticsUserId, loading]);

	useEffect(() => {
		aurigaAutoRefreshTriggeredRef.current = false;
	}, [session?.microsoftAccessToken, session?.zeusToken]);

	useEffect(() => {
		if (!session) {
			stopLiveCourseNotification().catch(() => {});
			unregisterPlanningNotificationBackgroundSync().catch(() => {});
			setCheckingOnboarding(false);
			setOnboardingReady(false);
			return;
		}
		setCheckingOnboarding(true);
		Promise.all([getJSON<(string | number)[]>("selectedGroups", []), getJSON<(string | number)[]>("selectedRooms", []), getJSON<(string | number)[]>("selectedTeachers", [])])
			.then(([selectedGroups, selectedRooms, selectedTeachers]) => {
				setOnboardingReady(hasScheduleFilters({ groups: selectedGroups, rooms: selectedRooms, teachers: selectedTeachers }));
			})
			.finally(() => setCheckingOnboarding(false));
	}, [session]);

	useEffect(() => {
		if (!session || !onboardingReady) return;
		registerPlanningNotificationBackgroundSync().catch(() => {});
	}, [session, onboardingReady]);

	useEffect(() => {
		if (!session || !onboardingReady) return;
		let active = true;
		const checkPermissions = async (reveal: boolean) => {
			const [result, promptDisabled] = await Promise.all([getRequiredAppPermissions({ includeExactAlarms: true }), getJSON<boolean>(NOTIFICATION_PERMISSION_PROMPT_DISABLED_KEY, false)]);
			if (!active) return;
			// On return from system settings, keep the prompt open only while something is still missing.
			setNotificationPermissionPrompt((current) => ({ visible: !promptDisabled && result.missing.length > 0 && (reveal || current.visible), missing: result.missing }));
		};
		void checkPermissions(true).catch(() => {});
		const subscription = AppState.addEventListener("change", (state) => {
			if (state === "active") void checkPermissions(false).catch(() => {});
		});
		return () => {
			active = false;
			subscription.remove();
		};
	}, [onboardingReady, session]);

	const postponeNotificationPermission = () => setNotificationPermissionPrompt((current) => ({ ...current, visible: false }));
	const disableNotificationPermissionPrompt = async () => {
		await setJSON(NOTIFICATION_PERMISSION_PROMPT_DISABLED_KEY, true);
		setNotificationPermissionPrompt((current) => ({ ...current, visible: false }));
	};
	const requestNotificationPermissionFromPrompt = async () => {
		setRequestingNotificationPermission(true);
		try {
			if (notificationPermissionPrompt.missing.some((permission) => !permission.canAskAgain)) {
				await openAppPermissionSettings();
				return;
			}
			const result = await requestRequiredAppPermissions({ includeExactAlarms: true });
			setNotificationPermissionPrompt({ visible: result.missing.length > 0, missing: result.missing });
			setPushRegistrationKey((key) => key + 1);
		} finally {
			setRequestingNotificationPermission(false);
		}
	};

	useEffect(() => {
		if (!session || !onboardingReady) return;
		const account = session.account as { id?: string; userPrincipalName?: string; mail?: string | null } | null | undefined;
		const userId = account?.id || account?.userPrincipalName || account?.mail || "";
		if (!userId) return;

		let active = true;
		const reregisterExpoPushToken = async () => {
			const settings = await getNotificationSettings();
			if (!settings.enabled) return;
			const permission = await getNotificationPermissionStatus();
			if (!permission.granted && permission.status !== "granted") return;
			const [groups, token] = await Promise.all([getJSON<(string | number)[]>("selectedGroups", []), requestPushToken()]);
			if (!active || !token) return;
			await registerExpoPushToken(token, userId, groups, settings);
		};

		const run = () => void reregisterExpoPushToken().catch(() => {});
		run();
		// Retry on every resume (permission granted in system settings, earlier network failure)
		// and follow FCM/APNs token rotations so the server never keeps a stale token.
		const appStateSubscription = AppState.addEventListener("change", (state) => {
			if (state === "active") run();
		});
		const tokenSubscription = Notifications.addPushTokenListener(run);
		return () => {
			active = false;
			appStateSubscription.remove();
			tokenSubscription.remove();
		};
	}, [session, onboardingReady, pushRegistrationKey]);

	useEffect(() => {
		if (!session || !onboardingReady || aurigaAutoRefreshTriggeredRef.current) return;
		aurigaAutoRefreshTriggeredRef.current = true;
		let active = true;
		(async () => {
			try {
				const [lastSync, hasRefreshToken, rememberedCredentials] = await Promise.all([getAurigaLastSync(), hasAurigaRefreshToken(), getRememberedAurigaCredentials()]);
				if (!active) return;
				if (!isAurigaSyncStale(lastSync) || (!hasRefreshToken && !rememberedCredentials)) return;
				await syncAurigaData();
			} catch {
				// Silent background refresh: keep app launch smooth.
			}
		})();
		return () => {
			active = false;
		};
	}, [onboardingReady, session]);

	useEffect(() => {
		if (!session || !onboardingReady) return;
		const openCourseChanges = (response: Notifications.NotificationResponse | null) => {
			if (!response) return;
			const notificationId = response.notification.request.identifier;
			if (handledNotificationResponseId.current === notificationId) return;
			const data = response.notification.request.content.data as
				| { type?: unknown; startsAt?: unknown; changeKey?: unknown; openPanel?: unknown; openTab?: unknown }
				| undefined;
			if (data?.type === "auriga-grade" || data?.openTab === "notes") {
				void trackEvent("notification_opened");
				handledNotificationResponseId.current = notificationId;
				if (navigationRef.isReady()) {
					navigationRef.navigate("Notes", { mode: "notes" });
				} else {
					setTimeout(() => {
						if (navigationRef.isReady()) navigationRef.navigate("Notes", { mode: "notes" });
					}, 250);
				}
				return;
			}
			if (data?.type !== "course-change" && data?.openPanel !== "event-changes") return;
			void trackEvent("notification_opened");
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
		Notifications.getLastNotificationResponseAsync()
			.then(openCourseChanges)
			.catch(() => {});
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
		<>
			<NavigationContainer
				ref={navigationRef}
				onReady={trackCurrentScreen}
				onStateChange={trackCurrentScreen}
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
				<Tab.Navigator tabBar={(props) => <FloatingTabBar {...props} />} screenOptions={{ headerShown: false, ...(reducedMotion ? { animation: "fade" } : TAB_TRANSITION) }}>
					<Tab.Screen name="Accueil" component={HomeScreen} />
					<Tab.Screen name="Agenda" component={CalendarScreen} />
					<Tab.Screen name="Notes" component={GradesScreen} />
					<Tab.Screen name="Notifications" component={NotificationsScreen} />
					<Tab.Screen name="Réglages" component={SettingsScreen} />
				</Tab.Navigator>
			</NavigationContainer>
			<Modal visible={notificationPermissionPrompt.visible} transparent animationType="fade" onRequestClose={postponeNotificationPermission}>
				<View style={s.permissionBackdrop}>
					<View style={[s.permissionDialog, { backgroundColor: theme.surface, borderColor: theme.border }]}>
						<View style={[s.permissionIcon, { backgroundColor: theme.accentSoft }]}>
							<Bell color={theme.accent} size={24} />
						</View>
						<Text style={[s.permissionTitle, { color: theme.text }]}>Active les notifications</Text>
						<Text style={[s.permissionBody, { color: theme.muted }]}>
							EpiTime a besoin de cette autorisation pour te prévenir avant un cours et t’informer d’un changement de salle ou de planning. Sans elle, l’application
							reste utilisable, mais aucun rappel ne pourra être envoyé.
						</Text>
						{notificationPermissionPrompt.missing.some((permission) => permission.id === "exactAlarms") ? (
							<Text style={[s.permissionBody, { color: theme.muted }]}>
								Autorise aussi les alarmes exactes pour que les rappels arrivent à l’heure, même quand le téléphone est en veille.
							</Text>
						) : null}
						<Pressable
							style={[s.permissionPrimary, { backgroundColor: theme.accent, opacity: requestingNotificationPermission ? 0.7 : 1 }]}
							onPress={() => void requestNotificationPermissionFromPrompt()}
							disabled={requestingNotificationPermission}>
							<Text style={s.permissionPrimaryText}>
								{requestingNotificationPermission ? "Vérification…" : notificationPermissionPrompt.missing.every((permission) => permission.canAskAgain) ? "Donner les permissions" : "Ouvrir les réglages"}
							</Text>
						</Pressable>
						<View style={s.permissionSecondaryActions}>
							<Pressable style={s.permissionSecondary} onPress={postponeNotificationPermission} disabled={requestingNotificationPermission}>
								<Text style={[s.permissionSecondaryText, { color: theme.text }]}>Plus tard</Text>
							</Pressable>
							<Pressable style={s.permissionSecondary} onPress={() => void disableNotificationPermissionPrompt()} disabled={requestingNotificationPermission}>
								<Text style={[s.permissionSecondaryText, { color: theme.muted }]}>Jamais</Text>
							</Pressable>
						</View>
					</View>
				</View>
			</Modal>
		</>
	);
}
export default function App() {
	useEffect(() => {
		void initializeAnalytics();
		void trackEvent("app_opened", { launch_type: "unknown" });
		return startAnalyticsLifecycleTracking();
	}, []);

	return (
		<GestureHandlerRootView style={{ flex: 1 }}>
			<SafeAreaProvider>
				<ThemeProvider>
					<AuthProvider>
						<VersionProvider>
							<Root />
						</VersionProvider>
						<SplashOverlay />
					</AuthProvider>
				</ThemeProvider>
			</SafeAreaProvider>
		</GestureHandlerRootView>
	);
}

const s = StyleSheet.create({
	loading: { flex: 1, alignItems: "center", justifyContent: "center" },
	permissionBackdrop: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: "rgba(16, 20, 30, 0.48)" },
	permissionDialog: { borderWidth: 1, borderRadius: 24, padding: 22, gap: 14 },
	permissionIcon: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center" },
	permissionTitle: { fontSize: 22, fontWeight: "900" },
	permissionBody: { fontSize: 15, lineHeight: 22 },
	permissionPrimary: { minHeight: 52, borderRadius: 15, alignItems: "center", justifyContent: "center", marginTop: 4 },
	permissionPrimaryText: { color: "#fff", fontSize: 16, fontWeight: "900" },
	permissionSecondaryActions: { flexDirection: "row", gap: 10 },
	permissionSecondary: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center" },
	permissionSecondaryText: { fontSize: 15, fontWeight: "800" },
});
