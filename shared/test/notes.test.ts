
process.env.TZ = "Europe/Paris";
import assert from "node:assert/strict";
import { test } from "node:test";
import { IDBFactory } from "fake-indexeddb";
import { DOMParser } from "linkedom";
import { compareVV, courseRefOf, createNote, matchesSearch, mergeNote, parseNote, type Note } from "../src/notes/model.ts";
import { noteHtmlToText, sanitizeNoteHtml } from "../src/notes/sanitize.ts";
import { openNotesStore } from "../src/notes/store.ts";
import { servePeer, syncNotes } from "../src/notes/sync.ts";
import { createZip, readZip } from "../src/notes/zip.ts";

const parse = (html: string) => new DOMParser().parseFromString(`<html>${html}</html>`, "text/html") as unknown as Document;
let clock = 1_000_000;
const tick = () => (clock += 1000);
const store = (prefix: string) => openNotesStore(new IDBFactory(), { name: "notes", replicaPrefix: prefix, now: tick });
const algo = courseRefOf({ idReservation: 42, name: "Algorithmique", startDate: "2026-11-16T09:00:00Z", endDate: "2026-11-16T11:00:00Z", rooms: [{ name: "P204" }] });
const edit = (note: Note, title: string): Note => ({ ...note, title, html: `<p>${title}</p>`, text: title });

test("vecteurs de versions", () => {
	assert.equal(compareVV({ a: 1 }, { a: 1 }), "equal");
	assert.equal(compareVV({ a: 2 }, { a: 1 }), "newer");
	assert.equal(compareVV({ a: 1 }, { a: 1, b: 1 }), "older");
	assert.equal(compareVV({ a: 2 }, { a: 1, b: 1 }), "concurrent");
});

test("fusion : la version descendante l'emporte, le conflit garde les deux versions de façon déterministe", () => {
	const base = { ...createNote(algo, 1), vv: { web: 1 } };
	const fromWeb = { ...edit(base, "web"), vv: { web: 2 }, updatedAt: 5 };
	const fromExt = { ...edit(base, "ext"), vv: { web: 1, ext: 1 }, updatedAt: 6 };
	assert.equal(mergeNote(base, fromWeb).next, fromWeb);
	assert.equal(mergeNote(fromWeb, base).next, null);

	const onWeb = mergeNote(fromWeb, fromExt);
	const onExt = mergeNote(fromExt, fromWeb);
	assert.equal(onWeb.next?.title, "ext", "la plus récente gagne");
	assert.deepEqual(onWeb.next, onExt.next, "même gagnant des deux côtés");
	assert.deepEqual(onWeb.conflictCopy, onExt.conflictCopy, "même copie de conflit des deux côtés, pas de doublon");
	assert.equal(onWeb.conflictCopy?.title, "Conflit · web");
	assert.deepEqual(onWeb.next?.vv, { web: 2, ext: 1 });
});

test("fusion : une modification concurrente l'emporte sur une suppression", () => {
	const base = { ...createNote(null, 1), vv: { web: 1 } };
	const deleted = { ...base, deleted: true, html: "", vv: { web: 2 }, updatedAt: 9 };
	const edited = { ...edit(base, "garde-moi"), vv: { web: 1, ext: 1 }, updatedAt: 3 };
	assert.equal(mergeNote(deleted, edited).next?.title, "garde-moi");
	assert.equal(mergeNote(deleted, edited).conflictCopy, null);
	assert.equal(mergeNote(edited, { ...deleted, vv: { web: 2, ext: 1 } }).next?.deleted, true, "suppression postérieure : appliquée");
});

test("validation des notes reçues", () => {
	const note = createNote(algo);
	assert.deepEqual(parseNote(JSON.parse(JSON.stringify(note))), note);
	assert.equal(parseNote({ ...note, schema: 99 }), null);
	assert.equal(parseNote({ ...note, vv: { a: "x" } }), null);
	assert.equal(parseNote({ ...note, attachments: [{ id: 1 }] }), null);
	assert.equal(parseNote("<script>"), null);
});

test("nettoyage HTML", () => {
	const dirty = `<p onclick="x()">Salut <b>toi</b><script>alert(1)</script></p><a href="javascript:alert(1)">piège</a><a href="https://epita.fr">ok</a><img src="https://pistage.example/x.png"><img data-att="abc-1" src="blob:x"><style>*{}</style><span style="color:red">rouge</span><ul><li>un</li></ul>`;
	const clean = sanitizeNoteHtml(dirty, parse);
	assert.doesNotMatch(clean, /script|onclick|javascript|pistage|style|span/i);
	const link = parse(clean).querySelector('a[href="https://epita.fr"]');
	assert.equal(link?.getAttribute("rel"), "noopener noreferrer");
	assert.equal(link?.getAttribute("target"), "_blank");
	assert.match(clean, /<img data-att="abc-1">/);
	assert.match(clean, /<b>toi<\/b>/);
	assert.match(clean, /<a>piège<\/a>/);
	assert.equal(noteHtmlToText("<p>un</p><ul><li>deux</li></ul>", parse), "un\ndeux");
	assert.equal(noteHtmlToText("Cas de base.<ul><li>fib(n)</li><li>fin</li></ul>", parse), "Cas de base.\nfib(n)\nfin", "texte suivi d'une liste");
});

test("recherche insensible aux accents", () => {
	const note = { ...createNote(algo), title: "Récursivité", text: "arbres binaires" };
	assert.ok(matchesSearch(note, "recursivite arbres"));
	assert.ok(matchesSearch(note, "algorithmique"), "le nom du cours compte");
	assert.ok(!matchesSearch(note, "graphe"));
});

test("persistance : création, liste par cours et par matière, suppression", async () => {
	const notes = store("web");
	const { note } = await notes.save(edit(createNote(algo), "Arbres"));
	await notes.save(edit(createNote(null), "Libre"));
	assert.equal((await notes.list()).length, 2);
	assert.deepEqual(
		(await notes.byCourse(algo.key)).map((item) => item.title),
		["Arbres"]
	);
	assert.equal((await notes.bySubject("algorithmique")).length, 1);
	await notes.remove(note.id);
	assert.equal((await notes.list()).length, 1);
	assert.equal((await notes.get(note.id))?.deleted, true, "pierre tombale conservée");
});

test("pièces jointes : blob conservé, ramassé une fois la note supprimée", async () => {
	const notes = store("web");
	const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });
	const attachment = await notes.putAttachment(blob, "capture.png");
	const { note } = await notes.save({ ...edit(createNote(algo), "Schéma"), attachments: [attachment] });
	const stored = await notes.getAttachment(attachment.id);
	assert.deepEqual(new Uint8Array(await stored!.arrayBuffer()), new Uint8Array([1, 2, 3]));
	assert.equal(stored!.type, "image/png");
	await assert.rejects(notes.putAttachment(new Blob([new Uint8Array(26 * 1024 * 1024)]), "gros.bin"), /trop lourd/);
	await notes.remove(note.id);
	clock += 2 * 3_600_000;
	await notes.save(edit(createNote(null), "déclenche le ménage"));
	assert.equal(await notes.getAttachment(attachment.id), undefined);
});

test("enregistrement depuis une version dépassée : rien n'est écrasé", async () => {
	const notes = store("web");
	const { note: first } = await notes.save(edit(createNote(algo), "v1"));
	await notes.merge([{ ...edit(first, "venue de l'extension"), vv: { ...first.vv, ext: 1 } }]);
	const { note, conflictCopy } = await notes.save(edit(first, "tapé sur le site"));
	assert.equal(note.title, "tapé sur le site");
	assert.equal(conflictCopy?.title, "Conflit · venue de l'extension");
	assert.equal((await notes.list()).length, 2);
});

test("synchronisation locale web ↔ extension, hors ligne puis reconnectés", async () => {
	const web = store("web");
	const ext = store("ext");
	const shot = await ext.putAttachment(new Blob(["png"], { type: "image/png" }), "capture.png");
	const { note: fromExt } = await ext.save({ ...edit(createNote(algo), "prise dans l'extension"), attachments: [shot] });
	const { note: fromWeb } = await web.save(edit(createNote(null), "prise sur le site"));

	await syncNotes(web, servePeer(ext));
	for (const side of [web, ext]) assert.deepEqual((await side.list()).map((note) => note.title).sort(), ["prise dans l'extension", "prise sur le site"]);
	assert.equal(await (await web.getAttachment(shot.id))?.text(), "png", "la capture suit la note");


	await web.save(edit((await web.get(fromExt.id))!, "complétée sur le site"));
	await ext.remove(fromWeb.id);
	await syncNotes(web, servePeer(ext));
	for (const side of [web, ext]) {
		assert.equal((await side.get(fromExt.id))?.title, "complétée sur le site");
		assert.equal((await side.get(fromWeb.id))?.deleted, true, "supprimée partout, ne réapparaît pas");
	}


	await web.save(edit((await web.get(fromExt.id))!, "version site"));
	await ext.save(edit((await ext.get(fromExt.id))!, "version extension"));
	await syncNotes(web, servePeer(ext));
	await syncNotes(web, servePeer(ext));
	const titles = async (side: typeof web) => (await side.list()).map((note) => note.title).sort();
	assert.deepEqual(await titles(web), await titles(ext));
	assert.equal((await titles(web)).length, 2);
	assert.ok((await titles(web)).some((title) => title.startsWith("Conflit · ")));
});

test("la note reste sur le site après désinstallation de l'extension", async () => {
	const web = store("web");
	const ext = store("ext");
	await ext.save(edit(createNote(algo), "répliquée"));
	await syncNotes(web, servePeer(ext));

	assert.equal((await web.list())[0].title, "répliquée");
});

test("export et import d'archive", async () => {
	const source = store("web");
	const attachment = await source.putAttachment(new Blob(["%PDF"], { type: "application/pdf" }), "cours.pdf");
	await source.save({ ...edit(createNote(algo), "à sauvegarder"), attachments: [attachment] });
	const archive = await source.exportArchive();
	assert.ok(readZip(archive).some((entry) => entry.name === "notes.json"));

	const target = store("web");
	assert.deepEqual(await target.importArchive(archive), { notes: 1, changed: 1 });
	assert.equal((await target.list())[0].title, "à sauvegarder");
	assert.equal(await (await target.getAttachment(attachment.id))?.text(), "%PDF");
	assert.deepEqual(await target.importArchive(archive), { notes: 1, changed: 0 }, "réimporter ne duplique rien");
	await assert.rejects(target.importArchive(createZip([{ name: "autre.txt", data: new Uint8Array([1]) }])), /notes.json/);
});

test("zip : aller-retour et archive corrompue", () => {
	const zip = createZip([{ name: "é.txt", data: new TextEncoder().encode("bonjour") }]);
	const [entry] = readZip(zip);
	assert.equal(entry.name, "é.txt");
	assert.equal(new TextDecoder().decode(entry.data), "bonjour");
	const broken = zip.slice();
	broken[38] ^= 0xff;
	assert.throws(() => readZip(broken), /endommagée/);
	assert.throws(() => readZip(new Uint8Array(10)), /ZIP/);
});
