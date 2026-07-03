import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { BookOpen, ChevronDown, ChevronRight } from "lucide-react-native";
import { useTheme } from "../../context/ThemeContext";
import type { AurigaSyllabus } from "../../services/aurigaTypes";
import type { DisplayGrade, DisplaySubject } from "../../services/gradesService";
import GradeCard from "./GradeCard";

function formatAverage(value: DisplaySubject["studentAverage"]) {
	if (value.status) return value.status;
	if (value.outOf) return value.value.toFixed(2);
	return "-";
}

export default function SubjectAccordion({
	subject,
	onOpenGrade,
	onOpenSyllabus,
}: {
	subject: DisplaySubject;
	onOpenGrade?: (grade: DisplayGrade) => void;
	onOpenSyllabus?: (syllabus: AurigaSyllabus) => void;
}) {
	const { theme } = useTheme();
	const [open, setOpen] = useState(false);
	const average = useMemo(() => formatAverage(subject.studentAverage), [subject.studentAverage]);
	return (
		<View style={[s.root, { borderColor: theme.border, backgroundColor: theme.surface }]}>
			<Pressable style={s.header} onPress={() => setOpen((value) => !value)}>
				<View style={s.titleBox}>
					<Text style={[s.name, { color: theme.text }]} numberOfLines={2}>
						{subject.name}
					</Text>
					<Text style={[s.meta, { color: theme.muted }]} numberOfLines={1}>
						{subject.ueCode} · {subject.grades.length} note{subject.grades.length > 1 ? "s" : ""}
					</Text>
				</View>
				<View style={[s.average, { backgroundColor: subject.hasNonValidated ? "rgba(239, 68, 68, 0.12)" : theme.accentSoft }]}>
					<Text style={[s.averageText, { color: subject.hasNonValidated ? theme.danger : theme.accent }]}>{average}</Text>
				</View>
				{open ? <ChevronDown color={theme.muted} size={20} /> : <ChevronRight color={theme.muted} size={20} />}
			</Pressable>
			{open ? (
				<View style={s.content}>
					{subject.syllabus ? (
						<Pressable style={[s.syllabusButton, { backgroundColor: theme.bg, borderColor: theme.border }]} onPress={() => onOpenSyllabus?.(subject.syllabus!)}>
							<BookOpen color={theme.accent} size={17} />
							<Text style={[s.syllabusText, { color: theme.text }]}>Voir le syllabus</Text>
						</Pressable>
					) : null}
					{subject.grades.map((grade) => (
						<GradeCard key={grade.id} grade={grade} onPress={() => onOpenGrade?.(grade)} />
					))}
				</View>
			) : null}
		</View>
	);
}

const s = StyleSheet.create({
	root: { borderWidth: 1, borderRadius: 18, overflow: "hidden" },
	header: { minHeight: 76, padding: 12, flexDirection: "row", alignItems: "center", gap: 10 },
	titleBox: { flex: 1, minWidth: 0 },
	name: { fontSize: 16, fontWeight: "900", lineHeight: 20 },
	meta: { marginTop: 4, fontSize: 12, fontWeight: "800" },
	average: { minWidth: 58, minHeight: 38, borderRadius: 8, paddingHorizontal: 8, alignItems: "center", justifyContent: "center" },
	averageText: { fontSize: 14, fontWeight: "900" },
	content: { gap: 10, paddingHorizontal: 12, paddingBottom: 12 },
	syllabusButton: { borderWidth: 1, borderRadius: 12, minHeight: 42, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 8 },
	syllabusText: { fontSize: 14, fontWeight: "900" },
});
