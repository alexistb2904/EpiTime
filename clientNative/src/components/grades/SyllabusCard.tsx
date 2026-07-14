import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { BookOpen, ChevronRight } from "lucide-react-native";
import { useTheme } from "../../context/ThemeContext";
import type { AurigaSyllabus } from "../../services/aurigaTypes";
import { formatSecondsAsHours } from "../../utils/syllabusTime";

export default function SyllabusCard({ syllabus, coefficient, onPress }: { syllabus: AurigaSyllabus; coefficient?: number; onPress: () => void }) {
	const { theme } = useTheme();
	const displayedCoefficient = coefficient ?? syllabus.coeff;
	return (
		<Pressable style={[s.root, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={onPress}>
			<View style={[s.icon, { backgroundColor: theme.accentSoft }]}>
				<BookOpen color={theme.accent} size={20} />
			</View>
			<View style={s.body}>
				<Text style={[s.title, { color: theme.text }]} numberOfLines={2}>
					{syllabus.caption?.name || syllabus.name}
				</Text>
				<Text style={[s.meta, { color: theme.muted }]} numberOfLines={1}>
					{syllabus.UE} · {syllabus.exams.length} examen{syllabus.exams.length > 1 ? "s" : ""} · {formatSecondsAsHours(syllabus.duration, "Durée inconnue")} encadrées
					{displayedCoefficient ? ` · coeff ${displayedCoefficient}` : ""}
				</Text>
				{syllabus.estimatedStudentWorkload ? (
					<Text style={[s.workload, { color: theme.muted }]} numberOfLines={1}>
						Travail attendu {formatSecondsAsHours(syllabus.estimatedStudentWorkload)}
					</Text>
				) : null}
			</View>
			<ChevronRight color={theme.muted} size={19} />
		</Pressable>
	);
}

const s = StyleSheet.create({
	root: { borderWidth: 1, borderRadius: 18, padding: 13, flexDirection: "row", alignItems: "center", gap: 12 },
	icon: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
	body: { flex: 1, minWidth: 0 },
	title: { fontSize: 15, fontWeight: "900", lineHeight: 20 },
	meta: { marginTop: 5, fontSize: 12, fontWeight: "800" },
	workload: { marginTop: 3, fontSize: 11, fontWeight: "800" },
});
