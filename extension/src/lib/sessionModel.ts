export const EXPIRY_LEEWAY_MS = 60_000;

export function readTokenExpiry(token: string): number | null {
	const parts = token.split(".");
	if (parts.length !== 3) return null;
	try {
		const json = atob(parts[1]!.replace(/-/g, "+").replace(/_/g, "/"));
		const exp = JSON.parse(json).exp;
		return typeof exp === "number" && Number.isFinite(exp) && exp > 0 ? exp * 1000 : null;
	} catch {
		return null;
	}
}

export const isSessionUsable = (session: { expiresAt: number | null } | null, now = Date.now()) => Boolean(session?.expiresAt && session.expiresAt > now + EXPIRY_LEEWAY_MS);

export type SessionPayload = {
	token: string;
	user: { username: string; name?: string };
	groups: string[];
	webPush: { enabled: boolean; minutesBefore: number; days: number[] };
	theme?: "light" | "dark";
};

const JWT = /^[\w-]+\.[\w-]+\.[\w-]+$/;

export function parseSessionPayload(raw: unknown): SessionPayload | null {
	if (!raw || typeof raw !== "object") return null;
	const value = raw as Record<string, unknown>;
	if (typeof value.token !== "string" || value.token.length > 8192 || !JWT.test(value.token)) return null;
	const user = value.user as Record<string, unknown> | null;
	if (!user || typeof user.username !== "string" || !user.username || user.username.length > 320) return null;
	const groups = Array.isArray(value.groups)
		? value.groups
				.filter((id) => typeof id === "string" || typeof id === "number")
				.map(String)
				.slice(0, 50)
		: [];
	const push = (value.webPush ?? {}) as Record<string, unknown>;
	const minutes = Number(push.minutesBefore);
	return {
		token: value.token,
		user: { username: user.username, name: typeof user.name === "string" ? user.name.slice(0, 200) : undefined },
		groups: groups.filter((id) => /^[\w-]{1,40}$/.test(id)),
		webPush: {
			enabled: push.enabled === true,
			minutesBefore: Number.isFinite(minutes) && minutes > 0 ? Math.min(1440, Math.trunc(minutes)) : 15,
			days: Array.isArray(push.days) ? push.days.filter((day): day is number => Number.isInteger(day) && day >= 0 && day <= 6) : [0, 1, 2, 3, 4, 5, 6],
		},
		theme: value.theme === "light" || value.theme === "dark" ? value.theme : undefined,
	};
}
