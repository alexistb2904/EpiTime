import React from "react";
import { ActivityIndicator, Linking, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import {
	BellRing,
	Bug,
	ChevronRight,
	Clock,
	Code2,
	Download,
	Info,
	LogOut,
	Moon,
	RefreshCw,
	RotateCcw,
	Send,
	Shield,
	ShieldCheck,
	Smartphone,
	Square,
	Sun,
	Trash2,
	User,
	X,
} from "lucide-react-native";
import Card from "../Card";
import { useTheme } from "../../context/ThemeContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { type ScheduledNotificationItem } from "../../services/notifications";

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
	materialYouDetails,
	materialYouEnabled,
	missingPermissionsCount,
	mode,
	modeLabel,
	notificationDebugSettings,
	openLatestRelease,
	permissionsKnown,
	permissionsLoading,
	refreshScheduledNotifications,
	requestMissingPermissions,
	resolvedMode,
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
	toggleLiveCourseProgress,
	updateAvailable,
	updateDebugSettings,
	useWeightedAverages,
	versionDetails,
	versionStatus,
	liveCourseProgressEnabled,
}: any) {
	const { theme } = useTheme();
	return (
		<ScrollView style={[s.root, { backgroundColor: theme.bg }]} contentContainerStyle={s.content}>
			<View style={s.header}>
				<View style={s.headerText}>
					<Text style={[s.eyebrow, { color: theme.accent }]}>PROFIL & PRÉFÉRENCES</Text>
					<Text style={[s.title, { color: theme.text }]}>Réglages</Text>
				</View>
			</View>

			<Card style={s.profileCard} glow={true} accent>
				<View style={[s.avatar, { backgroundColor: theme.bg }]}>
					<User color={theme.accent} size={28} />
				</View>
				<View style={s.profileText}>
					<Text style={[s.name, { color: theme.text }]} numberOfLines={1}>
						{account?.displayName || "Microsoft Account"}
					</Text>
					<Text style={[s.meta, { color: theme.text, opacity: 0.7 }]} numberOfLines={1}>
						{account?.userPrincipalName || account?.mail || "Connecté avec succès"}
					</Text>
				</View>
			</Card>

			<Text style={[s.sectionHeader, { color: theme.text, opacity: 0.6 }]}>APPARENCE</Text>
			<Card style={s.settingCard} variant="default" glow={false}>
				<View style={s.settingHeader}>
					<View style={[s.iconBox, { backgroundColor: theme.surfaceSoft }]}>
						{mode === "system" ? (
							<Smartphone color={theme.accent} size={20} />
						) : resolvedMode === "dark" ? (
							<Moon color={theme.accent} size={20} />
						) : (
							<Sun color={theme.accent} size={20} />
						)}
					</View>
					<View style={s.settingBody}>
						<Text style={[s.settingTitle, { color: theme.text }]}>Mode {modeLabel}</Text>
						<Text style={[s.meta, { color: theme.muted }]}>Système, clair ou sombre</Text>
					</View>
				</View>
				<View style={s.modeOptions}>
					{[
						{ value: "system" as const, label: "Système" },
						{ value: "light" as const, label: "Clair" },
						{ value: "dark" as const, label: "Sombre" },
					].map((item) => {
						const active = mode === item.value;
						return (
							<Pressable
								key={item.value}
								onPress={() => void setThemeMode(item.value)}
								style={({ pressed }) => [
									s.modeOption,
									{
										backgroundColor: active ? theme.accent : pressed ? theme.surfaceSoft : theme.bg,
										borderColor: active ? theme.accent : theme.border,
									},
								]}>
								<Text style={[s.modeOptionLabel, { color: active ? "#fff" : theme.text }]}>{item.label}</Text>
							</Pressable>
						);
					})}
				</View>
			</Card>
			<Card style={s.settingRow} variant="default" glow={false}>
				<View style={[s.iconBox, { backgroundColor: theme.surfaceSoft }]}>
					<Smartphone color={theme.accent} size={20} />
				</View>
				<View style={s.settingBody}>
					<Text style={[s.settingTitle, { color: theme.text }]}>Material You</Text>
					<Text style={[s.meta, { color: theme.muted }]}>{materialYouDetails}</Text>
				</View>
				<Switch
					value={materialYouEnabled}
					onValueChange={(enabled) => void setMaterialYouEnabled(enabled)}
					thumbColor={theme.accent}
					trackColor={{ false: theme.surfaceSoft, true: theme.accentSoft }}
				/>
			</Card>

			<Text style={[s.sectionHeader, { color: theme.text, opacity: 0.6 }]}>CONFIDENTIALITÉ</Text>
			<Card style={s.settingRow} variant="default" glow={false}>
				<View style={[s.iconBox, { backgroundColor: theme.surfaceSoft }]}>
					<ShieldCheck color={theme.accent} size={20} />
				</View>
				<View style={s.settingBody}>
					<Text style={[s.settingTitle, { color: theme.text }]}>Mesure d’audience anonyme</Text>
					<Text style={[s.meta, { color: theme.muted }]}>
						Analytics auto-hébergés, sans nom, e-mail ni identifiant de compte. Tu peux désactiver ce choix à tout moment.
					</Text>
				</View>
				<Switch
					value={analyticsEnabled}
					onValueChange={(enabled) => void toggleAnalytics(enabled)}
					thumbColor={theme.accent}
					trackColor={{ false: theme.surfaceSoft, true: theme.accentSoft }}
				/>
			</Card>

			<Text style={[s.sectionHeader, { color: theme.text, opacity: 0.6 }]}>COURS EN DIRECT</Text>
			<Card style={s.settingRow} variant="default" glow={false}>
				<View style={[s.iconBox, { backgroundColor: theme.surfaceSoft }]}>
					<BellRing color={theme.accent} size={20} />
				</View>
				<View style={s.settingBody}>
					<Text style={[s.settingTitle, { color: theme.text }]}>Notification persistante</Text>
					<Text style={[s.meta, { color: theme.muted }]}>
						Progression du cours en direct via une notification persistante. L’accès « Alarmes et rappels » est proposé pour la précision.
					</Text>
				</View>
				<Switch
					value={liveCourseProgressEnabled}
					onValueChange={(enabled) => void toggleLiveCourseProgress(enabled)}
					thumbColor={theme.accent}
					trackColor={{ false: theme.surfaceSoft, true: theme.accentSoft }}
				/>
			</Card>

			<Text style={[s.sectionHeader, { color: theme.text, opacity: 0.6 }]}>NOTES</Text>
			<Card style={s.settingRow} variant="default" glow={false}>
				<View style={[s.iconBox, { backgroundColor: theme.surfaceSoft }]}>
					<Code2 color={theme.accent} size={20} />
				</View>
				<View style={s.settingBody}>
					<Text style={[s.settingTitle, { color: theme.text }]}>Moyennes pondérées</Text>
					<Text style={[s.meta, { color: theme.muted }]}>Utiliser les coefficients Auriga quand ils existent, sinon coefficient 1</Text>
				</View>
				<Switch
					value={useWeightedAverages}
					onValueChange={(enabled) => void toggleGradeWeighting(enabled)}
					thumbColor={theme.accent}
					trackColor={{ false: theme.surfaceSoft, true: theme.accentSoft }}
				/>
			</Card>
			<View style={s.group}>
				<Action
					icon={aurigaDisconnecting ? <ActivityIndicator color={theme.danger} /> : <LogOut color={theme.danger} size={20} />}
					label={aurigaDisconnecting ? "Déconnexion Auriga..." : "Se déconnecter d'Auriga"}
					onPress={disconnectAuriga}
					disabled={aurigaDisconnecting}
				/>
			</View>

			<Text style={[s.sectionHeader, { color: theme.text, opacity: 0.6 }]}>PERMISSIONS</Text>
			<View style={s.group}>
				<Action
					icon={permissionsLoading ? <ActivityIndicator color={theme.accent} /> : <ShieldCheck color={theme.accent} size={20} />}
					label={
						permissionsLoading
							? "Vérification des permissions"
							: !permissionsKnown
								? "Vérifier les permissions"
								: missingPermissionsCount
									? `Redemander ${missingPermissionsCount} permission${missingPermissionsCount > 1 ? "s" : ""}`
									: "Toutes les permissions accordées"
					}
					onPress={() => void requestMissingPermissions()}
					disabled={permissionsLoading || (permissionsKnown && !missingPermissionsCount)}
				/>
			</View>

			<Text style={[s.sectionHeader, { color: theme.text, opacity: 0.6 }]}>AGENDA</Text>
			<View style={s.group}>
				<Action
					icon={<RotateCcw color={theme.accent} size={20} />}
					label={
						deletedEventsCount
							? `Restaurer ${deletedEventsCount} cours supprimé${deletedEventsCount > 1 ? "s" : ""} ou ignoré${deletedEventsCount > 1 ? "s" : ""}`
							: "Aucun cours à restaurer"
					}
					onPress={() => void restoreEvents()}
					disabled={!deletedEventsCount}
				/>
			</View>

			<Text style={[s.sectionHeader, { color: theme.text, opacity: 0.6 }]}>APPLICATION</Text>
			<View style={s.group}>
				<Card style={s.versionCard} variant="default" glow={false} accent={updateAvailable} accentColor={theme.warn}>
					<View style={s.infoHeader}>
						<View style={[s.iconBox, { backgroundColor: updateAvailable ? "rgba(245, 158, 11, 0.14)" : theme.surfaceSoft }]}>
							<Smartphone color={updateAvailable ? theme.warn : theme.accent} size={20} />
						</View>
						<View style={s.settingBody}>
							<Text style={[s.infoTitle, { color: theme.text }]}>{versionStatus}</Text>
							<Text style={[s.meta, { color: theme.muted }]}>{versionDetails}</Text>
						</View>
					</View>
					{updateAvailable ? (
						<Pressable
							onPress={() => void openLatestRelease()}
							style={({ pressed }) => [s.downloadButton, { backgroundColor: theme.warn, opacity: pressed ? 0.82 : 1 }]}>
							<Download color="#fff" size={18} />
							<Text style={s.downloadText}>Télécharger la version correcte</Text>
						</Pressable>
					) : null}
				</Card>

				<Action
					icon={checking ? <ActivityIndicator color={theme.accent} /> : <RefreshCw color={theme.accent} size={20} />}
					label={checking ? "Vérification en cours" : "Vérifier les mises à jour"}
					onPress={() => void checkForUpdates(true)}
					disabled={checking}
				/>
			</View>

			<Text style={[s.sectionHeader, { color: theme.text, opacity: 0.6 }]}>INFORMATIONS</Text>
			<View style={s.group}>
				<Card style={s.infoCard} variant="default" glow={false}>
					<View style={s.infoHeader}>
						<View style={[s.iconBox, { backgroundColor: theme.surfaceSoft }]}>
							<Info color={theme.accent} size={20} />
						</View>
						<Text style={[s.infoTitle, { color: theme.text }]}>Avertissement</Text>
					</View>
					<Text style={[s.meta, { color: theme.muted }]}>EpiTime est un projet étudiant indépendant, non affilié à Zeus, IONIS Education Group ou EPITA.</Text>
				</Card>
				<Action icon={<ShieldCheck color={theme.accent} size={20} />} label="Mentions légales & Confidentialité" onPress={() => setCreditsVisible(true)} />
			</View>

			<Text style={[s.sectionHeader, { color: theme.text, opacity: 0.6 }]}>DÉVELOPPEUR</Text>
			<View style={s.group}>
				<Action
					icon={<Bug color={theme.accent} size={20} />}
					label="Signaler un bug"
					onPress={() => Linking.openURL("https://github.com/alexistb2904/EpiTime/issues/new")}
				/>
				<Action icon={<Code2 color={theme.accent} size={20} />} label="Code source GitHub" onPress={() => Linking.openURL("https://github.com/alexistb2904/EpiTime")} />
			</View>

			<Text style={[s.sectionHeader, { color: theme.text, opacity: 0.6 }]}>DEBUG NOTIFICATIONS</Text>
			<Card style={s.settingRow} variant="default" glow={false}>
				<View style={[s.iconBox, { backgroundColor: theme.surfaceSoft }]}>
					<Bug color={theme.accent} size={20} />
				</View>
				<View style={s.settingBody}>
					<Text style={[s.settingTitle, { color: theme.text }]}>Mode debug notifications</Text>
					<Text style={[s.meta, { color: theme.muted }]}>Jouer avec les notifications programmées et progression</Text>
				</View>
				<Switch
					value={notificationDebugSettings.enabled}
					onValueChange={(enabled) => void saveNotificationDebugSettings({ ...notificationDebugSettings, enabled })}
					thumbColor={theme.accent}
					trackColor={{ false: theme.surfaceSoft, true: theme.accentSoft }}
				/>
			</Card>
			{notificationDebugSettings.enabled ? (
				<View style={s.group}>
					<Card style={s.debugCard} variant="default" glow={false}>
						<View style={s.infoHeader}>
							<View style={[s.iconBox, { backgroundColor: theme.surfaceSoft }]}>
								<Clock color={theme.accent} size={20} />
							</View>
							<View style={s.settingBody}>
								<Text style={[s.infoTitle, { color: theme.text }]}>Scénario cible</Text>
								<Text style={[s.meta, { color: theme.muted }]}>Prochaine cible : {debugTargetLabel}</Text>
							</View>
						</View>
						<View style={s.debugStepperGrid}>
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
							<DebugStepper
								label="Durée"
								value={`${notificationDebugSettings.progressDurationMinutes} min`}
								onDecrease={() => updateDebugSettings({ progressDurationMinutes: Math.max(1, notificationDebugSettings.progressDurationMinutes - 15) })}
								onIncrease={() => updateDebugSettings({ progressDurationMinutes: Math.min(240, notificationDebugSettings.progressDurationMinutes + 15) })}
							/>
						</View>
						{debugStatus ? <Text style={[s.debugStatus, { color: theme.text }]}>{debugStatus}</Text> : null}
					</Card>
					<Action
						icon={debugBusyAction === "local" ? <ActivityIndicator color={theme.accent} /> : <Send color={theme.accent} size={20} />}
						label="Programmer une notification à l'heure cible"
						onPress={scheduleDebugLocal}
						disabled={!!debugBusyAction}
					/>
					<Action
						icon={debugBusyAction === "progress" ? <ActivityIndicator color={theme.accent} /> : <BellRing color={theme.accent} size={20} />}
						label="Programmer une progression fake à l'heure cible"
						onPress={scheduleDebugProgress}
						disabled={!!debugBusyAction}
					/>
					<Action
						icon={debugBusyAction === "showProgress" ? <ActivityIndicator color={theme.accent} /> : <Clock color={theme.accent} size={20} />}
						label="Afficher une progression fake maintenant"
						onPress={showDebugProgress}
						disabled={!!debugBusyAction}
					/>
					<Action
						icon={debugBusyAction === "clear" ? <ActivityIndicator color={theme.accent} /> : <Square color={theme.accent} size={20} />}
						label="Annuler les scénarios debug"
						onPress={clearDebugNotifications}
						disabled={!!debugBusyAction}
					/>
					<Card style={s.debugCard} variant="default" glow={false}>
						<View style={s.scheduledHeader}>
							<View style={s.settingBody}>
								<Text style={[s.infoTitle, { color: theme.text }]}>Notifications programmées</Text>
								<Text style={[s.meta, { color: theme.muted }]}>
									{scheduledNotificationsLoading
										? "Chargement..."
										: `${scheduledNotifications.length} notification${scheduledNotifications.length > 1 ? "s" : ""} locale${scheduledNotifications.length > 1 ? "s" : ""}`}
								</Text>
							</View>
							<Pressable
								onPress={() => void refreshScheduledNotifications()}
								disabled={scheduledNotificationsLoading || !!debugBusyAction}
								style={({ pressed }) => [s.iconAction, { backgroundColor: pressed ? theme.surfaceSoft : theme.bg, borderColor: theme.border }]}>
								{scheduledNotificationsLoading ? <ActivityIndicator color={theme.accent} /> : <RefreshCw color={theme.accent} size={18} />}
							</Pressable>
							<Pressable
								onPress={deleteAllScheduledNotifications}
								disabled={!scheduledNotifications.length || !!debugBusyAction}
								style={({ pressed }) => [
									s.iconAction,
									{
										backgroundColor: pressed ? theme.surfaceSoft : theme.bg,
										borderColor: theme.border,
										opacity: !scheduledNotifications.length || debugBusyAction ? 0.5 : 1,
									},
								]}>
								<Trash2 color={theme.danger} size={18} />
							</Pressable>
						</View>
						<View style={s.scheduledList}>
							{scheduledNotifications.length ? (
								scheduledNotifications.map((notification: ScheduledNotificationItem) => (
									<ScheduledNotificationRow
										key={notification.id}
										notification={notification}
										disabled={!!debugBusyAction}
										onDelete={() => deleteScheduledNotification(notification)}
									/>
								))
							) : (
								<Text style={[s.meta, { color: theme.muted }]}>Aucune notification locale programmée.</Text>
							)}
						</View>
					</Card>
				</View>
			) : null}

			<View style={s.footer}>
				<Pressable onPress={logout} style={({ pressed }) => [s.logoutButton, { backgroundColor: theme.danger, opacity: pressed ? 0.8 : 1 }]}>
					<LogOut color="#fff" size={20} />
					<Text style={s.logoutText}>Se déconnecter</Text>
				</Pressable>
				<View style={s.brandFooter}>
					<Text style={[s.versionText, { color: theme.muted }]}>EpiTime • Made by Alexis Thierry-Bellefond</Text>
				</View>
			</View>
			<CreditsModal visible={creditsVisible} onClose={() => setCreditsVisible(false)} />
		</ScrollView>
	);
}

export function CreditsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
	const { theme } = useTheme();
	const insets = useSafeAreaInsets();
	return (
		<Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
			<View style={[s.creditsRoot, { backgroundColor: theme.bg }]}>
				<View style={[s.creditsHeader, { borderBottomColor: theme.border, paddingTop: Math.max(insets.top, 18) }]}>
					<View style={s.settingBody}>
						<Text style={[s.eyebrow, { color: theme.accent }]}>TRANSPARENCE</Text>
						<Text style={[s.infoTitle, { color: theme.text }]}>Légal</Text>
					</View>
					<Pressable style={[s.iconAction, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={onClose}>
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
							<ChevronRight color={theme.accent} size={18} />
						</Pressable>
						<Pressable
							onPress={() => void Linking.openURL("https://epitime.epita.it/legal#terms")}
							style={({ pressed }) => [s.legalLink, { backgroundColor: pressed ? theme.accentSoft : theme.surfaceSoft, borderColor: theme.border }]}>
							<Text style={[s.legalLinkText, { color: theme.accent }]}>Lire les CGU</Text>
							<ChevronRight color={theme.accent} size={18} />
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
							"Lucide React Native",
							"React Native WebView",
							"Expo Auth Session, Secure Store, Notifications",
							"Async Storage",
							"React Native Android Widget",
							"Material 3 Theme",
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

export function ScheduledNotificationRow({ notification, disabled, onDelete }: { notification: ScheduledNotificationItem; disabled: boolean; onDelete: () => void }) {
	const { theme } = useTheme();
	return (
		<View style={[s.scheduledRow, { borderColor: theme.border, backgroundColor: theme.bg }]}>
			<View style={s.settingBody}>
				<Text style={[s.scheduledTitle, { color: theme.text }]} numberOfLines={1}>
					{notification.title}
				</Text>
				{notification.body ? (
					<Text style={[s.scheduledBody, { color: theme.muted }]} numberOfLines={2}>
						{notification.body}
					</Text>
				) : null}
				<Text style={[s.scheduledMeta, { color: theme.muted }]} numberOfLines={1}>
					{notification.trigger} · {notification.type}
				</Text>
			</View>
			<Pressable
				onPress={onDelete}
				disabled={disabled}
				style={({ pressed }) => [s.iconAction, { backgroundColor: pressed ? theme.surfaceSoft : theme.surface, borderColor: theme.border, opacity: disabled ? 0.5 : 1 }]}>
				<Trash2 color={theme.danger} size={18} />
			</Pressable>
		</View>
	);
}

export function DebugStepper({ label, value, onDecrease, onIncrease }: { label: string; value: string; onDecrease: () => void; onIncrease: () => void }) {
	const { theme } = useTheme();
	return (
		<View style={[s.debugStepper, { borderColor: theme.border, backgroundColor: theme.bg }]}>
			<Text style={[s.debugStepperLabel, { color: theme.muted }]}>{label}</Text>
			<View style={s.debugStepperControls}>
				<Pressable style={({ pressed }) => [s.debugStepButton, { backgroundColor: pressed ? theme.surfaceSoft : theme.surface }]} onPress={onDecrease}>
					<Text style={[s.debugStepText, { color: theme.text }]}>-</Text>
				</Pressable>
				<Text style={[s.debugStepperValue, { color: theme.text }]}>{value}</Text>
				<Pressable style={({ pressed }) => [s.debugStepButton, { backgroundColor: pressed ? theme.surfaceSoft : theme.surface }]} onPress={onIncrease}>
					<Text style={[s.debugStepText, { color: theme.text }]}>+</Text>
				</Pressable>
			</View>
		</View>
	);
}

export function Action({ icon, label, onPress, disabled = false }: { icon: React.ReactNode; label: string; onPress: () => void; disabled?: boolean }) {
	const { theme } = useTheme();
	return (
		<Pressable
			disabled={disabled}
			onPress={onPress}
			style={({ pressed }) => [s.actionItem, { backgroundColor: pressed ? theme.surfaceSoft : theme.surface, borderColor: theme.border, opacity: disabled ? 0.65 : 1 }]}>
			<View style={[s.iconBox, { backgroundColor: theme.surfaceSoft }]}>{icon}</View>
			<Text style={[s.actionText, { color: theme.text }]}>{label}</Text>
			<ChevronRight color={theme.muted} size={20} />
		</Pressable>
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
	root: { flex: 1 },
	content: { padding: 20, paddingTop: 60, paddingBottom: 120 },
	header: { marginBottom: 24 },
	headerText: { gap: 4 },
	eyebrow: { fontSize: 13, fontWeight: "800", letterSpacing: 1 },
	title: { fontSize: 34, fontWeight: "900", letterSpacing: -0.5 },

	profileCard: { flexDirection: "row", alignItems: "center", gap: 16, marginBottom: 32, padding: 20 },
	avatar: { width: 56, height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center" },
	profileText: { flex: 1, gap: 4 },
	name: { fontSize: 19, fontWeight: "800" },

	sectionHeader: { fontSize: 12, fontWeight: "800", letterSpacing: 1, marginTop: 12, marginBottom: 12, paddingLeft: 4 },
	group: { gap: 12, marginBottom: 24 },

	settingCard: { gap: 16, marginBottom: 12 },
	settingHeader: { flexDirection: "row", alignItems: "center", gap: 16 },
	settingRow: { flexDirection: "row", alignItems: "center", gap: 16, marginBottom: 24 },
	iconBox: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
	settingBody: { flex: 1, gap: 2 },
	settingTitle: { fontWeight: "800", fontSize: 16 },
	modeOptions: { flexDirection: "row", gap: 8 },
	modeOption: { flex: 1, minHeight: 40, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
	modeOptionLabel: { fontSize: 13, fontWeight: "800" },

	infoCard: { padding: 20 },
	infoHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
	infoTitle: { fontSize: 17, fontWeight: "800" },
	versionCard: { padding: 20 },
	debugCard: { padding: 20, gap: 14 },
	debugStepperGrid: { gap: 10 },
	debugStepper: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 8 },
	debugStepperLabel: { fontSize: 12, fontWeight: "800", textTransform: "uppercase" },
	debugStepperControls: { flexDirection: "row", alignItems: "center", gap: 10 },
	debugStepButton: { width: 40, height: 38, borderRadius: 8, alignItems: "center", justifyContent: "center" },
	debugStepText: { fontSize: 20, fontWeight: "900" },
	debugStepperValue: { flex: 1, textAlign: "center", fontSize: 18, fontWeight: "900" },
	debugStatus: { fontSize: 14, lineHeight: 20, fontWeight: "700" },
	scheduledHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
	iconAction: { width: 40, height: 40, borderRadius: 8, borderWidth: 1, alignItems: "center", justifyContent: "center" },
	scheduledList: { gap: 10 },
	scheduledRow: { borderWidth: 1, borderRadius: 12, padding: 12, flexDirection: "row", alignItems: "center", gap: 12 },
	scheduledTitle: { fontSize: 15, fontWeight: "900" },
	scheduledBody: { marginTop: 4, fontSize: 13, lineHeight: 18 },
	scheduledMeta: { marginTop: 6, fontSize: 12, fontWeight: "700" },
	downloadButton: {
		minHeight: 48,
		borderRadius: 12,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 9,
		marginTop: 6,
	},
	downloadText: { color: "#fff", fontSize: 15, fontWeight: "900" },

	actionItem: { borderWidth: 1, borderRadius: 16, padding: 12, flexDirection: "row", alignItems: "center", gap: 16 },
	actionText: { flex: 1, fontSize: 16, fontWeight: "700" },

	meta: { fontSize: 14, lineHeight: 20 },

	footer: { marginTop: 20, gap: 24 },
	logoutButton: {
		minHeight: 56,
		borderRadius: 16,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 10,
		elevation: 2,
		shadowColor: "#000",
		shadowOpacity: 0.1,
		shadowRadius: 8,
		shadowOffset: { width: 0, height: 4 },
	},
	logoutText: { color: "#fff", fontWeight: "800", fontSize: 16, letterSpacing: 0.5 },

	brandFooter: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, opacity: 0.7 },
	versionText: { fontSize: 13, fontWeight: "600" },
	creditsRoot: { flex: 1 },
	creditsHeader: { minHeight: 76, borderBottomWidth: 1, paddingHorizontal: 18, paddingTop: 18, paddingBottom: 12, flexDirection: "row", alignItems: "center", gap: 12 },
	creditsContent: { padding: 18, paddingBottom: 42, gap: 14 },
	creditsCard: { gap: 12 },
	legalLink: { minHeight: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
	legalLinkText: { fontSize: 14, fontWeight: "800" },
	creditList: { gap: 8 },
	creditRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
	creditBullet: { width: 12, fontSize: 14, lineHeight: 20, fontWeight: "900" },
});
