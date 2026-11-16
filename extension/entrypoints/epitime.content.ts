import { isBlobLike } from "../../shared/src/notes/sync.ts";
import { base64ToBlob, blobToBase64, type WireAttachment } from "../src/lib/bytes";
import { ask } from "../src/lib/messages";
import { PROD_ORIGINS } from "../src/origins";

const PROTOCOL = 1;
const FROM_PAGE = "epitime-web";
const FROM_EXTENSION = "epitime-ext";
const SESSION_POLL_MS = 30_000;

type PageMessage = { source: string; v: number; id: string; type: string; payload: unknown };

const readJson = (key: string) => {
	try {
		return JSON.parse(localStorage.getItem(key) ?? "null");
	} catch {
		return null;
	}
};

function readSiteSession() {
	const token = localStorage.getItem("zeus_token");
	const user = readJson("zeus_user");
	if (!token || !user?.username) return null;
	const push = readJson("notification-settings") ?? {};
	return {
		token,
		user: { username: user.username, name: user.name },
		groups: readJson("zeus_selected_groups") ?? [],
		webPush: { enabled: push.enabled === true, minutesBefore: push.minuesBefore ?? push.minutesBefore ?? 15, days: push.selectedDays },
		theme: localStorage.getItem("zeus_theme"),
	};
}

export default defineContentScript({
	matches: PROD_ORIGINS.map((origin) => `${origin}/*`),
	runAt: "document_idle",
	main() {
		let linked = false;
		let lastSent = "";

		const pushSession = async (explicit: boolean) => {
			const session = readSiteSession();
			if (!session) {
				if (explicit) throw new Error("Connecte-toi à EpiTime avant d'associer l'extension.");
				return;
			}
			const fingerprint = JSON.stringify([session.token, session.groups, session.webPush, session.theme]);
			if (!explicit && fingerprint === lastSent) return;
			await ask({ type: "bridge.session", payload: session, explicit });
			lastSent = fingerprint;
			linked = true;
		};

		const follow = async () => {
			try {
				const hello = await ask<{ linked: boolean; linkRequested: boolean }>({ type: "bridge.hello" });
				linked = hello.linked;
				if (hello.linked || hello.linkRequested) await pushSession(false);
			} catch {}
		};
		void follow();
		setInterval(() => linked && void pushSession(false).catch(() => undefined), SESSION_POLL_MS);
		window.addEventListener("storage", (event) => {
			if (linked && (event.key === "zeus_token" || event.key === "zeus_selected_groups" || event.key === null)) void pushSession(false).catch(() => undefined);
		});
		document.addEventListener("visibilitychange", () => !document.hidden && void follow());

		const handlers: Record<string, (payload: unknown) => Promise<unknown>> = {
			hello: () => ask({ type: "bridge.hello" }),
			"session.link": async () => {
				await pushSession(true);
				return { linked: true };
			},
			"session.unlink": async () => {
				linked = false;
				lastSent = "";
				return ask({ type: "bridge.unlink" });
			},
			"notes.pull": () => ask({ type: "bridge.notes.pull" }),
			"notes.push": (payload) => ask({ type: "bridge.notes.push", notes: (payload as { notes?: unknown[] })?.notes ?? [] }),
			"attachments.get": async (payload) => {
				const items = await ask<WireAttachment[]>({ type: "bridge.attachments.get", ids: (payload as { ids?: string[] })?.ids ?? [] });
				return items.map((item) => ({ id: item.id, name: item.name, type: item.type, blob: base64ToBlob(item.data, item.type) }));
			},
			"attachments.put": async (payload) => {
				const items = ((payload as { items?: unknown[] })?.items ?? []).filter((item): item is { id: string; name: string; type: string; blob: Blob } =>
					isBlobLike((item as { blob?: unknown })?.blob)
				);
				const wire = await Promise.all(
					items.map(async (item) => ({ id: String(item.id), name: String(item.name), type: String(item.type), data: await blobToBase64(item.blob) }))
				);
				return ask({ type: "bridge.attachments.put", items: wire });
			},
		};

		window.addEventListener("message", (event: MessageEvent<PageMessage>) => {
			if (event.source !== window || event.origin !== window.location.origin) return;
			const data = event.data;
			if (!data || data.source !== FROM_PAGE || data.v !== PROTOCOL || typeof data.id !== "string" || data.id.length > 100) return;
			const handler = Object.hasOwn(handlers, data.type) ? handlers[data.type] : null;
			const reply = (body: { payload?: unknown; error?: string }) =>
				window.postMessage({ source: FROM_EXTENSION, v: PROTOCOL, id: data.id, ...body }, window.location.origin);
			if (!handler) return reply({ error: "Requête inconnue" });
			handler(data.payload).then(
				(payload) => reply({ payload }),
				(error: Error) => reply({ error: error?.message || "Erreur de l'extension" })
			);
		});
	},
});
