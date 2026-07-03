import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, AppState, Image, Linking, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import Animated, { FadeInDown, FadeInUp, Layout } from "react-native-reanimated";
import {
	BellElectric,
	BellRing,
	BookOpenCheck,
	CalendarClock,
	CalendarDays,
	CheckCircle2,
	ChevronRight,
	Clock3,
	GraduationCap,
	ListChecks,
	MapPin,
	Plus,
	RefreshCw,
	Route,
	Sparkles,
	TrendingUp,
	WifiOff,
	X,
} from "lucide-react-native";
import DatePickerModal from "../components/DatePickerModal";
import { useTheme } from "../context/ThemeContext";
import { getGroups } from "../services/api";
import { getCachedAurigaGrades, getCachedAurigaSyllabus } from "../services/aurigaCache";
import { rescheduleCourseNoteReminders } from "../services/courseNotes";
import { getUseWeightedAverages } from "../services/gradePreferences";
import { buildGradesPeriods } from "../services/gradesService";
import { addManualEvent, isEventCancelled, isEventIgnored } from "../services/localEvents";
import { getManualGrades } from "../services/manualGrades";
import { syncLiveCourseNotification } from "../services/liveCourse";
import { getNotificationSettings, notifyEventChanges, scheduleLocalCourseNotifications } from "../services/notifications";
import { readCachedSchedule, syncSchedule } from "../services/scheduleRepository";
import { getJSON, setJSON } from "../services/storage";
import { EventChange } from "../services/eventsCache";
import { syncCourseWidgets } from "../services/widgets";
import { Group, ZeusEvent } from "../types";
import { eventOverlapsDay, formatDateRange, getEventTitle, getRoomName, startOfDay, getCourseColor } from "../utils/calendar";

type HomeTab = "today" | "next";

type UsefulLink = {
	title: string;
	description: string;
	url: string;
	accent: string;
	badge: string;
	image: number;
};

const usefulLinks: UsefulLink[] = [
	{
		title: "Moodle",
		description: "Plateforme d'enseignement et accès aux cours.",
		url: "https://moodle.epita.fr",
		accent: "#6f7cff",
		badge: "Cours",
		image: require("../../assets/moodle_logo_small.png"),
	},
	{
		title: "CRI",
		description: "Portail Forge avec raccourcis utiles et services EPITA.",
		url: "https://cri.epita.fr",
		accent: "#4bc3a7",
		badge: "Hub",
		image: require("../../assets/cri.png"),
	},
	{
		title: "Auriga",
		description: "Centre administratif : infos perso, syllabus et notes.",
		url: "https://auriga.epita.fr",
		accent: "#f0a94a",
		badge: "Admin",
		image: require("../../assets/logo_auriga_main_menu.png"),
	},
	{
		title: "Maps",
		description: "Plans du campus pour retrouver rapidement les lieux.",
		url: "https://maps.forge.epita.fr",
		accent: "#ff6b81",
		badge: "Campus",
		image: require("../../assets/maps.png"),
	},
	{
		title: "Intranet",
		description: "Portail Forge pour accéder aux outils internes et pratiques.",
		url: "https://intra.forge.epita.fr",
		accent: "#8f7cff",
		badge: "Forge",
		image: require("../../assets/cri.png"),
	},
];

const minute = 60_000;
const day = 86_400_000;

const formatTime = (date: Date) => date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

const formatInputDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const parseLocalDateTime = (dateValue: string, timeValue: string) => {
	const dateMatch = dateValue.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
	const timeMatch = timeValue.trim().match(/^(\d{1,2}):(\d{2})$/);
	if (!dateMatch || !timeMatch) return null;
	const year = Number(dateMatch[1]);
	const month = Number(dateMatch[2]) - 1;
	const dayValue = Number(dateMatch[3]);
	const hour = Number(timeMatch[1]);
	const minuteValue = Number(timeMatch[2]);
	const date = new Date(year, month, dayValue, hour, minuteValue, 0, 0);
	if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== dayValue || date.getHours() !== hour || date.getMinutes() !== minuteValue) return null;
	return date;
};

const parseInputDate = (dateValue: string) => {
	const dateMatch = dateValue.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (!dateMatch) return null;
	const year = Number(dateMatch[1]);
	const month = Number(dateMatch[2]) - 1;
	const dayValue = Number(dateMatch[3]);
	const date = new Date(year, month, dayValue, 0, 0, 0, 0);
	if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== dayValue) return null;
	return date;
};

const formatDuration = (ms: number) => {
	const totalMinutes = Math.max(0, Math.round(ms / minute));
	if (totalMinutes < 60) return `${totalMinutes} min`;
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	return minutes ? `${hours} h ${minutes}` : `${hours} h`;
};

const formatDurationHumanLong = (ms: number) => {
	const totalMinutes = Math.max(0, Math.round(ms / minute));
	if (totalMinutes < 60) return `${totalMinutes} min${totalMinutes > 1 ? "s" : ""}`;
	const hours = Math.floor(totalMinutes / 60);
	if (hours < 24) {
		const minutes = totalMinutes % 60;
		return minutes ? `${hours} h ${minutes} min` : `${hours} h`;
	}
	return `${Math.floor(totalMinutes / 1440)} jour${Math.floor(totalMinutes / 1440) > 1 ? "s" : ""}`;
};

const relativeDayOffset = (date: Date, reference: Date) => Math.round((startOfDay(date).getTime() - startOfDay(reference).getTime()) / day);

const formatShortDay = (date: Date) => date.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });

const formatUntilSuffix = (date: Date, reference: Date) => {
	const offset = relativeDayOffset(date, reference);
	if (offset === 0) return `à ${formatTime(date)}`;
	if (offset === 1) return `à demain ${formatTime(date)}`;
	return `au ${formatShortDay(date)} à ${formatTime(date)}`;
};

const formatEndSuffix = (date: Date, reference: Date) => {
	const offset = relativeDayOffset(date, reference);
	if (offset === 0) return `à ${formatTime(date)}`;
	if (offset === 1) return `demain à ${formatTime(date)}`;
	return `le ${formatShortDay(date)} à ${formatTime(date)}`;
};

const formatStartLabel = (date: Date, reference: Date) => {
	const offset = relativeDayOffset(date, reference);
	if (offset === 0) return `Aujourd'hui à ${formatTime(date)}`;
	if (offset === 1) return `Demain à ${formatTime(date)}`;
	return `${formatShortDay(date)} à ${formatTime(date)}`;
};

const greetingFor = (date: Date) => {
	const hour = date.getHours();
	if (hour < 5) return "Réveille-toi, il est tard !";
	if (hour < 12) return "Bonjour";
	if (hour < 18) return "Bon après-midi";
	return "Bonsoir";
};

const formatAverage = (score?: { value: number; outOf?: number; status?: string }) => {
	if (!score) return "-";
	if (score.status) return score.status;
	return score.outOf ? score.value.toFixed(2) : "-";
};

export default function HomeScreen() {
	const { theme } = useTheme();
	const navigation = useNavigation<any>();
	const [events, setEvents] = useState<ZeusEvent[]>([]);
	const [groups, setGroups] = useState<Group[]>([]);
	const [selectedGroups, setSelectedGroups] = useState<(string | number)[]>([]);
	const [refreshing, setRefreshing] = useState(false);
	const [usingCache, setUsingCache] = useState(false);
	const [eventChanges, setEventChanges] = useState<EventChange[]>([]);
	const [homeTab, setHomeTab] = useState<HomeTab>("today");
	const [showManualEvent, setShowManualEvent] = useState(false);
	const [manualTitle, setManualTitle] = useState("");
	const [manualDate, setManualDate] = useState(formatInputDate(new Date()));
	const [manualStart, setManualStart] = useState("09:00");
	const [manualEnd, setManualEnd] = useState("10:00");
	const [manualRoom, setManualRoom] = useState("");
	const [savingManual, setSavingManual] = useState(false);
	const [aurigaAverage, setAurigaAverage] = useState("-");
	const [nowMs, setNowMs] = useState(Date.now());
	const refreshingRef = useRef(false);

	const refresh = useCallback(async () => {
		if (refreshingRef.current) return;
		refreshingRef.current = true;
		setRefreshing(true);
		const start = startOfDay(new Date());
		const end = new Date(start);
		end.setDate(end.getDate() + 30);
		let ids: (string | number)[] = [];
		try {
			ids = await getJSON<(string | number)[]>("selectedGroups", []);
			setSelectedGroups(ids);

			const cachedGroups = await getJSON<Group[]>("lastGroups", []);
			if (cachedGroups.length) setGroups(cachedGroups);

			try {
				const allGroups = await getGroups();
				setGroups(allGroups);
				await setJSON("lastGroups", allGroups);
			} catch {
				if (!cachedGroups.length) setGroups([]);
			}

			if (ids.length > 0) {
				const query = { groups: ids };
				const notificationSettings = await getNotificationSettings();
				const result = await syncSchedule({
					start,
					end,
					query,
					changeDetectionWindowDays: notificationSettings.changeDetectionWindowDays,
					onCached: async (cached) => {
						setEvents(cached.visibleEvents);
						await syncCourseWidgets(cached.visibleEvents);
						await rescheduleCourseNoteReminders(cached.visibleEvents);
					},
				});

				setEvents(result.visibleEvents);
				await syncCourseWidgets(result.visibleEvents);
				await rescheduleCourseNoteReminders(result.visibleEvents);
				if (result.source === "network" && (result.changed || !result.exactCacheHit)) {
					if (result.changes.length) {
						setEventChanges(result.changes);
						if (notificationSettings.changeDetectionEnabled) await notifyEventChanges(result.changes, notificationSettings.notificationType);
					}
					if (notificationSettings.enabled) {
						await scheduleLocalCourseNotifications(
							result.activeEvents,
							notificationSettings.minutesBefore,
							notificationSettings.selectedDays,
							notificationSettings.notificationType
						);
					}
				}
				setUsingCache(result.source === "cache");
			} else {
				const result = await syncSchedule({ start, end, query: {} });
				setEvents(result.visibleEvents);
				await syncCourseWidgets(result.visibleEvents);
				await rescheduleCourseNoteReminders(result.visibleEvents);
				setUsingCache(false);
			}
		} catch {
			const fallback = ids.length ? await readCachedSchedule(start, end, { groups: ids }, true) : await syncSchedule({ start, end, query: {} });
			setEvents(fallback.visibleEvents);
			setGroups(await getJSON("lastGroups", []));
			await syncCourseWidgets(fallback.visibleEvents);
			await rescheduleCourseNoteReminders(fallback.visibleEvents);
			setUsingCache(true);
		} finally {
			refreshingRef.current = false;
			setRefreshing(false);
		}
	}, []);

	useEffect(() => {
		refresh();
	}, [refresh]);

	const loadAurigaAverage = useCallback(async () => {
		try {
			const [grades, syllabus, manual, weighted] = await Promise.all([getCachedAurigaGrades(), getCachedAurigaSyllabus(), getManualGrades(), getUseWeightedAverages()]);
			const periods = buildGradesPeriods(grades, syllabus, { manualGrades: manual, useWeightedAverages: weighted });
			const latest = periods.reduce((candidate, period) => (!candidate || period.semester > candidate.semester ? period : candidate), periods[0] || null);
			setAurigaAverage(formatAverage(latest?.overallAverage));
		} catch {
			setAurigaAverage("-");
		}
	}, []);

	useEffect(() => {
		void loadAurigaAverage();
	}, [loadAurigaAverage]);

	useEffect(() => {
		if (!usingCache) return;
		const retryOnlineSync = () => refresh();
		const timer = setInterval(retryOnlineSync, 20_000);
		const subscription = AppState.addEventListener("change", (state) => {
			if (state === "active") retryOnlineSync();
		});
		return () => {
			clearInterval(timer);
			subscription.remove();
		};
	}, [refresh, usingCache]);

	useEffect(() => {
		if (usingCache) refresh();
	}, [refresh, usingCache]);

	useFocusEffect(
		useCallback(() => {
			void loadAurigaAverage();
			const timer = setInterval(refresh, minute);
			return () => clearInterval(timer);
		}, [loadAurigaAverage, refresh])
	);

	useEffect(() => {
		const updateClock = () => setNowMs(Date.now());
		updateClock();
		const timer = setInterval(updateClock, 30_000);
		const subscription = AppState.addEventListener("change", (state) => {
			if (state === "active") updateClock();
		});
		return () => {
			clearInterval(timer);
			subscription.remove();
		};
	}, []);
	useFocusEffect(
		useCallback(() => {
			let active = true;
			setNowMs(Date.now());
			const start = startOfDay(new Date());
			const end = new Date(start);
			end.setDate(end.getDate() + 30);
			getJSON<(string | number)[]>("selectedGroups", [])
				.then(async (ids) => {
					const cached = ids.length ? await readCachedSchedule(start, end, { groups: ids }, false) : await syncSchedule({ start, end, query: {} });
					return cached.visibleEvents;
				})
				.then((mergedEvents) => {
					if (active) setEvents(mergedEvents);
				})
				.catch(() => {});
			return () => {
				active = false;
			};
		}, [])
	);

	const now = useMemo(() => new Date(nowMs), [nowMs]);
	const sorted = useMemo(() => [...events].sort((a, b) => +new Date(a.startDate) - +new Date(b.startDate)), [events]);
	const activeScheduleEvents = useMemo(() => sorted.filter((event) => !isEventCancelled(event) && !isEventIgnored(event)), [sorted]);
	useEffect(() => {
		syncLiveCourseNotification(activeScheduleEvents, Date.now()).catch(() => {});
		const timer = setInterval(() => syncLiveCourseNotification(activeScheduleEvents, Date.now()).catch(() => {}), minute);
		return () => clearInterval(timer);
	}, [activeScheduleEvents]);
	useEffect(() => {
		const nextBoundary = activeScheduleEvents
			.flatMap((event) => [new Date(event.startDate).getTime(), new Date(event.endDate).getTime()])
			.filter((time) => Number.isFinite(time) && time > nowMs)
			.sort((a, b) => a - b)[0];
		if (!nextBoundary) return;
		const timer = setTimeout(() => setNowMs(Date.now()), Math.min(nextBoundary - nowMs + 250, 2_147_483_647));
		return () => clearTimeout(timer);
	}, [activeScheduleEvents, nowMs]);
	const todayEvents = useMemo(() => sorted.filter((event) => eventOverlapsDay(event, now)), [now, sorted]);
	const upcomingEvents = useMemo(() => sorted.filter((event) => new Date(event.endDate).getTime() > nowMs).slice(0, 8), [nowMs, sorted]);
	const currentEvent = activeScheduleEvents.find((event) => new Date(event.startDate).getTime() <= nowMs && new Date(event.endDate).getTime() > nowMs);
	const nextEvent = currentEvent || activeScheduleEvents.find((event) => new Date(event.startDate).getTime() > nowMs);
	const visibleEvents = homeTab === "today" ? todayEvents : upcomingEvents;
	const selectedLabels = selectedGroups.map((id) => groups.find((group) => group.id === id)?.name || String(id));
	const nextStart = nextEvent ? new Date(nextEvent.startDate) : null;
	const nextEnd = nextEvent ? new Date(nextEvent.endDate) : null;
	const isLive = Boolean(currentEvent && nextEvent?.idReservation === currentEvent.idReservation && nextEvent?.startDate === currentEvent.startDate);
	const nextRooms = nextEvent?.rooms?.map(getRoomName).filter(Boolean).join(", ");
	const progress = currentEvent
		? Math.min(
				100,
				Math.max(
					4,
					((nowMs - new Date(currentEvent.startDate).getTime()) /
						Math.max(minute, new Date(currentEvent.endDate).getTime() - new Date(currentEvent.startDate).getTime())) *
						100
				)
			)
		: 0;
	const todayActiveCount = todayEvents.filter((event) => !isEventCancelled(event) && !isEventIgnored(event)).length;
	const weekCount = activeScheduleEvents.filter((event) => {
		const start = new Date(event.startDate).getTime();
		return start >= startOfDay(now).getTime() && start < startOfDay(now).getTime() + 7 * day;
	}).length;
	const showCacheBanner = usingCache;
	const statusLabel = usingCache ? "Mémoire locale" : selectedGroups.length ? "Synchronisé" : "Groupes à choisir";
	const nextKicker = !nextEvent ? "Planning libre" : isLive ? "En cours" : `Dans ${formatDurationHumanLong(nextStart!.getTime() - nowMs)}`;
	const freeLabel = currentEvent
		? `Fin ${formatEndSuffix(new Date(currentEvent.endDate), now)}`
		: nextStart
			? `Libre jusqu'${formatUntilSuffix(nextStart, now)}`
			: "Aucune contrainte à venir";
	const firstToday = todayEvents[0] ? new Date(todayEvents[0].startDate) : null;
	const lastToday = todayEvents.length ? new Date(todayEvents[todayEvents.length - 1].endDate) : null;
	const dayRange = firstToday && lastToday ? `${formatTime(firstToday)} - ${formatTime(lastToday)}` : "Aucun cours";
	const dayIntensity = todayActiveCount === 0 ? "Journée libre" : todayActiveCount <= 3 ? "Journée légère" : todayActiveCount <= 6 ? "Journée normale" : "Journée chargée";
	const upcomingActiveEvents = upcomingEvents.filter((event) => !isEventCancelled(event) && !isEventIgnored(event));
	const nextTimelineEvent = upcomingActiveEvents[0] || upcomingEvents[0] || null;
	const nextTimelineStart = nextTimelineEvent ? new Date(nextTimelineEvent.startDate) : null;
	const nextTimeLabel = nextEvent && nextStart && nextEnd ? `${formatTime(nextStart)} - ${formatTime(nextEnd)}` : "À configurer";
	const selectedGroupsLabel = selectedLabels.length ? selectedLabels.slice(0, 3).join(", ") : "Choisis tes groupes";
	const planningHint = selectedLabels.length
		? `${selectedLabels.length} groupe${selectedLabels.length > 1 ? "s" : ""} suivi${selectedLabels.length > 1 ? "s" : ""}`
		: "Planning non personnalisé";
	const changedCount = eventChanges.length;
	const heroSubtitle = nextEvent ? `${nextTimeLabel} · ${formatDateRange(nextEvent).split("·")[0].trim()}` : "Connecte tes groupes pour afficher ton prochain cours ici.";
	const sectionEyebrow = homeTab === "today" ? "Planning" : "Projection";
	const sectionTitle = homeTab === "today" ? "Aujourd'hui" : "À venir";
	const primaryInsightTitle = homeTab === "today" ? dayIntensity : `${upcomingActiveEvents.length} cours à venir`;
	const primaryInsightBody =
		homeTab === "today"
			? todayActiveCount
				? `${todayActiveCount} cours actifs, de ${dayRange}.`
				: "Aucune contrainte prévue aujourd'hui."
			: nextTimelineStart
				? `Prochain repère : ${formatStartLabel(nextTimelineStart, now)}.`
				: "Aucun cours à venir dans le planning chargé.";
	const secondaryInsightTitle =
		homeTab === "today" ? (changedCount ? `${changedCount} changement${changedCount > 1 ? "s" : ""}` : "Planning stable") : nextTimelineEvent ? getEventTitle(nextTimelineEvent) : "Planning libre";
	const secondaryInsightBody =
		homeTab === "today"
			? changedCount
				? "Vérifie les salles avant de partir."
				: "Aucune modification détectée."
			: nextTimelineEvent
				? `${nextTimelineEvent.rooms?.map(getRoomName).filter(Boolean).join(", ") || "Lieu à confirmer"} · ${formatDateRange(nextTimelineEvent).split("·")[0].trim()}`
				: "Aucune échéance à afficher.";
	const emptyTitle = selectedGroups.length ? (homeTab === "today" ? "Rien aujourd'hui" : "Rien à venir") : "Planning à connecter";
	const emptyText = selectedGroups.length
		? homeTab === "today"
			? "Passe sur À venir pour voir les prochains cours."
			: "Bascule sur l'agenda pour explorer une autre période."
		: "Ajoute tes groupes pour remplir la home automatiquement.";
	const openEventInCalendar = (event?: ZeusEvent | null) => {
		if (!event) {
			navigation.navigate("Agenda");
			return;
		}
		navigation.navigate("Agenda", {
			targetDate: event.startDate,
			eventId: event.id,
			eventReservationId: event.idReservation,
			eventStartDate: event.startDate,
		});
	};
	const saveManualEvent = async () => {
		const title = manualTitle.trim();
		const startDate = parseLocalDateTime(manualDate, manualStart);
		const endDate = parseLocalDateTime(manualDate, manualEnd);
		if (!title || !startDate || !endDate || endDate.getTime() <= startDate.getTime()) {
			Alert.alert("Événement incomplet", "Vérifie le titre, la date et les heures de début/fin.");
			return;
		}
		setSavingManual(true);
		try {
			const event = await addManualEvent({ title, startDate, endDate, room: manualRoom });
			const nextEvents = [...events, event];
			setEvents(nextEvents);
			await syncCourseWidgets(nextEvents);
			setManualTitle("");
			setManualRoom("");
			setShowManualEvent(false);
			openEventInCalendar(event);
		} catch {
			Alert.alert("Ajout impossible", "L'événement n'a pas pu être enregistré localement.");
		} finally {
			setSavingManual(false);
		}
	};

	return (
		<ScrollView
			style={[s.root, { backgroundColor: theme.bg }]}
			contentContainerStyle={s.content}
			refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.accent} />}>
			<View pointerEvents="none" style={[s.topBand, { backgroundColor: theme.mode === "dark" ? "#151922" : "#e7ebf1" }]} />

			<Animated.View entering={FadeInUp.duration(420)} style={s.header}>
				<View style={s.headerIdentity}>
					<Image source={require("../../assets/logo.png")} style={s.logo} resizeMode="contain" />
					<View style={s.headerText}>
						<Text style={[s.eyebrow, { color: theme.accent }]}>{now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</Text>
						<Text style={[s.title, { color: theme.text }]}>{greetingFor(now)}</Text>
					</View>
				</View>
				<Pressable style={[s.syncPill, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={refresh}>
					{showCacheBanner ? <WifiOff color={theme.warn} size={15} /> : <RefreshCw color={theme.accent} size={15} />}
					<Text style={[s.syncText, { color: showCacheBanner ? theme.warn : theme.text }]} numberOfLines={1}>
						{statusLabel}
					</Text>
				</Pressable>
			</Animated.View>

			<View style={s.noticeStack}>
				{showCacheBanner ? (
					<Animated.View entering={FadeInDown.duration(300)} style={[s.offline, { backgroundColor: theme.accentSoft, borderColor: theme.border }]}>
						<WifiOff color={theme.accent} size={17} />
						<Text style={[s.offlineText, { color: theme.text }]}>Données chargées depuis le cache. Synchronisation en nouvel essai.</Text>
					</Animated.View>
				) : null}

				{eventChanges.length ? (
					<Animated.View entering={FadeInDown.duration(300)} style={[s.roomChange, { backgroundColor: theme.surface, borderColor: theme.warn }]}>
						<MapPin color={theme.warn} size={17} />
						<Text style={[s.roomChangeText, { color: theme.text }]} numberOfLines={2}>
							{formatEventChangeNotice(eventChanges)}
						</Text>
						<Pressable style={s.roomChangeClose} onPress={() => setEventChanges([])}>
							<X color={theme.muted} size={16} />
						</Pressable>
					</Animated.View>
				) : null}
			</View>

			<Animated.View entering={FadeInDown.delay(80).duration(460)} layout={Layout.springify()}>
				<Pressable
					style={[
						s.cockpit,
						{
							backgroundColor: theme.mode === "dark" ? "#171b24" : "#ffffff",
							borderColor: isLive ? theme.timeLine : theme.border,
							shadowColor: theme.cardShadow,
						},
					]}
					onPress={() => openEventInCalendar(nextEvent)}>
					<View style={s.cockpitTop}>
						<View style={[s.statusBadge, { backgroundColor: isLive ? theme.timeLine : theme.accent }]}>
							{isLive ? <BellElectric color="#fff" size={14} /> : <Clock3 color="#fff" size={14} />}
							<Text style={s.statusBadgeText}>{nextKicker}</Text>
						</View>
						<View style={[s.groupBadge, { backgroundColor: theme.surfaceSoft, borderColor: theme.border }]}>
							<Text style={[s.groupBadgeText, { color: theme.muted }]} numberOfLines={1}>
								{planningHint}
							</Text>
						</View>
					</View>
					<Text style={[s.cockpitTitle, { color: theme.text }]} numberOfLines={2}>
						{nextEvent ? getEventTitle(nextEvent) : "Aucun cours à venir"}
					</Text>
					<Text style={[s.cockpitSubtitle, { color: theme.muted }]} numberOfLines={2}>
						{heroSubtitle}
					</Text>
					<View style={s.cockpitGrid}>
						<InfoTile icon={<MapPin color={theme.accent} size={17} />} label="Salle" value={nextRooms || "À confirmer"} />
						<InfoTile icon={<Route color={theme.accent} size={17} />} label="Statut" value={freeLabel} />
					</View>
					{currentEvent ? (
						<View style={s.liveProgress}>
							<View style={s.liveProgressHeader}>
								<Text style={[s.liveProgressText, { color: theme.muted }]}>Progression du cours</Text>
								<Text style={[s.liveProgressText, { color: theme.text }]}>{Math.round(progress)}%</Text>
							</View>
							<View style={[s.progressTrack, { backgroundColor: theme.surfaceSoft }]}>
								<View style={[s.progressFill, { backgroundColor: theme.timeLine, width: `${progress}%` }]} />
							</View>
						</View>
					) : null}
				</Pressable>
			</Animated.View>

			<Animated.View entering={FadeInDown.delay(140).duration(420)} style={s.metricsRow}>
				<Metric icon={<CalendarDays color={theme.accent} size={18} />} value={String(todayActiveCount)} label={dayIntensity} detail={dayRange} />
				<Metric icon={<CalendarClock color={theme.accent} size={18} />} value={String(weekCount)} label="Cette semaine" detail="Cours actifs" />
				<Metric
					icon={<TrendingUp color={theme.accent} size={18} />}
					value={aurigaAverage}
					label="Moyenne Auriga"
					detail={aurigaAverage === "-" ? "Non chargée" : "Dernier semestre"}
				/>
			</Animated.View>

			<Animated.View entering={FadeInDown.delay(200).duration(420)} style={[s.studentPanel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
				<Pressable style={s.routeMain} onPress={() => navigation.navigate("Agenda")}>
					<View style={[s.routeIcon, { backgroundColor: theme.accentSoft }]}>
						<GraduationCap color={theme.accent} size={22} />
					</View>
					<View style={s.routeCopy}>
						<Text style={[s.routeKicker, { color: theme.accent }]}>Profil étudiant</Text>
						<Text style={[s.routeTitle, { color: theme.text }]} numberOfLines={1}>
							{selectedGroupsLabel}
						</Text>
						<Text style={[s.routeText, { color: theme.muted }]} numberOfLines={2}>
							{selectedLabels.length ? "Planning, rappels et widgets alignés sur ces groupes." : "Configure tes groupes pour personnaliser la journée."}
						</Text>
					</View>
					<ChevronRight color={theme.muted} size={20} />
				</Pressable>
				<View style={[s.routeDivider, { backgroundColor: theme.border }]} />
				<View style={s.quickGrid}>
					<QuickAction icon={<CalendarDays color="#fff" size={18} />} label="Agenda" onPress={() => navigation.navigate("Agenda")} />
					<QuickAction icon={<Plus color="#fff" size={18} />} label="Ajouter" onPress={() => setShowManualEvent(true)} />
					<QuickAction icon={<BellRing color="#fff" size={18} />} label="Rappels" onPress={() => navigation.navigate("Notifications")} />
					<QuickAction icon={<BookOpenCheck color="#fff" size={18} />} label="Notes" onPress={() => navigation.navigate("Notes")} />
				</View>
			</Animated.View>

			<Animated.View entering={FadeInDown.delay(260).duration(420)} style={s.sectionHead}>
				<View>
					<Text style={[s.sectionEyebrow, { color: theme.accent }]}>{sectionEyebrow}</Text>
					<Text style={[s.sectionTitle, { color: theme.text }]}>{sectionTitle}</Text>
				</View>
				<View style={[s.segment, { backgroundColor: theme.surfaceSoft }]}>
					{(["today", "next"] as HomeTab[]).map((tab) => {
						const active = homeTab === tab;
						return (
							<Pressable key={tab} style={[s.segmentItem, active && { backgroundColor: theme.surface }]} onPress={() => setHomeTab(tab)}>
								<Text style={[s.segmentText, { color: active ? theme.text : theme.muted }]}>{tab === "today" ? "Aujourd'hui" : "À venir"}</Text>
							</Pressable>
						);
					})}
				</View>
			</Animated.View>

			<Animated.View entering={FadeInDown.delay(280).duration(420)} style={s.insightRow}>
				<StudentInsight title={primaryInsightTitle} body={primaryInsightBody} />
				<StudentInsight title={secondaryInsightTitle} body={secondaryInsightBody} />
			</Animated.View>

			{visibleEvents.length === 0 ? (
				<Animated.View entering={FadeInDown.delay(300).duration(420)} style={[s.emptyPanel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
					<CheckCircle2 color={theme.accent} size={26} />
					<View style={s.emptyCopy}>
						<Text style={[s.emptyTitle, { color: theme.text }]}>{emptyTitle}</Text>
						<Text style={[s.emptyText, { color: theme.muted }]}>{emptyText}</Text>
					</View>
				</Animated.View>
			) : (
				<View style={s.timeline}>
					{visibleEvents.slice(0, 5).map((event, index) => (
						<TimelineRow
							key={`${event.idReservation || event.id || index}-${event.startDate}`}
							event={event}
							index={index}
							colored={homeTab === "today"}
							onPress={() => openEventInCalendar(event)}
						/>
					))}
				</View>
			)}

			<Animated.View entering={FadeInDown.delay(360).duration(420)} style={s.sectionHead}>
				<View>
					<Text style={[s.sectionEyebrow, { color: theme.accent }]}>Campus</Text>
					<Text style={[s.sectionTitle, { color: theme.text }]}>Outils rapides</Text>
				</View>
			</Animated.View>

			<View style={s.linksList}>
				{usefulLinks.map((item, index) => (
					<UsefulLinkCard key={item.url} item={item} index={index} />
				))}
			</View>
			<ManualEventModal
				visible={showManualEvent}
				title={manualTitle}
				date={manualDate}
				start={manualStart}
				end={manualEnd}
				room={manualRoom}
				saving={savingManual}
				onChangeTitle={setManualTitle}
				onChangeDate={setManualDate}
				onChangeStart={setManualStart}
				onChangeEnd={setManualEnd}
				onChangeRoom={setManualRoom}
				onSave={saveManualEvent}
				onClose={() => setShowManualEvent(false)}
			/>
		</ScrollView>
	);
}

function formatEventChangeNotice(changes: EventChange[]) {
	const first = changes[0];
	const start = new Date(first.startDate);
	const time = Number.isNaN(start.getTime()) ? "" : ` à ${formatTime(start)}`;
	const suffix = changes.length > 1 ? ` (+${changes.length - 1})` : "";
	return `Cours modifié${suffix} : ${first.title}${time}, ${first.summary}`;
}

function UsefulLinkCard({ item, index }: { item: UsefulLink; index: number }) {
	const { theme } = useTheme();

	return (
		<Animated.View entering={FadeInDown.delay(360 + index * 40).duration(360)} layout={Layout.springify()}>
			<Pressable
				style={[s.linkCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
				onPress={() => {
					Linking.openURL(item.url).catch(() => {});
				}}>
				<View style={[s.linkVisual, { backgroundColor: item.accent }]}>
					<View style={s.linkVisualOverlay} />
					<Image source={item.image} style={s.linkImage} resizeMode="contain" />
					<View style={s.linkBadge}>
						<Text style={s.linkBadgeText}>{item.badge}</Text>
					</View>
					<Text style={s.linkVisualUrl} numberOfLines={1}>
						{item.url.replace(/^https?:\/\//, "")}
					</Text>
				</View>
				<View style={s.linkBody}>
					<View style={s.linkBodyHeader}>
						<Text style={[s.linkTitle, { color: theme.text }]} numberOfLines={1}>
							{item.title}
						</Text>
						<ChevronRight color={item.accent} size={18} />
					</View>
					<Text style={[s.linkDescription, { color: theme.muted }]} numberOfLines={2}>
						{item.description}
					</Text>
				</View>
			</Pressable>
		</Animated.View>
	);
}

function InfoTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
	const { theme } = useTheme();
	return (
		<View style={[s.infoTile, { backgroundColor: theme.surfaceSoft, borderColor: theme.border }]}>
			{icon}
			<View style={s.infoTileCopy}>
				<Text style={[s.infoTileLabel, { color: theme.muted }]}>{label}</Text>
				<Text style={[s.infoTileValue, { color: theme.text }]} numberOfLines={2}>
					{value}
				</Text>
			</View>
		</View>
	);
}

function Metric({ icon, value, label, detail }: { icon: React.ReactNode; value: string; label: string; detail: string }) {
	const { theme } = useTheme();
	return (
		<View style={[s.metric, { backgroundColor: theme.surface, borderColor: theme.border }]}>
			<View style={[s.metricIcon, { backgroundColor: theme.accentSoft }]}>{icon}</View>
			<Text style={[s.metricValue, { color: theme.text }]} numberOfLines={1}>
				{value}
			</Text>
			<Text style={[s.metricLabel, { color: theme.text }]} numberOfLines={1}>
				{label}
			</Text>
			<Text style={[s.metricDetail, { color: theme.muted }]} numberOfLines={1}>
				{detail}
			</Text>
		</View>
	);
}

function StudentInsight({ icon, title, body }: { icon?: React.ReactNode; title: string; body: string }) {
	const { theme } = useTheme();

	return (
		<View style={[s.insightCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
			{icon && <View style={[s.insightIcon, { backgroundColor: theme.accentSoft }]}>{icon}</View>}

			<View style={s.insightCopy}>
				<Text style={[s.insightTitle, { color: theme.text }]} numberOfLines={1}>
					{title}
				</Text>
				<Text style={[s.insightBody, { color: theme.muted }]} numberOfLines={2}>
					{body}
				</Text>
			</View>
		</View>
	);
}

function QuickAction({ icon, label, onPress }: { icon: React.ReactNode; label: string; onPress: () => void }) {
	const { theme } = useTheme();
	return (
		<Pressable style={[s.quickAction, { backgroundColor: theme.accent }]} onPress={onPress}>
			{icon}
			<Text style={s.quickText}>{label}</Text>
		</Pressable>
	);
}

function ManualEventModal({
	visible,
	title,
	date,
	start,
	end,
	room,
	saving,
	onChangeTitle,
	onChangeDate,
	onChangeStart,
	onChangeEnd,
	onChangeRoom,
	onSave,
	onClose,
}: {
	visible: boolean;
	title: string;
	date: string;
	start: string;
	end: string;
	room: string;
	saving: boolean;
	onChangeTitle: (value: string) => void;
	onChangeDate: (value: string) => void;
	onChangeStart: (value: string) => void;
	onChangeEnd: (value: string) => void;
	onChangeRoom: (value: string) => void;
	onSave: () => void;
	onClose: () => void;
}) {
	const { theme } = useTheme();
	const selectedDate = parseInputDate(date) || new Date();
	const [showDatePicker, setShowDatePicker] = useState(false);
	const [pickerMonth, setPickerMonth] = useState(selectedDate);
	const selectDate = (nextDate: Date) => {
		onChangeDate(formatInputDate(nextDate));
		setPickerMonth(nextDate);
		setShowDatePicker(false);
	};
	const openDatePicker = () => {
		setPickerMonth(selectedDate);
		setShowDatePicker(true);
	};

	return (
		<Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
			<View style={[s.manualRoot, { backgroundColor: theme.bg }]}>
				<View style={[s.manualHeader, { borderBottomColor: theme.border }]}>
					<Text style={[s.manualTitle, { color: theme.text }]}>Nouvel événement</Text>
					<Pressable style={[s.manualClose, { borderColor: theme.border }]} onPress={onClose}>
						<X color={theme.text} size={20} />
					</Pressable>
				</View>
				<ScrollView contentContainerStyle={s.manualContent}>
					<FormField label="Titre" value={title} onChangeText={onChangeTitle} placeholder="Ex: Projet, entretien..." />
					<View style={s.formField}>
						<Text style={[s.formLabel, { color: theme.muted }]}>Date</Text>
						<Pressable style={[s.dateButton, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={openDatePicker}>
							<CalendarDays color={theme.accent} size={18} />
							<Text style={[s.dateButtonText, { color: theme.text }]}>
								{selectedDate.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
							</Text>
						</Pressable>
					</View>
					<View style={s.manualTimeRow}>
						<FormField label="Début" value={start} onChangeText={onChangeStart} placeholder="09:00" keyboardType="numbers-and-punctuation" compact />
						<FormField label="Fin" value={end} onChangeText={onChangeEnd} placeholder="10:00" keyboardType="numbers-and-punctuation" compact />
					</View>
					<FormField label="Lieu" value={room} onChangeText={onChangeRoom} placeholder="Salle ou adresse" />
					<Pressable style={[s.manualSave, { backgroundColor: theme.accent, opacity: saving ? 0.7 : 1 }]} onPress={onSave} disabled={saving}>
						<Plus color="#fff" size={19} />
						<Text style={s.manualSaveText}>{saving ? "Ajout..." : "Ajouter l'événement"}</Text>
					</Pressable>
				</ScrollView>
				<DatePickerModal
					visible={showDatePicker}
					currentDate={selectedDate}
					pickerMonth={pickerMonth}
					onChangeMonth={setPickerMonth}
					onSelectDate={selectDate}
					onToday={() => selectDate(new Date())}
					onClose={() => setShowDatePicker(false)}
				/>
			</View>
		</Modal>
	);
}

function FormField({
	label,
	value,
	onChangeText,
	placeholder,
	keyboardType,
	compact,
}: {
	label: string;
	value: string;
	onChangeText: (value: string) => void;
	placeholder: string;
	keyboardType?: "default" | "numbers-and-punctuation";
	compact?: boolean;
}) {
	const { theme } = useTheme();
	return (
		<View style={[s.formField, compact && s.formFieldCompact]}>
			<Text style={[s.formLabel, { color: theme.muted }]}>{label}</Text>
			<TextInput
				value={value}
				onChangeText={onChangeText}
				placeholder={placeholder}
				placeholderTextColor={theme.muted}
				keyboardType={keyboardType}
				style={[s.formInput, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
			/>
		</View>
	);
}

function TimelineRow({ event, index, colored, onPress }: { event: ZeusEvent; index: number; colored?: boolean; onPress: () => void }) {
	const { theme } = useTheme();
	const start = new Date(event.startDate);
	const end = new Date(event.endDate);
	const rooms = event.rooms?.map(getRoomName).filter(Boolean).join(", ");
	const isPast = end.getTime() < Date.now();
	const cancelled = isEventCancelled(event);
	const ignored = isEventIgnored(event);
	const isNow = !cancelled && !ignored && start.getTime() <= Date.now() && end.getTime() > Date.now();
	const eventColor = colored ? getCourseColor(event) : theme.border;
	const activeColor = cancelled || ignored ? theme.muted : isNow ? (colored ? eventColor : theme.accent) : eventColor;

	return (
		<Animated.View entering={FadeInDown.delay(300 + Math.min(index, 5) * 45).duration(360)} layout={Layout.springify()}>
			<Pressable
				style={[
					s.timelineRow,
					(cancelled || ignored) && s.timelineRowCancelled,
					{
						backgroundColor: cancelled || ignored ? theme.surfaceSoft : theme.surface,
						borderColor: isNow || cancelled || ignored ? activeColor : theme.border,
						opacity: isPast || cancelled || ignored ? 0.62 : 1,
					},
				]}
				onPress={onPress}>
				<View style={s.timeCol}>
					<Text style={[s.timeText, { color: isNow ? activeColor : theme.text }]}>{formatTime(start)}</Text>
					<Text style={[s.timeEnd, { color: theme.muted }]}>{formatTime(end)}</Text>
				</View>
				<View style={[s.timelineMarker, { backgroundColor: activeColor }]}>{isNow ? <View style={s.timelineDot} /> : null}</View>
				<View style={s.timelineBody}>
					<View style={s.timelineTitleRow}>
						{cancelled ? (
							<View style={[s.cancelledBadge, { borderColor: theme.muted }]}>
								<Text style={[s.cancelledBadgeText, { color: theme.muted }]}>Annulé</Text>
							</View>
						) : ignored ? (
							<View style={[s.cancelledBadge, { borderColor: theme.muted }]}>
								<Text style={[s.cancelledBadgeText, { color: theme.muted }]}>Ignoré</Text>
							</View>
						) : null}
						<Text
							style={[s.timelineTitle, (cancelled || ignored) && s.timelineTitleCancelled, { color: cancelled || ignored ? theme.muted : theme.text }]}
							numberOfLines={1}>
							{getEventTitle(event)}
						</Text>
					</View>
					<Text style={[s.timelineMeta, { color: theme.muted }]} numberOfLines={1}>
						{cancelled ? `Cours annulé · ${rooms || "Lieu à confirmer"}` : ignored ? `Cours ignoré · ${rooms || "Lieu à confirmer"}` : rooms || "Lieu à confirmer"}
					</Text>
				</View>
				<ChevronRight color={theme.muted} size={18} />
			</Pressable>
		</Animated.View>
	);
}

const s = StyleSheet.create({
	root: { flex: 1 },
	content: { padding: 18, paddingTop: 56, paddingBottom: 112 },
	topBand: { position: "absolute", top: 0, left: 0, right: 0, height: 246, opacity: 0.82 },
	header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16 },
	headerIdentity: { flex: 1, flexDirection: "row", alignItems: "center", minWidth: 0 },
	logo: { width: 48, height: 48, marginRight: 12 },
	headerText: { flex: 1, minWidth: 0 },
	eyebrow: { fontSize: 12, fontWeight: "900", textTransform: "capitalize" },
	title: { fontSize: 31, fontWeight: "900", letterSpacing: 0 },
	syncPill: { maxWidth: 142, minHeight: 40, borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 7 },
	syncText: { flexShrink: 1, fontSize: 12, fontWeight: "900" },
	noticeStack: { gap: 10, marginBottom: 12 },
	offline: { borderWidth: 1, borderRadius: 12, padding: 11, flexDirection: "row", alignItems: "center", gap: 8 },
	offlineText: { flex: 1, fontSize: 12, fontWeight: "800", lineHeight: 17 },
	roomChange: { borderWidth: 1, borderRadius: 12, padding: 11, flexDirection: "row", alignItems: "center", gap: 8 },
	roomChangeText: { flex: 1, fontSize: 12, fontWeight: "900", lineHeight: 17 },
	roomChangeClose: { width: 30, height: 30, alignItems: "center", justifyContent: "center" },
	cockpit: {
		borderWidth: 1,
		borderRadius: 20,
		padding: 16,
		minHeight: 0,
		overflow: "hidden",
		shadowOpacity: 0.1,
		shadowRadius: 18,
		shadowOffset: { width: 0, height: 10 },
		elevation: 3,
	},
	cockpitTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
	statusBadge: { minHeight: 32, borderRadius: 8, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 7, maxWidth: "58%" },
	statusBadgeText: { color: "#fff", fontSize: 12, fontWeight: "900" },
	groupBadge: { flexShrink: 1, minHeight: 32, borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, alignItems: "center", justifyContent: "center" },
	groupBadgeText: { fontSize: 11, fontWeight: "900" },
	cockpitTitle: { fontSize: 25, lineHeight: 30, fontWeight: "900", letterSpacing: 0, marginTop: 18 },
	cockpitSubtitle: { marginTop: 8, fontSize: 14, lineHeight: 19, fontWeight: "800" },
	cockpitGrid: { gap: 8, marginTop: 16 },
	infoTile: { minHeight: 54, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 10 },
	infoTileCopy: { flex: 1, minWidth: 0 },
	infoTileLabel: { fontSize: 10, fontWeight: "900", textTransform: "uppercase" },
	infoTileValue: { marginTop: 3, fontSize: 14, lineHeight: 18, fontWeight: "900" },
	liveProgress: { marginTop: 18 },
	liveProgressHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
	liveProgressText: { fontSize: 12, fontWeight: "900" },
	progressTrack: { height: 8, borderRadius: 8, overflow: "hidden" },
	progressFill: { height: "100%", borderRadius: 8 },
	metricsRow: { flexDirection: "row", gap: 9, marginTop: 12 },
	metric: { flex: 1, minHeight: 122, borderRadius: 18, borderWidth: 1, padding: 11, justifyContent: "space-between" },
	metricIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
	metricValue: { fontSize: 26, fontWeight: "900", letterSpacing: 0 },
	metricLabel: { fontSize: 12, fontWeight: "900" },
	metricDetail: { fontSize: 10, fontWeight: "800" },
	studentPanel: { borderWidth: 1, borderRadius: 22, padding: 14, marginTop: 12 },
	routeMain: { minHeight: 76, flexDirection: "row", alignItems: "center", gap: 12 },
	routeIcon: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
	routeCopy: { flex: 1, minWidth: 0 },
	routeKicker: { fontSize: 11, fontWeight: "900", textTransform: "uppercase" },
	routeTitle: { marginTop: 2, fontSize: 18, fontWeight: "900" },
	routeText: { marginTop: 4, lineHeight: 18, fontWeight: "700" },
	routeDivider: { height: 1, marginVertical: 12 },
	quickGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
	quickAction: { flexBasis: "48%", flexGrow: 1, minHeight: 48, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
	quickText: { color: "#fff", fontWeight: "900", fontSize: 13 },
	manualRoot: { flex: 1 },
	manualHeader: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 12, borderBottomWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
	manualTitle: { fontSize: 24, fontWeight: "900" },
	manualClose: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
	manualContent: { padding: 18, gap: 14, paddingBottom: 52 },
	manualTimeRow: { flexDirection: "row", gap: 12 },
	formField: { gap: 8 },
	formFieldCompact: { flex: 1 },
	formLabel: { fontSize: 12, fontWeight: "900", textTransform: "uppercase" },
	formInput: { minHeight: 50, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, fontSize: 16, fontWeight: "800" },
	dateButton: { minHeight: 50, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 9 },
	dateButtonText: { flex: 1, fontSize: 16, fontWeight: "800", textTransform: "capitalize" },
	manualSave: { minHeight: 52, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, marginTop: 6 },
	manualSaveText: { color: "#fff", fontSize: 16, fontWeight: "900" },
	sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 24, marginBottom: 12 },
	sectionEyebrow: { fontSize: 12, fontWeight: "900", textTransform: "uppercase" },
	sectionTitle: { fontSize: 24, fontWeight: "900", letterSpacing: 0 },
	segment: { width: 154, flexDirection: "row", padding: 4, borderRadius: 10 },
	segmentItem: { flex: 1, minHeight: 34, borderRadius: 8, alignItems: "center", justifyContent: "center" },
	segmentText: { fontSize: 12, fontWeight: "900" },
	insightRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
	insightCard: { flex: 1, minHeight: 98, borderWidth: 1, borderRadius: 16, padding: 12 },
	insightIcon: { width: 30, height: 30, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 10 },
	insightCopy: { flex: 1, minWidth: 0 },
	insightTitle: { fontSize: 14, fontWeight: "900" },
	insightBody: { marginTop: 4, fontSize: 12, lineHeight: 17, fontWeight: "700" },
	timeline: { gap: 10 },
	timelineRow: { borderWidth: 1, borderRadius: 16, minHeight: 82, padding: 12, flexDirection: "row", alignItems: "center", gap: 12 },
	timelineRowCancelled: { borderStyle: "dashed" },
	timeCol: { width: 48 },
	timeText: { fontSize: 15, fontWeight: "900" },
	timeEnd: { marginTop: 4, fontSize: 12, fontWeight: "800" },
	timelineMarker: { width: 10, alignSelf: "stretch", borderRadius: 10, alignItems: "center", justifyContent: "center" },
	timelineDot: { width: 4, height: 24, borderRadius: 4, backgroundColor: "#fff" },
	timelineBody: { flex: 1, minWidth: 0 },
	timelineTitleRow: { flexDirection: "row", alignItems: "center", gap: 7 },
	timelineTitle: { fontSize: 16, fontWeight: "900" },
	timelineTitleCancelled: { flex: 1, textDecorationLine: "line-through" },
	timelineMeta: { marginTop: 5, fontSize: 13, fontWeight: "700" },
	cancelledBadge: { borderWidth: 1, borderStyle: "dashed", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 },
	cancelledBadgeText: { fontSize: 10, fontWeight: "900", textTransform: "uppercase" },
	emptyPanel: { borderWidth: 1, borderRadius: 16, padding: 16, flexDirection: "row", gap: 12, alignItems: "center" },
	emptyCopy: { flex: 1 },
	emptyTitle: { fontSize: 17, fontWeight: "900" },
	emptyText: { marginTop: 4, lineHeight: 19, fontWeight: "700" },
	linksList: { gap: 12, marginTop: 2 },
	linkCard: {
		borderWidth: 1,
		borderRadius: 18,
		overflow: "hidden",
	},
	linkVisual: {
		minHeight: 100,
		padding: 14,
		justifyContent: "space-between",
		alignItems: "center",
		position: "relative",
	},
	linkVisualOverlay: {
		...StyleSheet.absoluteFill,
		backgroundColor: "rgba(255,255,255,0.08)",
	},
	linkImage: { width: 110, height: 56, zIndex: 1, marginTop: 2 },
	linkBadge: {
		zIndex: 1,
		alignSelf: "flex-start",
		minHeight: 28,
		paddingHorizontal: 10,
		borderRadius: 8,
		backgroundColor: "rgba(255,255,255,0.18)",
		justifyContent: "center",
	},
	linkBadgeText: { color: "#fff", fontSize: 12, fontWeight: "900", letterSpacing: 0.2 },
	linkVisualUrl: { zIndex: 1, alignSelf: "flex-start", marginTop: 8, color: "rgba(255,255,255,0.9)", fontSize: 12, fontWeight: "700" },
	linkBody: { padding: 14 },
	linkBodyHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
	linkTitle: { flex: 1, fontSize: 18, fontWeight: "900" },
	linkDescription: { marginTop: 6, lineHeight: 18, fontWeight: "700" },
});
