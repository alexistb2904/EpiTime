import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useNotification } from '../context/NotificationContext';
import { usePushNotifications } from '../hooks/usePushNotifications';
import Sidebar from './Sidebar';
import CalendarHeader from './CalendarHeader';
import GroupSelectionModal from './GroupSelectionModal';
import EventDetailsModal from './EventDetailsModal';
import SettingsModal from './SettingsModal';
import { NotificationSettings } from './NotificationSettings';
import './Calendar.css';

const generatePastelColor = (str) => {
	if (!str) return '#a5b4fc';

	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		hash = str.charCodeAt(i) + ((hash << 5) - hash);
	}

	const hue = Math.abs(hash % 360);
	const saturation = 60 + (Math.abs(hash >> 8) % 16);
	const lightness = 70 + (Math.abs(hash >> 16) % 16);

	return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
};

const Calendar = () => {
	const { zeusToken, logout, user } = useAuth();
	const { theme, toggleTheme } = useTheme();
	const { notificationSettings, shouldNotifyForEvent } = useNotification();

	const [currentDate, setCurrentDate] = useState(new Date());
	const [viewMode, setViewMode] = useState(() => {
		const savedViewMode = localStorage.getItem('zeus_view_mode');
		return savedViewMode || 'week';
	});
	const [events, setEvents] = useState([]);

	const [selectedGroups, setSelectedGroups] = useState(JSON.parse(localStorage.getItem('zeus_selected_groups') || '[]'));
	const { checkNotifications, updateNotificationSettings } = usePushNotifications(user?.username, selectedGroups, notificationSettings);

	const [scheduleContext, setScheduleContext] = useState({ type: 'group', ids: selectedGroups, label: 'Mes Groupes' });

	const [groups, setGroups] = useState([]);
	const [groupSearch, setGroupSearch] = useState('');
	const [showGroupModal, setShowGroupModal] = useState(false);
	const [selectedEvent, setSelectedEvent] = useState(null);
	const [selectedEventLoading, setSelectedEventLoading] = useState(false);
	const [showSettingsModal, setShowSettingsModal] = useState(false);
	const [showNotificationsModal, setShowNotificationsModal] = useState(false);

	const [loading, setLoading] = useState(false);
	const [error, setError] = useState(null);
	const [now, setNow] = useState(new Date());
	const [sidebarOpen, setSidebarOpen] = useState(false);
	const todayRef = useRef(null);

	useEffect(() => {
		const timer = setInterval(() => setNow(new Date()), 60000);
		return () => clearInterval(timer);
	}, []);

	useEffect(() => {
		if (zeusToken) {
			loadGroups().then(() => {
				if (selectedGroups.length === 0) setShowGroupModal(true);
			});
		}
	}, [zeusToken]);

	useEffect(() => {
		if (scheduleContext.type === 'group') {
			setScheduleContext((prev) => ({ ...prev, ids: selectedGroups, label: 'Mes Groupes' }));
		}
	}, [selectedGroups]);

	useEffect(() => {
		if (zeusToken && scheduleContext.ids.length > 0) {
			loadCalendar();
		}
	}, [zeusToken, scheduleContext, currentDate, viewMode]);

	useEffect(() => {
		if (!notificationSettings.enabled || events.length === 0) return;

		const eventsToCheck = events.filter((event) => shouldNotifyForEvent(event));
		if (eventsToCheck.length > 0) {
			checkNotifications(eventsToCheck);
		}

		const interval = setInterval(() => {
			const eventsToCheck = events.filter((event) => shouldNotifyForEvent(event));
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
		if (viewMode === 'list' && todayRef.current) {
			setTimeout(() => {
				todayRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
			}, 100);
		}
	}, [viewMode, events]);

	const loadGroups = async () => {
		try {
			setLoading(true);
			const res = await fetch('/api/groups', {
				headers: { Authorization: `Bearer ${zeusToken}` },
			});
			const data = await res.json();

			if (data.offline && data.cached === false) {
				const cachedGroups = localStorage.getItem('zeus_cached_groups');
				if (cachedGroups) {
					setGroups(JSON.parse(cachedGroups));
					console.log('📦 Groupes chargés depuis le cache local');
				} else {
					setError('Aucune donnée en cache disponible');
				}
			} else {
				setGroups(data);
				localStorage.setItem('zeus_cached_groups', JSON.stringify(data));
			}
		} catch (err) {
			console.error(err);
			const cachedGroups = localStorage.getItem('zeus_cached_groups');
			if (cachedGroups) {
				setGroups(JSON.parse(cachedGroups));
				console.log('📦 Groupes chargés depuis le cache local après erreur');
			} else {
				setError('Erreur chargement groupes');
			}
		} finally {
			setLoading(false);
		}
	};

	const loadCalendar = async () => {
		try {
			setLoading(true);
			let start, end;
			if (viewMode === 'day') {
				const d = new Date(currentDate);
				d.setHours(0, 0, 0, 0);
				start = d;
				end = new Date(d);
				end.setDate(end.getDate() + 1);
			} else {
				const range = getWeekRange(currentDate);
				start = range.start;
				end = range.end;
			}

			const params = new URLSearchParams({
				start: start.toISOString(),
				end: end.toISOString(),
			});

			if (scheduleContext.type === 'group' || scheduleContext.type === 'single-group') {
				scheduleContext.ids.forEach((id) => params.append('groups', id));
			} else if (scheduleContext.type === 'teacher') {
				scheduleContext.ids.forEach((id) => params.append('teachers', id));
			} else if (scheduleContext.type === 'room') {
				scheduleContext.ids.forEach((id) => params.append('rooms', id));
			}

			const cacheKey = `zeus_events_${scheduleContext.type}_${scheduleContext.ids.join('_')}_${start.toISOString()}_${end.toISOString()}`;

			const res = await fetch(`/api/events?${params.toString()}`, {
				headers: { Authorization: `Bearer ${zeusToken}` },
			});
			const data = await res.json();

			if (data.offline && data.cached === false) {
				const cachedEvents = localStorage.getItem(cacheKey);
				if (cachedEvents) {
					setEvents(JSON.parse(cachedEvents) || []);
					console.log('📦 Événements chargés depuis le cache local');
				} else {
					setEvents([]);
					setError('Aucune donnée en cache disponible pour cette période');
				}
			} else {
				setEvents(data || []);
				localStorage.setItem(cacheKey, JSON.stringify(data || []));
			}
		} catch (err) {
			const cacheKey = `zeus_events_${scheduleContext.type}_${scheduleContext.ids.join('_')}`;
			const cachedEvents = localStorage.getItem(cacheKey);
			if (cachedEvents) {
				setEvents(JSON.parse(cachedEvents) || []);
				console.log('📦 Événements chargés depuis le cache local après erreur');
			} else {
				setError('Erreur chargement événements: ' + err.message);
			}
		} finally {
			setLoading(false);
		}
	};

	const handleEventClick = async (ev) => {
		setSelectedEventLoading(true);
		setSelectedEvent({ ...ev, loadingDetails: true });

		try {
			const res = await fetch(`/api/reservation/${ev.idReservation}/details`, {
				headers: { Authorization: `Bearer ${zeusToken}` },
			});
			const data = await res.json();

			let courseTypeName = null;
			if (data.idType) {
				try {
					const typeRes = await fetch(`/api/coursetype/${data.idType}`, {
						headers: { Authorization: `Bearer ${zeusToken}` },
					});
					if (typeRes.ok) {
						const typeData = await typeRes.json();
						courseTypeName = typeData.type;
					}
				} catch (err) {
					console.error('Erreur chargement type de cours:', err);
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
			setSelectedEvent(mergedEvent);
		} catch (err) {
			console.error('Erreur chargement détails réservation:', err);
			setSelectedEvent({ ...ev, loadingDetails: false });
		} finally {
			setSelectedEventLoading(false);
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

		const toLower = (s) => s?.toLowerCase() || '';
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

	const processedEvents = useMemo(() => {
		const GRID_START_HOUR = 7;
		const GRID_END_HOUR = 24;
		const GRID_TOTAL_HOURS = GRID_END_HOUR - GRID_START_HOUR;

		const eventsWithPos = [];
		const multiDayEvents = [];

		events.forEach((ev) => {
			const start = new Date(ev.startDate);
			const end = new Date(ev.endDate);

			const courseName = ev.name || ev.typeName || '';
			const courseColor = generatePastelColor(courseName);

			const startDay = new Date(start);
			startDay.setHours(0, 0, 0, 0);
			const endDay = new Date(end);
			endDay.setHours(0, 0, 0, 0);

			const daysDiff = Math.ceil((endDay - startDay) / (1000 * 60 * 60 * 24));

			if (daysDiff > 0) {
				multiDayEvents.push({
					...ev,
					startObj: start,
					endObj: end,
					dateKey: start.toDateString(),
					startTime: start.getTime(),
					endTime: end.getTime(),
					courseColor,
					isMultiDay: true,
					totalDays: daysDiff + 1,
				});
			} else {
				let startHour = start.getHours() + start.getMinutes() / 60;
				let endHour = end.getHours() + end.getMinutes() / 60;

				if (endHour < GRID_START_HOUR) endHour += 24;
				if (startHour < GRID_START_HOUR) startHour += 24;

				const top = ((startHour - GRID_START_HOUR) / GRID_TOTAL_HOURS) * 100;
				const height = ((endHour - startHour) / GRID_TOTAL_HOURS) * 100;

				eventsWithPos.push({
					...ev,
					startObj: start,
					endObj: end,
					dateKey: start.toDateString(),
					startTime: start.getTime(),
					endTime: end.getTime(),
					top,
					height,
					courseColor,
					isMultiDay: false,
				});
			}
		});

		const byDay = {};
		eventsWithPos.forEach((ev) => {
			if (!byDay[ev.dateKey]) byDay[ev.dateKey] = [];
			byDay[ev.dateKey].push(ev);
		});

		Object.values(byDay).forEach((dayEvs) => {
			dayEvs.sort((a, b) => a.startTime - b.startTime);

			const boxes = new Map();

			dayEvs.forEach((ev) => {
				const boxKey = ev.startTime;
				if (!boxes.has(boxKey)) {
					boxes.set(boxKey, []);
				}
				boxes.get(boxKey).push(ev);
			});

			const sortedBoxKeys = Array.from(boxes.keys()).sort((a, b) => a - b);

			sortedBoxKeys.forEach((startTime, boxIndex) => {
				const boxEvents = boxes.get(startTime);
				const count = boxEvents.length;
				boxEvents.forEach((ev, idx) => {
					ev.boxSize = count;
					ev.boxIndex = idx;
					ev.zIndex = boxIndex;
				});
			});

			dayEvs.forEach((ev) => {
				ev.column = ev.boxIndex || 0;
				ev.totalColumns = ev.boxSize || 1;
			});
		});

		return [...multiDayEvents, ...eventsWithPos].map((ev) => {
			const columnWidth = ev.totalColumns > 1 ? 100 / ev.totalColumns : 100;
			const left = (ev.column || 0) * columnWidth;

			return {
				...ev,
				style: {
					top: `${ev.top + 0.15}%`,
					height: `${ev.height - 0.3}%`,
					left: `${left}%`,
					width: `${columnWidth}%`,
					zIndex: ev.zIndex || 0,
				},
			};
		});
	}, [events]);

	const getWeekRange = (date) => {
		const curr = new Date(date);
		const day = curr.getDay() || 7;
		if (day !== 1) curr.setHours(-24 * (day - 1));
		const start = new Date(curr);
		start.setHours(0, 0, 0, 0);
		const end = new Date(start);
		end.setDate(end.getDate() + 7);
		return { start, end };
	};

	const handleNav = (delta) => {
		const newDate = new Date(currentDate);
		if (viewMode === 'day') newDate.setDate(newDate.getDate() + delta);
		else newDate.setDate(newDate.getDate() + delta * 7);
		setCurrentDate(newDate);
	};

	const toggleGroup = (id) => {
		setSelectedGroups((prev) => {
			const newSelected = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
			localStorage.setItem('zeus_selected_groups', JSON.stringify(newSelected));
			return newSelected;
		});
	};

	const handleContextSwitch = (type, id, label) => {
		const contextType = type === 'group' ? 'single-group' : type;
		setScheduleContext({ type: contextType, ids: [id], label });
		setSelectedEvent(null);
	};

	const resetContext = () => {
		setScheduleContext({ type: 'group', ids: selectedGroups, label: 'Mes Groupes' });
	};

	const CurrentTimeLine = () => {
		const GRID_START_HOUR = 7;
		const GRID_END_HOUR = 24;
		const GRID_TOTAL_HOURS = GRID_END_HOUR - GRID_START_HOUR;
		const currentH = now.getHours() + now.getMinutes() / 60;

		if (currentH < GRID_START_HOUR || currentH >= GRID_END_HOUR) return null;
		const top = ((currentH - GRID_START_HOUR) / GRID_TOTAL_HOURS) * 100;
		return <div className="current-time-line" style={{ top: `${top}%` }} title={now.toLocaleTimeString()} />;
	};

	const renderGrid = () => {
		const w = viewMode === 'day' ? { start: currentDate } : getWeekRange(currentDate);
		const daysCount = viewMode === 'day' ? 1 : 7;
		const startRef = viewMode === 'day' ? currentDate : w.start;

		const headers = [];
		const columns = [];

		const multiDayEventsInWeek = processedEvents.filter((ev) => {
			if (!ev.isMultiDay) return false;
			const evStart = new Date(ev.startDate);
			const evEnd = new Date(ev.endDate);
			const weekStart = new Date(startRef);
			const weekEnd = new Date(startRef);
			weekEnd.setDate(weekEnd.getDate() + 7);
			return evStart < weekEnd && evEnd > weekStart;
		});

		for (let i = 0; i < daysCount; i++) {
			const d = new Date(startRef);
			if (viewMode !== 'day') d.setDate(d.getDate() + i);

			const isToday = d.toDateString() === now.toDateString();
			const dateStr = d.toDateString();

			headers.push(
				<div key={i} className={`grid-header-cell ${isToday ? 'today' : ''}`}>
					<span className="day-name">{d.toLocaleDateString('fr-FR', { weekday: 'short' })}</span>
					<span className="day-num">{d.getDate()}</span>
				</div>
			);

			const dayEvents = processedEvents.filter((ev) => !ev.isMultiDay && new Date(ev.startDate).toDateString() === dateStr);

			columns.push(
				<div key={i} className="grid-col">
					{isToday && <CurrentTimeLine />}
					{[...Array(17)].map((_, h) => (
						<div key={h} className="grid-bg-hour" style={{ top: `${((h + 1) / 17) * 100}%` }}></div>
					))}

					{dayEvents.map((ev, idx) => {
						let borderColor = ev.courseColor || 'var(--accent-color)';
						if (borderColor.startsWith('hsl')) {
							borderColor = borderColor.replace(/hsl\((\d+),\s*(\d+)%?,\s*(\d+)%?\)/, (h, hue, sat, light) => `hsl(${hue}, ${sat}%, ${Math.max(0, light - 20)}%)`);
						}
						return (
							<div
								key={idx}
								className={`grid-event ${ev.isOnline ? 'event-online' : ''}`}
								onClick={() => handleEventClick(ev)}
								style={{
									...ev.style,
									borderColor: borderColor,
									backgroundColor: ev.courseColor || 'var(--bg-secondary)',
								}}>
								{ev.isOnline && <div className="event-badge">💻 En ligne</div>}
								<div className="ev-time">
									{ev.startObj.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} -{' '}
									{ev.endObj.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
								</div>
								<div className="ev-title">{ev.name || ev.typeName}</div>
								<div className="ev-room">{ev.rooms?.map((r) => r.name).join(', ')}</div>
							</div>
						);
					})}
				</div>
			);
		}

		return (
			<div className="calendar-grid-wrapper">
				<div className="grid-content">
					<div className="grid-headers">
						<div style={{ width: '60px', flexShrink: 0 }}></div>
						{headers}
					</div>

					{multiDayEventsInWeek.length > 0 && (
						<div className="multi-day-events-bar">
							<div style={{ width: '60px', flexShrink: 0 }}></div>
							<div style={{ display: 'flex', flex: 1 }}>
								{[...Array(daysCount)].map((_, dayIdx) => {
									const d = new Date(startRef);
									if (viewMode !== 'day') d.setDate(d.getDate() + dayIdx);
									const dateStr = d.toDateString();

									const dayMultiDayEvents = multiDayEventsInWeek.filter((ev) => {
										const evStart = new Date(ev.startDate);
										const evEnd = new Date(ev.endDate);
										const dayStart = new Date(dateStr);
										const dayEnd = new Date(dateStr);
										dayEnd.setDate(dayEnd.getDate() + 1);
										return evStart < dayEnd && evEnd > dayStart;
									});

									return (
										<div key={dayIdx} style={{ flex: 1, minHeight: dayMultiDayEvents.length > 0 ? 'auto' : '0' }} className="multi-day-col">
											{dayMultiDayEvents.map((ev, idx) => (
												<div
													key={idx}
													className="multi-day-event-item"
													onClick={() => handleEventClick(ev)}
													style={{
														backgroundColor: ev.courseColor || 'var(--bg-secondary)',
														borderColor: ev.courseColor || 'var(--accent-color)',
														marginBottom: '2px',
													}}>
													<div className="ev-title">{ev.name || ev.typeName}</div>
													<div className="ev-room">{ev.rooms?.map((r) => r.name).join(', ')}</div>
												</div>
											))}
										</div>
									);
								})}
							</div>
						</div>
					)}

					<div style={{ display: 'flex', position: 'relative' }}>
						<div className="time-sidebar">
							{[...Array(18)].map((_, i) => {
								const hour = i + 7;
								const displayHour = hour >= 24 ? hour - 24 : hour;
								return (
									<div key={i} className="time-label" style={{ top: `${(i / 17) * 100}%` }}>
										{displayHour.toString().padStart(2, '0')}:00
									</div>
								);
							})}
						</div>
						<div className="grid-body">{columns}</div>
					</div>
				</div>
			</div>
		);
	};

	const renderList = () => {
		const eventsByIdAndDate = new Map();

		processedEvents.forEach((ev) => {
			const key = `${ev.idReservation || ev.id}`;
			if (!eventsByIdAndDate.has(key)) {
				eventsByIdAndDate.set(key, ev);
			}
		});

		const uniqueEvents = Array.from(eventsByIdAndDate.values());

		const datesMap = new Map();
		uniqueEvents.forEach((ev) => {
			const startDate = new Date(ev.startDate);
			const dateKey = startDate.toDateString();
			const dateLabel = startDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

			if (!datesMap.has(dateKey)) {
				datesMap.set(dateKey, {
					dateLabel,
					dateObj: startDate,
					events: [],
				});
			}
			datesMap.get(dateKey).events.push(ev);
		});
		datesMap.forEach((dateEntry) => {
			dateEntry.events.sort((a, b) => a.startObj - b.startObj);
		});

		const sortedDates = Array.from(datesMap.values()).sort((a, b) => a.dateObj - b.dateObj);

		if (sortedDates.length === 0)
			return (
				<div className="empty-state" style={{ padding: '2rem', textAlign: 'center' }}>
					Aucun cours 😴
				</div>
			);

		const today = now.toDateString();

		return (
			<div className="list-view">
				{sortedDates.map(({ dateLabel, dateObj, events: evs }) => {
					const isToday = dateObj.toDateString() === today;
					return (
						<div key={dateLabel} className="list-section" ref={isToday ? todayRef : null}>
							<h3 className="list-date-sticky">{isToday ? `${dateLabel} (Aujourd'hui)` : dateLabel}</h3>
							<div className="list-events">
								{evs.map((ev, i) => (
									<div
										key={i}
										className={`list-card ${ev.isOnline ? 'list-card-online' : ''} ${ev.isMultiDay ? 'list-card-multiday' : ''}`}
										onClick={() => handleEventClick(ev)}
										style={{
											borderLeftColor: ev.courseColor || 'var(--accent-color)',
											backgroundColor: ev.courseColor ? ev.courseColor.replace('hsl', 'hsla').replace('%)', '%, 0.2)') : 'transparent',
										}}>
										<div className="list-top-row">
											{ev.isOnline && <span className="chip online-chip">💻 En ligne</span>}
											{ev.isMultiDay && <span className="chip multi-day-chip">📅 Multi-jours</span>}
										</div>
										<div className="list-time">
											{ev.startObj.toDateString() === ev.endObj.toDateString() ? (
												<>
													{ev.startObj.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}-
													{ev.endObj.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
												</>
											) : (
												<>
													Du {ev.startObj.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}{' '}
													{ev.startObj.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
													<br />
													au {ev.endObj.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}{' '}
													{ev.endObj.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
												</>
											)}
										</div>
										<div className="list-title">{ev.name || ev.typeName}</div>
										<div className="list-meta">
											{ev.rooms?.map((r) => (
												<span className="chip" key={r.id}>
													📍 {r.name}
												</span>
											))}
										</div>
										{ev.teachers?.length > 0 && (
											<div className="list-teachers">
												{ev.teachers.map((t) => (
													<div className="teacher-line" key={t.id}>
														<span className="teacher-name">
															🎓 {t.firstname} {t.name}
														</span>
													</div>
												))}
											</div>
										)}
									</div>
								))}
							</div>
						</div>
					);
				})}
			</div>
		);
	};

	return (
		<div className="calendar-container">
			{sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)}></div>}

			<Sidebar
				sidebarOpen={sidebarOpen}
				currentDate={currentDate}
				setCurrentDate={setCurrentDate}
				selectedGroups={selectedGroups}
				groups={groups}
				toggleGroup={toggleGroup}
				setShowGroupModal={setShowGroupModal}
				theme={theme}
				toggleTheme={toggleTheme}
				setShowSettingsModal={setShowSettingsModal}
				setShowNotificationsModal={setShowNotificationsModal}
				logout={logout}
			/>

			<div className="main-content">
				<CalendarHeader
					currentDate={currentDate}
					setCurrentDate={setCurrentDate}
					handleNav={handleNav}
					viewMode={viewMode}
					setViewMode={(mode) => {
						setViewMode(mode);
						localStorage.setItem('zeus_view_mode', mode);
					}}
					scheduleContext={scheduleContext}
					resetContext={resetContext}
					sidebarOpen={sidebarOpen}
					setSidebarOpen={setSidebarOpen}
					logout={logout}
				/>

				<div className="calendar-grid-wrapper">
					{viewMode === 'week' ? renderGrid() : renderList()}
					{loading && (
						<div className="loading-overlay">
							<div className="spinner"></div>
						</div>
					)}
				</div>
			</div>

			<GroupSelectionModal
				show={showGroupModal}
				onClose={() => setShowGroupModal(false)}
				filteredGroupTree={filteredGroupTree}
				selectedGroups={selectedGroups}
				onToggle={toggleGroup}
				groupSearch={groupSearch}
				setGroupSearch={setGroupSearch}
				onValidate={() => {
					setShowGroupModal(false);
					loadCalendar();
				}}
			/>

			<EventDetailsModal event={selectedEvent} onClose={() => setSelectedEvent(null)} onContextSwitch={handleContextSwitch} />

			<SettingsModal show={showSettingsModal} onClose={() => setShowSettingsModal(false)} />
			<NotificationSettings isOpen={showNotificationsModal} onClose={() => setShowNotificationsModal(false)} userEmail={user?.username} userGroups={selectedGroups} />
		</div>
	);
};

export default Calendar;
