import React, { useState, useContext, createContext } from 'react';

const AuthContext = createContext();

const isMobile = () => {
	return (
		/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
		(navigator.maxTouchPoints && navigator.maxTouchPoints > 2 && /MacIntel/.test(navigator.platform))
	);
};

export const AuthProvider = ({ children }) => {
	const [user, setUser] = useState(null);
	const [zeusToken, setZeusToken] = useState(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState(null);

	const msalConfig = {
		auth: {
			clientId: 'e1fe2b8e-1bb4-455d-85fa-5cbbb409143b',
			authority: 'https://login.microsoftonline.com/epita.fr',
			redirectUri: window.location.origin,
		},
		cache: { cacheLocation: 'localStorage', storeAuthStateInCookie: true },
	};

	const msalInstance = React.useRef(new msal.PublicClientApplication(msalConfig));

	const initMsal = React.useCallback(async () => {
		try {
			setLoading(true);

			if (!navigator.onLine) {
				const savedToken = localStorage.getItem('zeus_token');
				const savedUser = localStorage.getItem('zeus_user');
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
							scopes: ['openid', 'profile', 'User.Read'],
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
			console.error('MSAL Init Error:', err);
			if (!navigator.onLine) {
				const savedToken = localStorage.getItem('zeus_token');
				const savedUser = localStorage.getItem('zeus_user');
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
			const res = await fetch('/api/auth', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ accessToken: msResponse.accessToken }),
			});

			if (!res.ok && !navigator.onLine) {
				console.log('Mode hors ligne détecté, conservation de la session');
				const savedToken = localStorage.getItem('zeus_token');
				const savedUser = localStorage.getItem('zeus_user');
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
				localStorage.setItem('zeus_token', data.token);
				localStorage.setItem('zeus_user', JSON.stringify(msResponse.account));
			}
		} catch (err) {
			if (!navigator.onLine) {
				console.log("Mode hors ligne détecté lors de l'erreur, tentative de récupération du cache");
				const savedToken = localStorage.getItem('zeus_token');
				const savedUser = localStorage.getItem('zeus_user');
				if (savedToken && savedUser) {
					setZeusToken(savedToken);
					setUser(JSON.parse(savedUser));
					return;
				}
			}
			setError("Échec d'authentification Zeus: " + err.message);
			console.error(err);
		}
	};

	const login = async () => {
		try {
			setLoading(true);

			if (isMobile()) {
				await msalInstance.current.loginRedirect({
					scopes: ['openid', 'profile', 'User.Read'],
					prompt: 'select_account',
				});
			} else {
				const resp = await msalInstance.current.loginPopup({
					scopes: ['openid', 'profile', 'User.Read'],
					prompt: 'select_account',
				});
				await exchangeToken(resp);
				setLoading(false);
			}
		} catch (err) {
			setError('Erreur connexion: ' + err.message);
			setLoading(false);
		}
	};

	const logout = () => {
		if (isMobile()) {
			msalInstance.current.logoutRedirect();
		} else {
			msalInstance.current.logoutPopup();
		}
		setUser(null);
		setZeusToken(null);
		localStorage.removeItem('zeus_token');
		localStorage.removeItem('zeus_user');
	};

	React.useEffect(() => {
		initMsal();
	}, [initMsal]);

	return <AuthContext.Provider value={{ user, zeusToken, loading, error, login, logout, initMsal }}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
