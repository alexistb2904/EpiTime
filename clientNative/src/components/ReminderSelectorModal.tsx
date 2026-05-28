import React, { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Minus, Plus, X } from "lucide-react-native";
import { useTheme } from "../context/ThemeContext";

type ReminderSelectorModalProps = {
	visible: boolean;
	eventStartDate: string | Date;
	currentOffsetMinutes: number;
	onClose: () => void;
	onApply: (next: { enabled: boolean; offsetMinutes: number }) => void | Promise<void>;
};

type RelativeParts = {
	days: number;
	hours: number;
	minutes: number;
};

type PickerMode = "relative" | "exact";

const PRESETS: Array<{ label: string; parts: RelativeParts }> = [
	{ label: "5 min", parts: { days: 0, hours: 0, minutes: 5 } },
	{ label: "15 min", parts: { days: 0, hours: 0, minutes: 15 } },
	{ label: "30 min", parts: { days: 0, hours: 0, minutes: 30 } },
	{ label: "1 h", parts: { days: 0, hours: 1, minutes: 0 } },
	{ label: "2 h", parts: { days: 0, hours: 2, minutes: 0 } },
	{ label: "1 j", parts: { days: 1, hours: 0, minutes: 0 } },
	{ label: "2 j", parts: { days: 2, hours: 0, minutes: 0 } },
];

const WEEK_DAYS = ["L", "M", "M", "J", "V", "S", "D"];
const MINUTE = 60_000;

const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const normalizeOffset = (value: number) => Math.max(1, Math.trunc(Number.isFinite(value) ? value : 15));

const partsFromOffset = (offsetMinutes: number): RelativeParts => {
	const total = normalizeOffset(offsetMinutes);
	const days = Math.floor(total / 1440);
	const hours = Math.floor((total % 1440) / 60);
	const minutes = total % 60;
	return { days, hours, minutes };
};

const offsetFromParts = (parts: RelativeParts) => Math.max(1, parts.days * 1440 + parts.hours * 60 + parts.minutes);

const buildMonthGrid = (monthRef: Date) => {
	const first = new Date(monthRef.getFullYear(), monthRef.getMonth(), 1);
	const offset = (first.getDay() + 6) % 7;
	const gridStart = new Date(first);
	gridStart.setDate(first.getDate() - offset);
	return Array.from({ length: 42 }, (_, index) => {
		const date = new Date(gridStart);
		date.setDate(gridStart.getDate() + index);
		return date;
	});
};

export default function ReminderSelectorModal({ visible, eventStartDate, currentOffsetMinutes, onClose, onApply }: ReminderSelectorModalProps) {
	const { theme } = useTheme();
	const eventStart = useMemo(() => new Date(eventStartDate), [eventStartDate]);
	const eventStartMillis = eventStart.getTime();
	const [mode, setMode] = useState<PickerMode>("relative");
	const [relative, setRelative] = useState<RelativeParts>(partsFromOffset(currentOffsetMinutes));
	const [exactDate, setExactDate] = useState<Date>(() => new Date(Math.max(Date.now() + MINUTE, eventStartMillis - normalizeOffset(currentOffsetMinutes) * MINUTE)));
	const [pickerMonth, setPickerMonth] = useState<Date>(() => new Date(eventStartMillis));

	useEffect(() => {
		if (!visible) return;
		const offset = normalizeOffset(currentOffsetMinutes);
		const exact = new Date(Math.max(Date.now() + MINUTE, eventStartMillis - offset * MINUTE));
		setMode("relative");
		setRelative(partsFromOffset(offset));
		setExactDate(exact);
		setPickerMonth(new Date(exact.getFullYear(), exact.getMonth(), 1));
	}, [currentOffsetMinutes, eventStartMillis, visible]);

	const relativeOffset = offsetFromParts(relative);
	const relativeLabel = formatRelativeOffset(relativeOffset);
	const exactOffset = Math.round((eventStartMillis - exactDate.getTime()) / MINUTE);
	const exactValid = Number.isFinite(exactOffset) && exactOffset >= 1;
	const exactLabel = formatExactDate(exactDate);
	const exactBeforeEvent = exactValid ? formatRelativeOffset(exactOffset) : "";
	const monthDays = useMemo(() => buildMonthGrid(pickerMonth), [pickerMonth]);
	const today = new Date();

	const updatePart = (part: keyof RelativeParts, delta: number) => {
		setRelative((current) => {
			if (part === "days") return { ...current, days: clamp(current.days + delta, 0, 99) };
			if (part === "hours") return { ...current, hours: clamp(current.hours + delta, 0, 23) };
			return { ...current, minutes: clamp(current.minutes + delta, 0, 59) };
		});
	};

	const setPreset = (preset: RelativeParts) => {
		setRelative(preset);
		setMode("relative");
	};

	const moveMonth = (delta: number) => {
		const next = new Date(pickerMonth);
		next.setMonth(next.getMonth() + delta, 1);
		setPickerMonth(next);
	};

	const applyRelative = () => {
		void onApply({ enabled: true, offsetMinutes: relativeOffset });
		onClose();
	};

	const applyExact = () => {
		if (!exactValid) return;
		void onApply({ enabled: true, offsetMinutes: exactOffset });
		onClose();
	};

	return (
		<Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
			<View style={s.overlay}>
				<Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
				<Animated.View entering={FadeInDown.duration(260)} style={[s.card, { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.cardShadow }]}>
					<View style={[s.header, { borderBottomColor: theme.border }]}>
						<View style={s.titleWrap}>
							<Text style={[s.title, { color: theme.text }]}>Rappel</Text>
						</View>
						<Pressable style={[s.closeBtn, { borderColor: theme.border, backgroundColor: theme.surfaceSoft }]} onPress={onClose}>
							<X color={theme.text} size={20} />
						</Pressable>
					</View>

					<View style={s.modeRow}>
						<Pressable
							style={[s.modeBtn, { backgroundColor: mode === "relative" ? theme.accent : theme.surfaceSoft, borderColor: theme.border }]}
							onPress={() => setMode("relative")}>
							<Clock3 color={mode === "relative" ? "#fff" : theme.muted} size={16} />
							<Text style={[s.modeBtnText, { color: mode === "relative" ? "#fff" : theme.text }]}>Avant le cours</Text>
						</Pressable>
						<Pressable
							style={[s.modeBtn, { backgroundColor: mode === "exact" ? theme.accent : theme.surfaceSoft, borderColor: theme.border }]}
							onPress={() => setMode("exact")}>
							<CalendarDays color={mode === "exact" ? "#fff" : theme.muted} size={16} />
							<Text style={[s.modeBtnText, { color: mode === "exact" ? "#fff" : theme.text }]}>Date / heure précise</Text>
						</Pressable>
					</View>

					<ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scrollContent}>
						{mode === "relative" ? (
							<View style={s.section}>
								<Text style={[s.sectionTitle, { color: theme.text }]}>Choix rapides</Text>
								<View style={s.presetWrap}>
									{PRESETS.map((preset) => {
										const selected = preset.parts.days === relative.days && preset.parts.hours === relative.hours && preset.parts.minutes === relative.minutes;
										return (
											<Pressable
												key={preset.label}
												style={[
													s.presetChip,
													{ backgroundColor: selected ? theme.accent : theme.surfaceSoft, borderColor: selected ? theme.accent : theme.border },
												]}
												onPress={() => setPreset(preset.parts)}>
												<Text style={[s.presetText, { color: selected ? "#fff" : theme.text }]}>{preset.label}</Text>
											</Pressable>
										);
									})}
								</View>

								<Text style={[s.sectionTitle, { color: theme.text }]}>Personnalisé</Text>
								<View style={s.partGrid}>
									<PartStepper
										label="Jours"
										value={relative.days}
										onLess={() => updatePart("days", -1)}
										onMore={() => updatePart("days", 1)}
										themeColor={theme}
									/>
									<PartStepper
										label="Heures"
										value={relative.hours}
										onLess={() => updatePart("hours", -1)}
										onMore={() => updatePart("hours", 1)}
										themeColor={theme}
									/>
									<PartStepper
										label="Minutes"
										value={relative.minutes}
										onLess={() => updatePart("minutes", -5)}
										onMore={() => updatePart("minutes", 5)}
										themeColor={theme}
									/>
								</View>

								<View style={[s.summaryCard, { backgroundColor: theme.surfaceSoft, borderColor: theme.border }]}>
									<Text style={[s.summaryLabel, { color: theme.muted }]}>Le rappel sera programmé</Text>
									<Text style={[s.summaryValue, { color: theme.text }]}>{relativeLabel} avant le cours</Text>
								</View>
							</View>
						) : (
							<View style={s.section}>
								<View style={s.exactSummaryCard}>
									<View style={[s.exactSummaryIcon, { backgroundColor: theme.accentSoft }]}>
										<CalendarDays color={theme.accent} size={18} />
									</View>
									<View style={s.exactSummaryText}>
										<Text style={[s.summaryLabel, { color: theme.muted }]}>Rappel choisi</Text>
										<Text style={[s.exactDateLabel, { color: theme.text }]}>{exactLabel}</Text>
										<Text style={[s.summaryLabel, { color: exactValid ? theme.muted : theme.danger }]}>
											{exactValid ? `${exactBeforeEvent} avant le cours` : "Le rappel doit être avant le début du cours"}
										</Text>
									</View>
								</View>

								<View style={s.monthHead}>
									<Pressable style={[s.monthNav, { borderColor: theme.border, backgroundColor: theme.surfaceSoft }]} onPress={() => moveMonth(-1)}>
										<ChevronLeft color={theme.text} size={20} />
									</Pressable>
									<View style={s.monthTitleWrap}>
										<Text style={[s.monthTitle, { color: theme.text }]}>{pickerMonth.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}</Text>
										<Text style={[s.sectionHint, { color: theme.muted }]}>Choisis la date exacte du rappel</Text>
									</View>
									<Pressable style={[s.monthNav, { borderColor: theme.border, backgroundColor: theme.surfaceSoft }]} onPress={() => moveMonth(1)}>
										<ChevronRight color={theme.text} size={20} />
									</Pressable>
								</View>

								<View style={s.weekHeader}>
									{WEEK_DAYS.map((day, index) => (
										<Text key={`${day}-${index}`} style={[s.weekText, { color: theme.muted }]}>
											{day}
										</Text>
									))}
								</View>

								<View style={s.calendarGrid}>
									{monthDays.map((date) => {
										const selected = sameDay(date, exactDate);
										const inMonth = date.getMonth() === pickerMonth.getMonth();
										const isToday = sameDay(date, today);
										return (
											<Pressable
												key={date.toISOString()}
												style={[
													s.dayCell,
													{
														backgroundColor: selected ? theme.accent : isToday ? theme.accentSoft : "transparent",
														borderColor: selected || isToday ? theme.accent : "transparent",
													},
												]}
												onPress={() => {
													setExactDate((current) => {
														const next = new Date(current);
														next.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
														return next;
													});
													setPickerMonth(new Date(date.getFullYear(), date.getMonth(), 1));
												}}>
												<Text style={[s.dayCellText, { color: selected ? "#fff" : inMonth ? theme.text : theme.muted, opacity: inMonth ? 1 : 0.45 }]}>
													{date.getDate()}
												</Text>
												{isToday ? <View style={[s.todayDot, { backgroundColor: selected ? "#fff" : theme.accent }]} /> : null}
											</Pressable>
										);
									})}
								</View>

								<View style={s.timeSection}>
									<PartStepper
										label="Heures"
										value={exactDate.getHours()}
										onLess={() => setExactDate((current) => new Date(current.getTime() - 60 * MINUTE))}
										onMore={() => setExactDate((current) => new Date(current.getTime() + 60 * MINUTE))}
										themeColor={theme}
										compact
									/>
									<PartStepper
										label="Minutes"
										value={exactDate.getMinutes()}
										onLess={() => setExactDate((current) => new Date(current.getTime() - 5 * MINUTE))}
										onMore={() => setExactDate((current) => new Date(current.getTime() + 5 * MINUTE))}
										themeColor={theme}
										compact
									/>
								</View>
							</View>
						)}
					</ScrollView>

					<View style={s.footer}>
						<Pressable style={[s.secondaryBtn, { borderColor: theme.border, backgroundColor: theme.surfaceSoft }]} onPress={onClose}>
							<Text style={[s.secondaryText, { color: theme.text }]}>Annuler</Text>
						</Pressable>
						<Pressable
							style={[s.primaryBtn, { backgroundColor: theme.accent, opacity: mode === "relative" ? (relativeOffset > 0 ? 1 : 0.45) : exactValid ? 1 : 0.45 }]}
							disabled={mode === "relative" ? relativeOffset <= 0 : !exactValid}
							onPress={mode === "relative" ? applyRelative : applyExact}>
							<Text style={s.primaryText}>Appliquer le rappel</Text>
						</Pressable>
					</View>
				</Animated.View>
			</View>
		</Modal>
	);
}

function PartStepper({
	label,
	value,
	onLess,
	onMore,
	themeColor,
	compact = false,
}: {
	label: string;
	value: number;
	onLess: () => void;
	onMore: () => void;
	themeColor: { text: string; muted: string; border: string; surfaceSoft: string; accent: string };
	compact?: boolean;
}) {
	return (
		<View style={[s.partCard, { backgroundColor: themeColor.surfaceSoft, borderColor: themeColor.border }]}>
			<Text style={[s.partLabel, { color: themeColor.muted }]}>{label}</Text>
			<View style={s.partRow}>
				<Pressable style={[s.partBtn, { borderColor: themeColor.border }]} onPress={onLess}>
					<Minus color={themeColor.text} size={16} />
				</Pressable>
				<Text style={[s.partValue, { color: themeColor.text, fontSize: compact ? 18 : 20 }]}>{value}</Text>
				<Pressable style={[s.partBtn, { borderColor: themeColor.border }]} onPress={onMore}>
					<Plus color={themeColor.text} size={16} />
				</Pressable>
			</View>
		</View>
	);
}

function formatRelativeOffset(offsetMinutes: number) {
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

function formatExactDate(date: Date) {
	return date.toLocaleString("fr-FR", {
		weekday: "short",
		day: "2-digit",
		month: "short",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

const s = StyleSheet.create({
	overlay: { flex: 1, backgroundColor: "rgba(0, 0, 0, 0.54)", alignItems: "center", justifyContent: "center", padding: 18 },
	card: {
		width: "100%",
		maxWidth: 560,
		maxHeight: "92%",
		borderWidth: 1,
		borderRadius: 28,
		overflow: "hidden",
		shadowOpacity: 0.18,
		shadowRadius: 24,
		shadowOffset: { width: 0, height: 18 },
		elevation: 9,
	},
	header: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12, padding: 16, borderBottomWidth: 1 },
	titleWrap: { flex: 1, minWidth: 0 },
	title: { fontSize: 21, fontWeight: "900" },
	subtitle: { marginTop: 4, fontSize: 12, fontWeight: "700", lineHeight: 17 },
	closeBtn: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
	modeRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingTop: 14 },
	modeBtn: { flex: 1, minHeight: 44, borderRadius: 14, borderWidth: 1, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
	modeBtnText: { fontSize: 13, fontWeight: "900", textAlign: "center" },
	scrollContent: { padding: 16, paddingTop: 14, gap: 14 },
	section: { gap: 12 },
	sectionTitle: { fontSize: 15, fontWeight: "900" },
	sectionHint: { marginTop: 2, fontSize: 12, fontWeight: "700" },
	presetWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
	presetChip: { minHeight: 36, borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, alignItems: "center", justifyContent: "center" },
	presetText: { fontSize: 12, fontWeight: "900" },
	partGrid: { flexDirection: "row", gap: 8 },
	partCard: { flex: 1, minHeight: 102, borderWidth: 1, borderRadius: 18, padding: 10, justifyContent: "space-between" },
	partLabel: { fontSize: 12, fontWeight: "800" },
	partRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6 },
	partBtn: { width: 34, height: 34, borderRadius: 11, borderWidth: 1, alignItems: "center", justifyContent: "center" },
	partValue: { flex: 1, textAlign: "center", fontWeight: "900" },
	summaryCard: { borderWidth: 1, borderRadius: 18, padding: 12, gap: 4 },
	summaryLabel: { fontSize: 12, fontWeight: "800" },
	summaryValue: { fontSize: 15, fontWeight: "900" },
	exactSummaryCard: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 18, padding: 12, backgroundColor: "rgba(0,0,0,0.02)" },
	exactSummaryIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
	exactSummaryText: { flex: 1, minWidth: 0, gap: 3 },
	exactDateLabel: { fontSize: 15, fontWeight: "900", lineHeight: 20 },
	monthHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
	monthTitleWrap: { flex: 1, minWidth: 0, alignItems: "center" },
	monthTitle: { fontSize: 17, fontWeight: "900", textTransform: "capitalize" },
	monthNav: { width: 42, height: 42, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
	weekHeader: { flexDirection: "row" },
	weekText: { flex: 1, textAlign: "center", fontSize: 11, fontWeight: "900" },
	calendarGrid: { flexDirection: "row", flexWrap: "wrap" },
	dayCell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center", borderRadius: 14, borderWidth: 1 },
	dayCellText: { fontSize: 16, fontWeight: "900" },
	todayDot: { width: 4, height: 4, borderRadius: 2, marginTop: 3 },
	timeSection: { flexDirection: "row", gap: 8 },
	footer: { flexDirection: "row", gap: 10, padding: 16, paddingTop: 0 },
	secondaryBtn: { flex: 1, minHeight: 46, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
	secondaryText: { fontSize: 14, fontWeight: "900" },
	primaryBtn: { flex: 1, minHeight: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
	primaryText: { color: "#fff", fontSize: 14, fontWeight: "900" },
});
