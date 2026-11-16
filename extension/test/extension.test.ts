process.env.TZ = "Europe/Paris";
import assert from "node:assert/strict";
import { test } from "node:test";
import type { ZeusEvent } from "../../shared/src/events.ts";
import { ApiError, fetchEvents } from "../src/lib/api.ts";
import { isSessionUsable, parseSessionPayload, readTokenExpiry } from "../src/lib/sessionModel.ts";
import { DEFAULT_SETTINGS, migrateSettings } from "../src/lib/settingsModel.ts";
import type { ChangeLog, ScheduleState } from "../src/lib/state.ts";
import { applySyncResult, webPushCoversDay } from "../src/lib/syncCore.ts";

const H = 3_600_000;
const NOW = Date.parse("2026-11-16T09:30:00+01:00");
const jwt = (claims: object) => `e30.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`;
const course = (id: number, from: number, extra: Partial<ZeusEvent> = {}): ZeusEvent => ({
	idReservation: id,
	name: `Cours ${id}`,
	startDate: new Date(NOW + from * H).toISOString(),
	endDate: new Date(NOW + (from + 1) * H).toISOString(),
	rooms: [{ name: "P204" }],
	...extra,
});
const snapshot = (events: ZeusEvent[]) => ({ scope: "1,2", rangeStart: NOW - 10 * H, rangeEnd: NOW + 14 * 24 * H, fetchedAt: NOW, events });
const emptySchedule: ScheduleState = { reference: null, lastSync: null, lastError: null, pendingSuspicious: null };
const emptyLog: ChangeLog = { items: [], unseen: 0, notifiedKeys: [] };
const settings = structuredClone(DEFAULT_SETTINGS);

test("expiration de session", () => {
	const token = jwt({ exp: (NOW + 2 * H) / 1000 });
	assert.equal(readTokenExpiry(token), NOW + 2 * H);
	assert.ok(isSessionUsable({ expiresAt: NOW + 2 * H }, NOW));
	assert.ok(!isSessionUsable({ expiresAt: NOW + 30_000 }, NOW), "marge d'une minute avant l'expiration");
	assert.ok(!isSessionUsable({ expiresAt: null }, NOW), "sans expiration lisible : considérée comme expirée");
	assert.ok(!isSessionUsable(null, NOW));
	assert.equal(readTokenExpiry("pas-un-jwt"), null);
});

test("validation de la session transmise par le site", () => {
	const valid = parseSessionPayload({ token: jwt({ exp: 1 }), user: { username: "a@epita.fr" }, groups: [12, "34", "x y"], webPush: { enabled: true, minutesBefore: 10, days: [1, 9] } });
	assert.deepEqual(valid?.groups, ["12", "34"]);
	assert.deepEqual(valid?.webPush, { enabled: true, minutesBefore: 10, days: [1] });
	assert.equal(parseSessionPayload({ token: "<script>", user: { username: "a" } }), null);
	assert.equal(parseSessionPayload({ token: jwt({}), user: {} }), null, "sans utilisateur : refusé");
	assert.equal(parseSessionPayload(null), null);
});

const respond = (status: number, body: unknown) => (async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status })) as unknown as typeof fetch;
const kindOf = async (fetcher: typeof fetch) => {
	try {
		await fetchEvents("https://epitime.epita.it", "t", ["1"], new Date(NOW), new Date(NOW + H), fetcher);
		return "ok";
	} catch (error) {
		return (error as ApiError).kind;
	}
};

test("API : un 401, une panne, un délai ou une réponse invalide ne sont jamais un planning vide", async () => {
	assert.equal(await kindOf(respond(401, { error: "expired" })), "auth");
	assert.equal(await kindOf(respond(502, "Bad gateway")), "server");
	assert.equal(await kindOf(respond(200, { offline: true, cached: false })), "invalid");
	assert.equal(await kindOf(respond(200, "<html>")), "invalid");
	assert.equal(await kindOf(respond(200, [{ name: "sans date" }])), "invalid");
	assert.equal(
		await kindOf((async () => {
			throw new TypeError("Failed to fetch");
		}) as unknown as typeof fetch),
		"network"
	);
	let url = "";
	const events = await fetchEvents("https://epitime.epita.it", "t", ["1", "2"], new Date(NOW), new Date(NOW + H), (async (input: string) => {
		url = input;
		return new Response(JSON.stringify([course(1, 1), { name: "invalide" }]));
	}) as unknown as typeof fetch);
	assert.equal(events.length, 1, "un événement mal formé est écarté, pas toute la réponse");
	assert.match(url, /groups=1&groups=2/);
});

test("première synchronisation : référence posée, aucune notification", () => {
	const outcome = applySyncResult({ schedule: emptySchedule, changes: emptyLog, settings, now: NOW, result: snapshot([course(1, 1), course(2, 3), course(3, 5)]) });
	assert.equal(outcome.notify.length, 0);
	assert.equal(outcome.changes.unseen, 0);
	assert.equal(outcome.schedule.reference?.events.length, 3);
});

test("changement détecté, notifié une seule fois, puis changement suivant", () => {
	const first = applySyncResult({ schedule: emptySchedule, changes: emptyLog, settings, now: NOW, result: snapshot([course(1, 1)]) });
	const moved = snapshot([course(1, 1, { rooms: [{ name: "P112" }] })]);
	const second = applySyncResult({ ...first, settings, now: NOW + 60_000, result: moved });
	assert.equal(second.notify.length, 1);
	assert.equal(second.notify[0]!.notification.title, "Cours 1 · salle modifiée");
	assert.equal(second.changes.unseen, 1);
	const again = applySyncResult({ ...second, settings, now: NOW + 120_000, result: moved });
	assert.equal(again.notify.length, 0, "même état : rien de nouveau");
	const third = applySyncResult({ ...again, settings, now: NOW + 180_000, result: snapshot([course(1, 1, { rooms: [{ name: "P300" }] })]) });
	assert.equal(third.notify.length, 1, "changement successif : nouvelle notification");
});

test("erreurs : la référence survit, 401 expire la session, hors ligne puis retour en ligne", () => {
	const base = applySyncResult({ schedule: emptySchedule, changes: emptyLog, settings, now: NOW, result: snapshot([course(1, 1), course(2, 2)]) });
	const unauthorized = applySyncResult({ ...base, settings, now: NOW, result: { error: { kind: "auth", message: "Session expirée.", at: NOW } } });
	assert.ok(unauthorized.expireSession);
	assert.equal(unauthorized.schedule.reference?.events.length, 2, "un 401 n'efface aucun cours");
	const offline = applySyncResult({ ...unauthorized, settings, now: NOW, result: { error: { kind: "offline", message: "Hors ligne", at: NOW } } });
	assert.equal(offline.schedule.reference?.events.length, 2);
	assert.equal(offline.notify.length, 0);

	const back = applySyncResult({ ...offline, settings, now: NOW + H / 2, result: snapshot([course(1, 1), course(2, 2, { isCancelled: true })]) });
	assert.deepEqual(
		back.notify.map((change) => change.kind),
		["cancelled"]
	);
});

test("réponse vide de Zeus : ignorée une fois, acceptée si elle se confirme", () => {
	const base = applySyncResult({ schedule: emptySchedule, changes: emptyLog, settings, now: NOW, result: snapshot([course(1, 1), course(2, 2), course(3, 3), course(4, 4)]) });
	const suspicious = applySyncResult({ ...base, settings, now: NOW + 60_000, result: snapshot([]) });
	assert.equal(suspicious.notify.length, 0);
	assert.equal(suspicious.schedule.reference?.events.length, 4, "la référence n'est pas vidée");
	const confirmed = applySyncResult({ ...suspicious, settings, now: NOW + 120_000, result: snapshot([]) });
	assert.equal(confirmed.notify.length, 4);
	assert.equal(confirmed.schedule.reference?.events.length, 0);
});

test("catégories coupées et cours ignorés", () => {
	const base = applySyncResult({ schedule: emptySchedule, changes: emptyLog, settings, now: NOW, result: snapshot([course(1, 1), course(2, 2)]) });
	const quiet = { ...structuredClone(settings), ignoredSubjects: ["cours 2"] };
	quiet.changes.categories.room = false;
	const outcome = applySyncResult({ ...base, settings: quiet, now: NOW, result: snapshot([course(1, 1, { rooms: [{ name: "X" }] }), course(2, 2, { isCancelled: true })]) });
	assert.equal(outcome.notify.length, 0);
	assert.equal(outcome.changes.items.length, 1, "le changement de salle reste visible dans la popup");
});

test("rappels du site actifs : pas de doublon côté extension", () => {
	const monday = Date.parse("2026-11-16T10:00:00+01:00");
	assert.ok(webPushCoversDay({ enabled: true, days: [1] }, monday));
	assert.ok(!webPushCoversDay({ enabled: true, days: [2] }, monday));
	assert.ok(!webPushCoversDay({ enabled: false, days: [1] }, monday));
	assert.ok(!webPushCoversDay(undefined, monday));
});

test("migration des réglages : champs ajoutés complétés, valeurs gardées", () => {
	const migrated = migrateSettings({ syncMinutes: 15, changes: { enabled: false } } as never);
	assert.equal(migrated.syncMinutes, 15);
	assert.equal(migrated.changes.enabled, false);
	assert.equal(migrated.changes.categories.room, true, "catégorie absente : valeur par défaut");
	assert.equal(migrated.reminders.minutesBefore, 10);
	assert.deepEqual(migrateSettings(undefined), DEFAULT_SETTINGS);
});
