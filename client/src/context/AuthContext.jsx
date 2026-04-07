import React, { useState, useContext, createContext } from "react";
import { trackEvent } from "../utils/analyticsTracker";

const AuthContext = createContext();

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
	return isMobile() || isIOS() || isStandalonePWA();
};

const isPopupIssue = (err) => {
	if (!err) return false;
	const raw = `${err.errorCode || ""} ${err.message || ""}`.toLowerCase();
	return raw.includes("popup") || raw.includes("empty_window_error") || raw.includes("monitor_window_timeout");
};

const AUTH_SCOPES = ["openid", "profile", "User.Read"];

export const AuthProvider = ({ children }) => {
	const [user, setUser] = useState(null);
	const [zeusToken, setZeusToken] = useState(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState(null);

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

	const msalInstance = React.useRef(new msal.PublicClientApplication(msalConfig));

	const initMsal = React.useCallback(async () => {
		try {
			setLoading(true);

			if (!navigator.onLine) {
				const savedToken = localStorage.getItem("zeus_token");
				const savedUser = localStorage.getItem("zeus_user");
				if (savedToken && savedUser) {
					setZeusToken(savedToken);
					setUser(JSON.parse(savedUser));
					setLoading(false);
					return;
				}
			}

			const response = await msalInstance.current.handleRedirectPromise();

			if (response) {
				await exchangeToken(response);
			} else {
				const accounts = msalInstance.current.getAllAccounts();
				if (accounts.length > 0) {
					const account = accounts[0];
					const silentResp = await msalInstance.current
						.acquireTokenSilent({
							scopes: AUTH_SCOPES,
							account,
						})
						.catch(() => null);

					if (silentResp) {
						await exchangeToken(silentResp);
					}
				}
			}
			setLoading(false);
		} catch (err) {
			console.error("MSAL Init Error:", err);
			if (!navigator.onLine) {
				const savedToken = localStorage.getItem("zeus_token");
				const savedUser = localStorage.getItem("zeus_user");
				if (savedToken && savedUser) {
					setZeusToken(savedToken);
					setUser(JSON.parse(savedUser));
				}
			}
			setLoading(false);
		}
	}, []);

	const exchangeToken = async (msResponse) => {
		try {
			const res = await fetch("/api/auth", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ accessToken: msResponse.accessToken }),
			});

			if (!res.ok && !navigator.onLine) {
				console.log("Mode hors ligne détecté, conservation de la session");
				const savedToken = localStorage.getItem("zeus_token");
				const savedUser = localStorage.getItem("zeus_user");
				if (savedToken && savedUser) {
					setZeusToken(savedToken);
					setUser(JSON.parse(savedUser));
					return;
				}
			}

			const data = await res.json();
			if (data.token) {
				setZeusToken(data.token);
				setUser(msResponse.account);
				localStorage.setItem("zeus_token", data.token);
				localStorage.setItem("zeus_user", JSON.stringify(msResponse.account));
				trackEvent("auth_exchange_success", {
					mode: navigator.onLine ? "online" : "offline_cache",
				});
			}
		} catch (err) {
			if (!navigator.onLine) {
				console.log("Mode hors ligne détecté lors de l'erreur, tentative de récupération du cache");
				const savedToken = localStorage.getItem("zeus_token");
				const savedUser = localStorage.getItem("zeus_user");
				if (savedToken && savedUser) {
					setZeusToken(savedToken);
					setUser(JSON.parse(savedUser));
					return;
				}
			}
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
			setError(null);
			trackEvent("login_started", {
				flow: shouldUseRedirectAuth() ? "redirect" : "popup",
			});

			if (shouldUseRedirectAuth()) {
				trackEvent("login_redirect_triggered", { reason: "mobile_or_pwa" });
				await msalInstance.current.loginRedirect({
					scopes: AUTH_SCOPES,
					prompt: "select_account",
				});
				return;
			} else {
				const resp = await msalInstance.current.loginPopup({
					scopes: AUTH_SCOPES,
					prompt: "select_account",
				});
				await exchangeToken(resp);
				trackEvent("login_popup_success");
				setLoading(false);
			}
		} catch (err) {
			if (isPopupIssue(err)) {
				trackEvent("login_popup_issue_fallback_redirect");
				try {
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

	const logout = () => {
		trackEvent("logout_triggered", {
			flow: shouldUseRedirectAuth() ? "redirect" : "popup",
		});
		if (shouldUseRedirectAuth()) {
			msalInstance.current.logoutRedirect();
		} else {
			msalInstance.current.logoutPopup();
		}
		setUser(null);
		setZeusToken(null);
		localStorage.removeItem("zeus_token");
		localStorage.removeItem("zeus_user");
	};

	React.useEffect(() => {
		initMsal();
	}, [initMsal]);

	return <AuthContext.Provider value={{ user, zeusToken, loading, error, login, logout, initMsal }}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
