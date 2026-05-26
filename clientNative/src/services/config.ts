import Constants from "expo-constants";

type ExpoExtra = {
	apiBase?: string;
	microsoftClientId?: string;
	microsoftTenant?: string;
	microsoftRedirectUri?: string;
	microsoftWebRedirectUri?: string;
	expoProjectId?: string;
	eas?: {
		projectId?: string;
	};
};

const extra = (Constants.expoConfig?.extra || {}) as ExpoExtra;

function readPublicValue(envKey: string, extraValue?: string) {
	const value = process.env[envKey] || extraValue;
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export const publicConfig = {
	apiBase: readPublicValue("EXPO_PUBLIC_API_BASE", extra.apiBase),
	microsoftClientId: readPublicValue("EXPO_PUBLIC_MICROSOFT_CLIENT_ID", extra.microsoftClientId),
	microsoftTenant: readPublicValue("EXPO_PUBLIC_MICROSOFT_TENANT", extra.microsoftTenant) || "epita.fr",
	microsoftRedirectUri: readPublicValue("EXPO_PUBLIC_MICROSOFT_REDIRECT_URI", extra.microsoftRedirectUri),
	microsoftWebRedirectUri: readPublicValue("EXPO_PUBLIC_MICROSOFT_WEB_REDIRECT_URI", extra.microsoftWebRedirectUri),
	expoProjectId:
		readPublicValue("EXPO_PUBLIC_EXPO_PROJECT_ID", extra.expoProjectId) ||
		Constants.easConfig?.projectId ||
		extra.eas?.projectId,
};
