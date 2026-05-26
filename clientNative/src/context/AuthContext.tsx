import React, { createContext, useContext, useEffect, useState } from "react";
import { Alert } from "react-native";
import { getSession, clearSession } from "../services/storage";
import { loginWithMicrosoft } from "../services/auth";
import { Session } from "../types";
type C = { session: Session | null; loading: boolean; login: () => Promise<void>; logout: () => Promise<void> };
const AuthContext = createContext<C | null>(null);
export function AuthProvider({ children }: { children: React.ReactNode }) {
	const [session, setSession] = useState<Session | null>(null);
	const [loading, setLoading] = useState(true);
	useEffect(() => {
		getSession()
			.then(setSession)
			.finally(() => setLoading(false));
	}, []);
	async function login() {
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
	}
	async function logout() {
		await clearSession();
		setSession(null);
	}
	return <AuthContext.Provider value={{ session, loading, login, logout }}>{children}</AuthContext.Provider>;
}
export function useAuth() {
	const v = useContext(AuthContext);
	if (!v) throw new Error("useAuth hors AuthProvider");
	return v;
}
