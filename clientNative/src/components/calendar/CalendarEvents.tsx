import React from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import Animated, { FadeInDown, Layout } from "react-native-reanimated";
import { Bell, Clock, Filter, MapPin, Paperclip, StickyNote, Trash2, Users, X } from "lucide-react-native";
import Card from "../Card";
import { useTheme } from "../../context/ThemeContext";
import { CourseNoteSummary } from "../../services/courseNotes";
import { EventChange } from "../../services/eventsCache";
import { isEventCancelled, isEventIgnored } from "../../services/localEvents";
import { EventChangeHistoryItem } from "../../services/notifications";
import { ZeusEvent } from "../../types";
import {
	formatDateRange,
	getCourseColor,
	getCourseTypeLabel,
	getEventTitle,
	getRoomName,
	getTeacherName,
	hexToRgba,
} from "../../utils/calendar";
import { s } from "./calendarStyles";

const getCourseProgress = (startMillis: number, endMillis: number, now: number) => {
	const duration = endMillis - startMillis;
	if (!Number.isFinite(duration) || duration <= 0) return 0;
	const progress = ((now - startMillis) / duration) * 100;
	return Math.max(0, Math.min(100, Math.round(progress)));
};
export function formatEventChangeNotice(changes: EventChange[]) {
	const first = changes[0];
	const start = new Date(first.startDate);
	const time = Number.isNaN(start.getTime()) ? "" : ` à ${start.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
	const suffix = changes.length > 1 ? ` (+${changes.length - 1})` : "";
	const detail = first.details?.[0] ? ` · ${first.details[0].label}: ${first.details[0].before || "Non défini"} -> ${first.details[0].after || "Non défini"}` : "";
	return `Cours modifié${suffix} : ${first.title}${time}${detail}`;
}

export function ChangeHistoryModal({
	visible,
	changes,
	onClose,
	onClear,
}: {
	visible: boolean;
	changes: EventChangeHistoryItem[];
	onClose: () => void;
	onClear: () => void;
}) {
	const { theme } = useTheme();
	return (
		<Modal visible={visible} animationType="slide" onRequestClose={onClose}>
			<View style={[s.modalRoot, { backgroundColor: theme.bg }]}>
				<View style={[s.modalHeader, { borderBottomColor: theme.border }]}>
					<View style={s.changeModalTitleWrap}>
						<Text style={[s.modalTitle, { color: theme.text }]}>Modifications</Text>
						<Text style={[s.changeModalSubtitle, { color: theme.muted }]}>{changes.length ? `${changes.length} changement(s) conservé(s)` : "Aucune modification enregistrée"}</Text>
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
					<View style={[s.changeModalFooter, { borderTopColor: theme.border, backgroundColor: theme.bg }]}>
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
	const dateLabel = Number.isNaN(start.getTime())
		? "Date inconnue"
		: start.toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit" });
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
					<Text style={[s.changeCardMeta, { color: theme.muted }]}>{dateLabel}{detectedLabel ? ` · ${detectedLabel}` : ""}</Text>
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

export function EventCard({
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
