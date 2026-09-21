import React from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Download, ExternalLink, RefreshCw, ShieldCheck, X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../context/ThemeContext";
import type { UpdatePhase } from "../services/appUpdate";
import type { VersionCheckResult } from "../services/version";

type Props = {
	visible: boolean;
	update: VersionCheckResult | null;
	phase: UpdatePhase;
	progress: number;
	writtenBytes: number;
	totalBytes: number;
	error?: string;
	onPrimary: () => void;
	onDismiss: () => void;
	onOpenRelease: () => void;
};

function formatBytes(value?: number) {
	if (!value || value <= 0) return "";
	if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} Ko`;
	return `${(value / (1024 * 1024)).toFixed(value >= 10 * 1024 * 1024 ? 0 : 1)} Mo`;
}

function cleanReleaseNotes(notes?: string) {
	if (!notes) return [];
	return notes
		.split(/\r?\n/)
		.map((line) =>
			line
				.trim()
				.replace(/^#{1,6}\s*/, "")
				.replace(/^[-*]\s*/, "• ")
				.replace(/!\[[^\]]*\]\([^)]+\)/g, "")
				.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
				.replace(/\x60([^\x60]+)\x60/g, "$1")
				.trim()
		)
		.filter(Boolean)
		.slice(0, 8);
}

export default function AppUpdateModal({
	visible,
	update,
	phase,
	progress,
	writtenBytes,
	totalBytes,
	error,
	onPrimary,
	onDismiss,
	onOpenRelease,
}: Props) {
	const { theme } = useTheme();
	const insets = useSafeAreaInsets();
	if (!update) return null;

	const percent = Math.max(0, Math.min(100, Math.round(progress * 100)));
	const notes = cleanReleaseNotes(update.releaseNotes);
	const busy = phase === "downloading" || phase === "installing";
	const primaryLabel =
		phase === "downloading"
			? `Téléchargement… ${percent}%`
			: phase === "permission"
				? "Autoriser l’installation"
				: phase === "installing"
					? "Ouverture de l’installateur…"
					: phase === "error"
						? "Réessayer"
						: update.apkAvailable
							? "Télécharger et installer"
							: "Voir la release GitHub";

	const title =
		phase === "permission"
			? "Une autorisation Android est nécessaire"
			: phase === "error"
				? "Mise à jour interrompue"
				: `EpiTime ${update.latestVersion} est disponible`;

	const subtitle =
		phase === "permission"
			? "Android doit autoriser EpiTime à installer son APK. Active « Autoriser depuis cette source », puis reviens dans l’app : l’installation reprendra automatiquement."
			: phase === "error"
				? error || "Impossible de terminer la mise à jour."
				: `Version installée ${update.currentVersion}${update.apkSize ? ` · APK ${formatBytes(update.apkSize)}` : ""}`;

	const progressTotal = totalBytes || update.apkSize || 0;
	const progressText =
		phase === "downloading" && writtenBytes > 0
			? `${formatBytes(writtenBytes)}${progressTotal ? ` / ${formatBytes(progressTotal)}` : ""}`
			: "";

	return (
		<Modal
			visible={visible}
			transparent
			animationType="fade"
			statusBarTranslucent
			onRequestClose={() => {
				if (!busy) onDismiss();
			}}>
			<View style={s.overlay}>
				<Pressable style={StyleSheet.absoluteFill} onPress={busy ? undefined : onDismiss} />
				<View
					style={[
						s.sheet,
						{
							backgroundColor: theme.surface,
							borderColor: theme.border,
							paddingBottom: Math.max(insets.bottom, 16) + 8,
						},
					]}>
					<View style={s.handle} />

					<View style={s.header}>
						<View style={[s.icon, { backgroundColor: phase === "permission" ? theme.accentSoft : theme.surfaceSoft }]}>
							{phase === "permission" ? <ShieldCheck color={theme.accent} size={26} /> : <Download color={theme.accent} size={26} />}
						</View>
						<View style={s.headerText}>
							<Text style={[s.eyebrow, { color: theme.accent }]}>MISE À JOUR ANDROID</Text>
							<Text style={[s.title, { color: theme.text }]}>{title}</Text>
						</View>
						{!busy ? (
							<Pressable
								onPress={onDismiss}
								hitSlop={10}
								style={({ pressed }) => [s.close, { backgroundColor: pressed ? theme.surfaceSoft : "transparent" }]}>
								<X color={theme.muted} size={22} />
							</Pressable>
						) : null}
					</View>

					<Text style={[s.subtitle, { color: phase === "error" ? theme.danger : theme.muted }]}>{subtitle}</Text>

					{phase === "downloading" ? (
						<View style={s.progressBlock}>
							<View style={[s.progressTrack, { backgroundColor: theme.surfaceSoft }]}>
								<View style={[s.progressFill, { backgroundColor: theme.accent, width: `${percent}%` }]} />
							</View>
							<View style={s.progressMeta}>
								<Text style={[s.progressPercent, { color: theme.text }]}>{percent}%</Text>
								<Text style={[s.progressBytes, { color: theme.muted }]}>{progressText}</Text>
							</View>
						</View>
					) : null}

					{notes.length && phase !== "permission" && phase !== "error" ? (
						<View style={[s.notesCard, { backgroundColor: theme.bg, borderColor: theme.border }]}>
							<Text style={[s.notesTitle, { color: theme.text }]}>Nouveautés</Text>
							<ScrollView style={s.notesScroll} nestedScrollEnabled>
								{notes.map((line, index) => (
									<Text key={`${index}-${line}`} style={[s.note, { color: theme.muted }]}>
										{line}
									</Text>
								))}
							</ScrollView>
						</View>
					) : null}

					<View style={[s.security, { backgroundColor: theme.bg, borderColor: theme.border }]}>
						<ShieldCheck color={theme.accent} size={18} />
						<Text style={[s.securityText, { color: theme.muted }]}>
							L’APK est téléchargé depuis la release GitHub puis contrôlé avant installation : package EpiTime, signature Android et SHA-256 lorsqu’il est disponible.
						</Text>
					</View>

					<Pressable
						disabled={busy}
						onPress={onPrimary}
						style={({ pressed }) => [
							s.primary,
							{
								backgroundColor: theme.accent,
								opacity: busy ? 0.72 : pressed ? 0.86 : 1,
							},
						]}>
						{busy ? (
							<ActivityIndicator color="#fff" size="small" />
						) : phase === "error" ? (
							<RefreshCw color="#fff" size={19} />
						) : phase === "permission" ? (
							<ShieldCheck color="#fff" size={19} />
						) : (
							<Download color="#fff" size={19} />
						)}
						<Text style={s.primaryText}>{primaryLabel}</Text>
					</Pressable>

					{phase === "error" ? (
						<Pressable onPress={onOpenRelease} style={({ pressed }) => [s.secondary, { opacity: pressed ? 0.7 : 1 }]}>
							<ExternalLink color={theme.accent} size={17} />
							<Text style={[s.secondaryText, { color: theme.accent }]}>Ouvrir la release GitHub</Text>
						</Pressable>
					) : null}
				</View>
			</View>
		</Modal>
	);
}

const s = StyleSheet.create({
	overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.52)" },
	sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, paddingHorizontal: 20, paddingTop: 10, gap: 16, maxHeight: "88%" },
	handle: { alignSelf: "center", width: 42, height: 5, borderRadius: 999, backgroundColor: "rgba(127,127,127,0.38)", marginBottom: 4 },
	header: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
	icon: { width: 50, height: 50, borderRadius: 16, alignItems: "center", justifyContent: "center" },
	headerText: { flex: 1, gap: 3, paddingTop: 1 },
	eyebrow: { fontSize: 11, fontWeight: "900", letterSpacing: 1 },
	title: { fontSize: 21, lineHeight: 27, fontWeight: "900", letterSpacing: -0.3 },
	close: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
	subtitle: { fontSize: 14, lineHeight: 20 },
	progressBlock: { gap: 8 },
	progressTrack: { height: 9, borderRadius: 999, overflow: "hidden" },
	progressFill: { height: "100%", borderRadius: 999 },
	progressMeta: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
	progressPercent: { fontSize: 14, fontWeight: "900" },
	progressBytes: { fontSize: 12, fontWeight: "700" },
	notesCard: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 8, maxHeight: 190 },
	notesTitle: { fontSize: 14, fontWeight: "900" },
	notesScroll: { flexGrow: 0 },
	note: { fontSize: 13, lineHeight: 19, marginBottom: 4 },
	security: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderWidth: 1, borderRadius: 14, padding: 12 },
	securityText: { flex: 1, fontSize: 12, lineHeight: 17, fontWeight: "600" },
	primary: { minHeight: 54, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 },
	primaryText: { color: "#fff", fontSize: 15, fontWeight: "900" },
	secondary: { minHeight: 40, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
	secondaryText: { fontSize: 14, fontWeight: "800" },
});
