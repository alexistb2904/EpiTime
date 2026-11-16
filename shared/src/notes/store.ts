import { bump, compareVV, MAX_ATTACHMENT_BYTES, mergeNote, newId, NOTE_SCHEMA, parseNote, type AttachmentMeta, type Note } from "./model.ts";
import { createZip, readZip, type ZipEntry } from "./zip.ts";

const DB_VERSION = 1;
const NOTES = "notes";
const BLOBS = "attachments";
const META = "meta";

const ORPHAN_GRACE_MS = 3_600_000;
export const ARCHIVE_FORMAT = "epitime-notes";

type StoredBlob = { id: string; blob: Blob; createdAt: number };

export type SaveResult = { note: Note; conflictCopy: Note | null };

const promisify = <T>(request: IDBRequest<T>) =>
	new Promise<T>((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});

const done = (tx: IDBTransaction) =>
	new Promise<void>((resolve, reject) => {
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
		tx.onabort = () => reject(tx.error ?? new Error("Transaction annulée"));
	});

export function openNotesStore(factory: IDBFactory, options: { name: string; replicaPrefix: string; now?: () => number }) {
	const now = options.now ?? Date.now;
	let dbPromise: Promise<IDBDatabase> | null = null;
	const db = () =>
		(dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
			const request = factory.open(options.name, DB_VERSION);

			request.onupgradeneeded = (event) => {
				const database = request.result;
				if (event.oldVersion < 1) {
					const notes = database.createObjectStore(NOTES, { keyPath: "id" });
					notes.createIndex("courseKey", "course.key");
					notes.createIndex("subject", "course.subject");
					database.createObjectStore(BLOBS, { keyPath: "id" });
					database.createObjectStore(META);
				}
			};
			request.onsuccess = () => {
				request.result.onversionchange = () => request.result.close();
				resolve(request.result);
			};
			request.onerror = () => {
				dbPromise = null;
				reject(request.error);
			};
		}));

	let replicaPromise: Promise<string> | null = null;
	const replica = () =>
		(replicaPromise ??= (async () => {
			const tx = (await db()).transaction(META, "readwrite");
			const meta = tx.objectStore(META);
			let id = (await promisify(meta.get("replica"))) as string | undefined;
			if (!id) {
				id = `${options.replicaPrefix}-${newId().slice(0, 8)}`;
				meta.put(id, "replica");
			}
			await done(tx);
			return id;
		})());

	const all = async () => (await promisify((await db()).transaction(NOTES).objectStore(NOTES).getAll())) as Note[];
	const get = async (id: string) => (await promisify((await db()).transaction(NOTES).objectStore(NOTES).get(id))) as Note | undefined;

	async function gc() {
		const database = await db();
		const referenced = new Set((await all()).flatMap((note) => (note.deleted ? [] : note.attachments.map((attachment) => attachment.id))));
		const tx = database.transaction(BLOBS, "readwrite");
		const store = tx.objectStore(BLOBS);
		const blobs = (await promisify(store.getAll())) as StoredBlob[];
		for (const blob of blobs) if (!referenced.has(blob.id) && now() - blob.createdAt > ORPHAN_GRACE_MS) store.delete(blob.id);
		await done(tx);
	}

	async function write(notes: Note[]) {
		if (!notes.length) return;
		const tx = (await db()).transaction(NOTES, "readwrite");
		for (const note of notes) tx.objectStore(NOTES).put(note);
		await done(tx);
	}

	return {
		replica,
		all,
		get,

		async list() {
			return (await all()).filter((note) => !note.deleted).sort((a, b) => b.updatedAt - a.updatedAt);
		},

		async byCourse(courseKey: string) {
			const notes = (await promisify((await db()).transaction(NOTES).objectStore(NOTES).index("courseKey").getAll(courseKey))) as Note[];
			return notes.filter((note) => !note.deleted).sort((a, b) => a.createdAt - b.createdAt);
		},

		async bySubject(subject: string) {
			const notes = (await promisify((await db()).transaction(NOTES).objectStore(NOTES).index("subject").getAll(subject))) as Note[];
			return notes.filter((note) => !note.deleted).sort((a, b) => b.updatedAt - a.updatedAt);
		},

		async save(edited: Note): Promise<SaveResult> {
			const id = await replica();
			const mine: Note = { ...edited, schema: NOTE_SCHEMA, vv: bump(edited.vv, id), updatedAt: Math.max(now(), edited.updatedAt + 1) };
			const stored = await get(edited.id);
			if (!stored || compareVV(stored.vv, edited.vv) === "equal" || compareVV(stored.vv, edited.vv) === "older") {
				await write([mine]);
				await gc();
				return { note: mine, conflictCopy: null };
			}
			const { next, conflictCopy } = mergeNote(stored, mine);
			await write([next ?? stored, ...(conflictCopy ? [conflictCopy] : [])]);
			await gc();
			return { note: next ?? stored, conflictCopy };
		},

		async remove(noteId: string) {
			const stored = await get(noteId);
			if (!stored || stored.deleted) return;
			await write([{ ...stored, title: "", html: "", text: "", attachments: [], course: null, deleted: true, vv: bump(stored.vv, await replica()), updatedAt: now() }]);
			await gc();
		},

		async putAttachment(blob: Blob, name: string, id: string = newId()): Promise<AttachmentMeta> {
			if (blob.size > MAX_ATTACHMENT_BYTES) throw new Error(`Fichier trop lourd (${Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024)} Mo maximum).`);
			const tx = (await db()).transaction(BLOBS, "readwrite");
			tx.objectStore(BLOBS).put({ id, blob, createdAt: now() } satisfies StoredBlob);
			await done(tx);
			return { id, name: name.slice(0, 500) || "fichier", type: blob.type.slice(0, 200) || "application/octet-stream", size: blob.size };
		},

		async getAttachment(attachmentId: string) {
			const stored = (await promisify((await db()).transaction(BLOBS).objectStore(BLOBS).get(attachmentId))) as StoredBlob | undefined;
			return stored?.blob;
		},

		async missingAttachments() {
			const database = await db();
			const keys = new Set((await promisify(database.transaction(BLOBS).objectStore(BLOBS).getAllKeys())).map(String));
			return [...new Set((await all()).flatMap((note) => (note.deleted ? [] : note.attachments.map((attachment) => attachment.id))))].filter((id) => !keys.has(id));
		},

		async merge(remote: unknown[]) {
			const changed: Note[] = [];
			for (const raw of remote) {
				const incoming = parseNote(raw);
				if (!incoming) continue;
				const local = (await get(incoming.id)) ?? changed.find((note) => note.id === incoming.id);
				const { next, conflictCopy } = mergeNote(local, incoming);
				if (next) changed.push(next);
				if (conflictCopy && !(await get(conflictCopy.id))) changed.push(conflictCopy);
			}
			await write(changed);
			if (changed.length) await gc();
			return { changed: changed.length };
		},

		async exportArchive(): Promise<Uint8Array> {
			const notes = (await all()).filter((note) => !note.deleted);
			const entries: ZipEntry[] = [
				{
					name: "notes.json",
					data: new TextEncoder().encode(JSON.stringify({ format: ARCHIVE_FORMAT, schema: NOTE_SCHEMA, exportedAt: new Date(now()).toISOString(), notes }, null, 2)),
				},
			];
			for (const attachmentId of new Set(notes.flatMap((note) => note.attachments.map((attachment) => attachment.id)))) {
				const blob = await this.getAttachment(attachmentId);
				if (blob) entries.push({ name: `attachments/${attachmentId}`, data: new Uint8Array(await blob.arrayBuffer()) });
			}
			return createZip(entries);
		},

		async importArchive(bytes: Uint8Array) {
			const entries = readZip(bytes);
			const manifest = entries.find((entry) => entry.name === "notes.json");
			if (!manifest) throw new Error("Archive sans notes.json : ce n'est pas une sauvegarde EpiTime.");
			let parsed: { format?: unknown; notes?: unknown };
			try {
				parsed = JSON.parse(new TextDecoder().decode(manifest.data));
			} catch {
				throw new Error("notes.json illisible.");
			}
			if (parsed.format !== ARCHIVE_FORMAT || !Array.isArray(parsed.notes)) throw new Error("Ce fichier n'est pas une sauvegarde de notes EpiTime.");
			const notes = parsed.notes.map(parseNote).filter((note): note is Note => Boolean(note));
			for (const note of notes) {
				for (const attachment of note.attachments) {
					const entry = entries.find((item) => item.name === `attachments/${attachment.id}`);
					if (entry && !(await this.getAttachment(attachment.id))) {
						await this.putAttachment(new Blob([entry.data as BlobPart], { type: attachment.type }), attachment.name, attachment.id);
					}
				}
			}
			const { changed } = await this.merge(notes);
			return { notes: notes.length, changed };
		},
	};
}

export type NotesStore = ReturnType<typeof openNotesStore>;
