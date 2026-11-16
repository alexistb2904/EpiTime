import { openNotesStore } from "../../../shared/src/notes/store.ts";

export const notesStore = openNotesStore(indexedDB, { name: "epitime-notes", replicaPrefix: "ext" });

const channel = new BroadcastChannel("epitime-notes");
const listeners = new Set<(source: string) => void>();
channel.onmessage = (event) => listeners.forEach((listener) => listener(String(event.data)));

export function onNotesChanged(listener: (source: string) => void) {
	listeners.add(listener);
	return () => void listeners.delete(listener);
}

export function notesChanged(source: "local" | "sync" = "local") {
	listeners.forEach((listener) => listener(source));
	channel.postMessage(source === "local" ? "tab" : source);
}
