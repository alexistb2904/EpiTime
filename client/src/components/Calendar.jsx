import React, { useState, useEffect, useMemo, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useNotification } from "../context/NotificationContext";
import { usePushNotifications } from "../hooks/usePushNotifications";
import Sidebar from "./Sidebar";
import CalendarHeader from "./CalendarHeader";
import GroupSelectionModal from "./GroupSelectionModal";
import EventDetailsModal from "./EventDetailsModal";
import SettingsModal from "./SettingsModal";
import { NotificationSettings } from "./NotificationSettings";
import RoomAvailabilityModal from "./RoomAvailabilityModal";
import { trackEvent } from "../utils/analyticsTracker";
import { fetchApi } from "../utils/api";
import { getDisplayedGroupNames } from "../utils/calendarGroups";
import { courseHue } from "../utils/courseColor";
import { buildCalendarFilterParams, buildEffectiveCalendarFilters } from "../utils/calendarFilters";
import { AlertTriangle, ArrowLeft, ChevronRight, Laptop, Users } from "lucide-react";
import "./Calendar.css";

const formatTime = (date) => date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

const getWeekStart = (date) => {
	const start = new Date(date);
	start.setHours(0, 0, 0, 0);
	start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
	return start;
};

const addDays = (date, days) => {
	const next = new Date(date);
	next.setDate(next.getDate() + days);
	return next;
};

const formatRelative = (event, now) => {
	if (event.startObj <= now) return `jusqu'à ${formatTime(event.endObj)}`;
	const minutes = Math.round((event.startObj - now) / 60000);
	if (minutes < 60) return `dans ${minutes} min`;
	if (event.startObj.toDateString() === now.toDateString()) {
		const h = Math.floor(minutes / 60);
		const m = minutes % 60;
		return `dans ${h} h${m ? ` ${String(m).padStart(2, "0")}` : ""}`;
	}
	if (event.startObj.toDateString() === addDays(now, 1).toDateString()) return `demain, ${formatTime(event.startObj)}`;
	return `${event.startObj.toLocaleDateString("fr-FR", { weekday: "long" })}, ${formatTime(event.startObj)}`;
};

const useMediaQuery = (query) => {
	const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
	useEffect(() => {
		const media = window.matchMedia(query);
		const onChange = () => setMatches(media.matches);
		media.addEventListener("change", onChange);
		onChange();
		return () => media.removeEventListener("change", onChange);
	}, [query]);
	return matches;
};

const getEventCacheKey = (event) => `${event.idReservation || event.id || "event"}-${event.startDate || event.start || ""}`;

const isEventCancelled = (event) => Boolean(event?.isCancelled || event?.isCanceled);

const stripCancellationState = (event) => {
	const { isCancelled, isCanceled, cancelledAt, cancellationReason, ...cleanEvent } = event;
	return cleanEvent;
};

const reconcileEventsWithCache = (freshEvents = [], cachedEvents = []) => {
	const fresh = freshEvents.map(stripCancellationState);
	const freshKeys = new Set(fresh.map(getEventCacheKey));
	const cancelledFromCache = cachedEvents
		.filter((event) => !freshKeys.has(getEventCacheKey(event)))
		.map((event) => ({
			...event,
			isCancelled: true,
			isCanceled: true,
			cancelledAt: event.cancelledAt || new Date().toISOString(),
			cancellationReason: event.cancellationReason || "Absent du dernier retour Zeus",
		}));

	const byKey = new Map();
	[...fresh, ...cancelledFromCache].forEach((event) => byKey.set(getEventCacheKey(event), event));
	return Array.from(byKey.values());
};

const Calendar = () => {
	const { zeusToken, logout, user } = useAuth();
	const { theme, toggleTheme } = useTheme();
	const { notificationSettings, shouldNotifyForEvent } = useNotification();

	const [currentDate, setCurrentDate] = useState(new Date());
	const [viewMode, setViewMode] = useState(() => {
		return localStorage.getItem("zeus_view_mode") === "list" ? "list" : "week";
	});
	const [events, setEvents] = useState([]);

	const [selectedGroups, setSelectedGroups] = useState(JSON.parse(localStorage.getItem("zeus_selected_groups") || "[]"));
	const { checkNotifications, updateNotificationSettings } = usePushNotifications(user?.username, selectedGroups, notificationSettings);

	const [scheduleContext, setScheduleContext] = useState({ type: "group", ids: selectedGroups, label: "Mes Groupes" });

	const [groups, setGroups] = useState([]);
	const [groupSearch, setGroupSearch] = useState("");
	const [showGroupModal, setShowGroupModal] = useState(false);
	const [selectedRooms, setSelectedRooms] = useState([]);
	const [rooms, setRooms] = useState([]);
	const [roomSearch, setRoomSearch] = useState("");
	const [selectedTeachers, setSelectedTeachers] = useState([]);
	const [teachers, setTeachers] = useState([]);
	const [teacherSearch, setTeacherSearch] = useState("");
	const [filterOptionsLoading, setFilterOptionsLoading] = useState(false);
	const [selectedEvent, setSelectedEvent] = useState(null);
	const [showSettingsModal, setShowSettingsModal] = useState(false);
	const [showNotificationsModal, setShowNotificationsModal] = useState(false);
	const [showRoomAvailabilityModal, setShowRoomAvailabilityModal] = useState(false);

	const [loading, setLoading] = useState(false);
	const [error, setError] = useState(null);
	const [now, setNow] = useState(new Date());
	const [sidebarOpen, setSidebarOpen] = useState(false);
	const todayRef = useRef(null);
	const isNarrow = useMediaQuery("(max-width: 720px)");
	const weekStart = useMemo(() => getWeekStart(currentDate), [currentDate]);
	const weekKey = weekStart.getTime();
	const eventDetailsCacheRef = useRef(new Map());
	const selectedEventRequestRef = useRef(0);

	useEffect(() => {
		const timer = setInterval(() => setNow(new Date()), 60000);
		return () => clearInterval(timer);
	}, []);

	useEffect(() => {
		if (zeusToken) {
			loadGroups().then(() => {
				if (selectedGroups.length === 0) setShowGroupModal(true);
			});
			loadFilterOptions();
		}
	}, [zeusToken]);

	useEffect(() => {
		if (scheduleContext.type === "group") {
			setScheduleContext((prev) => ({ ...prev, ids: selectedGroups, label: "Mes Groupes" }));
		}
	}, [selectedGroups]);

	const calendarFilters = useMemo(
		() =>
			buildEffectiveCalendarFilters(
				{ groups: selectedGroups, rooms: selectedRooms, teachers: selectedTeachers },
				scheduleContext,
			),
		[scheduleContext, selectedGroups, selectedRooms, selectedTeachers],
	);

	const hasCalendarFilter = calendarFilters.groups.length > 0 || calendarFilters.rooms.length > 0 || calendarFilters.teachers.length > 0;

	useEffect(() => {
		if (!zeusToken) return;
		if (!hasCalendarFilter) {
			setEvents([]);
			return;
		}
		loadCalendar();
	}, [zeusToken, calendarFilters, hasCalendarFilter, weekKey]);

	useEffect(() => {
		if (!notificationSettings.enabled || events.length === 0) return;

		const eventsToCheck = events.filter((event) => !isEventCancelled(event) && shouldNotifyForEvent(event));
		if (eventsToCheck.length > 0) {
			checkNotifications(eventsToCheck);
		}

		const interval = setInterval(() => {
			const eventsToCheck = events.filter((event) => !isEventCancelled(event) && shouldNotifyForEvent(event));
			if (eventsToCheck.length > 0) {
				checkNotifications(eventsToCheck);
			}
		}, 60000);

		return () => clearInterval(interval);
	}, [events, notificationSettings.enabled, shouldNotifyForEvent, checkNotifications]);

	useEffect(() => {
		if (notificationSettings.enabled) {
			updateNotificationSettings(notificationSettings, selectedGroups);
		}
	}, [notificationSettings, selectedGroups, updateNotificationSettings]);

	useEffect(() => {
		if (viewMode === "list" && todayRef.current) {
			setTimeout(() => {
				todayRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
			}, 100);
		}
	}, [viewMode, events]);

	const loadGroups = async () => {
		try {
			setLoading(true);
			const res = await fetchApi("/api/groups", {
				headers: { Authorization: `Bearer ${zeusToken}` },
			});
			const data = await res.json();

			if (data.offline && data.cached === false) {
				const cachedGroups = localStorage.getItem("zeus_cached_groups");
				if (cachedGroups) {
					const parsedGroups = JSON.parse(cachedGroups);
					setGroups(parsedGroups);
					console.log("📦 Groupes chargés depuis le cache local");
				} else {
					setError("Aucune donnée en cache disponible");
				}
			} else {
				setGroups(data);
				localStorage.setItem("zeus_cached_groups", JSON.stringify(data));
			}
		} catch (err) {
			console.error(err);
			const cachedGroups = localStorage.getItem("zeus_cached_groups");
			if (cachedGroups) {
				setGroups(JSON.parse(cachedGroups));
				console.log("📦 Groupes chargés depuis le cache local après erreur");
			} else {
				setError("Erreur chargement groupes");
				trackEvent("groups_load_failed", { source: "api" });
			}
		} finally {
			setLoading(false);
		}
	};

	const loadFilterOptions = async () => {
		try {
			setFilterOptionsLoading(true);
			const headers = { Authorization: `Bearer ${zeusToken}` };
			const [roomsResponse, teachersResponse] = await Promise.all([fetchApi("/api/rooms", { headers }), fetchApi("/api/teachers", { headers })]);
			if (!roomsResponse.ok || !teachersResponse.ok) throw new Error("Impossible de charger les filtres de calendrier");

			const [roomsData, teachersData] = await Promise.all([roomsResponse.json(), teachersResponse.json()]);
			setRooms(Array.isArray(roomsData) ? roomsData : []);
			setTeachers(Array.isArray(teachersData) ? teachersData : []);
		} catch (err) {
			console.error("Erreur chargement filtres calendrier", err);
			trackEvent("calendar_filter_options_load_failed");
		} finally {
			setFilterOptionsLoading(false);
		}
	};

	const loadCalendar = async () => {
		let cacheKey = "";
		try {
			setLoading(true);
			setError(null);
			const start = getWeekStart(currentDate);
			const end = addDays(start, 7);

			const params = buildCalendarFilterParams(calendarFilters);
			params.set("start", start.toISOString());
			params.set("end", end.toISOString());

			cacheKey = `zeus_events_${calendarFilters.groups.join("_")}_${calendarFilters.rooms.join("_")}_${calendarFilters.teachers.join("_")}_${start.toISOString()}_${end.toISOString()}`;

			const res = await fetchApi(`/api/events?${params.toString()}`, {
				headers: { Authorization: `Bearer ${zeusToken}` },
			});
			const data = await res.json();

			if (data.offline && data.cached === false) {
				const cachedEvents = localStorage.getItem(cacheKey);
				if (cachedEvents) {
					const parsedEvents = JSON.parse(cachedEvents) || [];
					setEvents(parsedEvents);
					trackEvent("calendar_loaded", {
						source: "cache",
						view_mode: viewMode,
						context_type: scheduleContext.type,
						event_count: parsedEvents.length,
					});
					console.log("📦 Événements chargés depuis le cache local");
				} else {
					setEvents([]);
					setError("Aucune donnée en cache disponible pour cette période");
				}
			} else {
				const cachedEvents = JSON.parse(localStorage.getItem(cacheKey) || "[]");
				const apiEvents = Array.isArray(data) ? data : [];
				const reconciledEvents = reconcileEventsWithCache(apiEvents, Array.isArray(cachedEvents) ? cachedEvents : []);
				setEvents(reconciledEvents);
				localStorage.setItem(cacheKey, JSON.stringify(reconciledEvents));
				trackEvent("calendar_loaded", {
					source: "api",
					result: "success",
					view_mode: viewMode,
					context_type: scheduleContext.type === "single-group" ? "group" : scheduleContext.type,
				});
			}
		} catch (err) {
			const cachedEvents = localStorage.getItem(cacheKey);
			if (cachedEvents) {
				setEvents(JSON.parse(cachedEvents) || []);
				console.log("📦 Événements chargés depuis le cache local après erreur");
			} else {
				setError("Erreur chargement événements: " + err.message);
				trackEvent("calendar_load_failed", {
					view_mode: viewMode,
					context_type: scheduleContext.type,
				});
			}
		} finally {
			setLoading(false);
		}
	};

	const handleEventClick = async (ev) => {
		const requestId = selectedEventRequestRef.current + 1;
		selectedEventRequestRef.current = requestId;
		const detailCacheKey = getEventCacheKey(ev);
		const cachedEvent = eventDetailsCacheRef.current.get(detailCacheKey);

		trackEvent("event_details_opened", {
			view_mode: viewMode,
			has_online: !!ev.isOnline,
			has_rooms: (ev.rooms?.length || 0) > 0,
			has_teachers: (ev.teachers?.length || 0) > 0,
		});

		if (cachedEvent) {
			setSelectedEvent(cachedEvent);
			return;
		}

		setSelectedEvent({ ...ev, loadingDetails: true });
		if (isEventCancelled(ev)) {
			setSelectedEvent({ ...ev, loadingDetails: false });
			return;
		}

		if (!ev.idReservation) {
			setSelectedEvent({ ...ev, loadingDetails: false });
			return;
		}

		try {
			const res = await fetchApi(`/api/reservation/${ev.idReservation}/details`, {
				headers: { Authorization: `Bearer ${zeusToken}` },
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data = await res.json();

			let courseTypeName = null;
			if (data.idType) {
				try {
					const typeRes = await fetchApi(`/api/coursetype/${data.idType}`, {
						headers: { Authorization: `Bearer ${zeusToken}` },
					});
					if (typeRes.ok) {
						const typeData = await typeRes.json();
						courseTypeName = typeData.type;
					}
				} catch (err) {
					console.error("Erreur chargement type de cours:", err);
				}
			}

			const mergedEvent = {
				...ev,
				...data,
				courseTypeName,
				startObj: data.startDate ? new Date(data.startDate) : ev.startObj,
				endObj: data.endDate ? new Date(data.endDate) : ev.endObj,
				loadingDetails: false,
			};
			eventDetailsCacheRef.current.set(detailCacheKey, mergedEvent);
			if (selectedEventRequestRef.current !== requestId) return;
			setSelectedEvent(mergedEvent);
		} catch (err) {
			trackEvent("event_details_load_failed", {
				result: "failure",
				source: "event_details",
				phase: "reservation_details",
			});
			console.error("Erreur chargement détails réservation:", err);
			if (selectedEventRequestRef.current !== requestId) return;
			setSelectedEvent({ ...ev, loadingDetails: false });
		}
	};

	const filteredGroupTree = useMemo(() => {
		if (!groups.length) return [];

		const groupMap = {};
		groups.forEach((g) => (groupMap[g.id] = { ...g, children: [] }));

		const roots = [];
		groups.forEach((g) => {
			if (g.idParent && groupMap[g.idParent]) {
				groupMap[g.idParent].children.push(groupMap[g.id]);
			} else {
				roots.push(groupMap[g.id]);
			}
		});

		const toLower = (s) => s?.toLowerCase() || "";
		const term = toLower(groupSearch);

		const filterNode = (node) => {
			const matchSelf = toLower(node.name).includes(term);
			const filteredChildren = node.children.map(filterNode).filter(Boolean);

			if (matchSelf || filteredChildren.length > 0) {
				return { ...node, children: filteredChildren };
			}
			return null;
		};

		if (!term) return roots;
		return roots.map(filterNode).filter(Boolean);
	}, [groups, groupSearch]);

	const { processedEvents, gridStart, gridEnd } = useMemo(() => {
		let minHour = 8;
		let maxHour = 19;
		const items = events.map((ev) => {
			const start = new Date(ev.startDate);
			const end = new Date(ev.endDate);
			const startDay = new Date(start).setHours(0, 0, 0, 0);
			const endDay = new Date(end).setHours(0, 0, 0, 0);
			const isMultiDay = endDay > startDay;
			const item = {
				...ev,
				startObj: start,
				endObj: end,
				dateKey: start.toDateString(),
				startTime: start.getTime(),
				endTime: end.getTime(),
				hue: courseHue(ev.name || ev.typeName || ""),
				isMultiDay,
			};
			if (!isMultiDay) {
				item.startHour = start.getHours() + start.getMinutes() / 60;
				item.endHour = end.getHours() + end.getMinutes() / 60;
				minHour = Math.min(minHour, Math.floor(item.startHour));
				maxHour = Math.max(maxHour, Math.ceil(item.endHour));
			}
			return item;
		});

		// Colonnes côte à côte pour les cours qui commencent à la même heure.
		const byStart = new Map();
		items
			.filter((ev) => !ev.isMultiDay)
			.forEach((ev) => {
				const key = `${ev.dateKey}-${ev.startTime}`;
				if (!byStart.has(key)) byStart.set(key, []);
				byStart.get(key).push(ev);
			});
		byStart.forEach((box) =>
			box.forEach((ev, index) => {
				ev.column = index;
				ev.totalColumns = box.length;
			}),
		);

		const total = maxHour - minHour;
		items.forEach((ev) => {
			if (ev.isMultiDay) return;
			const width = 100 / ev.totalColumns;
			// 2px de marge papier autour de chaque cellule.
			ev.style = {
				top: `calc(${((ev.startHour - minHour) / total) * 100}% + 2px)`,
				height: `calc(${((ev.endHour - ev.startHour) / total) * 100}% - 4px)`,
				left: `calc(${ev.column * width}% + 3px)`,
				width: `calc(${width}% - 6px)`,
			};
		});

		return { processedEvents: items.sort((a, b) => a.startTime - b.startTime), gridStart: minHour, gridEnd: maxHour };
	}, [events]);

	const isCurrentWeek = weekKey === getWeekStart(now).getTime();
	const nextEvent = useMemo(() => {
		if (!isCurrentWeek) return null;
		return processedEvents.find((ev) => !isEventCancelled(ev) && ev.endTime > now.getTime()) || null;
	}, [processedEvents, isCurrentWeek, now]);
	const nextKey = nextEvent ? getEventCacheKey(nextEvent) : null;

	const handleNav = (delta) => {
		setCurrentDate(addDays(currentDate, delta * 7));
		trackEvent("calendar_navigated", {
			view_mode: viewMode,
			direction: delta > 0 ? "next" : "previous",
		});
	};

	const toggleGroup = (id) => {
		setSelectedGroups((prev) => {
			const newSelected = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
			localStorage.setItem("zeus_selected_groups", JSON.stringify(newSelected));
			return newSelected;
		});
	};

	const toggleRoom = (id) => {
		setSelectedRooms((previous) => (previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id]));
		trackEvent("calendar_filter_changed", { filter_type: "room" });
	};

	const toggleTeacher = (id) => {
		setSelectedTeachers((previous) => (previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id]));
		trackEvent("calendar_filter_changed", { filter_type: "teacher" });
	};

	const handleContextSwitch = (type, id, label) => {
		const contextType = type === "group" ? "single-group" : type;
		trackEvent("calendar_context_changed", {
			context_type: type,
			source: "event_details",
		});
		setScheduleContext({ type: contextType, ids: [id], label });
		setSelectedEvent(null);
	};

	const resetContext = () => {
		trackEvent("calendar_context_changed", {
			context_type: "group",
			source: "calendar_header",
		});
		setScheduleContext({ type: "group", ids: selectedGroups, label: "Mes Groupes" });
	};

	const applyRoomCalendarFilter = (room) => {
		if (!room?.id) return;
		trackEvent("calendar_context_changed", {
			context_type: "room",
			source: "room_search",
		});
		setScheduleContext({
			type: "room",
			ids: [room.id],
			label: room.name || `Salle #${room.id}`,
		});
		setSelectedEvent(null);
	};

	const handleViewModeChange = (mode) => {
		setViewMode(mode);
		localStorage.setItem("zeus_view_mode", mode);
		trackEvent("calendar_view_changed", { view_mode: mode });
	};

	const roomNames = (ev) => ev.rooms?.map((r) => r.name).filter(Boolean).join(", ");
	const isNextEvent = (ev) => getEventCacheKey(ev) === nextKey;
	// Le surligneur passe sur le nom du prochain cours, comme un vrai trait de fluo.
	const courseTitle = (ev) => (isNextEvent(ev) ? <mark className="marker">{ev.name || ev.typeName}</mark> : ev.name || ev.typeName);
	const courseClass = (ev, base) =>
		[base, isEventCancelled(ev) && "is-cancelled", getEventCacheKey(ev) === nextKey && "is-next"].filter(Boolean).join(" ");

	const weekDays = [...Array(7)].map((_, i) => addDays(weekStart, i));
	const eventsOnDay = (day) => {
		const dayStart = new Date(day).setHours(0, 0, 0, 0);
		const dayEnd = addDays(day, 1).setHours(0, 0, 0, 0);
		return processedEvents.filter((ev) => ev.startTime < dayEnd && ev.endTime > dayStart);
	};
	const hasWeekend = weekDays.slice(5).some((day) => eventsOnDay(day).length > 0);
	const visibleDays = hasWeekend ? weekDays : weekDays.slice(0, 5);
	const selectedDay = visibleDays.find((day) => day.toDateString() === currentDate.toDateString()) || visibleDays[0];

	const renderGrid = () => {
		const days = isNarrow ? [selectedDay] : visibleDays;
		const hours = [...Array(gridEnd - gridStart)].map((_, i) => gridStart + i);
		const multiDay = days.map((day) => eventsOnDay(day).filter((ev) => ev.isMultiDay));
		const hasMultiDay = multiDay.some((list) => list.length > 0);
		const nowHour = now.getHours() + now.getMinutes() / 60;

		return (
			<div className="planner" style={{ "--hours": gridEnd - gridStart, "--days": days.length }}>
				{isNarrow ? (
					<div className="day-strip" role="group" aria-label="Choisir le jour">
						{visibleDays.map((day) => {
							const isSelected = day === selectedDay;
							const count = eventsOnDay(day).length;
							return (
								<button
									type="button"
									key={day.toDateString()}
									className={`${isSelected ? "is-on" : ""} ${day.toDateString() === now.toDateString() ? "is-today" : ""}`}
									aria-pressed={isSelected}
									aria-label={`${day.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric" })}, ${count} cours`}
									onClick={() => setCurrentDate(day)}>
									<span>{day.toLocaleDateString("fr-FR", { weekday: "short" }).replace(".", "")}</span>
									<strong>{day.getDate()}</strong>
									<i className={count ? "has-courses" : ""} aria-hidden="true" />
								</button>
							);
						})}
					</div>
				) : (
					<div className="planner-head">
						<span />
						{days.map((day) => (
							<div key={day.toDateString()} className={`planner-day ${day.toDateString() === now.toDateString() ? "is-today" : ""}`}>
								<span>{day.toLocaleDateString("fr-FR", { weekday: "short" }).replace(".", "")}</span>
								<strong>{day.getDate()}</strong>
							</div>
						))}
					</div>
				)}

				{hasMultiDay && (
					<div className="planner-allday">
						<span className="planner-allday-label">Journée</span>
						{multiDay.map((list, index) => (
							<div key={index} className="planner-allday-col">
								{list.map((ev) => (
									<button
										type="button"
										key={getEventCacheKey(ev)}
										className={courseClass(ev, "allday-course")}
										style={{ "--h": ev.hue }}
										onClick={() => handleEventClick(ev)}>
										{courseTitle(ev)}
									</button>
								))}
							</div>
						))}
					</div>
				)}

				<div className="planner-body">
					<div className="planner-hours" aria-hidden="true">
						{hours.map((h) => (
							<span key={h} style={{ top: `${((h - gridStart) / (gridEnd - gridStart)) * 100}%` }}>
								{String(h).padStart(2, "0")}h
							</span>
						))}
					</div>
					{days.map((day) => {
						const isToday = day.toDateString() === now.toDateString();
						const dayEvents = processedEvents.filter((ev) => !ev.isMultiDay && ev.dateKey === day.toDateString());
						return (
							<div key={day.toDateString()} className="planner-col">
								{isToday && nowHour >= gridStart && nowHour < gridEnd && (
									<div className="now-line" style={{ top: `${((nowHour - gridStart) / (gridEnd - gridStart)) * 100}%` }} title={`Il est ${formatTime(now)}`} />
								)}
								{dayEvents.map((ev) => {
									const groupNames = getDisplayedGroupNames(ev.groups, scheduleContext);
									return (
										<button
											type="button"
											key={getEventCacheKey(ev)}
											className={courseClass(ev, "course")}
											style={{ ...ev.style, "--h": ev.hue }}
											onClick={() => handleEventClick(ev)}>
											<span className="course-time">
												{formatTime(ev.startObj)}–{formatTime(ev.endObj)}
												{ev.isOnline && <Laptop size={13} strokeWidth={2.2} aria-label="En ligne" />}
											</span>
											<strong className="course-name">{courseTitle(ev)}</strong>
											{roomNames(ev) && <span className="course-room">{roomNames(ev)}</span>}
											{groupNames.length > 0 && <span className="course-room">{groupNames.join(", ")}</span>}
											{isEventCancelled(ev) && <span className="hand course-note">annulé</span>}
										</button>
									);
								})}
							</div>
						);
					})}
				</div>
				{processedEvents.length === 0 && !loading && <p className="planner-empty">Aucun cours cette semaine.</p>}
			</div>
		);
	};

	const renderList = () => {
		const days = weekDays.map((day) => ({ day, items: eventsOnDay(day) })).filter(({ items }) => items.length > 0);

		if (days.length === 0) {
			return (
				<div className="agenda-empty">
					<p>Aucun cours cette semaine.</p>
					<button type="button" className="btn" onClick={() => handleNav(1)}>
						Semaine suivante
						<ChevronRight size={16} strokeWidth={2.2} aria-hidden="true" />
					</button>
				</div>
			);
		}

		return (
			<div className="agenda">
				{days.map(({ day, items }) => {
					const isToday = day.toDateString() === now.toDateString();
					return (
						<section key={day.toDateString()} className="agenda-day" ref={isToday ? todayRef : null}>
							<h2 className="agenda-date">
								{day.toLocaleDateString("fr-FR", { weekday: "long" })}
								<span>{day.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}</span>
								{isToday && <span className="hand agenda-today">aujourd'hui</span>}
							</h2>
							<ol>
								{items.map((ev) => {
									const teachers = ev.teachers?.map((t) => `${t.firstname || ""} ${t.name || ""}`.trim()).filter(Boolean);
									return (
										<li key={getEventCacheKey(ev)}>
											<button type="button" className={courseClass(ev, "agenda-row")} style={{ "--h": ev.hue }} onClick={() => handleEventClick(ev)}>
												<span className="agenda-time">
													{ev.isMultiDay ? (
														<>
															<span>{ev.startObj.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</span>
															<span>{ev.endObj.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</span>
														</>
													) : (
														<>
															<span>{formatTime(ev.startObj)}</span>
															<span>{formatTime(ev.endObj)}</span>
														</>
													)}
												</span>
												<span className="agenda-main">
													<strong>{courseTitle(ev)}</strong>
													<span>
														{[roomNames(ev), ev.isOnline && "En ligne", teachers?.join(", ")].filter(Boolean).join(" · ") || "Salle non précisée"}
													</span>
												</span>
												{isEventCancelled(ev) && <span className="hand agenda-note">annulé</span>}
											</button>
										</li>
									);
								})}
							</ol>
						</section>
					);
				})}
			</div>
		);
	};

	const closeDrawer = () => setSidebarOpen(false);

	return (
		<div className={`app ${sidebarOpen ? "drawer-open" : ""}`}>
			<CalendarHeader
				weekStart={weekStart}
				isOnToday={currentDate.toDateString() === now.toDateString()}
				handleNav={handleNav}
				goToToday={() => setCurrentDate(new Date())}
				viewMode={viewMode}
				setViewMode={handleViewModeChange}
				sidebarOpen={sidebarOpen}
				setSidebarOpen={setSidebarOpen}
				onOpenRoomFinder={() => {
					trackEvent("room_finder_opened", { source: "calendar_header" });
					setShowRoomAvailabilityModal(true);
				}}
			/>

			<div className="app-body">
				{sidebarOpen && <div className="drawer-scrim" onClick={closeDrawer} aria-hidden="true" />}
				<Sidebar
					sidebarOpen={sidebarOpen}
					onClose={closeDrawer}
					currentDate={currentDate}
					setCurrentDate={(date) => {
						setCurrentDate(date);
						closeDrawer();
					}}
					jumpToDate={setCurrentDate}
					selectedGroups={selectedGroups}
					groups={groups}
					toggleGroup={toggleGroup}
					setShowGroupModal={setShowGroupModal}
					selectedRooms={selectedRooms}
					rooms={rooms}
					roomSearch={roomSearch}
					setRoomSearch={setRoomSearch}
					toggleRoom={toggleRoom}
					selectedTeachers={selectedTeachers}
					teachers={teachers}
					teacherSearch={teacherSearch}
					setTeacherSearch={setTeacherSearch}
					toggleTeacher={toggleTeacher}
					filterOptionsLoading={filterOptionsLoading}
					theme={theme}
					toggleTheme={toggleTheme}
					setShowSettingsModal={setShowSettingsModal}
					setShowNotificationsModal={setShowNotificationsModal}
					logout={logout}
				/>

				<main className="app-main">
					{(scheduleContext.type !== "group" || nextEvent || error) && (
						<div className="app-notes">
							{scheduleContext.type !== "group" && (
								<div className="context-note paper-lilac">
									<span>Planning de</span>
									<strong>{scheduleContext.label}</strong>
									<button type="button" className="btn is-small" onClick={resetContext}>
										<ArrowLeft size={15} strokeWidth={2.2} aria-hidden="true" />
										Mes groupes
									</button>
								</div>
							)}
							{nextEvent && (
								<button type="button" className="next-up paper-orange" onClick={() => handleEventClick(nextEvent)}>
									<span className="next-up-label">{nextEvent.startObj <= now ? "En cours" : "Prochain cours"}</span>
									<span className="next-up-time">{formatTime(nextEvent.startObj)}</span>
									<span className="next-up-main">
										<strong>{nextEvent.name || nextEvent.typeName}</strong>
										<span>{roomNames(nextEvent) || (nextEvent.isOnline ? "En ligne" : "Salle non précisée")}</span>
									</span>
									<span className="hand next-up-when">← {formatRelative(nextEvent, now)}</span>
								</button>
							)}
							{error && (
								<div className="error-note" role="alert">
									<AlertTriangle size={18} strokeWidth={2.2} aria-hidden="true" />
									<span>{error}</span>
									<button
										type="button"
										className="btn is-small"
										onClick={() => {
											setError(null);
											loadCalendar();
										}}>
										Réessayer
									</button>
								</div>
							)}
						</div>
					)}

					<section className={`planning sheet ${loading ? "is-loading" : ""}`} aria-busy={loading} aria-label="Emploi du temps">
						{selectedGroups.length === 0 && scheduleContext.type === "group" && selectedRooms.length === 0 && selectedTeachers.length === 0 ? (
							<div className="agenda-empty">
								<p>Choisis ton groupe pour afficher ton emploi du temps.</p>
								<button type="button" className="ticket is-ink is-compact" onClick={() => setShowGroupModal(true)}>
									<span className="ticket-stub">
										<Users size={18} strokeWidth={2.2} aria-hidden="true" />
									</span>
									<span className="ticket-text">
										<strong>Choisir mes groupes</strong>
									</span>
								</button>
							</div>
						) : viewMode === "week" ? (
							renderGrid()
						) : (
							renderList()
						)}
					</section>
				</main>
			</div>

			{showGroupModal && (
				<GroupSelectionModal
					onClose={() => setShowGroupModal(false)}
					filteredGroupTree={filteredGroupTree}
					selectedGroups={selectedGroups}
					onToggle={toggleGroup}
					groupSearch={groupSearch}
					setGroupSearch={setGroupSearch}
					onValidate={() => {
						setShowGroupModal(false);
						trackEvent("group_selection_saved", {
							result: selectedGroups.length > 0 ? "success" : "empty",
							group_count: selectedGroups.length,
						});
					}}
				/>
			)}

			{selectedEvent && (
				<EventDetailsModal event={selectedEvent} selectedGroups={selectedGroups} onClose={() => setSelectedEvent(null)} onContextSwitch={handleContextSwitch} />
			)}

			{showSettingsModal && <SettingsModal onClose={() => setShowSettingsModal(false)} />}
			{showNotificationsModal && <NotificationSettings onClose={() => setShowNotificationsModal(false)} userEmail={user?.username} userGroups={selectedGroups} />}
			{showRoomAvailabilityModal && (
				<RoomAvailabilityModal
					onClose={() => setShowRoomAvailabilityModal(false)}
					zeusToken={zeusToken}
					selectedGroups={selectedGroups}
					onApplyRoomFilter={applyRoomCalendarFilter}
				/>
			)}
		</div>
	);
};

export default Calendar;
