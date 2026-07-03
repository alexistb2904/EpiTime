import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView, type WebViewNavigation } from "react-native-webview";
import Animated, { FadeInDown, FadeInUp, Layout } from "react-native-reanimated";
import {
	Award,
	BadgePlus,
	BookMarked,
	BookOpen,
	Calculator,
	ChartNoAxesCombined,
	ChevronDown,
	ChevronRight,
	ClipboardList,
	GraduationCap,
	Hash,
	KeyRound,
	LogIn,
	LogOut,
	Mail,
	Percent,
	RefreshCw,
	Search,
	Sigma,
	Target,
	Trash2,
	WifiOff,
	X,
} from "lucide-react-native";
import Card from "../Card";
import SyllabusCard from "./SyllabusCard";
import SyllabusDetailModal from "./SyllabusDetailModal";
import { useTheme } from "../../context/ThemeContext";
import { type AurigaLoginSession } from "../../services/aurigaAuth";
import { type ManualGrade } from "../../services/manualGrades";
import type { AurigaSyllabus } from "../../services/aurigaTypes";
import { type DisplayGrade, type DisplaySubject, type DisplayUE } from "../../services/gradesService";

function scoreLabel(score?: { value: number; outOf?: number; status?: string }) {
	if (!score) return "-";
	if (score.status) return score.status;
	if (score.outOf) return score.value.toFixed(score.value % 1 ? 1 : 0);
	return "-";
}

function averageLabel(score?: { value: number; outOf?: number; status?: string }) {
	if (!score) return "-";
	if (score.status) return score.status;
	if (score.outOf) return score.value.toFixed(2);
	return "-";
}

export function GradesContent({
	addManualGrade,
	connectWithAurigaId,
	connected,
	connecting,
	contentPaddingBottom,
	deleteManualGrade,
	disconnectAuriga,
	filteredSyllabus,
	findSubjectInPeriods,
	groupedSyllabus,
	insets,
	lastSyncLabel,
	loginSession,
	manualGrades,
	mode,
	noteUes,
	offline,
	onWebNavigation,
	periods,
	refreshAuriga,
	refreshing,
	search,
	selectedGrade,
	selectedPeriod,
	selectedSubject,
	selectedSyllabus,
	setAurigaIdentifier,
	setAurigaPassword,
	setMode,
	setSearch,
	setSelectedGrade,
	setSelectedSemester,
	setSelectedSubject,
	setSelectedSyllabus,
	setShowAurigaIdPanel,
	setShowWebLogin,
	showAurigaIdPanel,
	showWebLogin,
	startMicrosoftLogin,
	startWebLogin,
	syncingAuriga,
	updateManualGrades,
	useWeightedAverages,
	aurigaIdentifier,
	aurigaPassword,
}: any) {
	const { theme } = useTheme();
	return (
		<View style={[s.root, { backgroundColor: theme.bg }]}>
			{syncingAuriga ? (
				<Animated.View
					entering={FadeInDown.duration(240)}
					style={[s.syncToast, { top: insets.top + 8, backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.cardShadow }]}>
					<ActivityIndicator color={theme.accent} />
					<Text style={[s.syncToastText, { color: theme.text }]}>Récupération des informations d'Auriga, cela peut prendre un certain temps...</Text>
				</Animated.View>
			) : null}
			<ScrollView
				contentContainerStyle={[s.content, { paddingTop: insets.top + 28, paddingBottom: contentPaddingBottom }]}
				refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshAuriga} tintColor={theme.accent} />}>
				<Animated.View entering={FadeInUp.duration(340)} style={s.headerRow}>
					<View style={s.headerText}>
						<Text style={[s.eyebrow, { color: theme.accent }]}>AURIGA</Text>
						<Text style={[s.title, { color: theme.text }]}>Notes</Text>
						<Text style={[s.lastSync, { color: theme.muted }]}>{lastSyncLabel}</Text>
					</View>
					<Pressable style={[s.iconButton, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={refreshAuriga} disabled={refreshing}>
						{refreshing ? <ActivityIndicator color={theme.accent} /> : <RefreshCw color={theme.accent} size={20} />}
					</Pressable>
				</Animated.View>

				{offline ? (
					<Animated.View entering={FadeInDown.duration(260)} style={[s.offline, { backgroundColor: theme.accentSoft, borderColor: theme.border }]}>
						<WifiOff color={theme.accent} size={17} />
						<Text style={[s.offlineText, { color: theme.text }]}>Données hors ligne. Le cache reste affiché.</Text>
					</Animated.View>
				) : null}
				{selectedPeriod?.hasManualGrades ? (
					<Animated.View entering={FadeInDown.duration(260)} style={[s.manualNotice, { backgroundColor: theme.surface, borderColor: theme.warn }]}>
						<Calculator color={theme.warn} size={18} />
						<Text style={[s.manualNoticeText, { color: theme.text }]}>Cette moyenne inclut des notes ajoutées manuellement.</Text>
					</Animated.View>
				) : null}
				{!connected ? (
					<ConnectCard
						compact
						connecting={connecting}
						identifier={aurigaIdentifier}
						password={aurigaPassword}
						showAurigaIdPanel={showAurigaIdPanel}
						onChangeIdentifier={setAurigaIdentifier}
						onChangePassword={setAurigaPassword}
						onToggleAurigaIdPanel={() => setShowAurigaIdPanel((value: boolean) => !value)}
						onMicrosoft={startMicrosoftLogin}
						onAurigaId={connectWithAurigaId}
					/>
				) : null}
				<Animated.View entering={FadeInDown.delay(40).duration(360)}>
					<Card style={s.averageCard} glow={false} accent>
						<View>
							<Text style={[s.averageLabel, { color: theme.muted }]}>Moyenne générale (estimation)</Text>
							<Text style={[s.averageValue, { color: theme.text }]}>{selectedPeriod ? averageLabel(selectedPeriod.overallAverage) : "-"}</Text>
							<Text style={[s.averageMeta, { color: theme.muted }]}>{useWeightedAverages ? "Moyenne pondérée" : "Moyenne non pondérée"}</Text>
						</View>
						<GraduationCap color={theme.accent} size={34} />
					</Card>
				</Animated.View>
				<View style={[s.segment, { backgroundColor: theme.surfaceSoft }]}>
					{(["notes", "syllabus"] as const).map((item) => {
						const active = mode === item;
						return (
							<Pressable key={item} style={[s.segmentItem, active && { backgroundColor: theme.surface }]} onPress={() => setMode(item)}>
								{item === "notes" ? (
									<GraduationCap color={active ? theme.accent : theme.muted} size={16} />
								) : (
									<BookOpen color={active ? theme.accent : theme.muted} size={16} />
								)}
								<Text style={[s.segmentText, { color: active ? theme.text : theme.muted }]}>{item === "notes" ? "Notes" : "Syllabus"}</Text>
							</Pressable>
						);
					})}
				</View>
				<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.semesters}>
					{periods.map((period: any) => {
						const active = selectedPeriod?.semester === period.semester;
						return (
							<Pressable
								key={period.id}
								style={[s.semesterPill, { backgroundColor: active ? theme.accent : theme.surface, borderColor: active ? theme.accent : theme.border }]}
								onPress={() => setSelectedSemester(period.semester)}>
								<Text style={[s.semesterText, { color: active ? "#fff" : theme.text }]}>{period.name}</Text>
							</Pressable>
						);
					})}
				</ScrollView>
				<View style={[s.searchBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
					<Search color={theme.muted} size={18} />
					<TextInput
						value={search}
						onChangeText={setSearch}
						placeholder={mode === "notes" ? "Rechercher une matière" : "Rechercher un syllabus"}
						placeholderTextColor={theme.muted}
						style={[s.searchInput, { color: theme.text }]}
					/>
					{search ? (
						<Pressable onPress={() => setSearch("")}>
							<X color={theme.muted} size={18} />
						</Pressable>
					) : null}
				</View>

				{mode === "notes" ? (
					<View style={s.list}>
						{noteUes.length ? (
							noteUes.map(({ ue, subjects: ueSubjects }: any, groupIndex: number) => (
								<Animated.View
									key={ue.id}
									entering={FadeInDown.delay(Math.min(groupIndex, 6) * 40).duration(300)}
									style={[s.ueBlock, { backgroundColor: theme.surface, borderColor: ue.hasManualGrades ? theme.warn : theme.border }]}>
									<View style={s.ueHeader}>
										<View style={[s.ueIcon, { backgroundColor: ue.hasManualGrades ? "rgba(245, 158, 11, 0.14)" : theme.accentSoft }]}>
											<GraduationCap color={ue.hasManualGrades ? theme.warn : theme.accent} size={20} />
										</View>
										<View style={s.ueHeaderText}>
											<Text style={[s.ueTitle, { color: theme.text }]} numberOfLines={2}>
												{ue.name}
											</Text>
											<Text style={[s.ueMeta, { color: theme.muted }]}>
												{ueSubjects.length} matière{ueSubjects.length > 1 ? "s" : ""} ·{" "}
												{ue.subjects.reduce((total: number, subject: any) => total + subject.grades.length, 0)} note
												{ue.subjects.reduce((total: number, subject: any) => total + subject.grades.length, 0) > 1 ? "s" : ""}
											</Text>
										</View>
										<View style={[s.ueAverage, { backgroundColor: ue.hasNonValidated ? "rgba(239, 68, 68, 0.13)" : theme.accentSoft }]}>
											<Text style={[s.ueAverageLabel, { color: theme.muted }]}>Moy.</Text>
											<Text style={[s.ueAverageText, { color: ue.hasNonValidated ? theme.danger : theme.accent }]}>{averageLabel(ue.studentAverage)}</Text>
										</View>
									</View>
									<View style={s.ueSubjects}>
										{ueSubjects.map((subject: any, index: number) => (
											<SubjectCard key={subject.id} index={index} ue={ue} subject={subject} onPress={() => setSelectedSubject(subject)} nested />
										))}
									</View>
								</Animated.View>
							))
						) : (
							<EmptyState text="Aucune matière pour ce filtre." />
						)}
					</View>
				) : (
					<View style={s.list}>
						{groupedSyllabus.length ? (
							groupedSyllabus.map(([ue, items]: any) => (
								<View key={ue} style={s.syllabusGroup}>
									<Text style={[s.sectionTitle, { color: theme.text }]}>{ue}</Text>
									{items.map((syllabus: any) => (
										<SyllabusCard key={syllabus.id} syllabus={syllabus} onPress={() => setSelectedSyllabus(syllabus)} />
									))}
								</View>
							))
						) : (
							<EmptyState text="Aucun syllabus pour ce filtre." />
						)}
					</View>
				)}
				{connected ? (
					<Pressable style={[s.disconnectButton, { backgroundColor: "rgba(239, 68, 68, 0.12)", borderColor: theme.danger }]} onPress={disconnectAuriga}>
						<LogOut color={theme.danger} size={18} />
						<Text style={[s.disconnectText, { color: theme.danger }]}>Se déconnecter d'Auriga</Text>
					</Pressable>
				) : null}
			</ScrollView>
			<SubjectDetailModal
				subject={selectedSubject}
				manualGrades={manualGrades}
				onClose={() => setSelectedSubject(null)}
				onOpenGrade={setSelectedGrade}
				onOpenSyllabus={setSelectedSyllabus}
				onAddManual={async (input) => {
					const next = await addManualGrade(input);
					const built = await updateManualGrades(next);
					if (selectedSubject) setSelectedSubject(findSubjectInPeriods(built, selectedSubject.id) || selectedSubject);
				}}
				onDeleteManual={async (id) => {
					const next = await deleteManualGrade(id);
					const built = await updateManualGrades(next);
					setSelectedGrade(null);
					if (selectedSubject) setSelectedSubject(findSubjectInPeriods(built, selectedSubject.id) || selectedSubject);
				}}
			/>
			<GradeDetailModal
				grade={selectedGrade}
				onClose={() => setSelectedGrade(null)}
				onDeleteManual={async (id) => {
					const built = await updateManualGrades(await deleteManualGrade(id));
					if (selectedSubject) setSelectedSubject(findSubjectInPeriods(built, selectedSubject.id) || selectedSubject);
				}}
			/>
			<SyllabusDetailModal visible={Boolean(selectedSyllabus)} syllabus={selectedSyllabus} onClose={() => setSelectedSyllabus(null)} />
			<WebLoginModal
				visible={showWebLogin}
				loginSession={loginSession}
				connecting={connecting}
				onClose={() => setShowWebLogin(false)}
				onNavigation={onWebNavigation}
				onStartFallback={startWebLogin}
			/>
		</View>
	);
}
export function AuthHeader() {
	const { theme } = useTheme();
	return (
		<View style={s.header}>
			<Text style={[s.eyebrow, { color: theme.accent }]}>AURIGA</Text>
			<Text style={[s.title, { color: theme.text }]}>Notes</Text>
		</View>
	);
}

export function ConnectCard({
	compact,
	connecting,
	identifier,
	password,
	showAurigaIdPanel,
	onChangeIdentifier,
	onChangePassword,
	onToggleAurigaIdPanel,
	onMicrosoft,
	onAurigaId,
}: {
	compact?: boolean;
	connecting: boolean;
	identifier: string;
	password: string;
	showAurigaIdPanel: boolean;
	onChangeIdentifier: (value: string) => void;
	onChangePassword: (value: string) => void;
	onToggleAurigaIdPanel: () => void;
	onMicrosoft: () => void;
	onAurigaId: () => void;
}) {
	const { theme } = useTheme();
	return (
		<Card style={[s.connectCard, compact && s.connectCardCompact]} accent={!compact}>
			<View style={[s.connectIcon, { backgroundColor: theme.accentSoft }]}>
				<GraduationCap color={theme.accent} size={compact ? 26 : 34} />
			</View>
			<Text style={[s.connectTitle, compact && s.connectTitleCompact, { color: theme.text }]}>
				{compact ? "Reconnecte Auriga pour synchroniser les données." : "Connecte Auriga pour afficher tes notes, moyennes et syllabus."}
			</Text>
			<Text style={[s.connectText, { color: theme.muted }]}>Choisis Microsoft ou tes identifiants Auriga.</Text>
			<Pressable style={[s.primaryButton, { backgroundColor: theme.accent, opacity: connecting ? 0.7 : 1 }]} disabled={connecting} onPress={onMicrosoft}>
				{connecting ? <ActivityIndicator color="#fff" /> : <LogIn color="#fff" size={19} />}
				<Text style={s.primaryButtonText}>Connexion via Microsoft</Text>
			</Pressable>
			<Pressable style={[s.secondaryButton, { borderColor: theme.border }]} onPress={onToggleAurigaIdPanel}>
				<KeyRound color={theme.accent} size={18} />
				<Text style={[s.secondaryButtonText, { color: theme.text }]}>Connexion via ID Auriga</Text>
				{showAurigaIdPanel ? <ChevronDown color={theme.muted} size={18} /> : <ChevronRight color={theme.muted} size={18} />}
			</Pressable>
			{showAurigaIdPanel ? (
				<Animated.View entering={FadeInDown.duration(220)} style={[s.idLoginPanel, { backgroundColor: theme.bg, borderColor: theme.border }]}>
					<View style={[s.inputBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
						<Mail color={theme.muted} size={18} />
						<TextInput
							value={identifier}
							onChangeText={onChangeIdentifier}
							placeholder="Mail ou login Auriga"
							placeholderTextColor={theme.muted}
							autoCapitalize="none"
							autoCorrect={false}
							keyboardType="email-address"
							style={[s.idInput, { color: theme.text }]}
						/>
					</View>
					<View style={[s.inputBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
						<KeyRound color={theme.muted} size={18} />
						<TextInput
							value={password}
							onChangeText={onChangePassword}
							placeholder="Mot de passe"
							placeholderTextColor={theme.muted}
							secureTextEntry
							autoCapitalize="none"
							autoCorrect={false}
							style={[s.idInput, { color: theme.text }]}
						/>
					</View>
					<Pressable style={[s.idSubmitButton, { backgroundColor: theme.accent, opacity: connecting ? 0.65 : 1 }]} disabled={connecting} onPress={onAurigaId}>
						{connecting ? <ActivityIndicator color="#fff" /> : <KeyRound color="#fff" size={18} />}
						<Text style={s.primaryButtonText}>Se connecter avec ID Auriga</Text>
					</Pressable>
				</Animated.View>
			) : null}
		</Card>
	);
}

export function SubjectCard({ ue, subject, index, onPress, nested }: { ue: DisplayUE; subject: DisplaySubject; index: number; onPress: () => void; nested?: boolean }) {
	const { theme } = useTheme();
	return (
		<Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 35).duration(300)} layout={Layout.springify()}>
			<Pressable
				style={[
					s.subjectCard,
					nested && s.subjectCardNested,
					{ backgroundColor: nested ? theme.bg : theme.surface, borderColor: subject.hasManualGrades ? theme.warn : theme.border },
				]}
				onPress={onPress}>
				<View style={[s.subjectStripe, { backgroundColor: subject.hasNonValidated ? theme.danger : subject.hasManualGrades ? theme.warn : theme.accent }]} />
				<View style={[s.subjectIcon, { backgroundColor: subject.hasManualGrades ? "rgba(245, 158, 11, 0.14)" : theme.accentSoft }]}>
					{subject.hasManualGrades ? <Sigma color={theme.warn} size={19} /> : <BookMarked color={theme.accent} size={19} />}
				</View>
				<View style={s.subjectBody}>
					<View style={s.subjectHeader}>
						<Text style={[s.subjectName, { color: theme.text }]} numberOfLines={2}>
							{subject.name}
						</Text>
						<View style={[s.subjectAverage, { backgroundColor: subject.hasNonValidated ? "rgba(239, 68, 68, 0.13)" : theme.accentSoft }]}>
							<Text style={[s.subjectAverageText, { color: subject.hasNonValidated ? theme.danger : theme.accent }]}>{averageLabel(subject.studentAverage)}</Text>
						</View>
					</View>
					<View style={s.subjectMetaRow}>
						<ClipboardList color={theme.muted} size={14} />
						<Text style={[s.subjectMeta, { color: theme.muted }]} numberOfLines={1}>
							{subject.grades.length} note{subject.grades.length > 1 ? "s" : ""}
						</Text>
						{subject.hasManualGrades ? <Text style={[s.manualBadge, { color: theme.warn, borderColor: theme.warn }]}>manuel</Text> : null}
					</View>
				</View>
				<ChevronRight color={theme.muted} size={19} />
			</Pressable>
		</Animated.View>
	);
}

export function SubjectDetailModal({
	subject,
	manualGrades,
	onClose,
	onOpenGrade,
	onOpenSyllabus,
	onAddManual,
	onDeleteManual,
}: {
	subject: DisplaySubject | null;
	manualGrades: ManualGrade[];
	onClose: () => void;
	onOpenGrade: (grade: DisplayGrade) => void;
	onOpenSyllabus: (syllabus: AurigaSyllabus) => void;
	onAddManual: (grade: Omit<ManualGrade, "id" | "createdAt">) => Promise<void>;
	onDeleteManual: (id: string) => Promise<void>;
}) {
	const { theme } = useTheme();
	const insets = useSafeAreaInsets();
	const [showAdd, setShowAdd] = useState(false);
	const [manualScore, setManualScore] = useState("");
	const [selectedExamId, setSelectedExamId] = useState<number | undefined>(undefined);
	const exams = subject?.syllabus?.exams || [];

	useEffect(() => {
		setShowAdd(false);
		setManualScore("");
		setSelectedExamId(undefined);
	}, [subject?.id]);

	const selectedExam = exams.find((exam) => exam.id === selectedExamId) || exams[0];
	const noteCount = subject?.grades.length || 0;
	const subjectCoeff = subject?.syllabusCoeff || 1;
	const averageStatus = subject?.hasNonValidated ? "À valider" : subject?.studentAverage ? "Validé" : "En attente";
	const saveManual = async () => {
		if (!subject) return;
		const grade = Number(manualScore.replace(",", "."));
		if (!Number.isFinite(grade) || grade < 0 || grade > 20) {
			Alert.alert("Note invalide", "Entre une note entre 0 et 20.");
			return;
		}
		const subjectCode = subject.id.replace(/^\d+-/, "");
		await onAddManual({
			subjectId: subject.id,
			subjectCode,
			syllabusId: subject.syllabus?.id,
			examId: selectedExam?.id,
			examType: selectedExam?.type,
			examIndex: selectedExam?.index,
			description: selectedExam ? `${selectedExam.typeName || selectedExam.type} - note manuelle` : "Note manuelle",
			grade,
			coefficient: selectedExam?.weighting ? selectedExam.weighting / 100 : 1,
		});
		setManualScore("");
		setShowAdd(false);
	};

	return (
		<Modal visible={Boolean(subject)} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
			<View style={[s.panelRoot, { backgroundColor: theme.bg, paddingTop: insets.top + 12 }]}>
				<PanelHeader title={subject?.name || "Matière"} eyebrow={subject?.ueCode || "Notes"} onClose={onClose} />
				<ScrollView contentContainerStyle={[s.panelContent, { paddingBottom: insets.bottom + 38 }]}>
					<View style={[s.subjectHero, { backgroundColor: theme.surface, borderColor: subject?.hasManualGrades ? theme.warn : theme.border }]}>
						<View style={s.subjectHeroTop}>
							<View style={[s.heroIcon, { backgroundColor: subject?.hasManualGrades ? "rgba(245, 158, 11, 0.14)" : theme.accentSoft }]}>
								<Award color={subject?.hasManualGrades ? theme.warn : theme.accent} size={25} />
							</View>
							<View style={s.heroCopy}>
								<Text style={[s.heroLabel, { color: theme.muted }]}>Moyenne matière</Text>
								<Text style={[s.heroAverage, { color: theme.text }]}>{averageLabel(subject?.studentAverage)}</Text>
							</View>
						</View>
						<View style={s.heroStats}>
							<View style={[s.heroStat, { backgroundColor: theme.bg, borderColor: theme.border }]}>
								<ClipboardList color={theme.accent} size={17} />
								<Text style={[s.heroStatValue, { color: theme.text }]}>{noteCount}</Text>
								<Text style={[s.heroStatLabel, { color: theme.muted }]}>notes</Text>
							</View>
							<View style={[s.heroStat, { backgroundColor: theme.bg, borderColor: theme.border }]}>
								<Percent color={theme.accent} size={17} />
								<Text style={[s.heroStatValue, { color: theme.text }]}>{subjectCoeff}</Text>
								<Text style={[s.heroStatLabel, { color: theme.muted }]}>coeff</Text>
							</View>
							{subject?.hasNonValidated && (
								<View style={[s.heroStat, { backgroundColor: theme.bg, borderColor: theme.border }]}>
									<Target color={theme.danger} size={17} />
									<Text style={[s.heroStatValue, { color: theme.danger }]}>{averageStatus}</Text>
									<Text style={[s.heroStatLabel, { color: theme.muted }]}>statut</Text>
								</View>
							)}
						</View>
						{subject?.hasManualGrades ? (
							<View style={[s.heroWarningPill, { backgroundColor: "rgba(245, 158, 11, 0.13)", borderColor: theme.warn }]}>
								<ChartNoAxesCombined color={theme.warn} size={16} />
								<Text style={[s.heroWarningText, { color: theme.warn }]}>Des notes manuelles influencent cette moyenne.</Text>
							</View>
						) : null}
					</View>
					<View style={s.panelActions}>
						<Pressable style={[s.actionButton, { backgroundColor: theme.accent }]} onPress={() => setShowAdd((value) => !value)}>
							<BadgePlus color="#fff" size={18} />
							<Text style={s.actionButtonText}>Ajouter une note</Text>
						</Pressable>
						{subject?.syllabus ? (
							<Pressable style={[s.outlineAction, { borderColor: theme.border, backgroundColor: theme.surface }]} onPress={() => onOpenSyllabus(subject.syllabus!)}>
								<BookOpen color={theme.accent} size={18} />
								<Text style={[s.outlineActionText, { color: theme.text }]}>Syllabus</Text>
							</Pressable>
						) : null}
					</View>
					{showAdd ? (
						<Animated.View entering={FadeInDown.duration(220)} style={[s.addPanel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
							<Text style={[s.panelSectionTitle, { color: theme.text }]}>Assigner à un examen</Text>
							<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.examChips}>
								{(exams.length ? exams : [{ id: -1, index: 1, type: "MANUAL", typeName: "Note libre" }]).map((exam) => {
									const active = (selectedExamId || exams[0]?.id || -1) === exam.id;
									return (
										<Pressable
											key={exam.id}
											style={[s.examChip, { backgroundColor: active ? theme.accent : theme.bg, borderColor: active ? theme.accent : theme.border }]}
											onPress={() => setSelectedExamId(exam.id)}>
											<Text style={[s.examChipText, { color: active ? "#fff" : theme.text }]}>{exam.typeName || exam.type}</Text>
										</Pressable>
									);
								})}
							</ScrollView>
							<View style={[s.inputBox, { backgroundColor: theme.bg, borderColor: theme.border }]}>
								<Calculator color={theme.muted} size={18} />
								<TextInput
									value={manualScore}
									onChangeText={setManualScore}
									placeholder="Note sur 20"
									placeholderTextColor={theme.muted}
									keyboardType="decimal-pad"
									style={[s.idInput, { color: theme.text }]}
								/>
							</View>
							<Pressable style={[s.idSubmitButton, { backgroundColor: theme.accent }]} onPress={saveManual}>
								<Text style={s.primaryButtonText}>Ajouter à la moyenne</Text>
							</Pressable>
						</Animated.View>
					) : null}
					<View style={s.sectionHeadRow}>
						<View style={[s.sectionIcon, { backgroundColor: theme.accentSoft }]}>
							<ClipboardList color={theme.accent} size={17} />
						</View>
						<Text style={[s.panelSectionTitle, { color: theme.text }]}>Carnet de notes</Text>
					</View>
					<View style={s.gradeList}>
						{subject?.grades.map((grade) => (
							<Pressable
								key={grade.id}
								style={[
									s.gradeRow,
									{ backgroundColor: grade.isManual ? "rgba(245, 158, 11, 0.13)" : theme.surface, borderColor: grade.isManual ? theme.warn : theme.border },
								]}
								onPress={() => onOpenGrade(grade)}>
								<View style={[s.gradeIcon, { backgroundColor: grade.isManual ? "rgba(245, 158, 11, 0.16)" : theme.accentSoft }]}>
									{grade.isManual ? <BadgePlus color={theme.warn} size={17} /> : <Hash color={theme.accent} size={17} />}
								</View>
								<View style={s.gradeBody}>
									<Text style={[s.gradeTitle, { color: theme.text }]} numberOfLines={2}>
										{grade.description}
									</Text>
									<View style={s.gradeMetaLine}>
										<Percent color={theme.muted} size={12} />
										<Text style={[s.gradeMeta, { color: theme.muted }]}>
											coeff {grade.coefficient.toFixed(grade.coefficient % 1 ? 2 : 0)}
											{grade.isManual ? " · note manuelle" : ""}
										</Text>
									</View>
								</View>
								<Text style={[s.gradeScore, { color: grade.isManual ? theme.warn : theme.accent }]}>{scoreLabel(grade.studentScore)}</Text>
								<ChevronRight color={theme.muted} size={18} />
							</Pressable>
						))}
					</View>
				</ScrollView>
			</View>
		</Modal>
	);
}

export function GradeDetailModal({ grade, onClose, onDeleteManual }: { grade: DisplayGrade | null; onClose: () => void; onDeleteManual: (id: string) => Promise<void> }) {
	const { theme } = useTheme();
	const insets = useSafeAreaInsets();
	return (
		<Modal visible={Boolean(grade)} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
			<View style={[s.panelRoot, { backgroundColor: theme.bg, paddingTop: insets.top + 12 }]}>
				<PanelHeader title={grade?.description || "Note"} eyebrow={grade?.isManual ? "Note manuelle" : "Auriga"} onClose={onClose} />
				<View style={[s.panelContent, { paddingBottom: insets.bottom + 32 }]}>
					<View style={[s.heroPanel, { backgroundColor: theme.surface, borderColor: grade?.isManual ? theme.warn : theme.border }]}>
						<Text style={[s.heroAverage, { color: grade?.isManual ? theme.warn : theme.text }]}>{scoreLabel(grade?.studentScore)}</Text>
						<Text style={[s.heroMeta, { color: theme.muted }]}>{grade?.subjectName}</Text>
					</View>
					<InfoLine label="Coefficient" value={grade ? String(grade.coefficient) : "-"} />
					<InfoLine label="Code brut" value={grade?.rawCode || "-"} />
					{grade?.isManual && grade.manualId ? (
						<Pressable
							style={[s.deleteButton, { backgroundColor: "rgba(239, 68, 68, 0.14)", borderColor: theme.danger }]}
							onPress={() =>
								Alert.alert("Supprimer la note", "Retirer cette note manuelle de la moyenne ?", [
									{ text: "Annuler", style: "cancel" },
									{
										text: "Supprimer",
										style: "destructive",
										onPress: () =>
											void onDeleteManual(grade.manualId!).then(() => {
												onClose();
											}),
									},
								])
							}>
							<Trash2 color={theme.danger} size={18} />
							<Text style={[s.deleteButtonText, { color: theme.danger }]}>Supprimer la note manuelle</Text>
						</Pressable>
					) : null}
				</View>
			</View>
		</Modal>
	);
}

export function InfoLine({ label, value }: { label: string; value: string }) {
	const { theme } = useTheme();
	return (
		<View style={[s.infoLine, { backgroundColor: theme.surface, borderColor: theme.border }]}>
			<Text style={[s.infoLabel, { color: theme.muted }]}>{label}</Text>
			<Text style={[s.infoValue, { color: theme.text }]}>{value}</Text>
		</View>
	);
}

export function PanelHeader({ title, eyebrow, onClose }: { title: string; eyebrow: string; onClose: () => void }) {
	const { theme } = useTheme();
	return (
		<View style={[s.panelHeader, { borderBottomColor: theme.border }]}>
			<View style={s.headerText}>
				<Text style={[s.eyebrow, { color: theme.accent }]}>{eyebrow}</Text>
				<Text style={[s.panelTitle, { color: theme.text }]} numberOfLines={2}>
					{title}
				</Text>
			</View>
			<Pressable style={[s.iconButton, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={onClose}>
				<X color={theme.text} size={20} />
			</Pressable>
		</View>
	);
}

export function EmptyState({ text }: { text: string }) {
	const { theme } = useTheme();
	return (
		<View style={[s.empty, { backgroundColor: theme.surface, borderColor: theme.border }]}>
			<Text style={[s.emptyText, { color: theme.muted }]}>{text}</Text>
		</View>
	);
}

export function WebLoginModal({
	visible,
	loginSession,
	connecting,
	onClose,
	onNavigation,
	onStartFallback,
}: {
	visible: boolean;
	loginSession: AurigaLoginSession | null;
	connecting: boolean;
	onClose: () => void;
	onNavigation: (nav: WebViewNavigation) => void;
	onStartFallback: () => void;
}) {
	const { theme } = useTheme();
	const insets = useSafeAreaInsets();
	return (
		<Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
			<View style={[s.webRoot, { backgroundColor: theme.bg, paddingTop: insets.top }]}>
				<View style={[s.webHeader, { borderBottomColor: theme.border }]}>
					<Text style={[s.webTitle, { color: theme.text }]}>Connexion Auriga</Text>
					<Pressable style={[s.iconButton, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={onClose}>
						<X color={theme.text} size={20} />
					</Pressable>
				</View>
				{loginSession ? (
					<WebView
						source={{ uri: loginSession.authUrl }}
						onNavigationStateChange={onNavigation}
						startInLoadingState
						renderLoading={() => (
							<View style={[s.webLoading, { backgroundColor: theme.bg }]}>
								<ActivityIndicator color={theme.accent} size="large" />
							</View>
						)}
					/>
				) : (
					<View style={s.webFallback}>
						<Pressable style={[s.primaryButton, { backgroundColor: theme.accent, opacity: connecting ? 0.7 : 1 }]} onPress={onStartFallback} disabled={connecting}>
							{connecting ? <ActivityIndicator color="#fff" /> : <LogIn color="#fff" size={19} />}
							<Text style={s.primaryButtonText}>Relancer la connexion</Text>
						</Pressable>
					</View>
				)}
			</View>
		</Modal>
	);
}

export const s = StyleSheet.create({
	root: { flex: 1 },
	loading: { flex: 1, alignItems: "center", justifyContent: "center" },
	content: { paddingHorizontal: 18 },
	syncToast: {
		position: "absolute",
		left: 18,
		right: 18,
		zIndex: 20,
		borderWidth: 1,
		borderRadius: 16,
		paddingHorizontal: 13,
		paddingVertical: 12,
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		shadowOpacity: 0.14,
		shadowRadius: 18,
		shadowOffset: { width: 0, height: 10 },
		elevation: 8,
	},
	syncToastText: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: "900" },
	header: { marginBottom: 22 },
	headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16 },
	headerText: { flex: 1, minWidth: 0 },
	eyebrow: { fontSize: 12, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0 },
	title: { fontSize: 30, fontWeight: "900", letterSpacing: 0, marginTop: 3 },
	lastSync: { marginTop: 5, fontSize: 12, fontWeight: "800" },
	iconButton: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
	connectCard: { gap: 16, alignItems: "flex-start" },
	connectCardCompact: { marginBottom: 14 },
	connectIcon: { width: 64, height: 64, borderRadius: 18, alignItems: "center", justifyContent: "center" },
	connectTitle: { fontSize: 22, fontWeight: "900", lineHeight: 28 },
	connectTitleCompact: { fontSize: 18, lineHeight: 23 },
	connectText: { fontSize: 14, fontWeight: "700", lineHeight: 20 },
	idLoginPanel: { alignSelf: "stretch", borderWidth: 1, borderRadius: 16, padding: 12, gap: 10 },
	inputBox: { minHeight: 50, borderRadius: 14, borderWidth: 1, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 9 },
	idInput: { flex: 1, fontSize: 15, fontWeight: "800", paddingVertical: 0 },
	primaryButton: { minHeight: 52, borderRadius: 14, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, alignSelf: "stretch" },
	primaryButtonText: { color: "#fff", fontSize: 15, fontWeight: "900" },
	secondaryButton: {
		minHeight: 48,
		borderRadius: 14,
		borderWidth: 1,
		paddingHorizontal: 14,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 9,
		alignSelf: "stretch",
	},
	secondaryButtonText: { flex: 1, fontSize: 15, fontWeight: "900" },
	idSubmitButton: { minHeight: 48, borderRadius: 14, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 },
	offline: { borderWidth: 1, borderRadius: 8, padding: 11, flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
	offlineText: { flex: 1, fontSize: 12, fontWeight: "800", lineHeight: 17 },
	manualNotice: { borderWidth: 1, borderRadius: 12, padding: 12, flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 12 },
	manualNoticeText: { flex: 1, fontSize: 13, fontWeight: "800", lineHeight: 18 },
	averageCard: { minHeight: 124, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
	averageLabel: { fontSize: 12, fontWeight: "900", textTransform: "uppercase" },
	averageValue: { marginTop: 5, fontSize: 32, fontWeight: "900", letterSpacing: 0 },
	averageMeta: { marginTop: 4, fontSize: 12, fontWeight: "800" },
	segment: { flexDirection: "row", padding: 4, borderRadius: 8, marginBottom: 12 },
	segmentItem: { flex: 1, minHeight: 40, borderRadius: 6, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
	segmentText: { fontSize: 13, fontWeight: "900" },
	semesters: { gap: 8, paddingBottom: 12 },
	semesterPill: { minHeight: 38, borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, alignItems: "center", justifyContent: "center" },
	semesterText: { fontSize: 13, fontWeight: "900" },
	searchBox: { minHeight: 48, borderRadius: 14, borderWidth: 1, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 14 },
	searchInput: { flex: 1, fontSize: 15, fontWeight: "800", paddingVertical: 0 },
	list: { gap: 12 },
	ueBlock: { borderWidth: 1, borderRadius: 24, padding: 12, gap: 12 },
	ueHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
	ueIcon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
	ueHeaderText: { flex: 1, minWidth: 0 },
	ueTitle: { fontSize: 16, lineHeight: 21, fontWeight: "900" },
	ueMeta: { marginTop: 4, fontSize: 12, fontWeight: "800" },
	ueAverage: { minWidth: 68, minHeight: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
	ueAverageLabel: { fontSize: 9, fontWeight: "900", textTransform: "uppercase" },
	ueAverageText: { marginTop: 1, fontSize: 15, fontWeight: "900" },
	ueSubjects: { gap: 9 },
	subjectCard: { minHeight: 92, borderWidth: 1, borderRadius: 20, overflow: "hidden", flexDirection: "row", alignItems: "center", gap: 10, paddingRight: 12 },
	subjectCardNested: { minHeight: 82, borderRadius: 18 },
	subjectStripe: { width: 7, alignSelf: "stretch" },
	subjectIcon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
	subjectBody: { flex: 1, minWidth: 0, paddingVertical: 12 },
	subjectHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
	subjectName: { flex: 1, fontSize: 15, fontWeight: "900", lineHeight: 20 },
	subjectAverage: { minWidth: 58, minHeight: 36, borderRadius: 8, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
	subjectAverageText: { fontSize: 14, fontWeight: "900" },
	subjectMetaRow: { marginTop: 8, flexDirection: "row", alignItems: "center", gap: 8 },
	subjectMeta: { flex: 1, fontSize: 12, fontWeight: "800" },
	manualBadge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, fontSize: 10, fontWeight: "900", textTransform: "uppercase" },
	syllabusGroup: { gap: 10 },
	sectionTitle: { fontSize: 18, fontWeight: "900", marginTop: 4 },
	empty: { borderWidth: 1, borderRadius: 18, padding: 16, alignItems: "center" },
	emptyText: { fontSize: 14, fontWeight: "800" },
	panelRoot: { flex: 1 },
	panelHeader: { paddingHorizontal: 18, paddingBottom: 12, borderBottomWidth: 1, flexDirection: "row", alignItems: "center", gap: 12 },
	panelTitle: { marginTop: 3, fontSize: 20, fontWeight: "900", lineHeight: 25 },
	panelContent: { padding: 18, gap: 14 },
	heroPanel: { borderWidth: 1, borderRadius: 22, padding: 18 },
	subjectHero: { borderWidth: 1, borderRadius: 24, padding: 15, gap: 14 },
	subjectHeroTop: { flexDirection: "row", alignItems: "center", gap: 12 },
	heroIcon: { width: 54, height: 54, borderRadius: 17, alignItems: "center", justifyContent: "center" },
	heroCopy: { flex: 1, minWidth: 0 },
	heroLabel: { fontSize: 11, fontWeight: "900", textTransform: "uppercase" },
	heroAverage: { fontSize: 34, fontWeight: "900", letterSpacing: 0 },
	heroMeta: { marginTop: 4, fontSize: 13, fontWeight: "800" },
	heroWarning: { marginTop: 10, fontSize: 13, fontWeight: "900" },
	heroStats: { flexDirection: "row", gap: 8 },
	heroStat: { flex: 1, minHeight: 72, borderRadius: 16, borderWidth: 1, padding: 9, justifyContent: "space-between" },
	heroStatValue: { marginTop: 5, fontSize: 15, fontWeight: "900" },
	heroStatLabel: { fontSize: 10, fontWeight: "900", textTransform: "uppercase" },
	heroWarningPill: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 11, paddingVertical: 9, flexDirection: "row", alignItems: "center", gap: 8 },
	heroWarningText: { flex: 1, fontSize: 12, fontWeight: "900", lineHeight: 17 },
	panelActions: { flexDirection: "row", gap: 10 },
	actionButton: { flex: 1, minHeight: 48, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
	actionButtonText: { color: "#fff", fontWeight: "900" },
	outlineAction: { minWidth: 116, minHeight: 48, borderRadius: 14, borderWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
	outlineActionText: { fontWeight: "900" },
	addPanel: { borderWidth: 1, borderRadius: 18, padding: 14, gap: 12 },
	sectionHeadRow: { flexDirection: "row", alignItems: "center", gap: 9 },
	sectionIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
	panelSectionTitle: { fontSize: 16, fontWeight: "900" },
	examChips: { gap: 8 },
	examChip: { minHeight: 36, borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, alignItems: "center", justifyContent: "center" },
	examChipText: { fontSize: 12, fontWeight: "900" },
	gradeList: { gap: 10 },
	gradeRow: { borderWidth: 1, borderRadius: 16, padding: 12, flexDirection: "row", alignItems: "center", gap: 10 },
	gradeIcon: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
	gradeBody: { flex: 1, minWidth: 0 },
	gradeTitle: { fontSize: 15, fontWeight: "900", lineHeight: 20 },
	gradeMetaLine: { marginTop: 4, flexDirection: "row", alignItems: "center", gap: 4 },
	gradeMeta: { flex: 1, fontSize: 12, fontWeight: "800" },
	gradeScore: { fontSize: 17, fontWeight: "900" },
	infoLine: { borderWidth: 1, borderRadius: 16, padding: 14 },
	infoLabel: { fontSize: 11, fontWeight: "900", textTransform: "uppercase" },
	infoValue: { marginTop: 5, fontSize: 15, fontWeight: "800" },
	deleteButton: { minHeight: 50, borderRadius: 14, borderWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 },
	deleteButtonText: { fontWeight: "900" },
	webRoot: { flex: 1 },
	webHeader: { minHeight: 62, borderBottomWidth: 1, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
	webTitle: { fontSize: 18, fontWeight: "900" },
	webLoading: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center" },
	webFallback: { flex: 1, padding: 18, justifyContent: "center" },
	disconnectButton: { minHeight: 50, borderRadius: 14, borderWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, marginTop: 18 },
	disconnectText: { fontSize: 14, fontWeight: "900" },
});
