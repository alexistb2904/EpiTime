import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, AppState } from "react-native";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import { usePanGesture } from "react-native-gesture-handler";
import { useAuth } from "../context/AuthContext";
import { getCourseType, getGroups, getLocations, getReservationDetails, getRooms, getTeachers, isAuthReconnectRequiredError } from "../services/api";
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
import { Group, LocationNode, Room, Teacher, ZeusEvent } from "../types";
import { eventOverlapsDay, getWeekRange, startOfDay } from "../utils/calendar";
import { buildGroupTree, filterGroupTree } from "../utils/groups";
import { buildScheduleFilterQuery, ScheduleFilters, sortByLabel } from "../utils/scheduleFilters";
import { CalendarContent } from "../components/calendar/CalendarContent";
import { CalendarRouteParams, ScheduleContext, ViewMode, dayKey, getTargetEventKey, minute } from "../components/calendar/calendarModel";
import { trackEvent } from "../services/analytics";

const FILTER_ROOMS_CACHE_KEY = "filterOptions.rooms";
const FILTER_TEACHERS_CACHE_KEY = "filterOptions.teachers";
const FILTER_LOCATIONS_CACHE_KEY = "filterOptions.locations";

const sortRooms = (items: Room[] = []) => sortByLabel(items, (room) => room.name || "");
const sortTeachers = (items: Teacher[] = []) => sortByLabel(items, (teacher) => `${teacher.firstname || ""} ${teacher.name || ""}`);

export default function CalendarScreen() {
	const { handleAuthExpired } = useAuth();
	const route = useRoute<any>();
	const navigation = useNavigation<any>();
	const routeParams = route.params as CalendarRouteParams | undefined;
	const [groups, setGroups] = useState<Group[]>([]);
	const [selectedGroups, setSelectedGroups] = useState<(string | number)[]>([]);
	const [rooms, setRooms] = useState<Room[]>([]);
	const [selectedRooms, setSelectedRooms] = useState<(string | number)[]>([]);
	const [teachers, setTeachers] = useState<Teacher[]>([]);
	const [locations, setLocations] = useState<LocationNode[]>([]);
	const [selectedTeachers, setSelectedTeachers] = useState<(string | number)[]>([]);
	const [filterOptionsLoading, setFilterOptionsLoading] = useState(false);
	const filterOptionsLoadedRef = useRef(false);
	const filterOptionsRequestRef = useRef<Promise<void> | null>(null);
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
	const selectedFilters = useMemo<ScheduleFilters>(
		() => ({ groups: selectedGroups, rooms: selectedRooms, teachers: selectedTeachers }),
		[selectedGroups, selectedRooms, selectedTeachers]
	);

	const refreshNoteSummaries = useCallback(async () => {
		setNoteSummaries(await getCourseNoteSummaries());
	}, [handleAuthExpired]);

	const refreshSyllabusList = useCallback(async () => {
		setSyllabusList(await getCachedAurigaSyllabus());
	}, []);

	const refreshChangeHistory = useCallback(async () => {
		setChangeHistory(await getEventChangeHistory());
	}, []);

	const refreshGroups = useCallback(
		async (cachedGroups: Group[] = []) => {
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
		},
		[handleAuthExpired]
	);

	const loadFilterOptions = useCallback(async () => {
		if (filterOptionsLoadedRef.current) return;
		if (filterOptionsRequestRef.current) {
			await filterOptionsRequestRef.current;
			return;
		}

		const request = (async () => {
			setFilterOptionsLoading(true);
			try {
				const [cachedRooms, cachedTeachers, cachedLocations] = await Promise.all([
					getJSON<Room[]>(FILTER_ROOMS_CACHE_KEY, []),
					getJSON<Teacher[]>(FILTER_TEACHERS_CACHE_KEY, []),
					getJSON<LocationNode[]>(FILTER_LOCATIONS_CACHE_KEY, []),
				]);
				// Saved already sorted.
				if (cachedRooms.length) setRooms(cachedRooms);
				if (cachedTeachers.length) setTeachers(cachedTeachers);
				if (cachedLocations.length) setLocations(cachedLocations);
				// Campus names for grouping rooms: optional, rooms still list without them.
				void getLocations()
					.then((items) => {
						if (!items?.length) return;
						setLocations(items);
						void setJSON(FILTER_LOCATIONS_CACHE_KEY, items).catch(() => {});
					})
					.catch(() => {});

				// Start both Zeus calls together, but update each list as soon as its
				// own response arrives instead of waiting for the slower endpoint.
				const roomsRequest = getRooms().then((items) => {
					const sortedRooms = sortRooms(items || []);
					setRooms(sortedRooms);
					void setJSON(FILTER_ROOMS_CACHE_KEY, sortedRooms).catch(() => {});
					return sortedRooms;
				});
				const teachersRequest = getTeachers().then((items) => {
					const sortedTeachers = sortTeachers(items || []);
					setTeachers(sortedTeachers);
					void setJSON(FILTER_TEACHERS_CACHE_KEY, sortedTeachers).catch(() => {});
					return sortedTeachers;
				});
				const [roomsResult, teachersResult] = await Promise.allSettled([roomsRequest, teachersRequest]);
				const authError = [roomsResult, teachersResult].find((result) => result.status === "rejected" && isAuthReconnectRequiredError(result.reason));
				if (authError) {
					await handleAuthExpired();
					return;
				}
				filterOptionsLoadedRef.current = roomsResult.status === "fulfilled" && teachersResult.status === "fulfilled";
			} finally {
				setFilterOptionsLoading(false);
			}
		})();

		filterOptionsRequestRef.current = request;
		try {
			await request;
		} finally {
			if (filterOptionsRequestRef.current === request) filterOptionsRequestRef.current = null;
		}
	}, [handleAuthExpired]);

	const loadCalendar = useCallback(
		async (nextContext = context, nextDate = currentDate, nextView = viewMode, nextFilters = selectedFilters) => {
			const startedAt = Date.now();
			setLoading(true);
			setError("");
			const { start, end } = getWeekRange(nextDate);
			const query = buildScheduleFilterQuery(nextFilters, nextContext);
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
				void trackEvent("calendar_loaded", {
					source: result.source === "cache" ? "cache" : "api",
					view_mode: nextView,
					event_count: result.visibleEvents.length,
					cancelled_count: result.visibleEvents.filter(isEventCancelled).length,
					load_ms: Date.now() - startedAt,
				});
				if (result.source === "cache") void trackEvent("offline_cache_used", { resource: "calendar", result: "success" });
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
							notificationSettings.notificationType,
							{ requestPermission: false }
						);
					}
				}
				await rescheduleCourseNoteReminders(result.visibleEvents);
				await refreshNoteSummaries();
				setUsingCache(result.source === "cache");
			} catch (err: any) {
				// An expired session still shows the saved planning. The retry loop is for network errors only.
				const sessionExpired = isAuthReconnectRequiredError(err);
				if (sessionExpired) await handleAuthExpired();
				const cached = await readCachedSchedule(start, end, query, true);
				setEvents(cached.visibleEvents);
				await rescheduleCourseNoteReminders(cached.visibleEvents);
				await refreshNoteSummaries();
				setUsingCache(!sessionExpired);
				void trackEvent("calendar_load_failed", { error_kind: "unknown", load_ms: Date.now() - startedAt });
				void trackEvent("offline_cache_used", { resource: "calendar", result: "success" });
				setError("");
			} finally {
				setLoading(false);
			}
		},
		[context, currentDate, handleAuthExpired, refreshChangeHistory, refreshNoteSummaries, selectedFilters, viewMode]
	);

	useEffect(() => {
		(async () => {
			setLoading(true);
			let initialDate = new Date();
			let savedMode: ViewMode = "week";
			let savedGroups: (string | number)[] = [];
			let savedRooms: (string | number)[] = [];
			let savedTeachers: (string | number)[] = [];
			try {
				const requestedDate = routeParams?.targetDate ? startOfDay(new Date(routeParams.targetDate)) : null;
				initialDate = requestedDate && !Number.isNaN(requestedDate.getTime()) ? requestedDate : new Date();
				const storedViewMode = await getJSON<string>("viewMode", "week");
				// "day" was a separate mode before the rework; it is now the default day agenda ("week").
				const initialMode: ViewMode = requestedDate || storedViewMode !== "list" ? "week" : "list";
				const [cachedGroups, storedGroups, storedRooms, storedTeachers, storedMode] = await Promise.all([
					getJSON<Group[]>("lastGroups", []),
					getJSON<(string | number)[]>("selectedGroups", []),
					getJSON<(string | number)[]>("selectedRooms", []),
					getJSON<(string | number)[]>("selectedTeachers", []),
					Promise.resolve(initialMode),
				]);
				savedGroups = storedGroups;
				savedRooms = storedRooms;
				savedTeachers = storedTeachers;
				savedMode = storedMode;
				if (cachedGroups.length) setGroups(cachedGroups);
				setSelectedGroups(savedGroups);
				setSelectedRooms(savedRooms);
				setSelectedTeachers(savedTeachers);
				setViewMode(savedMode);
				setCurrentDate(initialDate);
				setFocusedDay(startOfDay(initialDate));
				const initialContext = { type: "group" as const, ids: savedGroups, label: "Mes filtres" };
				setContext(initialContext);
				await loadCalendar(initialContext, initialDate, savedMode, { groups: savedGroups, rooms: savedRooms, teachers: savedTeachers });
				void refreshGroups(cachedGroups);
				void refreshSyllabusList();
			} catch {
				setGroups(await getJSON("lastGroups", []));
				const { start, end } = getWeekRange(initialDate);
				const cached = await readCachedSchedule(start, end, { groups: savedGroups, rooms: savedRooms, teachers: savedTeachers }, true);
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
		setViewMode("week");
		setCurrentDate(target);
		setFocusedDay(target);
		setPickerMonth(target);
		loadCalendar(context, target, "week");
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

	const visibleEvents = useMemo(
		() => (viewMode === "list" ? sortedEvents : sortedEvents.filter((event) => eventOverlapsDay(event, focusedDay))),
		[focusedDay, sortedEvents, viewMode]
	);
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

	const groupTree = useMemo(() => buildGroupTree(groups), [groups]);
	const filteredGroups = useMemo(() => filterGroupTree(groupTree, groupSearch), [groupTree, groupSearch]);

	const selectedLabels = selectedGroups.map((id) => groups.find((group) => group.id === id)?.name || String(id));
	const extraFilterCount = selectedRooms.length + selectedTeachers.length;
	const contextLabel =
		context.type === "group"
			? selectedLabels.length > 2
				? `${selectedLabels.slice(0, 2).join(", ")} +${selectedLabels.length - 2}`
				: selectedLabels.join(", ") || (extraFilterCount ? "Mon planning" : "Aucun groupe choisi")
			: context.label;
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
		void trackEvent("calendar_date_changed", { direction: "picker" });
		loadCalendar(context, next, viewMode);
	};

	const setMode = async (mode: ViewMode, date: Date = currentDate) => {
		setViewMode(mode);
		setCurrentDate(date);
		await setJSON("viewMode", mode);
		void trackEvent("calendar_view_changed", { view_mode: mode });
		loadCalendar(context, date, mode);
	};

	// Tapping a day always opens that day's agenda, even from the week list.
	const selectDay = (day: Date) => {
		const next = startOfDay(day);
		setFocusedDay(next);
		if (viewMode === "list") setMode("week", next);
		else setCurrentDate(next);
	};

	const move = (delta: number) => {
		const next = new Date(currentDate);
		next.setDate(next.getDate() + delta * 7);
		setCurrentDate(next);
		setFocusedDay(startOfDay(next));
		void trackEvent("calendar_date_changed", { direction: delta > 0 ? "next" : "previous" });
		loadCalendar(context, next, viewMode);
	};

	const moveDay = (delta: number) => {
		const next = startOfDay(focusedDay);
		next.setDate(next.getDate() + delta);
		const { start, end } = getWeekRange(currentDate);
		setFocusedDay(next);
		setCurrentDate(next);
		if (next < start || next >= end) {
			void trackEvent("calendar_date_changed", { direction: delta > 0 ? "next" : "previous" });
			loadCalendar(context, next, viewMode);
		}
	};

	const applyFilters = async (nextFilters: ScheduleFilters) => {
		setSelectedGroups(nextFilters.groups);
		setSelectedRooms(nextFilters.rooms);
		setSelectedTeachers(nextFilters.teachers);
		await Promise.all([setJSON("selectedGroups", nextFilters.groups), setJSON("selectedRooms", nextFilters.rooms), setJSON("selectedTeachers", nextFilters.teachers)]);
		refreshCourseWidgetsForGroups(nextFilters.groups).catch(() => {});
		const nextContext = context.type === "group" ? { type: "group" as const, ids: nextFilters.groups, label: "Mes filtres" } : context;
		setContext(nextContext);
		loadCalendar(nextContext, currentDate, viewMode, nextFilters);
	};

	const applyContext = (type: "single-group" | "teacher" | "room", id?: string | number, label = "Filtre") => {
		if (!id) return;
		const nextContext = { type, ids: [id], label };
		void trackEvent("calendar_context_changed", { context_type: type === "single-group" ? "group" : type });
		setContext(nextContext);
		setSelectedEvent(null);
		loadCalendar(nextContext);
	};

	const resetContext = () => {
		const nextContext = { type: "group" as const, ids: selectedGroups, label: "Mes filtres" };
		setContext(nextContext);
		loadCalendar(nextContext);
	};

	const openDetails = async (event: ZeusEvent) => {
		setSelectedEvent(event);
		void trackEvent("event_details_opened", {
			has_room: Boolean(event.rooms?.length),
			has_teacher: Boolean(event.teachers?.length),
			is_cancelled: isEventCancelled(event),
		});
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
			if (isAuthReconnectRequiredError(err)) await handleAuthExpired();
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
										notificationSettings.notificationType,
										{ requestPermission: false }
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
		event = events.find((item) => getLocalEventKey(item) === getLocalEventKey(event)) || event;
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
									notificationSettings.notificationType,
									{ requestPermission: false }
								)
							: Promise.resolve(),
					]);
					setSelectedEvent((current) => (current && getLocalEventKey(current) === getLocalEventKey(event) ? { ...current, isIgnored: true } : current));
				},
			},
		]);
	};

	const reactivateEvent = (event: ZeusEvent) => {
		event = events.find((item) => getLocalEventKey(item) === getLocalEventKey(event)) || event;
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
									notificationSettings.notificationType,
									{ requestPermission: false }
								)
							: Promise.resolve(),
					]);
					setSelectedEvent((current) => (current && getLocalEventKey(current) === getLocalEventKey(event) ? { ...current, isIgnored: false } : current));
				},
			},
		]);
	};

	const swipeGesture = usePanGesture({
		activeOffsetX: [-40, 40],
		failOffsetY: [-20, 20],
		runOnJS: true,
		onDeactivate: (e) => {
			const step = viewMode === "list" ? move : moveDay;
			if (e.translationX > 50) step(-1);
			else if (e.translationX < -50) step(1);
		},
	});

	return (
		<CalendarContent
			applyContext={applyContext}
			applyDate={applyDate}
			changeHistory={changeHistory}
			clearChanges={clearChanges}
			context={context}
			contextLabel={contextLabel}
			currentDate={currentDate}
			dayKey={dayKey}
			days={days}
			extraFilterCount={extraFilterCount}
			selectDay={selectDay}
			deleteEvent={deleteEvent}
			error={error}
			eventChanges={eventChanges}
			eventsByDay={eventsByDay}
			groups={groups}
			filteredGroups={filteredGroups}
			focusedDay={focusedDay}
			groupSearch={groupSearch}
			highlightedEventKey={highlightedEventKey}
			ignoreEvent={ignoreEvent}
			loading={loading}
			move={move}
			noteSummaries={noteSummaries}
			now={now}
			openDetails={openDetails}
			pickerMonth={pickerMonth}
			reactivateEvent={reactivateEvent}
			refreshNoteSummaries={refreshNoteSummaries}
			resetContext={resetContext}
			selectedEvent={selectedEvent}
			selectedEventSyllabus={selectedEventSyllabus}
			selectedGroups={selectedGroups}
			selectedRooms={selectedRooms}
			selectedTeachers={selectedTeachers}
			rooms={rooms}
			teachers={teachers}
			locations={locations}
			filterOptionsLoading={filterOptionsLoading}
			onLoadFilterOptions={loadFilterOptions}
			setEventChanges={setEventChanges}
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
			applyFilters={applyFilters}
			viewMode={viewMode}
			visibleEvents={visibleEvents}
			openEventSyllabus={openEventSyllabus}
		/>
	);
}
