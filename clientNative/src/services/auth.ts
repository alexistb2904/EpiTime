import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";
import { createAuthReconnectRequiredError, exchangeMicrosoftToken, setRefreshSessionHandler } from "./api";
import { saveSession, clearSession, getSession } from "./storage";
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

function getMicrosoftExpiresAt(expiresIn?: number | null) {
	if (typeof expiresIn === "number" && Number.isFinite(expiresIn) && expiresIn > 0) {
		return Date.now() + Math.max(60_000, expiresIn * 1000 - 5 * 60_000);
	}
	return Date.now() + 50 * 60_000;
}

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
		scopes: ["openid", "profile", "User.Read", "offline_access"],
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
	const session: Session = {
		microsoftAccessToken: tokenResponse.accessToken,
		microsoftRefreshToken: tokenResponse.refreshToken || null,
		microsoftExpiresAt: getMicrosoftExpiresAt(tokenResponse.expiresIn ?? null),
		zeusToken: zeus.token,
		zeusRefreshedAt: Date.now(),
		account,
	};
	await saveSession(session);
	return session;
}

export async function refreshSession(): Promise<Session> {
	if (!clientId) throw new Error("EXPO_PUBLIC_MICROSOFT_CLIENT_ID manquant");
	console.log("[AUTH] refresh started");
	const session = await getSession();
	if (!session?.microsoftRefreshToken) {
		console.log("[AUTH] refresh unavailable: missing refresh token");
		await clearSession();
		throw createAuthReconnectRequiredError();
	}

	try {
		const tokenResponse = await AuthSession.refreshAsync(
			{
				clientId,
				refreshToken: session.microsoftRefreshToken,
				scopes: ["openid", "profile", "User.Read", "offline_access"],
			},
			discovery
		);

		if (!tokenResponse.accessToken) throw new Error("Access token Microsoft manquant");

		const zeus = await exchangeMicrosoftToken(tokenResponse.accessToken);
		const nextSession: Session = {
			...session,
			microsoftAccessToken: tokenResponse.accessToken,
			microsoftRefreshToken: tokenResponse.refreshToken || session.microsoftRefreshToken,
			microsoftExpiresAt: getMicrosoftExpiresAt(tokenResponse.expiresIn ?? null),
			zeusToken: zeus.token,
			zeusRefreshedAt: Date.now(),
		};
		await saveSession(nextSession);
		console.log("[AUTH] refresh success");
		return nextSession;
	} catch (error) {
		await clearSession();
		console.log("[AUTH] session expired, reconnect required");
		throw createAuthReconnectRequiredError();
	}
}

setRefreshSessionHandler(refreshSession);
export async function logout() {
	await clearSession();
}
