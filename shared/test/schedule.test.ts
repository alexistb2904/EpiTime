
process.env.TZ = "Europe/Paris";
import assert from "node:assert/strict";
import { test } from "node:test";
import { diffSnapshots, findEventChanges, type ScheduleSnapshot } from "../src/changes.ts";
import { eventIdentity, type ZeusEvent } from "../src/events.ts";
import { diffReminderKeys, planReminders } from "../src/reminders.ts";
import { findCurrentEvent, findNextEvent, formatRelative, remainingToday } from "../src/schedule.ts";
import { isExamEvent, placeLabel } from "../src/events.ts";

const H = 3_600_000;
const NOW = Date.parse("2026-11-16T09:30:00+01:00");
const at = (hours: number) => new Date(NOW + hours * H).toISOString();
const course = (id: number, from: number, to: number, extra: Partial<ZeusEvent> = {}): ZeusEvent => ({
	idReservation: id,
	name: `Cours ${id}`,
	startDate: at(from),
	endDate: at(to),
	rooms: [{ name: "P204" }],
	...extra,
});

test("cours courant et suivant", () => {
	const events = [course(1, -0.5, 1), course(2, 1.5, 3), course(3, -48, 72, { name: "Semaine projet" }), course(4, 0.5, 1, { isCancelled: true })];
	assert.equal(findCurrentEvent(events, NOW)?.idReservation, 1, "un créneau passe avant un bloc de plusieurs jours");
	assert.equal(findNextEvent(events, NOW)?.idReservation, 2, "un cours annulé n'est pas le prochain");
	assert.deepEqual(
		remainingToday(events, NOW).map((event) => event.idReservation),
		[1, 4, 2]
	);
	assert.equal(findNextEvent(events, NOW, { ignoredSubjects: ["cours 2"] }), null, "une matière ignorée n'est pas proposée");
});

test("aucun cours en cours entre deux créneaux", () => {
	assert.equal(findCurrentEvent([course(1, -3, -1), course(2, 2, 3)], NOW), null);
});

test("identité stable : un changement d'horaire n'est pas une suppression suivie d'un ajout", () => {
	const before = [course(1, 2, 3)];
	const after = [course(1, 3.5, 4.5)];
	assert.equal(eventIdentity(before[0]), eventIdentity(after[0]));
	const changes = findEventChanges(before, after, { now: NOW });
	assert.equal(changes.length, 1);
	assert.equal(changes[0].kind, "updated");
	assert.equal(changes[0].category, "time");
	assert.match(changes[0].headline, /^Cours 1 · cours déplacé de 11:30 à 13:00$/);
});

test("changement de salle, annulation, ajout, suppression", () => {
	const before = [course(1, 1, 2), course(2, 3, 4), course(3, 5, 6)];
	const after = [course(1, 1, 2, { rooms: [{ name: "P112" }] }), course(2, 3, 4, { isCancelled: true }), course(4, 7, 8)];
	const byKind = Object.fromEntries(findEventChanges(before, after, { now: NOW }).map((change) => [change.kind + ":" + change.identity, change]));
	assert.equal(byKind["updated:r:1"].headline, "Cours 1 · salle modifiée : P204 → P112");
	assert.equal(byKind["updated:r:1"].category, "room");
	assert.equal(byKind["cancelled:r:2"].category, "cancelled");
	assert.equal(byKind["created:r:4"].category, "created");
	assert.equal(byKind["deleted:r:3"].category, "cancelled");
});

test("changement de date", () => {
	const [change] = findEventChanges([course(1, 2, 3)], [course(1, 26, 27)], { now: NOW });
	assert.equal(change.category, "time");
	assert.match(change.headline, /cours déplacé du .* au /);
});

test("déduplication : même changement, même clé, changements successifs, clés distinctes", () => {
	const a = [course(1, 1, 2)];
	const b = [course(1, 1, 2, { rooms: [{ name: "P112" }] })];
	const c = [course(1, 1, 2, { rooms: [{ name: "P300" }] })];
	const first = findEventChanges(a, b, { now: NOW })[0].key;
	assert.equal(findEventChanges(a, b, { now: NOW + 60_000 })[0].key, first);
	assert.notEqual(findEventChanges(b, c, { now: NOW })[0].key, first);
	assert.notEqual(findEventChanges(b, a, { now: NOW })[0].key, first, "retour à l'état initial : nouveau changement");
});

test("les cours passés ou hors fenêtre ne déclenchent rien", () => {
	assert.deepEqual(findEventChanges([course(1, -5, -4)], [course(1, -5, -4, { rooms: [{ name: "X" }] })], { now: NOW }), []);
	assert.deepEqual(findEventChanges([course(1, 24 * 10, 24 * 10 + 1)], [], { now: NOW, windowDays: 3 }), []);
});

const snapshot = (events: ZeusEvent[], extra: Partial<ScheduleSnapshot> = {}): ScheduleSnapshot => ({
	scope: "g1",
	rangeStart: NOW - 24 * H,
	rangeEnd: NOW + 14 * 24 * H,
	fetchedAt: NOW,
	events,
	...extra,
});

test("première synchronisation : une référence, aucune notification", () => {
	const fresh = snapshot([course(1, 1, 2), course(2, 3, 4), course(3, 5, 6)]);
	assert.deepEqual(diffSnapshots(null, fresh, { now: NOW }), { status: "baseline", changes: [] });
	assert.equal(diffSnapshots(snapshot([course(1, 1, 2)], { scope: "g2" }), fresh, { now: NOW }).status, "baseline", "autre groupe : nouvelle référence");
});

test("réponse vide ou tronquée de Zeus : suspecte, pas une suppression massive", () => {
	const reference = snapshot([course(1, 1, 2), course(2, 3, 4), course(3, 5, 6), course(4, 7, 8)]);
	const diff = diffSnapshots(reference, snapshot([]), { now: NOW, windowDays: 7 });
	assert.equal(diff.status, "suspicious");
	assert.equal(diffSnapshots(reference, snapshot(reference.events.slice(1)), { now: NOW, windowDays: 7 }).status, "ok", "un seul cours retiré reste normal");
});

test("un cours hors de la plage commune n'est pas déclaré supprimé", () => {
	const reference = snapshot([course(1, 1, 2), course(9, 24 * 13, 24 * 13 + 1)]);
	const fresh = snapshot([course(1, 1, 2)], { rangeEnd: NOW + 5 * 24 * H });
	assert.deepEqual(diffSnapshots(reference, fresh, { now: NOW, windowDays: 14 }).changes, []);
});

test("rappels : délai, annulations, cours ignorés, reprogrammation après déplacement", () => {
	const events = [course(1, 1, 2), course(2, 3, 4, { isCancelled: true }), course(3, 5, 6, { name: "Sport" }), course(4, 0.1, 1)];
	const planned = planReminders(events, { minutesBefore: 15, now: NOW, horizonMs: 48 * H, ignoredSubjects: ["sport"] });
	assert.deepEqual(
		planned.map((reminder) => reminder.identity),
		["r:4", "r:1"]
	);
	assert.equal(planned[0].fireAt, NOW, "rappel en retard (sortie de veille) : tout de suite, avant le début du cours");
	assert.equal(planned[1].fireAt, NOW + H - 15 * 60_000);
	assert.match(planned[1].message, /^10:30 · P204$/);

	const moved = planReminders([course(1, 2, 3)], { minutesBefore: 15, now: NOW, horizonMs: 48 * H });
	const { cancel, create } = diffReminderKeys([planned[1].key], moved, new Set());
	assert.deepEqual(cancel, [planned[1].key]);
	assert.equal(create.length, 1);
	assert.deepEqual(diffReminderKeys([], moved, new Set([moved[0].key])).create, [], "un rappel déjà envoyé ne repart pas");
	assert.deepEqual(planReminders([course(1, -1, 1)], { minutesBefore: 15, now: NOW, horizonMs: 48 * H }), [], "cours commencé : plus de rappel");
});

test("affichage identique au planning web", () => {
	assert.equal(formatRelative(course(1, -0.5, 1), NOW), "jusqu'à 10:30");
	assert.equal(formatRelative(course(1, 0.2, 1), NOW), "dans 12 min");
	assert.equal(formatRelative(course(1, 1.5, 2), NOW), "dans 1 h 30");
	assert.equal(formatRelative(course(1, 24, 25), NOW), "demain, 09:30");
	assert.ok(isExamEvent({ ...course(1, 1, 2), idType: 2 }));
	assert.ok(!isExamEvent(course(1, 1, 2)));
	assert.equal(placeLabel({ ...course(1, 1, 2), rooms: [], isOnline: true }), "En ligne");
	assert.equal(placeLabel({ ...course(1, 1, 2), rooms: [] }), "Salle non précisée");
});
