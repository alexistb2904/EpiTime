import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, BackHandler, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Animated, { FadeInDown, FadeInLeft, FadeInRight, LinearTransition, ZoomIn, ZoomOut, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Check, CaretLeft, DoorOpen, GraduationCap, SignOut, ArrowCounterClockwise, MagnifyingGlass, ShieldCheck, Users, X } from "phosphor-react-native";
import ActionButton from "../components/ActionButton";
import CourseMarquee, { EASE_OUT, MARQUEE_ROWS } from "../components/CourseMarquee";
import GroupTreeList from "../components/GroupTreeList";
import { Rail } from "../components/calendar/CalendarEvents";
import { FILTER_RESULT_LIMIT, FilterOption, filterStyles, sameId, teacherLabel, toggleSelectionId } from "../components/calendar/CalendarSelectionModals";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { getGroups, getRooms, getTeachers, isAuthReconnectRequiredError } from "../services/api";
import { syncSchedule } from "../services/scheduleRepository";
import { getJSON, setJSON } from "../services/storage";
import { syncCourseWidgets } from "../services/widgets";
import { setAnalyticsConsent, trackEvent, trackScreen } from "../services/analytics";
import { Group, Room, Teacher } from "../types";
import { coursePalette, hashString, hexToRgba, startOfDay } from "../utils/calendar";
import { buildGroupTree, filterGroupTree } from "../utils/groups";
import { normalizeSearchText, searchByKey, sortByLabel } from "../utils/scheduleFilters";

type Props = {
	onDone: () => void;
};

type Step = "intro" | "analytics" | "usage" | "select";
type Kind = "groups" | "teachers" | "rooms";
type Selection = Record<Kind, (string | number)[]>;

const STEPS: Step[] = ["intro", "analytics", "usage", "select"];

// What the three remaining steps ask, in order.
const PLAN = [
	{ title: "Mesure d'audience", text: "Tu acceptes ou tu refuses, en un geste." },
	{ title: "Ce que tu suis", text: "Tes cours, tes enseignements ou des salles." },
	{ title: "Ta sélection", text: "Tes groupes, ton nom ou tes salles, puis ton agenda s'ouvre." },
];

const KINDS: Array<{ key: Kind; icon: typeof Users; title: string; text: string; tab: string; noun: string; search: string; heading: string }> = [
	{
		key: "groups",
		icon: Users,
		title: "Mes cours",
		text: "J'étudie : je choisis ma promo, ma classe, mes TD.",
		tab: "Groupes",
		noun: "groupe",
		search: "Rechercher B2, SRS, ING...",
		heading: "Sélectionne tes groupes",
	},
	{
		key: "teachers",
		icon: GraduationCap,
		title: "Mes enseignements",
		text: "J'enseigne : je retrouve mon nom pour voir mes séances.",
		tab: "Enseignants",
		noun: "enseignant",
		search: "Rechercher un nom",
		heading: "Retrouve ton nom",
	},
	{
		key: "rooms",
		icon: DoorOpen,
		title: "Des salles",
		text: "Je suis l'occupation d'une ou plusieurs salles.",
		tab: "Salles",
		noun: "salle",
		search: "Rechercher une salle",
		heading: "Choisis tes salles",
	},
];

function ProgressSegment({ filled }: { filled: boolean }) {
	const { theme } = useTheme();
	const fill = useSharedValue(filled ? 1 : 0);
	useEffect(() => {
		fill.value = withTiming(filled ? 1 : 0, { duration: 420, easing: EASE_OUT });
	}, [fill, filled]);
	const fillStyle = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));
	return (
		<View style={[s.segment, { backgroundColor: theme.border }]}>
			<Animated.View style={[s.segmentFill, { backgroundColor: theme.accent }, fillStyle]} />
		</View>
	);
}

export default function OnboardingScreen({ onDone }: Props) {
	const { theme } = useTheme();
	const onAccent = theme.onAccent;
	const insets = useSafeAreaInsets();
	const { logout, session, handleAuthExpired } = useAuth();
	const [step, setStep] = useState<Step>("intro");
	const [direction, setDirection] = useState(1);
	const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
	const chipScrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
	const [kinds, setKinds] = useState<Kind[]>([]);
	const [tab, setTab] = useState<Kind>("groups");
	const [groups, setGroups] = useState<Group[]>([]);
	const [rooms, setRooms] = useState<Room[]>([]);
	const [teachers, setTeachers] = useState<Teacher[]>([]);
	const [selection, setSelection] = useState<Selection>({ groups: [], teachers: [], rooms: [] });
	const [searches, setSearches] = useState<Record<Kind, string>>({ groups: "", teachers: "", rooms: "" });
	const [loading, setLoading] = useState(true);
	const [optionsLoading, setOptionsLoading] = useState(false);
	const [saving, setSaving] = useState(false);
	const [consentSaving, setConsentSaving] = useState(false);
	const [error, setError] = useState("");
	const trackedSteps = useRef(new Set<string>());
	const account = session?.account as { id?: string; displayName?: string; userPrincipalName?: string; mail?: string | null } | null | undefined;

	useEffect(() => {
		if (!trackedSteps.current.has("started")) {
			trackedSteps.current.add("started");
			void trackEvent("onboarding_started", { total_steps: STEPS.length });
			void trackScreen("onboarding");
		}
		if (trackedSteps.current.has(step)) return;
		trackedSteps.current.add(step);
		void trackEvent("onboarding_step_viewed", { step, step_index: STEPS.indexOf(step) + 1, total_steps: STEPS.length });
	}, [step]);

	useEffect(() => {
		(async () => {
			setLoading(true);
			try {
				const [allGroups, savedGroups] = await Promise.all([getGroups(), getJSON<(string | number)[]>("selectedGroups", [])]);
				setGroups(allGroups);
				setSelection((current) => ({ ...current, groups: savedGroups }));
				await setJSON("lastGroups", allGroups);
			} catch (err: any) {
				if (isAuthReconnectRequiredError(err)) {
					await handleAuthExpired();
					return;
				}
				setError(err?.message || "Impossible de charger les groupes.");
				setGroups(await getJSON("lastGroups", []));
			} finally {
				setLoading(false);
			}
		})();
	}, [handleAuthExpired]);

	const groupTree = useMemo(() => buildGroupTree(groups), [groups]);
	const filteredGroups = useMemo(() => filterGroupTree(groupTree, searches.groups), [groupTree, searches.groups]);
	const roomKeys = useMemo(() => rooms.map((room) => normalizeSearchText(room.name || "")), [rooms]);
	const teacherKeys = useMemo(() => teachers.map((teacher) => normalizeSearchText(teacherLabel(teacher))), [teachers]);
	const visibleRooms = useMemo(() => searchByKey(rooms, roomKeys, searches.rooms, FILTER_RESULT_LIMIT), [roomKeys, rooms, searches.rooms]);
	const visibleTeachers = useMemo(() => searchByKey(teachers, teacherKeys, searches.teachers, FILTER_RESULT_LIMIT), [teacherKeys, teachers, searches.teachers]);

	const chosenKinds = KINDS.filter((kind) => kinds.includes(kind.key));
	const activeKind = KINDS.find((kind) => kind.key === tab)!;
	const stepIndex = STEPS.indexOf(step);
	const firstName = account?.displayName?.trim().split(/\s+/)[0];
	const labels = useMemo(
		() => ({
			groups: new Map(groups.map((group) => [String(group.id), group.name])),
			rooms: new Map(rooms.map((room) => [String(room.id), room.name || `Salle #${room.id}`])),
			teachers: new Map(teachers.map((teacher) => [String(teacher.id), teacherLabel(teacher)])),
		}),
		[groups, rooms, teachers]
	);
	const chips = chosenKinds.flatMap((kind) =>
		selection[kind.key].map((id) => ({ key: `${kind.key}-${id}`, kind: kind.key, id, label: labels[kind.key].get(String(id)) || `${kind.tab} #${id}` }))
	);
	const totalSelected = chips.length;

	const go = (next: Step) => {
		setDirection(STEPS.indexOf(next) > stepIndex ? 1 : -1);
		setStep(next);
		scrollRef.current?.scrollTo({ y: 0, animated: false });
	};

	// System Back walks the steps backwards; on the first one it leaves the app as usual.
	useEffect(() => {
		const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
			if (stepIndex === 0) return false;
			if (!saving && !consentSaving) go(STEPS[stepIndex - 1]);
			return true;
		});
		return () => subscription.remove();
	});

	const setSearch = (value: string) => setSearches((current) => ({ ...current, [tab]: value }));
	const toggle = (kind: Kind, id: string | number) => setSelection((current) => ({ ...current, [kind]: toggleSelectionId(current[kind], id) }));
	const toggleKind = (kind: Kind) => setKinds((current) => (current.includes(kind) ? current.filter((item) => item !== kind) : [...current, kind]));

	const loadOptions = async (needed: Kind[]) => {
		const loadRooms = needed.includes("rooms") && !rooms.length;
		const loadTeachers = needed.includes("teachers") && !teachers.length;
		if (!loadRooms && !loadTeachers) return;
		setOptionsLoading(true);
		try {
			const [roomItems, teacherItems] = await Promise.all([loadRooms ? getRooms() : null, loadTeachers ? getTeachers() : null]);
			if (roomItems) setRooms(sortByLabel(roomItems, (room) => room.name || ""));
			if (teacherItems) {
				const sorted = sortByLabel(teacherItems, teacherLabel);
				setTeachers(sorted);
				// A teacher signing in usually wants themselves: pre-search their Microsoft name when it matches someone.
				const name = account?.displayName?.trim();
				const keys = sorted.map((teacher) => normalizeSearchText(teacherLabel(teacher)));
				if (name && searchByKey(sorted, keys, name, 1).length) setSearches((current) => (current.teachers ? current : { ...current, teachers: name }));
			}
		} catch (err: any) {
			if (isAuthReconnectRequiredError(err)) await handleAuthExpired();
		} finally {
			setOptionsLoading(false);
		}
	};

	const goToSelection = () => {
		const ordered = KINDS.map((kind) => kind.key).filter((key) => kinds.includes(key));
		setTab(ordered[0]);
		setError("");
		go("select");
		void loadOptions(ordered);
	};

	const finish = async () => {
		if (!totalSelected) {
			setError("Sélectionne au moins un élément pour afficher ton agenda.");
			return;
		}
		const filters = {
			groups: kinds.includes("groups") ? selection.groups : [],
			rooms: kinds.includes("rooms") ? selection.rooms : [],
			teachers: kinds.includes("teachers") ? selection.teachers : [],
		};
		setSaving(true);
		setError("");
		try {
			await Promise.all([setJSON("selectedGroups", filters.groups), setJSON("selectedRooms", filters.rooms), setJSON("selectedTeachers", filters.teachers)]);
			await setJSON("onboardingCompleted", true);
			const start = startOfDay(new Date());
			const end = new Date(start);
			end.setDate(end.getDate() + 30);
			const schedule = await syncSchedule({ start, end, query: filters });
			await syncCourseWidgets(schedule.visibleEvents);
			await trackEvent("onboarding_completed", { total_steps: STEPS.length, follows: kinds.slice().sort().join(",") });
			onDone();
		} catch (err: any) {
			if (isAuthReconnectRequiredError(err)) {
				await handleAuthExpired();
				return;
			}
			setError(err?.message || "La configuration n'a pas pu être terminée.");
		} finally {
			setSaving(false);
		}
	};

	const chooseAnalyticsConsent = async (accepted: boolean) => {
		setConsentSaving(true);
		await setAnalyticsConsent(accepted, account?.id);
		if (accepted) await trackEvent("analytics_consent_accepted", { source: "onboarding" });
		setConsentSaving(false);
		go("usage");
	};

	const renderStatus = (text: string, action?: { label: string; onPress: () => void }) => (
		<View style={filterStyles.status}>
			<Text style={[filterStyles.statusText, { color: theme.muted }]}>{text}</Text>
			{action ? (
				<Pressable style={[filterStyles.statusAction, { borderColor: theme.border }]} onPress={action.onPress}>
					<ArrowCounterClockwise color={theme.text} size={15} />
					<Text style={[filterStyles.statusActionText, { color: theme.text }]}>{action.label}</Text>
				</Pressable>
			) : null}
		</View>
	);

	const renderOptions = () => {
		if (tab === "groups") {
			return (
				<>
					{loading ? <ActivityIndicator color={theme.accent} /> : null}
					{!loading && !filteredGroups.length
						? renderStatus(searches.groups.trim() ? `Aucun groupe pour « ${searches.groups.trim()} ».` : "Aucun groupe disponible.")
						: null}
					<GroupTreeList groups={filteredGroups} selected={selection.groups} onToggle={(id) => toggle("groups", id)} searchActive={Boolean(searches.groups.trim())} />
				</>
			);
		}
		const source = tab === "rooms" ? rooms : teachers;
		const items = tab === "rooms" ? visibleRooms : visibleTeachers;
		const query = searches[tab].trim();
		if (!source.length) {
			return optionsLoading ? (
				<View style={filterStyles.status}>
					<ActivityIndicator color={theme.accent} />
					<Text style={[filterStyles.statusText, { color: theme.muted }]}>Chargement des {activeKind.noun}s…</Text>
				</View>
			) : (
				renderStatus(`Impossible de charger les ${activeKind.noun}s.`, { label: "Réessayer", onPress: () => void loadOptions([tab]) })
			);
		}
		if (!items.length) return renderStatus(`Aucun ${activeKind.noun} pour « ${query} ».`);
		return (
			<View style={s.optionList}>
				{tab === "rooms"
					? visibleRooms.map((room) => (
							<FilterOption key={String(room.id)} label={room.name || `Salle #${room.id}`} selected={selection.rooms.some((id) => sameId(id, room.id))} onPress={() => toggle("rooms", room.id)} />
						))
					: visibleTeachers.map((teacher) => (
							<FilterOption key={String(teacher.id)} label={teacherLabel(teacher)} selected={selection.teachers.some((id) => sameId(id, teacher.id))} onPress={() => toggle("teachers", teacher.id)} />
						))}
				{items.length >= FILTER_RESULT_LIMIT ? (
					<Text style={[filterStyles.limitNote, { color: theme.muted }]}>
						{FILTER_RESULT_LIMIT} premiers résultats sur {source.length}. Précise ta recherche pour trouver les autres.
					</Text>
				) : null}
			</View>
		);
	};

	return (
		<View style={[s.root, { backgroundColor: theme.bg }]}>
			<View style={[s.header, { paddingTop: insets.top + 8 }]}>
				<View style={s.headerRow}>
					{stepIndex ? (
						<Pressable
							style={({ pressed }) => [s.tool, { backgroundColor: pressed ? theme.surface : "transparent" }]}
							onPress={() => go(STEPS[stepIndex - 1])}
							disabled={saving || consentSaving}
							accessibilityRole="button"
							accessibilityLabel="Étape précédente">
							<CaretLeft color={theme.text} size={22} weight="bold" />
						</Pressable>
					) : (
						<Image source={require("../../assets/logo.png")} style={s.logo} resizeMode="contain" accessibilityIgnoresInvertColors />
					)}
					<Text style={[s.stepLabel, { color: theme.muted }]}>
						Étape {stepIndex + 1} sur {STEPS.length}
					</Text>
					<Pressable
						style={({ pressed }) => [s.tool, { backgroundColor: pressed ? theme.surface : "transparent" }]}
						onPress={logout}
						accessibilityRole="button"
						accessibilityLabel="Se déconnecter">
						<SignOut color={theme.muted} size={20} />
					</Pressable>
				</View>
				<View style={s.progress} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: STEPS.length, now: stepIndex + 1 }}>
					{STEPS.map((item, index) => (
						<ProgressSegment key={item} filled={index <= stepIndex} />
					))}
				</View>
			</View>

			<ScrollView ref={scrollRef} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
				<Animated.View key={step} entering={(direction > 0 ? FadeInRight : FadeInLeft).duration(340).easing(EASE_OUT)} style={s.stack}>
					{step === "intro" ? (
						<>
							<View style={s.marquee}>
								<CourseMarquee rows={MARQUEE_ROWS.slice(0, 2)} compact />
							</View>
							<Text style={[s.title, { color: theme.text }]} accessibilityRole="header">
								{firstName ? `Salut ${firstName}, on prépare ton agenda.` : "On prépare ton agenda."}
							</Text>
							<Text style={[s.body, { color: theme.muted }]}>
								Dis une fois ce que tu suis : tes groupes, tes enseignements ou des salles. EpiTime prépare ensuite l'agenda, les rappels et les widgets.
							</Text>
							<View style={s.plan}>
								{PLAN.map((item, index) => (
									<Animated.View key={item.title} entering={FadeInDown.delay(140 + index * 70).duration(380).easing(EASE_OUT)} style={s.planRow}>
										<Rail fill={0} head="center" first={index === 0} last={index === PLAN.length - 1} />
										<View style={s.planCopy}>
											<Text style={[s.optionTitle, { color: theme.text }]}>{item.title}</Text>
											<Text style={[s.optionText, { color: theme.muted }]}>{item.text}</Text>
										</View>
									</Animated.View>
								))}
							</View>
						</>
					) : step === "analytics" ? (
						<>
							<View style={[s.badge, { backgroundColor: theme.accentSoft }]}>
								<ShieldCheck color={theme.accent} size={26} />
							</View>
							<Text style={[s.title, { color: theme.text }]} accessibilityRole="header">
								Mesure d’audience anonyme
							</Text>
							<Text style={[s.body, { color: theme.muted }]}>
								EpiTime peut envoyer des événements techniques limités à un analytics auto-hébergé pour améliorer l’application.
							</Text>
							<Text style={[s.body, { color: theme.muted }]}>
								Aucun nom, e-mail, identifiant de compte, token, cours ou contenu de note n’est envoyé. Tu peux modifier ce choix à tout moment dans les réglages.
							</Text>
						</>
					) : step === "usage" ? (
						<>
							<Text style={[s.title, { color: theme.text }]} accessibilityRole="header">
								Que veux-tu suivre ?
							</Text>
							<Text style={[s.body, { color: theme.muted }]}>Coche tout ce qui te concerne. Tu pourras changer ça depuis l'agenda.</Text>
							<View style={s.options}>
								{KINDS.map((kind, index) => {
									const Icon = kind.icon;
									const checked = kinds.includes(kind.key);
									return (
										<Animated.View key={kind.key} entering={FadeInDown.delay(80 + index * 70).duration(380).easing(EASE_OUT)}>
											<Pressable
												onPress={() => toggleKind(kind.key)}
												accessibilityRole="checkbox"
												accessibilityState={{ checked }}
												accessibilityLabel={`${kind.title}. ${kind.text}`}
												style={({ pressed }) => [
													s.option,
													{ backgroundColor: checked ? theme.accentSoft : theme.surface, borderColor: checked ? theme.accent : theme.border, opacity: pressed ? 0.86 : 1 },
												]}>
												<View style={[s.optionIcon, { backgroundColor: checked ? theme.accent : theme.accentSoft }]}>
													<Icon color={checked ? onAccent : theme.accent} size={22} weight={checked ? "fill" : "regular"} />
												</View>
												<View style={s.optionCopy}>
													<Text style={[s.optionTitle, { color: theme.text }]}>{kind.title}</Text>
													<Text style={[s.optionText, { color: theme.muted }]}>{kind.text}</Text>
												</View>
												<View style={[s.check, { backgroundColor: checked ? theme.accent : "transparent", borderColor: checked ? theme.accent : theme.border }]}>
													{checked ? (
														<Animated.View entering={ZoomIn.duration(180)}>
															<Check color={onAccent} size={15} weight="bold" />
														</Animated.View>
													) : null}
												</View>
											</Pressable>
										</Animated.View>
									);
								})}
							</View>
						</>
					) : (
						<>
							<Text style={[s.title, { color: theme.text }]} accessibilityRole="header">
								{chosenKinds.length > 1 ? "Fais ta sélection" : activeKind.heading}
							</Text>

							{chosenKinds.length > 1 ? (
								<View style={[filterStyles.tabs, s.tabs, { backgroundColor: theme.surface, borderColor: theme.border }]} accessibilityRole="tablist">
									{chosenKinds.map((kind) => {
										const active = kind.key === tab;
										const count = selection[kind.key].length;
										return (
											<Pressable
												key={kind.key}
												style={[filterStyles.tab, active && { backgroundColor: theme.accent }]}
												onPress={() => setTab(kind.key)}
												accessibilityRole="tab"
												accessibilityState={{ selected: active }}
												accessibilityLabel={count ? `${kind.tab}, ${count} sélectionné${count > 1 ? "s" : ""}` : kind.tab}>
												<Text style={[filterStyles.tabText, { color: active ? onAccent : theme.muted }]} numberOfLines={1}>
													{kind.tab}
												</Text>
												{count ? <Text style={[filterStyles.tabCount, { color: active ? onAccent : theme.accent }]}>{count}</Text> : null}
											</Pressable>
										);
									})}
								</View>
							) : null}

							<View style={[s.searchBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
								<MagnifyingGlass color={theme.muted} size={18} />
								<TextInput
									value={searches[tab]}
									onChangeText={setSearch}
									placeholder={activeKind.search}
									placeholderTextColor={theme.muted}
									selectionColor={theme.accent}
									autoCorrect={false}
									returnKeyType="search"
									style={[s.searchInput, { color: theme.text }]}
								/>
								{searches[tab] ? (
									<Pressable onPress={() => setSearch("")} hitSlop={12} accessibilityRole="button" accessibilityLabel="Effacer la recherche">
										<X color={theme.muted} size={18} />
									</Pressable>
								) : null}
							</View>

							{error ? <Text style={[s.error, { color: theme.danger }]}>{error}</Text> : null}
							{renderOptions()}
						</>
					)}
				</Animated.View>
			</ScrollView>

			<View style={[s.footer, { backgroundColor: theme.bg, borderTopColor: theme.border, paddingBottom: Math.max(insets.bottom, 14) }]}>
				{step === "select" && chips.length ? (
					// The picks line up as course-coloured chips, the way they will colour the agenda.
					<ScrollView
						ref={chipScrollRef}
						horizontal
						showsHorizontalScrollIndicator={false}
						style={s.chipScroll}
						contentContainerStyle={filterStyles.chips}
						keyboardShouldPersistTaps="handled"
						onContentSizeChange={() => chipScrollRef.current?.scrollToEnd({ animated: true })}>
						{chips.map((chip) => {
							const color = coursePalette[hashString(chip.label) % coursePalette.length];
							return (
								<Animated.View key={chip.key} entering={ZoomIn.duration(240).easing(EASE_OUT)} exiting={ZoomOut.duration(140)} layout={LinearTransition.duration(220)}>
									<Pressable
										style={[filterStyles.chip, { backgroundColor: hexToRgba(color, theme.mode === "dark" ? 0.2 : 0.12) }]}
										onPress={() => toggle(chip.kind, chip.id)}
										hitSlop={{ top: 6, bottom: 6 }}
										accessibilityRole="button"
										accessibilityLabel={`Retirer ${chip.label}`}>
										<View style={[s.chipDot, { backgroundColor: color }]} />
										<Text style={[filterStyles.chipText, { color: theme.text }]} numberOfLines={1}>
											{chip.label}
										</Text>
										<X color={theme.muted} size={14} />
									</Pressable>
								</Animated.View>
							);
						})}
					</ScrollView>
				) : null}
				{step === "intro" ? (
					<ActionButton label="Commencer" onPress={() => go("analytics")} />
				) : step === "analytics" ? (
					<>
						<ActionButton label="Autoriser la mesure" icon={Check} onPress={() => void chooseAnalyticsConsent(true)} disabled={consentSaving} />
						<ActionButton variant="secondary" label="Continuer sans autoriser" onPress={() => void chooseAnalyticsConsent(false)} disabled={consentSaving} />
					</>
				) : step === "usage" ? (
					<ActionButton label={kinds.length ? "Continuer" : "Coche au moins un choix"} onPress={goToSelection} disabled={!kinds.length} />
				) : (
					<ActionButton
						label={
							saving
								? "Préparation de ton agenda…"
								: totalSelected
									? "Ouvrir mon agenda"
									: `Choisis au moins ${tab === "teachers" ? "un enseignant" : tab === "rooms" ? "une salle" : "un groupe"}`
						}
						icon={totalSelected ? Check : undefined}
						onPress={finish}
						disabled={!totalSelected}
						busy={saving}
					/>
				)}
			</View>
		</View>
	);
}

const s = StyleSheet.create({
	root: { flex: 1 },
	header: { paddingHorizontal: 20, paddingBottom: 12, gap: 10 },
	headerRow: { flexDirection: "row", alignItems: "center", marginHorizontal: -8 },
	logo: { width: 48, height: 48 },
	tool: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
	stepLabel: { flex: 1, marginLeft: 6, fontSize: 14, fontWeight: "800", fontVariant: ["tabular-nums"] },
	progress: { flexDirection: "row", gap: 6 },
	segment: { flex: 1, height: 4, borderRadius: 2, overflow: "hidden" },
	segmentFill: { height: "100%", borderRadius: 2 },
	content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 28 },
	stack: { gap: 12 },
	marquee: { marginHorizontal: -20, marginBottom: 16, overflow: "hidden" },
	badge: { width: 52, height: 52, borderRadius: 18, alignItems: "center", justifyContent: "center", marginBottom: 4 },
	title: { fontSize: 30, fontWeight: "900", letterSpacing: -0.4, lineHeight: 36 },
	body: { fontSize: 16, lineHeight: 23 },
	plan: { marginTop: 12 },
	planRow: { flexDirection: "row", minHeight: 72 },
	planCopy: { flex: 1, justifyContent: "center", paddingVertical: 10, paddingLeft: 6 },
	options: { gap: 10, marginTop: 8 },
	option: { flexDirection: "row", alignItems: "center", gap: 13, borderWidth: 1, borderRadius: 22, padding: 16 },
	optionIcon: { width: 46, height: 46, borderRadius: 15, alignItems: "center", justifyContent: "center" },
	optionCopy: { flex: 1 },
	optionTitle: { fontSize: 16, fontWeight: "900" },
	optionText: { marginTop: 3, fontSize: 14, lineHeight: 19 },
	check: { width: 24, height: 24, borderRadius: 7, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
	tabs: { marginHorizontal: 0, marginTop: 0 },
	searchBox: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 8 },
	searchInput: { flex: 1, minHeight: 48, fontSize: 16 },
	optionList: { gap: 8 },
	error: { fontWeight: "800" },
	footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 20, paddingTop: 12, gap: 10 },
	chipScroll: { flexGrow: 0, marginHorizontal: -20, paddingHorizontal: 20 },
	chipDot: { width: 8, height: 8, borderRadius: 4 },
});
