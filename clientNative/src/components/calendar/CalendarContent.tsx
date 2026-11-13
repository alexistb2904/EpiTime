import React from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn } from "react-native-reanimated";
import { Bell, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, DoorOpen, ListFilter, TriangleAlert, Users, WifiOff, X } from "lucide-react-native";
import DatePickerModal from "../DatePickerModal";
import EventDetailsModal from "../EventDetailsModal";
import { useTheme } from "../../context/ThemeContext";
import { getLocalEventKey, isEventCancelled, isEventIgnored } from "../../services/localEvents";
import { ZeusEvent } from "../../types";
import { getCourseColor, readableTextOn, startOfDay } from "../../utils/calendar";
import { ChangeHistoryModal, DayTimeline, EventCard, formatEventChangeNotice } from "./CalendarEvents";
import { FiltersModal, RoomFinderModal } from "./CalendarSelectionModals";
import { s } from "./calendarStyles";

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
const isActive = (event: ZeusEvent) => !isEventCancelled(event) && !isEventIgnored(event);
const countLabel = (events: ZeusEvent[]) => {
	const active = events.filter(isActive).length;
	if (active) return `${active} cours`;
	if (!events.length) return "Libre";
	return events.some(isEventCancelled) ? "Cours annulés" : "Cours ignorés";
};

export function CalendarContent({
	applyContext,
	applyDate,
	changeHistory,
	clearChanges,
	context,
	contextLabel,
	currentDate,
	dayKey,
	days,
	deleteEvent,
	error,
	eventChanges,
	eventsByDay,
	extraFilterCount,
	groups,
	filteredGroups,
	focusedDay,
	groupSearch,
	highlightedEventKey,
	ignoreEvent,
	loading,
	move,
	noteSummaries,
	now,
	openDetails,
	openEventSyllabus,
	pickerMonth,
	reactivateEvent,
	refreshNoteSummaries,
	resetContext,
	selectDay,
	selectedEvent,
	selectedEventSyllabus,
	selectedGroups,
	selectedRooms,
	selectedTeachers,
	rooms,
	teachers,
	filterOptionsLoading,
	onLoadFilterOptions,
	setEventChanges,
	setGroupSearch,
	setMode,
	setPickerMonth,
	setSelectedEvent,
	setShowChangesPanel,
	setShowDatePicker,
	setShowGroups,
	setShowRooms,
	showChangesPanel,
	showCacheBanner,
	showDatePicker,
	showGroups,
	showRooms,
	swipeGesture,
	applyFilters,
	viewMode,
	visibleEvents,
}: any) {
	const { theme } = useTheme();
	const insets = useSafeAreaInsets();
	const today = startOfDay(new Date(now));
	const isDayView = viewMode !== "list";
	const onAccent = readableTextOn(theme.accent);
	const eventsOf = (day: Date): ZeusEvent[] => eventsByDay.get(dayKey(day)) || [];
	// Weekends only take room in the strip when they hold a course (or are the selected day).
	const shownDays: Date[] = days.filter((day: Date, index: number) => index < 5 || eventsOf(day).length > 0 || sameDay(day, focusedDay));
	const weekHasToday = days.some((day: Date) => sameDay(day, today));
	const onToday = isDayView ? sameDay(focusedDay, today) : weekHasToday;
	const monthLabel = capitalize((isDayView ? focusedDay : days[0]).toLocaleDateString("fr-FR", { month: "long", year: "numeric" }));
	const noGroups = context.type === "group" && !selectedGroups.length;
	const nextDayWithCourses = shownDays.find((day) => day > focusedDay && eventsOf(day).some(isActive));
	const openPicker = () => {
		setPickerMonth(currentDate);
		setShowDatePicker(true);
	};
	const renderEvent = (event: ZeusEvent, railFirst: boolean, railLast: boolean) => (
		<EventCard
			key={`${event.idReservation || event.id}-${event.startDate}`}
			event={event}
			railFirst={railFirst}
			railLast={railLast}
			highlighted={highlightedEventKey === getLocalEventKey(event)}
			noteSummary={noteSummaries[getLocalEventKey(event)]}
			now={now}
			selectedGroups={selectedGroups}
			availableGroups={groups}
			onPress={() => openDetails(event)}
		/>
	);
	const renderTimeline = (dayEvents: ZeusEvent[], day: Date) => <DayTimeline events={dayEvents} now={now} isToday={sameDay(day, today)} renderEvent={renderEvent} />;

	return (
		<GestureDetector gesture={swipeGesture}>
			<View style={[s.root, { backgroundColor: theme.bg }]}>
				<ScrollView contentContainerStyle={[s.content, { paddingTop: insets.top + 12 }]}>
					<View style={s.header}>
						<Pressable style={s.monthBtn} onPress={openPicker} accessibilityRole="button" accessibilityLabel={`${monthLabel}, choisir une date`}>
							<Text style={[s.monthText, { color: theme.text }]} numberOfLines={1}>
								{monthLabel}
							</Text>
							<ChevronDown color={theme.muted} size={20} />
							{loading ? <ActivityIndicator size="small" color={theme.muted} style={s.headerSpinner} /> : null}
						</Pressable>
						<View style={s.headerActions}>
							<Pressable
								style={({ pressed }) => [s.toolBtn, { backgroundColor: pressed ? theme.surfaceSoft : theme.surface }]}
								onPress={() => setShowChangesPanel(true)}
								accessibilityRole="button"
								accessibilityLabel={changeHistory.length ? `Modifications du planning, ${changeHistory.length} nouvelles` : "Modifications du planning"}>
								<Bell color={theme.text} size={20} />
								{changeHistory.length ? (
									<View style={[s.badge, { backgroundColor: theme.warn, borderColor: theme.bg }]}>
										<Text style={[s.badgeText, { color: readableTextOn(theme.warn) }]}>{Math.min(changeHistory.length, 9)}</Text>
									</View>
								) : null}
							</Pressable>
							<Pressable
								style={({ pressed }) => [s.toolBtn, { backgroundColor: pressed ? theme.surfaceSoft : theme.surface }]}
								onPress={() => setShowGroups(true)}
								accessibilityRole="button"
								accessibilityLabel={extraFilterCount ? `Groupes et filtres, ${extraFilterCount} filtres actifs` : "Groupes et filtres"}>
								<ListFilter color={theme.text} size={20} />
								{extraFilterCount ? (
									<View style={[s.badge, { backgroundColor: theme.accent, borderColor: theme.bg }]}>
										<Text style={[s.badgeText, { color: onAccent }]}>{Math.min(extraFilterCount, 9)}</Text>
									</View>
								) : null}
							</Pressable>
						</View>
					</View>

					<View style={s.contextRow}>
						<Pressable
							style={s.contextLabelBtn}
							onPress={() => setShowGroups(true)}
							accessibilityRole="button"
							accessibilityLabel={`Planning affiché : ${contextLabel}. Modifier`}>
							{context.type === "room" ? <DoorOpen color={theme.muted} size={15} /> : <Users color={theme.muted} size={15} />}
							<Text style={[s.contextText, { color: theme.muted }]} numberOfLines={1}>
								{contextLabel}
							</Text>
						</Pressable>
						{context.type !== "group" ? (
							<Pressable
								style={[s.chipBtn, { borderColor: theme.border }]}
								onPress={resetContext}
								hitSlop={6}
								accessibilityRole="button"
								accessibilityLabel="Revenir à mes groupes">
								<X color={theme.text} size={14} />
								<Text style={[s.chipText, { color: theme.text }]}>Mes groupes</Text>
							</Pressable>
						) : null}
						<Pressable style={[s.chipBtn, { borderColor: theme.border }]} onPress={() => setShowRooms(true)} hitSlop={6} accessibilityRole="button">
							<DoorOpen color={theme.muted} size={15} />
							<Text style={[s.chipText, { color: theme.text }]}>Salles libres</Text>
						</Pressable>
						{!onToday ? (
							<Pressable
								style={[s.chipBtn, { backgroundColor: theme.accentSoft, borderColor: "transparent" }]}
								onPress={() => applyDate(new Date())}
								hitSlop={6}
								accessibilityRole="button">
								<Text style={[s.chipText, { color: theme.accent }]}>Aujourd'hui</Text>
							</Pressable>
						) : null}
					</View>

					<View style={s.toolbar}>
						<View style={[s.segment, { backgroundColor: theme.surfaceSoft, borderColor: theme.border }]} accessibilityRole="tablist">
							{(
								[
									["week", "Jour"],
									["list", "Semaine"],
								] as const
							).map(([mode, label]) => {
								const active = viewMode === mode;
								return (
									<Pressable
										key={mode}
										style={[s.segmentItem, active && { backgroundColor: theme.accentSoft }]}
										onPress={() => !active && setMode(mode)}
										accessibilityRole="tab"
										accessibilityState={{ selected: active }}>
										<Text style={[s.segmentText, { color: active ? theme.accent : theme.muted }]}>{label}</Text>
									</Pressable>
								);
							})}
						</View>
						<Pressable
							style={({ pressed }) => [s.navBtn, { backgroundColor: pressed ? theme.surfaceSoft : theme.surface }]}
							onPress={() => move(-1)}
							accessibilityRole="button"
							accessibilityLabel="Semaine précédente">
							<ChevronLeft color={theme.text} size={20} />
						</Pressable>
						<Pressable
							style={({ pressed }) => [s.navBtn, { backgroundColor: pressed ? theme.surfaceSoft : theme.surface }]}
							onPress={() => move(1)}
							accessibilityRole="button"
							accessibilityLabel="Semaine suivante">
							<ChevronRight color={theme.text} size={20} />
						</Pressable>
					</View>

					<View style={s.strip}>
						{shownDays.map((day) => {
							const dayEvents = eventsOf(day);
							const selected = isDayView && sameDay(day, focusedDay);
							const isToday = sameDay(day, today);
							const textColor = selected || isToday ? theme.accent : theme.text;
							return (
								<Pressable
									key={day.toISOString()}
									style={[
										s.stripDay,
										selected && s.stripDaySelected,
										{ backgroundColor: selected ? theme.accentSoft : theme.surface, borderColor: selected || isToday ? theme.accent : theme.border },
									]}
									onPress={() => selectDay(day)}
									accessibilityRole="button"
									accessibilityState={{ selected }}
									accessibilityLabel={`${day.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}${isToday ? ", aujourd'hui" : ""}, ${countLabel(dayEvents)}`}>
									<Text style={[s.stripWeekday, { color: selected || isToday ? theme.accent : theme.muted }]}>
										{day.toLocaleDateString("fr-FR", { weekday: "short" }).replace(".", "")}
									</Text>
									<Text style={[s.stripNum, { color: textColor }]}>{day.getDate()}</Text>
									{dayEvents.length ? (
										<View style={s.stripPills}>
											{dayEvents.slice(0, 4).map((event, index) => (
												<View key={index} style={[s.stripPill, { backgroundColor: isActive(event) ? getCourseColor(event) : theme.border }]} />
											))}
										</View>
									) : (
										<Text style={[s.stripCount, { color: selected ? theme.accent : theme.muted }]}>libre</Text>
									)}
								</Pressable>
							);
						})}
					</View>

					{showCacheBanner ? (
						<View style={[s.banner, { backgroundColor: theme.surface, borderColor: theme.border }]}>
							<WifiOff color={theme.muted} size={17} />
							<Text style={[s.bannerText, { color: theme.text }]}>Hors ligne : planning enregistré affiché. Nouvel essai automatique.</Text>
						</View>
					) : null}

					{eventChanges.length ? (
						<View style={[s.banner, { backgroundColor: theme.surface, borderColor: theme.warn }]}>
							<TriangleAlert color={theme.warn} size={17} />
							<Pressable style={s.bannerBody} onPress={() => setShowChangesPanel(true)} accessibilityRole="button">
								<Text style={[s.bannerText, { color: theme.text }]} numberOfLines={2}>
									{formatEventChangeNotice(eventChanges)}
								</Text>
								<Text style={[s.bannerHint, { color: theme.accent }]}>Voir les modifications</Text>
							</Pressable>
							<Pressable style={s.bannerClose} onPress={() => setEventChanges([])} accessibilityRole="button" accessibilityLabel="Masquer">
								<X color={theme.muted} size={18} />
							</Pressable>
						</View>
					) : null}

					{error ? (
						<View style={[s.banner, { backgroundColor: theme.surface, borderColor: theme.warn }]}>
							<TriangleAlert color={theme.warn} size={17} />
							<Text style={[s.bannerText, { color: theme.text }]}>{error}</Text>
						</View>
					) : null}

					<Animated.View key={isDayView ? dayKey(focusedDay) : `week-${dayKey(days[0])}`} entering={FadeIn.duration(180)}>
						{loading && !visibleEvents.length ? (
							<View style={s.skeleton}>
								{[0, 1, 2].map((index) => (
									<View key={index} style={[s.skeletonBlock, { backgroundColor: theme.surface, borderColor: theme.border }]} />
								))}
							</View>
						) : isDayView ? (
							<>
								<View style={s.dayHeading}>
									<Text style={[s.dayHeadingTitle, { color: theme.text }]} numberOfLines={1}>
										{capitalize(focusedDay.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }))}
									</Text>
									<Text style={[s.dayHeadingMeta, { color: theme.muted }]}>{countLabel(visibleEvents)}</Text>
								</View>
								{visibleEvents.length ? (
									renderTimeline(visibleEvents, focusedDay)
								) : (
									<View style={[s.empty, { backgroundColor: theme.surface, borderColor: theme.border }]}>
										<View style={[s.emptyIcon, { backgroundColor: theme.accentSoft }]}>
											<CalendarDays color={theme.accent} size={24} />
										</View>
										<Text style={[s.emptyTitle, { color: theme.text }]}>{noGroups ? "Aucun groupe choisi" : "Pas de cours ce jour-là"}</Text>
										<Text style={[s.emptyText, { color: theme.muted }]}>
											{noGroups
												? "Choisis tes groupes pour afficher ton planning."
												: nextDayWithCourses
													? "Ton prochain cours de la semaine est plus loin."
													: "Plus rien de prévu cette semaine."}
										</Text>
										{noGroups ? (
											<Pressable style={[s.emptyAction, { backgroundColor: theme.accent }]} onPress={() => setShowGroups(true)} accessibilityRole="button">
												<Text style={[s.emptyActionText, { color: onAccent }]}>Choisir mes groupes</Text>
											</Pressable>
										) : nextDayWithCourses ? (
											<Pressable
												style={[s.emptyAction, { backgroundColor: theme.accentSoft }]}
												onPress={() => selectDay(nextDayWithCourses)}
												accessibilityRole="button">
												<Text style={[s.emptyActionText, { color: theme.accent }]}>
													Voir {nextDayWithCourses.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric" })}
												</Text>
												<ChevronRight color={theme.accent} size={16} />
											</Pressable>
										) : (
											<Pressable style={[s.emptyAction, { backgroundColor: theme.accentSoft }]} onPress={() => move(1)} accessibilityRole="button">
												<Text style={[s.emptyActionText, { color: theme.accent }]}>Semaine suivante</Text>
												<ChevronRight color={theme.accent} size={16} />
											</Pressable>
										)}
									</View>
								)}
							</>
						) : (
							shownDays.map((day) => {
								const dayEvents = eventsOf(day);
								const isToday = sameDay(day, today);
								return (
									<View key={day.toISOString()} style={s.weekDay}>
										<Pressable
											style={[s.weekDayHeading, { borderBottomColor: theme.border }]}
											onPress={() => selectDay(day)}
											accessibilityRole="button"
											accessibilityLabel={`Ouvrir ${day.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric" })}`}>
											<Text style={[s.weekDayTitle, { color: isToday ? theme.accent : theme.text }]}>
												{capitalize(day.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric" }))}
											</Text>
											{isToday ? (
												<View style={[s.todayTag, { backgroundColor: theme.accentSoft }]}>
													<Text style={[s.todayTagText, { color: theme.accent }]}>Aujourd'hui</Text>
												</View>
											) : null}
											<Text style={[s.dayHeadingMeta, s.weekDayMeta, { color: theme.muted }]}>{countLabel(dayEvents)}</Text>
										</Pressable>
										{renderTimeline(dayEvents, day)}
									</View>
								);
							})
						)}
					</Animated.View>
				</ScrollView>

				<FiltersModal
					visible={showGroups}
					groups={filteredGroups}
					allGroups={groups}
					rooms={rooms}
					teachers={teachers}
					selectedGroups={selectedGroups}
					selectedRooms={selectedRooms}
					selectedTeachers={selectedTeachers}
					filterOptionsLoading={filterOptionsLoading}
					onLoadFilterOptions={onLoadFilterOptions}
					groupSearch={groupSearch}
					onGroupSearch={setGroupSearch}
					onApply={applyFilters}
					onClose={() => {
						setShowGroups(false);
						setGroupSearch("");
					}}
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
					selectedGroups={selectedGroups}
					linkedSyllabus={selectedEventSyllabus}
					onClose={() => setSelectedEvent(null)}
					onApplyContext={applyContext}
					onDelete={deleteEvent}
					onIgnore={ignoreEvent}
					onReactivate={reactivateEvent}
					onOpenSyllabus={openEventSyllabus}
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
				<ChangeHistoryModal visible={showChangesPanel} changes={changeHistory} onClose={() => setShowChangesPanel(false)} onClear={clearChanges} />
			</View>
		</GestureDetector>
	);
}
