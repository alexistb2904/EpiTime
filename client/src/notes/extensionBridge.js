import { syncNotes } from "../../../shared/src/notes/sync.ts";
import { notesChanged, notesStore, onNotesChanged } from "./notesDb";

export const BRIDGE_PROTOCOL = 1;
const FROM_PAGE = "epitime-web";
const FROM_EXTENSION = "epitime-ext";

const pending = new Map();

window.addEventListener("message", (event) => {
	if (event.source !== window || event.origin !== window.location.origin) return;
	const data = event.data;
	if (!data || data.source !== FROM_EXTENSION || data.v !== BRIDGE_PROTOCOL) return;
	if (data.type === "changed") return void syncWithExtension();
	if (typeof data.id !== "string") return;
	const call = pending.get(data.id);
	if (!call) return;
	pending.delete(data.id);
	clearTimeout(call.timer);
	if (data.error) call.reject(new Error(String(data.error)));
	else call.resolve(data.payload);
});

function call(type, payload = null, timeoutMs = 15_000) {
	return new Promise((resolve, reject) => {
		const id = crypto.randomUUID();
		const timer = setTimeout(() => {
			pending.delete(id);
			reject(new Error("L'extension ne répond pas."));
		}, timeoutMs);
		pending.set(id, { resolve, reject, timer });
		window.postMessage({ source: FROM_PAGE, v: BRIDGE_PROTOCOL, id, type, payload }, window.location.origin);
	});
}

const peer = {
	pull: () => call("notes.pull"),
	push: (notes) => call("notes.push", { notes }),
	getAttachments: (ids) => call("attachments.get", { ids }, 120_000),
	putAttachments: (items) => call("attachments.put", { items }, 120_000),
};

let status = { installed: false, linked: false, browser: null, syncing: false, lastSync: null, error: null };
const statusListeners = new Set();
const setStatus = (patch) => {
	status = { ...status, ...patch };
	statusListeners.forEach((listener) => listener(status));
};
export const getExtensionStatus = () => status;
export function onExtensionStatus(listener) {
	statusListeners.add(listener);
	return () => statusListeners.delete(listener);
}

export async function detectExtension() {
	try {
		const hello = await call("hello", null, 3_000);
		setStatus({ installed: true, linked: Boolean(hello?.linked), browser: hello?.browser ?? null });
	} catch {
		setStatus({ installed: false, linked: false });
	}
	return status;
}

let running = null;
export function syncWithExtension() {
	running ??= (async () => {
		try {
			if (!(await detectExtension()).linked) return null;
			setStatus({ syncing: true, error: null });
			const result = await syncNotes(notesStore, peer);
			if (result.pulledChanges || result.receivedAttachments) notesChanged("sync");
			setStatus({ syncing: false, lastSync: Date.now() });
			return result;
		} catch (error) {
			setStatus({ syncing: false, error: error.message });
			return null;
		} finally {
			running = null;
		}
	})();
	return running;
}

export async function linkExtension() {
	await call("session.link", null, 5_000);
	setStatus({ linked: true });
	return syncWithExtension();
}

export async function unlinkExtension() {
	await call("session.unlink", null, 5_000);
	setStatus({ linked: false });
}

let started = false;
export function startExtensionSync() {
	if (started) return;
	started = true;
	let timer = null;
	const soon = (delay) => {
		clearTimeout(timer);
		timer = setTimeout(syncWithExtension, delay);
	};
	onNotesChanged((source) => {
		if (source === "local") soon(1_500);
	});
	document.addEventListener("visibilitychange", () => {
		if (!document.hidden) soon(200);
	});
	syncWithExtension();
}
