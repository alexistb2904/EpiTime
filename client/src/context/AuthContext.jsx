import React, { useState, useContext, createContext } from "react";
import { PublicClientApplication } from "@azure/msal-browser";
import { trackEvent } from "../utils/analyticsTracker";
import { fetchApi } from "../utils/api";
import { clearSavedSession, getZeusTokenExpiresAt, readSavedSession } from "../utils/authSession";

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
const EXPIRY_LEEWAY_MS = 30_000;

const hasMicrosoftRedirectResponse = () => {
	const search = new URLSearchParams(window.location.search);
	const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
	return [search, hash].some((params) => params.has("state") && (params.has("code") || params.has("error")));
};

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
	const [user, setUser] = useState(savedSession?.user ?? null);
	const [zeusToken, setZeusToken] = useState(savedSession?.token ?? null);
	const [loading, setLoading] = useState(redirectCallback);
	const [loadingMessage, setLoadingMessage] = useState("Préparation de la connexion Microsoft…");
	const [error, setError] = useState(null);
	const loggingOut = React.useRef(false);
	const startup = React.useRef(null);

	const msalConfig = {
		auth: {
			clientId: "e1fe2b8e-1bb4-455d-85fa-5cbbb409143b",
			authority: "https://login.microsoftonline.com/epita.fr",
			redirectUri: window.location.origin,
			postLogoutRedirectUri: window.location.origin,
			navigateToLoginRequestUrl: false,
		},
		cache: { cacheLocation: "localStorage", storeAuthStateInCookie: true },
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
			const response = await withDeadline(msalInstance.current.handleRedirectPromise(), REDIRECT_TIMEOUT_MS);
			if (response) {
				await exchangeToken(response);
			} else {
				setError("La connexion Microsoft n’a pas abouti. Réessaie depuis cette page.");
			}
		} catch (err) {
			console.error("MSAL Redirect Error:", err);
			setError("Connexion Microsoft indisponible. Réessaie depuis cette page.");
		} finally {
			setLoading(false);
		}
	}, [initializeMsal]);

	const exchangeToken = async (msResponse, analyticsContext = null) => {
		if (loggingOut.current) return;
		setLoadingMessage("Connexion à Zeus…");
		try {
			const res = await fetchApi("/api/auth", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ accessToken: msResponse.accessToken }),
			}, REDIRECT_TIMEOUT_MS);

			if (!res.ok) {
				throw new Error(`Le service de connexion est indisponible (HTTP ${res.status}).`);
			}

			const data = await res.json();
			if (!data.token) throw new Error(data.error || "Le service de connexion n’a pas renvoyé de session.");
			if (loggingOut.current) return;
			setZeusToken(data.token);
			setUser(msResponse.account);
			localStorage.setItem("zeus_token", data.token);
			localStorage.setItem("zeus_user", JSON.stringify(msResponse.account));
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
			await initializeMsal();
			trackEvent("login_started", {
				flow: shouldUseRedirectAuth() ? "redirect" : "popup",
			});

			if (shouldUseRedirectAuth()) {
				setLoadingMessage("Redirection vers Microsoft…");
				saveLoginAnalyticsFlow("redirect");
				await msalInstance.current.loginRedirect({
					scopes: AUTH_SCOPES,
					prompt: "select_account",
				});
				return;
			} else {
				setLoadingMessage("Connexion à Microsoft…");
				const resp = await msalInstance.current.loginPopup({
					scopes: AUTH_SCOPES,
					prompt: "select_account",
				});
				await exchangeToken(resp, { flow: "popup" });
				setLoading(false);
			}
		} catch (err) {
			if (isPopupIssue(err)) {
				trackEvent("login_popup_issue_fallback_redirect");
				try {
					setLoadingMessage("Redirection vers Microsoft…");
					saveLoginAnalyticsFlow("redirect_after_popup_issue");
					await msalInstance.current.loginRedirect({
						scopes: AUTH_SCOPES,
						prompt: "select_account",
					});
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

	const expireSession = React.useCallback(() => {
		clearSavedSession();
		setUser(null);
		setZeusToken(null);
		setError(null);
	}, []);

	React.useEffect(() => {
		if (!zeusToken) return;
		const expiresAt = getZeusTokenExpiresAt(zeusToken);
		const checkExpiry = () => {
			// Offline schedules remain accessible. Re-check when back online.
			if (navigator.onLine && expiresAt && expiresAt <= Date.now() + EXPIRY_LEEWAY_MS) expireSession();
		};
		const onVisibilityChange = () => {
			if (!document.hidden) checkExpiry();
		};
		checkExpiry();
		const delay = expiresAt ? Math.max(0, expiresAt - Date.now() - EXPIRY_LEEWAY_MS) : 0;
		const timer = delay > 0 ? setTimeout(checkExpiry, delay) : null;
		window.addEventListener("online", checkExpiry);
		document.addEventListener("visibilitychange", onVisibilityChange);
		return () => {
			if (timer !== null) clearTimeout(timer);
			window.removeEventListener("online", checkExpiry);
			document.removeEventListener("visibilitychange", onVisibilityChange);
		};
	}, [zeusToken, expireSession]);

	React.useEffect(() => {
		window.addEventListener("epitime:session-expired", expireSession);
		return () => window.removeEventListener("epitime:session-expired", expireSession);
	}, [expireSession]);

	React.useEffect(() => {
		// Only process a real Microsoft redirect. Visiting the site must never
		// initiate a silent Microsoft + Zeus login in the background.
		if (!redirectCallback || startup.current) return;
		startup.current = initMsal();
	}, [initMsal, redirectCallback]);

	return <AuthContext.Provider value={{ user, zeusToken, loading, loadingMessage, error, login, logout, initMsal }}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
