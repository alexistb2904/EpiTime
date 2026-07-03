import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { useTheme } from "../../context/ThemeContext";
import type { DisplayGrade } from "../../services/gradesService";

function formatScore(grade: DisplayGrade) {
	if (grade.studentScore?.status) return grade.studentScore.status;
	if (grade.studentScore?.outOf) return `${grade.studentScore.value.toFixed(grade.studentScore.value % 1 ? 1 : 0)}/20`;
	return "-";
}

export default function GradeCard({ grade, onPress }: { grade: DisplayGrade; onPress?: () => void }) {
	const { theme } = useTheme();
	const validation = Boolean(grade.studentScore?.status);
	return (
		<Pressable style={[s.root, { backgroundColor: theme.bg, borderColor: theme.border }]} onPress={onPress}>
			<View style={s.body}>
				<Text style={[s.title, { color: theme.text }]} numberOfLines={2}>
					{grade.description}
				</Text>
				<Text style={[s.meta, { color: theme.muted }]} numberOfLines={1}>
					{grade.rawCode} · coeff {grade.coefficient.toFixed(grade.coefficient % 1 ? 2 : 0)}
				</Text>
			</View>
			<View style={[s.score, { backgroundColor: validation ? theme.surfaceSoft : theme.accentSoft }]}>
				<Text style={[s.scoreText, { color: validation ? theme.text : theme.accent }]}>{formatScore(grade)}</Text>
			</View>
			<ChevronRight color={theme.muted} size={18} />
		</Pressable>
	);
}

const s = StyleSheet.create({
	root: { borderWidth: 1, borderRadius: 14, padding: 12, flexDirection: "row", alignItems: "center", gap: 10 },
	body: { flex: 1, minWidth: 0 },
	title: { fontSize: 14, fontWeight: "900", lineHeight: 18 },
	meta: { marginTop: 5, fontSize: 11, fontWeight: "700" },
	score: { minWidth: 62, minHeight: 38, borderRadius: 8, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
	scoreText: { fontSize: 13, fontWeight: "900" },
});
