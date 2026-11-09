const EXPIRY_LEEWAY_MS = 30_000;

// Decode only the expiry hint. Zeus still validates the token on every API call.
export function getZeusTokenExpiresAt(token) {
	if (typeof token !== "string" || token.split(".").length !== 3) return null;
	try {
		const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
		const { exp } = JSON.parse(atob(payload));
		return typeof exp === "number" && Number.isFinite(exp) && exp > 0 ? exp * 1000 : null;
	} catch {
		return null;
	}
}

export function clearSavedSession() {
	localStorage.removeItem("zeus_token");
	localStorage.removeItem("zeus_user");
}

export function readSavedSession() {
	try {
		const token = localStorage.getItem("zeus_token");
		const user = JSON.parse(localStorage.getItem("zeus_user"));
		if (!token || typeof user?.username !== "string" || !user.username) return null;

		const expiresAt = getZeusTokenExpiresAt(token);
		// No verified expiry => don't assume the session can be restored online.
		// Keep offline access to locally cached schedules until connectivity returns.
		if (navigator.onLine && (!expiresAt || expiresAt <= Date.now() + EXPIRY_LEEWAY_MS)) {
			clearSavedSession();
			return null;
		}
		return { token, user, expiresAt };
	} catch {
		return null;
	}
}
