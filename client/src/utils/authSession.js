// Also the head start the silent renewal gets before Zeus starts answering 401.
export const EXPIRY_LEEWAY_MS = 60_000;

// Decode only date hints (seconds claims, returned in ms). Zeus still validates the token on every API call.
function readDateClaim(token, name) {
	if (typeof token !== "string" || token.split(".").length !== 3) return null;
	try {
		const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
		const value = JSON.parse(atob(payload))[name];
		return typeof value === "number" && Number.isFinite(value) && value > 0 ? value * 1000 : null;
	} catch {
		return null;
	}
}

export const getZeusTokenExpiresAt = (token) => readDateClaim(token, "exp");
export const getZeusTokenIssuedAt = (token) => readDateClaim(token, "iat");

/** True when the URL carries Microsoft's answer to a redirect or hidden-iframe request. */
export function hasMicrosoftRedirectResponse() {
	const search = new URLSearchParams(window.location.search);
	const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
	return [search, hash].some((params) => params.has("state") && (params.has("code") || params.has("error")));
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
		// No verified expiry => don't assume the token still works: it counts as expired.
		// The caller renews an expired session when online and keeps it for cached schedules offline.
		return { token, user, expiresAt, expired: !expiresAt || expiresAt <= Date.now() + EXPIRY_LEEWAY_MS };
	} catch {
		return null;
	}
}
