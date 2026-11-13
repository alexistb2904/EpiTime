import React from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Bell, Clock, Coffee, MapPin, Paperclip, StickyNote, Trash2, User, Users, Video, X } from "lucide-react-native";
import Card from "../Card";
import { useTheme } from "../../context/ThemeContext";
import { CourseNoteSummary } from "../../services/courseNotes";
import { EventChange } from "../../services/eventsCache";
import { isEventCancelled, isEventIgnored } from "../../services/localEvents";
import { EventChangeHistoryItem } from "../../services/notifications";
import { ZeusEvent } from "../../types";
import { getCourseColor, getCourseTypeLabel, getEventTitle, getRoomName, getTeacherName, hexToRgba } from "../../utils/calendar";
import { getDisplayedGroupNames } from "../../utils/groups";
import { mixHex } from "../../theme/palettes";
import { buildTimeline, elapsedShare, formatDuration } from "../../utils/timeline";
import { getCourseProgress, minute } from "./calendarModel";
import { s } from "./calendarStyles";

export function formatEventChangeNotice(changes: EventChange[]) {
	const first = changes[0];
	const start = new Date(first.startDate);
	const time = Number.isNaN(start.getTime()) ? "" : ` à ${start.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
	const suffix = changes.length > 1 ? ` (+${changes.length - 1})` : "";
	const detail = first.details?.[0] ? ` · ${first.details[0].label}: ${first.details[0].before || "Non défini"} -> ${first.details[0].after || "Non défini"}` : "";
	return `Cours modifié${suffix} : ${first.title}${time}${detail}`;
}

export function ChangeHistoryModal({ visible, changes, onClose, onClear }: { visible: boolean; changes: EventChangeHistoryItem[]; onClose: () => void; onClear: () => void }) {
	const { theme } = useTheme();
	const insets = useSafeAreaInsets();
	return (
		<Modal visible={visible} animationType="slide" onRequestClose={onClose}>
			<View style={[s.modalRoot, { backgroundColor: theme.bg }]}>
				<View style={[s.modalHeader, { borderBottomColor: theme.border, paddingTop: Math.max(insets.top, 18) }]}>
					<View style={s.changeModalTitleWrap}>
						<Text style={[s.modalTitle, { color: theme.text }]}>Modifications</Text>
						<Text style={[s.changeModalSubtitle, { color: theme.muted }]}>
							{changes.length ? `${changes.length} changement(s) conservé(s)` : "Aucune modification enregistrée"}
						</Text>
					</View>
					<Pressable style={[s.iconBtn, { borderColor: theme.border }]} onPress={onClose}>
						<X color={theme.text} size={20} />
					</Pressable>
				</View>

				<ScrollView contentContainerStyle={s.changeHistoryList}>
					{changes.length ? (
						changes.map((change) => <ChangeHistoryCard key={change.key} change={change} />)
					) : (
						<Card style={s.emptyCard}>
							<Bell color={theme.accent} size={26} />
							<Text style={[s.emptyTitle, { color: theme.text }]}>Rien à afficher</Text>
							<Text style={[s.meta, { color: theme.muted }]}>Les prochains changements détectés resteront ici jusqu'à effacement.</Text>
						</Card>
					)}
				</ScrollView>

				{changes.length ? (
					<View style={[s.changeModalFooter, { borderTopColor: theme.border, backgroundColor: theme.bg, paddingBottom: Math.max(insets.bottom, 18) }]}>
						<Pressable style={[s.clearChangesBtn, { backgroundColor: theme.warn }]} onPress={onClear}>
							<Trash2 color="#fff" size={18} />
							<Text style={s.clearChangesText}>Effacer les modifications</Text>
						</Pressable>
					</View>
				) : null}
			</View>
		</Modal>
	);
}

function ChangeHistoryCard({ change }: { change: EventChangeHistoryItem }) {
	const { theme } = useTheme();
	const start = new Date(change.startDate);
	const detectedAt = new Date(change.notifiedAt);
	const dateLabel = Number.isNaN(start.getTime()) ? "Date inconnue" : start.toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit" });
	const detectedLabel = Number.isNaN(detectedAt.getTime())
		? ""
		: `Détecté ${detectedAt.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })} à ${detectedAt.toLocaleTimeString("fr-FR", {
				hour: "2-digit",
				minute: "2-digit",
			})}`;
	return (
		<Card style={s.changeCard} variant="flat">
			<View style={s.changeCardHeader}>
				<View style={[s.changeKindIcon, { backgroundColor: theme.accentSoft }]}>
					<Clock color={theme.accent} size={17} />
				</View>
				<View style={s.changeCardTitleWrap}>
					<Text style={[s.changeCardTitle, { color: theme.text }]} numberOfLines={2}>
						{change.title}
					</Text>
					<Text style={[s.changeCardMeta, { color: theme.muted }]}>
						{dateLabel}
						{detectedLabel ? ` · ${detectedLabel}` : ""}
					</Text>
				</View>
			</View>
			<View style={s.changeDetails}>
				{(change.details || []).map((detail, index) => (
					<View key={`${change.key}-${detail.field}-${index}`} style={[s.changeDetailRow, { backgroundColor: theme.surfaceSoft }]}>
						<Text style={[s.changeDetailLabel, { color: theme.muted }]}>{detail.label}</Text>
						<View style={s.changeValues}>
							<Text style={[s.changeValue, { color: theme.text }]} numberOfLines={2}>
								{detail.before || "Non défini"}
							</Text>
							<Text style={[s.changeArrow, { color: theme.warn }]}>{"->"}</Text>
							<Text style={[s.changeValue, { color: theme.text }]} numberOfLines={2}>
								{detail.after || "Non défini"}
							</Text>
						</View>
					</View>
				))}
			</View>
		</Card>
	);
}

const formatTime = (date: Date) => date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

export function Rail({ fill, head, first, last }: { fill: number; head?: "fill" | "center"; first?: boolean; last?: boolean }) {
	const { theme } = useTheme();
	const percent = Math.round(fill * 100);
	const caps = [first && s.railCapTop, last && s.railCapBottom];
	const showHead = head === "center" || (fill > 0 && fill < 1);
	return (
		<View style={s.rail}>
			<View style={[s.railTrack, ...caps, { backgroundColor: theme.border }]} />
			{fill > 0 ? (
				<View style={[s.railFill, first && s.railCapTop, fill === 1 && last && s.railCapBottom, { height: `${percent}%`, backgroundColor: theme.accent }]} />
			) : null}
			{showHead ? (
				<View pointerEvents="none" style={[s.railHead, { top: head === "center" ? "50%" : `${percent}%`, backgroundColor: theme.accent, borderColor: theme.bg }]} />
			) : null}
		</View>
	);
}

const isActiveEvent = (event: ZeusEvent) => !isEventCancelled(event) && !isEventIgnored(event);

export function DayTimeline({
	events,
	now,
	isToday,
	renderEvent,
}: {
	events: ZeusEvent[];
	now: number;
	isToday: boolean;
	renderEvent: (event: ZeusEvent, railFirst: boolean, railLast: boolean) => React.ReactNode;
}) {
	const { theme } = useTheme();
	return (
		<>
			{buildTimeline<ZeusEvent>(events, now, isToday, isActiveEvent).map((item, index, items) =>
				item.kind === "event" ? (
					renderEvent(item.event, index === 0, index === items.length - 1)
				) : item.kind === "break" ? (
					<View key={item.key} style={s.breakRow}>
						<View style={s.breakSpacer} />
						<Rail fill={elapsedShare(item.start, item.end, now)} />
						<View style={s.breakContent}>
							<View style={[s.breakLine, { borderColor: theme.border }]} />
							<Coffee color={theme.muted} size={14} />
							<Text style={[s.breakText, { color: theme.muted }]}>Pause · {formatDuration(item.minutes)}</Text>
							<View style={[s.breakLine, { borderColor: theme.border }]} />
						</View>
					</View>
				) : (
					<View key="now" style={s.nowRow} accessibilityLabel={`Il est ${formatTime(new Date(now))}`}>
						<Text style={[s.nowTime, { color: theme.accent }]}>{formatTime(new Date(now))}</Text>
						<Rail fill={0.5} head="center" first={index === 0} last={index === items.length - 1} />
						<View style={[s.nowLine, { backgroundColor: theme.accent }]} />
					</View>
				)
			)}
		</>
	);
}

function InfoLine({ icon, value, strong, color }: { icon: React.ReactNode; value: string; strong?: boolean; color: string }) {
	return (
		<View style={s.infoLine}>
			<View style={s.infoLineIcon}>{icon}</View>
			<Text style={[strong ? s.infoLineStrong : s.infoLineText, { color }]}>{value}</Text>
		</View>
	);
}

export function EventCard({
	event,
	highlighted,
	noteSummary,
	now,
	selectedGroups,
	availableGroups,
	railFirst,
	railLast,
	onPress,
}: {
	event: ZeusEvent;
	railFirst?: boolean;
	railLast?: boolean;
	highlighted?: boolean;
	noteSummary?: CourseNoteSummary;
	now: number;
	selectedGroups?: Array<string | number>;
	availableGroups?: Array<{ id: string | number; name: string }>;
	onPress: () => void;
}) {
	const { theme } = useTheme();
	const activeGroupNames = (selectedGroups?.length || 0) > 1 ? getDisplayedGroupNames(event.groups, selectedGroups || [], availableGroups) : [];
	const rooms = (event.rooms?.map(getRoomName).filter(Boolean) || []).join(", ");
	const teachers = (event.teachers?.map(getTeacherName).filter(Boolean) || []).join(", ");
	const color = getCourseColor(event);
	const start = new Date(event.startDate);
	const end = new Date(event.endDate);
	const startMillis = start.getTime();
	const endMillis = end.getTime();
	const cancelled = isEventCancelled(event);
	const ignored = isEventIgnored(event);
	const inactive = cancelled || ignored;
	const isNow = !inactive && startMillis <= now && endMillis > now;
	const isPast = !inactive && endMillis <= now;
	const progress = getCourseProgress(startMillis, endMillis, now);
	const dark = theme.mode === "dark";
	const title = getEventTitle(event);
	const accent = inactive ? theme.muted : dark ? color : mixHex(color, "#000000", 0.35);
	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="button"
			accessibilityLabel={`${title}, de ${formatTime(start)} à ${formatTime(end)}${rooms ? `, salle ${rooms}` : ""}`}
			style={({ pressed }) => [s.eventRow, pressed && s.eventRowPressed]}>
			<View style={[s.eventTimeCol, (isPast || ignored) && s.eventPast]}>
				<Text style={[s.eventStart, { color: inactive ? theme.muted : theme.text }]}>{formatTime(start)}</Text>
				<Text style={[s.eventEnd, { color: theme.muted }]}>{formatTime(end)}</Text>
			</View>
			<Rail fill={elapsedShare(startMillis, endMillis, now)} first={railFirst} last={railLast} />
			<View
				style={[
					s.eventBlock,
					(isPast || ignored) && s.eventPast,
					inactive
						? { backgroundColor: theme.surfaceSoft, borderColor: theme.border, borderStyle: "dashed" }
						: { backgroundColor: hexToRgba(color, dark ? 0.15 : 0.09), borderColor: hexToRgba(color, isNow ? 0.9 : dark ? 0.4 : 0.3) },
					(highlighted || isNow) && s.eventBlockStrong,
					highlighted && { borderColor: theme.accent },
				]}>
				<View style={s.eventTop}>
					<Text style={[s.eventType, { color: accent }]} numberOfLines={1}>
						{cancelled ? "Annulé" : ignored ? "Ignoré" : getCourseTypeLabel(event)}
					</Text>
					<Text style={[s.eventDuration, { color: theme.muted }]}>· {formatDuration((endMillis - startMillis) / minute)}</Text>
					<View style={s.eventIndicators}>
						{event.isOnline ? <Video color={theme.muted} size={15} /> : null}
						{noteSummary?.count ? (
							<View style={s.eventIndicator}>
								<StickyNote color={theme.muted} size={15} />
								<Text style={[s.eventIndicatorText, { color: theme.muted }]}>{noteSummary.count}</Text>
							</View>
						) : null}
						{noteSummary?.hasAttachments ? <Paperclip color={theme.muted} size={15} /> : null}
						{noteSummary?.hasReminder ? <Bell color={theme.muted} size={15} /> : null}
					</View>
				</View>
				<Text style={[s.eventTitle, cancelled && s.eventTitleCancelled, { color: inactive ? theme.muted : theme.text }]}>{title}</Text>
				{rooms || teachers || activeGroupNames.length ? (
					<View style={s.eventInfo}>
						{rooms ? <InfoLine icon={<MapPin color={accent} size={15} />} value={rooms} strong color={inactive ? theme.muted : theme.text} /> : null}
						{teachers ? <InfoLine icon={<User color={accent} size={15} />} value={teachers} color={theme.muted} /> : null}
						{activeGroupNames.length ? <InfoLine icon={<Users color={accent} size={15} />} value={activeGroupNames.join(", ")} color={theme.muted} /> : null}
					</View>
				) : null}
				{isNow ? (
					<View style={s.eventNow}>
						<View style={s.eventNowHeader}>
							<Text style={[s.eventNowText, { color: theme.text }]}>En cours · encore {formatDuration((endMillis - now) / minute)}</Text>
							<Text style={[s.eventNowText, { color: theme.muted }]}>{progress}%</Text>
						</View>
						<View style={[s.eventNowTrack, { backgroundColor: hexToRgba(color, 0.22) }]}>
							<View style={[s.eventNowFill, { width: `${progress}%`, backgroundColor: color }]} />
						</View>
					</View>
				) : null}
			</View>
		</Pressable>
	);
}
