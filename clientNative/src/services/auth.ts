import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";
import { MicrosoftProfile, Session } from "../types";
import { createAuthReconnectRequiredError, exchangeMicrosoftToken, setRefreshSessionHandler } from "./api";
import { isTerminalAuthFailure } from "./authUtils";
import { publicConfig } from "./config";
import { clearSession, getSession, markSessionExpired, saveSession } from "./storage";
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
/** `loginHint` reconnects straight to the account whose session expired, without the account picker. */
export async function loginWithMicrosoft(loginHint?: string): Promise<Session> {
	if (!clientId) throw new Error("EXPO_PUBLIC_MICROSOFT_CLIENT_ID manquant");
	const redirectUri = getRedirectUri();
	const request = new AuthSession.AuthRequest({
		clientId,
		redirectUri,
		scopes: ["openid", "profile", "User.Read", "offline_access"],
		responseType: AuthSession.ResponseType.Code,
		usePKCE: true,
		...(loginHint ? { extraParams: { login_hint: loginHint } } : { prompt: AuthSession.Prompt.SelectAccount }),
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
		await markSessionExpired();
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
			zeusToken: zeus.token,
			zeusRefreshedAt: Date.now(),
		};
		await saveSession(nextSession);
		console.log("[AUTH] refresh success");
		return nextSession;
	} catch (error) {
		if (!isTerminalAuthFailure(error)) {
			console.log("[AUTH] refresh failed temporarily, session kept");
			throw error;
		}
		await markSessionExpired();
		console.log("[AUTH] session expired, reconnect required");
		throw createAuthReconnectRequiredError();
	}
}

setRefreshSessionHandler(refreshSession);
export async function logout() {
	await clearSession();
}
