import React from "react";
import { Image as RNImage, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { ExternalLink, Image as ImageIcon, X } from "lucide-react-native";
import { useTheme } from "../context/ThemeContext";
import type { CourseNoteAttachment } from "../services/courseNotes";

type ImagePreviewModalProps = {
	visible: boolean;
	attachment: CourseNoteAttachment | null;
	onClose: () => void;
	onOpenInGallery: () => void | Promise<void>;
};

export default function ImagePreviewModal({ visible, attachment, onClose, onOpenInGallery }: ImagePreviewModalProps) {
	const { theme } = useTheme();
	if (!attachment) return null;

	return (
		<Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
			<View style={s.overlay}>
				<Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
				<Animated.View entering={FadeInDown.duration(240)} style={[s.card, { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.cardShadow }]}>
					<View style={[s.header, { borderBottomColor: theme.border }]}>
						<View style={s.titleWrap}>
							<View style={[s.iconBadge, { backgroundColor: theme.accentSoft }]}>
								<ImageIcon color={theme.accent} size={18} />
							</View>
							<View style={s.headerText}>
								<Text style={[s.title, { color: theme.text }]} numberOfLines={1}>
									{attachment.name}
								</Text>
								<Text style={[s.subtitle, { color: theme.muted }]} numberOfLines={1}>
									{formatMeta(attachment)}
								</Text>
							</View>
						</View>
						<Pressable style={[s.closeBtn, { borderColor: theme.border, backgroundColor: theme.surfaceSoft }]} onPress={onClose}>
							<X color={theme.text} size={20} />
						</Pressable>
					</View>

					<ScrollView contentContainerStyle={s.imageArea} showsVerticalScrollIndicator={false}>
						<View style={[s.imageFrame, { backgroundColor: theme.surfaceSoft, borderColor: theme.border }]}>
							<RNImage source={{ uri: attachment.localUri }} style={s.image} resizeMode="contain" />
						</View>
					</ScrollView>

					<View style={s.footer}>
						<Pressable style={[s.secondaryBtn, { borderColor: theme.border, backgroundColor: theme.surfaceSoft }]} onPress={onClose}>
							<Text style={[s.secondaryText, { color: theme.text }]}>Fermer</Text>
						</Pressable>
						<Pressable style={[s.primaryBtn, { backgroundColor: theme.accent }]} onPress={() => void onOpenInGallery()}>
							<ExternalLink color="#fff" size={17} />
							<Text style={s.primaryText}>Ouvrir dans la galerie</Text>
						</Pressable>
					</View>
				</Animated.View>
			</View>
		</Modal>
	);
}

function formatMeta(attachment: CourseNoteAttachment) {
	if (attachment.size && Number.isFinite(attachment.size)) {
		if (attachment.size < 1024) return `${attachment.size} o`;
		if (attachment.size < 1024 * 1024) return `${Math.round(attachment.size / 1024)} Ko`;
		return `${(attachment.size / 1024 / 1024).toFixed(1)} Mo`;
	}
	return attachment.mimeType || "Image jointe";
}

const s = StyleSheet.create({
	overlay: { flex: 1, backgroundColor: "rgba(0, 0, 0, 0.62)", alignItems: "center", justifyContent: "center", padding: 18 },
	card: {
		width: "100%",
		maxWidth: 620,
		maxHeight: "92%",
		borderWidth: 1,
		borderRadius: 28,
		overflow: "hidden",
		shadowOpacity: 0.22,
		shadowRadius: 26,
		shadowOffset: { width: 0, height: 18 },
		elevation: 10,
	},
	header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, padding: 16, borderBottomWidth: 1 },
	titleWrap: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 10 },
	headerText: { flex: 1, minWidth: 0 },
	iconBadge: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
	title: { fontSize: 16, fontWeight: "900" },
	subtitle: { marginTop: 2, fontSize: 12, fontWeight: "700" },
	closeBtn: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
	imageArea: { flexGrow: 1, padding: 16, justifyContent: "center" },
	imageFrame: { minHeight: 280, borderWidth: 1, borderRadius: 22, overflow: "hidden" },
	image: { width: "100%", height: 520, alignSelf: "center" },
	footer: { flexDirection: "row", gap: 10, padding: 16, paddingTop: 0 },
	secondaryBtn: { flex: 1, minHeight: 46, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
	secondaryText: { fontSize: 14, fontWeight: "900" },
	primaryBtn: { flex: 1, minHeight: 46, borderRadius: 14, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
	primaryText: { color: "#fff", fontSize: 14, fontWeight: "900" },
});
