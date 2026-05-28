import React from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { CalendarDays, ExternalLink, Filter, MapPin, Trash2, Users, X } from "lucide-react-native";
import { useTheme } from "../context/ThemeContext";
import { isEventCancelled, isManualEvent } from "../services/localEvents";
import { ZeusEvent } from "../types";
import { formatDateRange, getCourseColor, getCourseTypeLabel, getEventTitle, getRoomMapUrl, getRoomName, getTeacherName, hexToRgba, openUrl } from "../utils/calendar";
import CourseNotesSection from "./CourseNotesSection";

type EventDetailsModalProps = {
	event: ZeusEvent | null;
	onClose: () => void;
	onApplyContext: (type: "single-group" | "teacher" | "room", id?: string | number, label?: string) => void;
	onDelete: (event: ZeusEvent) => void;
	onNotesChanged?: () => void;
};

export default function EventDetailsModal({ event, onClose, onApplyContext, onDelete, onNotesChanged }: EventDetailsModalProps) {
	const { theme } = useTheme();
	if (!event) return null;

	const color = getCourseColor(event);
	const typeName = getCourseTypeLabel(event);
	const manual = isManualEvent(event);
	const cancelled = isEventCancelled(event);
	const visualColor = cancelled ? theme.muted : color;

	return (
		<Modal visible animationType="slide" presentationStyle="pageSheet">
			<View style={[s.modalRoot, { backgroundColor: theme.bg }]}>
				<View style={[s.eventHero, { backgroundColor: visualColor }]}>
					<View style={s.eventHeroTop}>
						<View style={s.eventHeroBadge}>
							<Text style={[s.eventHeroBadgeText, { color: visualColor }]}>{cancelled ? "Annulé" : typeName || "Cours"}</Text>
						</View>
						<Pressable style={s.eventHeroClose} onPress={onClose}>
							<X color="#fff" size={24} />
						</Pressable>
					</View>

					<Text style={s.eventHeroTitle}>{getEventTitle(event)}</Text>

					<View style={s.eventHeroMeta}>
						<CalendarDays color="rgba(255,255,255,0.8)" size={16} />
						<Text style={s.eventHeroMetaText}>{formatDateRange(event)}</Text>
					</View>
				</View>

				<ScrollView contentContainerStyle={s.eventModalScroll}>
					{cancelled ? (
						<View style={[s.cancelledNotice, { backgroundColor: theme.surfaceSoft, borderColor: theme.muted }]}>
							<X color={theme.muted} size={18} />
							<Text style={[s.cancelledNoticeText, { color: theme.text }]}>Ce cours n'est plus présent dans le dernier retour Zeus.</Text>
						</View>
					) : null}

					<View style={[s.eventSection, { borderBottomColor: theme.border }]}>
						<CourseNotesSection event={event} onChanged={onNotesChanged} />
					</View>

					{event.code || event.url ? (
						<View style={[s.eventSection, { borderBottomColor: theme.border }]}>
							{event.code ? (
								<View style={s.eventDataRow}>
									<View style={[s.eventDataIcon, { backgroundColor: theme.surface }]}>
										<Filter color={theme.muted} size={18} />
									</View>
									<View style={s.eventDataContent}>
										<Text style={[s.eventDataLabel, { color: theme.muted }]}>Code module</Text>
										<Text style={[s.eventDataValue, { color: theme.text }]}>{event.code}</Text>
									</View>
								</View>
							) : null}

							{event.url ? (
								<Pressable style={[s.eventLinkBtn, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={() => openUrl(event.url)}>
									<ExternalLink color={visualColor} size={20} />
									<Text style={[s.eventLinkText, { color: theme.text }]}>Ouvrir le lien du cours</Text>
								</Pressable>
							) : null}
						</View>
					) : null}

					{event.rooms?.length ? (
						<View style={[s.eventSection, { borderBottomColor: theme.border }]}>
							<Text style={[s.eventSectionTitle, { color: theme.text }]}>Salles</Text>
							<View style={s.eventCardList}>
								{event.rooms.map((room) => {
									const roomId = room.id || room.room?.id;
									const roomName = getRoomName(room);
									return (
										<View key={`${roomId || roomName}`} style={[s.eventItemCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
											<MapPin color={visualColor} size={20} />
											<Text style={[s.eventItemName, { color: theme.text }]} numberOfLines={1}>
												{roomName}
											</Text>
											<Pressable style={s.eventItemAction} onPress={() => openUrl(getRoomMapUrl(roomName))}>
												<ExternalLink color={theme.muted} size={18} />
											</Pressable>
											<Pressable style={[s.eventItemBtn, { backgroundColor: theme.bg }]} onPress={() => onApplyContext("room", roomId, roomName)}>
												<Filter color={theme.text} size={14} />
												<Text style={[s.eventItemBtnText, { color: theme.text }]}>Filtrer</Text>
											</Pressable>
										</View>
									);
								})}
							</View>
						</View>
					) : null}

					{event.teachers?.length ? (
						<View style={[s.eventSection, { borderBottomColor: theme.border }]}>
							<Text style={[s.eventSectionTitle, { color: theme.text }]}>Intervenants</Text>
							<View style={s.eventChipGrid}>
								{event.teachers.map((teacher) => (
									<Pressable
										key={`${teacher.id || getTeacherName(teacher)}`}
										style={[s.eventPill, { backgroundColor: theme.surface, borderColor: theme.border }]}
										onPress={() => onApplyContext("teacher", teacher.id, getTeacherName(teacher))}>
										<View style={[s.eventPillIcon, { backgroundColor: cancelled ? theme.bg : hexToRgba(color, 0.15) }]}>
											<Users color={visualColor} size={14} />
										</View>
										<Text style={[s.eventPillText, { color: theme.text }]}>{getTeacherName(teacher)}</Text>
									</Pressable>
								))}
							</View>
						</View>
					) : null}

					{event.groups?.length ? (
						<View style={[s.eventSection, { borderBottomColor: theme.border }]}>
							<Text style={[s.eventSectionTitle, { color: theme.text }]}>Groupes</Text>
							<View style={s.eventChipGrid}>
								{event.groups.map((group) => (
									<Pressable
										key={`${group.id || group.name}`}
										style={[s.eventPill, { backgroundColor: theme.surface, borderColor: theme.border }]}
										onPress={() => onApplyContext("single-group", group.id, group.name)}>
										<View style={[s.eventPillIcon, { backgroundColor: cancelled ? theme.bg : hexToRgba(color, 0.15) }]}>
											<Users color={visualColor} size={14} />
										</View>
										<Text style={[s.eventPillText, { color: theme.text }]}>{group.name || String(group.id)}</Text>
									</Pressable>
								))}
							</View>
						</View>
					) : null}

					<View style={s.eventDeleteSection}>
						<Pressable style={[s.eventDeleteBtn, { backgroundColor: theme.danger }]} onPress={() => onDelete(event)}>
							<Trash2 color="#fff" size={19} />
							<Text style={s.eventDeleteText}>{manual ? "Supprimer définitivement" : "Supprimer de mon agenda"}</Text>
						</Pressable>
					</View>
				</ScrollView>
			</View>
		</Modal>
	);
}

const s = StyleSheet.create({
	modalRoot: { flex: 1 },
	eventHero: { paddingTop: 60, paddingBottom: 24, paddingHorizontal: 20 },
	eventHeroTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 },
	eventHeroBadge: { backgroundColor: "rgba(255,255,255,0.9)", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
	eventHeroBadgeText: { fontSize: 13, fontWeight: "900", textTransform: "uppercase" },
	eventHeroClose: { width: 36, height: 36, backgroundColor: "rgba(0,0,0,0.15)", borderRadius: 18, alignItems: "center", justifyContent: "center" },
	eventHeroTitle: { color: "#fff", fontSize: 26, fontWeight: "900", lineHeight: 32 },
	eventHeroMeta: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
	eventHeroMetaText: { color: "rgba(255,255,255,0.9)", fontSize: 15, fontWeight: "800" },
	eventModalScroll: { padding: 20, paddingBottom: 60 },
	cancelledNotice: { borderWidth: 1, borderStyle: "dashed", borderRadius: 14, padding: 12, flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
	cancelledNoticeText: { flex: 1, fontSize: 13, fontWeight: "800", lineHeight: 18 },
	eventSection: { paddingVertical: 16, borderBottomWidth: 1 },
	eventSectionTitle: { fontSize: 18, fontWeight: "900", marginBottom: 16 },
	eventDataRow: { flexDirection: "row", alignItems: "center", gap: 12 },
	eventDataIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
	eventDataContent: { flex: 1 },
	eventDataLabel: { fontSize: 12, fontWeight: "800", textTransform: "uppercase" },
	eventDataValue: { fontSize: 16, fontWeight: "900", marginTop: 2 },
	eventLinkBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 14, borderRadius: 12, borderWidth: 1, marginTop: 16 },
	eventLinkText: { fontSize: 15, fontWeight: "900" },
	eventCardList: { gap: 12 },
	eventItemCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 16, borderWidth: 1 },
	eventItemName: { flex: 1, fontSize: 16, fontWeight: "800" },
	eventItemAction: { padding: 8 },
	eventItemBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
	eventItemBtnText: { fontSize: 13, fontWeight: "800" },
	eventChipGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
	eventPill: { flexDirection: "row", alignItems: "center", gap: 8, padding: 6, paddingRight: 14, borderRadius: 20, borderWidth: 1 },
	eventPillIcon: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
	eventPillText: { fontSize: 14, fontWeight: "800" },
	eventDeleteSection: { paddingTop: 18 },
	eventDeleteBtn: { minHeight: 50, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 },
	eventDeleteText: { color: "#fff", fontSize: 15, fontWeight: "900" },
});
