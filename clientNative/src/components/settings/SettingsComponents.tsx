import React from "react";
import { ActivityIndicator, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { BellRinging, Bug, Calculator, CaretRight, Clock, Code, DownloadSimple, ArrowSquareOut, Hourglass, SignOut, Moon, Palette, ArrowsClockwise, ArrowCounterClockwise, Scales, PaperPlaneTilt, ShieldCheck, DeviceMobile, Square, Sun, Timer, Trash, User, X } from "phosphor-react-native";
import Card from "../Card";
import { useTheme } from "../../context/ThemeContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { type ScheduledNotificationItem } from "../../services/notifications";
import { Row, ScreenTitle, Section, Segmented, Stepper, destructiveColor, s as ls } from "./SettingsList";

export function SettingsContent({
	account,
	analyticsEnabled,
	aurigaDisconnecting,
	checkForUpdates,
	checking,
	creditsVisible,
	debugBusyAction,
	debugStatus,
	debugTargetLabel,
	deleteAllScheduledNotifications,
	deleteScheduledNotification,
	deletedEventsCount,
	disconnectAuriga,
	logout,
	materialYouAvailable,
	materialYouDetails,
	materialYouEnabled,
	mode,
	resolvedMode,
	notificationDebugSettings,
	openLatestRelease,
	startUpdate,
	updatePhase,
	updateProgress,
	refreshScheduledNotifications,
	restoreEvents,
	saveNotificationDebugSettings,
	scheduleDebugLocal,
	scheduleDebugProgress,
	scheduledNotifications,
	scheduledNotificationsLoading,
	setCreditsVisible,
	setMaterialYouEnabled,
	setThemeMode,
	showDebugProgress,
	clearDebugNotifications,
	toggleGradeWeighting,
	toggleAnalytics,
	updateAvailable,
	updateDebugSettings,
	useWeightedAverages,
	versionDetails,
	versionStatus,
}: any) {
	const { theme } = useTheme();
	const insets = useSafeAreaInsets();
	const updating = updatePhase === "downloading" || updatePhase === "installing";
	const debugBusy = !!debugBusyAction;
	const restoreLabel = `${deletedEventsCount} cours supprimé${deletedEventsCount > 1 ? "s" : ""} ou ignoré${deletedEventsCount > 1 ? "s" : ""}`;

	return (
		<ScrollView style={[ls.screen, { backgroundColor: theme.bg }]} contentContainerStyle={[ls.screenContent, { paddingTop: insets.top + 16 }]}>
			<ScreenTitle>Réglages</ScreenTitle>

			<Section>
				<View style={s.profile}>
					<View style={[s.avatar, { backgroundColor: theme.accentSoft }]}>
						<User color={theme.accent} size={24} />
					</View>
					<View style={s.profileText}>
						<Text style={[s.name, { color: theme.text }]} numberOfLines={1}>
							{account?.displayName || "Compte Microsoft"}
						</Text>
						<Text style={[s.email, { color: theme.muted }]} numberOfLines={1}>
							{account?.userPrincipalName || account?.mail || "Connecté"}
						</Text>
					</View>
				</View>
			</Section>

			<Section title="Apparence">
				<Row
					icon={mode === "system" ? DeviceMobile : resolvedMode === "dark" ? Moon : Sun}
					title="Thème"
					below={
						<Segmented
							value={mode}
							onChange={(next) => void setThemeMode(next)}
							options={[
								{ value: "system", label: "Système" },
								{ value: "light", label: "Clair" },
								{ value: "dark", label: "Sombre" },
							]}
						/>
					}
				/>
				{Platform.OS === "android" ? (
					<Row
						icon={Palette}
						title="Material You"
						subtitle={materialYouDetails}
						toggle={{ value: materialYouAvailable && materialYouEnabled, onValueChange: (enabled) => void setMaterialYouEnabled(enabled), disabled: !materialYouAvailable }}
					/>
				) : null}
			</Section>

			<Section title="Notes Auriga">
				<Row
					icon={Calculator}
					title="Moyennes pondérées"
					subtitle="Coefficients Auriga quand ils existent, sinon 1"
					toggle={{ value: useWeightedAverages, onValueChange: (enabled) => void toggleGradeWeighting(enabled) }}
				/>
				<Row
					icon={SignOut}
					destructive
					loading={aurigaDisconnecting}
					title={aurigaDisconnecting ? "Déconnexion d'Auriga…" : "Se déconnecter d'Auriga"}
					subtitle="Supprime la session et le cache local"
					onPress={disconnectAuriga}
				/>
			</Section>

			<Section title="Agenda">
				<Row
					icon={ArrowCounterClockwise}
					title="Restaurer les cours masqués"
					subtitle={deletedEventsCount ? restoreLabel : "Aucun cours supprimé ou ignoré"}
					onPress={() => void restoreEvents()}
					disabled={!deletedEventsCount}
				/>
			</Section>

			<Section title="Confidentialité">
				<Row
					icon={ShieldCheck}
					title="Mesure d’audience anonyme"
					subtitle="Auto-hébergée, sans nom, e-mail ni identifiant de compte"
					toggle={{ value: analyticsEnabled, onValueChange: (enabled) => void toggleAnalytics(enabled) }}
				/>
				<Row icon={Scales} title="Mentions légales" onPress={() => setCreditsVisible(true)} />
			</Section>

			<Section title="À propos">
				<Row
					icon={updateAvailable ? DownloadSimple : DeviceMobile}
					iconColor={updateAvailable ? theme.warn : undefined}
					loading={checking}
					title={checking ? "Vérification…" : versionStatus}
					subtitle={versionDetails}
					onPress={() => void checkForUpdates(true)}
					disabled={checking}
					trailing={<ArrowsClockwise color={theme.muted} size={18} />}
					below={
						updateAvailable ? (
							<View style={s.updateActions}>
								<Pressable
									accessibilityRole="button"
									disabled={updating}
									onPress={() => void startUpdate()}
									style={({ pressed }) => [s.updateButton, { backgroundColor: theme.warn, opacity: updating ? 0.68 : pressed ? 0.82 : 1 }]}>
									{updating ? <ActivityIndicator color={theme.onWarn} size="small" /> : <DownloadSimple color={theme.onWarn} size={18} />}
									<Text style={[s.updateText, { color: theme.onWarn }]}>
										{updatePhase === "downloading"
											? `Téléchargement… ${Math.round(updateProgress * 100)}%`
											: updatePhase === "permission"
												? "Autoriser l’installation"
												: updatePhase === "installing"
													? "Ouverture de l’installateur…"
													: updatePhase === "error"
														? "Réessayer la mise à jour"
														: "Télécharger et installer"}
									</Text>
								</Pressable>
								<Pressable accessibilityRole="link" onPress={() => void openLatestRelease()} style={({ pressed }) => [s.releaseLink, { opacity: pressed ? 0.65 : 1 }]}>
									<Text style={[s.releaseLinkText, { color: theme.accent }]}>Voir les détails sur GitHub</Text>
								</Pressable>
							</View>
						) : null
					}
				/>
				<Row
					icon={Bug}
					title="Signaler un bug"
					trailing={<ArrowSquareOut color={theme.muted} size={18} />}
					onPress={() => Linking.openURL("https://github.com/alexistb2904/EpiTime/issues/new")}
				/>
				<Row
					icon={Code}
					title="Code source"
					subtitle="GitHub, licence MIT"
					trailing={<ArrowSquareOut color={theme.muted} size={18} />}
					onPress={() => Linking.openURL("https://github.com/alexistb2904/EpiTime")}
				/>
			</Section>

			<Section title="Développeur">
				<Row
					icon={Bug}
					title="Debug notifications"
					subtitle="Programmer des notifications et progressions de test"
					toggle={{ value: notificationDebugSettings.enabled, onValueChange: (enabled) => void saveNotificationDebugSettings({ ...notificationDebugSettings, enabled }) }}
				/>
				{notificationDebugSettings.enabled ? (
					<Row
						icon={Clock}
						title="Heure cible"
						subtitle={debugTargetLabel}
						below={
							<View style={s.debugSteppers}>
								<DebugStepper
									label="Heure"
									value={String(notificationDebugSettings.targetHour).padStart(2, "0")}
									onDecrease={() => updateDebugSettings({ targetHour: wrapNumber(notificationDebugSettings.targetHour - 1, 0, 23) })}
									onIncrease={() => updateDebugSettings({ targetHour: wrapNumber(notificationDebugSettings.targetHour + 1, 0, 23) })}
								/>
								<DebugStepper
									label="Minute"
									value={String(notificationDebugSettings.targetMinute).padStart(2, "0")}
									onDecrease={() => updateDebugSettings({ targetMinute: wrapNumber(notificationDebugSettings.targetMinute - 1, 0, 59) })}
									onIncrease={() => updateDebugSettings({ targetMinute: wrapNumber(notificationDebugSettings.targetMinute + 1, 0, 59) })}
								/>
							</View>
						}
					/>
				) : null}
				{notificationDebugSettings.enabled ? (
					<Row
						icon={Hourglass}
						title="Durée"
						subtitle="Progression de test"
						trailing={
							<Stepper
								label="la durée"
								value={`${notificationDebugSettings.progressDurationMinutes} min`}
								onDecrease={() => updateDebugSettings({ progressDurationMinutes: Math.max(1, notificationDebugSettings.progressDurationMinutes - 15) })}
								onIncrease={() => updateDebugSettings({ progressDurationMinutes: Math.min(240, notificationDebugSettings.progressDurationMinutes + 15) })}
							/>
						}
					/>
				) : null}
				{notificationDebugSettings.enabled ? (
					<Row icon={PaperPlaneTilt} title="Programmer une notification" subtitle="À l'heure cible" loading={debugBusyAction === "local"} disabled={debugBusy} onPress={scheduleDebugLocal} />
				) : null}
				{notificationDebugSettings.enabled ? (
					<Row
						icon={BellRinging}
						title="Programmer une progression"
						subtitle="À l'heure cible"
						loading={debugBusyAction === "progress"}
						disabled={debugBusy}
						onPress={scheduleDebugProgress}
					/>
				) : null}
				{notificationDebugSettings.enabled ? (
					<Row icon={Timer} title="Afficher une progression maintenant" loading={debugBusyAction === "showProgress"} disabled={debugBusy} onPress={showDebugProgress} />
				) : null}
				{notificationDebugSettings.enabled ? (
					<Row icon={Square} title="Annuler les scénarios debug" loading={debugBusyAction === "clear"} disabled={debugBusy} onPress={clearDebugNotifications} />
				) : null}
			</Section>
			{notificationDebugSettings.enabled && debugStatus ? <Text style={[ls.sectionFooter, { color: theme.muted }]}>{debugStatus}</Text> : null}

			{notificationDebugSettings.enabled ? (
				<Section title="Notifications programmées">
					<Row
						title={
							scheduledNotificationsLoading
								? "Chargement…"
								: `${scheduledNotifications.length} notification${scheduledNotifications.length > 1 ? "s" : ""} locale${scheduledNotifications.length > 1 ? "s" : ""}`
						}
						trailing={
							<View style={s.iconActions}>
								<IconAction
									label="Actualiser"
									onPress={() => void refreshScheduledNotifications()}
									disabled={scheduledNotificationsLoading || debugBusy}
									icon={scheduledNotificationsLoading ? <ActivityIndicator color={theme.accent} /> : <ArrowsClockwise color={theme.accent} size={18} />}
								/>
								<IconAction
									label="Tout supprimer"
									onPress={deleteAllScheduledNotifications}
									disabled={!scheduledNotifications.length || debugBusy}
									icon={<Trash color={destructiveColor(theme)} size={18} />}
								/>
							</View>
						}
					/>
					{scheduledNotifications.map((notification: ScheduledNotificationItem) => (
						<Row
							key={notification.id}
							title={notification.title}
							subtitle={[notification.body, `${notification.trigger} · ${notification.type}`].filter(Boolean).join("\n")}
							trailing={
								<IconAction
									label="Supprimer"
									onPress={() => deleteScheduledNotification(notification)}
									disabled={debugBusy}
									icon={<Trash color={destructiveColor(theme)} size={18} />}
								/>
							}
						/>
					))}
				</Section>
			) : null}

			<Section>
				<Row icon={SignOut} destructive title="Se déconnecter" onPress={logout} />
			</Section>

			<Text style={[s.footer, { color: theme.muted }]}>
				EpiTime est un projet étudiant indépendant, non affilié à Zeus, IONIS Education Group ou EPITA.{"\n"}Fait par Alexis Thierry-Bellefond
			</Text>
			<CreditsModal visible={creditsVisible} onClose={() => setCreditsVisible(false)} />
		</ScrollView>
	);
}

function DebugStepper({ label, value, onDecrease, onIncrease }: { label: string; value: string; onDecrease: () => void; onIncrease: () => void }) {
	const { theme } = useTheme();
	return (
		<View style={s.debugStepper}>
			<Text style={[s.debugStepperLabel, { color: theme.muted }]}>{label}</Text>
			<Stepper label={label.toLowerCase()} value={value} onDecrease={onDecrease} onIncrease={onIncrease} />
		</View>
	);
}

function IconAction({ label, icon, onPress, disabled }: { label: string; icon: React.ReactNode; onPress: () => void; disabled?: boolean }) {
	const { theme } = useTheme();
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={label}
			hitSlop={4}
			onPress={onPress}
			disabled={disabled}
			style={({ pressed }) => [s.iconAction, { backgroundColor: pressed ? theme.surfaceSoft : "transparent", borderColor: theme.border, opacity: disabled ? 0.5 : 1 }]}>
			{icon}
		</Pressable>
	);
}

export function CreditsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
	const { theme } = useTheme();
	const insets = useSafeAreaInsets();
	return (
		<Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
			<View style={[s.creditsRoot, { backgroundColor: theme.bg }]}>
				<View style={[s.creditsHeader, { borderBottomColor: theme.border, paddingTop: Math.max(insets.top, 18) }]}>
					<Text accessibilityRole="header" style={[s.creditsTitle, { color: theme.text }]}>
						Mentions légales
					</Text>
					<Pressable accessibilityRole="button" accessibilityLabel="Fermer" style={[s.iconAction, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={onClose}>
						<X color={theme.text} size={18} />
					</Pressable>
				</View>
				<ScrollView contentContainerStyle={[s.creditsContent, { paddingBottom: insets.bottom + 24 }]}>
					<Card style={s.creditsCard} variant="default" glow={false}>
						<Text style={[s.infoTitle, { color: theme.text }]}>Confidentialité & mentions légales</Text>
						<Text style={[s.meta, { color: theme.muted }]}>
							La politique décrit les données locales, les connexions Microsoft, Zeus et Auriga, les notifications et vos droits.
						</Text>
						<Text style={[s.meta, { color: theme.muted }]}>La mesure d’audience mobile est désactivée par défaut et se contrôle dans la section Confidentialité.</Text>
						<Pressable
							onPress={() => void Linking.openURL("https://epitime.epita.it/legal")}
							style={({ pressed }) => [s.legalLink, { backgroundColor: pressed ? theme.accentSoft : theme.surfaceSoft, borderColor: theme.border }]}>
							<Text style={[s.legalLinkText, { color: theme.accent }]}>Lire le document complet</Text>
							<CaretRight color={theme.accent} size={18} />
						</Pressable>
						<Pressable
							onPress={() => void Linking.openURL("https://epitime.epita.it/legal#terms")}
							style={({ pressed }) => [s.legalLink, { backgroundColor: pressed ? theme.accentSoft : theme.surfaceSoft, borderColor: theme.border }]}>
							<Text style={[s.legalLinkText, { color: theme.accent }]}>Lire les CGU</Text>
							<CaretRight color={theme.accent} size={18} />
						</Pressable>
					</Card>
					<CreditSection
						title="Services et sources"
						items={[
							"Zeus : planning et groupes EPITA.",
							"Auriga : notes, syllabus et informations administratives.",
							"Chrysalide : inspiration pour le flux de connexion et la synchronisation Auriga.",
						]}
					/>
					<CreditSection
						title="Paquets open source principaux"
						items={[
							"Expo, React, React Native",
							"React Navigation",
							"React Native Reanimated",
							"Phosphor Icons",
							"Expo Auth Session, Secure Store, Notifications",
							"Async Storage",
							"React Native Android Widget",
						]}
					/>
				</ScrollView>
			</View>
		</Modal>
	);
}

export function CreditSection({ title, items }: { title: string; items: string[] }) {
	const { theme } = useTheme();
	return (
		<Card style={s.creditsCard} variant="default" glow={false}>
			<Text style={[s.infoTitle, { color: theme.text }]}>{title}</Text>
			<View style={s.creditList}>
				{items.map((item) => (
					<View key={item} style={s.creditRow}>
						<Text style={[s.creditBullet, { color: theme.accent }]}>•</Text>
						<Text style={[s.meta, { color: theme.muted }]}>{item}</Text>
					</View>
				))}
			</View>
		</Card>
	);
}

export function buildNextDebugTargetDate(hour: number, minute: number) {
	const target = new Date();
	target.setHours(hour, minute, 0, 0);
	if (target.getTime() <= Date.now()) target.setDate(target.getDate() + 1);
	return target;
}

export function formatDebugTargetDate(date: Date) {
	const time = date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
	const day = date.toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "2-digit" });
	return `${day} à ${time}`;
}

export function wrapNumber(value: number, min: number, max: number) {
	const range = max - min + 1;
	return ((((value - min) % range) + range) % range) + min;
}

export const s = StyleSheet.create({
	profile: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16 },
	avatar: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
	profileText: { flex: 1, gap: 2 },
	name: { fontSize: 18, fontWeight: "800" },
	email: { fontSize: 14 },

	updateActions: { gap: 4 },
	updateButton: { minHeight: 48, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 },
	updateText: { fontSize: 15, fontWeight: "800" },
	releaseLink: { alignSelf: "flex-start", minHeight: 40, justifyContent: "center" },
	releaseLinkText: { fontSize: 14, fontWeight: "700" },

	debugSteppers: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
	debugStepper: { gap: 6 },
	debugStepperLabel: { fontSize: 13, fontWeight: "700" },
	iconActions: { flexDirection: "row", gap: 8 },
	iconAction: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: "center", justifyContent: "center" },

	footer: { fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: 32, paddingHorizontal: 16 },

	meta: { fontSize: 14, lineHeight: 20 },
	infoTitle: { fontSize: 17, fontWeight: "800" },
	creditsRoot: { flex: 1 },
	creditsHeader: { minHeight: 76, borderBottomWidth: 1, paddingHorizontal: 18, paddingTop: 18, paddingBottom: 12, flexDirection: "row", alignItems: "center", gap: 12 },
	creditsTitle: { flex: 1, fontSize: 20, fontWeight: "900" },
	creditsContent: { padding: 18, paddingBottom: 42, gap: 14 },
	creditsCard: { gap: 12 },
	legalLink: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
	legalLinkText: { fontSize: 14, fontWeight: "800" },
	creditList: { gap: 8 },
	creditRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
	creditBullet: { width: 12, fontSize: 14, lineHeight: 20, fontWeight: "900" },
});
