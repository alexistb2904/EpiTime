import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";
import { exchangeMicrosoftToken } from "./api";
import { saveSession, clearSession } from "./storage";
import { MicrosoftProfile, Session } from "../types";
import { publicConfig } from "./config";
WebBrowser.maybeCompleteAuthSession();
const clientId = publicConfig.microsoftClientId;
const tenant = publicConfig.microsoftTenant;
const nativeRedirectUri = publicConfig.microsoftRedirectUri;
const webRedirectUri = publicConfig.microsoftWebRedirectUri;
const discovery = {
	authorizationEndpoint: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
	tokenEndpoint: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
};
export function getRedirectUri() {
	if (Platform.OS === "web") {
		return webRedirectUri || AuthSession.makeRedirectUri();
	}
	if (nativeRedirectUri) return nativeRedirectUri;
	return AuthSession.makeRedirectUri({ scheme: "epitime", path: "auth" });
}
async function getMicrosoftProfile(accessToken: string): Promise<MicrosoftProfile | null> {
	try {
		const res = await fetch("https://graph.microsoft.com/v1.0/me", {
			headers: { Authorization: `Bearer ${accessToken}` },
		});
		if (!res.ok) return null;
		const profile = (await res.json()) as MicrosoftProfile;
		return {
			id: profile.id,
			displayName: profile.displayName,
			mail: profile.mail,
			userPrincipalName: profile.userPrincipalName,
		};
	} catch {
		return null;
	}
}
export async function loginWithMicrosoft(): Promise<Session> {
	if (!clientId) throw new Error("EXPO_PUBLIC_MICROSOFT_CLIENT_ID manquant");
	const redirectUri = getRedirectUri();
	const request = new AuthSession.AuthRequest({
		clientId,
		redirectUri,
		scopes: ["openid", "profile", "User.Read"],
		responseType: AuthSession.ResponseType.Code,
		usePKCE: true,
		prompt: AuthSession.Prompt.SelectAccount,
	});
	const result = await request.promptAsync(discovery);
	if (result.type !== "success" || !result.params.code) throw new Error("Connexion annulée ou refusée");
	const tokenResponse = await AuthSession.exchangeCodeAsync(
		{ clientId, code: result.params.code, redirectUri, extraParams: { code_verifier: request.codeVerifier || "" } },
		discovery
	);
	if (!tokenResponse.accessToken) throw new Error("Access token Microsoft manquant");
	const zeus = await exchangeMicrosoftToken(tokenResponse.accessToken);
	const account = await getMicrosoftProfile(tokenResponse.accessToken);
	const session = { microsoftAccessToken: tokenResponse.accessToken, zeusToken: zeus.token, account };
	await saveSession(session);
	return session;
}
export async function logout() {
	await clearSession();
}
