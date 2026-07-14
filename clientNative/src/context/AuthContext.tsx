import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "react-native";
import { getSession, clearSession } from "../services/storage";
import { loginWithMicrosoft } from "../services/auth";
import { unregisterExpoPushToken } from "../services/api";
import { getExistingPushToken } from "../services/notifications";
import { Session } from "../types";
type C = {
	session: Session | null;
	loading: boolean;
	login: () => Promise<void>;
	logout: () => Promise<void>;
	handleAuthExpired: () => Promise<void>;
};
const AuthContext = createContext<C | null>(null);

async function unregisterCurrentDevicePush(session: Session | null) {
	const account = session?.account as { id?: string; userPrincipalName?: string; mail?: string | null } | null | undefined;
	const userId = account?.id || account?.userPrincipalName || account?.mail || "";
	if (!userId) return;
	const token = await getExistingPushToken();
	if (token) await unregisterExpoPushToken(token, userId);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
	const [session, setSession] = useState<Session | null>(null);
	const [loading, setLoading] = useState(true);
	const authExpiredPromptedRef = useRef(false);
	useEffect(() => {
		getSession()
			.then(setSession)
			.finally(() => setLoading(false));
	}, []);

	useEffect(() => {
		if (session) authExpiredPromptedRef.current = false;
	}, [session]);
	const login = useCallback(async () => {
		setLoading(true);

		try {
			const nextSession = await loginWithMicrosoft();

			if (!nextSession) {
				throw new Error("Connexion réussie, mais aucune session locale n'a été sauvegardée.");
			}

			setSession(nextSession);
		} catch (error) {
			const message = error instanceof Error ? error.message : "Erreur inconnue pendant la connexion.";

			console.error("[AUTH] Login failed:", error);
			Alert.alert("Connexion impossible", message);
		} finally {
			setLoading(false);
		}
	}, []);

	const logout = useCallback(async () => {
		await unregisterCurrentDevicePush(session).catch(() => {});
		await clearSession();
		setSession(null);
	}, [session]);

	const handleAuthExpired = useCallback(async () => {
		await unregisterCurrentDevicePush(session).catch(() => {});
		await clearSession();
		setSession(null);
		if (authExpiredPromptedRef.current) return;
		authExpiredPromptedRef.current = true;
		Alert.alert("Session expirée", "Reconnecte-toi pour continuer.");
	}, [session]);

	const value = useMemo(() => ({ session, loading, login, logout, handleAuthExpired }), [handleAuthExpired, loading, login, logout, session]);
	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() {
	const v = useContext(AuthContext);
	if (!v) throw new Error("useAuth hors AuthProvider");
	return v;
}
