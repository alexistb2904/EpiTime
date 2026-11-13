const EXPIRY_LEEWAY_MS = 60_000;

const TERMINAL_OAUTH_ERRORS = ["invalid_grant", "interaction_required", "login_required", "consent_required", "invalid_client", "unauthorized_client"];

export function getZeusTokenExpiresAt(token: unknown) {
	if (typeof token !== "string" || token.split(".").length !== 3) return null;
	try {
		const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
		const { exp } = JSON.parse(atob(payload));
		return typeof exp === "number" && Number.isFinite(exp) && exp > 0 ? exp * 1000 : null;
	} catch {
		return null;
	}
}

export function isZeusTokenExpired(token: unknown, now = Date.now()) {
	const expiresAt = getZeusTokenExpiresAt(token);
	return expiresAt !== null && expiresAt <= now + EXPIRY_LEEWAY_MS;
}

export function isTerminalAuthFailure(error: unknown) {
	const { code, status } = (error ?? {}) as { code?: unknown; status?: unknown };
	return TERMINAL_OAUTH_ERRORS.includes(code as string) || status === 401 || status === 403;
}
