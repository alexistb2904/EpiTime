import React, { useState, useContext, createContext } from "react";
import { CacheLookupPolicy, PublicClientApplication } from "@azure/msal-browser";
import { trackEvent } from "../utils/analyticsTracker";
import { fetchApi, setSessionRenewer } from "../utils/api";
import { clearSavedSession, EXPIRY_LEEWAY_MS, getZeusTokenExpiresAt, getZeusTokenIssuedAt, hasMicrosoftRedirectResponse, readSavedSession } from "../utils/authSession";

const AuthContext = createContext();
const LOGIN_ANALYTICS_FLOW_KEY = "epitime_login_analytics_flow";

const saveLoginAnalyticsFlow = (flow) => {
	try {
		sessionStorage.setItem(LOGIN_ANALYTICS_FLOW_KEY, flow);
	} catch {
		//
	}
};

const consumeLoginAnalyticsFlow = () => {
	try {
		const flow = sessionStorage.getItem(LOGIN_ANALYTICS_FLOW_KEY);
		sessionStorage.removeItem(LOGIN_ANALYTICS_FLOW_KEY);
		return flow ? { flow } : null;
	} catch {
		return null;
	}
};

const isMobile = () => {
	return (
		/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
		(navigator.maxTouchPoints && navigator.maxTouchPoints > 2 && /MacIntel/.test(navigator.platform))
	);
};

const isIOS = () => {
	return /iPad|iPhone|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /MacIntel/.test(navigator.platform));
};

const isStandalonePWA = () => {
	return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
};

const shouldUseRedirectAuth = () => {
	return true; // Problème de popup a fix plus tard
	//return isMobile() || isIOS() || isStandalonePWA();
};

const isPopupIssue = (err) => {
	if (!err) return false;
	const raw = `${err.errorCode || ""} ${err.message || ""}`.toLowerCase();
	return raw.includes("popup") || raw.includes("empty_window_error") || raw.includes("monitor_window_timeout");
};

const AUTH_SCOPES = ["openid", "profile", "User.Read"];
const REDIRECT_TIMEOUT_MS = 6_000;
// Covers a refresh-token call plus the hidden iframe (iframeBridgeTimeout below).
const SILENT_TIMEOUT_MS = 10_000;
// Zeus tokens and Microsoft's SPA refresh token both last 24 h from login: renewing early, while the
// refresh token still works, pushes the Zeus expiry as far as possible.
const EARLY_RENEWAL_AFTER_MS = 2 * 3_600_000;
const RENEWING_MESSAGE = "Renouvellement de ta session…";
const AUTO_RECONNECT_FLOW = "auto_reconnect";
const AUTO_RECONNECT_AT_KEY = "epitime_auto_reconnect_at";
const AUTO_RECONNECT_COOLDOWN_MS = 10 * 60_000;
// MSAL would otherwise bounce once more to the page the login started from, and lose the response.
const REDIRECT_OPTIONS = { navigateToLoginRequestUrl: false };

const withDeadline = async (promise, timeoutMs) => {
	let timeout;
	try {
		return await Promise.race([
			promise,
			new Promise((_, reject) => {
				timeout = setTimeout(() => reject(new Error("Délai de connexion dépassé")), timeoutMs);
			}),
		]);
	} finally {
		clearTimeout(timeout);
	}
};

export const AuthProvider = ({ children }) => {
	const [savedSession] = useState(readSavedSession);
	const [redirectCallback] = useState(hasMicrosoftRedirectResponse);
	// Online, an expired session is renewed before the calendar shows. Offline, it still opens cached schedules.
	const [renewAtStartup] = useState(() => Boolean(savedSession?.expired && navigator.onLine));
	const [user, setUser] = useState(savedSession?.user ?? null);
	const [zeusToken, setZeusToken] = useState(savedSession?.token ?? null);
	// The session is over and could not be renewed. The user stays on the calendar with its cached weeks
	// and a "reconnect" notice: the login page would lock them out of their schedule.
	const [sessionExpired, setSessionExpired] = useState(false);
	const expired = React.useRef(false);
	const [loading, setLoading] = useState(redirectCallback || renewAtStartup);
	const [loadingMessage, setLoadingMessage] = useState(redirectCallback ? "Préparation de la connexion Microsoft…" : RENEWING_MESSAGE);
	const [error, setError] = useState(null);
	const loggingOut = React.useRef(false);
	const startup = React.useRef(null);
	const renewal = React.useRef(null);
	const reconnection = React.useRef(null);
	const earlyRenewalTriedAt = React.useRef(0);
	// Last signed-in account: looked up in the MSAL cache to renew, and reused as login hint after an expiry.
	const lastUser = React.useRef(savedSession?.user ?? null);

	const msalConfig = {
		auth: {
			clientId: "e1fe2b8e-1bb4-455d-85fa-5cbbb409143b",
			authority: "https://login.microsoftonline.com/epita.fr",
			redirectUri: window.location.origin,
			postLogoutRedirectUri: window.location.origin,
		},
		cache: { cacheLocation: "localStorage" },
		system: { iframeBridgeTimeout: REDIRECT_TIMEOUT_MS },
	};

	const msalInstance = React.useRef(null);
	if (!msalInstance.current) msalInstance.current = new PublicClientApplication(msalConfig);
	const msalInitialization = React.useRef(null);
	const initializeMsal = React.useCallback(() => {
		if (!msalInitialization.current) {
			msalInitialization.current = msalInstance.current.initialize();
		}
		return msalInitialization.current;
	}, []);

	const initMsal = React.useCallback(async () => {
		try {
			await withDeadline(initializeMsal(), REDIRECT_TIMEOUT_MS);
			if (!navigator.onLine || loggingOut.current) return;

			setLoadingMessage("Finalisation de la connexion Microsoft…");
			const response = await withDeadline(msalInstance.current.handleRedirectPromise(REDIRECT_OPTIONS), REDIRECT_TIMEOUT_MS);
			if (response) {
				await exchangeToken(response);
			} else {
				failRedirect("La connexion Microsoft n’a pas abouti. Réessaie depuis cette page.");
			}
		} catch (err) {
			console.error("MSAL Redirect Error:", err);
			failRedirect("Connexion Microsoft indisponible. Réessaie depuis cette page.");
		} finally {
			setLoading(false);
		}
	}, [initializeMsal]);

	// Zeus only issues a session from a Microsoft access token (POST /api/User/OfficeLogin): there is no refresh endpoint.
	const requestZeusToken = async (accessToken) => {
		const res = await fetchApi(
			"/api/auth",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ accessToken }),
			},
			REDIRECT_TIMEOUT_MS
		);

		if (!res.ok) {
			throw new Error(`Le service de connexion est indisponible (HTTP ${res.status}).`);
		}

		const data = await res.json();
		if (!data.token) throw new Error(data.error || "Le service de connexion n’a pas renvoyé de session.");
		return data.token;
	};

	const saveSession = (token, account) => {
		lastUser.current = account;
		expired.current = false;
		setSessionExpired(false);
		setZeusToken(token);
		setUser(account);
		// The token goes last: other tabs follow its storage event and must find the user already there.
		localStorage.setItem("zeus_user", JSON.stringify(account));
		localStorage.setItem("zeus_token", token);
	};

	// `background` also allows Microsoft's own session through a hidden iframe (answered by the bridge in
	// main.jsx). Where that is blocked or Microsoft has no session, it only fails after iframeBridgeTimeout:
	// fine while nobody waits, too slow for a loading screen, which falls back to redirectToReconnect.
	const renewSession = React.useCallback(
		(background = false) => {
			// Single flight: the expiry timer and concurrent 401s share one Microsoft + Zeus round trip.
			if (!renewal.current) {
				renewal.current = (async () => {
					try {
						const username = lastUser.current?.username;
						if (!username || !navigator.onLine || loggingOut.current || expired.current) return null;
						await withDeadline(initializeMsal(), REDIRECT_TIMEOUT_MS);
						// MSAL's cache is unreadable after a browser restart: then only the iframe is left.
						const account = msalInstance.current.getAccount({ username });
						if (!account && !background) return null;
						const msResponse = await withDeadline(
							account
								? msalInstance.current.acquireTokenSilent({
										scopes: AUTH_SCOPES,
										account,
										// Cached token, then refresh token (24 h), then the iframe when allowed.
										cacheLookupPolicy: background ? CacheLookupPolicy.Default : CacheLookupPolicy.AccessTokenAndRefreshToken,
									})
								: msalInstance.current.ssoSilent({ scopes: AUTH_SCOPES, loginHint: username }),
							SILENT_TIMEOUT_MS
						);
						const token = await requestZeusToken(msResponse.accessToken);
						if (loggingOut.current) return null;
						// A fresh token that already looks expired means a wrong device clock: renewing again would loop.
						const expiresAt = getZeusTokenExpiresAt(token);
						if (expiresAt && expiresAt <= Date.now() + EXPIRY_LEEWAY_MS) return null;
						saveSession(token, msResponse.account);
						return token;
					} catch (err) {
						console.warn("Silent session renewal failed:", err);
						return null;
					}
				})().finally(() => {
					renewal.current = null;
				});
			}
			return renewal.current;
		},
		[initializeMsal]
	);

	// Last resort before the login page: a full-page prompt=none round trip. Microsoft's session cookie is
	// first-party there, so it also works where the iframe is blocked (Safari, Firefox).
	const redirectToReconnect = React.useCallback(() => {
		if (!reconnection.current) {
			reconnection.current = (async () => {
				try {
					const loginHint = lastUser.current?.username;
					if (!loginHint || !navigator.onLine || loggingOut.current || expired.current) return false;
					// One automatic round trip per cooldown: a session Zeus keeps rejecting must not loop.
					if (Date.now() - Number(sessionStorage.getItem(AUTO_RECONNECT_AT_KEY)) < AUTO_RECONNECT_COOLDOWN_MS) return false;
					sessionStorage.setItem(AUTO_RECONNECT_AT_KEY, String(Date.now()));
					setLoadingMessage(RENEWING_MESSAGE);
					setLoading(true);
					await withDeadline(initializeMsal(), REDIRECT_TIMEOUT_MS);
					// Drain a previously interrupted MSAL redirect before starting another one.
					await withDeadline(msalInstance.current.handleRedirectPromise(REDIRECT_OPTIONS), REDIRECT_TIMEOUT_MS);
					saveLoginAnalyticsFlow(AUTO_RECONNECT_FLOW);
					// Resolves only if the browser did not leave the page.
					await msalInstance.current.loginRedirect({ scopes: AUTH_SCOPES, loginHint, prompt: "none" });
				} catch (err) {
					console.warn("Automatic reconnection failed:", err);
				}
				consumeLoginAnalyticsFlow();
				setLoading(false);
				return false;
			})().finally(() => {
				reconnection.current = null;
			});
		}
		return reconnection.current;
	}, [initializeMsal]);

	// Microsoft answered a redirect with an error or nothing usable. After an automatic reconnection this
	// only means its session is gone too: show the login page, not an error.
	const failRedirect = (message) => {
		if (consumeLoginAnalyticsFlow()?.flow !== AUTO_RECONNECT_FLOW) return setError(message);
		trackEvent("auto_reconnect_failed");
		expireSession();
	};

	// After an expiry, go straight back to the same account instead of the account picker.
	const loginRequest = () => {
		const loginHint = lastUser.current?.username;
		return loginHint ? { scopes: AUTH_SCOPES, loginHint } : { scopes: AUTH_SCOPES, prompt: "select_account" };
	};

	const exchangeToken = async (msResponse, analyticsContext = null) => {
		if (loggingOut.current) return;
		setLoadingMessage("Connexion à Zeus…");
		try {
			const token = await requestZeusToken(msResponse.accessToken);
			if (loggingOut.current) return;
			saveSession(token, msResponse.account);
			const completedContext = analyticsContext || consumeLoginAnalyticsFlow();
			if (completedContext) trackEvent("login_completed", completedContext);
		} catch (err) {
			setError("Échec d'authentification Zeus: " + err.message);
			trackEvent("auth_exchange_failed", {
				mode: navigator.onLine ? "online" : "offline",
				error_kind: "exchange_failed",
			});
			console.error(err);
		}
	};

	const login = async () => {
		try {
			setLoading(true);
			setLoadingMessage("Préparation de la connexion Microsoft…");
			setError(null);
			loggingOut.current = false;
			await withDeadline(initializeMsal(), REDIRECT_TIMEOUT_MS);
			// Drain a previously interrupted MSAL redirect before starting another one.
			// MSAL replays the outcome of a redirect already handled on this page: a refused automatic
			// reconnection must not block the explicit login that follows it.
			const pendingResponse = await withDeadline(msalInstance.current.handleRedirectPromise(REDIRECT_OPTIONS).catch(() => null), REDIRECT_TIMEOUT_MS);
			if (pendingResponse) {
				await exchangeToken(pendingResponse);
				setLoading(false);
				return;
			}
			trackEvent("login_started", {
				flow: shouldUseRedirectAuth() ? "redirect" : "popup",
			});

			if (shouldUseRedirectAuth()) {
				setLoadingMessage("Redirection vers Microsoft…");
				saveLoginAnalyticsFlow("redirect");
				await msalInstance.current.loginRedirect(loginRequest());
				return;
			} else {
				setLoadingMessage("Connexion à Microsoft…");
				const resp = await msalInstance.current.loginPopup(loginRequest());
				await exchangeToken(resp, { flow: "popup" });
				setLoading(false);
			}
		} catch (err) {
			if (isPopupIssue(err)) {
				trackEvent("login_popup_issue_fallback_redirect");
				try {
					setLoadingMessage("Redirection vers Microsoft…");
					saveLoginAnalyticsFlow("redirect_after_popup_issue");
					await msalInstance.current.loginRedirect(loginRequest());
					return;
				} catch (redirectErr) {
					setError("Erreur connexion: " + redirectErr.message);
					trackEvent("login_failed", {
						flow: "redirect_after_popup_issue",
						error_kind: "redirect_error",
					});
					setLoading(false);
					return;
				}
			}
			console.error("Login failed:", err);
			setError("Erreur connexion: " + err.message);
			trackEvent("login_failed", {
				flow: shouldUseRedirectAuth() ? "redirect" : "popup",
				error_kind: "auth_error",
			});
			setLoading(false);
		}
	};

	const logout = async () => {
		trackEvent("logout_triggered", {
			flow: shouldUseRedirectAuth() ? "redirect" : "popup",
		});
		loggingOut.current = true;
		lastUser.current = null;
		expired.current = false;
		setSessionExpired(false);
		setUser(null);
		setZeusToken(null);
		clearSavedSession();
		try {
			await initializeMsal();
			if (shouldUseRedirectAuth()) await msalInstance.current.logoutRedirect();
			else await msalInstance.current.logoutPopup();
		} catch (err) {
			console.error("MSAL Logout Error:", err);
		}
	};

	// Keeps the user, the saved session and the cached schedules: only a logout sends back to the login page.
	// Once flagged, renewals and automatic reconnections stop until an explicit login.
	const expireSession = React.useCallback(() => {
		expired.current = true;
		setSessionExpired(true);
		setError(null);
	}, []);

	React.useEffect(() => {
		// While a redirect or reconnection is being processed, the session is about to be replaced anyway.
		if (!zeusToken || loading || sessionExpired) return;
		const expiresAt = getZeusTokenExpiresAt(zeusToken);
		const issuedAt = getZeusTokenIssuedAt(zeusToken);
		let stale = false;
		const checkSession = async () => {
			// Offline schedules remain accessible. Re-check when back online.
			if (!navigator.onLine) return;
			const now = Date.now();
			if (expiresAt && expiresAt <= now + EXPIRY_LEEWAY_MS) {
				// Not expired yet: nobody is waiting, the iframe may take its time.
				if ((await renewSession(expiresAt > now)) || stale) return;
				if (!(await redirectToReconnect()) && !stale) expireSession();
			} else if (issuedAt && now - Math.max(issuedAt, earlyRenewalTriedAt.current) > EARLY_RENEWAL_AFTER_MS) {
				// Best effort, in the background: a failure changes nothing and is not retried right away.
				earlyRenewalTriedAt.current = now;
				renewSession(true);
			}
		};
		const onVisibilityChange = () => {
			if (!document.hidden) checkSession();
		};
		checkSession();
		const delay = expiresAt ? Math.max(0, expiresAt - Date.now() - EXPIRY_LEEWAY_MS) : 0;
		const timer = delay > 0 ? setTimeout(checkSession, delay) : null;
		window.addEventListener("online", checkSession);
		document.addEventListener("visibilitychange", onVisibilityChange);
		return () => {
			stale = true;
			if (timer !== null) clearTimeout(timer);
			window.removeEventListener("online", checkSession);
			document.removeEventListener("visibilitychange", onVisibilityChange);
		};
	}, [zeusToken, loading, sessionExpired, expireSession, renewSession, redirectToReconnect]);

	React.useEffect(() => {
		setSessionRenewer(() => renewSession());
		return () => setSessionRenewer(null);
	}, [renewSession]);

	React.useEffect(() => {
		// Zeus rejected the token and the silent renewal did not help.
		const onSessionExpired = async () => {
			if (!(await redirectToReconnect())) expireSession();
		};
		window.addEventListener("epitime:session-expired", onSessionExpired);
		return () => window.removeEventListener("epitime:session-expired", onSessionExpired);
	}, [expireSession, redirectToReconnect]);

	React.useEffect(() => {
		// Another tab logged in, logged out or renewed the session: follow it.
		const onStorage = (event) => {
			if (event.key !== "zeus_token" && event.key !== null) return;
			const session = readSavedSession();
			if (session) lastUser.current = session.user;
			if (!session?.expired) {
				expired.current = false;
				setSessionExpired(false);
			}
			setUser(session?.user ?? null);
			setZeusToken(session?.token ?? null);
		};
		window.addEventListener("storage", onStorage);
		return () => window.removeEventListener("storage", onStorage);
	}, []);

	React.useEffect(() => {
		// Visiting the site never shows a Microsoft prompt on its own: it only finishes a real redirect,
		// or reconnects a saved session that expired (silently, else through a prompt=none round trip).
		if (startup.current) return;
		if (redirectCallback) startup.current = initMsal();
		else if (renewAtStartup) {
			startup.current = (async () => {
				// The second call only settles if the browser did not leave for Microsoft.
				if (!(await renewSession()) && !(await redirectToReconnect())) expireSession();
				setLoading(false);
			})();
		}
	}, [initMsal, redirectCallback, renewAtStartup, renewSession, redirectToReconnect, expireSession]);

	return <AuthContext.Provider value={{ user, zeusToken, sessionExpired, loading, loadingMessage, error, login, logout, initMsal }}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
