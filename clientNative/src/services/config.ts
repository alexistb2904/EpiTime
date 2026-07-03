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

function readPublicValue(extraValue?: string, envValue?: string) {
	const value = extraValue || envValue;
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export const publicConfig = {
	apiBase: readPublicValue(extra.apiBase, publicEnv.apiBase),
	microsoftClientId: readPublicValue(extra.microsoftClientId, publicEnv.microsoftClientId),
	microsoftTenant: readPublicValue(extra.microsoftTenant, publicEnv.microsoftTenant) || "epita.fr",
	microsoftRedirectUri: readPublicValue(extra.microsoftRedirectUri, publicEnv.microsoftRedirectUri),
	microsoftWebRedirectUri: readPublicValue(extra.microsoftWebRedirectUri, publicEnv.microsoftWebRedirectUri),
	expoProjectId: readPublicValue(extra.expoProjectId, publicEnv.expoProjectId) || Constants.easConfig?.projectId || extra.eas?.projectId,
};
