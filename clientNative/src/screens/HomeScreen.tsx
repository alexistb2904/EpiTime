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
import { eventOverlapsDay, getRoomName, startOfDay } from "../utils/calendar";
import { HomeContent } from "../components/home/HomeComponents";
import { formatAverage, formatDurationHumanLong, formatInputDate, formatTime, day, minute, parseLocalDateTime, usefulLinks } from "../components/home/homeHelpers";

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
	const groupsLoadedRef = useRef(false);
	const groupsRequestRef = useRef<Promise<void> | null>(null);

	const loadGroups = useCallback(
		async (cachedGroups: Group[] = []) => {
			if (cachedGroups.length) setGroups((current) => (current.length ? current : cachedGroups));
			if (groupsLoadedRef.current) return;
			if (groupsRequestRef.current) {
				await groupsRequestRef.current;
				return;
			}

			const request = (async () => {
				try {
					const allGroups = await getGroups();
					setGroups(allGroups);
					await setJSON("lastGroups", allGroups);
					groupsLoadedRef.current = true;
				} catch (error) {
					if (isAuthReconnectRequiredError(error)) await handleAuthExpired();
				}
			})();

			groupsRequestRef.current = request;
			try {
				await request;
			} finally {
				if (groupsRequestRef.current === request) groupsRequestRef.current = null;
			}
		},
		[handleAuthExpired]
	);

	const refresh = useCallback(async () => {
		if (refreshingRef.current) return;
		refreshingRef.current = true;
		setRefreshing(true);
		const start = startOfDay(new Date());
		const end = new Date(start);
		end.setDate(end.getDate() + 30);
		let ids: (string | number)[] = [];
		let cachedGroups: Group[] = [];
		try {
			const [storedGroups, storedCachedGroups, notificationSettings] = await Promise.all([
				getJSON<(string | number)[]>("selectedGroups", []),
				getJSON<Group[]>("lastGroups", []),
				getNotificationSettings(),
			]);
			ids = storedGroups;
			cachedGroups = storedCachedGroups;
			setSelectedGroups(ids);
			if (cachedGroups.length) setGroups(cachedGroups);

			if (ids.length > 0) {
				const query = { groups: ids };
				const result = await syncSchedule({
					start,
					end,
					query,
					changeDetectionWindowDays: notificationSettings.changeDetectionWindowDays,
					onCached: async (cached) => {
						setEvents(cached.visibleEvents);
					},
				});

				setEvents(result.visibleEvents);
				void Promise.all([syncCourseWidgets(result.visibleEvents), rescheduleCourseNoteReminders(result.visibleEvents)]).catch(() => {});
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
							notificationSettings.notificationType,
							{ requestPermission: false }
						);
					}
				}
				setUsingCache(result.source === "cache");
			} else {
				const result = await syncSchedule({ start, end, query: {} });
				setEvents(result.visibleEvents);
				void Promise.all([syncCourseWidgets(result.visibleEvents), rescheduleCourseNoteReminders(result.visibleEvents)]).catch(() => {});
				setUsingCache(false);
			}
			void loadGroups(cachedGroups);
		} catch (error) {
			if (isAuthReconnectRequiredError(error)) {
				await handleAuthExpired();
				return;
			}
			const fallback = ids.length ? await readCachedSchedule(start, end, { groups: ids }, true) : await syncSchedule({ start, end, query: {} });
			setEvents(fallback.visibleEvents);
			if (cachedGroups.length) setGroups(cachedGroups);
			void loadGroups(cachedGroups);
			void Promise.all([syncCourseWidgets(fallback.visibleEvents), rescheduleCourseNoteReminders(fallback.visibleEvents)]).catch(() => {});
			setUsingCache(true);
		} finally {
			refreshingRef.current = false;
			setRefreshing(false);
		}
	}, [handleAuthExpired, loadGroups]);

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
	const selectedLabels = selectedGroups.map((id) => groups.find((group) => group.id === id)?.name || String(id));
	const nextStart = nextEvent ? new Date(nextEvent.startDate) : null;
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
	const statusLabel = usingCache ? "Mémoire locale" : selectedGroups.length ? "Synchronisé" : "Groupes à choisir";
	const nextKicker = !nextEvent ? "Planning libre" : isLive ? "En cours" : `Dans ${formatDurationHumanLong(nextStart!.getTime() - nowMs)}`;
	const firstToday = todayEvents[0] ? new Date(todayEvents[0].startDate) : null;
	const lastToday = todayEvents.length ? new Date(todayEvents[todayEvents.length - 1].endDate) : null;
	const dayRange = firstToday && lastToday ? `${formatTime(firstToday)} – ${formatTime(lastToday)}` : "Aucun cours";
	const upcomingActiveCount = upcomingEvents.filter((event) => !isEventCancelled(event) && !isEventIgnored(event)).length;
	const followingEvent = nextEvent ? activeScheduleEvents.find((event) => +new Date(event.startDate) > +new Date(nextEvent.startDate)) || null : null;
	const emptyTitle = selectedGroups.length ? (homeTab === "today" ? "Rien aujourd'hui" : "Rien à venir") : "Planning à connecter";
	const emptyText = selectedGroups.length
		? homeTab === "today"
			? "Passe sur À venir pour voir les prochains cours."
			: "Ouvre l'agenda pour explorer une autre période."
		: "Choisis tes groupes dans l'agenda pour remplir l'accueil.";
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
			dayRange={dayRange}
			emptyText={emptyText}
			emptyTitle={emptyTitle}
			eventChanges={eventChanges}
			followingEvent={followingEvent}
			hasGroups={selectedGroups.length > 0}
			homeTab={homeTab}
			isLive={isLive}
			manualDate={manualDate}
			manualEnd={manualEnd}
			manualRoom={manualRoom}
			manualStart={manualStart}
			manualTitle={manualTitle}
			navigation={navigation}
			nextEvent={nextEvent || null}
			nextKicker={nextKicker}
			nextRooms={nextRooms}
			now={now}
			openEventInCalendar={openEventInCalendar}
			progress={progress}
			refresh={refresh}
			refreshing={refreshing}
			saveManualEvent={saveManualEvent}
			savingManual={savingManual}
			selectedLabels={selectedLabels}
			setEventChanges={setEventChanges}
			setHomeTab={setHomeTab}
			setManualDate={setManualDate}
			setManualEnd={setManualEnd}
			setManualRoom={setManualRoom}
			setManualStart={setManualStart}
			setManualTitle={setManualTitle}
			setShowManualEvent={setShowManualEvent}
			showCacheBanner={usingCache}
			showManualEvent={showManualEvent}
			statusLabel={statusLabel}
			todayActiveCount={todayActiveCount}
			todayEvents={todayEvents}
			upcomingActiveCount={upcomingActiveCount}
			upcomingEvents={upcomingEvents}
			usefulLinks={usefulLinks}
			weekCount={weekCount}
		/>
	);
}
