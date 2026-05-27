import React, { useMemo } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react-native";
import { useTheme } from "../context/ThemeContext";
import { startOfDay } from "../utils/calendar";

type DatePickerModalProps = {
	visible: boolean;
	currentDate: Date;
	pickerMonth: Date;
	onChangeMonth: (date: Date) => void;
	onSelectDate: (date: Date) => void;
	onToday: () => void;
	onClose: () => void;
};

const sameDay = (a: Date, b: Date) => startOfDay(a).getTime() === startOfDay(b).getTime();

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

export default function DatePickerModal({ visible, currentDate, pickerMonth, onChangeMonth, onSelectDate, onToday, onClose }: DatePickerModalProps) {
	const { theme } = useTheme();
	const today = new Date();
	const monthDays = useMemo(() => buildMonthGrid(pickerMonth), [pickerMonth]);
	const weekDays = ["L", "M", "M", "J", "V", "S", "D"];
	const monthLabel = pickerMonth.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

	const moveMonth = (delta: number) => {
		const next = new Date(pickerMonth);
		next.setMonth(next.getMonth() + delta, 1);
		onChangeMonth(next);
	};

	return (
		<Modal visible={visible} animationType="fade" transparent>
			<View style={s.overlay}>
				<Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
				<Animated.View entering={FadeInDown.duration(260)} style={[s.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
					<View style={s.head}>
						<Pressable style={[s.nav, { borderColor: theme.border, backgroundColor: theme.surfaceSoft }]} onPress={() => moveMonth(-1)}>
							<ChevronLeft color={theme.text} size={20} />
						</Pressable>
						<View style={s.titleWrap}>
							<Text style={[s.title, { color: theme.text }]}>{monthLabel}</Text>
							<Text style={[s.sub, { color: theme.muted }]}>Choisir une date</Text>
						</View>
						<Pressable style={[s.nav, { borderColor: theme.border, backgroundColor: theme.surfaceSoft }]} onPress={() => moveMonth(1)}>
							<ChevronRight color={theme.text} size={20} />
						</Pressable>
					</View>

					<View style={s.weekHeader}>
						{weekDays.map((day, index) => (
							<Text key={`${day}-${index}`} style={[s.weekHeaderText, { color: theme.muted }]}>
								{day}
							</Text>
						))}
					</View>

					<View style={s.dateGrid}>
						{monthDays.map((date) => {
							const inMonth = date.getMonth() === pickerMonth.getMonth();
							const selected = sameDay(date, currentDate);
							const isToday = sameDay(date, today);
							return (
								<Pressable
									key={date.toISOString()}
									style={[
										s.dateCell,
										{
											backgroundColor: selected ? theme.accent : isToday ? theme.accentSoft : "transparent",
											borderColor: selected || isToday ? theme.accent : "transparent",
										},
									]}
									onPress={() => onSelectDate(date)}>
									<Text
										style={[
											s.dateCellText,
											{
												color: selected ? "#fff" : inMonth ? theme.text : theme.muted,
												opacity: inMonth ? 1 : 0.45,
											},
										]}>
										{date.getDate()}
									</Text>
									{isToday ? <View style={[s.todayDot, { backgroundColor: selected ? "#fff" : theme.accent }]} /> : null}
								</Pressable>
							);
						})}
					</View>

					<Pressable style={[s.todayBtn, { backgroundColor: theme.accent }]} onPress={onToday}>
						<CalendarDays color="#fff" size={18} />
						<Text style={s.todayText}>Retourner à aujourd'hui</Text>
					</Pressable>
				</Animated.View>
			</View>
		</Modal>
	);
}

const s = StyleSheet.create({
	overlay: { flex: 1, backgroundColor: "rgba(0, 0, 0, 0.48)", alignItems: "center", justifyContent: "center", padding: 18 },
	card: {
		width: "100%",
		maxWidth: 420,
		borderWidth: 1,
		borderRadius: 26,
		padding: 16,
		shadowColor: "#000",
		shadowOpacity: 0.18,
		shadowRadius: 24,
		shadowOffset: { width: 0, height: 18 },
		elevation: 8,
	},
	head: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
	nav: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
	titleWrap: { flex: 1, alignItems: "center" },
	title: { fontSize: 19, fontWeight: "900", textTransform: "capitalize" },
	sub: { marginTop: 2, fontSize: 12, fontWeight: "800" },
	weekHeader: { flexDirection: "row", marginBottom: 6 },
	weekHeaderText: { flex: 1, textAlign: "center", fontSize: 12, fontWeight: "900" },
	dateGrid: { flexDirection: "row", flexWrap: "wrap" },
	dateCell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center", borderRadius: 14, borderWidth: 1 },
	dateCellText: { fontSize: 16, fontWeight: "900" },
	todayDot: { width: 4, height: 4, borderRadius: 2, marginTop: 3 },
	todayBtn: { minHeight: 50, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 14 },
	todayText: { color: "#fff", fontSize: 15, fontWeight: "900" },
});
