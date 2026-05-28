import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { Bell, Camera, Check, Clock3, FileText, Image, Link as LinkIcon, Paperclip, Plus, Trash2, X } from "lucide-react-native";
import ImagePreviewModal from "./ImagePreviewModal";
import ReminderSelectorModal from "./ReminderSelectorModal";
import { useTheme } from "../context/ThemeContext";
import {
	copyCourseNoteAttachment,
	CourseNote,
	CourseNoteAttachment,
	deleteCourseNote,
	deleteCourseNoteAttachment,
	getCourseNotes,
	openCourseNoteAttachment,
	upsertNote,
} from "../services/courseNotes";
import { getLocalEventKey } from "../services/localEvents";
import { ZeusEvent } from "../types";
import { openUrl } from "../utils/calendar";

type CourseNotesSectionProps = {
	event: ZeusEvent;
	onChanged?: () => void;
};

const urlPattern = /https?:\/\/[^\s]+/gi;

export default function CourseNotesSection({ event, onChanged }: CourseNotesSectionProps) {
	const { theme } = useTheme();
	const eventKey = getLocalEventKey(event);
	const [notes, setNotes] = useState<CourseNote[]>([]);
	const [linkDrafts, setLinkDrafts] = useState<Record<string, string>>({});
	const [noteDirtyMap, setNoteDirtyMap] = useState<Record<string, boolean>>({});
	const [previewAttachment, setPreviewAttachment] = useState<CourseNoteAttachment | null>(null);
	const [reminderEditor, setReminderEditor] = useState<CourseNote | null>(null);
	const [loading, setLoading] = useState(false);
	const [savingId, setSavingId] = useState<string | null>(null);

	const loadNotes = useCallback(async () => {
		setLoading(true);
		try {
			const next = await getCourseNotes(eventKey);
			setNotes(next);
			setNoteDirtyMap(Object.fromEntries(next.map((note) => [note.id, false])));
		} finally {
			setLoading(false);
		}
	}, [eventKey]);

	useEffect(() => {
		void loadNotes();
	}, [loadNotes]);

	const createDraft = () => {
		const now = new Date().toISOString();
		const draftId = `draft-${Date.now()}`;
		setNotes((items) => [
			...items,
			{
				id: draftId,
				eventKey,
				body: "",
				links: [],
				attachments: [],
				createdAt: now,
				updatedAt: now,
			},
		]);
		setNoteDirtyMap((items) => ({ ...items, [draftId]: true }));
	};

	const updateNote = (noteId: string, patch: Partial<CourseNote>) => {
		setNotes((items) => items.map((note) => (note.id === noteId ? { ...note, ...patch } : note)));
		setNoteDirtyMap((items) => ({ ...items, [noteId]: true }));
	};

	const saveNote = async (note: CourseNote) => {
		if (!note.body.trim() && !note.links.length && !note.attachments.length && !note.reminder?.enabled) return;
		setSavingId(note.id);
		try {
			const saved = await upsertNote(event, note);
			setNotes((items) => items.map((item) => (item.id === note.id ? saved : item)));
			setNoteDirtyMap((items) => {
				const next = { ...items };
				delete next[note.id];
				delete next[saved.id];
				return next;
			});
			onChanged?.();
		} catch (err: any) {
			Alert.alert("Note", err?.message || "Impossible d'enregistrer la note.");
		} finally {
			setSavingId(null);
		}
	};

	const removeNote = (note: CourseNote) => {
		Alert.alert("Supprimer la note", "Supprimer cette note et ses pièces jointes ?", [
			{ text: "Annuler", style: "cancel" },
			{
				text: "Supprimer",
				style: "destructive",
				onPress: async () => {
					if (!note.id.startsWith("draft-")) await deleteCourseNote(eventKey, note.id);
					setNotes((items) => items.filter((item) => item.id !== note.id));
					setNoteDirtyMap((items) => {
						const next = { ...items };
						delete next[note.id];
						return next;
					});
					onChanged?.();
				},
			},
		]);
	};

	const addLink = async (note: CourseNote) => {
		const value = linkDrafts[note.id]?.trim();
		if (!value) return;
		const url = value.startsWith("http://") || value.startsWith("https://") ? value : `https://${value}`;
		const next = { ...note, links: Array.from(new Set([...note.links, url])) };
		updateNote(note.id, next);
		setLinkDrafts((drafts) => ({ ...drafts, [note.id]: "" }));
		await saveNote(next);
	};

	const removeLink = async (note: CourseNote, link: string) => {
		const next = { ...note, links: note.links.filter((item) => item !== link) };
		updateNote(note.id, next);
		await saveNote(next);
	};

	const attachDocument = async (note: CourseNote) => {
		const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false, type: "*/*" });
		if (result.canceled || !result.assets?.[0]) return;
		const asset = result.assets[0];
		await attachUri(note, {
			sourceUri: asset.uri,
			name: asset.name,
			kind: "file",
			mimeType: asset.mimeType,
			size: asset.size,
		});
	};

	const attachGalleryPhoto = async (note: CourseNote) => {
		const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.86 });
		if (result.canceled || !result.assets?.[0]) return;
		const asset = result.assets[0];
		await attachUri(note, {
			sourceUri: asset.uri,
			name: asset.fileName || "photo.jpg",
			kind: "photo",
			mimeType: asset.mimeType,
			size: asset.fileSize,
		});
	};

	const attachCameraPhoto = async (note: CourseNote) => {
		const permission = await ImagePicker.requestCameraPermissionsAsync();
		if (!permission.granted) {
			Alert.alert("Appareil photo", "Permission caméra refusée.");
			return;
		}
		const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.86 });
		if (result.canceled || !result.assets?.[0]) return;
		const asset = result.assets[0];
		await attachUri(note, {
			sourceUri: asset.uri,
			name: asset.fileName || `photo-${Date.now()}.jpg`,
			kind: "photo",
			mimeType: asset.mimeType,
			size: asset.fileSize,
		});
	};

	const attachUri = async (note: CourseNote, input: { sourceUri: string; name?: string | null; kind: "file" | "photo"; mimeType?: string | null; size?: number | null }) => {
		setSavingId(note.id);
		try {
			const savedNote = note.id.startsWith("draft-") ? await upsertNote(event, note) : note;
			const attachment = await copyCourseNoteAttachment({ eventKey, noteId: savedNote.id, ...input });
			const next = { ...savedNote, attachments: [...savedNote.attachments, attachment] };
			const updated = await upsertNote(event, next);
			setNotes((items) => items.map((item) => (item.id === note.id || item.id === savedNote.id ? updated : item)));
			onChanged?.();
		} catch (err: any) {
			Alert.alert("Pièce jointe", err?.message || "Impossible d'ajouter la pièce jointe.");
		} finally {
			setSavingId(null);
		}
	};

	const removeAttachment = async (note: CourseNote, attachmentId: string) => {
		await deleteCourseNoteAttachment(event, note.id, attachmentId);
		const next = { ...note, attachments: note.attachments.filter((item) => item.id !== attachmentId) };
		if (!hasNoteContent(next)) {
			setNotes((items) => items.filter((item) => item.id !== note.id));
			setNoteDirtyMap((items) => {
				const copy = { ...items };
				delete copy[note.id];
				return copy;
			});
			onChanged?.();
			return;
		}
		await saveNote(next);
	};

	const updateReminder = async (note: CourseNote, patch: Partial<NonNullable<CourseNote["reminder"]>>) => {
		const next = {
			...note,
			reminder: {
				enabled: note.reminder?.enabled ?? false,
				offsetMinutes: note.reminder?.offsetMinutes ?? 15,
				...patch,
			},
		};
		updateNote(note.id, next);
		await saveNote(next);
	};

	if (loading) {
		return (
			<View style={[s.loadingRow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
				<ActivityIndicator color={theme.accent} />
				<Text style={[s.meta, { color: theme.muted }]}>Chargement des notes</Text>
			</View>
		);
	}

	return (
		<View style={s.root}>
			<View style={s.header}>
				<View>
					<Text style={[s.title, { color: theme.text }]}>Notes</Text>
					<Text style={[s.meta, { color: theme.muted }]}>{notes.length ? `${notes.length} note${notes.length > 1 ? "s" : ""}` : "Aucune note pour ce cours"}</Text>
				</View>
				<Pressable style={[s.addBtn, { backgroundColor: theme.accent }]} onPress={createDraft}>
					<Plus color="#fff" size={18} />
					<Text style={s.addText}>Ajouter</Text>
				</Pressable>
			</View>

			{notes.map((note, index) => (
				<NoteEditor
					key={note.id}
					note={note}
					index={index}
					saving={savingId === note.id}
					dirty={Boolean(noteDirtyMap[note.id])}
					linkDraft={linkDrafts[note.id] || ""}
					onChangeLinkDraft={(value) => setLinkDrafts((drafts) => ({ ...drafts, [note.id]: value }))}
					onUpdate={updateNote}
					onSave={saveNote}
					onDelete={removeNote}
					onAddLink={addLink}
					onRemoveLink={removeLink}
					onAttachDocument={attachDocument}
					onAttachGalleryPhoto={attachGalleryPhoto}
					onAttachCameraPhoto={attachCameraPhoto}
					onRemoveAttachment={removeAttachment}
					onOpenReminder={() => setReminderEditor(note)}
					onPreviewAttachment={(attachment) => setPreviewAttachment(attachment)}
					onUpdateReminder={updateReminder}
				/>
			))}

			<ReminderSelectorModal
				visible={Boolean(reminderEditor)}
				eventStartDate={event.startDate}
				currentOffsetMinutes={reminderEditor?.reminder?.offsetMinutes ?? 15}
				onClose={() => setReminderEditor(null)}
				onApply={async (next) => {
					if (!reminderEditor) return;
					await updateReminder(reminderEditor, next);
				}}
			/>

			<ImagePreviewModal
				visible={Boolean(previewAttachment)}
				attachment={previewAttachment}
				onClose={() => setPreviewAttachment(null)}
				onOpenInGallery={async () => {
					if (!previewAttachment) return;
					await openCourseNoteAttachment(previewAttachment).catch(() => Alert.alert("Pièce jointe", "Impossible d'ouvrir ce fichier."));
				}}
			/>
		</View>
	);
}

function NoteEditor({
	note,
	index,
	saving,
	dirty,
	linkDraft,
	onChangeLinkDraft,
	onUpdate,
	onSave,
	onDelete,
	onAddLink,
	onRemoveLink,
	onAttachDocument,
	onAttachGalleryPhoto,
	onAttachCameraPhoto,
	onRemoveAttachment,
	onOpenReminder,
	onPreviewAttachment,
	onUpdateReminder,
}: {
	note: CourseNote;
	index: number;
	saving: boolean;
	dirty: boolean;
	linkDraft: string;
	onChangeLinkDraft: (value: string) => void;
	onUpdate: (noteId: string, patch: Partial<CourseNote>) => void;
	onSave: (note: CourseNote) => void | Promise<void>;
	onDelete: (note: CourseNote) => void;
	onAddLink: (note: CourseNote) => void | Promise<void>;
	onRemoveLink: (note: CourseNote, link: string) => void | Promise<void>;
	onAttachDocument: (note: CourseNote) => void | Promise<void>;
	onAttachGalleryPhoto: (note: CourseNote) => void | Promise<void>;
	onAttachCameraPhoto: (note: CourseNote) => void | Promise<void>;
	onRemoveAttachment: (note: CourseNote, attachmentId: string) => void | Promise<void>;
	onOpenReminder: () => void;
	onPreviewAttachment: (attachment: CourseNoteAttachment) => void;
	onUpdateReminder: (note: CourseNote, patch: Partial<NonNullable<CourseNote["reminder"]>>) => void | Promise<void>;
}) {
	const { theme } = useTheme();
	const detectedLinks = useMemo(() => note.body.match(urlPattern) || [], [note.body]);
	const allLinks = Array.from(new Set([...note.links, ...detectedLinks]));
	const reminderOffset = note.reminder?.offsetMinutes ?? 15;
	const reminderEnabled = Boolean(note.reminder?.enabled);
	const hasImageAttachment = note.attachments.some((attachment) => isImageAttachment(attachment));

	return (
		<View style={[s.noteCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
			<View style={s.noteTop}>
				<View style={s.noteTitleWrap}>
					<Text style={[s.noteTitle, { color: theme.text }]}>Note {index + 1}</Text>
					<NoteStatusBadge dirty={dirty} saving={saving} />
				</View>
				<View style={s.noteActions}>
					{saving ? <ActivityIndicator color={theme.accent} size="small" /> : null}
					<Pressable style={[s.iconBtn, { backgroundColor: theme.surfaceSoft }]} onPress={() => void onSave(note)}>
						<Check color={theme.accent} size={17} />
					</Pressable>
					<Pressable style={[s.iconBtn, { backgroundColor: theme.surfaceSoft }]} onPress={() => onDelete(note)}>
						<Trash2 color={theme.danger} size={17} />
					</Pressable>
				</View>
			</View>

			<TextInput
				value={note.body}
				onChangeText={(body) => onUpdate(note.id, { body })}
				onBlur={() => void onSave(note)}
				placeholder="Écrire une note, une consigne, un rappel de rendu..."
				placeholderTextColor={theme.muted}
				multiline
				style={[s.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surfaceSoft }]}
				textAlignVertical="top"
			/>

			<View style={s.reminderRow}>
				<Pressable
					style={[s.reminderToggle, { backgroundColor: reminderEnabled ? theme.accent : theme.surfaceSoft, borderColor: theme.border }]}
					onPress={() => void onUpdateReminder(note, { enabled: !reminderEnabled, offsetMinutes: reminderOffset })}>
					<Bell color={reminderEnabled ? "#fff" : theme.muted} size={16} />
					<Text style={[s.reminderToggleText, { color: reminderEnabled ? "#fff" : theme.text }]}>Rappel</Text>
				</Pressable>
				<Pressable style={[s.reminderPickerBtn, { backgroundColor: theme.surfaceSoft, borderColor: theme.border }]} onPress={onOpenReminder}>
					<Clock3 color={theme.accent} size={16} />
					<Text style={[s.reminderPickerText, { color: theme.text }]}>{formatReminderOffset(reminderOffset)}</Text>
				</Pressable>
			</View>

			<View style={s.attachActions}>
				<ActionButton icon={<Paperclip color={theme.accent} size={15} />} label="Fichier" onPress={() => void onAttachDocument(note)} />
				<ActionButton icon={<Image color={theme.accent} size={15} />} label="Photo" onPress={() => void onAttachGalleryPhoto(note)} />
				<ActionButton icon={<Camera color={theme.accent} size={15} />} label="Caméra" onPress={() => void onAttachCameraPhoto(note)} />
			</View>

			<View style={[s.linkBox, { borderColor: theme.border, backgroundColor: theme.surfaceSoft }]}>
				<LinkIcon color={theme.muted} size={16} />
				<TextInput
					value={linkDraft}
					onChangeText={onChangeLinkDraft}
					placeholder="Ajouter un lien"
					placeholderTextColor={theme.muted}
					autoCapitalize="none"
					keyboardType="url"
					style={[s.linkInput, { color: theme.text }]}
				/>
				<Pressable onPress={() => void onAddLink(note)} style={[s.linkAdd, { backgroundColor: theme.accent }]}>
					<Plus color="#fff" size={15} />
				</Pressable>
			</View>

			{allLinks.length ? (
				<View style={s.chipWrap}>
					{allLinks.map((link) => (
						<Pressable key={link} style={[s.linkChip, { backgroundColor: theme.surfaceSoft }]} onPress={() => openUrl(link)}>
							<LinkIcon color={theme.accent} size={13} />
							<Text style={[s.linkChipText, { color: theme.text }]} numberOfLines={1}>
								{link.replace(/^https?:\/\//, "")}
							</Text>
							{note.links.includes(link) ? (
								<Pressable onPress={() => void onRemoveLink(note, link)}>
									<X color={theme.muted} size={13} />
								</Pressable>
							) : null}
						</Pressable>
					))}
				</View>
			) : null}

			{note.attachments.length ? (
				<View style={s.attachmentList}>
					{note.attachments.map((attachment) => (
						<Pressable
							key={attachment.id}
							style={[s.attachmentRow, { backgroundColor: theme.surfaceSoft }]}
							onPress={() => {
								if (isImageAttachment(attachment)) {
									onPreviewAttachment(attachment);
									return;
								}
								openCourseNoteAttachment(attachment).catch(() => Alert.alert("Pièce jointe", "Impossible d'ouvrir ce fichier."));
							}}>
							{attachment.kind === "photo" ? <Image color={theme.accent} size={17} /> : <FileText color={theme.accent} size={17} />}
							<View style={s.attachmentText}>
								<Text style={[s.attachmentName, { color: theme.text }]} numberOfLines={1}>
									{attachment.name}
								</Text>
								<Text style={[s.attachmentMeta, { color: theme.muted }]}>{formatSize(attachment.size) || attachment.mimeType || "Fichier local"}</Text>
							</View>
							<Pressable onPress={() => void onRemoveAttachment(note, attachment.id)} style={s.removeAttachment}>
								<X color={theme.muted} size={16} />
							</Pressable>
						</Pressable>
					))}
				</View>
			) : null}
			{hasImageAttachment ? <Text style={[s.imageHint, { color: theme.muted }]}>Appuie sur une image pour l’agrandir.</Text> : null}
		</View>
	);
}

function ActionButton({ icon, label, onPress }: { icon: React.ReactNode; label: string; onPress: () => void }) {
	const { theme } = useTheme();
	return (
		<Pressable style={[s.actionBtn, { backgroundColor: theme.surfaceSoft, borderColor: theme.border }]} onPress={onPress}>
			{icon}
			<Text style={[s.actionText, { color: theme.text }]}>{label}</Text>
		</Pressable>
	);
}

function formatSize(size?: number) {
	if (!size || !Number.isFinite(size)) return "";
	if (size < 1024) return `${size} o`;
	if (size < 1024 * 1024) return `${Math.round(size / 1024)} Ko`;
	return `${(size / 1024 / 1024).toFixed(1)} Mo`;
}

function formatReminderOffset(offsetMinutes: number) {
	const total = Math.max(1, Math.trunc(offsetMinutes));
	const days = Math.floor(total / 1440);
	const hours = Math.floor((total % 1440) / 60);
	const minutes = total % 60;
	const parts: string[] = [];
	if (days) parts.push(`${days} j`);
	if (hours) parts.push(`${hours} h`);
	if (minutes) parts.push(`${minutes} min`);
	return parts.join(" ") || "1 min";
}

function isImageAttachment(attachment: CourseNoteAttachment) {
	const mime = attachment.mimeType?.toLowerCase() || "";
	const name = attachment.name.toLowerCase();
	return attachment.kind === "photo" || mime.startsWith("image/") || /\.(png|jpe?g|webp)$/i.test(name);
}

function hasNoteContent(note: CourseNote) {
	return Boolean(note.body.trim() || note.links.length || note.attachments.length || note.reminder?.enabled);
}

function NoteStatusBadge({ dirty, saving }: { dirty: boolean; saving: boolean }) {
	const { theme } = useTheme();
	const label = saving ? "Enregistrement..." : dirty ? "Non enregistré" : "Enregistré";
	const backgroundColor = saving ? theme.accentSoft : dirty ? theme.warn : theme.surfaceSoft;
	const color = saving ? theme.accent : dirty ? "#fff" : theme.muted;
	const borderColor = saving ? theme.accentSoft : dirty ? theme.warn : theme.border;
	return (
		<View style={[s.statusBadge, { backgroundColor, borderColor }]}>
			<Text style={[s.statusBadgeText, { color }]}>{label}</Text>
		</View>
	);
}

const s = StyleSheet.create({
	root: { gap: 12 },
	header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
	noteTitleWrap: { flex: 1, minWidth: 0, gap: 7 },
	title: { fontSize: 18, fontWeight: "900" },
	meta: { marginTop: 3, fontSize: 13, fontWeight: "700", lineHeight: 18 },
	addBtn: { minHeight: 40, borderRadius: 12, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 7 },
	addText: { color: "#fff", fontWeight: "900" },
	loadingRow: { borderWidth: 1, borderRadius: 16, padding: 12, flexDirection: "row", alignItems: "center", gap: 9 },
	noteCard: { borderWidth: 1, borderRadius: 18, padding: 13, gap: 10 },
	noteTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
	noteTitle: { fontSize: 16, fontWeight: "900" },
	noteActions: { flexDirection: "row", alignItems: "center", gap: 7 },
	statusBadge: {
		alignSelf: "flex-start",
		minHeight: 24,
		borderRadius: 999,
		borderWidth: 1,
		paddingHorizontal: 10,
		paddingVertical: 3,
		alignItems: "center",
		justifyContent: "center",
	},
	statusBadgeText: { fontSize: 11, fontWeight: "900", lineHeight: 14 },
	iconBtn: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
	input: { minHeight: 96, borderWidth: 1, borderRadius: 12, padding: 11, fontSize: 15, lineHeight: 21, fontWeight: "700" },
	reminderRow: { flexDirection: "row", alignItems: "center", gap: 8 },
	reminderToggle: { minHeight: 38, borderRadius: 12, borderWidth: 1, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 6 },
	reminderToggleText: { fontSize: 13, fontWeight: "900" },
	reminderPickerBtn: {
		flex: 1,
		minHeight: 38,
		borderRadius: 12,
		borderWidth: 1,
		paddingHorizontal: 10,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 7,
	},
	reminderPickerText: { fontSize: 13, fontWeight: "900" },
	attachActions: { flexDirection: "row", gap: 7 },
	actionBtn: { flex: 1, minHeight: 38, borderWidth: 1, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 },
	actionText: { fontSize: 12, fontWeight: "900" },
	linkBox: { minHeight: 42, borderWidth: 1, borderRadius: 12, paddingLeft: 10, paddingRight: 5, flexDirection: "row", alignItems: "center", gap: 7 },
	linkInput: { flex: 1, minHeight: 40, fontSize: 14, fontWeight: "700" },
	linkAdd: { width: 32, height: 32, borderRadius: 9, alignItems: "center", justifyContent: "center" },
	chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
	linkChip: { maxWidth: "100%", minHeight: 32, borderRadius: 11, paddingHorizontal: 9, flexDirection: "row", alignItems: "center", gap: 6 },
	linkChipText: { maxWidth: 220, fontSize: 12, fontWeight: "900" },
	attachmentList: { gap: 7 },
	attachmentRow: { minHeight: 46, borderRadius: 12, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 9 },
	attachmentText: { flex: 1, minWidth: 0 },
	attachmentName: { fontSize: 13, fontWeight: "900" },
	attachmentMeta: { marginTop: 1, fontSize: 11, fontWeight: "700" },
	removeAttachment: { padding: 7 },
	imageHint: { marginTop: -1, fontSize: 11, fontWeight: "700" },
});
