import type { NotesStore } from "./store.ts";

export type AttachmentPayload = { id: string; name: string; type: string; blob: Blob };

export type NotesPeer = {
	pull(): Promise<unknown[]>;

	push(notes: unknown[]): Promise<{ missing: string[] }>;
	getAttachments(ids: string[]): Promise<AttachmentPayload[]>;
	putAttachments(items: AttachmentPayload[]): Promise<void>;
};

const BATCH_BYTES = 8 * 1024 * 1024;

export const isBlobLike = (value: unknown): value is Blob => typeof (value as Blob)?.arrayBuffer === "function" && typeof (value as Blob)?.size === "number";

async function inBatches<T extends { blob: Blob }>(items: T[], send: (batch: T[]) => Promise<unknown>) {
	let batch: T[] = [];
	let size = 0;
	for (const item of items) {
		if (batch.length && size + item.blob.size > BATCH_BYTES) {
			await send(batch);
			batch = [];
			size = 0;
		}
		batch.push(item);
		size += item.blob.size;
	}
	if (batch.length) await send(batch);
}

export async function syncNotes(store: NotesStore, peer: NotesPeer) {
	const pulled = await store.merge(await peer.pull());
	const { missing } = await peer.push(await store.all());

	const notes = await store.all();
	const meta = new Map(notes.flatMap((note) => note.attachments).map((attachment) => [attachment.id, attachment]));
	const outgoing: AttachmentPayload[] = [];
	for (const id of missing) {
		const blob = await store.getAttachment(id);
		const attachment = meta.get(id);
		if (blob && attachment) outgoing.push({ id, name: attachment.name, type: attachment.type, blob });
	}
	await inBatches(outgoing, (batch) => peer.putAttachments(batch));

	const wanted = await store.missingAttachments();
	let received = 0;
	for (let i = 0; i < wanted.length; i += 10) {
		for (const item of await peer.getAttachments(wanted.slice(i, i + 10))) {
			if (!wanted.includes(item.id) || !isBlobLike(item.blob)) continue;
			await store.putAttachment(item.blob, item.name, item.id);
			received++;
		}
	}
	return { pulledChanges: pulled.changed, sentAttachments: outgoing.length, receivedAttachments: received };
}

export function servePeer(store: NotesStore): NotesPeer {
	return {
		pull: () => store.all(),
		async push(notes) {
			await store.merge(notes);
			return { missing: await store.missingAttachments() };
		},
		async getAttachments(ids) {
			const notes = await store.all();
			const meta = new Map(notes.flatMap((note) => note.attachments).map((attachment) => [attachment.id, attachment]));
			const items: AttachmentPayload[] = [];
			for (const id of ids.slice(0, 50)) {
				const blob = await store.getAttachment(id);
				const attachment = meta.get(id);
				if (blob && attachment) items.push({ id, name: attachment.name, type: attachment.type, blob });
			}
			return items;
		},
		async putAttachments(items) {
			const wanted = new Set(await store.missingAttachments());
			for (const item of items) if (wanted.has(item.id) && isBlobLike(item.blob)) await store.putAttachment(item.blob, item.name, item.id);
		},
	};
}
