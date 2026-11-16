import { openNotesStore } from "../../../shared/src/notes/store.ts";

export const notesStore = openNotesStore(indexedDB, { name: "epitime-notes", replicaPrefix: "web" });

const listeners = new Set();
const channel = typeof BroadcastChannel === "function" ? new BroadcastChannel("epitime-notes") : null;
if (channel) channel.onmessage = () => listeners.forEach((listener) => listener("tab"));

export function onNotesChanged(listener) {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function notesChanged(source = "local") {
	listeners.forEach((listener) => listener(source));
	channel?.postMessage(source);
}
