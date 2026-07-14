import React from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { CalendarRange, FileDown, X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../context/ThemeContext";
import type { SyllabusExportDetail } from "../../services/syllabusExport";

type Props = {
	visible: boolean;
	semesters: number[];
	selectedStartSemester: number;
	selectedEndSemester: number;
	exporting: boolean;
	onClose: () => void;
	onChangeStartSemester: (semester: number) => void;
	onChangeEndSemester: (semester: number) => void;
	onGenerate: (detail: SyllabusExportDetail) => void;
};

export default function SyllabusExportModal({
	visible,
	semesters,
	selectedStartSemester,
	selectedEndSemester,
	exporting,
	onClose,
	onChangeStartSemester,
	onChangeEndSemester,
	onGenerate,
}: Props) {
	const { theme } = useTheme();
	const insets = useSafeAreaInsets();
	const endSemesters = semesters.filter((semester) => semester >= selectedStartSemester);
	return (
		<Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
			<Pressable style={[s.backdrop, { paddingTop: Math.max(insets.top, 22), paddingBottom: Math.max(insets.bottom, 22) }]} onPress={exporting ? undefined : onClose}>
				<Pressable style={[s.sheet, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={(event) => event.stopPropagation()}>
					<View style={s.header}>
						<View style={[s.icon, { backgroundColor: theme.accentSoft }]}>
							<CalendarRange color={theme.accent} size={21} />
						</View>
						<View style={s.headerCopy}>
							<Text style={[s.title, { color: theme.text }]}>Exporter le syllabus</Text>
							<Text style={[s.subtitle, { color: theme.muted }]}>Choisis les semestres à inclure.</Text>
						</View>
						<Pressable accessibilityRole="button" accessibilityLabel="Fermer" disabled={exporting} onPress={onClose} hitSlop={10}>
							<X color={theme.muted} size={21} />
						</Pressable>
					</View>

					<SemesterSelector label="Semestre de début" semesters={semesters} selectedSemester={selectedStartSemester} onSelect={onChangeStartSemester} />
					<SemesterSelector label="Semestre de fin" semesters={endSemesters.length ? endSemesters : [selectedStartSemester]} selectedSemester={selectedEndSemester} onSelect={onChangeEndSemester} />

					<View style={s.actions}>
						<Pressable
							disabled={exporting}
							onPress={() => onGenerate("minimal")}
							style={({ pressed }) => [s.secondaryAction, { borderColor: theme.border, backgroundColor: theme.surfaceSoft, opacity: exporting || pressed ? 0.72 : 1 }]}>
							{exporting ? <ActivityIndicator color={theme.accent} size="small" /> : <FileDown color={theme.accent} size={18} />}
							<Text style={[s.secondaryActionText, { color: theme.text }]}>Génération minimale</Text>
						</Pressable>
						<Pressable
							disabled={exporting}
							onPress={() => onGenerate("complete")}
							style={({ pressed }) => [s.primaryAction, { backgroundColor: theme.accent, opacity: exporting || pressed ? 0.72 : 1 }]}>
							{exporting ? <ActivityIndicator color="#fff" size="small" /> : <FileDown color="#fff" size={18} />}
							<Text style={s.primaryActionText}>Génération complète</Text>
						</Pressable>
					</View>
				</Pressable>
			</Pressable>
		</Modal>
	);
}

function SemesterSelector({ label, semesters, selectedSemester, onSelect }: { label: string; semesters: number[]; selectedSemester: number; onSelect: (semester: number) => void }) {
	const { theme } = useTheme();
	return (
		<View style={s.selector}>
			<Text style={[s.selectorLabel, { color: theme.muted }]}>{label}</Text>
			<View style={s.choices}>
				{semesters.map((semester) => {
					const active = semester === selectedSemester;
					return (
						<Pressable key={semester} accessibilityRole="button" onPress={() => onSelect(semester)} style={[s.choice, { borderColor: active ? theme.accent : theme.border, backgroundColor: active ? theme.accentSoft : theme.bg }]}>
							<Text style={[s.choiceText, { color: active ? theme.accent : theme.text }]}>S{semester}</Text>
						</Pressable>
					);
				})}
			</View>
		</View>
	);
}

const s = StyleSheet.create({
	backdrop: { flex: 1, justifyContent: "center", padding: 22, backgroundColor: "rgba(2, 25, 43, 0.48)" },
	sheet: { borderWidth: 1, borderRadius: 24, padding: 18, shadowColor: "#001f3d", shadowOpacity: 0.22, shadowRadius: 24, elevation: 10 },
	header: { flexDirection: "row", alignItems: "center", gap: 11 },
	icon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
	headerCopy: { flex: 1, minWidth: 0 },
	title: { fontSize: 17, fontWeight: "900", letterSpacing: -0.2 },
	subtitle: { marginTop: 2, fontSize: 12, fontWeight: "700" },
	selector: { marginTop: 18 },
	selectorLabel: { marginBottom: 8, fontSize: 11, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.3 },
	choices: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
	choice: { minWidth: 54, minHeight: 42, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, alignItems: "center", justifyContent: "center" },
	choiceText: { fontSize: 14, fontWeight: "900" },
	actions: { gap: 9, marginTop: 22 },
	secondaryAction: { minHeight: 48, borderWidth: 1, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, paddingHorizontal: 14 },
	secondaryActionText: { fontSize: 14, fontWeight: "900" },
	primaryAction: { minHeight: 50, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, paddingHorizontal: 14 },
	primaryActionText: { color: "#fff", fontSize: 14, fontWeight: "900" },
});
