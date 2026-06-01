import React from "react";
import { FlexWidget, SvgWidget } from "react-native-android-widget";
import type { CourseWidgetTheme } from "./courseWidgetTheme";

type RefreshWidgetButtonProps = {
	label: string;
	theme: CourseWidgetTheme;
};

export function RefreshWidgetButton({ label, theme }: RefreshWidgetButtonProps) {
	return (
		<FlexWidget
			clickAction="REFRESH_WIDGET"
			accessibilityLabel={label}
			style={{
				width: 32,
				height: 32,
				borderRadius: 16,
				alignItems: "center",
				justifyContent: "center",
				backgroundColor: theme.rowMuted,
				borderColor: theme.outline,
				borderWidth: 1,
			}}>
			<SvgWidget svg={refreshIconSvg(theme.primary)} style={{ width: 18, height: 18 }} />
		</FlexWidget>
	);
}

function refreshIconSvg(color: string) {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none">
		<path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
		<path d="M3 3v5h5" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
		<path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
		<path d="M16 16h5v5" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
	</svg>`;
}
