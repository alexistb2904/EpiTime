import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { RotateCcw, X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../context/ThemeContext";
import { readableTextOn } from "../../utils/calendar";
import { normalizeSubjectCoefficient } from "../../services/gradeCoefficientOverrides";

type CoefficientEditorModalProps = {
	visible: boolean;
	title: string;
	value: number;
	overridden?: boolean;
	onClose: () => void;
	onSave: (value: number) => Promise<void>;
	onReset?: () => Promise<void>;
};

export default function CoefficientEditorModal({ visible, title, value, overridden, onClose, onSave, onReset }: CoefficientEditorModalProps) {
	const { theme } = useTheme();
	const insets = useSafeAreaInsets();
	const [input, setInput] = useState("");
	const [saving, setSaving] = useState(false);
	const formattedValue = useMemo(() => formatCoefficient(value), [value]);

	useEffect(() => {
		if (!visible) return;
		setInput(formattedValue);
		setSaving(false);
	}, [formattedValue, visible]);

	const save = async () => {
		const coefficient = normalizeSubjectCoefficient(input);
		if (coefficient === null) {
			Alert.alert("Coefficient invalide", "Entre un nombre supérieur à 0.");
			return;
		}

		setSaving(true);
		try {
			await onSave(coefficient);
			onClose();
		} catch (error) {
			Alert.alert("Impossible de modifier le coefficient", error instanceof Error ? error.message : "Réessaie dans un instant.");
		} finally {
			setSaving(false);
		}
	};

	const reset = async () => {
		if (!onReset) return;
		setSaving(true);
		try {
			await onReset();
			onClose();
		} catch (error) {
			Alert.alert("Impossible de réinitialiser le coefficient", error instanceof Error ? error.message : "Réessaie dans un instant.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
			<View style={[s.backdrop, { paddingTop: Math.max(insets.top, 24), paddingBottom: Math.max(insets.bottom, 24) }]}>
				<Pressable style={StyleSheet.absoluteFill} onPress={saving ? undefined : onClose} />
				<View style={s.keyboardWrap}>
					<View style={[s.sheet, { backgroundColor: theme.surface, borderColor: theme.border }]}>
						<View style={s.header}>
							<View style={s.titleWrap}>
								<Text accessibilityRole="header" style={[s.title, { color: theme.text }]}>
									Coefficient
								</Text>
								<Text style={[s.subtitle, { color: theme.muted }]} numberOfLines={2}>
									{title}
								</Text>
							</View>
							<Pressable style={[s.close, { borderColor: theme.border }]} disabled={saving} onPress={onClose} accessibilityRole="button" accessibilityLabel="Fermer">
								<X color={theme.text} size={18} />
							</Pressable>
						</View>
						<Text style={[s.explanation, { color: theme.muted }]}>Cette modification est locale à EpiTime et recalcule immédiatement les moyennes pondérées.</Text>
						<View style={[s.inputShell, { borderColor: theme.accent, backgroundColor: theme.bg }]}>
							<TextInput
								autoFocus
								keyboardType="decimal-pad"
								value={input}
								onChangeText={setInput}
								selectTextOnFocus
								accessibilityLabel="Nouveau coefficient"
								style={[s.input, { color: theme.text }]}
							/>
						</View>
						<Text style={[s.hint, { color: theme.muted }]}>Exemples : 1, 2 ou 0,5</Text>
						<View style={s.actions}>
							{overridden && onReset ? (
								<Pressable
									style={[s.resetButton, { backgroundColor: theme.surfaceSoft, borderColor: theme.border }]}
									disabled={saving}
									onPress={() => void reset()}>
									<RotateCcw color={theme.text} size={16} />
									<Text style={[s.resetText, { color: theme.text }]}>Auriga</Text>
								</Pressable>
							) : null}
							<Pressable style={[s.saveButton, { backgroundColor: theme.accent, opacity: saving ? 0.7 : 1 }]} disabled={saving} onPress={() => void save()}>
								{saving ? <ActivityIndicator color={readableTextOn(theme.accent)} size="small" /> : null}
								<Text style={[s.saveText, { color: readableTextOn(theme.accent) }]}>{saving ? "Enregistrement..." : "Appliquer"}</Text>
							</Pressable>
						</View>
					</View>
				</View>
			</View>
		</Modal>
	);
}

function formatCoefficient(value: number) {
	return Number.isInteger(value) ? String(value) : String(value).replace(".", ",");
}

const s = StyleSheet.create({
	backdrop: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: "rgba(0, 0, 0, 0.5)" },
	keyboardWrap: { width: "100%" },
	sheet: {
		width: "100%",
		maxWidth: 460,
		alignSelf: "center",
		borderWidth: 1,
		borderRadius: 22,
		padding: 16,
		gap: 12,
		shadowColor: "#000",
		shadowOpacity: 0.2,
		shadowRadius: 22,
		shadowOffset: { width: 0, height: 12 },
		elevation: 8,
	},
	header: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
	titleWrap: { flex: 1, minWidth: 0 },
	title: { fontSize: 20, fontWeight: "900", lineHeight: 25 },
	subtitle: { marginTop: 2, fontSize: 14, fontWeight: "800", lineHeight: 19 },
	close: { width: 44, height: 44, borderWidth: 1, borderRadius: 22, alignItems: "center", justifyContent: "center" },
	explanation: { fontSize: 13, lineHeight: 19, fontWeight: "700" },
	inputShell: { minHeight: 66, borderWidth: 1.5, borderRadius: 16, justifyContent: "center", paddingHorizontal: 15 },
	input: { fontSize: 27, lineHeight: 34, fontWeight: "900", textAlign: "center" },
	hint: { marginTop: -6, fontSize: 11, fontWeight: "700", textAlign: "center" },
	actions: { flexDirection: "row", gap: 9, marginTop: 4 },
	resetButton: { minHeight: 48, borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
	resetText: { fontSize: 13, fontWeight: "900" },
	saveButton: { flex: 1, minHeight: 48, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
	saveText: { fontSize: 15, fontWeight: "900" },
});
