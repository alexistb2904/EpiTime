import { useCallback, useEffect, useState } from "react";

const OVERVIEW_ENDPOINT = "/api/analytics/overview";

export const useUniqueUsers = ({ enabled = true } = {}) => {
	const [users, setUsers] = useState(null);
	const [enabledAnalytics, setEnabledAnalytics] = useState(true);
	const [loading, setLoading] = useState(enabled);
	const [error, setError] = useState("");

	const fetchUniqueUsers = useCallback(async () => {
		if (!enabled) return;

		setLoading(true);
		setError("");
		try {
			const response = await fetch(OVERVIEW_ENDPOINT);
			const payload = await response.json();

			if (!response.ok) {
				throw new Error(payload?.error || "Impossible de récupérer les utilisateurs uniques");
			}

			setEnabledAnalytics(Boolean(payload?.enabled));
			setUsers(typeof payload?.users === "number" ? payload.users : null);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Erreur inconnue");
		} finally {
			setLoading(false);
		}
	}, [enabled]);

	useEffect(() => {
		if (!enabled) return;
		fetchUniqueUsers();
	}, [enabled, fetchUniqueUsers]);

	return {
		users,
		enabledAnalytics,
		loading,
		error,
		refresh: fetchUniqueUsers,
	};
};
