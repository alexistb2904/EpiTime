import type { ZeusEvent } from "../../../shared/src/events.ts";
import { browser } from "./platform";
import type { ChangeLog, Link, ScheduleState, Settings } from "./state";

export type ExtensionState = {
	link: Link | null;
	session: { usable: boolean; expiresAt: number | null };
	schedule: Omit<ScheduleState, "reference"> & { events: ZeusEvent[] };
	changes: ChangeLog;
	settings: Settings;
	linkRequested: boolean;
};

export type PageRequest =
	| { type: "state.get" }
	| { type: "schedule.refresh" }
	| { type: "settings.save"; settings: Settings }
	| { type: "changes.seen" }
	| { type: "changes.remove"; key: string; detectedAt: number }
	| { type: "changes.clear" }
	| { type: "link.request" }
	| { type: "link.remove" };

export type BridgeRequest =
	| { type: "bridge.hello" }
	| { type: "bridge.session"; payload: unknown; explicit: boolean }
	| { type: "bridge.unlink" }
	| { type: "bridge.notes.pull" }
	| { type: "bridge.notes.push"; notes: unknown[] }
	| { type: "bridge.attachments.get"; ids: string[] }
	| { type: "bridge.attachments.put"; items: unknown[] };

export type Reply<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

export async function ask<T>(request: PageRequest | BridgeRequest): Promise<T> {
	const reply = (await browser.runtime.sendMessage(request)) as Reply<T> | undefined;
	if (!reply) throw new Error("L'extension ne répond pas.");
	if (!reply.ok) throw new Error(reply.error);
	return reply.data;
}
