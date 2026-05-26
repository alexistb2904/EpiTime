import React, { createContext, useContext, useEffect, useState } from "react";
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
			await loginWithMicrosoft();
			setSession(await getSession());
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
