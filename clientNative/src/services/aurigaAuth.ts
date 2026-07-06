import { Platform } from "react-native";
import * as AuthSession from "expo-auth-session";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AurigaTokenSet } from "./aurigaTypes";

export { type AurigaTokenSet } from "./aurigaTypes";

export const AURIGA_ORIGIN = "https://auriga.epita.fr";
export const AURIGA_API = "https://auriga.epita.fr/api";
export const AURIGA_AUTH_BASE = "https://ionisepita-auth.np-auriga.nfrance.net/auth/realms/npionisepita";
export const AURIGA_AUTH_URL = `${AURIGA_AUTH_BASE}/protocol/openid-connect/auth`;
export const AURIGA_TOKEN_URL = `${AURIGA_AUTH_BASE}/protocol/openid-connect/token`;
export const AURIGA_USERINFO_URL = `${AURIGA_AUTH_BASE}/protocol/openid-connect/userinfo`;
export const AURIGA_CLIENT_ID = "np-front";
export const AURIGA_REDIRECT_URI = "https://auriga.epita.fr/#/mainContent/welcome";
export const AURIGA_ROOT_REDIRECT_URI = "https://auriga.epita.fr/";

const REFRESH_TOKEN_KEY = "auriga.refreshToken";
const REFRESH_EXPIRES_AT_KEY = "auriga.refreshExpiresAt";
const REMEMBERED_IDENTIFIER_KEY = "auriga.rememberedIdentifier";
const REMEMBERED_PASSWORD_KEY = "auriga.rememberedPassword";
const TOKEN_EXPIRY_MARGIN_MS = 10_000;
const SILENT_RECONNECT_COOLDOWN_MS = 2 * 60_000;
const canUseSecureStore = Platform.OS !== "web";

let memoryTokenSet: AurigaTokenSet | null = null;
let silentReconnectPromise: Promise<string | null> | null = null;
let lastSilentReconnectFailureAt = 0;

export type AurigaLoginSession = {
	authUrl: string;
	state: string;
	redirectUri: string;
	codeVerifier?: string;
};

type AurigaLoginSessionOptions = {
	redirectUri?: string;
};

export type RememberedAurigaCredentials = {
	identifier: string;
	password: string;
};

export class AurigaAuthError extends Error {
	constructor(message = "Authentification Auriga requise") {
		super(message);
		this.name = "AurigaAuthError";
	}
}

const discovery = {
	authorizationEndpoint: AURIGA_AUTH_URL,
	tokenEndpoint: AURIGA_TOKEN_URL,
	userInfoEndpoint: AURIGA_USERINFO_URL,
};

async function secureSet(key: string, value: string) {
	if (canUseSecureStore) {
		await SecureStore.setItemAsync(key, value);
		return;
	}
	await AsyncStorage.setItem(key, value);
}

async function secureGet(key: string) {
	return canUseSecureStore ? SecureStore.getItemAsync(key) : AsyncStorage.getItem(key);
}

async function secureDelete(key: string) {
	if (canUseSecureStore) {
		await SecureStore.deleteItemAsync(key);
		return;
	}
	await AsyncStorage.removeItem(key);
}

function nowWithExpires(expiresIn?: number) {
	return Date.now() + Math.max(1, expiresIn ?? 60) * 1000;
}

function tokenSetFromResponse(response: AuthSession.TokenResponse): AurigaTokenSet {
	const raw = (response.rawResponse || {}) as { refresh_expires_in?: number };
	return {
		accessToken: response.accessToken,
		refreshToken: response.refreshToken,
		idToken: response.idToken,
		expiresAt: nowWithExpires(response.expiresIn),
		refreshExpiresAt: raw.refresh_expires_in ? nowWithExpires(raw.refresh_expires_in) : undefined,
	};
}

async function persistTokenSet(tokenSet: AurigaTokenSet) {
	memoryTokenSet = tokenSet;
	if (tokenSet.refreshToken) await secureSet(REFRESH_TOKEN_KEY, tokenSet.refreshToken);
	if (tokenSet.refreshExpiresAt) await secureSet(REFRESH_EXPIRES_AT_KEY, String(tokenSet.refreshExpiresAt));
}

function extractCodeFromUrl(url: string) {
	const query = url.includes("?") ? url.slice(url.indexOf("?") + 1).split("#")[0] : "";
	const hashQuery = url.includes("#") && url.slice(url.indexOf("#") + 1).includes("?") ? url.slice(url.indexOf("#") + 1).split("?")[1] : "";
	const params = new URLSearchParams(query || hashQuery);
	return {
		code: params.get("code"),
		state: params.get("state"),
		error: params.get("error"),
		errorDescription: params.get("error_description"),
	};
}

function extractLoginAction(html: string, baseUrl: string) {
	const formMatch = html.match(/<form[^>]*id=["']kc-form-login["'][^>]*>/i) || html.match(/<form[^>]*action=["'][^"']+["'][^>]*id=["']kc-form-login["'][^>]*>/i);
	if (!formMatch) throw new AurigaAuthError("Formulaire de connexion Auriga introuvable.");
	const actionMatch = formMatch[0].match(/action=["']([^"']+)["']/i);
	if (!actionMatch) throw new AurigaAuthError("Action de connexion Auriga introuvable.");
	const action = actionMatch[1].replace(/&amp;/g, "&");
	return new URL(action, baseUrl).toString();
}

function extractKeycloakCookies(response: Response) {
	const setCookie = response.headers.get("set-cookie");
	if (!setCookie) return "";
	return setCookie.match(/(?:AUTH_SESSION_ID|KC_RESTART|KEYCLOAK_SESSION|KEYCLOAK_IDENTITY)=[^;,]+/g)?.join("; ") || "";
}

function extractLoginError(html: string) {
	const feedback = html.match(/class=["'][^"']*kc-feedback-text[^"']*["'][^>]*>([^<]+)</i) || html.match(/class=["'][^"']*instruction[^"']*["'][^>]*>([^<]+)</i);
	return feedback?.[1]?.trim().replace(/\s+/g, " ") || "Identifiants Auriga refuses ou redirection inattendue.";
}

export async function createAurigaLoginSession(options: AurigaLoginSessionOptions = {}): Promise<AurigaLoginSession> {
	const redirectUri = options.redirectUri || AURIGA_REDIRECT_URI;
	const extraParams: Record<string, string> = {
		response_mode: "query",
	};
	const request = new AuthSession.AuthRequest({
		clientId: AURIGA_CLIENT_ID,
		redirectUri,
		responseType: AuthSession.ResponseType.Code,
		scopes: ["openid", "profile", "email"],
		prompt: AuthSession.Prompt.Login,
		usePKCE: true,
		codeChallengeMethod: AuthSession.CodeChallengeMethod.S256,
		extraParams,
	});
	const authUrl = await request.makeAuthUrlAsync(discovery);
	return { authUrl, state: request.state, redirectUri, codeVerifier: request.codeVerifier };
}

export async function completeAurigaLoginFromUrl(url: string, session: AurigaLoginSession): Promise<AurigaTokenSet> {
	const parsed = extractCodeFromUrl(url);
	if (parsed.error) throw new AurigaAuthError(parsed.errorDescription || parsed.error);
	if (!parsed.code) throw new AurigaAuthError("Code Auriga introuvable dans le retour d'authentification.");
	if (parsed.state && parsed.state !== session.state) throw new AurigaAuthError("Etat OAuth Auriga invalide.");

	const response = await AuthSession.exchangeCodeAsync(
		{
			clientId: AURIGA_CLIENT_ID,
			code: parsed.code,
			redirectUri: session.redirectUri,
			extraParams: session.codeVerifier ? { code_verifier: session.codeVerifier } : undefined,
		},
		discovery
	);
	const tokenSet = tokenSetFromResponse(response);
	await persistTokenSet(tokenSet);
	return tokenSet;
}

export async function loginAurigaWithCredentials(username: string, password: string): Promise<AurigaTokenSet> {
	const trimmedUsername = username.trim();
	if (!trimmedUsername || !password) throw new AurigaAuthError("Renseigne ton mail/login Auriga et ton mot de passe.");
	const session = await createAurigaLoginSession({ redirectUri: AURIGA_ROOT_REDIRECT_URI });
	const htmlHeaders = {
		"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
		Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
		"Accept-Language": "fr-FR,fr;q=0.9",
	};
	const initialResponse = await fetch(session.authUrl, { headers: htmlHeaders });
	if (!initialResponse.ok) throw new AurigaAuthError(`Page de connexion Auriga indisponible (${initialResponse.status}).`);
	const initialHtml = await initialResponse.text();
	const actionUrl = extractLoginAction(initialHtml, initialResponse.url || AURIGA_AUTH_URL);
	const cookie = extractKeycloakCookies(initialResponse);
	const body = new URLSearchParams({ username: trimmedUsername, password, credentialId: "" }).toString();
	const loginResponse = await fetch(actionUrl, {
		method: "POST",
		headers: {
			...htmlHeaders,
			"Content-Type": "application/x-www-form-urlencoded",
			...(cookie ? { Cookie: cookie } : null),
		},
		body,
	});
	const returnedUrl = loginResponse.url || loginResponse.headers.get("location") || "";
	if (!returnedUrl.includes("code=")) {
		const errorHtml = await loginResponse.text().catch(() => "");
		throw new AurigaAuthError(extractLoginError(errorHtml));
	}
	return completeAurigaLoginFromUrl(returnedUrl, session);
}

export async function refreshAurigaToken(refreshToken: string): Promise<AurigaTokenSet> {
	const response = await AuthSession.refreshAsync({ clientId: AURIGA_CLIENT_ID, refreshToken }, discovery);
	const tokenSet = tokenSetFromResponse(response);
	if (!tokenSet.refreshToken) tokenSet.refreshToken = refreshToken;
	await persistTokenSet(tokenSet);
	return tokenSet;
}

async function silentReconnectWithRememberedCredentials(): Promise<string | null> {
	if (silentReconnectPromise) return silentReconnectPromise;
	if (Date.now() - lastSilentReconnectFailureAt < SILENT_RECONNECT_COOLDOWN_MS) return null;

	silentReconnectPromise = (async () => {
		const credentials = await getRememberedAurigaCredentials();
		if (!credentials) return null;
		try {
			const tokenSet = await loginAurigaWithCredentials(credentials.identifier, credentials.password);
			return tokenSet.accessToken;
		} catch {
			lastSilentReconnectFailureAt = Date.now();
			return null;
		} finally {
			silentReconnectPromise = null;
		}
	})();

	return silentReconnectPromise;
}

export async function forceRefreshAurigaAccessToken(): Promise<string | null> {
	const refreshToken = await secureGet(REFRESH_TOKEN_KEY);
	const refreshExpiresRaw = await secureGet(REFRESH_EXPIRES_AT_KEY);
	const refreshExpiresAt = refreshExpiresRaw ? Number(refreshExpiresRaw) : undefined;
	if (refreshToken && (!refreshExpiresAt || refreshExpiresAt > Date.now())) {
		try {
			const tokenSet = await refreshAurigaToken(refreshToken);
			return tokenSet.accessToken;
		} catch {
			// Fall through to remembered credentials.
		}
	}
	return silentReconnectWithRememberedCredentials();
}

export async function getValidAurigaAccessToken(): Promise<string | null> {
	if (memoryTokenSet?.accessToken && memoryTokenSet.expiresAt - TOKEN_EXPIRY_MARGIN_MS > Date.now()) return memoryTokenSet.accessToken;
	return forceRefreshAurigaAccessToken();
}

export async function hasAurigaRefreshToken(): Promise<boolean> {
	return Boolean(await secureGet(REFRESH_TOKEN_KEY));
}

export async function saveRememberedAurigaCredentials(credentials: RememberedAurigaCredentials): Promise<void> {
	const identifier = credentials.identifier.trim();
	if (!identifier || !credentials.password) throw new AurigaAuthError("Identifiants Auriga incomplets.");
	await Promise.all([secureSet(REMEMBERED_IDENTIFIER_KEY, identifier), secureSet(REMEMBERED_PASSWORD_KEY, credentials.password)]);
}

export async function getRememberedAurigaCredentials(): Promise<RememberedAurigaCredentials | null> {
	const [identifier, password] = await Promise.all([secureGet(REMEMBERED_IDENTIFIER_KEY), secureGet(REMEMBERED_PASSWORD_KEY)]);
	if (!identifier || !password) return null;
	return { identifier, password };
}

export async function clearRememberedAurigaCredentials(): Promise<void> {
	await Promise.all([secureDelete(REMEMBERED_IDENTIFIER_KEY), secureDelete(REMEMBERED_PASSWORD_KEY)]);
}

export async function logoutAuriga(): Promise<void> {
	memoryTokenSet = null;
	await Promise.all([secureDelete(REFRESH_TOKEN_KEY), secureDelete(REFRESH_EXPIRES_AT_KEY)]);
}
