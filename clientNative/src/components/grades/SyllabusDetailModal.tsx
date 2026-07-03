import React, { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import {
	BookOpenCheck,
	BriefcaseBusiness,
	Calculator,
	CalendarRange,
	ClipboardList,
	Clock3,
	FileText,
	Languages,
	Paperclip,
	Sparkles,
	Target,
	UserRound,
	X,
} from "lucide-react-native";
import { useTheme } from "../../context/ThemeContext";
import { cleanHtml, type AurigaExam, type AurigaSyllabus } from "../../services/aurigaTypes";
import { formatSecondsAsHours } from "../../utils/syllabusTime";

function scoreInputToNumber(value: string) {
	const parsed = Number(value.replace(",", "."));
	return Number.isFinite(parsed) ? parsed : null;
}

function examWeight(exam: AurigaExam, examCount: number) {
	return typeof exam.weighting === "number" && exam.weighting > 0 ? exam.weighting : 100 / Math.max(1, examCount);
}

type MissingExam = {
	exam: AurigaExam;
	weight: number;
};

type SimulatorState = {
	knownWeighted: number;
	knownWeight: number;
	totalWeight: number;
	missing: MissingExam[];
	filledCount: number;
	simulatedAverage: number | null;
};

function computeSimulatorState(exams: AurigaExam[], values: Record<number, string>): SimulatorState | null {
	if (!exams.length) return null;
	let knownWeighted = 0;
	let knownWeight = 0;
	let validCount = 0;
	let totalWeight = 0;
	const missing: MissingExam[] = [];

	for (const exam of exams) {
		const weight = examWeight(exam, exams.length);
		totalWeight += weight;
		const value = scoreInputToNumber(values[exam.id] || "");
		if (value === null) {
			missing.push({ exam, weight });
			continue;
		}
		knownWeighted += value * weight;
		knownWeight += weight;
		validCount += 1;
	}

	return {
		knownWeighted,
		knownWeight,
		totalWeight: totalWeight || 100,
		missing,
		filledCount: validCount,
		simulatedAverage: validCount ? knownWeighted / Math.max(1, knownWeight) : null,
	};
}

function gradeForTarget(target: number, state: SimulatorState, examWeightValue?: number, otherMissingValue?: number) {
	const missingWeight = state.missing.reduce((sum, item) => sum + item.weight, 0);
	if (!missingWeight) return state.knownWeighted / Math.max(1, state.totalWeight);
	if (examWeightValue === undefined) return (target * state.totalWeight - state.knownWeighted) / missingWeight;
	const otherWeight = missingWeight - examWeightValue;
	return (target * state.totalWeight - state.knownWeighted - otherWeight * (otherMissingValue ?? 0)) / examWeightValue;
}

function formatRequiredGrade(value: number) {
	if (value <= 0) return "deja acquis";
	if (value > 20) return `${value.toFixed(2)}/20`;
	return `${value.toFixed(2)}/20`;
}

function languageLabel(ids?: number[]) {
	const labels = (ids || []).map((id) => (id === 1 ? "Français" : id === 2 ? "Anglais" : `Langue ${id}`));
	return labels.length ? labels.join(", ") : "-";
}

function formatFileSize(size?: number) {
	if (!size || !Number.isFinite(size)) return "";
	if (size < 1024 * 1024) return `${Math.round(size / 1024)} Ko`;
	return `${(size / 1024 / 1024).toFixed(1)} Mo`;
}

function formatPeriod(start?: string, end?: string) {
	if (!start && !end) return "-";
	const format = (value?: string) => {
		if (!value) return null;
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return null;
		return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
	};
	return [format(start), format(end)].filter(Boolean).join(" - ") || "-";
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children?: React.ReactNode }) {
	const { theme } = useTheme();
	if (!children) return null;
	return (
		<View style={s.section}>
			<View style={s.sectionHeader}>
				{icon}
				<Text style={[s.sectionTitle, { color: theme.muted }]}>{title}</Text>
			</View>
			{children}
		</View>
	);
}

export default function SyllabusDetailModal({ syllabus, visible, onClose }: { syllabus: AurigaSyllabus | null; visible: boolean; onClose: () => void }) {
	const { theme } = useTheme();
	const insets = useSafeAreaInsets();
	const [simulatorOpen, setSimulatorOpen] = useState(false);
	const [scores, setScores] = useState<Record<number, string>>({});
	const description = cleanHtml(syllabus?.courseDescription?.coursPlan?.fr);
	const prerequisites = cleanHtml(syllabus?.prerequisites?.fr);
	const goals = cleanHtml(syllabus?.caption?.goals?.fr);
	const program = cleanHtml(syllabus?.caption?.program?.fr);
	const exams = syllabus?.exams || [];
	const activities = syllabus?.activities || [];
	const minTarget = typeof syllabus?.minScore === "number" ? syllabus.minScore : 10;
	const activitySeconds = activities.reduce((total, activity) => total + (typeof activity.duration === "number" ? activity.duration : 0), 0);
	const simulatorState = useMemo(() => computeSimulatorState(exams, scores), [exams, scores]);

	useEffect(() => {
		setSimulatorOpen(false);
		setScores({});
	}, [syllabus?.id]);

	return (
		<Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
			<View style={[s.root, { backgroundColor: theme.bg, paddingTop: insets.top + 12 }]}>
				<View style={[s.header, { borderBottomColor: theme.border }]}>
					<View style={s.headerText}>
						<Text style={[s.eyebrow, { color: theme.accent }]}>{syllabus?.UE || "Syllabus"}</Text>
						<Text style={[s.title, { color: theme.text }]} numberOfLines={2}>
							{syllabus?.caption?.name || syllabus?.name || "Syllabus"}
						</Text>
					</View>
					<Pressable style={[s.close, { borderColor: theme.border, backgroundColor: theme.surface }]} onPress={onClose}>
						<X color={theme.text} size={20} />
					</Pressable>
				</View>
				<ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 42 }]}>
					<View style={[s.overview, { backgroundColor: theme.surface, borderColor: theme.border }]}>
						<View style={s.overviewTop}>
							<View style={[s.overviewIcon, { backgroundColor: theme.accentSoft }]}>
								<BookOpenCheck color={theme.accent} size={24} />
							</View>
							<View style={s.overviewText}>
								<Text style={[s.overviewLabel, { color: theme.muted }]}>Fiche matière</Text>
								<Text style={[s.overviewTitle, { color: theme.text }]} numberOfLines={2}>
									{syllabus?.caption?.name || syllabus?.name || "Syllabus"}
								</Text>
								<Text style={[s.code, { color: theme.muted }]} numberOfLines={1}>
									{syllabus?.code || syllabus?.name}
								</Text>
							</View>
						</View>
						<View style={s.metrics}>
							<Metric icon={<Clock3 color={theme.accent} size={18} />} label="Encadré" value={formatSecondsAsHours(syllabus?.duration)} />
							<Metric icon={<BriefcaseBusiness color={theme.accent} size={18} />} label="Travail" value={formatSecondsAsHours(syllabus?.estimatedStudentWorkload)} />
							<Metric icon={<Target color={theme.accent} size={18} />} label="Seuil" value={syllabus?.minScore ? `${syllabus.minScore}/20` : "10/20"} />
							<Metric icon={<ClipboardList color={theme.accent} size={18} />} label="Coeff" value={syllabus?.coeff ? String(syllabus.coeff) : "1"} />
						</View>
						<View style={s.quickFacts}>
							<Fact icon={<Languages color={theme.accent} size={15} />} label={languageLabel(syllabus?.mediaLanguages)} />
							<Fact icon={<CalendarRange color={theme.accent} size={15} />} label={formatPeriod(syllabus?.period?.startDate, syllabus?.period?.endDate)} />
						</View>
					</View>
					<Section title="Examens" icon={<ClipboardList color={theme.muted} size={23} />}>
						<View style={[s.groupedCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
							{exams.length ? (
								exams.map((exam, index) => (
									<View key={`${exam.id}-${exam.index}`} style={[s.groupedRow, index > 0 && { borderTopColor: theme.border, borderTopWidth: 1 }]}>
										<View style={s.rowHeader}>
											<View style={s.rowTextBox}>
												<Text style={[s.rowTitle, { color: theme.text }]}>{exam.typeName || exam.type}</Text>
												<Text style={[s.rowText, { color: theme.muted }]}>{cleanHtml(exam.description?.fr) || "Evaluation"}</Text>
											</View>
											<View style={[s.weightBadge, { backgroundColor: theme.accentSoft }]}>
												<Text style={[s.weightText, { color: theme.accent }]}>{Math.round(examWeight(exam, exams.length) * 10) / 10}%</Text>
											</View>
										</View>
									</View>
								))
							) : (
								<Text style={[s.empty, { color: theme.muted }]}>Aucun examen detaille.</Text>
							)}
						</View>
						{exams.length ? (
							<Pressable style={[s.simulatorButton, { backgroundColor: theme.accent }]} onPress={() => setSimulatorOpen((value) => !value)}>
								<Calculator color="#fff" size={18} />
								<Text style={s.simulatorButtonText}>{simulatorOpen ? "Fermer le simulateur" : "Simuler mes notes"}</Text>
							</Pressable>
						) : null}
						{simulatorOpen ? (
							<Animated.View entering={FadeInDown.duration(240)} style={[s.simulator, { backgroundColor: theme.surface, borderColor: theme.border }]}>
								<Text style={[s.simulatorTitle, { color: theme.text }]}>Projection</Text>
								<View style={s.list}>
									{exams.map((exam) => (
										<View key={`sim-${exam.id}`} style={[s.simRow, { backgroundColor: theme.bg, borderColor: theme.border }]}>
											<View style={s.rowTextBox}>
												<Text style={[s.simLabel, { color: theme.text }]} numberOfLines={1}>
													{exam.typeName || exam.type}
												</Text>
												<Text style={[s.rowMeta, { color: theme.muted }]}>{Math.round(examWeight(exam, exams.length) * 10) / 10}%</Text>
											</View>
											<TextInput
												value={scores[exam.id] || ""}
												onChangeText={(value) => setScores((current) => ({ ...current, [exam.id]: value }))}
												placeholder="/20"
												placeholderTextColor={theme.muted}
												keyboardType="decimal-pad"
												style={[s.simInput, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
											/>
										</View>
									))}
								</View>
								<SimulatedAverage state={simulatorState} />
								<ObjectiveCard title={`Pour le seuil ${minTarget}/20`} target={minTarget} state={simulatorState} />
								<ObjectiveCard title="Pour avoir 10/20" target={10} state={simulatorState} />
							</Animated.View>
						) : null}
					</Section>
					<Section title="Activites" icon={<Sparkles color={theme.muted} size={23} />}>
						<View style={[s.activitySummary, { backgroundColor: theme.accentSoft }]}>
							<Text style={[s.activitySummaryValue, { color: theme.accent }]}>{formatSecondsAsHours(activitySeconds)}</Text>
							<Text style={[s.activitySummaryText, { color: theme.muted }]}> Total volume activités</Text>
						</View>
						<View style={[s.groupedCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
							{activities.length ? (
								activities.map((activity, index) => (
									<View key={`${activity.id}-${activity.type}`} style={[s.groupedRow, index > 0 && { borderTopColor: theme.border, borderTopWidth: 1 }]}>
										<View style={s.rowTextBox}>
											<Text style={[s.rowTitle, { color: theme.text }]}>{activity.typeName || activity.type}</Text>
										</View>
										<View style={[s.weightBadge, { backgroundColor: theme.accentSoft }]}>
											<Text style={[s.weightText, { color: theme.accent }]}>{formatSecondsAsHours(activity.duration)}</Text>
										</View>
									</View>
								))
							) : (
								<Text style={[s.empty, { color: theme.muted }]}>Aucune activite detaillee.</Text>
							)}
						</View>
					</Section>
					<Section title="Referent" icon={<UserRound color={theme.muted} size={23} />}>
						<View style={[s.groupedCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
							{syllabus?.responsables?.length ? (
								syllabus.responsables.map((person, index) => (
									<View key={`${person.uid}-${person.login}`} style={[s.groupedRow, index > 0 && { borderTopColor: theme.border, borderTopWidth: 1 }]}>
										<Text style={[s.rowTitle, { color: theme.text }]}>{[person.firstName, person.lastName].filter(Boolean).join(" ") || person.login}</Text>
									</View>
								))
							) : (
								<Text style={[s.empty, { color: theme.muted }]}>Aucun referent detaille.</Text>
							)}
						</View>
					</Section>
					<Section title="Details" icon={<FileText color={theme.muted} size={23} />}>
						<View style={[s.groupedCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
							{description ? <DetailBlock title="Description" text={description} /> : null}
							{prerequisites ? <DetailBlock title="Prerequis" text={prerequisites} separated={Boolean(description)} /> : null}
							{goals ? <DetailBlock title="Objectifs" text={goals} separated={Boolean(description || prerequisites)} /> : null}
							{program ? <DetailBlock title="Programme" text={program} separated={Boolean(description || prerequisites || goals)} /> : null}
							{!description && !prerequisites && !goals && !program ? <Text style={[s.empty, { color: theme.muted }]}>Aucun detail disponible.</Text> : null}
						</View>
					</Section>
					{syllabus?.documents?.length ? (
						<Section title="Documents" icon={<Paperclip color={theme.muted} size={23} />}>
							<View style={[s.groupedCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
								{syllabus.documents.map((document, index) => (
									<View key={`${document.id}-${document.fileName}`} style={[s.groupedRow, index > 0 && { borderTopColor: theme.border, borderTopWidth: 1 }]}>
										<View style={s.rowTextBox}>
											<Text style={[s.rowTitle, { color: theme.text }]}>{document.fileName || "Document"}</Text>
											<Text style={[s.rowText, { color: theme.muted }]}>
												{[
													document.language === "fr" ? "Français" : document.language === "en" ? "Anglais" : null,
													document.fileExtension?.toUpperCase(),
													formatFileSize(document.fileSize),
													document.status,
												]
													.filter(Boolean)
													.join(" · ")}
											</Text>
										</View>
									</View>
								))}
							</View>
						</Section>
					) : null}
				</ScrollView>
			</View>
		</Modal>
	);
}

function SimulatedAverage({ state }: { state: SimulatorState | null }) {
	const { theme } = useTheme();
	if (!state) return null;
	const allFilled = state.missing.length === 0 && state.filledCount > 0;
	return (
		<View style={[s.simAverage, { backgroundColor: theme.bg, borderColor: theme.border }]}>
			<Text style={[s.resultLabel, { color: theme.muted }]}>Moyenne simulee</Text>
			<Text style={[s.simAverageValue, { color: theme.text }]}>{state.simulatedAverage === null ? "-" : `${state.simulatedAverage.toFixed(2)}/20`}</Text>
			<Text style={[s.resultHint, { color: theme.muted }]}>
				{allFilled
					? "Toutes les notes sont remplies."
					: state.filledCount
						? `Basee sur ${state.filledCount} note${state.filledCount > 1 ? "s" : ""} saisie${state.filledCount > 1 ? "s" : ""}.`
						: "Entre au moins une note pour commencer."}
			</Text>
		</View>
	);
}

function ObjectiveCard({ title, target, state }: { title: string; target: number; state: SimulatorState | null }) {
	const { theme } = useTheme();
	if (!state) return null;
	const missingWeight = state.missing.reduce((sum, item) => sum + item.weight, 0);
	const finalAverage = !state.missing.length && state.filledCount ? state.knownWeighted / Math.max(1, state.totalWeight) : null;
	const equalRequired = missingWeight ? gradeForTarget(target, state) : null;
	const impossible = equalRequired !== null && equalRequired > 20;
	const reached = finalAverage !== null ? finalAverage >= target : equalRequired !== null && equalRequired <= 0;
	return (
		<View style={[s.objectiveCard, { backgroundColor: theme.bg, borderColor: impossible ? theme.danger : reached ? theme.warn : theme.border }]}>
			<Text style={[s.resultLabel, { color: theme.muted }]}>{title}</Text>
			{finalAverage !== null ? (
				<Text style={[s.resultValue, { color: finalAverage >= target ? theme.accent : theme.danger }]}>
					{finalAverage >= target ? "Objectif atteint" : "Objectif non atteint"}
				</Text>
			) : !state.missing.length ? (
				<Text style={[s.resultHint, { color: theme.muted }]}>Remplis les notes pour calculer l'objectif.</Text>
			) : (
				<View style={s.combinations}>
					<CombinationLine
						label="Toutes les notes restantes"
						value={formatRequiredGrade(equalRequired!)}
						strong
						impossible={equalRequired! > 20}
						reached={equalRequired! <= 0}
					/>
					{state.missing.length > 1
						? state.missing.map(({ exam, weight }) => {
								const neededIfOthers10 = gradeForTarget(target, state, weight, 10);
								return (
									<CombinationLine
										key={`${title}-${exam.id}`}
										label={`${exam.typeName || exam.type} si les autres font 10`}
										value={formatRequiredGrade(neededIfOthers10)}
										impossible={neededIfOthers10 > 20}
										reached={neededIfOthers10 <= 0}
									/>
								);
							})
						: null}
				</View>
			)}
		</View>
	);
}

function CombinationLine({ label, value, strong, impossible, reached }: { label: string; value: string; strong?: boolean; impossible?: boolean; reached?: boolean }) {
	const { theme } = useTheme();
	return (
		<View style={[s.comboLine, strong && { backgroundColor: theme.surface }]}>
			<Text style={[s.comboLabel, { color: theme.muted }]} numberOfLines={2}>
				{label}
			</Text>
			<Text style={[s.comboValue, { color: impossible ? theme.danger : reached ? theme.warn : theme.text }]}>{value}</Text>
		</View>
	);
}

function DetailBlock({ title, text, separated }: { title: string; text: string; separated?: boolean }) {
	const { theme } = useTheme();
	return (
		<View style={[s.detailBlock, separated && { borderTopColor: theme.border, borderTopWidth: 1 }]}>
			<Text style={[s.rowTitle, { color: theme.text }]}>{title}</Text>
			<MarkdownText text={text} />
		</View>
	);
}

function InlineMarkdown({ text }: { text: string }) {
	const { theme } = useTheme();
	const parts = text.split(/(\*\*[^*]+\*\*|_[^_]+_)/g).filter(Boolean);
	return (
		<Text style={[s.paragraph, { color: theme.muted }]}>
			{parts.map((part, index) => {
				if (part.startsWith("**") && part.endsWith("**")) {
					return (
						<Text key={`${part}-${index}`} style={[s.markStrong, { color: theme.text }]}>
							{part.slice(2, -2)}
						</Text>
					);
				}
				if (part.startsWith("_") && part.endsWith("_")) {
					return (
						<Text key={`${part}-${index}`} style={s.markEm}>
							{part.slice(1, -1)}
						</Text>
					);
				}
				return <Text key={`${part}-${index}`}>{part}</Text>;
			})}
		</Text>
	);
}

function MarkdownText({ text }: { text: string }) {
	const { theme } = useTheme();
	const lines = text
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
	return (
		<View style={s.markdown}>
			{lines.map((line, index) => {
				const bullet = line.match(/^[-*]\s+(.+)/);
				if (bullet) {
					return (
						<View key={`${line}-${index}`} style={s.bulletRow}>
							<Text style={[s.bulletDot, { color: theme.accent }]}>•</Text>
							<View style={s.bulletText}>
								<InlineMarkdown text={bullet[1]} />
							</View>
						</View>
					);
				}
				const heading = line.match(/^#{1,3}\s+(.+)/);
				if (heading) {
					return (
						<Text key={`${line}-${index}`} style={[s.markHeading, { color: theme.text }]}>
							{heading[1]}
						</Text>
					);
				}
				return <InlineMarkdown key={`${line}-${index}`} text={line} />;
			})}
		</View>
	);
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
	const { theme } = useTheme();
	return (
		<View style={[s.metric, { backgroundColor: theme.surface, borderColor: theme.border }]}>
			{icon}
			<Text style={[s.metricValue, { color: theme.text }]}>{value}</Text>
			<Text style={[s.metricLabel, { color: theme.muted }]}>{label}</Text>
		</View>
	);
}

function Fact({ icon, label }: { icon: React.ReactNode; label: string }) {
	const { theme } = useTheme();
	return (
		<View style={[s.fact, { backgroundColor: theme.bg, borderColor: theme.border }]}>
			{icon}
			<Text style={[s.factText, { color: theme.text }]} numberOfLines={1}>
				{label}
			</Text>
		</View>
	);
}

const s = StyleSheet.create({
	root: { flex: 1 },
	header: { paddingHorizontal: 18, paddingBottom: 14, borderBottomWidth: 1, flexDirection: "row", alignItems: "center", gap: 12 },
	headerText: { flex: 1, minWidth: 0 },
	eyebrow: { fontSize: 12, fontWeight: "900", textTransform: "uppercase" },
	title: { marginTop: 3, fontSize: 20, fontWeight: "900", lineHeight: 25 },
	close: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
	content: { padding: 18, gap: 22 },
	overview: { borderWidth: 1, borderRadius: 26, padding: 16, gap: 16 },
	overviewTop: { flexDirection: "row", alignItems: "center", gap: 12 },
	overviewIcon: { width: 54, height: 54, borderRadius: 18, alignItems: "center", justifyContent: "center" },
	overviewText: { flex: 1, minWidth: 0 },
	overviewLabel: { fontSize: 11, fontWeight: "900", textTransform: "uppercase" },
	overviewTitle: { marginTop: 3, fontSize: 18, lineHeight: 23, fontWeight: "900" },
	metrics: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
	metric: { width: "47.8%", minHeight: 86, borderWidth: 1, borderRadius: 16, padding: 11, justifyContent: "space-between" },
	metricValue: { marginTop: 8, fontSize: 18, fontWeight: "900" },
	metricLabel: { marginTop: 3, fontSize: 11, fontWeight: "900", textTransform: "uppercase" },
	quickFacts: { flexDirection: "row", gap: 8 },
	fact: { flex: 1, minHeight: 38, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 7 },
	factText: { flex: 1, fontSize: 12, fontWeight: "900" },
	code: { fontSize: 12, fontWeight: "800" },
	section: { gap: 12, marginTop: 6 },
	sectionHeader: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 6 },
	sectionTitle: { fontSize: 20, fontWeight: "900" },
	list: { gap: 10 },
	groupedCard: { borderWidth: 1, borderRadius: 24, overflow: "hidden" },
	groupedRow: { minHeight: 82, paddingHorizontal: 18, paddingVertical: 15, flexDirection: "row", alignItems: "center", gap: 12 },
	row: { borderWidth: 1, borderRadius: 14, padding: 12 },
	rowHeader: { flexDirection: "row", gap: 10, alignItems: "center" },
	rowTextBox: { flex: 1, minWidth: 0 },
	rowTitle: { fontSize: 17, fontWeight: "900" },
	rowText: { marginTop: 6, fontSize: 14, lineHeight: 20, fontWeight: "800" },
	rowMeta: { marginTop: 4, fontSize: 12, fontWeight: "800" },
	weightBadge: { minWidth: 74, minHeight: 42, borderRadius: 22, alignItems: "center", justifyContent: "center", paddingHorizontal: 14 },
	weightText: { fontSize: 17, fontWeight: "900" },
	activitySummary: { minHeight: 54, borderRadius: 16, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
	activitySummaryValue: { fontSize: 18, fontWeight: "900" },
	activitySummaryText: { flex: 1, textAlign: "right", fontSize: 12, lineHeight: 16, fontWeight: "900" },
	simulatorButton: { minHeight: 48, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
	simulatorButtonText: { color: "#fff", fontSize: 15, fontWeight: "900" },
	simulator: { borderWidth: 1, borderRadius: 18, padding: 14, gap: 12 },
	simulatorTitle: { fontSize: 17, fontWeight: "900" },
	simRow: { borderWidth: 1, borderRadius: 14, padding: 10, flexDirection: "row", alignItems: "center", gap: 10 },
	simLabel: { fontSize: 14, fontWeight: "900" },
	simInput: { width: 78, minHeight: 42, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, fontSize: 15, fontWeight: "900", textAlign: "center" },
	result: { borderWidth: 1, borderRadius: 14, padding: 12 },
	resultLabel: { fontSize: 12, fontWeight: "900", textTransform: "uppercase" },
	resultValue: { marginTop: 4, fontSize: 19, fontWeight: "900" },
	resultHint: { marginTop: 3, fontSize: 12, fontWeight: "800" },
	simAverage: { borderWidth: 1, borderRadius: 16, padding: 14 },
	simAverageValue: { marginTop: 5, fontSize: 26, fontWeight: "900", letterSpacing: 0 },
	objectiveCard: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 10 },
	combinations: { gap: 8 },
	comboLine: { minHeight: 46, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 10 },
	comboLabel: { flex: 1, fontSize: 12, lineHeight: 16, fontWeight: "800" },
	comboValue: { fontSize: 14, fontWeight: "900", textAlign: "right" },
	detailBlock: { paddingHorizontal: 18, paddingVertical: 16 },
	paragraph: { marginTop: 8, fontSize: 14, lineHeight: 21, fontWeight: "800" },
	markdown: { marginTop: 8, gap: 7 },
	bulletRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
	bulletDot: { width: 14, fontSize: 15, lineHeight: 21, fontWeight: "900" },
	bulletText: { flex: 1, minWidth: 0 },
	markHeading: { fontSize: 15, lineHeight: 21, fontWeight: "900" },
	markStrong: { fontWeight: "900" },
	markEm: { fontStyle: "italic" },
	empty: { padding: 18, fontWeight: "800" },
});
