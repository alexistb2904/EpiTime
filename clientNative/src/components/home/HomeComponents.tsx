import React, { useState } from "react";
import { ActivityIndicator, Image, Linking, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowUpRight, CalendarCheck, CalendarDays, ChevronRight, GraduationCap, MapPin, Plus, RefreshCw, TriangleAlert, Users, WifiOff, X } from "lucide-react-native";
import DatePickerModal from "../DatePickerModal";
import SessionExpiredBanner from "../SessionExpiredBanner";
import { DayTimeline, EventCard, formatEventChangeNotice } from "../calendar/CalendarEvents";
import { s as cs } from "../calendar/calendarStyles";
import { useTheme } from "../../context/ThemeContext";
import { EventChange } from "../../services/eventsCache";
import { ZeusEvent } from "../../types";
import { mixHex } from "../../theme/palettes";
import { getCourseColor, getCourseTypeLabel, getEventTitle, getRoomName, getTeacherName, hexToRgba, readableTextOn } from "../../utils/calendar";
import { formatDuration } from "../../utils/timeline";
import { formatInputDate, formatStartLabel, formatTime, minute, parseInputDate, UsefulLink } from "./homeHelpers";

const greetingFor = (date: Date) => {
	const hour = date.getHours();
	if (hour < 5) return "Réveille-toi, il est tard !";
	if (hour < 12) return "Bonjour";
	if (hour < 18) return "Bon après-midi";
	return "Bonsoir";
};

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
const eventKey = (event: ZeusEvent) => `${event.idReservation || event.id}-${event.startDate}`;

type HomeTab = "today" | "next";

type HomeContentProps = {
	aurigaAverage: string;
	dayRange: string;
	emptyText: string;
	emptyTitle: string;
	eventChanges: EventChange[];
	followingEvent: ZeusEvent | null;
	hasGroups: boolean;
	homeTab: HomeTab;
	isLive: boolean;
	manualDate: string;
	manualEnd: string;
	manualRoom: string;
	manualStart: string;
	manualTitle: string;
	navigation: any;
	nextEvent: ZeusEvent | null;
	nextKicker: string;
	nextRooms?: string;
	now: Date;
	openEventInCalendar: (event?: ZeusEvent | null) => void;
	progress: number;
	refresh: () => void;
	refreshing: boolean;
	saveManualEvent: () => void;
	savingManual: boolean;
	selectedLabels: string[];
	setEventChanges: (changes: EventChange[]) => void;
	setHomeTab: (tab: HomeTab) => void;
	setManualDate: (value: string) => void;
	setManualEnd: (value: string) => void;
	setManualRoom: (value: string) => void;
	setManualStart: (value: string) => void;
	setManualTitle: (value: string) => void;
	setShowManualEvent: (value: boolean) => void;
	showCacheBanner: boolean;
	showManualEvent: boolean;
	statusLabel: string;
	todayActiveCount: number;
	todayEvents: ZeusEvent[];
	upcomingActiveCount: number;
	upcomingEvents: ZeusEvent[];
	usefulLinks: UsefulLink[];
	weekCount: number;
};

export function HomeContent(p: HomeContentProps) {
	const { theme } = useTheme();
	const insets = useSafeAreaInsets();
	const nowMs = p.now.getTime();
	const groupsLabel = p.selectedLabels.length
		? p.selectedLabels.slice(0, 3).join(", ") + (p.selectedLabels.length > 3 ? ` +${p.selectedLabels.length - 3}` : "")
		: "Choisis tes groupes";
	const renderEvent = (event: ZeusEvent, railFirst: boolean, railLast: boolean) => (
		<EventCard key={eventKey(event)} event={event} railFirst={railFirst} railLast={railLast} now={nowMs} onPress={() => p.openEventInCalendar(event)} />
	);
	// "À venir": the next courses grouped by day, each day threaded on its own rail like the agenda.
	const upcomingDays = p.upcomingEvents.reduce<{ day: Date; events: ZeusEvent[] }[]>((days, event) => {
		const start = new Date(event.startDate);
		const last = days[days.length - 1];
		if (last && sameDay(last.day, start)) last.events.push(event);
		else days.push({ day: start, events: [event] });
		return days;
	}, []);
	const listEvents = p.homeTab === "today" ? p.todayEvents : p.upcomingEvents;
	const sectionMeta = p.homeTab === "today" ? (p.todayActiveCount ? `${p.todayActiveCount} cours · ${p.dayRange}` : "Aucun cours") : `${p.upcomingActiveCount} cours`;

	return (
		<ScrollView
			style={[cs.root, { backgroundColor: theme.bg }]}
			contentContainerStyle={[s.content, { paddingTop: insets.top + 12 }]}
			refreshControl={<RefreshControl refreshing={p.refreshing} onRefresh={p.refresh} tintColor={theme.accent} colors={[theme.accent]} />}>
			<View style={cs.header}>
				<View style={s.identity}>
					<Image source={require("../../../assets/logo.png")} style={s.logo} resizeMode="contain" accessibilityIgnoresInvertColors />
					<View style={s.identityText}>
						<Text style={[s.greeting, { color: theme.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
							{greetingFor(p.now)}
						</Text>
						<Text style={[s.date, { color: theme.muted }]} numberOfLines={1}>
							{capitalize(p.now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }))}
						</Text>
					</View>
				</View>
				<Pressable
					style={({ pressed }) => [cs.toolBtn, { backgroundColor: pressed ? theme.surfaceSoft : "transparent" }]}
					onPress={p.refresh}
					disabled={p.refreshing}
					accessibilityRole="button"
					accessibilityLabel={`${p.statusLabel}. Actualiser`}>
					{p.refreshing ? (
						<ActivityIndicator color={theme.accent} />
					) : p.showCacheBanner ? (
						<WifiOff color={theme.warn} size={20} />
					) : (
						<RefreshCw color={theme.text} size={20} />
					)}
				</Pressable>
			</View>

			<View style={cs.contextRow}>
				<Pressable
					style={cs.contextLabelBtn}
					onPress={() => p.navigation.navigate("Agenda")}
					accessibilityRole="button"
					accessibilityLabel={`Groupes suivis : ${groupsLabel}. Ouvrir l'agenda`}>
					<Users color={p.hasGroups ? theme.muted : theme.accent} size={15} />
					<Text style={[cs.contextText, { color: p.hasGroups ? theme.muted : theme.accent }]} numberOfLines={1}>
						{groupsLabel}
					</Text>
				</Pressable>
			</View>

			<SessionExpiredBanner style={s.bannerGap} />

			{p.showCacheBanner ? (
				<View style={[cs.banner, s.bannerGap, { backgroundColor: theme.surface, borderColor: theme.border }]}>
					<WifiOff color={theme.muted} size={17} />
					<Text style={[cs.bannerText, { color: theme.text }]}>Hors ligne : planning enregistré affiché. Nouvel essai automatique.</Text>
				</View>
			) : null}

			{p.eventChanges.length ? (
				<View style={[cs.banner, s.bannerGap, { backgroundColor: theme.surface, borderColor: theme.warn }]}>
					<TriangleAlert color={theme.warn} size={17} />
					<Pressable style={cs.bannerBody} onPress={() => p.navigation.navigate("Agenda", { openChangesPanel: true })} accessibilityRole="button">
						<Text style={[cs.bannerText, { color: theme.text }]} numberOfLines={2}>
							{formatEventChangeNotice(p.eventChanges)}
						</Text>
						<Text style={[cs.bannerHint, { color: theme.accent }]}>Voir les modifications</Text>
					</Pressable>
					<Pressable style={cs.bannerClose} onPress={() => p.setEventChanges([])} accessibilityRole="button" accessibilityLabel="Masquer">
						<X color={theme.muted} size={18} />
					</Pressable>
				</View>
			) : null}

			<Animated.View entering={FadeInDown.duration(380)} style={s.heroWrap}>
				{p.nextEvent ? (
					<NextCourseCard
						event={p.nextEvent}
						following={p.followingEvent}
						isLive={p.isLive}
						kicker={p.nextKicker}
						rooms={p.nextRooms}
						now={p.now}
						progress={p.progress}
						onPress={() => p.openEventInCalendar(p.nextEvent)}
						onPressFollowing={() => p.openEventInCalendar(p.followingEvent)}
					/>
				) : (
					<View style={[s.heroEmpty, { backgroundColor: theme.surface, borderColor: theme.border }]}>
						<CalendarCheck color={theme.accent} size={26} />
						<Text style={[s.heroEmptyTitle, { color: theme.text }]}>{p.hasGroups ? "Aucun cours à venir" : "Ton planning est vide"}</Text>
						<Text style={[s.heroEmptyText, { color: theme.muted }]}>
							{p.hasGroups ? "Rien de prévu dans les 30 prochains jours." : "Choisis tes groupes dans l'agenda pour voir tes prochains cours ici."}
						</Text>
						{!p.hasGroups ? (
							<Pressable style={[s.heroEmptyBtn, { backgroundColor: theme.accent }]} onPress={() => p.navigation.navigate("Agenda")} accessibilityRole="button">
								<Users color={readableTextOn(theme.accent)} size={17} />
								<Text style={[s.heroEmptyBtnText, { color: readableTextOn(theme.accent) }]}>Choisir mes groupes</Text>
							</Pressable>
						) : null}
					</View>
				)}
			</Animated.View>

			<View style={s.actionsRow}>
				<QuickAction icon={<Plus color={theme.accent} size={20} />} label="Ajouter" detail="Événement" onPress={() => p.setShowManualEvent(true)} />
				<QuickAction
					icon={<GraduationCap color={theme.accent} size={20} />}
					label="Notes"
					detail={p.aurigaAverage === "-" ? "Auriga" : `Moy. ${p.aurigaAverage}`}
					onPress={() => p.navigation.navigate("Notes")}
				/>
				<QuickAction
					icon={<CalendarDays color={theme.accent} size={20} />}
					label="Agenda"
					detail={`${p.weekCount} cette sem.`}
					onPress={() => p.navigation.navigate("Agenda")}
				/>
			</View>

			<View style={[cs.dayHeading, s.sectionHeading]}>
				<Text style={[cs.dayHeadingTitle, { color: theme.text }]}>{p.homeTab === "today" ? "Ta journée" : "Prochains cours"}</Text>
				<Text style={[cs.dayHeadingMeta, { color: theme.muted }]}>{sectionMeta}</Text>
			</View>
			<View style={[cs.segment, s.segment, { backgroundColor: theme.surfaceSoft, borderColor: theme.border }]} accessibilityRole="tablist">
				{(
					[
						["today", "Aujourd'hui"],
						["next", "À venir"],
					] as const
				).map(([tab, label]) => {
					const active = p.homeTab === tab;
					return (
						<Pressable
							key={tab}
							style={[cs.segmentItem, active && { backgroundColor: theme.accentSoft }]}
							onPress={() => p.setHomeTab(tab)}
							accessibilityRole="tab"
							accessibilityState={{ selected: active }}>
							<Text style={[cs.segmentText, { color: active ? theme.accent : theme.muted }]}>{label}</Text>
						</Pressable>
					);
				})}
			</View>

			{listEvents.length === 0 ? (
				<View style={[s.emptyPanel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
					<Text style={[s.emptyTitle, { color: theme.text }]}>{p.emptyTitle}</Text>
					<Text style={[s.emptyText, { color: theme.muted }]}>{p.emptyText}</Text>
				</View>
			) : p.homeTab === "today" ? (
				<DayTimeline events={p.todayEvents} now={nowMs} isToday renderEvent={renderEvent} />
			) : (
				upcomingDays.map(({ day, events }, index) => (
					<View key={day.toDateString()}>
						<Text style={[s.upcomingDay, index === 0 && s.upcomingDayFirst, { color: theme.muted }]}>
							{sameDay(day, p.now) ? "Aujourd'hui" : capitalize(day.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }))}
						</Text>
						<DayTimeline events={events} now={nowMs} isToday={sameDay(day, p.now)} renderEvent={renderEvent} />
					</View>
				))
			)}

			<Text style={[cs.dayHeadingTitle, s.linksHeading, { color: theme.text }]}>Liens utiles</Text>
			<View style={s.linksGrid}>
				{p.usefulLinks.map((item) => (
					<LinkTile key={item.url} item={item} />
				))}
			</View>

			<ManualEventModal
				visible={p.showManualEvent}
				title={p.manualTitle}
				date={p.manualDate}
				start={p.manualStart}
				end={p.manualEnd}
				room={p.manualRoom}
				saving={p.savingManual}
				onChangeTitle={p.setManualTitle}
				onChangeDate={p.setManualDate}
				onChangeStart={p.setManualStart}
				onChangeEnd={p.setManualEnd}
				onChangeRoom={p.setManualRoom}
				onSave={p.saveManualEvent}
				onClose={() => p.setShowManualEvent(false)}
			/>
		</ScrollView>
	);
}

// The one thing the home answers first: what's on now / next, when it ends or starts, and where.
// Painted on the course's own colour, like its card in the agenda.
function NextCourseCard({
	event,
	following,
	isLive,
	kicker,
	rooms,
	now,
	progress,
	onPress,
	onPressFollowing,
}: {
	event: ZeusEvent;
	following: ZeusEvent | null;
	isLive: boolean;
	kicker: string;
	rooms?: string;
	now: Date;
	progress: number;
	onPress: () => void;
	onPressFollowing: () => void;
}) {
	const { theme } = useTheme();
	const dark = theme.mode === "dark";
	const color = getCourseColor(event);
	const accent = dark ? color : mixHex(color, "#000000", 0.35);
	const start = new Date(event.startDate);
	const end = new Date(event.endDate);
	const title = getEventTitle(event);
	const teachers = (event.teachers?.map(getTeacherName).filter(Boolean) || []).join(", ");
	const pillText = isLive ? `En cours · encore ${formatDuration((end.getTime() - now.getTime()) / minute)}` : kicker;
	const whenLabel = isLive ? "Fin du cours" : sameDay(start, now) ? `Jusqu'à ${formatTime(end)}` : formatStartLabel(start, now).split(" à ")[0];
	const followingRooms = following?.rooms?.map(getRoomName).filter(Boolean).join(", ");
	return (
		<View
			style={[
				s.hero,
				{ backgroundColor: theme.surface, borderColor: hexToRgba(color, isLive ? 0.9 : dark ? 0.5 : 0.4), shadowColor: theme.cardShadow },
				isLive && s.heroLive,
			]}>
			<View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: hexToRgba(color, dark ? 0.15 : 0.09) }]} />
			<Pressable
				onPress={onPress}
				style={({ pressed }) => [s.heroMain, pressed && s.pressed]}
				accessibilityRole="button"
				accessibilityLabel={`${pillText}. ${title}, de ${formatTime(start)} à ${formatTime(end)}${rooms ? `, salle ${rooms}` : ""}. Ouvrir dans l'agenda`}>
				<View style={s.heroTop}>
					<View style={[s.pill, { backgroundColor: hexToRgba(color, dark ? 0.24 : 0.16) }]}>
						<Text style={[s.pillText, { color: accent }]} numberOfLines={1}>
							{pillText}
						</Text>
					</View>
					<Text style={[s.heroType, { color: accent }]} numberOfLines={1}>
						{getCourseTypeLabel(event)}
					</Text>
				</View>

				<View style={s.heroFacts}>
					<View style={s.heroFact}>
						<Text style={[s.heroBig, { color: theme.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
							{formatTime(isLive ? end : start)}
						</Text>
						<Text style={[s.heroFactLabel, { color: theme.muted }]} numberOfLines={1}>
							{whenLabel}
						</Text>
					</View>
					<View style={[s.heroDivider, { backgroundColor: hexToRgba(color, 0.35) }]} />
					<View style={s.heroFact}>
						<Text style={[s.heroRoom, { color: rooms ? theme.text : theme.muted }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.6}>
							{rooms || "À confirmer"}
						</Text>
						<View style={s.heroRoomLabel}>
							<MapPin color={accent} size={13} />
							<Text style={[s.heroFactLabel, { color: theme.muted }]}>Salle</Text>
						</View>
					</View>
				</View>

				<Text style={[s.heroTitle, { color: theme.text }]} numberOfLines={2}>
					{title}
				</Text>
				{teachers ? (
					<Text style={[s.heroMeta, { color: theme.muted }]} numberOfLines={1}>
						{teachers}
					</Text>
				) : null}

				{isLive ? (
					<View style={s.progress}>
						<View style={[s.progressTrack, { backgroundColor: hexToRgba(color, 0.22) }]}>
							<View style={[s.progressFill, { width: `${progress}%`, backgroundColor: color }]} />
						</View>
						<Text style={[s.progressText, { color: theme.muted }]}>{Math.round(progress)}%</Text>
					</View>
				) : null}
			</Pressable>

			{following ? (
				<Pressable
					onPress={onPressFollowing}
					style={({ pressed }) => [s.following, { borderTopColor: hexToRgba(color, 0.3) }, pressed && s.pressed]}
					accessibilityRole="button"
					accessibilityLabel={`Ensuite : ${getEventTitle(following)}, ${formatStartLabel(new Date(following.startDate), now)}`}>
					<Text style={[s.followingLabel, { color: accent }]}>Ensuite</Text>
					<Text style={[s.followingTime, { color: theme.text }]}>
						{sameDay(new Date(following.startDate), now) ? formatTime(new Date(following.startDate)) : formatStartLabel(new Date(following.startDate), now)}
					</Text>
					<View style={[s.followingDot, { backgroundColor: getCourseColor(following) }]} />
					<Text style={[s.followingTitle, { color: theme.text }]} numberOfLines={1}>
						{getEventTitle(following)}
						{followingRooms ? <Text style={{ color: theme.muted }}> · {followingRooms}</Text> : null}
					</Text>
					<ChevronRight color={theme.muted} size={18} />
				</Pressable>
			) : null}
		</View>
	);
}

function QuickAction({ icon, label, detail, onPress }: { icon: React.ReactNode; label: string; detail: string; onPress: () => void }) {
	const { theme } = useTheme();
	return (
		<Pressable
			style={({ pressed }) => [s.action, { backgroundColor: pressed ? theme.surfaceSoft : theme.surface, borderColor: theme.border }]}
			onPress={onPress}
			accessibilityRole="button"
			accessibilityLabel={`${label}, ${detail}`}>
			<View style={[s.actionIcon, { backgroundColor: theme.accentSoft }]}>{icon}</View>
			<Text style={[s.actionLabel, { color: theme.text }]} numberOfLines={1}>
				{label}
			</Text>
			<Text style={[s.actionDetail, { color: theme.muted }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
				{detail}
			</Text>
		</Pressable>
	);
}

function LinkTile({ item }: { item: UsefulLink }) {
	const { theme } = useTheme();
	return (
		<Pressable
			style={({ pressed }) => [s.linkTile, { backgroundColor: theme.surface, borderColor: theme.border }, pressed && s.pressed]}
			onPress={() => Linking.openURL(item.url).catch(() => {})}
			accessibilityRole="link"
			accessibilityLabel={`${item.title} : ${item.description}`}>
			<View style={[s.linkVisual, { backgroundColor: item.accent }]}>
				<Image source={item.image} style={s.linkImage} resizeMode="contain" />
			</View>
			<View style={s.linkBody}>
				<View style={s.linkTitleRow}>
					<Text style={[s.linkTitle, { color: theme.text }]} numberOfLines={1}>
						{item.title}
					</Text>
					<ArrowUpRight color={theme.muted} size={16} />
				</View>
				<Text style={[s.linkDescription, { color: theme.muted }]} numberOfLines={2}>
					{item.description}
				</Text>
			</View>
		</Pressable>
	);
}

export function ManualEventModal({
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
	const insets = useSafeAreaInsets();
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
				<View style={[s.manualHeader, { borderBottomColor: theme.border, paddingTop: Math.max(insets.top, 18) }]}>
					<Text style={[s.manualTitle, { color: theme.text }]}>Nouvel événement</Text>
					<Pressable style={[s.manualClose, { borderColor: theme.border }]} onPress={onClose}>
						<X color={theme.text} size={20} />
					</Pressable>
				</View>
				<ScrollView contentContainerStyle={[s.manualContent, { paddingBottom: insets.bottom + 32 }]}>
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

export function FormField({
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

export const s = StyleSheet.create({
	content: { paddingHorizontal: 16, paddingBottom: 40 },
	identity: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 12 },
	logo: { width: 44, height: 44 },
	identityText: { flex: 1, minWidth: 0 },
	greeting: { fontSize: 28, lineHeight: 34, fontWeight: "900" },
	date: { fontSize: 14, fontWeight: "800" },
	bannerGap: { marginTop: 0, marginBottom: 10 },
	pressed: { opacity: 0.86 },
	heroWrap: { marginTop: 2 },
	hero: {
		borderWidth: 1,
		borderRadius: 22,
		overflow: "hidden",
		shadowOpacity: 0.12,
		shadowRadius: 18,
		shadowOffset: { width: 0, height: 10 },
		elevation: 3,
	},
	heroLive: { borderWidth: 2 },
	heroMain: { padding: 16 },
	heroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
	pill: { flexShrink: 1, minHeight: 30, borderRadius: 15, paddingHorizontal: 12, justifyContent: "center" },
	pillText: { fontSize: 13, fontWeight: "900", fontVariant: ["tabular-nums"] },
	heroType: { flexShrink: 0, maxWidth: "45%", fontSize: 12, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.4 },
	heroFacts: { flexDirection: "row", alignItems: "stretch", marginTop: 18 },
	heroFact: { flex: 1, minWidth: 0, justifyContent: "flex-end" },
	heroBig: { fontSize: 48, lineHeight: 54, fontWeight: "900", letterSpacing: -1, fontVariant: ["tabular-nums"] },
	heroRoom: { fontSize: 28, lineHeight: 33, fontWeight: "900", letterSpacing: -0.4 },
	heroFactLabel: { fontSize: 13, fontWeight: "800" },
	heroRoomLabel: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
	heroDivider: { width: 1, marginHorizontal: 16 },
	heroTitle: { marginTop: 18, fontSize: 20, lineHeight: 25, fontWeight: "900" },
	heroMeta: { marginTop: 4, fontSize: 14, fontWeight: "700" },
	progress: { marginTop: 16, flexDirection: "row", alignItems: "center", gap: 10 },
	progressTrack: { flex: 1, height: 6, borderRadius: 3, overflow: "hidden" },
	progressFill: { height: "100%", borderRadius: 3 },
	progressText: { minWidth: 36, textAlign: "right", fontSize: 13, fontWeight: "900", fontVariant: ["tabular-nums"] },
	following: { minHeight: 52, borderTopWidth: 1, paddingLeft: 16, paddingRight: 12, flexDirection: "row", alignItems: "center", gap: 8 },
	followingLabel: { fontSize: 12, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.4 },
	followingTime: { fontSize: 14, fontWeight: "900", fontVariant: ["tabular-nums"] },
	followingDot: { width: 8, height: 8, borderRadius: 4 },
	followingTitle: { flex: 1, minWidth: 0, fontSize: 14, fontWeight: "800" },
	heroEmpty: { borderWidth: 1, borderRadius: 22, padding: 18, gap: 6 },
	heroEmptyTitle: { marginTop: 6, fontSize: 20, fontWeight: "900" },
	heroEmptyText: { fontSize: 14, lineHeight: 20, fontWeight: "700" },
	heroEmptyBtn: { marginTop: 10, alignSelf: "flex-start", minHeight: 44, borderRadius: 14, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 8 },
	heroEmptyBtnText: { fontSize: 15, fontWeight: "900" },
	actionsRow: { flexDirection: "row", gap: 8, marginTop: 10 },
	action: {
		flex: 1,
		minWidth: 0,
		minHeight: 92,
		borderWidth: 1,
		borderRadius: 18,
		paddingHorizontal: 6,
		paddingVertical: 10,
		alignItems: "center",
		justifyContent: "center",
		gap: 2,
	},
	actionIcon: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center", marginBottom: 4 },
	actionLabel: { fontSize: 13, fontWeight: "900" },
	actionDetail: { fontSize: 11, fontWeight: "800", fontVariant: ["tabular-nums"] },
	sectionHeading: { marginTop: 28 },
	segment: { flex: 0, marginBottom: 14 },
	upcomingDay: { marginTop: 12, marginBottom: 8, fontSize: 14, fontWeight: "900" },
	upcomingDayFirst: { marginTop: 0 },
	emptyPanel: { borderWidth: 1, borderRadius: 18, padding: 16 },
	emptyTitle: { fontSize: 17, fontWeight: "900" },
	emptyText: { marginTop: 4, lineHeight: 19, fontWeight: "700" },
	linksHeading: { marginTop: 28, marginBottom: 12 },
	linksGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
	linkTile: { flexBasis: "45%", flexGrow: 1, borderWidth: 1, borderRadius: 18, overflow: "hidden" },
	linkVisual: { height: 76, alignItems: "center", justifyContent: "center" },
	linkImage: { width: 96, height: 44 },
	linkBody: { padding: 12 },
	linkTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6 },
	linkTitle: { flex: 1, fontSize: 16, fontWeight: "900" },
	linkDescription: { marginTop: 4, fontSize: 12, lineHeight: 17, fontWeight: "700" },
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
});
