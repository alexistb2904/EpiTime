import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, type TextInputInstance, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn } from "react-native-reanimated";
import {
	BadgePlus,
	BookOpen,
	Calculator,
	Check,
	ChevronRight,
	FileDown,
	Hash,
	KeyRound,
	Link2,
	LogOut,
	Mail,
	Percent,
	RefreshCw,
	Search,
	Trash2,
	WifiOff,
	X,
} from "lucide-react-native";
import CoefficientEditorModal from "./CoefficientEditorModal";
import SyllabusCard from "./SyllabusCard";
import SyllabusDetailModal from "./SyllabusDetailModal";
import SyllabusExportModal from "./SyllabusExportModal";
import { s as cs } from "../calendar/calendarStyles";
import { Row, Section, destructiveColor } from "../settings/SettingsList";
import { useTheme } from "../../context/ThemeContext";
import { mixHex, type AppTheme } from "../../theme/palettes";
import { type ManualGrade } from "../../services/manualGrades";
import type { AurigaSyllabus } from "../../services/aurigaTypes";
import { getSubjectCoefficientOverride, type SubjectCoefficientOverrides, type SubjectCoefficientReference } from "../../services/gradeCoefficientOverrides";
import { UE_NAMES, type DisplayGrade, type DisplaySubject } from "../../services/gradesService";
import { hexToRgba, readableTextOn } from "../../utils/calendar";

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

const plural = (count: number, word: string) => `${count} ${word}${count > 1 ? "s" : ""}`;
const formatCoeff = (value: number) => String(Number(value.toFixed(2))).replace(".", ",");

const UE_PALETTE = ["#0ea5e9", "#ec4899", "#14b8a6", "#8b5cf6", "#22c55e", "#06b6d4"];
const inkOf = (theme: AppTheme, color: string) => (theme.mode === "dark" ? color : mixHex(color, "#000000", 0.35));

const scoreTone = (theme: AppTheme, item?: { hasNonValidated?: boolean; hasManualGrades?: boolean } | null) =>
	item?.hasNonValidated ? destructiveColor(theme) : item?.hasManualGrades ? theme.warn : theme.text;

export function GradesContent({
	addManualGrade,
	buttonRefreshing,
	connectWithAurigaId,
	connected,
	connecting,
	contentPaddingBottom,
	deleteManualGrade,
	disconnectAuriga,
	exportEndSemester,
	exportModalVisible,
	exportStartSemester,
	exportSemesters,
	exportingSyllabus,
	findSubjectInPeriods,
	groupedSyllabus,
	insets,
	lastSyncLabel,
	manualGrades,
	mode,
	noteUes,
	offline,
	onExportSyllabus,
	onCloseSyllabusExport,
	onChangeSyllabusExportEndSemester,
	onChangeSyllabusExportStartSemester,
	onOpenSyllabusExport,
	onUpdateSubjectCoefficient,
	onUpdateGradeOverride,
	periods,
	refreshAuriga,
	refreshing,
	rememberAurigaCredentials,
	search,
	selectedGrade,
	selectedPeriod,
	selectedSubject,
	selectedSyllabus,
	setAurigaIdentifier,
	setAurigaPassword,
	setRememberAurigaCredentials,
	setMode,
	setSearch,
	setSelectedGrade,
	setSelectedSemester,
	setSelectedSubject,
	setSelectedSyllabus,
	status,
	subjectCoefficientOverrides,
	syncingAuriga,
	updateManualGrades,
	useWeightedAverages,
	aurigaIdentifier,
	aurigaPassword,
}: any) {
	const { theme } = useTheme();
	const danger = destructiveColor(theme);
	const ueCodes = Array.from(new Set<string>([...(selectedPeriod?.ues || []).map((ue: any) => ue.id), ...groupedSyllabus.map(([ue]: any) => ue)])).sort();
	const ueColor = (code?: string) => UE_PALETTE[Math.max(ueCodes.indexOf(code || ""), 0) % UE_PALETTE.length];
	const [coefficientEditor, setCoefficientEditor] = useState<{
		title: string;
		reference: SubjectCoefficientReference;
		value: number;
		overridden: boolean;
	} | null>(null);
	const [gradeCoefficientEditor, setGradeCoefficientEditor] = useState<DisplayGrade | null>(null);
	const syllabusCoefficient = (syllabus: AurigaSyllabus) =>
		getSubjectCoefficientOverride({ syllabusId: syllabus.id }, subjectCoefficientOverrides as SubjectCoefficientOverrides) ?? syllabus.coeff ?? 1;
	const openSubjectCoefficientEditor = (subject: DisplaySubject) => {
		setCoefficientEditor({
			title: subject.name,
			reference: { syllabusId: subject.syllabus?.id, subjectId: subject.id },
			value: subject.syllabusCoeff ?? 1,
			overridden: Boolean(subject.coefficientOverridden),
		});
	};
	const openSyllabusCoefficientEditor = (syllabus: AurigaSyllabus) => {
		const override = getSubjectCoefficientOverride({ syllabusId: syllabus.id }, subjectCoefficientOverrides as SubjectCoefficientOverrides);
		setCoefficientEditor({
			title: syllabus.caption?.name || syllabus.name,
			reference: { syllabusId: syllabus.id },
			value: override ?? syllabus.coeff ?? 1,
			overridden: override !== undefined,
		});
	};
	return (
		<View style={[s.root, { backgroundColor: theme.bg }]}>
			<ScrollView
				keyboardShouldPersistTaps="handled"
				contentContainerStyle={[s.content, { paddingTop: insets.top + 12, paddingBottom: contentPaddingBottom }]}
				refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => refreshAuriga("pull")} tintColor={theme.accent} colors={[theme.accent]} />}>
				<View style={[cs.header, s.headerGap]}>
					<View style={s.headerText}>
						<Text accessibilityRole="header" style={[cs.monthText, { color: theme.text }]}>
							Notes
						</Text>
						<Text style={[s.headerSub, { color: theme.muted }]} numberOfLines={1}>
							{lastSyncLabel}
						</Text>
					</View>
					<Pressable
						style={({ pressed }) => [cs.toolBtn, { backgroundColor: pressed ? theme.surfaceSoft : "transparent" }]}
						onPress={() => refreshAuriga("button")}
						disabled={refreshing || buttonRefreshing || syncingAuriga}
						accessibilityRole="button"
						accessibilityLabel={`${lastSyncLabel}. Actualiser`}>
						{buttonRefreshing ? (
							<ActivityIndicator color={theme.accent} />
						) : offline ? (
							<WifiOff color={theme.warn} size={20} />
						) : (
							<RefreshCw color={theme.text} size={20} />
						)}
					</Pressable>
				</View>

				{status && connected ? <AurigaStatusBanner status={status} /> : null}
				{offline ? <Notice icon={<WifiOff color={theme.muted} size={17} />} text="Hors ligne : notes enregistrées affichées." /> : null}
				{!connected ? (
					<ConnectCard
						compact
						connecting={connecting}
						identifier={aurigaIdentifier}
						password={aurigaPassword}
						rememberCredentials={rememberAurigaCredentials}
						status={status}
						syncing={syncingAuriga}
						onChangeIdentifier={setAurigaIdentifier}
						onChangePassword={setAurigaPassword}
						onChangeRememberCredentials={setRememberAurigaCredentials}
						onAurigaId={connectWithAurigaId}
					/>
				) : null}

				<View style={[cs.segment, s.segment, { backgroundColor: theme.surfaceSoft, borderColor: theme.border }]} accessibilityRole="tablist">
					{(
						[
							["notes", "Notes"],
							["syllabus", "Syllabus"],
						] as const
					).map(([item, label]) => {
						const active = mode === item;
						return (
							<Pressable
								key={item}
								style={[cs.segmentItem, active && { backgroundColor: theme.accentSoft }]}
								onPress={() => setMode(item)}
								accessibilityRole="tab"
								accessibilityState={{ selected: active }}>
								<Text style={[cs.segmentText, { color: active ? theme.accent : theme.muted }]}>{label}</Text>
							</Pressable>
						);
					})}
				</View>

				{periods.length ? (
					<ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipsScroll} contentContainerStyle={s.chips}>
						{periods.map((period: any) => {
							const active = selectedPeriod?.semester === period.semester;
							return (
								<Pressable
									key={period.id}
									hitSlop={6}
									style={[cs.chipBtn, s.chip, active ? { backgroundColor: theme.accentSoft, borderColor: "transparent" } : { borderColor: theme.border }]}
									onPress={() => setSelectedSemester(period.semester)}
									accessibilityRole="button"
									accessibilityState={{ selected: active }}>
									<Text style={[cs.chipText, s.chipText, { color: active ? theme.accent : theme.text }]}>{period.name}</Text>
								</Pressable>
							);
						})}
					</ScrollView>
				) : null}

				{mode === "notes" ? (
					<>
						<View
							style={s.summary}
							accessible
							accessibilityLabel={`Moyenne générale estimée : ${selectedPeriod ? averageLabel(selectedPeriod.overallAverage) : "aucune"}`}>
							<Text style={[s.summaryValue, { color: theme.accent }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
								{selectedPeriod ? averageLabel(selectedPeriod.overallAverage) : "-"}
							</Text>
							<View style={s.summaryText}>
								<Text style={[s.summaryTitle, { color: theme.text }]}>Moyenne générale</Text>
								<Text style={[s.summaryMeta, { color: theme.muted }]}>{useWeightedAverages ? "Estimation pondérée" : "Estimation non pondérée"}</Text>
							</View>
						</View>
						{selectedPeriod?.hasManualGrades ? (
							<Notice tone={theme.warn} icon={<Calculator color={theme.warn} size={17} />} text="Cette moyenne inclut des notes ajoutées manuellement." />
						) : null}
						{useWeightedAverages ? (
							<Notice icon={<Percent color={theme.muted} size={17} />} text="Les coefficients viennent d’Auriga et peuvent différer de ceux de l’administration." />
						) : null}
					</>
				) : null}

				<View style={[s.searchBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
					<Search color={theme.muted} size={18} />
					<TextInput
						value={search}
						onChangeText={setSearch}
						placeholder={mode === "notes" ? "Rechercher une matière" : "Rechercher un syllabus"}
						placeholderTextColor={theme.muted}
						autoCorrect={false}
						returnKeyType="search"
						accessibilityLabel={mode === "notes" ? "Rechercher une matière" : "Rechercher un syllabus"}
						style={[s.searchInput, { color: theme.text }]}
					/>
					{search ? (
						<Pressable onPress={() => setSearch("")} hitSlop={12} accessibilityRole="button" accessibilityLabel="Effacer la recherche">
							<X color={theme.muted} size={18} />
						</Pressable>
					) : null}
				</View>

				{mode === "syllabus" ? (
					<Pressable
						style={({ pressed }) => [
							s.secondaryBtn,
							s.exportBtn,
							{
								borderColor: theme.border,
								backgroundColor: pressed ? theme.surfaceSoft : theme.surface,
								opacity: exportingSyllabus || !exportSemesters.length ? 0.6 : 1,
							},
						]}
						disabled={exportingSyllabus || !exportSemesters.length}
						onPress={onOpenSyllabusExport}
						accessibilityRole="button">
						{exportingSyllabus ? <ActivityIndicator color={theme.accent} size="small" /> : <FileDown color={theme.accent} size={18} />}
						<Text style={[s.secondaryBtnText, { color: theme.text }]}>{exportingSyllabus ? "Création du PDF..." : "Exporter le syllabus"}</Text>
					</Pressable>
				) : null}

				<Animated.View key={`${mode}-${selectedPeriod?.id ?? "none"}`} entering={FadeIn.duration(220)}>
					{mode === "notes" ? (
						noteUes.length ? (
							noteUes.map(({ ue, subjects: ueSubjects }: any) => {
								const gradeCount = ue.subjects.reduce((total: number, subject: any) => total + subject.grades.length, 0);
								const ueAverage = averageLabel(ue.studentAverage);
								return (
									<UeSection
										key={ue.id}
										code={ue.id}
										color={ueColor(ue.id)}
										title={ue.name}
										meta={`${plural(ueSubjects.length, "matière")} · ${plural(gradeCount, "note")}`}
										average={ueAverage}
										averageColor={ue.hasNonValidated || ue.hasManualGrades ? scoreTone(theme, ue) : undefined}>
										{ueSubjects.map((subject: any) => (
											<SubjectCard key={subject.id} subject={subject} onPress={() => setSelectedSubject(subject)} />
										))}
									</UeSection>
								);
							})
						) : (
							<EmptyState text="Aucune matière pour ce filtre." />
						)
					) : groupedSyllabus.length ? (
						groupedSyllabus.map(([ue, items]: any) => (
							<UeSection key={ue} code={ue} color={ueColor(ue)} title={UE_NAMES[ue] || ue} meta={plural(items.length, "matière")}>
								{items.map((syllabus: any) => (
									<SyllabusCard key={syllabus.id} syllabus={syllabus} coefficient={syllabusCoefficient(syllabus)} onPress={() => setSelectedSyllabus(syllabus)} />
								))}
							</UeSection>
						))
					) : (
						<EmptyState text="Aucun syllabus pour ce filtre." />
					)}
				</Animated.View>

				{connected ? (
					<Pressable
						style={({ pressed }) => [s.secondaryBtn, s.disconnect, { borderColor: theme.border, backgroundColor: pressed ? theme.surfaceSoft : "transparent" }]}
						onPress={disconnectAuriga}
						accessibilityRole="button">
						<LogOut color={danger} size={18} />
						<Text style={[s.secondaryBtnText, { color: danger }]}>Se déconnecter d'Auriga</Text>
					</Pressable>
				) : null}
			</ScrollView>
			<SubjectDetailModal
				subject={selectedSubject}
				ueColor={selectedSubject ? ueColor(selectedSubject.ueCode) : undefined}
				manualGrades={manualGrades}
				onClose={() => setSelectedSubject(null)}
				onOpenGrade={setSelectedGrade}
				onOpenSyllabus={setSelectedSyllabus}
				onEditCoefficient={() => selectedSubject && openSubjectCoefficientEditor(selectedSubject)}
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
				syllabus={selectedSubject?.syllabus}
				onClose={() => setSelectedGrade(null)}
				onEditCoefficient={(grade: DisplayGrade) => setGradeCoefficientEditor(grade)}
				onAssociateExam={async (grade: DisplayGrade, examId: number | null) => {
					if (!grade.overrideKey) return;
					await onUpdateGradeOverride(grade.overrideKey, { examId });
				}}
				onDeleteManual={async (id) => {
					const built = await updateManualGrades(await deleteManualGrade(id));
					if (selectedSubject) setSelectedSubject(findSubjectInPeriods(built, selectedSubject.id) || selectedSubject);
				}}
			/>
			<SyllabusDetailModal
				visible={Boolean(selectedSyllabus)}
				syllabus={selectedSyllabus}
				coefficient={selectedSyllabus ? syllabusCoefficient(selectedSyllabus) : undefined}
				coefficientOverridden={
					selectedSyllabus
						? getSubjectCoefficientOverride({ syllabusId: selectedSyllabus.id }, subjectCoefficientOverrides as SubjectCoefficientOverrides) !== undefined
						: false
				}
				onEditCoefficient={() => selectedSyllabus && openSyllabusCoefficientEditor(selectedSyllabus)}
				onClose={() => setSelectedSyllabus(null)}
			/>
			<CoefficientEditorModal
				visible={Boolean(coefficientEditor)}
				title={coefficientEditor?.title || "Matière"}
				value={coefficientEditor?.value || 1}
				overridden={coefficientEditor?.overridden}
				onClose={() => setCoefficientEditor(null)}
				onSave={async (value) => {
					if (!coefficientEditor) return;
					await onUpdateSubjectCoefficient(coefficientEditor.reference, value);
				}}
				onReset={
					coefficientEditor?.overridden
						? async () => {
								if (!coefficientEditor) return;
								await onUpdateSubjectCoefficient(coefficientEditor.reference, undefined);
							}
						: undefined
				}
			/>
			<CoefficientEditorModal
				visible={Boolean(gradeCoefficientEditor)}
				title={gradeCoefficientEditor?.description || "Note"}
				value={gradeCoefficientEditor?.coefficient || 1}
				overridden={Boolean(gradeCoefficientEditor?.coefficientOverridden)}
				onClose={() => setGradeCoefficientEditor(null)}
				onSave={async (value) => {
					if (!gradeCoefficientEditor?.overrideKey) return;
					await onUpdateGradeOverride(gradeCoefficientEditor.overrideKey, { coefficient: value });
				}}
			/>
			<SyllabusExportModal
				visible={exportModalVisible}
				semesters={exportSemesters}
				selectedStartSemester={exportStartSemester}
				selectedEndSemester={exportEndSemester}
				exporting={exportingSyllabus}
				onClose={onCloseSyllabusExport}
				onChangeStartSemester={onChangeSyllabusExportStartSemester}
				onChangeEndSemester={onChangeSyllabusExportEndSemester}
				onGenerate={onExportSyllabus}
			/>
		</View>
	);
}

export function AuthHeader() {
	const { theme } = useTheme();
	return (
		<View style={[cs.header, s.headerGap]}>
			<View style={s.headerText}>
				<Text accessibilityRole="header" style={[cs.monthText, { color: theme.text }]}>
					Notes
				</Text>
				<Text style={[s.headerSub, { color: theme.muted }]}>Notes et syllabus depuis Auriga</Text>
			</View>
		</View>
	);
}

// Password managers (Proton Pass, Samsung Pass, Bitwarden, iCloud Keychain…) find this form through the
// platform autofill hints: username + current-password, both always mounted side by side. The save prompt
// is triggered by commitAutofillContext() once Auriga accepts the login (see GradesScreen).
export function ConnectCard({
	compact,
	connecting,
	identifier,
	password,
	rememberCredentials,
	status,
	syncing,
	onChangeIdentifier,
	onChangePassword,
	onChangeRememberCredentials,
	onAurigaId,
}: {
	compact?: boolean;
	connecting: boolean;
	identifier: string;
	password: string;
	rememberCredentials: boolean;
	status?: { type: "error" | "loading" | "success"; message: string } | null;
	syncing?: boolean;
	onChangeIdentifier: (value: string) => void;
	onChangePassword: (value: string) => void;
	onChangeRememberCredentials: (value: boolean) => void;
	onAurigaId: () => void;
}) {
	const { theme } = useTheme();
	const onAccent = readableTextOn(theme.accent);
	const passwordRef = useRef<TextInputInstance>(null);
	const [focused, setFocused] = useState<"identifier" | "password" | null>(null);
	const canSubmit = Boolean(identifier.trim() && password);
	const busy = connecting || Boolean(syncing);
	const submit = () => {
		if (canSubmit && !busy) onAurigaId();
	};
	const fieldStyle = (name: "identifier" | "password") => [s.inputBox, { backgroundColor: theme.bg, borderColor: focused === name ? theme.accent : theme.border }];
	return (
		<View style={[s.loginCard, compact && s.loginCardCompact, { backgroundColor: theme.surface, borderColor: theme.border }]}>
			<View>
				<Text accessibilityRole="header" style={[s.loginTitle, { color: theme.text }]}>
					{compact ? "Reconnecte-toi" : "Connexion aux notes"}
				</Text>
				<Text style={[s.loginSub, { color: theme.muted }]}>Avec ton identifiant Auriga</Text>
			</View>
			<View style={s.formField}>
				<Text style={[s.formLabel, { color: theme.muted }]}>Identifiant</Text>
				<View style={fieldStyle("identifier")}>
					<Mail color={theme.muted} size={18} />
					<TextInput
						value={identifier}
						onChangeText={onChangeIdentifier}
						placeholder="Mail ou login Auriga"
						placeholderTextColor={theme.muted}
						accessibilityLabel="Identifiant Auriga"
						autoCapitalize="none"
						autoCorrect={false}
						spellCheck={false}
						autoComplete="username"
						textContentType="username"
						importantForAutofill="yes"
						keyboardType="email-address"
						nativeID="auriga-login-identifier"
						testID="auriga-login-identifier"
						returnKeyType="next"
						submitBehavior="submit"
						onSubmitEditing={() => passwordRef.current?.focus()}
						onFocus={() => setFocused("identifier")}
						onBlur={() => setFocused(null)}
						style={[s.idInput, { color: theme.text }]}
					/>
				</View>
			</View>
			<View style={s.formField}>
				<Text style={[s.formLabel, { color: theme.muted }]}>Mot de passe</Text>
				<View style={fieldStyle("password")}>
					<KeyRound color={theme.muted} size={18} />
					<TextInput
						ref={passwordRef}
						value={password}
						onChangeText={onChangePassword}
						placeholder="Mot de passe"
						placeholderTextColor={theme.muted}
						accessibilityLabel="Mot de passe Auriga"
						secureTextEntry
						autoCapitalize="none"
						autoCorrect={false}
						spellCheck={false}
						autoComplete="current-password"
						textContentType="password"
						importantForAutofill="yes"
						nativeID="auriga-login-password"
						testID="auriga-login-password"
						returnKeyType="go"
						onSubmitEditing={submit}
						onFocus={() => setFocused("password")}
						onBlur={() => setFocused(null)}
						style={[s.idInput, { color: theme.text }]}
					/>
				</View>
			</View>
			<Pressable
				style={s.rememberRow}
				onPress={() => onChangeRememberCredentials(!rememberCredentials)}
				accessibilityRole="checkbox"
				accessibilityState={{ checked: rememberCredentials }}>
				<View style={[s.checkbox, { borderColor: rememberCredentials ? theme.accent : theme.border, backgroundColor: rememberCredentials ? theme.accent : "transparent" }]}>
					{rememberCredentials ? <Check color={onAccent} size={15} strokeWidth={3} /> : null}
				</View>
				<Text style={[s.rememberText, { color: theme.text }]}>Se souvenir de moi</Text>
			</Pressable>
			{status ? <AurigaStatusBanner status={status} compact /> : null}
			<Pressable
				accessibilityLabel="Se connecter à Auriga"
				accessibilityRole="button"
				accessibilityState={{ disabled: busy || !canSubmit, busy }}
				nativeID="auriga-login-submit"
				testID="auriga-login-submit"
				style={({ pressed }) => [s.primaryBtn, { backgroundColor: theme.accent, opacity: busy || !canSubmit ? 0.55 : pressed ? 0.85 : 1 }]}
				disabled={busy || !canSubmit}
				onPress={submit}>
				{busy ? <ActivityIndicator color={onAccent} /> : null}
				<Text style={[s.primaryBtnText, { color: onAccent }]}>{syncing ? "Récupération..." : connecting ? "Connexion..." : "Se connecter"}</Text>
			</Pressable>
		</View>
	);
}

function Notice({ icon, text, tone, compact }: { icon: React.ReactNode; text: string; tone?: string; compact?: boolean }) {
	const { theme } = useTheme();
	return (
		<Animated.View
			entering={FadeIn.duration(180)}
			style={[cs.banner, s.notice, compact && s.noticeCompact, { backgroundColor: theme.surface, borderColor: tone || theme.border }]}>
			{icon}
			<Text style={[cs.bannerText, { color: theme.text }]}>{text}</Text>
		</Animated.View>
	);
}

export function AurigaStatusBanner({ status, compact }: { status: { type: "error" | "loading" | "success"; message: string }; compact?: boolean }) {
	const { theme } = useTheme();
	const danger = destructiveColor(theme);
	const icon =
		status.type === "loading" ? (
			<ActivityIndicator color={theme.accent} size="small" />
		) : status.type === "success" ? (
			<Check color={theme.accent} size={17} />
		) : (
			<X color={danger} size={17} />
		);
	return <Notice compact={compact} icon={icon} text={status.message} tone={status.type === "error" ? danger : status.type === "success" ? theme.accent : undefined} />;
}

/** One surface, rows split by a hairline — the same grouping as the settings lists. */
function Group({ children, flat }: { children: React.ReactNode; flat?: boolean }) {
	const { theme } = useTheme();
	const rows = React.Children.toArray(children);
	return (
		<View style={[!flat && s.groupSurface, !flat && { backgroundColor: theme.surface, borderColor: theme.border }]}>
			{rows.map((row, index) => (
				<React.Fragment key={(row as React.ReactElement).key ?? index}>
					{index > 0 ? <View style={[s.divider, { backgroundColor: theme.border }]} /> : null}
					{row}
				</React.Fragment>
			))}
		</View>
	);
}

function UeSection({
	code,
	color,
	title,
	meta,
	average,
	averageColor,
	children,
}: {
	code: string;
	color: string;
	title: string;
	meta: string;
	average?: string;
	averageColor?: string;
	children: React.ReactNode;
}) {
	const { theme } = useTheme();
	const dark = theme.mode === "dark";
	const ink = inkOf(theme, color);
	const rows = React.Children.toArray(children);
	return (
		<View style={[s.ueCard, { backgroundColor: theme.surface, borderColor: hexToRgba(color, dark ? 0.45 : 0.35), shadowColor: theme.cardShadow }]}>
			<View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: hexToRgba(color, dark ? 0.12 : 0.07) }]} />
			<View style={s.ueHead} accessible accessibilityRole="header" accessibilityLabel={`${title}${average ? `, moyenne ${average}` : ""}`}>
				<View style={s.headerText}>
					<View style={s.ueTitleLine}>
						<Text style={[s.ueCode, { color: ink, backgroundColor: hexToRgba(color, dark ? 0.24 : 0.16) }]}>{code}</Text>
						<Text style={[s.groupMeta, s.ueMeta, { color: theme.muted }]} numberOfLines={1}>
							{meta}
						</Text>
					</View>
					<Text style={[s.groupTitle, { color: theme.text }]} numberOfLines={2}>
						{title}
					</Text>
				</View>
				{average ? <Text style={[s.ueAverage, { color: averageColor || ink }]}>{average}</Text> : null}
			</View>
			{rows.map((row, index) => (
				<React.Fragment key={(row as React.ReactElement).key ?? index}>
					<View style={[index === 0 ? s.ueRule : s.divider, { backgroundColor: hexToRgba(color, index === 0 ? 0.35 : 0.22) }]} />
					{row}
				</React.Fragment>
			))}
		</View>
	);
}

function Tag({ label, color }: { label: string; color: string }) {
	return <Text style={[s.tag, { color, backgroundColor: hexToRgba(color, 0.14) }]}>{label}</Text>;
}

function ListRow({ onPress, accessibilityLabel, children }: { onPress: () => void; accessibilityLabel?: string; children: React.ReactNode }) {
	const { theme } = useTheme();
	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="button"
			accessibilityLabel={accessibilityLabel}
			android_ripple={{ color: theme.accentSoft }}
			style={({ pressed }) => [s.listRow, pressed && Platform.OS === "ios" && { backgroundColor: theme.surfaceSoft }]}>
			{children}
		</Pressable>
	);
}

export function SubjectCard({ subject, onPress }: { subject: DisplaySubject; onPress: () => void }) {
	const { theme } = useTheme();
	const average = averageLabel(subject.studentAverage);
	const count = subject.grades.length;
	return (
		<ListRow onPress={onPress} accessibilityLabel={`${subject.name}, moyenne ${average}, ${plural(count, "note")}${subject.hasNonValidated ? ", à valider" : ""}`}>
			<View style={s.listBody}>
				<Text style={[s.listTitle, { color: theme.text }]} numberOfLines={2}>
					{subject.name}
				</Text>
				<View style={s.listMetaLine}>
					<Text style={[s.listMeta, { color: theme.muted }]}>{plural(count, "note")}</Text>
					{subject.hasNonValidated ? <Tag label="À valider" color={destructiveColor(theme)} /> : null}
					{subject.hasManualGrades ? <Tag label="Manuel" color={theme.warn} /> : null}
				</View>
			</View>
			<Text style={[s.listScore, { color: scoreTone(theme, subject) }]}>{average}</Text>
			<ChevronRight color={theme.muted} size={18} />
		</ListRow>
	);
}

function TrailingValue({ text, color, chevron }: { text: string; color?: string; chevron?: boolean }) {
	const { theme } = useTheme();
	return (
		<View style={s.trailing}>
			<Text style={[s.trailingText, { color: color || theme.text }]} numberOfLines={1}>
				{text}
			</Text>
			{chevron ? <ChevronRight color={theme.muted} size={18} /> : null}
		</View>
	);
}

export function SubjectDetailModal({
	subject,
	ueColor,
	onClose,
	onEditCoefficient,
	onOpenGrade,
	onOpenSyllabus,
	onAddManual,
}: {
	subject: DisplaySubject | null;
	ueColor?: string;
	manualGrades: ManualGrade[];
	onClose: () => void;
	onEditCoefficient: () => void;
	onOpenGrade: (grade: DisplayGrade) => void;
	onOpenSyllabus: (syllabus: AurigaSyllabus) => void;
	onAddManual: (grade: Omit<ManualGrade, "id" | "createdAt">) => Promise<void>;
	onDeleteManual: (id: string) => Promise<void>;
}) {
	const { theme } = useTheme();
	const insets = useSafeAreaInsets();
	const onAccent = readableTextOn(theme.accent);
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
	const saveManual = async () => {
		if (!subject) return;
		const grade = Number(manualScore.replace(",", "."));
		if (!manualScore.trim() || !Number.isFinite(grade) || grade < 0 || grade > 20) {
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
				<PanelHeader
					title={subject?.name || "Matière"}
					subtitle={subject?.ueCode ? UE_NAMES[subject.ueCode] || subject.ueCode : undefined}
					subtitleColor={ueColor ? inkOf(theme, ueColor) : undefined}
					onClose={onClose}
				/>
				<ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[s.panelContent, { paddingBottom: insets.bottom + 38 }]}>
					<View style={s.summary}>
						<Text style={[s.summaryValue, { color: scoreTone(theme, subject) }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
							{averageLabel(subject?.studentAverage)}
						</Text>
						<View style={s.summaryText}>
							<Text style={[s.summaryTitle, { color: theme.text }]}>Moyenne de la matière</Text>
							<Text style={[s.summaryMeta, { color: subject?.hasNonValidated ? destructiveColor(theme) : theme.muted }]}>
								{subject?.hasNonValidated ? "À valider" : plural(noteCount, "note")}
							</Text>
						</View>
					</View>
					{subject?.hasManualGrades ? (
						<Notice tone={theme.warn} icon={<Calculator color={theme.warn} size={17} />} text="Des notes manuelles influencent cette moyenne." />
					) : null}

					<Section>
						<Row
							icon={Percent}
							title="Coefficient"
							subtitle={subject?.coefficientOverridden ? "Modifié dans EpiTime" : undefined}
							trailing={<TrailingValue text={formatCoeff(subjectCoeff)} chevron />}
							onPress={onEditCoefficient}
						/>
					</Section>

					<View style={s.panelActions}>
						<Pressable
							style={({ pressed }) => [s.primaryBtn, s.flex, { backgroundColor: theme.accent, opacity: pressed ? 0.85 : 1 }]}
							onPress={() => setShowAdd((value) => !value)}
							accessibilityRole="button"
							accessibilityState={{ expanded: showAdd }}>
							<BadgePlus color={onAccent} size={18} />
							<Text style={[s.primaryBtnText, { color: onAccent }]}>Ajouter une note</Text>
						</Pressable>
						{subject?.syllabus ? (
							<Pressable
								style={({ pressed }) => [s.secondaryBtn, { borderColor: theme.border, backgroundColor: pressed ? theme.surfaceSoft : theme.surface }]}
								onPress={() => onOpenSyllabus(subject.syllabus!)}
								accessibilityRole="button">
								<BookOpen color={theme.accent} size={18} />
								<Text style={[s.secondaryBtnText, { color: theme.text }]}>Syllabus</Text>
							</Pressable>
						) : null}
					</View>

					{showAdd ? (
						<Animated.View entering={FadeIn.duration(200)} style={[s.addPanel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
							<View style={s.formField}>
								<Text style={[s.formLabel, { color: theme.muted }]}>Assigner à un examen</Text>
								<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.examChips}>
									{(exams.length ? exams : [{ id: -1, index: 1, type: "MANUAL", typeName: "Note libre" }]).map((exam) => {
										const active = (selectedExamId || exams[0]?.id || -1) === exam.id;
										return (
											<Pressable
												key={exam.id}
												hitSlop={6}
												style={[
													cs.chipBtn,
													s.chip,
													active ? { backgroundColor: theme.accentSoft, borderColor: "transparent" } : { borderColor: theme.border },
												]}
												onPress={() => setSelectedExamId(exam.id)}
												accessibilityRole="button"
												accessibilityState={{ selected: active }}>
												<Text style={[cs.chipText, s.chipText, { color: active ? theme.accent : theme.text }]}>
													{exam.typeName || exam.type}
													{exams.length > 1 && exam.index ? ` ${exam.index}` : ""}
												</Text>
											</Pressable>
										);
									})}
								</ScrollView>
							</View>
							<View style={s.formField}>
								<Text style={[s.formLabel, { color: theme.muted }]}>Note sur 20</Text>
								<TextInput
									value={manualScore}
									onChangeText={setManualScore}
									placeholder="Ex : 14,5"
									placeholderTextColor={theme.muted}
									keyboardType="decimal-pad"
									accessibilityLabel="Note sur 20"
									onSubmitEditing={() => void saveManual()}
									style={[s.inputBox, s.plainInput, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]}
								/>
							</View>
							<Pressable
								style={({ pressed }) => [s.primaryBtn, { backgroundColor: theme.accent, opacity: pressed ? 0.85 : 1 }]}
								onPress={() => void saveManual()}
								accessibilityRole="button">
								<Text style={[s.primaryBtnText, { color: onAccent }]}>Ajouter à la moyenne</Text>
							</Pressable>
						</Animated.View>
					) : null}

					<View style={[s.groupHead, s.sectionGap]}>
						<Text accessibilityRole="header" style={[s.groupTitle, s.headerText, { color: theme.text }]}>
							Carnet de notes
						</Text>
						<Text style={[s.groupMeta, { color: theme.muted }]}>{plural(noteCount, "note")}</Text>
					</View>
					{noteCount ? (
						<Group>
							{subject?.grades.map((grade) => {
								const score = scoreLabel(grade.studentScore);
								return (
									<ListRow
										key={grade.id}
										onPress={() => onOpenGrade(grade)}
										accessibilityLabel={`${grade.description}, ${score}, coefficient ${formatCoeff(grade.coefficient)}`}>
										<View style={s.listBody}>
											<Text style={[s.listTitle, { color: theme.text }]} numberOfLines={2}>
												{grade.description}
											</Text>
											<View style={s.listMetaLine}>
												<Text style={[s.listMeta, { color: theme.muted }]}>coeff {formatCoeff(grade.coefficient)}</Text>
												{grade.isManual ? <Tag label="Manuel" color={theme.warn} /> : null}
											</View>
										</View>
										<Text style={[s.listScore, { color: grade.isManual ? theme.warn : theme.text }]}>{score}</Text>
										<ChevronRight color={theme.muted} size={18} />
									</ListRow>
								);
							})}
						</Group>
					) : (
						<EmptyState text="Aucune note pour cette matière." />
					)}
				</ScrollView>
			</View>
		</Modal>
	);
}

export function GradeDetailModal({
	grade,
	syllabus,
	onClose,
	onDeleteManual,
	onEditCoefficient,
	onAssociateExam,
}: {
	grade: DisplayGrade | null;
	syllabus?: AurigaSyllabus;
	onClose: () => void;
	onDeleteManual: (id: string) => Promise<void>;
	onEditCoefficient: (grade: DisplayGrade) => void;
	onAssociateExam: (grade: DisplayGrade, examId: number | null) => Promise<void>;
}) {
	const { theme } = useTheme();
	const insets = useSafeAreaInsets();
	const danger = destructiveColor(theme);
	const [pickerVisible, setPickerVisible] = useState(false);
	const canLinkExam = Boolean(grade && !grade.isManual && syllabus?.exams?.length);
	const examLabel = grade?.examType ? `${grade.examType}${grade.examIndex ? ` ${grade.examIndex}` : ""}` : "Associer";
	return (
		<Modal visible={Boolean(grade)} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
			<View style={[s.panelRoot, { backgroundColor: theme.bg, paddingTop: insets.top + 12 }]}>
				<PanelHeader title={grade?.description || "Note"} subtitle={grade?.isManual ? "Note manuelle" : "Auriga"} onClose={onClose} />
				<ScrollView contentContainerStyle={[s.panelContent, { paddingBottom: insets.bottom + 32 }]}>
					<View style={s.summary}>
						<Text style={[s.summaryValue, { color: grade?.isManual ? theme.warn : theme.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
							{scoreLabel(grade?.studentScore)}
						</Text>
						<View style={s.summaryText}>
							<Text style={[s.summaryTitle, { color: theme.text }]} numberOfLines={2}>
								{grade?.subjectName}
							</Text>
						</View>
					</View>
					<Section>
						<Row
							icon={Percent}
							title="Coefficient"
							subtitle={grade?.coefficientOverridden ? "Modifié dans EpiTime" : undefined}
							trailing={<TrailingValue text={grade ? formatCoeff(grade.coefficient) : "-"} chevron={Boolean(grade && !grade.isManual)} />}
							onPress={grade && !grade.isManual ? () => onEditCoefficient(grade) : undefined}
						/>
						{canLinkExam ? (
							<Row
								icon={Link2}
								title="Note du syllabus"
								trailing={<TrailingValue text={examLabel} color={grade?.examType ? theme.text : theme.accent} chevron />}
								onPress={() => setPickerVisible(true)}
							/>
						) : null}
						<Row icon={Hash} title="Code brut" trailing={<TrailingValue text={grade?.rawCode || "-"} color={theme.muted} />} />
					</Section>
					{grade?.isManual && grade.manualId ? (
						<Pressable
							style={({ pressed }) => [s.secondaryBtn, { borderColor: theme.border, backgroundColor: pressed ? theme.surfaceSoft : "transparent" }]}
							accessibilityRole="button"
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
							<Trash2 color={danger} size={18} />
							<Text style={[s.secondaryBtnText, { color: danger }]}>Supprimer la note manuelle</Text>
						</Pressable>
					) : null}
				</ScrollView>
				<GradeExamPickerModal
					visible={pickerVisible}
					exams={syllabus?.exams || []}
					selectedExamId={grade?.examId}
					onClose={() => setPickerVisible(false)}
					onSelect={async (examId) => {
						if (grade) await onAssociateExam(grade, examId);
						setPickerVisible(false);
					}}
				/>
			</View>
		</Modal>
	);
}

function GradeExamPickerModal({
	visible,
	exams,
	selectedExamId,
	onClose,
	onSelect,
}: {
	visible: boolean;
	exams: AurigaSyllabus["exams"];
	selectedExamId?: number;
	onClose: () => void;
	onSelect: (examId: number | null) => Promise<void>;
}) {
	const { theme } = useTheme();
	const choice = (key: string | number, label: string, weight: number, selected: boolean, examId: number | null) => (
		<ListRow key={key} onPress={() => void onSelect(examId)} accessibilityLabel={`${label}, coefficient ${formatCoeff(weight)}${selected ? ", sélectionné" : ""}`}>
			<View style={s.checkSlot}>{selected ? <Check color={theme.accent} size={18} strokeWidth={3} /> : null}</View>
			<Text style={[s.listTitle, s.flex, { color: theme.text }]}>{label}</Text>
			<Text style={[s.listMeta, { color: theme.muted }]}>coeff {formatCoeff(weight)}</Text>
		</ListRow>
	);
	return (
		<Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
			<View style={s.choiceBackdrop}>
				<Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Fermer" />
				<View style={[s.choiceSheet, { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.cardShadow }]}>
					<View style={s.choiceHead}>
						<Text accessibilityRole="header" style={[s.choiceTitle, { color: theme.text }]}>
							Associer à une note du syllabus
						</Text>
						<Text style={[s.choiceHint, { color: theme.muted }]}>Choisis la pondération correspondante. Sans lien, le coefficient reste 1.</Text>
					</View>
					<ScrollView style={s.choiceList}>
						<Group flat>
							{choice("none", "Aucune note du syllabus", 1, !selectedExamId, null)}
							{exams.map((exam) =>
								choice(
									exam.id,
									`${exam.typeName || exam.type}${exam.index ? ` ${exam.index}` : ""}`,
									exam.weighting ? exam.weighting / 100 : 1,
									exam.id === selectedExamId,
									exam.id
								)
							)}
						</Group>
					</ScrollView>
				</View>
			</View>
		</Modal>
	);
}

export function PanelHeader({ title, subtitle, subtitleColor, onClose }: { title: string; subtitle?: string; subtitleColor?: string; onClose: () => void }) {
	const { theme } = useTheme();
	return (
		<View style={[s.panelHeader, { borderBottomColor: theme.border }]}>
			<View style={s.headerText}>
				<Text accessibilityRole="header" style={[s.panelTitle, { color: theme.text }]} numberOfLines={2}>
					{title}
				</Text>
				{subtitle ? (
					<Text style={[s.panelSubtitle, { color: subtitleColor || theme.muted }]} numberOfLines={1}>
						{subtitle}
					</Text>
				) : null}
			</View>
			<Pressable
				style={({ pressed }) => [s.closeBtn, { borderColor: theme.border, backgroundColor: pressed ? theme.surfaceSoft : "transparent" }]}
				onPress={onClose}
				accessibilityRole="button"
				accessibilityLabel="Fermer">
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

export const s = StyleSheet.create({
	root: { flex: 1 },
	loading: { flex: 1, alignItems: "center", justifyContent: "center" },
	content: { paddingHorizontal: 16 },
	flex: { flex: 1 },
	headerGap: { marginBottom: 16 },
	headerText: { flex: 1, minWidth: 0 },
	headerSub: { fontSize: 14, fontWeight: "800" },

	notice: { marginTop: 0, marginBottom: 10, paddingRight: 12 },
	noticeCompact: { marginBottom: 0 },

	segment: { flex: 0, marginBottom: 12 },
	chipsScroll: { flexGrow: 0, marginHorizontal: -16 },
	chips: { gap: 8, paddingHorizontal: 16, paddingVertical: 2 },
	examChips: { gap: 8, paddingVertical: 2 },
	chip: { minHeight: 36, paddingHorizontal: 14 },
	chipText: { fontWeight: "800" },

	summary: { flexDirection: "row", alignItems: "center", gap: 14, marginTop: 18, marginBottom: 14 },
	summaryValue: { flexShrink: 0, maxWidth: "60%", fontSize: 48, lineHeight: 54, fontWeight: "900", letterSpacing: -1, fontVariant: ["tabular-nums"] },
	summaryText: { flex: 1, minWidth: 0 },
	summaryTitle: { fontSize: 16, lineHeight: 21, fontWeight: "900" },
	summaryMeta: { marginTop: 2, fontSize: 13, fontWeight: "800" },

	searchBox: { minHeight: 48, borderRadius: 14, borderWidth: 1, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 9, marginTop: 12, marginBottom: 12 },
	searchInput: { flex: 1, minHeight: 46, fontSize: 16, fontWeight: "700", paddingVertical: 0 },

	group: { marginTop: 22 },
	sectionGap: { marginTop: 26 },
	groupHead: { flexDirection: "row", alignItems: "flex-end", gap: 12, marginBottom: 8, paddingHorizontal: 2 },
	groupTitle: { fontSize: 18, lineHeight: 23, fontWeight: "900" },
	groupMeta: { marginTop: 2, fontSize: 13, fontWeight: "800" },
	groupAverage: { fontSize: 20, lineHeight: 25, fontWeight: "900", fontVariant: ["tabular-nums"] },
	groupSurface: { borderWidth: 1, borderRadius: 18, overflow: "hidden" },
	ueCard: { marginTop: 16, borderWidth: 1, borderRadius: 20, overflow: "hidden", shadowOpacity: 0.1, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 2 },
	ueHead: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12 },
	ueTitleLine: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
	ueCode: { overflow: "hidden", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, fontSize: 12, lineHeight: 17, fontWeight: "900", letterSpacing: 0.4 },
	ueMeta: { flexShrink: 1, marginTop: 0 },
	ueAverage: { fontSize: 24, lineHeight: 29, fontWeight: "900", fontVariant: ["tabular-nums"] },
	ueRule: { height: 1 },
	divider: { height: StyleSheet.hairlineWidth, marginLeft: 16 },

	listRow: { minHeight: 64, paddingLeft: 16, paddingRight: 10, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 10 },
	listBody: { flex: 1, minWidth: 0 },
	listTitle: { fontSize: 15, lineHeight: 20, fontWeight: "800" },
	listMetaLine: { marginTop: 4, flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 },
	listMeta: { fontSize: 13, fontWeight: "700", fontVariant: ["tabular-nums"] },
	listScore: { minWidth: 44, textAlign: "right", fontSize: 17, fontWeight: "900", fontVariant: ["tabular-nums"] },
	tag: { overflow: "hidden", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, fontSize: 11, lineHeight: 16, fontWeight: "900" },
	checkSlot: { width: 20, alignItems: "center" },

	trailing: { maxWidth: 170, flexDirection: "row", alignItems: "center", gap: 4 },
	trailingText: { flexShrink: 1, fontSize: 15, fontWeight: "800", fontVariant: ["tabular-nums"] },

	secondaryBtn: { minHeight: 48, borderRadius: 14, borderWidth: 1, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
	secondaryBtnText: { fontSize: 15, fontWeight: "900" },
	exportBtn: { marginBottom: 4 },
	disconnect: { marginTop: 28 },
	primaryBtn: { minHeight: 50, borderRadius: 14, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
	primaryBtnText: { fontSize: 15, fontWeight: "900" },

	empty: { borderWidth: 1, borderRadius: 18, padding: 16, marginTop: 14 },
	emptyText: { fontSize: 14, lineHeight: 20, fontWeight: "700", textAlign: "center" },

	loginCard: { borderWidth: 1, borderRadius: 22, padding: 16, gap: 14 },
	loginCardCompact: { marginBottom: 14 },
	loginTitle: { fontSize: 20, lineHeight: 25, fontWeight: "900" },
	loginSub: { marginTop: 2, fontSize: 14, fontWeight: "700" },
	formField: { gap: 8 },
	formLabel: { fontSize: 12, fontWeight: "900", textTransform: "uppercase" },
	inputBox: { minHeight: 50, borderRadius: 14, borderWidth: 1, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 9 },
	idInput: { flex: 1, minHeight: 48, fontSize: 16, fontWeight: "700", paddingVertical: 0 },
	plainInput: { fontSize: 16, fontWeight: "700" },
	rememberRow: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 12, alignSelf: "stretch" },
	checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: "center", justifyContent: "center" },
	rememberText: { flex: 1, fontSize: 15, fontWeight: "700" },

	panelRoot: { flex: 1 },
	panelHeader: { paddingHorizontal: 18, paddingBottom: 12, borderBottomWidth: 1, flexDirection: "row", alignItems: "center", gap: 12 },
	panelTitle: { fontSize: 22, lineHeight: 27, fontWeight: "900" },
	panelSubtitle: { marginTop: 2, fontSize: 13, fontWeight: "800" },
	closeBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: "center", justifyContent: "center" },
	panelContent: { paddingHorizontal: 16, paddingTop: 4 },
	panelActions: { flexDirection: "row", gap: 10, marginTop: 20 },
	addPanel: { marginTop: 12, borderWidth: 1, borderRadius: 18, padding: 14, gap: 14 },

	choiceBackdrop: { flex: 1, justifyContent: "center", padding: 20, backgroundColor: "rgba(0, 0, 0, 0.5)" },
	choiceSheet: {
		maxHeight: "76%",
		borderWidth: 1,
		borderRadius: 22,
		paddingVertical: 8,
		overflow: "hidden",
		shadowOpacity: 0.2,
		shadowRadius: 22,
		shadowOffset: { width: 0, height: 12 },
		elevation: 8,
	},
	choiceHead: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8, gap: 4 },
	choiceTitle: { fontSize: 18, lineHeight: 23, fontWeight: "900" },
	choiceHint: { fontSize: 13, lineHeight: 18, fontWeight: "700" },
	choiceList: { flexGrow: 0 },
});
