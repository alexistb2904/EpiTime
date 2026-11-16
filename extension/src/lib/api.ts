import { isValidEvent, type ZeusEvent } from "../../../shared/src/events.ts";

export type ApiErrorKind = "auth" | "network" | "invalid" | "server";

export class ApiError extends Error {
	kind: ApiErrorKind;
	status?: number;
	constructor(kind: ApiErrorKind, message: string, status?: number) {
		super(message);
		this.kind = kind;
		this.status = status;
	}
}

const TIMEOUT_MS = 15_000;

export async function fetchEvents(origin: string, token: string, groups: string[], start: Date, end: Date, fetcher: typeof fetch = fetch): Promise<ZeusEvent[]> {
	const params = new URLSearchParams({ start: start.toISOString(), end: end.toISOString() });
	for (const group of groups) params.append("groups", group);
	let response: Response;
	try {
		response = await fetcher(`${origin}/api/events?${params}`, {
			headers: { Authorization: `Bearer ${token}` },
			signal: AbortSignal.timeout(TIMEOUT_MS),
			credentials: "omit",
			cache: "no-store",
		});
	} catch (error) {
		throw new ApiError("network", (error as Error)?.name === "TimeoutError" ? "EpiTime ne répond pas." : "Réseau indisponible.");
	}
	if (response.status === 401 || response.status === 403) throw new ApiError("auth", "Session expirée.", response.status);
	if (!response.ok) throw new ApiError("server", `EpiTime ou Zeus indisponible (HTTP ${response.status}).`, response.status);
	let data: unknown;
	try {
		data = await response.json();
	} catch {
		throw new ApiError("invalid", "Réponse illisible.");
	}
	if (!Array.isArray(data)) throw new ApiError("invalid", "Réponse inattendue (mode hors ligne du serveur ?).");
	const events = data.filter(isValidEvent);

	if (data.length && !events.length) throw new ApiError("invalid", "Réponse incomplète.");
	return events;
}
