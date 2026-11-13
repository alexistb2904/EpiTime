import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { useTheme } from "../../context/ThemeContext";
import type { AurigaSyllabus } from "../../services/aurigaTypes";
import { formatSecondsAsHours } from "../../utils/syllabusTime";

export default function SyllabusCard({ syllabus, coefficient, onPress }: { syllabus: AurigaSyllabus; coefficient?: number; onPress: () => void }) {
	const { theme } = useTheme();
	const displayedCoefficient = coefficient ?? syllabus.coeff;
	const title = syllabus.caption?.name || syllabus.name;
	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="button"
			accessibilityLabel={title}
			android_ripple={{ color: theme.accentSoft }}
			style={({ pressed }) => [s.root, pressed && Platform.OS === "ios" && { backgroundColor: theme.surfaceSoft }]}>
			<View style={s.body}>
				<Text style={[s.title, { color: theme.text }]} numberOfLines={2}>
					{title}
				</Text>
				<Text style={[s.meta, { color: theme.muted }]} numberOfLines={2}>
					{syllabus.exams.length} examen{syllabus.exams.length > 1 ? "s" : ""} · {formatSecondsAsHours(syllabus.duration, "Durée inconnue")} encadrées
					{displayedCoefficient ? ` · coeff ${displayedCoefficient}` : ""}
				</Text>
				{syllabus.estimatedStudentWorkload ? (
					<Text style={[s.meta, { color: theme.muted }]} numberOfLines={1}>
						Travail attendu {formatSecondsAsHours(syllabus.estimatedStudentWorkload)}
					</Text>
				) : null}
			</View>
			<ChevronRight color={theme.muted} size={18} />
		</Pressable>
	);
}

const s = StyleSheet.create({
	root: { minHeight: 64, paddingLeft: 16, paddingRight: 10, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 10 },
	body: { flex: 1, minWidth: 0, gap: 3 },
	title: { fontSize: 15, lineHeight: 20, fontWeight: "800" },
	meta: { fontSize: 13, fontWeight: "700", fontVariant: ["tabular-nums"] },
});
