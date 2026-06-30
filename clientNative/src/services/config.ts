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

const publicEnv = {
	apiBase: process.env.EXPO_PUBLIC_API_BASE,
	microsoftClientId: process.env.EXPO_PUBLIC_MICROSOFT_CLIENT_ID,
	microsoftTenant: process.env.EXPO_PUBLIC_MICROSOFT_TENANT,
	microsoftRedirectUri: process.env.EXPO_PUBLIC_MICROSOFT_REDIRECT_URI,
	microsoftWebRedirectUri: process.env.EXPO_PUBLIC_MICROSOFT_WEB_REDIRECT_URI,
	expoProjectId: process.env.EXPO_PUBLIC_EXPO_PROJECT_ID,
};

function readPublicValue(envValue?: string, extraValue?: string) {
	const value = envValue || extraValue;
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export const publicConfig = {
	apiBase: readPublicValue(publicEnv.apiBase, extra.apiBase),
	microsoftClientId: readPublicValue(publicEnv.microsoftClientId, extra.microsoftClientId),
	microsoftTenant: readPublicValue(publicEnv.microsoftTenant, extra.microsoftTenant) || "epita.fr",
	microsoftRedirectUri: readPublicValue(publicEnv.microsoftRedirectUri, extra.microsoftRedirectUri),
	microsoftWebRedirectUri: readPublicValue(publicEnv.microsoftWebRedirectUri, extra.microsoftWebRedirectUri),
	expoProjectId:
		readPublicValue(publicEnv.expoProjectId, extra.expoProjectId) ||
		Constants.easConfig?.projectId ||
		extra.eas?.projectId,
};
