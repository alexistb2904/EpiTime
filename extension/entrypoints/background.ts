import { servePeer } from "../../shared/src/notes/sync.ts";
import { base64ToBlob, blobToBase64, type WireAttachment } from "../src/lib/bytes";
import type { BridgeRequest, ExtensionState, PageRequest, Reply } from "../src/lib/messages";
import { notesChanged, notesStore } from "../src/lib/notes";
import { DEFAULT_ORIGIN } from "../src/lib/origins";
import { browser, BROWSER_NAME, isExtensionPage, isTrustedContentScript, openWebApp } from "../src/lib/platform";
import { clearChangeNotifications, ensureSyncAlarm, fireReminder, isReminderAlarm, openFromNotification, refreshSchedule, scheduleReminders, SYNC_ALARM, updateBadge } from "../src/lib/scheduler";
import { isSessionUsable, parseSessionPayload, readTokenExpiry } from "../src/lib/sessionModel";
import { getLocal, getSession, getSettings, migrateSettings, setLocal, setSession, type Link } from "../src/lib/state";

const LINK_REQUEST_TTL_MS = 15 * 60_000;
const peer = servePeer(notesStore);

export default defineBackground(() => {
	browser.runtime.onInstalled.addListener(() => void ensureSyncAlarm().then(refreshSchedule));
	browser.runtime.onStartup.addListener(() => void ensureSyncAlarm().then(refreshSchedule));
	browser.alarms.onAlarm.addListener((alarm) => {
		if (alarm.name === SYNC_ALARM) void refreshSchedule();
		else if (isReminderAlarm(alarm.name)) void fireReminder(alarm.name);
	});
	browser.notifications.onClicked.addListener((id) => void openFromNotification(id));
	browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
		const request = message as PageRequest | BridgeRequest;
		const handler = isExtensionPage(sender)
			? handlePage(request as PageRequest)
			: isTrustedContentScript(sender)
				? handleBridge(request as BridgeRequest, new URL(sender.url!).origin)
				: null;
		if (!handler) return false;
		handler.then(
			(data) => sendResponse({ ok: true, data } satisfies Reply),
			(error: Error) => sendResponse({ ok: false, error: error?.message || "Erreur inconnue" } satisfies Reply)
		);

		return true;
	});
	void ensureSyncAlarm();
});

async function buildState(): Promise<ExtensionState> {
	const [link, session, schedule, changes, settings, linkRequestedAt] = await Promise.all([
		getLocal("link"),
		getSession(),
		getLocal("schedule"),
		getLocal("changes"),
		getSettings(),
		getLocal("linkRequestedAt"),
	]);
	const { reference, ...rest } = schedule;
	return {
		link,
		session: { usable: isSessionUsable(session), expiresAt: session?.expiresAt ?? null },
		schedule: { ...rest, events: reference?.events ?? [] },
		changes,
		settings,
		linkRequested: Boolean(linkRequestedAt && Date.now() - linkRequestedAt < LINK_REQUEST_TTL_MS),
	};
}

async function handlePage(request: PageRequest): Promise<unknown> {
	switch (request.type) {
		case "state.get":
			return buildState();
		case "schedule.refresh":
			await refreshSchedule();
			return buildState();
		case "settings.save": {
			await setLocal("settings", migrateSettings(request.settings));
			await ensureSyncAlarm();
			await scheduleReminders();
			return buildState();
		}
		case "changes.seen": {
			const changes = await getLocal("changes");
			await setLocal("changes", { ...changes, unseen: 0 });
			await updateBadge();
			return buildState();
		}
		case "changes.remove": {
			const changes = await getLocal("changes");
			await setLocal("changes", { ...changes, items: changes.items.filter((item) => item.key !== request.key || item.detectedAt !== request.detectedAt) });
			return buildState();
		}
		case "changes.clear": {
			const changes = await getLocal("changes");
			await setLocal("changes", { ...changes, items: [], unseen: 0 });
			await clearChangeNotifications();
			await updateBadge();
			return buildState();
		}
		case "link.request": {
			await setLocal("linkRequestedAt", Date.now());
			const link = await getLocal("link");
			await openWebApp(link?.origin ?? DEFAULT_ORIGIN);
			return buildState();
		}
		case "link.remove":
			await unlink();
			return buildState();
	}
	throw new Error("Requête inconnue");
}

async function unlink() {
	await setSession(null);
	await setLocal("link", null);
	await setLocal("schedule", { reference: null, lastSync: null, lastError: null, pendingSuspicious: null });
	await setLocal("changes", { items: [], unseen: 0, notifiedKeys: [] });
	await scheduleReminders();
	await updateBadge();
}

async function requireLink(origin: string) {
	const link = await getLocal("link");
	if (!link || link.origin !== origin) throw new Error("Extension non associée à ce site.");
	return link;
}

async function handleBridge(request: BridgeRequest, origin: string): Promise<unknown> {
	switch (request.type) {
		case "bridge.hello": {
			const [link, linkRequestedAt] = await Promise.all([getLocal("link"), getLocal("linkRequestedAt")]);
			return {
				linked: link?.origin === origin,
				linkRequested: Boolean(linkRequestedAt && Date.now() - linkRequestedAt < LINK_REQUEST_TTL_MS),
				browser: BROWSER_NAME,
				version: browser.runtime.getManifest().version,
			};
		}
		case "bridge.session": {
			const [link, linkRequestedAt] = await Promise.all([getLocal("link"), getLocal("linkRequestedAt")]);
			const requested = request.explicit || Boolean(linkRequestedAt && Date.now() - linkRequestedAt < LINK_REQUEST_TTL_MS);
			if (!requested && link?.origin !== origin) throw new Error("Association non demandée.");
			const payload = parseSessionPayload(request.payload);
			if (!payload) throw new Error("Connecte-toi à EpiTime avant d'associer l'extension.");
			const expiresAt = readTokenExpiry(payload.token);
			const now = Date.now();
			const next: Link = {
				origin,
				user: payload.user,
				groups: payload.groups,
				webPush: payload.webPush,
				theme: payload.theme,
				linkedAt: link?.origin === origin ? link.linkedAt : now,
				updatedAt: now,
			};
			const previous = await getSession();
			const groupsChanged = link?.groups.join(",") !== next.groups.join(",");
			await setLocal("link", next);
			await setLocal("linkRequestedAt", null);
			if (isSessionUsable({ expiresAt }, now)) await setSession({ token: payload.token, expiresAt });

			if (previous?.token !== payload.token || groupsChanged) void refreshSchedule();
			else await scheduleReminders();
			await updateBadge();
			return { linked: true };
		}
		case "bridge.unlink":
			await requireLink(origin);
			await unlink();
			return { linked: false };
		case "bridge.notes.pull":
			await requireLink(origin);
			return peer.pull();
		case "bridge.notes.push": {
			await requireLink(origin);
			if (!Array.isArray(request.notes) || request.notes.length > 20_000) throw new Error("Notes invalides.");
			const result = await peer.push(request.notes);
			notesChanged("sync");
			return result;
		}
		case "bridge.attachments.get": {
			await requireLink(origin);
			const ids = Array.isArray(request.ids) ? request.ids.filter((id): id is string => typeof id === "string").slice(0, 50) : [];
			const items = await peer.getAttachments(ids);
			return Promise.all(items.map(async (item) => ({ id: item.id, name: item.name, type: item.type, data: await blobToBase64(item.blob) }) satisfies WireAttachment));
		}
		case "bridge.attachments.put": {
			await requireLink(origin);
			const items = (Array.isArray(request.items) ? request.items : [])
				.filter((item): item is WireAttachment => {
					const value = item as WireAttachment;
					return typeof value?.id === "string" && typeof value.name === "string" && typeof value.type === "string" && typeof value.data === "string";
				})
				.map((item) => ({ id: item.id, name: item.name, type: item.type, blob: base64ToBlob(item.data, item.type) }));
			await peer.putAttachments(items);
			notesChanged("sync");
			return null;
		}
	}
	throw new Error("Requête inconnue");
}
