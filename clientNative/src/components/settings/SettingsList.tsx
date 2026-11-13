import React from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { CaretRight, Minus, Plus } from "phosphor-react-native";
import { useTheme } from "../../context/ThemeContext";
import type { AppTheme } from "../../theme/palettes";

type Icon = React.ComponentType<{ color?: string; size?: number }>;

/** Rôle "error" Material 3 : lisible sur les surfaces statiques comme Material You (theme.danger y est un errorContainer). */
export const destructiveColor = (theme: AppTheme) => (theme.mode === "dark" ? "#F2B8B5" : "#B3261E");

export function ScreenTitle({ children }: { children: string }) {
	const { theme } = useTheme();
	return (
		<Text accessibilityRole="header" style={[s.screenTitle, { color: theme.text }]}>
			{children}
		</Text>
	);
}

/** Un groupe = un titre + une seule surface, les lignes séparées par un filet. */
export function Section({ title, footer, children }: { title?: string; footer?: string; children: React.ReactNode }) {
	const { theme } = useTheme();
	const rows = React.Children.toArray(children);
	if (!rows.length) return null;
	return (
		<View style={s.section}>
			{title ? (
				<Text accessibilityRole="header" style={[s.sectionTitle, { color: theme.accent }]}>
					{title}
				</Text>
			) : null}
			<View style={[s.surface, { backgroundColor: theme.surface, borderColor: theme.border }]}>
				{rows.map((row, index) => (
					<React.Fragment key={index}>
						{index > 0 ? <View style={[s.divider, { backgroundColor: theme.border }]} /> : null}
						{row}
					</React.Fragment>
				))}
			</View>
			{footer ? <Text style={[s.sectionFooter, { color: theme.muted }]}>{footer}</Text> : null}
		</View>
	);
}

type RowProps = {
	icon?: Icon;
	iconColor?: string;
	title: string;
	subtitle?: string;
	trailing?: React.ReactNode;
	below?: React.ReactNode;
	onPress?: () => void;
	toggle?: { value: boolean; onValueChange: (value: boolean) => void; disabled?: boolean };
	loading?: boolean;
	disabled?: boolean;
	destructive?: boolean;
};

export function Row({ icon: IconComponent, iconColor, title, subtitle, trailing, below, onPress, toggle, loading, disabled, destructive }: RowProps) {
	const { theme } = useTheme();
	const titleColor = destructive ? destructiveColor(theme) : theme.text;
	const tint = iconColor || (destructive ? destructiveColor(theme) : theme.accent);
	const press = toggle ? () => toggle.onValueChange(!toggle.value) : onPress;
	const inactive = disabled || toggle?.disabled || loading;
	const showChevron = !!onPress && !toggle && trailing === undefined && !destructive && !disabled;

	const content = (
		<>
			<View style={s.rowLine}>
				{IconComponent || loading ? (
					<View style={s.rowIcon}>{loading ? <ActivityIndicator size="small" color={tint} /> : IconComponent ? <IconComponent color={tint} size={20} /> : null}</View>
				) : null}
				<View style={s.rowText}>
					<Text style={[s.rowTitle, { color: titleColor }]}>{title}</Text>
					{subtitle ? <Text style={[s.rowSubtitle, { color: theme.muted }]}>{subtitle}</Text> : null}
				</View>
				{toggle ? <Toggle value={toggle.value} onValueChange={toggle.onValueChange} disabled={toggle.disabled} /> : trailing}
				{showChevron ? <CaretRight color={theme.muted} size={20} /> : null}
			</View>
			{below ? <View style={[s.rowBelow, IconComponent || loading ? s.rowBelowIndented : null]}>{below}</View> : null}
		</>
	);

	if (!press) return <View style={[s.row, { opacity: disabled ? 0.55 : 1 }]}>{content}</View>;
	return (
		<Pressable
			accessibilityRole={toggle ? "switch" : "button"}
			accessibilityState={toggle ? { checked: toggle.value, disabled: !!inactive } : { disabled: !!inactive }}
			onPress={press}
			disabled={inactive}
			android_ripple={{ color: theme.accentSoft }}
			style={({ pressed }) => [s.row, { backgroundColor: pressed && Platform.OS === "ios" ? theme.surfaceSoft : "transparent", opacity: disabled ? 0.55 : 1 }]}>
			{content}
		</Pressable>
	);
}

export function Toggle({ value, onValueChange, disabled }: { value: boolean; onValueChange: (value: boolean) => void; disabled?: boolean }) {
	const { theme } = useTheme();
	if (Platform.OS === "ios") return <Switch value={value} onValueChange={onValueChange} disabled={disabled} trackColor={{ false: theme.border, true: theme.accent }} />;
	return (
		<Switch
			value={value}
			onValueChange={onValueChange}
			disabled={disabled}
			thumbColor={value ? theme.accent : theme.muted}
			trackColor={{ false: theme.surfaceSoft, true: theme.accentSoft }}
		/>
	);
}

export function Stepper({ value, onDecrease, onIncrease, label }: { value: string; onDecrease: () => void; onIncrease: () => void; label: string }) {
	const { theme } = useTheme();
	const button = (Glyph: Icon, onPress: () => void, a11y: string) => (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={a11y}
			hitSlop={6}
			onPress={onPress}
			style={({ pressed }) => [s.stepButton, { borderColor: theme.border, backgroundColor: pressed ? theme.accentSoft : theme.surfaceSoft }]}>
			<Glyph color={theme.text} size={18} />
		</Pressable>
	);
	return (
		<View style={s.stepper}>
			{button(Minus, onDecrease, `Diminuer ${label}`)}
			<Text style={[s.stepValue, { color: theme.text }]}>{value}</Text>
			{button(Plus, onIncrease, `Augmenter ${label}`)}
		</View>
	);
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (value: T) => void }) {
	const { theme } = useTheme();
	return (
		<View style={[s.segmented, { borderColor: theme.border, backgroundColor: theme.surfaceSoft }]}>
			{options.map((option) => {
				const active = option.value === value;
				return (
					<Pressable
						key={option.value}
						accessibilityRole="button"
						accessibilityState={{ selected: active }}
						onPress={() => onChange(option.value)}
						style={[s.segment, active && { backgroundColor: theme.accent }]}>
						<Text style={[s.segmentLabel, { color: active ? theme.bg : theme.text }]}>{option.label}</Text>
					</Pressable>
				);
			})}
		</View>
	);
}

export function PrimaryButton({ label, icon: IconComponent, onPress, loading, disabled }: { label: string; icon: Icon; onPress: () => void; loading?: boolean; disabled?: boolean }) {
	const { theme } = useTheme();
	return (
		<Pressable
			accessibilityRole="button"
			onPress={onPress}
			disabled={disabled || loading}
			style={({ pressed }) => [s.primaryButton, { backgroundColor: theme.accentSoft, opacity: disabled ? 0.55 : pressed ? 0.8 : 1 }]}>
			{loading ? <ActivityIndicator color={theme.accent} /> : <IconComponent color={theme.accent} size={18} />}
			<Text style={[s.primaryLabel, { color: theme.accent }]}>{label}</Text>
		</Pressable>
	);
}

export const s = StyleSheet.create({
	screen: { flex: 1 },
	screenContent: { paddingHorizontal: 16, paddingBottom: 112 },
	screenTitle: { fontSize: 32, fontWeight: "900", letterSpacing: -0.5, paddingHorizontal: 4, marginBottom: 8 },

	section: { marginTop: 24 },
	sectionTitle: { fontSize: 14, fontWeight: "800", paddingHorizontal: 4, marginBottom: 8 },
	sectionFooter: { fontSize: 13, lineHeight: 18, paddingHorizontal: 4, marginTop: 8 },
	surface: { borderWidth: 1, borderRadius: 20, overflow: "hidden" },
	divider: { height: StyleSheet.hairlineWidth, marginLeft: 50 },

	row: { minHeight: 56, paddingHorizontal: 16, paddingVertical: 12, justifyContent: "center" },
	rowLine: { flexDirection: "row", alignItems: "center", gap: 14 },
	rowIcon: { width: 20, alignItems: "center" },
	rowText: { flex: 1, gap: 2 },
	rowTitle: { fontSize: 16, fontWeight: "700" },
	rowSubtitle: { fontSize: 14, lineHeight: 19 },
	rowBelow: { marginTop: 12 },
	rowBelowIndented: { marginLeft: 34 },

	stepper: { flexDirection: "row", alignItems: "center", gap: 8 },
	stepButton: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: "center", justifyContent: "center" },
	stepValue: { minWidth: 48, textAlign: "center", fontSize: 16, fontWeight: "800", fontVariant: ["tabular-nums"] },

	segmented: { flexDirection: "row", borderWidth: 1, borderRadius: 14, padding: 3, gap: 3 },
	segment: { flex: 1, minHeight: 40, borderRadius: 11, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
	segmentLabel: { fontSize: 14, fontWeight: "700" },

	primaryButton: { minHeight: 52, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 24 },
	primaryLabel: { fontSize: 15, fontWeight: "800" },
});
