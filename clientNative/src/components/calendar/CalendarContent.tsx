import React from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import { Bell, CalendarDays, ChevronLeft, ChevronRight, DoorOpen, Filter, MapPin, Users, WifiOff, X } from "lucide-react-native";
import Card from "../Card";
import DatePickerModal from "../DatePickerModal";
import EventDetailsModal from "../EventDetailsModal";
import { useTheme } from "../../context/ThemeContext";
import { isEventCancelled, getLocalEventKey } from "../../services/localEvents";
import { getCourseColor, getEventTitle, hexToRgba, startOfDay } from "../../utils/calendar";
import { ChangeHistoryModal, EventCard, formatEventChangeNotice } from "./CalendarEvents";
import { GroupModal, RoomFinderModal } from "./CalendarSelectionModals";
import { s } from "./calendarStyles";

export function CalendarContent({
	applyContext,
	applyDate,
	changeHistory,
	clearChanges,
	compactDate,
	context,
	contextLabel,
	currentDate,
	dateButtonLabel,
	dayKey,
	days,
	deleteEvent,
	error,
	eventChanges,
	eventsByDay,
	filteredGroups,
	focusedDay,
	groupSearch,
	headerTitle,
	highlightedEventKey,
	ignoreEvent,
	loading,
	move,
	nextEvent,
	nextEventColor,
	nextEventEndTime,
	nextEventIsNow,
	nextEventProgress,
	nextEventRooms,
	nextEventStartTime,
	noteSummaries,
	now,
	openDetails,
	openEventSyllabus,
	pickerMonth,
	reactivateEvent,
	refreshNoteSummaries,
	resetContext,
	selectedDay,
	selectedDayStatus,
	selectedEvent,
	selectedEventSyllabus,
	selectedGroups,
	selectedLabels,
	setCurrentDate,
	setEventChanges,
	setFocusedDay,
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
	applyGroups,
	viewMode,
	visibleEvents,
}: any) {
	const { theme } = useTheme();
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
							<Pressable style={[s.iconBtn, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={() => setShowChangesPanel(true)}>
								<Bell color={changeHistory.length ? theme.warn : theme.text} size={20} />
								{changeHistory.length ? (
									<View style={[s.changeBadge, { backgroundColor: theme.warn }]}>
										<Text style={s.changeBadgeText}>{Math.min(changeHistory.length, 9)}</Text>
									</View>
								) : null}
							</Pressable>
							<Pressable style={[s.iconBtn, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={() => setShowGroups(true)}>
								<Users color={theme.text} size={21} />
							</Pressable>
							<Pressable style={[s.iconBtn, { backgroundColor: theme.accent, borderColor: theme.accent }]} onPress={() => setShowRooms(true)}>
								<DoorOpen color="#fff" size={20} />
							</Pressable>
						</View>
					</Animated.View>

					<Animated.View entering={FadeInDown.delay(55).duration(400)} style={[s.overviewCard, { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.cardShadow }]}>
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
							<View style={[s.nextStrip, nextEventIsNow && s.nextStripLive, { backgroundColor: hexToRgba(nextEventColor, 0.13), borderColor: hexToRgba(nextEventColor, 0.34) }]}>
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
										<View style={{ backgroundColor: hexToRgba(nextEventColor, 0.14), borderRadius: 8, padding: 2, flexDirection: "column", alignItems: "flex-start" }}>
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
							<Pressable style={s.roomChangeBody} onPress={() => setShowChangesPanel(true)}>
								<Text style={[s.roomChangeText, { color: theme.text }]} numberOfLines={2}>
									{formatEventChangeNotice(eventChanges)}
								</Text>
								<Text style={[s.roomChangeHint, { color: theme.muted }]}>Voir toutes les modifications</Text>
							</Pressable>
							<Pressable style={s.roomChangeClose} onPress={() => setEventChanges([])}>
								<X color={theme.muted} size={16} />
							</Pressable>
						</Animated.View>
					) : null}

					<Animated.View entering={FadeInDown.delay(130).duration(380)} style={[s.segment, { backgroundColor: theme.surfaceSoft }]}>
						{(["week", "day", "list"] as const).map((mode) => (
							<Pressable key={mode} style={[s.segmentItem, viewMode === mode && { backgroundColor: theme.surface }]} onPress={() => setMode(mode)}>
								<Text style={[s.segmentText, { color: viewMode === mode ? theme.text : theme.muted }]}>{mode === "week" ? "Semaine" : mode === "day" ? "Jour" : "Liste"}</Text>
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
							{days.map((day: Date) => {
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
											{dayEvents.slice(0, 4).map((event: any, index: number) => (
												<View
													key={`${event.idReservation || event.id || index}`}
													style={[s.dayDot, isEventCancelled(event) && s.dayDotCancelled, { backgroundColor: active ? "#fff" : isEventCancelled(event) ? theme.muted : getCourseColor(event) }]}
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
						visibleEvents.map((event: any, index: number) => (
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
					onSearch={setGroupSearch}
					onApply={applyGroups}
					onClose={() => {
						setShowGroups(false);
						setGroupSearch("");
					}}
				/>
				<DatePickerModal visible={showDatePicker} currentDate={currentDate} pickerMonth={pickerMonth} onChangeMonth={setPickerMonth} onSelectDate={applyDate} onToday={() => applyDate(new Date())} onClose={() => setShowDatePicker(false)} />
				<EventDetailsModal
					event={selectedEvent}
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
