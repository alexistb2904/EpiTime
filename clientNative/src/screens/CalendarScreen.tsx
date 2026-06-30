import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, AppState, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect, useRoute } from "@react-navigation/native";
import Animated, { FadeInDown, FadeInUp, Layout, runOnJS } from "react-native-reanimated";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import {
	Bell,
	CalendarDays,
	Check,
	ChevronLeft,
	ChevronRight,
	Clock,
	DoorOpen,
	Filter,
	Layers,
	MapPin,
	Navigation,
	Paperclip,
	RotateCcw,
	Search,
	SlidersHorizontal,
	StickyNote,
	Users,
	WifiOff,
	X,
} from "lucide-react-native";
import Card from "../components/Card";
import DatePickerModal from "../components/DatePickerModal";
import EventDetailsModal from "../components/EventDetailsModal";
import { useTheme } from "../context/ThemeContext";
import { getAvailableRooms, getCourseType, getGroups, getLocations, getReservationDetails, getRooms, getRoomTypes } from "../services/api";
import { CourseNoteSummary, getCourseNoteSummaries, rescheduleCourseNoteReminders } from "../services/courseNotes";
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
import { getNotificationSettings, notifyEventChanges, scheduleLocalCourseNotifications } from "../services/notifications";
import { readCachedSchedule, syncSchedule } from "../services/scheduleRepository";
import { refreshCourseWidgetsForGroups, syncCourseWidgets } from "../services/widgets";
import { Group, LocationNode, Room, RoomType, ZeusEvent } from "../types";
import {
	eventOverlapsDay,
	formatDateRange,
	getCourseColor,
	getCourseTypeLabel,
	getEventTitle,
	getRoomName,
	getTeacherName,
	getWeekRange,
	hexToRgba,
	openUrl,
	startOfDay,
} from "../utils/calendar";
import { getRoomMapUrl } from "../utils/rooms";

type ViewMode = "week" | "day" | "list";
type ScheduleContext = { type: "group" | "single-group" | "teacher" | "room"; ids: (string | number)[]; label: string };
type CalendarRouteParams = {
	targetDate?: string;
	eventId?: string | number;
	eventReservationId?: string | number;
	eventStartDate?: string;
};

const minute = 60_000;

const rangeFor = (date: Date, viewMode: ViewMode) => {
	if (viewMode === "day") {
		const start = startOfDay(date);
		const end = new Date(start);
		end.setDate(end.getDate() + 1);
		return { start, end };
	}
	return getWeekRange(date);
};

const getLocationLabel = (node: LocationNode) => {
	const overrides: Record<string, string> = { "2": "Kremlin-Bicêtre", "7": "Partialie", "8": "Pasteur", "9": "Voltaire", "10": "Campus Cyber" };
	return overrides[String(node.id)] || node.name || `Lieu #${node.id}`;
};

const flattenLocations = (nodes: LocationNode[] = []): Array<{ id: string | number; name: string }> => {
	const result: Array<{ id: string | number; name: string }> = [];
	const walk = (items: LocationNode[]) => {
		items.forEach((node) => {
			const type = (node.type || "").toLowerCase();
			if (type.includes("location") || node.id_type === 0) result.push({ id: node.id, name: getLocationLabel(node) });
			if (node.children?.length) walk(node.children);
		});
	};
	walk(nodes);
	return Array.from(new Map(result.map((item) => [String(item.id), item])).values());
};

const dayKey = (date: Date) => startOfDay(date).toISOString();

const getTargetEventKey = (params?: CalendarRouteParams) => {
	if (!params?.eventStartDate) return null;
	return `${params.eventReservationId || params.eventId || "event"}-${params.eventStartDate}`;
};

const getCourseProgress = (startMillis: number, endMillis: number, now: number) => {
	const duration = endMillis - startMillis;
	if (!Number.isFinite(duration) || duration <= 0) return 0;
	const progress = ((now - startMillis) / duration) * 100;
	return Math.max(0, Math.min(100, Math.round(progress)));
};

export default function CalendarScreen() {
	const { theme } = useTheme();
	const route = useRoute<any>();
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
	const [now, setNow] = useState(Date.now());
	const [noteSummaries, setNoteSummaries] = useState<Record<string, CourseNoteSummary>>({});

	const refreshNoteSummaries = useCallback(async () => {
		setNoteSummaries(await getCourseNoteSummaries());
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
						if (notificationSettings.changeDetectionEnabled) await notifyEventChanges(result.changes, notificationSettings.notificationType);
					}
					if (notificationSettings.enabled) {
						await scheduleLocalCourseNotifications(result.activeEvents, notificationSettings.minutesBefore, notificationSettings.selectedDays, notificationSettings.notificationType);
					}
				}
				await rescheduleCourseNoteReminders(result.visibleEvents);
				await refreshNoteSummaries();
				setUsingCache(result.source === "cache");
			} catch (err: any) {
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
		[context, currentDate, refreshNoteSummaries, viewMode]
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
				savedGroups = storedGroups;
				savedMode = storedMode;
				if (cachedGroups.length) setGroups(cachedGroups);
				try {
					const allGroups = await getGroups();
					setGroups(allGroups);
					await setJSON("lastGroups", allGroups);
				} catch {
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
			const timer = setInterval(() => loadCalendar(context, currentDate, viewMode), minute);
			return () => clearInterval(timer);
		}, [context, currentDate, loadCalendar, viewMode])
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
				const type = await getCourseType(details.idType).catch(() => null);
				courseTypeName = type?.type;
			}
			setSelectedEvent({ ...event, ...details, courseTypeName });
		} catch {
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
		<GestureDetector gesture={swipeGesture}>
			<View style={[s.root, { backgroundColor: theme.bg }]}>
				<ScrollView contentContainerStyle={s.content}>
					<View pointerEvents="none" style={[s.topBand, { backgroundColor: theme.mode === "dark" ? "#171923" : "#e8edf6" }]} />

					<Animated.View entering={FadeInUp.duration(380)} style={s.header}>
						<View style={s.headerCopy}>
							<Text style={[s.eyebrow, { color: theme.accent }]}>Agenda</Text>
							<Text style={[s.title, { color: theme.text }]} numberOfLines={2}>
								{headerTitle}
							</Text>
						</View>
						<View style={s.headerActions}>
							<Pressable style={[s.iconBtn, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={() => setShowGroups(true)}>
								<Users color={theme.text} size={21} />
							</Pressable>
							<Pressable style={[s.iconBtn, { backgroundColor: theme.accent, borderColor: theme.accent }]} onPress={() => setShowRooms(true)}>
								<DoorOpen color="#fff" size={20} />
							</Pressable>
						</View>
					</Animated.View>

					<Animated.View
						entering={FadeInDown.delay(55).duration(400)}
						style={[s.overviewCard, { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.cardShadow }]}>
						<View style={s.overviewTop}>
							<View style={[s.dateTile, { backgroundColor: nextEvent ? hexToRgba(nextEventColor, 0.16) : theme.accentSoft }]}>
								<Text style={[s.dateTileMonth, { color: nextEventColor }]}>{selectedDay.toLocaleDateString("fr-FR", { month: "short" })}</Text>
								<Text style={[s.dateTileDay, { color: theme.text }]}>{selectedDay.getDate()}</Text>
							</View>
							<View style={s.overviewCopy}>
								<Text style={[s.overviewLabel, { color: theme.muted }]} numberOfLines={1}>
									{compactDate} · {contextLabel}
								</Text>
								<Text style={[s.overviewTitle, { color: theme.text }]} numberOfLines={2}>
									{selectedDayStatus}
								</Text>
							</View>
						</View>
						{nextEvent ? (
							<View
								style={[
									s.nextStrip,
									nextEventIsNow && s.nextStripLive,
									{ backgroundColor: hexToRgba(nextEventColor, 0.13), borderColor: hexToRgba(nextEventColor, 0.34) },
								]}>
								{nextEventIsNow ? (
									<>
										<View style={s.nextLiveTop}>
											<View style={[s.nextDot, { backgroundColor: nextEventColor }]} />
											<View style={s.nextCopy}>
												<Text style={[s.nextLabel, { color: nextEventColor }]}>Maintenant jusqu'à {nextEventEndTime}</Text>
												<Text style={[s.nextTitle, { color: theme.text }]} numberOfLines={1}>
													{getEventTitle(nextEvent)}
												</Text>
											</View>
										</View>
										<View style={s.nextLiveMeta}>
											<View style={[s.nextLivePill, { backgroundColor: hexToRgba(nextEventColor, 0.14) }]}>
												<MapPin color={nextEventColor} size={14} />
												<Text style={[s.nextLivePillText, { color: theme.text }]} numberOfLines={1}>
													{nextEventRooms || "Lieu à confirmer"}
												</Text>
											</View>
										</View>
										<View style={[s.nextProgressTrack, { backgroundColor: hexToRgba(nextEventColor, 0.16) }]}>
											<View style={[s.nextProgressFill, { width: `${nextEventProgress}%`, backgroundColor: nextEventColor }]} />
										</View>
									</>
								) : (
									<>
										<View style={[s.nextDot, { backgroundColor: nextEventColor }]} />
										<View style={s.nextCopy}>
											<Text style={[s.nextLabel, { color: nextEventColor }]}>Prochain</Text>
											<Text style={[s.nextTitle, { color: theme.text }]} numberOfLines={1}>
												{getEventTitle(nextEvent)}
											</Text>
										</View>
										<View
											style={[
												{
													backgroundColor: hexToRgba(nextEventColor, 0.14),
													borderRadius: 8,
													padding: 2,
													flexDirection: "column",
													alignItems: "flex-start",
												},
											]}>
											<Text style={[s.nextTime, { color: theme.text }]}>{nextEventStartTime}</Text>
											<Text style={[s.nextTime, { color: theme.text, fontSize: 12 }]}>{nextEventEndTime}</Text>
										</View>
									</>
								)}
							</View>
						) : null}
					</Animated.View>

					<Animated.View entering={FadeInDown.delay(95).duration(380)} style={s.toolbar}>
						<Pressable style={[s.navBtn, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={() => move(-1)}>
							<ChevronLeft color={theme.text} size={20} />
						</Pressable>
						<Pressable
							style={[s.todayBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
							onPress={() => {
								setPickerMonth(currentDate);
								setShowDatePicker(true);
							}}>
							<CalendarDays color={theme.accent} size={17} />
							<Text style={[s.todayText, { color: theme.text }]} numberOfLines={1}>
								{dateButtonLabel}
							</Text>
						</Pressable>
						<Pressable style={[s.navBtn, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={() => move(1)}>
							<ChevronRight color={theme.text} size={20} />
						</Pressable>
					</Animated.View>

						{showCacheBanner ? (
							<Animated.View entering={FadeInDown.duration(300)} style={[s.offline, { backgroundColor: theme.accentSoft, borderColor: theme.border }]}>
								<WifiOff color={theme.accent} size={17} />
								<Text style={[s.offlineText, { color: theme.text }]}>Agenda chargé depuis le cache. Synchronisation en nouvel essai.</Text>
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

					<Animated.View entering={FadeInDown.delay(130).duration(380)} style={[s.segment, { backgroundColor: theme.surfaceSoft }]}>
						{(["week", "day", "list"] as ViewMode[]).map((mode) => (
							<Pressable key={mode} style={[s.segmentItem, viewMode === mode && { backgroundColor: theme.surface }]} onPress={() => setMode(mode)}>
								<Text style={[s.segmentText, { color: viewMode === mode ? theme.text : theme.muted }]}>
									{mode === "week" ? "Semaine" : mode === "day" ? "Jour" : "Liste"}
								</Text>
							</Pressable>
						))}
					</Animated.View>

					{context.type !== "group" ? (
						<Card style={s.contextCard} variant="compact" accent accentColor={theme.warn}>
							<Filter color={theme.accent} size={18} />
							<Text style={[s.contextText, { color: theme.text }]} numberOfLines={1}>
								{context.label}
							</Text>
							<Pressable onPress={resetContext}>
								<X color={theme.muted} size={20} />
							</Pressable>
						</Card>
					) : null}

					{viewMode === "week" ? (
						<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.daysStrip}>
							{days.map((day) => {
								const active = day.toDateString() === focusedDay.toDateString();
								const dayEvents = eventsByDay.get(dayKey(day)) || [];
								return (
									<Pressable
										key={day.toISOString()}
										style={[s.dayPill, { backgroundColor: active ? theme.accent : theme.surface, borderColor: active ? theme.accent : theme.border }]}
										onPress={() => {
											const selectedDay = startOfDay(day);
											setFocusedDay(selectedDay);
											setCurrentDate(selectedDay);
										}}>
										<Text style={[s.dayName, { color: active ? "#fff" : theme.muted }]}>{day.toLocaleDateString("fr-FR", { weekday: "short" })}</Text>
										<Text style={[s.dayNum, { color: active ? "#fff" : theme.text }]}>{day.getDate()}</Text>
										<View style={s.dayDots}>
											{dayEvents.slice(0, 4).map((event, index) => (
												<View
													key={`${event.idReservation || event.id || index}`}
													style={[
														s.dayDot,
														isEventCancelled(event) && s.dayDotCancelled,
														{ backgroundColor: active ? "#fff" : isEventCancelled(event) ? theme.muted : getCourseColor(event) },
													]}
												/>
											))}
										</View>
										<Text style={[s.dayCount, { color: active ? "#fff" : theme.muted }]}>{dayEvents.length}</Text>
									</Pressable>
								);
							})}
						</ScrollView>
					) : null}

					{error ? <Text style={[s.error, { color: theme.warn }]}>{error}</Text> : null}
					{loading ? <ActivityIndicator color={theme.accent} style={s.loader} /> : null}
					{visibleEvents.length === 0 && !loading ? (
						<Card style={s.emptyCard}>
							<CalendarDays color={theme.accent} size={26} />
							<Text style={[s.emptyTitle, { color: theme.text }]}>Aucun cours</Text>
							<Text style={[s.meta, { color: theme.muted }]}>Change de date, de groupe ou synchronise tes préférences.</Text>
						</Card>
					) : (
						visibleEvents.map((event, index) => (
							<EventCard
								key={`${event.idReservation || event.id || index}-${event.startDate}`}
								event={event}
								index={index}
								highlighted={highlightedEventKey === getLocalEventKey(event)}
								noteSummary={noteSummaries[getLocalEventKey(event)]}
								now={now}
								onPress={() => openDetails(event)}
							/>
						))
					)}
				</ScrollView>

				<GroupModal
					visible={showGroups}
					groups={filteredGroups}
					selected={selectedGroups}
					search={groupSearch}
					selectedLabels={selectedLabels}
					onSearch={setGroupSearch}
					onToggle={toggleGroup}
					onClose={() => setShowGroups(false)}
				/>
				<DatePickerModal
					visible={showDatePicker}
					currentDate={currentDate}
					pickerMonth={pickerMonth}
					onChangeMonth={setPickerMonth}
					onSelectDate={applyDate}
					onToday={() => applyDate(new Date())}
					onClose={() => setShowDatePicker(false)}
				/>
				<EventDetailsModal
					event={selectedEvent}
					onClose={() => setSelectedEvent(null)}
					onApplyContext={applyContext}
					onDelete={deleteEvent}
					onIgnore={ignoreEvent}
					onReactivate={reactivateEvent}
					onNotesChanged={refreshNoteSummaries}
				/>
				<RoomFinderModal
					visible={showRooms}
					selectedGroups={selectedGroups}
					onApplyRoom={(room) => {
						applyContext("room", room.id, room.name);
						setShowRooms(false);
					}}
					onClose={() => setShowRooms(false)}
				/>
			</View>
		</GestureDetector>
	);
}

function formatEventChangeNotice(changes: EventChange[]) {
	const first = changes[0];
	const start = new Date(first.startDate);
	const time = Number.isNaN(start.getTime()) ? "" : ` à ${start.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
	const suffix = changes.length > 1 ? ` (+${changes.length - 1})` : "";
	return `Cours modifié${suffix} : ${first.title}${time}, ${first.summary}`;
}

function EventCard({
	event,
	index,
	highlighted,
	noteSummary,
	now,
	onPress,
}: {
	event: ZeusEvent;
	index: number;
	highlighted?: boolean;
	noteSummary?: CourseNoteSummary;
	now: number;
	onPress: () => void;
}) {
	const { theme } = useTheme();
	const rooms = event.rooms?.map(getRoomName).filter(Boolean).join(", ");
	const teachers = event.teachers?.map(getTeacherName).filter(Boolean).slice(0, 2).join(", ");
	const color = getCourseColor(event);
	const start = new Date(event.startDate);
	const end = new Date(event.endDate);
	const startMillis = start.getTime();
	const endMillis = end.getTime();
	const typeName = getCourseTypeLabel(event);
	const cancelled = isEventCancelled(event);
	const ignored = isEventIgnored(event);
	const inactive = cancelled || ignored;
	const isNow = !inactive && startMillis <= now && endMillis > now;
	const progress = getCourseProgress(startMillis, endMillis, now);
	const visualColor = cancelled || ignored ? theme.muted : color;
	return (
		<Animated.View entering={FadeInDown.delay(Math.min(index, 12) * 35).duration(320)} layout={Layout.springify()}>
			<Card
				style={[
					s.eventCard,
					inactive && s.eventCardCancelled,
					highlighted && s.eventCardHighlighted,
					{ borderColor: inactive ? theme.muted : highlighted || isNow ? color : theme.border, backgroundColor: inactive ? theme.surfaceSoft : theme.surface },
				]}
				variant="flat"
				accent
				accentColor={visualColor}
				onPress={onPress}>
				<View style={s.eventShell}>
					<View style={[s.timeBlock, { backgroundColor: inactive ? theme.bg : hexToRgba(color, theme.mode === "dark" ? 0.18 : 0.12) }]}>
						<Text style={[s.eventTime, { color: visualColor }]}>{start.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</Text>
						<Text style={[s.eventEnd, { color: theme.muted }]}>{end.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</Text>
					</View>
					<View style={s.eventContent}>
						<View style={s.eventTop}>
							{cancelled ? (
								<View style={[s.cancelledChip, { backgroundColor: theme.bg, borderColor: theme.muted }]}>
									<X color={theme.muted} size={13} />
									<Text style={[s.cancelledText, { color: theme.muted }]}>Annulé</Text>
								</View>
							) : ignored ? (
								<View style={[s.cancelledChip, { backgroundColor: theme.bg, borderColor: theme.muted }]}>
									<Filter color={theme.muted} size={13} />
									<Text style={[s.cancelledText, { color: theme.muted }]}>Ignoré</Text>
								</View>
							) : (
								<View style={[s.typeChip, { backgroundColor: hexToRgba(color, 0.14) }]}>
									<Text style={[s.typeText, { color }]} numberOfLines={1}>
										{typeName}
									</Text>
								</View>
							)}
							<View style={s.eventIndicators}>
								{event.isOnline ? (
									<View style={[s.onlineChip, { backgroundColor: theme.accentSoft }]}>
										<Bell color={theme.accent} size={13} />
										<Text style={[s.onlineText, { color: theme.accent }]}>En ligne</Text>
									</View>
								) : null}
								{noteSummary?.count ? (
									<View style={[s.noteIndicator, { backgroundColor: theme.surfaceSoft }]}>
										<StickyNote color={visualColor} size={13} />
										<Text style={[s.noteIndicatorText, { color: visualColor }]}>{noteSummary.count}</Text>
									</View>
								) : null}
								{noteSummary?.hasAttachments ? (
									<View style={[s.noteIconIndicator, { backgroundColor: theme.surfaceSoft }]}>
										<Paperclip color={visualColor} size={13} />
									</View>
								) : null}
								{noteSummary?.hasReminder ? (
									<View style={[s.noteIconIndicator, { backgroundColor: theme.surfaceSoft }]}>
										<Bell color={visualColor} size={13} />
									</View>
								) : null}
							</View>
						</View>
						<Text style={[s.eventTitle, cancelled && s.eventTitleCancelled, { color: cancelled ? theme.muted : theme.text }]} numberOfLines={2}>
							{getEventTitle(event)}
						</Text>
						<Text style={[s.meta, { color: theme.muted }]} numberOfLines={1}>
							{cancelled ? `Cours annulé · ${formatDateRange(event)}` : formatDateRange(event)}
						</Text>
						<View style={s.eventMetaGrid}>
							{rooms ? (
								<View style={s.inlineMeta}>
									<MapPin color={visualColor} size={15} />
									<Text style={[s.inlineText, { color: cancelled ? theme.muted : theme.text }]} numberOfLines={1}>
										{rooms}
									</Text>
								</View>
							) : null}
							{teachers ? (
								<View style={s.inlineMeta}>
									<Users color={visualColor} size={15} />
									<Text style={[s.inlineText, { color: cancelled ? theme.muted : theme.text }]} numberOfLines={1}>
										{teachers}
									</Text>
								</View>
							) : null}
						</View>
						{isNow && !cancelled ? (
							<View style={[s.nowBar, { backgroundColor: hexToRgba(color, 0.16) }]}>
								<View style={[s.nowFill, { width: `${progress}%`, backgroundColor: color }]} />
								<Text style={[s.nowText, { backgroundColor: theme.surface, color }]}>En cours</Text>
							</View>
						) : null}
					</View>
				</View>
			</Card>
		</Animated.View>
	);
}

function GroupModal({
	visible,
	groups,
	selected,
	search,
	selectedLabels,
	onSearch,
	onToggle,
	onClose,
}: {
	visible: boolean;
	groups: Group[];
	selected: (string | number)[];
	search: string;
	selectedLabels: string[];
	onSearch: (value: string) => void;
	onToggle: (id: string | number) => void;
	onClose: () => void;
}) {
	const { theme } = useTheme();
	return (
		<Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
			<View style={[s.modalRoot, { backgroundColor: theme.bg }]}>
				<ModalHeader title="Mes groupes" onClose={onClose} />
				<View style={[s.searchBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
					<Search color={theme.muted} size={18} />
					<TextInput
						value={search}
						onChangeText={onSearch}
						placeholder="Rechercher un groupe"
						placeholderTextColor={theme.muted}
						style={[s.searchInput, { color: theme.text }]}
					/>
				</View>
				<Text style={[s.modalMeta, { color: theme.muted }]} numberOfLines={2}>
					{selected.length ? selectedLabels.join(", ") : "Aucun groupe sélectionné"}
				</Text>
				<ScrollView contentContainerStyle={s.modalList}>
					{groups.map((group) => {
						const active = selected.includes(group.id);
						return (
							<Animated.View key={String(group.id)} entering={FadeInDown.delay(Math.min(groups.indexOf(group), 18) * 20).duration(250)} layout={Layout.springify()}>
								<Pressable
									style={[s.groupRow, { backgroundColor: theme.surface, borderColor: active ? theme.accent : theme.border }]}
									onPress={() => onToggle(group.id)}>
									<View style={[s.check, { backgroundColor: active ? theme.accent : "transparent", borderColor: active ? theme.accent : theme.border }]}>
										{active ? <Check color="#fff" size={14} /> : null}
									</View>
									<Text style={[s.groupName, { color: theme.text }]} numberOfLines={1}>
										{group.name}
									</Text>
								</Pressable>
							</Animated.View>
						);
					})}
				</ScrollView>
			</View>
		</Modal>
	);
}

type RoomFilterId = string | number;

type RoomFilterItem = { id: RoomFilterId; name: string };

const normalizeRoomText = (value: unknown) =>
	String(value ?? "")
		.trim()
		.toLowerCase();

const uniqRoomItems = (items: RoomFilterItem[]) => Array.from(new Map(items.map((item) => [String(item.id), item])).values());

const getRawRoomLocationId = (room: Room) => {
	const raw = room as any;
	return raw.location?.id ?? raw.location_id ?? raw.id_location ?? raw.idLocation ?? raw.locationId ?? raw.campus?.id ?? raw.site?.id ?? null;
};

const getRawRoomTypeId = (room: Room) => {
	const raw = room as any;
	return raw.roomType?.id ?? raw.room_type?.id ?? raw.id_room_type ?? raw.idRoomType ?? raw.roomTypeId ?? raw.typeId ?? raw.type?.id ?? null;
};

const cleanRoomTypeLabel = (value: unknown) => {
	const cleaned = String(value ?? "")
		.replace("RoomType.", "")
		.replace(/_/g, " ")
		.trim();
	return cleaned || "Type inconnu";
};

const getRoomTypeLabelFromRoom = (room: Room, roomTypes: RoomFilterItem[] = []) => {
	const raw = room as any;
	const roomTypeId = getRawRoomTypeId(room);
	const fromList = roomTypeId !== null ? roomTypes.find((type) => String(type.id) === String(roomTypeId))?.name : "";
	return fromList || cleanRoomTypeLabel(raw.roomType?.type || raw.room_type?.type || raw.type?.type || raw.type || raw.roomTypeName || raw.typeName);
};

const getRoomLocationLabelFromRoom = (room: Room, locations: RoomFilterItem[] = []) => {
	const raw = room as any;
	const locationId = getRawRoomLocationId(room);
	const fromList = locationId !== null ? locations.find((location) => String(location.id) === String(locationId))?.name : "";
	const direct = [
		raw.location?.name,
		raw.locationName,
		raw.location_label,
		raw.locationLabel,
		raw.campus?.name,
		raw.campusName,
		raw.site?.name,
		raw.siteName,
		raw.building?.name,
		raw.building,
	]
		.filter((value) => typeof value === "string" && value.trim())
		.join(" · ");
	if (fromList || direct) return fromList || direct;

	const haystack = normalizeRoomText([room.name, raw.code, raw.path, raw.fullName].filter(Boolean).join(" "));
	const guessed = locations.find((location) => haystack.includes(normalizeRoomText(location.name)));
	return guessed?.name || "Campus inconnu";
};

const roomMatchesLocation = (room: Room, selectedLocations: RoomFilterId[], locations: RoomFilterItem[]) => {
	if (!selectedLocations.length) return true;
	const raw = room as any;
	const locationId = getRawRoomLocationId(room);
	if (locationId !== null && selectedLocations.some((id) => String(id) === String(locationId))) return true;

	const locationLabel = getRoomLocationLabelFromRoom(room, locations);
	const haystack = normalizeRoomText(
		[room.name, raw.code, raw.location?.name, raw.locationName, raw.location, raw.campusName, raw.siteName, raw.building, locationLabel].filter(Boolean).join(" ")
	);
	return selectedLocations.some((id) => {
		const item = locations.find((location) => String(location.id) === String(id));
		return item ? haystack.includes(normalizeRoomText(item.name)) : false;
	});
};

const roomMatchesType = (room: Room, selectedRoomTypes: RoomFilterId[], roomTypes: RoomFilterItem[]) => {
	if (!selectedRoomTypes.length) return true;
	const raw = room as any;
	const roomTypeId = getRawRoomTypeId(room);
	if (roomTypeId !== null && selectedRoomTypes.some((id) => String(id) === String(roomTypeId))) return true;

	const typeLabel = getRoomTypeLabelFromRoom(room, roomTypes);
	const haystack = normalizeRoomText([raw.roomType?.type, raw.room_type?.type, raw.type?.type, raw.type, raw.roomTypeName, raw.typeName, typeLabel].filter(Boolean).join(" "));
	return selectedRoomTypes.some((id) => {
		const item = roomTypes.find((type) => String(type.id) === String(id));
		return item ? haystack.includes(normalizeRoomText(item.name)) : false;
	});
};

const toggleRoomFilterValue = (values: RoomFilterId[], value: RoomFilterId) => {
	const exists = values.some((item) => String(item) === String(value));
	return exists ? values.filter((item) => String(item) !== String(value)) : [...values, value];
};

function RoomFinderModal({
	visible,
	selectedGroups,
	onApplyRoom,
	onClose,
}: {
	visible: boolean;
	selectedGroups: (string | number)[];
	onApplyRoom: (room: Room) => void;
	onClose: () => void;
}) {
	const { theme } = useTheme();
	const [duration, setDuration] = useState(60);
	const [capacity, setCapacity] = useState("");
	const [roomSearch, setRoomSearch] = useState("");
	const [selectedLocations, setSelectedLocations] = useState<RoomFilterId[]>([]);
	const [selectedRoomTypes, setSelectedRoomTypes] = useState<RoomFilterId[]>([]);
	const [rooms, setRooms] = useState<Room[]>([]);
	const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
	const [locations, setLocations] = useState<RoomFilterItem[]>([]);
	const [results, setResults] = useState<Room[]>([]);
	const [loading, setLoading] = useState(false);
	const [bootLoading, setBootLoading] = useState(false);
	const [searched, setSearched] = useState(false);
	const [error, setError] = useState("");

	useEffect(() => {
		if (!visible) return;
		setBootLoading(true);
		setError("");
		Promise.all([getRooms(), getRoomTypes(), getLocations()])
			.then(([roomsData, roomTypesData, locationsData]) => {
				setRooms((roomsData || []).sort((a, b) => a.name.localeCompare(b.name, "fr")));
				setRoomTypes(roomTypesData || []);
				setLocations(flattenLocations(locationsData || []));
			})
			.catch((err) => setError(err?.message || "Impossible de charger les salles."))
			.finally(() => setBootLoading(false));
	}, [visible]);

	const roomTypeItems = useMemo(() => uniqRoomItems(roomTypes.map((type) => ({ id: type.id, name: cleanRoomTypeLabel(type.type) }))), [roomTypes]);

	const selectedLocationLabel = useMemo(() => {
		if (!selectedLocations.length) return "Tous les campus";
		if (selectedLocations.length === 1) return locations.find((location) => String(location.id) === String(selectedLocations[0]))?.name || "1 campus";
		return `${selectedLocations.length} campus`;
	}, [locations, selectedLocations]);

	const selectedRoomTypeLabel = useMemo(() => {
		if (!selectedRoomTypes.length) return "Tous les types";
		if (selectedRoomTypes.length === 1) return roomTypeItems.find((type) => String(type.id) === String(selectedRoomTypes[0]))?.name || "1 type";
		return `${selectedRoomTypes.length} types`;
	}, [roomTypeItems, selectedRoomTypes]);

	const activeFiltersCount = selectedLocations.length + selectedRoomTypes.length + (capacity.trim() ? 1 : 0) + (roomSearch.trim() ? 1 : 0);

	const clearFilters = () => {
		setDuration(60);
		setCapacity("");
		setRoomSearch("");
		setSelectedLocations([]);
		setSelectedRoomTypes([]);
		setResults([]);
		setSearched(false);
		setError("");
	};

	const search = async () => {
		setLoading(true);
		setError("");
		setSearched(false);
		try {
			const start = new Date();
			const end = new Date(start.getTime() + Math.max(5, duration) * 60_000);
			const locationFilters = selectedLocations.length ? selectedLocations : [null];
			const typeFilters = selectedRoomTypes.length ? selectedRoomTypes : [null];
			const requests = locationFilters.flatMap((locationId) =>
				typeFilters.map((roomTypeId) => {
					const payload: Parameters<typeof getAvailableRooms>[0] = {
						startDate: start.toISOString(),
						endDate: end.toISOString(),
						groups: selectedGroups.map(Number).filter(Number.isFinite),
					};
					if (locationId !== null) {
						const numericLocation = Number(locationId);
						if (Number.isFinite(numericLocation)) payload.location = numericLocation;
					}
					if (roomTypeId !== null) {
						const numericRoomType = Number(roomTypeId);
						if (Number.isFinite(numericRoomType)) payload.roomType = numericRoomType;
					}
					if (capacity.trim()) payload.capacity = Number(capacity);
					return getAvailableRooms(payload);
				})
			);

			const responses = await Promise.all(requests);
			const merged = new Map<string, Room>();
			responses.flat().forEach((room) => {
				if (!room) return;
				merged.set(String(room.id || room.name), room);
			});
			setResults([...merged.values()].sort((a, b) => a.name.localeCompare(b.name, "fr")));
			setSearched(true);
		} catch (err: any) {
			setError(err?.message || "Recherche impossible.");
		} finally {
			setLoading(false);
		}
	};

	const visibleRooms = useMemo(() => {
		const term = roomSearch.trim().toLowerCase();
		const minCapacity = capacity.trim() ? Number(capacity) : null;
		const source = searched ? results : rooms;
		return source
			.filter((room) => {
				const raw = room as any;
				const locationLabel = getRoomLocationLabelFromRoom(room, locations);
				const typeLabel = getRoomTypeLabelFromRoom(room, roomTypeItems);
				const haystack = [room.name, raw.code, raw.path, raw.fullName, locationLabel, typeLabel].filter(Boolean).join(" ").toLowerCase();
				const capacityOk = !minCapacity || (Number(room.capacity) || 0) >= minCapacity;
				return (
					(!term || haystack.includes(term)) &&
					capacityOk &&
					roomMatchesLocation(room, selectedLocations, locations) &&
					roomMatchesType(room, selectedRoomTypes, roomTypeItems)
				);
			})
			.slice(0, searched ? 100 : 60);
	}, [capacity, locations, roomSearch, rooms, results, roomTypeItems, searched, selectedLocations, selectedRoomTypes]);

	const resultTitle = searched ? `${visibleRooms.length} salle${visibleRooms.length > 1 ? "s" : ""} libre${visibleRooms.length > 1 ? "s" : ""}` : "Annuaire des salles";
	const resultSubtitle = searched
		? `Disponibles pendant ${duration} min · ${selectedLocationLabel} · ${selectedRoomTypeLabel}${capacity ? ` · ${capacity}+ places` : ""}`
		: `${visibleRooms.length}/${rooms.length || 0} salles affichées · filtres instantanés`;

	return (
		<Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
			<View style={[s.modalRoot, { backgroundColor: theme.bg }]}>
				<ModalHeader title="Trouver une salle" onClose={onClose} />

				<ScrollView contentContainerStyle={s.roomFinderScroll} showsVerticalScrollIndicator={false}>
					<Animated.View entering={FadeInDown.duration(280)} style={[s.roomHeroCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
						<View pointerEvents="none" style={[s.roomHeroGlow, { backgroundColor: theme.accentSoft }]} />
						<View style={s.roomHeroTop}>
							<View style={[s.roomHeroIcon, { backgroundColor: theme.accent }]}>
								<DoorOpen color="#fff" size={23} />
							</View>
							<View style={s.roomHeroCopy}>
								<Text style={[s.roomHeroEyebrow, { color: theme.accent }]}>Recherche</Text>
								<Text style={[s.roomHeroTitle, { color: theme.text }]}>Salle libre, annuaire et carte</Text>
							</View>
						</View>
						<Text style={[s.roomHeroText, { color: theme.muted }]}>
							Les campus, types, capacité et texte filtrent l’annuaire immédiatement. Le bouton chercher vérifie ensuite les disponibilités réelles.
						</Text>

						<View style={s.roomHeroStats}>
							<View style={[s.roomHeroStat, { backgroundColor: theme.surfaceSoft }]}>
								<Clock color={theme.accent} size={16} />
								<Text style={[s.roomHeroStatText, { color: theme.text }]}>{duration} min</Text>
							</View>
							<View style={[s.roomHeroStat, { backgroundColor: theme.surfaceSoft }]}>
								<MapPin color={theme.accent} size={16} />
								<Text style={[s.roomHeroStatText, { color: theme.text }]} numberOfLines={1}>
									{selectedLocationLabel}
								</Text>
							</View>
							<View style={[s.roomHeroStat, { backgroundColor: theme.surfaceSoft }]}>
								<Layers color={theme.accent} size={16} />
								<Text style={[s.roomHeroStatText, { color: theme.text }]} numberOfLines={1}>
									{selectedRoomTypeLabel}
								</Text>
							</View>
						</View>
					</Animated.View>

					<Animated.View entering={FadeInDown.delay(50).duration(280)} style={[s.roomSearchCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
						<View style={[s.roomSearchBox, { backgroundColor: theme.surfaceSoft, borderColor: theme.border }]}>
							<Search color={theme.muted} size={18} />
							<TextInput
								value={roomSearch}
								onChangeText={setRoomSearch}
								placeholder="Nom de salle, bâtiment, campus..."
								placeholderTextColor={theme.muted}
								style={[s.roomSearchInput, { color: theme.text }]}
								autoCorrect={false}
							/>
							{roomSearch ? (
								<Pressable onPress={() => setRoomSearch("")} hitSlop={10}>
									<X color={theme.muted} size={18} />
								</Pressable>
							) : null}
						</View>

						<View style={s.roomDurationHead}>
							<View style={s.roomSectionTitleWrap}>
								<SlidersHorizontal color={theme.accent} size={18} />
								<Text style={[s.roomSectionTitle, { color: theme.text }]}>Disponibilité</Text>
							</View>
							<Pressable style={[s.roomResetBtn, { borderColor: theme.border }]} onPress={clearFilters}>
								<RotateCcw color={theme.muted} size={15} />
								<Text style={[s.roomResetText, { color: theme.muted }]}>{activeFiltersCount ? `${activeFiltersCount} filtre(s)` : "Reset"}</Text>
							</Pressable>
						</View>

						<View style={s.durationGrid}>
							{[30, 60, 90, 120].map((value) => {
								const active = duration === value;
								return (
									<Pressable
										key={value}
										style={[
											s.durationPreset,
											{ backgroundColor: active ? theme.accent : theme.surfaceSoft, borderColor: active ? theme.accent : theme.border },
										]}
										onPress={() => setDuration(value)}>
										<Text style={[s.durationPresetText, { color: active ? "#fff" : theme.text }]}>{value} min</Text>
									</Pressable>
								);
							})}
						</View>

						<View style={s.roomInlineFields}>
							<View style={[s.capacityField, { backgroundColor: theme.surfaceSoft, borderColor: theme.border }]}>
								<Users color={theme.muted} size={17} />
								<TextInput
									keyboardType="number-pad"
									value={capacity}
									onChangeText={setCapacity}
									placeholder="Places min."
									placeholderTextColor={theme.muted}
									style={[s.capacityInput, { color: theme.text }]}
								/>
							</View>
							<Pressable style={[s.searchRoomBtn, { backgroundColor: theme.accent }]} onPress={search} disabled={loading}>
								{loading ? <ActivityIndicator color="#fff" /> : <Search color="#fff" size={18} />}
								<Text style={s.searchRoomText}>Chercher</Text>
							</Pressable>
						</View>
					</Animated.View>

					<RoomCheckboxFilter
						title="Campus"
						items={locations}
						selected={selectedLocations}
						onToggle={(id) => setSelectedLocations((values) => toggleRoomFilterValue(values, id))}
						onClear={() => setSelectedLocations([])}
					/>
					<RoomCheckboxFilter
						title="Type de salle"
						items={roomTypeItems}
						selected={selectedRoomTypes}
						onToggle={(id) => setSelectedRoomTypes((values) => toggleRoomFilterValue(values, id))}
						onClear={() => setSelectedRoomTypes([])}
					/>

					{bootLoading ? (
						<View style={[s.roomLoadingCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
							<ActivityIndicator color={theme.accent} />
							<Text style={[s.roomLoadingText, { color: theme.muted }]}>Chargement des salles...</Text>
						</View>
					) : null}

					{error ? <Text style={[s.error, { color: theme.warn }]}>{error}</Text> : null}

					<View style={s.roomResultHeader}>
						<View style={s.roomResultHeaderCopy}>
							<Text style={[s.roomResultTitle, { color: theme.text }]}>{resultTitle}</Text>
							<Text style={[s.roomResultSub, { color: theme.muted }]} numberOfLines={2}>
								{resultSubtitle}
							</Text>
						</View>
						{searched ? (
							<View style={[s.roomResultBadge, { backgroundColor: theme.accentSoft }]}>
								<Check color={theme.accent} size={15} />
								<Text style={[s.roomResultBadgeText, { color: theme.accent }]}>Libre</Text>
							</View>
						) : null}
					</View>

					{visibleRooms.length === 0 && !bootLoading ? (
						<View style={[s.noRoomCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
							<DoorOpen color={theme.accent} size={26} />
							<Text style={[s.noRoomTitle, { color: theme.text }]}>Aucune salle trouvée</Text>
							<Text style={[s.noRoomText, { color: theme.muted }]}>Essaie d’enlever un campus, un type de salle ou de baisser la capacité.</Text>
						</View>
					) : null}

					{visibleRooms.map((room, index) => (
						<RoomResultCard
							key={`${room.id || room.name}-${index}`}
							room={room}
							index={index}
							locations={locations}
							roomTypes={roomTypeItems}
							onApplyRoom={onApplyRoom}
						/>
					))}
				</ScrollView>
			</View>
		</Modal>
	);
}

function RoomCheckboxFilter({
	title,
	items,
	selected,
	onToggle,
	onClear,
}: {
	title: string;
	items: RoomFilterItem[];
	selected: RoomFilterId[];
	onToggle: (id: RoomFilterId) => void;
	onClear: () => void;
}) {
	const { theme } = useTheme();
	if (!items.length) return null;
	return (
		<Animated.View entering={FadeInDown.delay(80).duration(260)} style={[s.roomFilterCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
			<View style={s.roomFilterHeader}>
				<View>
					<Text style={[s.roomFilterTitle, { color: theme.text }]}>{title}</Text>
					<Text style={[s.roomFilterCount, { color: theme.muted }]}>{selected.length ? `${selected.length} sélectionné(s)` : "Tout afficher"}</Text>
				</View>
				{selected.length ? (
					<Pressable style={[s.roomFilterClearBtn, { borderColor: theme.border }]} onPress={onClear}>
						<X color={theme.muted} size={14} />
						<Text style={[s.roomFilterClearText, { color: theme.muted }]}>Effacer</Text>
					</Pressable>
				) : null}
			</View>

			<View style={s.roomCheckboxGrid}>
				{items.slice(0, 60).map((item) => {
					const active = selected.some((id) => String(id) === String(item.id));
					return (
						<Pressable
							key={String(item.id)}
							style={[s.roomCheckboxItem, { backgroundColor: active ? theme.accentSoft : theme.surfaceSoft, borderColor: active ? theme.accent : theme.border }]}
							onPress={() => onToggle(item.id)}>
							<View style={[s.roomCheckboxBox, { backgroundColor: active ? theme.accent : "transparent", borderColor: active ? theme.accent : theme.border }]}>
								{active ? <Check color="#fff" size={13} /> : null}
							</View>
							<Text style={[s.roomCheckboxText, { color: active ? theme.text : theme.muted }]} numberOfLines={1}>
								{item.name}
							</Text>
						</Pressable>
					);
				})}
			</View>
		</Animated.View>
	);
}

function RoomResultCard({
	room,
	index,
	locations,
	roomTypes,
	onApplyRoom,
}: {
	room: Room;
	index: number;
	locations: RoomFilterItem[];
	roomTypes: RoomFilterItem[];
	onApplyRoom: (room: Room) => void;
}) {
	const { theme } = useTheme();
	const name = room.name || `Salle #${room.id}`;
	const locationLabel = getRoomLocationLabelFromRoom(room, locations);
	const typeLabel = getRoomTypeLabelFromRoom(room, roomTypes);
	const capacityLabel = room.capacity ? `${room.capacity} places` : "Capacité inconnue";

	return (
		<Animated.View entering={FadeInDown.delay(Math.min(index, 14) * 25).duration(260)} layout={Layout.springify()}>
			<View style={[s.roomResultCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
				<View style={[s.roomResultIcon, { backgroundColor: theme.accentSoft }]}>
					<DoorOpen color={theme.accent} size={20} />
				</View>

				<View style={s.roomResultContent}>
					<View style={s.roomResultTopLine}>
						<Text style={[s.roomName, { color: theme.text }]} numberOfLines={1}>
							{name}
						</Text>
						<View style={[s.roomCapacityBadge, { backgroundColor: theme.surfaceSoft }]}>
							<Users color={theme.muted} size={13} />
							<Text style={[s.roomCapacityText, { color: theme.muted }]}>{capacityLabel}</Text>
						</View>
					</View>

					<View style={s.roomMetaTags}>
						<View style={[s.roomMetaTag, { backgroundColor: theme.surfaceSoft }]}>
							<MapPin color={theme.accent} size={13} />
							<Text style={[s.roomMetaTagText, { color: theme.text }]} numberOfLines={1}>
								{locationLabel}
							</Text>
						</View>
						<View style={[s.roomMetaTag, { backgroundColor: theme.surfaceSoft }]}>
							<Layers color={theme.accent} size={13} />
							<Text style={[s.roomMetaTagText, { color: theme.text }]} numberOfLines={1}>
								{typeLabel}
							</Text>
						</View>
					</View>

					<View style={s.roomActions}>
						<Pressable style={[s.roomMapAction, { backgroundColor: theme.surfaceSoft, borderColor: theme.border }]} onPress={() => openUrl(getRoomMapUrl(name))}>
							<Navigation color={theme.accent} size={16} />
							<Text style={[s.roomMapActionText, { color: theme.text }]}>Carte</Text>
						</Pressable>

						<Pressable style={[s.roomApplyAction, { backgroundColor: theme.accent }]} onPress={() => onApplyRoom(room)}>
							<Filter color="#fff" size={16} />
							<Text style={s.roomApplyText}>Voir l'agenda</Text>
						</Pressable>
					</View>
				</View>
			</View>
		</Animated.View>
	);
}

function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
	const { theme } = useTheme();
	return (
		<View style={[s.modalHeader, { borderBottomColor: theme.border }]}>
			<Text style={[s.modalTitle, { color: theme.text }]}>{title}</Text>
			<Pressable style={[s.iconBtn, { borderColor: theme.border }]} onPress={onClose}>
				<X color={theme.text} size={20} />
			</Pressable>
		</View>
	);
}

const s = StyleSheet.create({
	root: { flex: 1 },
	content: { padding: 18, paddingTop: 58, paddingBottom: 108 },
	topBand: { position: "absolute", top: 0, left: 0, right: 0, height: 252, opacity: 0.78 },
	header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 16 },
	headerCopy: { flex: 1, minWidth: 0 },
	headerActions: { flexDirection: "row", gap: 8 },
	eyebrow: { fontSize: 12, fontWeight: "900", textTransform: "uppercase" },
	title: { fontSize: 30, lineHeight: 34, fontWeight: "900", letterSpacing: 0, textTransform: "capitalize" },
	iconBtn: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
	overviewCard: {
		borderWidth: 1,
		borderRadius: 28,
		padding: 16,
		marginBottom: 12,
		shadowOpacity: 0.12,
		shadowRadius: 26,
		shadowOffset: { width: 0, height: 16 },
		elevation: 5,
	},
	overviewTop: { flexDirection: "row", alignItems: "center", gap: 13 },
	dateTile: { width: 72, height: 78, borderRadius: 18, alignItems: "center", justifyContent: "center" },
	dateTileMonth: { fontSize: 12, fontWeight: "900", textTransform: "uppercase" },
	dateTileDay: { fontSize: 34, fontWeight: "900", letterSpacing: 0 },
	overviewCopy: { flex: 1, minWidth: 0 },
	overviewLabel: { fontSize: 13, fontWeight: "800", textTransform: "capitalize" },
	overviewTitle: { marginTop: 3, fontSize: 24, lineHeight: 29, fontWeight: "900", letterSpacing: 0 },
	overviewStats: { flexDirection: "row", gap: 8, marginTop: 14 },
	nextStrip: { minHeight: 58, borderWidth: 1, borderRadius: 16, marginTop: 14, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 10 },
	nextStripLive: { minHeight: 112, paddingVertical: 12, flexDirection: "column", alignItems: "stretch", gap: 10 },
	nextLiveTop: { flexDirection: "row", alignItems: "center", gap: 10 },
	nextLiveMeta: { flexDirection: "row", gap: 8 },
	nextLivePill: { flex: 1, minHeight: 34, borderRadius: 10, paddingHorizontal: 9, flexDirection: "row", alignItems: "center", gap: 6 },
	nextLivePillText: { flex: 1, fontSize: 12, fontWeight: "900" },
	nextProgressTrack: { height: 8, borderRadius: 8, overflow: "hidden" },
	nextProgressFill: { height: "100%", borderRadius: 8 },
	nextDot: { width: 10, height: 34, borderRadius: 8 },
	nextCopy: { flex: 1, minWidth: 0 },
	nextLabel: { fontSize: 11, fontWeight: "900", textTransform: "uppercase" },
	nextTitle: { marginTop: 2, fontSize: 15, fontWeight: "900" },
	nextTime: { fontSize: 16, fontWeight: "900" },
	toolbar: { flexDirection: "row", gap: 10, marginBottom: 12 },
	navBtn: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
	todayBtn: { flex: 1, minHeight: 44, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7, paddingHorizontal: 10 },
	todayText: { fontWeight: "900" },
	roomBtn: { width: 48, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
	segment: { flexDirection: "row", padding: 4, borderRadius: 16, marginBottom: 12 },
	segmentItem: { flex: 1, minHeight: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
	segmentText: { fontWeight: "900" },
	offline: { borderWidth: 1, borderRadius: 14, padding: 11, flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
	offlineText: { flex: 1, fontSize: 12, fontWeight: "800", lineHeight: 17 },
	roomChange: { borderWidth: 1, borderRadius: 14, padding: 11, flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
	roomChangeText: { flex: 1, fontSize: 12, fontWeight: "900", lineHeight: 17 },
	roomChangeClose: { width: 30, height: 30, alignItems: "center", justifyContent: "center" },
	contextCard: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
	contextText: { flex: 1, fontWeight: "900" },
	daysStrip: { gap: 9, paddingBottom: 12 },
	dayPill: { width: 68, minHeight: 92, borderWidth: 1, borderRadius: 20, alignItems: "center", justifyContent: "center", paddingVertical: 8 },
	dayName: { fontSize: 12, fontWeight: "800", textTransform: "capitalize" },
	dayNum: { fontSize: 24, fontWeight: "900", marginTop: 3 },
	dayDots: { height: 9, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 3, marginTop: 6 },
	dayDot: { width: 5, height: 5, borderRadius: 4 },
	dayDotCancelled: { opacity: 0.5 },
	dayCount: { fontSize: 11, fontWeight: "900", marginTop: 3 },
	loader: { marginVertical: 14 },
	error: { marginBottom: 10, fontWeight: "700" },
	emptyCard: { alignItems: "center", gap: 8 },
	emptyTitle: { fontSize: 20, fontWeight: "900" },
	eventCard: { marginBottom: 12, padding: 14, borderRadius: 22 },
	eventCardCancelled: { borderStyle: "dashed", opacity: 0.74 },
	eventCardHighlighted: {
		shadowOpacity: 0.18,
		shadowRadius: 26,
		shadowOffset: { width: 0, height: 16 },
		elevation: 6,
	},
	eventShell: { flexDirection: "row", gap: 13 },
	timeBlock: { width: 64, borderRadius: 16, alignItems: "center", justifyContent: "center", paddingVertical: 10 },
	eventContent: { flex: 1, minWidth: 0 },
	eventTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
	eventIndicators: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap", gap: 5 },
	eventTime: { fontSize: 16, fontWeight: "900" },
	eventEnd: { marginTop: 4, fontSize: 12, fontWeight: "900" },
	eventTitle: { fontSize: 18, lineHeight: 23, fontWeight: "900", marginTop: 9 },
	eventTitleCancelled: { textDecorationLine: "line-through" },
	meta: { marginTop: 6, lineHeight: 19 },
	eventMetaGrid: { marginTop: 2 },
	inlineMeta: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 9 },
	inlineText: { flex: 1, fontWeight: "700" },
	typeChip: { maxWidth: 150, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5 },
	typeText: { fontSize: 11, fontWeight: "900" },
	cancelledChip: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 5 },
	cancelledText: { fontSize: 12, fontWeight: "900", textTransform: "uppercase" },
	onlineChip: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
	onlineText: { fontSize: 12, fontWeight: "900" },
	noteIndicator: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 5 },
	noteIndicatorText: { fontSize: 12, fontWeight: "900" },
	noteIconIndicator: { width: 27, height: 27, borderRadius: 8, alignItems: "center", justifyContent: "center" },
	nowBar: { height: 24, borderRadius: 8, overflow: "hidden", marginTop: 11, justifyContent: "center" },
	nowFill: { position: "absolute", left: 0, top: 0, bottom: 0, width: "100%", borderRadius: 8, zIndex: 0 },
	nowText: { alignSelf: "flex-start", marginLeft: 7, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, fontSize: 11, fontWeight: "900", zIndex: 1, elevation: 1 },
	modalRoot: { flex: 1 },
	modalHeader: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 12, borderBottomWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
	modalTitle: { fontSize: 24, fontWeight: "900" },
	searchBox: { margin: 18, marginBottom: 8, borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 8 },
	searchInput: { flex: 1, minHeight: 46, fontSize: 16 },
	modalMeta: { marginHorizontal: 18, marginBottom: 10, fontWeight: "700" },
	modalList: { padding: 18, gap: 12, paddingBottom: 48 },
	groupRow: { borderWidth: 1, borderRadius: 14, padding: 13, flexDirection: "row", alignItems: "center", gap: 10 },
	check: { width: 22, height: 22, borderWidth: 1, borderRadius: 6, alignItems: "center", justifyContent: "center" },
	groupName: { flex: 1, fontWeight: "800" },
	modalColorBadge: { alignSelf: "flex-start", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 12 },
	mapBtn: { width: 44, height: 42, borderRadius: 8, borderWidth: 1, alignItems: "center", justifyContent: "center" },
	stepper: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
	stepBtn: { width: 44, height: 42, borderRadius: 8, borderWidth: 1, alignItems: "center", justifyContent: "center" },
	stepText: { fontSize: 22, fontWeight: "900" },
	durationText: { flex: 1, textAlign: "center", fontSize: 20, fontWeight: "900" },
	input: { borderWidth: 1, borderRadius: 8, minHeight: 46, paddingHorizontal: 12, fontSize: 16 },
	primaryBtn: { minHeight: 50, borderRadius: 8, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
	primaryText: { color: "#fff", fontWeight: "900" },
	roomCard: { marginTop: 0 },
	roomFinderScroll: { padding: 18, gap: 14, paddingBottom: 56 },
	roomHeroCard: {
		borderWidth: 1,
		borderRadius: 28,
		padding: 18,
		overflow: "hidden",
		shadowColor: "#000",
		shadowOpacity: 0.1,
		shadowRadius: 22,
		shadowOffset: { width: 0, height: 14 },
		elevation: 5,
	},
	roomHeroGlow: { position: "absolute", right: -56, top: -52, width: 154, height: 154, borderRadius: 90, opacity: 0.9 },
	roomHeroTop: { flexDirection: "row", alignItems: "center", gap: 13 },
	roomHeroIcon: { width: 54, height: 54, borderRadius: 18, alignItems: "center", justifyContent: "center" },
	roomHeroCopy: { flex: 1, minWidth: 0 },
	roomHeroEyebrow: { fontSize: 11, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.5 },
	roomHeroTitle: { marginTop: 3, fontSize: 23, lineHeight: 28, fontWeight: "900" },
	roomHeroText: { marginTop: 12, fontSize: 14, lineHeight: 20, fontWeight: "700" },
	roomHeroStats: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 15 },
	roomHeroStat: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 34, borderRadius: 12, paddingHorizontal: 10 },
	roomHeroStatText: { fontSize: 12, fontWeight: "900" },
	roomSearchCard: { borderWidth: 1, borderRadius: 24, padding: 14, gap: 14 },
	roomSearchBox: { minHeight: 50, borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 8 },
	roomSearchInput: { flex: 1, minHeight: 48, fontSize: 15, fontWeight: "800" },
	roomDurationHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
	roomSectionTitleWrap: { flexDirection: "row", alignItems: "center", gap: 8 },
	roomSectionTitle: { fontSize: 17, fontWeight: "900" },
	roomResetBtn: { minHeight: 34, borderRadius: 12, borderWidth: 1, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 6 },
	roomResetText: { fontSize: 12, fontWeight: "900" },
	durationGrid: { flexDirection: "row", gap: 8 },
	durationPreset: { flex: 1, minHeight: 42, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
	durationPresetText: { fontSize: 13, fontWeight: "900" },
	roomInlineFields: { flexDirection: "row", gap: 10 },
	capacityField: { flex: 0.95, minHeight: 50, borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 8 },
	capacityInput: { flex: 1, minHeight: 48, fontSize: 15, fontWeight: "800" },
	searchRoomBtn: { flex: 1, minHeight: 50, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
	searchRoomText: { color: "#fff", fontSize: 15, fontWeight: "900" },
	roomFilterBlock: { gap: 10 },
	roomFilterTitle: { fontSize: 16, fontWeight: "900" },
	roomFilterRow: { gap: 8, paddingRight: 18, paddingBottom: 2 },
	roomFilterChip: { maxWidth: 190, minHeight: 40, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 13 },
	roomFilterText: { fontSize: 13, fontWeight: "900", textTransform: "capitalize" },
	roomFilterCard: { borderWidth: 1, borderRadius: 22, padding: 14, gap: 12 },
	roomFilterHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
	roomFilterCount: { marginTop: 2, fontSize: 12, fontWeight: "800" },
	roomFilterClearBtn: { minHeight: 32, borderRadius: 11, borderWidth: 1, paddingHorizontal: 9, flexDirection: "row", alignItems: "center", gap: 5 },
	roomFilterClearText: { fontSize: 12, fontWeight: "900" },
	roomCheckboxGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
	roomCheckboxItem: { width: "48%", minHeight: 42, borderRadius: 14, borderWidth: 1, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 8 },
	roomCheckboxBox: { width: 20, height: 20, borderRadius: 6, borderWidth: 1, alignItems: "center", justifyContent: "center" },
	roomCheckboxText: { flex: 1, fontSize: 12, fontWeight: "900", textTransform: "capitalize" },
	roomLoadingCard: { borderWidth: 1, borderRadius: 18, padding: 16, flexDirection: "row", alignItems: "center", gap: 10 },
	roomLoadingText: { fontWeight: "800" },
	roomResultHeader: { marginTop: 2, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
	roomResultHeaderCopy: { flex: 1, minWidth: 0 },
	roomResultTitle: { fontSize: 22, fontWeight: "900" },
	roomResultSub: { marginTop: 3, fontSize: 13, fontWeight: "800" },
	roomResultBadge: { minHeight: 30, borderRadius: 12, paddingHorizontal: 9, flexDirection: "row", alignItems: "center", gap: 5 },
	roomResultBadgeText: { fontSize: 12, fontWeight: "900", textTransform: "uppercase" },
	noRoomCard: { borderWidth: 1, borderRadius: 22, padding: 18, alignItems: "center", gap: 8 },
	noRoomTitle: { fontSize: 18, fontWeight: "900" },
	noRoomText: { textAlign: "center", lineHeight: 19, fontWeight: "700" },
	roomResultCard: {
		borderWidth: 1,
		borderRadius: 22,
		padding: 13,
		flexDirection: "row",
		gap: 12,
		shadowColor: "#000",
		shadowOpacity: 0.07,
		shadowRadius: 18,
		shadowOffset: { width: 0, height: 10 },
		elevation: 3,
	},
	roomResultIcon: { width: 44, height: 44, borderRadius: 16, alignItems: "center", justifyContent: "center" },
	roomResultContent: { flex: 1, minWidth: 0 },
	roomResultTopLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
	roomName: { flex: 1, fontSize: 17, fontWeight: "900" },
	roomCapacityBadge: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 10, paddingHorizontal: 8, minHeight: 28 },
	roomCapacityText: { fontSize: 11, fontWeight: "900" },
	roomMetaLine: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
	roomMetaText: { flex: 1, fontSize: 13, fontWeight: "800" },
	roomMetaTags: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 10 },
	roomMetaTag: { maxWidth: "100%", minHeight: 30, borderRadius: 10, paddingHorizontal: 9, flexDirection: "row", alignItems: "center", gap: 5 },
	roomMetaTagText: { maxWidth: 190, fontSize: 12, fontWeight: "900", textTransform: "capitalize" },
	roomActions: { flexDirection: "row", gap: 8, marginTop: 13 },
	roomMapAction: { minHeight: 42, borderRadius: 13, borderWidth: 1, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
	roomMapActionText: { fontSize: 13, fontWeight: "900" },
	roomApplyAction: { flex: 1, minHeight: 42, borderRadius: 13, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
	roomApplyText: { color: "#fff", fontSize: 13, fontWeight: "900" },
});
