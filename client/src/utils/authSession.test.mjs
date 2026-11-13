import test from "node:test";
import assert from "node:assert/strict";
import { clearSavedSession, getZeusTokenExpiresAt, readSavedSession } from "./authSession.js";

const tokenFor = (exp) => `header.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.signature`;

function withSavedSession(token, check) {
	const previousStorage = globalThis.localStorage;
	const values = new Map([["zeus_token", token], ["zeus_user", JSON.stringify({ username: "student@epita.fr" })]]);
	globalThis.localStorage = {
		getItem: (key) => values.get(key) ?? null,
		removeItem: (key) => values.delete(key),
	};
	try {
		check(values);
	} finally {
		if (previousStorage === undefined) delete globalThis.localStorage;
		else globalThis.localStorage = previousStorage;
	}
}

test("restores a valid Zeus JWT as is", () => {
	const exp = Math.floor(Date.now() / 1000) + 120;
	const token = tokenFor(exp);
	withSavedSession(token, () => {
		assert.equal(getZeusTokenExpiresAt(token), exp * 1000);
		const session = readSavedSession();
		assert.equal(session.token, token);
		assert.equal(session.expired, false);
	});
});

test("expired, near-expiry and opaque tokens are kept but flagged for renewal", () => {
	const now = Math.floor(Date.now() / 1000);
	for (const token of [tokenFor(now - 60), tokenFor(now + 10), "opaque-token"]) {
		withSavedSession(token, (values) => {
			const session = readSavedSession();
			assert.equal(session.expired, true);
			// Kept for the silent renewal (account hint) and for offline access to cached schedules.
			assert.equal(session.user.username, "student@epita.fr");
			assert.equal(values.has("zeus_token"), true);
		});
	}
});

test("logout removes only the saved Zeus credentials", () => {
	withSavedSession(tokenFor(Math.floor(Date.now() / 1000) + 120), (values) => {
		values.set("zeus_cached_groups", "[]");
		clearSavedSession();
		assert.equal(values.has("zeus_token"), false);
		assert.equal(values.has("zeus_user"), false);
		assert.equal(values.get("zeus_cached_groups"), "[]");
	});
});
