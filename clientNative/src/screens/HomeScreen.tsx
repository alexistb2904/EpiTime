import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, AppState } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { getGroups, isAuthReconnectRequiredError } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { getCachedAurigaGrades, getCachedAurigaSyllabus } from "../services/aurigaCache";
import { rescheduleCourseNoteReminders } from "../services/courseNotes";
import { getUseWeightedAverages } from "../services/gradePreferences";
import { getSubjectCoefficientOverrides } from "../services/gradeCoefficientOverrides";
import { getGradeOverrides } from "../services/gradeOverrides";
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
import { HomeContent } from "../components/home/HomeComponents";
import {
	formatAverage,
	formatDuration,
	formatDurationHumanLong,
	formatEndSuffix,
	formatInputDate,
	formatStartLabel,
	formatTime,
	formatUntilSuffix,
	day,
	minute,
	parseLocalDateTime,
	usefulLinks,
} from "../components/home/homeHelpers";

type HomeTab = "today" | "next";

export default function HomeScreen() {
	const { handleAuthExpired } = useAuth();
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
			} catch (error) {
				if (isAuthReconnectRequiredError(error)) {
					await handleAuthExpired();
					return;
				}
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
		} catch (error) {
			if (isAuthReconnectRequiredError(error)) {
				await handleAuthExpired();
				return;
			}
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
	}, [handleAuthExpired]);

	useEffect(() => {
		refresh();
	}, [refresh]);

	const loadAurigaAverage = useCallback(async () => {
		try {
			const [grades, syllabus, manual, weighted, subjectCoefficientOverrides, gradeOverrides] = await Promise.all([
				getCachedAurigaGrades(),
				getCachedAurigaSyllabus(),
				getManualGrades(),
				getUseWeightedAverages(),
				getSubjectCoefficientOverrides(),
				getGradeOverrides(),
			]);
			const periods = buildGradesPeriods(grades, syllabus, {
				manualGrades: manual,
				useWeightedAverages: weighted,
				subjectCoefficientOverrides,
				gradeOverrides,
			});
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
	const heroSubtitle = nextEvent
		? `${nextTimeLabel} · ${formatDateRange(nextEvent).split("·")[0].trim()}`
		: "Pas de cours à venir. Ajoute tes groupes pour remplir la liste automatiquement.";
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
		homeTab === "today"
			? changedCount
				? `${changedCount} changement${changedCount > 1 ? "s" : ""}`
				: "Planning stable"
			: nextTimelineEvent
				? getEventTitle(nextTimelineEvent)
				: "Planning libre";
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
		<HomeContent
			aurigaAverage={aurigaAverage}
			currentEvent={currentEvent}
			dayIntensity={dayIntensity}
			dayRange={dayRange}
			emptyText={emptyText}
			emptyTitle={emptyTitle}
			eventChanges={eventChanges}
			freeLabel={freeLabel}
			heroSubtitle={heroSubtitle}
			homeTab={homeTab}
			isLive={isLive}
			manualDate={manualDate}
			manualEnd={manualEnd}
			manualRoom={manualRoom}
			manualStart={manualStart}
			manualTitle={manualTitle}
			navigation={navigation}
			nextEvent={nextEvent}
			nextKicker={nextKicker}
			nextRooms={nextRooms}
			now={now}
			openEventInCalendar={openEventInCalendar}
			planningHint={planningHint}
			primaryInsightBody={primaryInsightBody}
			primaryInsightTitle={primaryInsightTitle}
			progress={progress}
			refresh={refresh}
			refreshing={refreshing}
			saveManualEvent={saveManualEvent}
			savingManual={savingManual}
			secondaryInsightBody={secondaryInsightBody}
			secondaryInsightTitle={secondaryInsightTitle}
			sectionEyebrow={sectionEyebrow}
			sectionTitle={sectionTitle}
			selectedGroupsLabel={selectedGroupsLabel}
			selectedLabels={selectedLabels}
			setEventChanges={setEventChanges}
			setHomeTab={setHomeTab}
			setManualDate={setManualDate}
			setManualEnd={setManualEnd}
			setManualRoom={setManualRoom}
			setManualStart={setManualStart}
			setManualTitle={setManualTitle}
			setShowManualEvent={setShowManualEvent}
			showCacheBanner={showCacheBanner}
			showManualEvent={showManualEvent}
			statusLabel={statusLabel}
			todayActiveCount={todayActiveCount}
			usefulLinks={usefulLinks}
			visibleEvents={visibleEvents}
			weekCount={weekCount}
		/>
	);
}
