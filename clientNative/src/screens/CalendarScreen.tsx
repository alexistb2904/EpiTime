import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, AppState } from "react-native";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import { runOnJS } from "react-native-reanimated";
import { Gesture } from "react-native-gesture-handler";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { getCourseType, getGroups, getReservationDetails, isAuthReconnectRequiredError } from "../services/api";
import { CourseNoteSummary, getCourseNoteSummaries, rescheduleCourseNoteReminders } from "../services/courseNotes";
import { getCachedAurigaSyllabus } from "../services/aurigaCache";
import type { AurigaSyllabus } from "../services/aurigaTypes";
import { findSyllabusForEvent } from "../services/syllabusMatcher";
import {
	deleteLocalEvent,
	eventMatchesIgnoredCourse,
	getEventIgnoreSignature,
	getLocalEventKey,
	ignoreCourse,
	reactivateCourse,
	isEventCancelled,
	isEventIgnored,
	isManualEvent,
} from "../services/localEvents";
import { getJSON, setJSON } from "../services/storage";
import { EventChange } from "../services/eventsCache";
import { syncLiveCourseNotification } from "../services/liveCourse";
import {
	clearEventChangeHistory,
	EventChangeHistoryItem,
	getEventChangeHistory,
	getNotificationSettings,
	notifyEventChanges,
	scheduleLocalCourseNotifications,
} from "../services/notifications";
import { readCachedSchedule, syncSchedule } from "../services/scheduleRepository";
import { refreshCourseWidgetsForGroups, syncCourseWidgets } from "../services/widgets";
import { Group, ZeusEvent } from "../types";
import { eventOverlapsDay, getCourseColor, getRoomName, getWeekRange, startOfDay } from "../utils/calendar";
import { CalendarContent } from "../components/calendar/CalendarContent";
import { CalendarRouteParams, ScheduleContext, ViewMode, dayKey, getCourseProgress, getTargetEventKey, minute, rangeFor } from "../components/calendar/calendarModel";

export default function CalendarScreen() {
	const { handleAuthExpired } = useAuth();
	const { theme } = useTheme();
	const route = useRoute<any>();
	const navigation = useNavigation<any>();
	const routeParams = route.params as CalendarRouteParams | undefined;
	const [groups, setGroups] = useState<Group[]>([]);
	const [selectedGroups, setSelectedGroups] = useState<(string | number)[]>([]);
	const [events, setEvents] = useState<ZeusEvent[]>([]);
	const [currentDate, setCurrentDate] = useState(new Date());
	const [focusedDay, setFocusedDay] = useState(startOfDay(new Date()));
	const [viewMode, setViewMode] = useState<ViewMode>("week");
	const [context, setContext] = useState<ScheduleContext>({ type: "group", ids: [], label: "Mes groupes" });
	const [groupSearch, setGroupSearch] = useState("");
	const [showGroups, setShowGroups] = useState(false);
	const [showRooms, setShowRooms] = useState(false);
	const [showDatePicker, setShowDatePicker] = useState(false);
	const [pickerMonth, setPickerMonth] = useState(new Date());
	const [selectedEvent, setSelectedEvent] = useState<ZeusEvent | null>(null);
	const [highlightedEventKey, setHighlightedEventKey] = useState<string | null>(getTargetEventKey(routeParams));
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const [usingCache, setUsingCache] = useState(false);
	const [eventChanges, setEventChanges] = useState<EventChange[]>([]);
	const [changeHistory, setChangeHistory] = useState<EventChangeHistoryItem[]>([]);
	const [showChangesPanel, setShowChangesPanel] = useState(Boolean(routeParams?.openChangesPanel));
	const [now, setNow] = useState(Date.now());
	const [noteSummaries, setNoteSummaries] = useState<Record<string, CourseNoteSummary>>({});
	const [syllabusList, setSyllabusList] = useState<AurigaSyllabus[]>([]);

	const refreshNoteSummaries = useCallback(async () => {
		setNoteSummaries(await getCourseNoteSummaries());
	}, [handleAuthExpired]);

	const refreshSyllabusList = useCallback(async () => {
		setSyllabusList(await getCachedAurigaSyllabus());
	}, []);

	const refreshChangeHistory = useCallback(async () => {
		setChangeHistory(await getEventChangeHistory());
	}, []);

	const loadCalendar = useCallback(
		async (nextContext = context, nextDate = currentDate, nextView = viewMode) => {
			setLoading(true);
			setError("");
			const { start, end } = rangeFor(nextDate, nextView);
			const query = nextContext.type === "teacher" ? { teachers: nextContext.ids } : nextContext.type === "room" ? { rooms: nextContext.ids } : { groups: nextContext.ids };
			try {
				const notificationSettings = await getNotificationSettings();
				const result = await syncSchedule({
					start,
					end,
					query,
					changeDetectionWindowDays: notificationSettings.changeDetectionWindowDays,
					onCached: async (cached) => {
						setEvents(cached.visibleEvents);
						await rescheduleCourseNoteReminders(cached.visibleEvents);
						await refreshNoteSummaries();
					},
				});

				setEvents(result.visibleEvents);
				if (result.source === "network" && (result.changed || !result.exactCacheHit)) {
					if (result.changes.length) {
						setEventChanges(result.changes);
						if (notificationSettings.changeDetectionEnabled) {
							await notifyEventChanges(result.changes, notificationSettings.notificationType);
							await refreshChangeHistory();
						}
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
				await rescheduleCourseNoteReminders(result.visibleEvents);
				await refreshNoteSummaries();
				setUsingCache(result.source === "cache");
			} catch (err: any) {
				if (isAuthReconnectRequiredError(err)) {
					await handleAuthExpired();
					return;
				}
				const cached = await readCachedSchedule(start, end, query, true);
				setEvents(cached.visibleEvents);
				await rescheduleCourseNoteReminders(cached.visibleEvents);
				await refreshNoteSummaries();
				setUsingCache(true);
				setError("");
			} finally {
				setLoading(false);
			}
		},
		[context, currentDate, handleAuthExpired, refreshChangeHistory, refreshNoteSummaries, viewMode]
	);

	useEffect(() => {
		(async () => {
			setLoading(true);
			let initialDate = new Date();
			let savedMode: ViewMode = "week";
			let savedGroups: (string | number)[] = [];
			try {
				const requestedDate = routeParams?.targetDate ? startOfDay(new Date(routeParams.targetDate)) : null;
				initialDate = requestedDate && !Number.isNaN(requestedDate.getTime()) ? requestedDate : new Date();
				const initialMode: ViewMode = requestedDate ? "day" : await getJSON<ViewMode>("viewMode", "week");
				const [cachedGroups, storedGroups, storedMode] = await Promise.all([
					getJSON<Group[]>("lastGroups", []),
					getJSON<(string | number)[]>("selectedGroups", []),
					Promise.resolve(initialMode),
				]);
				await refreshSyllabusList();
				savedGroups = storedGroups;
				savedMode = storedMode;
				if (cachedGroups.length) setGroups(cachedGroups);
				try {
					const allGroups = await getGroups();
					setGroups(allGroups);
					await setJSON("lastGroups", allGroups);
				} catch (err) {
					if (isAuthReconnectRequiredError(err)) {
						await handleAuthExpired();
						return;
					}
					if (!cachedGroups.length) setGroups([]);
				}
				setSelectedGroups(savedGroups);
				setViewMode(savedMode);
				setCurrentDate(initialDate);
				setFocusedDay(startOfDay(initialDate));
				const initialContext = { type: "group" as const, ids: savedGroups, label: "Mes groupes" };
				setContext(initialContext);
				await loadCalendar(initialContext, initialDate, savedMode);
			} catch {
				setGroups(await getJSON("lastGroups", []));
				const { start, end } = rangeFor(initialDate, savedMode);
				const cached = await readCachedSchedule(start, end, { groups: savedGroups }, true);
				setEvents(cached.visibleEvents);
				await rescheduleCourseNoteReminders(cached.visibleEvents);
				await refreshNoteSummaries();
				setUsingCache(true);
			} finally {
				setLoading(false);
			}
		})();
	}, []);

	useEffect(() => {
		if (!usingCache) return;
		const retryOnlineSync = () => loadCalendar(context, currentDate, viewMode);
		const timer = setInterval(retryOnlineSync, 20_000);
		const subscription = AppState.addEventListener("change", (state) => {
			if (state === "active") retryOnlineSync();
		});
		return () => {
			clearInterval(timer);
			subscription.remove();
		};
	}, [context, currentDate, loadCalendar, usingCache, viewMode]);

	useEffect(() => {
		if (usingCache) loadCalendar(context, currentDate, viewMode);
	}, [context, currentDate, loadCalendar, usingCache, viewMode]);

	useFocusEffect(
		useCallback(() => {
			refreshChangeHistory().catch(() => {});
			refreshSyllabusList().catch(() => {});
			const timer = setInterval(() => loadCalendar(context, currentDate, viewMode), minute);
			return () => clearInterval(timer);
		}, [context, currentDate, loadCalendar, refreshChangeHistory, refreshSyllabusList, viewMode])
	);

	useEffect(() => {
		if (!routeParams?.targetDate) return;
		const target = startOfDay(new Date(routeParams.targetDate));
		if (Number.isNaN(target.getTime())) return;
		const nextKey = getTargetEventKey(routeParams);
		setHighlightedEventKey(nextKey);
		setViewMode("day");
		setCurrentDate(target);
		setFocusedDay(target);
		setPickerMonth(target);
		loadCalendar(context, target, "day");
	}, [routeParams?.targetDate, routeParams?.eventId, routeParams?.eventReservationId, routeParams?.eventStartDate]);

	useEffect(() => {
		if (!routeParams?.openChangesPanel) return;
		refreshChangeHistory().catch(() => {});
		setShowChangesPanel(true);
	}, [refreshChangeHistory, routeParams?.changeKey, routeParams?.openChangesPanel]);

	const days = useMemo(() => {
		const { start } = getWeekRange(currentDate);
		return Array.from({ length: 7 }, (_, index) => {
			const d = new Date(start);
			d.setDate(d.getDate() + index);
			return d;
		});
	}, [currentDate]);

	const sortedEvents = useMemo(() => [...events].sort((a, b) => +new Date(a.startDate) - +new Date(b.startDate)), [events]);
	const activeScheduleEvents = useMemo(() => sortedEvents.filter((event) => !isEventCancelled(event) && !isEventIgnored(event)), [sortedEvents]);
	useEffect(() => {
		syncLiveCourseNotification(activeScheduleEvents, Date.now(), "calendar").catch(() => {});
		const timer = setInterval(() => syncLiveCourseNotification(activeScheduleEvents, Date.now(), "calendar").catch(() => {}), minute);
		return () => clearInterval(timer);
	}, [activeScheduleEvents]);
	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), minute);
		return () => clearInterval(timer);
	}, []);
	useEffect(() => {
		const targetKey = getTargetEventKey(routeParams);
		if (!targetKey) return;
		const exists = sortedEvents.some((event) => getLocalEventKey(event) === targetKey);
		if (exists) setHighlightedEventKey(targetKey);
	}, [routeParams?.eventId, routeParams?.eventReservationId, routeParams?.eventStartDate, sortedEvents]);

	const visibleEvents = useMemo(() => {
		if (viewMode === "list") return sortedEvents;
		const day = viewMode === "day" ? startOfDay(currentDate) : focusedDay;
		return sortedEvents.filter((event) => eventOverlapsDay(event, day));
	}, [currentDate, focusedDay, sortedEvents, viewMode]);
	const eventsByDay = useMemo(() => {
		const map = new Map<string, ZeusEvent[]>();
		days.forEach((day) => {
			map.set(
				dayKey(day),
				sortedEvents.filter((event) => eventOverlapsDay(event, day))
			);
		});
		return map;
	}, [days, sortedEvents]);

	const filteredGroups = useMemo(() => {
		const term = groupSearch.trim().toLowerCase();
		return groups.filter((group) => !term || group.name.toLowerCase().includes(term)).slice(0, 160);
	}, [groupSearch, groups]);

	const selectedLabels = selectedGroups.map((id) => groups.find((group) => group.id === id)?.name || String(id));
	const selectedDay = viewMode === "day" ? startOfDay(currentDate) : focusedDay;
	const selectedDayEvents = sortedEvents.filter((event) => eventOverlapsDay(event, selectedDay));
	const selectedDayActiveEvents = selectedDayEvents.filter((event) => !isEventCancelled(event) && !isEventIgnored(event));
	const selectedDayCancelledCount = selectedDayEvents.filter(isEventCancelled).length;
	const selectedDayIgnoredCount = selectedDayEvents.filter((event) => !isEventCancelled(event) && isEventIgnored(event)).length;
	const activeEventForDay = selectedDayActiveEvents.find((event) => new Date(event.startDate).getTime() <= now && new Date(event.endDate).getTime() > now);
	const nextEventForDay = selectedDayActiveEvents.find((event) => new Date(event.startDate).getTime() > now);
	const activeEvent = activeEventForDay || null;
	const nextEvent = activeEventForDay || nextEventForDay || activeScheduleEvents.find((event) => new Date(event.endDate).getTime() > now);
	const contextLabel = context.type === "group" ? selectedLabels.slice(0, 2).join(", ").replace("_", " ") || "Aucun groupe" : context.label;
	const compactDate = selectedDay.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
	const nextEventColor = nextEvent ? getCourseColor(nextEvent) : theme.accent;
	const nextEventStart = nextEvent ? new Date(nextEvent.startDate) : null;
	const nextEventEnd = nextEvent ? new Date(nextEvent.endDate) : null;
	const nextEventStartMillis = nextEventStart?.getTime() ?? Number.NaN;
	const nextEventEndMillis = nextEventEnd?.getTime() ?? Number.NaN;
	const nextEventIsNow = Number.isFinite(nextEventStartMillis) && Number.isFinite(nextEventEndMillis) && nextEventStartMillis <= now && nextEventEndMillis > now;
	const nextEventProgress = getCourseProgress(nextEventStartMillis, nextEventEndMillis, now);
	const nextEventRooms = nextEvent?.rooms?.map(getRoomName).filter(Boolean).join(", ");
	const nextEventStartTime = nextEventStart?.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) || "";
	const nextEventEndTime = nextEventEnd?.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) || "";
	const headerTitle =
		viewMode === "day"
			? currentDate.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })
			: `Semaine du ${getWeekRange(currentDate).start.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}`;
	const dateButtonLabel =
		viewMode === "week"
			? `${getWeekRange(currentDate).start.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} - ${new Date(
					getWeekRange(currentDate).end.getTime() - 86400000
				).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`
			: currentDate.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
	const selectedDayStatus = activeEvent
		? "En cours"
		: selectedDayActiveEvents.length
			? `${selectedDayActiveEvents.length} cours planifié${selectedDayActiveEvents.length > 1 ? "s" : ""}`
			: selectedDayCancelledCount
				? `${selectedDayCancelledCount} cours annulé${selectedDayCancelledCount > 1 ? "s" : ""}`
				: selectedDayIgnoredCount
					? `${selectedDayIgnoredCount} cours ignoré${selectedDayIgnoredCount > 1 ? "s" : ""}`
					: "Journée libre";
	const showCacheBanner = usingCache;
	const selectedEventSyllabus = useMemo(() => (selectedEvent ? findSyllabusForEvent(selectedEvent, syllabusList) : null), [selectedEvent, syllabusList]);
	const openEventSyllabus = (syllabus: AurigaSyllabus) => {
		setSelectedEvent(null);
		navigation.navigate("Notes", { mode: "syllabus", syllabusId: syllabus.id, syllabusRequestAt: Date.now() });
	};
	const clearChanges = async () => {
		await clearEventChangeHistory();
		setChangeHistory([]);
		setEventChanges([]);
		setShowChangesPanel(false);
	};

	const applyDate = (date: Date) => {
		const next = startOfDay(date);
		setCurrentDate(next);
		setFocusedDay(next);
		setPickerMonth(next);
		setShowDatePicker(false);
		loadCalendar(context, next, viewMode);
	};

	const setMode = async (mode: ViewMode) => {
		const nextDate = mode === "day" ? focusedDay : currentDate;
		setViewMode(mode);
		setCurrentDate(nextDate);
		await setJSON("viewMode", mode);
		loadCalendar(context, nextDate, mode);
	};

	const move = (delta: number) => {
		const next = new Date(currentDate);
		next.setDate(next.getDate() + (viewMode === "day" ? delta : delta * 7));
		setCurrentDate(next);
		if (viewMode !== "day") setFocusedDay(startOfDay(next));
		loadCalendar(context, next, viewMode);
	};

	const toggleGroup = async (id: string | number) => {
		const ids = selectedGroups.includes(id) ? selectedGroups.filter((value) => value !== id) : [...selectedGroups, id];
		setSelectedGroups(ids);
		await setJSON("selectedGroups", ids);
		refreshCourseWidgetsForGroups(ids).catch(() => {});
		if (context.type === "group") {
			const nextContext = { type: "group" as const, ids, label: "Mes groupes" };
			setContext(nextContext);
			loadCalendar(nextContext);
		}
	};

	const applyContext = (type: "single-group" | "teacher" | "room", id?: string | number, label = "Filtre") => {
		if (!id) return;
		const nextContext = { type, ids: [id], label };
		setContext(nextContext);
		setSelectedEvent(null);
		loadCalendar(nextContext);
	};

	const resetContext = () => {
		const nextContext = { type: "group" as const, ids: selectedGroups, label: "Mes groupes" };
		setContext(nextContext);
		loadCalendar(nextContext);
	};

	const openDetails = async (event: ZeusEvent) => {
		setSelectedEvent(event);
		if (!event.idReservation || isManualEvent(event) || isEventCancelled(event)) return;
		try {
			const details = await getReservationDetails(event.idReservation);
			let courseTypeName = details?.courseTypeName;
			if (!courseTypeName && details?.idType) {
				const type = await getCourseType(details.idType).catch((err) => {
					if (isAuthReconnectRequiredError(err)) throw err;
					return null;
				});
				courseTypeName = type?.type;
			}
			setSelectedEvent({ ...event, ...details, courseTypeName });
		} catch (err) {
			if (isAuthReconnectRequiredError(err)) {
				await handleAuthExpired();
				return;
			}
			setSelectedEvent(event);
		}
	};
	const deleteEvent = (event: ZeusEvent) => {
		const manual = isManualEvent(event);
		Alert.alert(
			"Supprimer l'événement",
			manual ? "Cet événement perso sera supprimé définitivement." : "Ce cours sera masqué localement. Tu pourras le restaurer depuis les réglages.",
			[
				{ text: "Annuler", style: "cancel" },
				{
					text: "Supprimer",
					style: "destructive",
					onPress: async () => {
						await deleteLocalEvent(event);
						const key = getLocalEventKey(event);
						const nextEvents = events.filter((item) => getLocalEventKey(item) !== key);
						const activeEvents = nextEvents.filter((item) => !isEventCancelled(item) && !isEventIgnored(item));
						setEvents(nextEvents);
						const notificationSettings = await getNotificationSettings();
						await Promise.all([
							rescheduleCourseNoteReminders(nextEvents),
							syncCourseWidgets(nextEvents),
							notificationSettings.enabled
								? scheduleLocalCourseNotifications(
										activeEvents,
										notificationSettings.minutesBefore,
										notificationSettings.selectedDays,
										notificationSettings.notificationType
									)
								: Promise.resolve(),
						]);
						await refreshNoteSummaries();
						setSelectedEvent(null);
					},
				},
			]
		);
	};

	const ignoreEvent = (event: ZeusEvent) => {
		const signature = getEventIgnoreSignature(event);
		if (!signature) return;
		Alert.alert("Ignorer ce cours", "Toutes les occurrences identiques resteront visibles dans l'agenda, mais seront exclues des notifications et des widgets.", [
			{ text: "Annuler", style: "cancel" },
			{
				text: "Ignorer",
				onPress: async () => {
					await ignoreCourse(event);
					const nextEvents = events.map((item) => (eventMatchesIgnoredCourse(item, [signature]) ? { ...item, isIgnored: true } : item));
					const activeEvents = nextEvents.filter((item) => !isEventCancelled(item) && !isEventIgnored(item));
					setEvents(nextEvents);
					const notificationSettings = await getNotificationSettings();
					await Promise.all([
						rescheduleCourseNoteReminders(nextEvents),
						syncCourseWidgets(nextEvents),
						notificationSettings.enabled
							? scheduleLocalCourseNotifications(
									activeEvents,
									notificationSettings.minutesBefore,
									notificationSettings.selectedDays,
									notificationSettings.notificationType
								)
							: Promise.resolve(),
					]);
					setSelectedEvent((current) => (current && eventMatchesIgnoredCourse(current, [signature]) ? { ...current, isIgnored: true } : current));
				},
			},
		]);
	};

	const reactivateEvent = (event: ZeusEvent) => {
		const signature = getEventIgnoreSignature(event);
		if (!signature) return;
		Alert.alert("Réactiver ce cours", "Toutes les occurrences identiques seront de nouveau prises en compte par les notifications et les widgets.", [
			{ text: "Annuler", style: "cancel" },
			{
				text: "Réactiver",
				onPress: async () => {
					await reactivateCourse(event);
					const nextEvents = events.map((item) => (eventMatchesIgnoredCourse(item, [signature]) ? { ...item, isIgnored: false } : item));
					const activeEvents = nextEvents.filter((item) => !isEventCancelled(item) && !isEventIgnored(item));
					setEvents(nextEvents);
					const notificationSettings = await getNotificationSettings();
					await Promise.all([
						rescheduleCourseNoteReminders(nextEvents),
						syncCourseWidgets(nextEvents),
						notificationSettings.enabled
							? scheduleLocalCourseNotifications(
									activeEvents,
									notificationSettings.minutesBefore,
									notificationSettings.selectedDays,
									notificationSettings.notificationType
								)
							: Promise.resolve(),
					]);
					setSelectedEvent((current) => (current && eventMatchesIgnoredCourse(current, [signature]) ? { ...current, isIgnored: false } : current));
				},
			},
		]);
	};

	const swipeGesture = Gesture.Pan()
		.activeOffsetX([-40, 40])
		.failOffsetY([-20, 20])
		.onEnd((e) => {
			if (e.translationX > 50) runOnJS(move)(-1);
			else if (e.translationX < -50) runOnJS(move)(1);
		});

	return (
		<CalendarContent
			applyContext={applyContext}
			applyDate={applyDate}
			changeHistory={changeHistory}
			clearChanges={clearChanges}
			compactDate={compactDate}
			context={context}
			contextLabel={contextLabel}
			currentDate={currentDate}
			dateButtonLabel={dateButtonLabel}
			dayKey={dayKey}
			days={days}
			deleteEvent={deleteEvent}
			error={error}
			eventChanges={eventChanges}
			eventsByDay={eventsByDay}
			filteredGroups={filteredGroups}
			focusedDay={focusedDay}
			groupSearch={groupSearch}
			headerTitle={headerTitle}
			highlightedEventKey={highlightedEventKey}
			ignoreEvent={ignoreEvent}
			loading={loading}
			move={move}
			nextEvent={nextEvent}
			nextEventColor={nextEventColor}
			nextEventEndTime={nextEventEndTime}
			nextEventIsNow={nextEventIsNow}
			nextEventProgress={nextEventProgress}
			nextEventRooms={nextEventRooms}
			nextEventStartTime={nextEventStartTime}
			noteSummaries={noteSummaries}
			now={now}
			openDetails={openDetails}
			pickerMonth={pickerMonth}
			reactivateEvent={reactivateEvent}
			refreshNoteSummaries={refreshNoteSummaries}
			resetContext={resetContext}
			selectedDay={selectedDay}
			selectedDayStatus={selectedDayStatus}
			selectedEvent={selectedEvent}
			selectedEventSyllabus={selectedEventSyllabus}
			selectedGroups={selectedGroups}
			selectedLabels={selectedLabels}
			setCurrentDate={setCurrentDate}
			setEventChanges={setEventChanges}
			setFocusedDay={setFocusedDay}
			setGroupSearch={setGroupSearch}
			setMode={setMode}
			setPickerMonth={setPickerMonth}
			setSelectedEvent={setSelectedEvent}
			setShowChangesPanel={setShowChangesPanel}
			setShowDatePicker={setShowDatePicker}
			setShowGroups={setShowGroups}
			setShowRooms={setShowRooms}
			showChangesPanel={showChangesPanel}
			showCacheBanner={showCacheBanner}
			showDatePicker={showDatePicker}
			showGroups={showGroups}
			showRooms={showRooms}
			swipeGesture={swipeGesture}
			toggleGroup={toggleGroup}
			viewMode={viewMode}
			visibleEvents={visibleEvents}
			openEventSyllabus={openEventSyllabus}
		/>
	);
}
