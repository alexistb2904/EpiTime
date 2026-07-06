import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from "react-native";
import { useFocusEffect, useRoute } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import { BookOpen, Calculator, GraduationCap, LogOut, RefreshCw, Search, WifiOff, X } from "lucide-react-native";
import Card from "../components/Card";
import SyllabusCard from "../components/grades/SyllabusCard";
import SyllabusDetailModal from "../components/grades/SyllabusDetailModal";
import { useTheme } from "../context/ThemeContext";
import { clearAurigaCache, getAurigaLastSync, getCachedAurigaGrades, getCachedAurigaSyllabus, isAurigaSyncStale } from "../services/aurigaCache";
import {
	AurigaAuthError,
	clearRememberedAurigaCredentials,
	getRememberedAurigaCredentials,
	hasAurigaRefreshToken,
	loginAurigaWithCredentials,
	logoutAuriga,
	saveRememberedAurigaCredentials,
} from "../services/aurigaAuth";
import { syncAurigaData } from "../services/aurigaClient";
import { cancelAutofillContext, commitAutofillContext } from "../services/autofill";
import { getUseWeightedAverages } from "../services/gradePreferences";
import { addManualGrade, deleteManualGrade, getManualGrades, type ManualGrade } from "../services/manualGrades";
import type { AurigaGrade, AurigaSyllabus } from "../services/aurigaTypes";
import { buildGradesPeriods, type DisplayGrade, type DisplaySubject, type DisplayUE, type GradesPeriod } from "../services/gradesService";
import { AuthHeader, ConnectCard, GradesContent, s } from "../components/grades/GradesComponents";

type GradesMode = "notes" | "syllabus";
type AurigaSyncSource = "auto" | "button" | "login" | "pull";
type AurigaStatus = { type: "error" | "loading" | "success"; message: string } | null;

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

function normalizeSearch(value: string) {
	return value
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "");
}

function formatLastSync(value: string | null) {
	if (!value) return "Jamais synchronisé";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "Dernière sync inconnue";
	return `Sync ${date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })} à ${date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
}

function flattenSubjects(period: GradesPeriod | null) {
	if (!period) return [];
	return period.ues.flatMap((ue) => ue.subjects.map((subject) => ({ ue, subject })));
}

function latestSemester(periods: GradesPeriod[]) {
	return periods.reduce((latest, period) => (period.semester > latest ? period.semester : latest), periods[0]?.semester ?? null);
}

export default function GradesScreen() {
	const { theme } = useTheme();
	const insets = useSafeAreaInsets();
	const route = useRoute<any>();
	const routeParams = route.params as { mode?: GradesMode; syllabusId?: number; syllabusRequestAt?: number } | undefined;
	const handledSyllabusRequest = useRef<string | null>(null);
	const [connected, setConnected] = useState(false);
	const [loading, setLoading] = useState(true);
	const [connecting, setConnecting] = useState(false);
	const [refreshing, setRefreshing] = useState(false);
	const [buttonRefreshing, setButtonRefreshing] = useState(false);
	const [syncingAuriga, setSyncingAuriga] = useState(false);
	const [offline, setOffline] = useState(false);
	const [aurigaStatus, setAurigaStatus] = useState<AurigaStatus>(null);
	const [rawGrades, setRawGrades] = useState<AurigaGrade[]>([]);
	const [periods, setPeriods] = useState<GradesPeriod[]>([]);
	const [selectedSemester, setSelectedSemester] = useState<number | null>(null);
	const [search, setSearch] = useState("");
	const [mode, setMode] = useState<GradesMode>("notes");
	const [syllabusList, setSyllabusList] = useState<AurigaSyllabus[]>([]);
	const [lastSync, setLastSync] = useState<string | null>(null);
	const [manualGrades, setManualGrades] = useState<ManualGrade[]>([]);
	const [useWeightedAverages, setUseWeightedAveragesState] = useState(true);
	const [selectedSubject, setSelectedSubject] = useState<DisplaySubject | null>(null);
	const [selectedGrade, setSelectedGrade] = useState<DisplayGrade | null>(null);
	const [selectedSyllabus, setSelectedSyllabus] = useState<AurigaSyllabus | null>(null);
	const [aurigaIdentifier, setAurigaIdentifier] = useState("");
	const [aurigaPassword, setAurigaPassword] = useState("");
	const [rememberAurigaCredentials, setRememberAurigaCredentials] = useState(false);

	const resetAurigaView = useCallback((options: { clearCredentials?: boolean } = {}) => {
		setConnected(false);
		setOffline(false);
		setRawGrades([]);
		setSyllabusList([]);
		setPeriods([]);
		setSelectedSemester(null);
		setSelectedSubject(null);
		setSelectedGrade(null);
		setSelectedSyllabus(null);
		setLastSync(null);
		setSearch("");
		setMode("notes");
		if (options.clearCredentials) {
			setAurigaIdentifier("");
			setAurigaPassword("");
			setRememberAurigaCredentials(false);
		}
	}, []);

	const rebuildPeriods = useCallback((grades: AurigaGrade[], syllabus: AurigaSyllabus[], manual: ManualGrade[], weighted: boolean) => {
		const built = buildGradesPeriods(grades, syllabus, { manualGrades: manual, useWeightedAverages: weighted });
		setPeriods(built);
		setSelectedSemester((current) => (current !== null && built.some((period) => period.semester === current) ? current : latestSemester(built)));
		return built;
	}, []);

	const hydrateCache = useCallback(async () => {
		const [cachedGrades, cachedSyllabus, syncDate, manual, weighted] = await Promise.all([
			getCachedAurigaGrades(),
			getCachedAurigaSyllabus(),
			getAurigaLastSync(),
			getManualGrades(),
			getUseWeightedAverages(),
		]);
		setRawGrades(cachedGrades);
		setSyllabusList(cachedSyllabus);
		setLastSync(syncDate);
		setManualGrades(manual);
		setUseWeightedAveragesState(weighted);
		rebuildPeriods(cachedGrades, cachedSyllabus, manual, weighted);
	}, [rebuildPeriods]);

	const refreshAuriga = useCallback(
		async (source: AurigaSyncSource = "button") => {
			const isPullRefresh = source === "pull";
			const isButtonRefresh = source === "button";
			const showSyncStatus = source === "login" || source === "auto";
			setRefreshing(isPullRefresh);
			setButtonRefreshing(isButtonRefresh);
			setSyncingAuriga(showSyncStatus);
			if (source === "login") setAurigaStatus({ type: "loading", message: "Connexion réussie. Récupération des informations Auriga..." });
			if (source === "auto") setAurigaStatus({ type: "loading", message: "Récupération des informations Auriga..." });
			try {
				const data = await syncAurigaData();
				const manual = await getManualGrades();
				const weighted = await getUseWeightedAverages();
				setRawGrades(data.grades);
				setSyllabusList(data.syllabus);
				setManualGrades(manual);
				setUseWeightedAveragesState(weighted);
				rebuildPeriods(data.grades, data.syllabus, manual, weighted);
				setLastSync(await getAurigaLastSync());
				setConnected(true);
				setOffline(false);
				if (source === "login") setAurigaStatus({ type: "success", message: "Connexion Auriga réussie. Notes synchronisées." });
				if (source === "button" || source === "pull") setAurigaStatus({ type: "success", message: "Notes Auriga mises à jour." });
				if (source === "auto") setAurigaStatus(null);
				return true;
			} catch (error) {
				if (error instanceof AurigaAuthError) setConnected(false);
				setOffline(true);
				setAurigaStatus({ type: "error", message: error instanceof Error ? error.message : "Récupération Auriga impossible." });
				return false;
			} finally {
				setRefreshing(false);
				setButtonRefreshing(false);
				setSyncingAuriga(false);
				setLoading(false);
			}
		},
		[rebuildPeriods]
	);

	useEffect(() => {
		if (aurigaStatus?.type !== "success") return;
		const timeout = setTimeout(() => setAurigaStatus((current) => (current === aurigaStatus ? null : current)), 3600);
		return () => clearTimeout(timeout);
	}, [aurigaStatus]);

	useEffect(() => {
		let mounted = true;
		(async () => {
			try {
				await hydrateCache();
				const [hasToken, rememberedCredentials, syncDate] = await Promise.all([hasAurigaRefreshToken(), getRememberedAurigaCredentials(), getAurigaLastSync()]);
				if (!mounted) return;
				if (rememberedCredentials) {
					setRememberAurigaCredentials(true);
					setAurigaIdentifier(rememberedCredentials.identifier);
					setAurigaPassword(rememberedCredentials.password);
				}
				setConnected(hasToken);
				if (hasToken) {
					setLoading(false);
					if (isAurigaSyncStale(syncDate)) {
						await refreshAuriga("auto");
					}
					return;
				}
				if (rememberedCredentials) {
					setConnecting(true);
					try {
						await loginAurigaWithCredentials(rememberedCredentials.identifier, rememberedCredentials.password);
						setConnecting(false);
						await refreshAuriga("auto");
						return;
					} catch (error) {
						if (error instanceof AurigaAuthError) {
							await clearRememberedAurigaCredentials();
						}
						if (!mounted) return;
						setRememberAurigaCredentials(false);
						setAurigaPassword("");
						setConnected(false);
						setOffline(true);
						setAurigaStatus({
							type: "error",
							message:
								error instanceof AurigaAuthError
									? "Reconnexion automatique Auriga impossible. Vérifie tes identifiants."
									: "Reconnexion automatique Auriga impossible pour le moment.",
						});
					} finally {
						if (mounted) setConnecting(false);
					}
				}
				if (mounted) setLoading(false);
			} catch {
				if (mounted) setLoading(false);
			}
		})();
		return () => {
			mounted = false;
		};
	}, [hydrateCache, refreshAuriga]);

	useFocusEffect(
		useCallback(() => {
			let active = true;
			Promise.all([getManualGrades(), getUseWeightedAverages(), hasAurigaRefreshToken(), getCachedAurigaGrades(), getCachedAurigaSyllabus(), getAurigaLastSync()])
				.then(([manual, weighted, hasToken, cachedGrades, cachedSyllabus, syncDate]) => {
					if (!active) return;
					if (!hasToken && cachedGrades.length === 0 && cachedSyllabus.length === 0 && !syncDate) {
						resetAurigaView();
						return;
					}
					setManualGrades(manual);
					setUseWeightedAveragesState(weighted);
					rebuildPeriods(rawGrades, syllabusList, manual, weighted);
				})
				.catch(() => {});
			return () => {
				active = false;
			};
		}, [rawGrades, rebuildPeriods, resetAurigaView, syllabusList])
	);

	useEffect(() => {
		if (routeParams?.mode) setMode(routeParams.mode);
		if (!routeParams?.syllabusId) return;
		const requestKey = `${routeParams.syllabusId}:${routeParams.syllabusRequestAt ?? "static"}`;
		if (handledSyllabusRequest.current === requestKey) return;
		const syllabus = syllabusList.find((item) => item.id === routeParams.syllabusId);
		if (!syllabus) return;
		handledSyllabusRequest.current = requestKey;
		setMode("syllabus");
		setSearch("");
		setSelectedSemester(syllabus.semester || null);
		setSelectedSyllabus(syllabus);
	}, [routeParams?.mode, routeParams?.syllabusId, routeParams?.syllabusRequestAt, syllabusList]);

	const connectWithAurigaId = async () => {
		setConnecting(true);
		setOffline(false);
		setAurigaStatus({ type: "loading", message: "Connexion à Auriga..." });
		try {
			await loginAurigaWithCredentials(aurigaIdentifier, aurigaPassword);
			await commitAutofillContext();
			if (rememberAurigaCredentials) {
				await saveRememberedAurigaCredentials({ identifier: aurigaIdentifier, password: aurigaPassword });
			} else {
				await clearRememberedAurigaCredentials();
				setAurigaPassword("");
			}
			setConnecting(false);
			await refreshAuriga("login");
		} catch (error) {
			await cancelAutofillContext();
			const message = error instanceof Error ? error.message : "Verifie tes identifiants Auriga.";
			setAurigaStatus({ type: "error", message });
			Alert.alert("Connexion Auriga impossible", error instanceof Error ? error.message : "Verifie tes identifiants Auriga.");
		} finally {
			setConnecting(false);
		}
	};

	const selectedPeriod = useMemo(() => {
		if (selectedSemester === null) return periods[0] || null;
		return periods.find((period) => period.semester === selectedSemester) || periods[0] || null;
	}, [periods, selectedSemester]);

	const noteUes = useMemo(() => {
		const needle = normalizeSearch(search);
		if (!selectedPeriod) return [];
		return selectedPeriod.ues
			.map((ue) => ({
				ue,
				subjects: ue.subjects
					.filter((subject) => !needle || normalizeSearch(`${ue.name} ${ue.id} ${subject.name} ${subject.ueCode}`).includes(needle))
					.sort((a, b) => a.name.localeCompare(b.name, "fr")),
			}))
			.filter((group) => group.subjects.length)
			.sort((a, b) => a.ue.name.localeCompare(b.ue.name, "fr"));
	}, [search, selectedPeriod]);

	const filteredSyllabus = useMemo(() => {
		const needle = normalizeSearch(search);
		return syllabusList
			.filter((syllabus) => selectedSemester === null || syllabus.semester === selectedSemester)
			.filter((syllabus) => !needle || normalizeSearch(`${syllabus.caption?.name || ""} ${syllabus.name} ${syllabus.UE}`).includes(needle))
			.sort((a, b) => (a.caption?.name || a.name).localeCompare(b.caption?.name || b.name, "fr"));
	}, [search, selectedSemester, syllabusList]);

	const groupedSyllabus = useMemo(() => {
		const groups = new Map<string, AurigaSyllabus[]>();
		for (const syllabus of filteredSyllabus) {
			const items = groups.get(syllabus.UE) || [];
			items.push(syllabus);
			groups.set(syllabus.UE, items);
		}
		return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b, "fr"));
	}, [filteredSyllabus]);

	const findSubjectInPeriods = (built: GradesPeriod[], subjectId: string) =>
		flattenSubjects(built.find((period) => period.semester === selectedSemester) || built[0] || null).find((item) => item.subject.id === subjectId)?.subject;

	const updateManualGrades = async (nextManual: ManualGrade[]) => {
		setManualGrades(nextManual);
		return rebuildPeriods(rawGrades, syllabusList, nextManual, useWeightedAverages);
	};

	const disconnectAuriga = () => {
		Alert.alert("Déconnexion Auriga", "Supprimer la session Auriga et les données mises en cache sur cet appareil ?", [
			{ text: "Annuler", style: "cancel" },
			{
				text: "Déconnecter",
				style: "destructive",
				onPress: () =>
					void Promise.all([logoutAuriga(), clearRememberedAurigaCredentials(), clearAurigaCache()]).then(() => {
						resetAurigaView({ clearCredentials: true });
					}),
			},
		]);
	};

	if (loading) {
		return (
			<View style={[s.loading, { backgroundColor: theme.bg }]}>
				<ActivityIndicator color={theme.accent} size="large" />
			</View>
		);
	}

	const contentPaddingBottom = Math.max(insets.bottom + 96, 124);

	if (!connected && periods.length === 0 && syllabusList.length === 0) {
		return (
			<ScrollView style={[s.root, { backgroundColor: theme.bg }]} contentContainerStyle={[s.content, { paddingTop: insets.top + 34, paddingBottom: contentPaddingBottom }]}>
				<AuthHeader />
				<ConnectCard
					connecting={connecting}
					identifier={aurigaIdentifier}
					password={aurigaPassword}
					rememberCredentials={rememberAurigaCredentials}
					status={aurigaStatus}
					syncing={syncingAuriga}
					onChangeIdentifier={setAurigaIdentifier}
					onChangePassword={setAurigaPassword}
					onChangeRememberCredentials={setRememberAurigaCredentials}
					onAurigaId={connectWithAurigaId}
				/>
			</ScrollView>
		);
	}

	return (
		<GradesContent
			addManualGrade={addManualGrade}
			aurigaIdentifier={aurigaIdentifier}
			aurigaPassword={aurigaPassword}
			connectWithAurigaId={connectWithAurigaId}
			connected={connected}
			connecting={connecting}
			buttonRefreshing={buttonRefreshing}
			contentPaddingBottom={contentPaddingBottom}
			deleteManualGrade={deleteManualGrade}
			disconnectAuriga={disconnectAuriga}
			filteredSyllabus={filteredSyllabus}
			findSubjectInPeriods={findSubjectInPeriods}
			groupedSyllabus={groupedSyllabus}
			insets={insets}
			lastSyncLabel={formatLastSync(lastSync)}
			manualGrades={manualGrades}
			mode={mode}
			noteUes={noteUes}
			offline={offline}
			periods={periods}
			refreshAuriga={refreshAuriga}
			refreshing={refreshing}
			rememberAurigaCredentials={rememberAurigaCredentials}
			search={search}
			selectedGrade={selectedGrade}
			selectedPeriod={selectedPeriod}
			selectedSubject={selectedSubject}
			selectedSyllabus={selectedSyllabus}
			setAurigaIdentifier={setAurigaIdentifier}
			setAurigaPassword={setAurigaPassword}
			setRememberAurigaCredentials={setRememberAurigaCredentials}
			status={aurigaStatus}
			setMode={setMode}
			setSearch={setSearch}
			setSelectedGrade={setSelectedGrade}
			setSelectedSemester={setSelectedSemester}
			setSelectedSubject={setSelectedSubject}
			setSelectedSyllabus={setSelectedSyllabus}
			syncingAuriga={syncingAuriga}
			updateManualGrades={updateManualGrades}
			useWeightedAverages={useWeightedAverages}
		/>
	);
}
