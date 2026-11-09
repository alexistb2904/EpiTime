import test from "node:test";
import assert from "node:assert/strict";
import { clearSavedSession, getZeusTokenExpiresAt, readSavedSession } from "./authSession.js";

const tokenFor = (exp) => `header.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.signature`;

function withSavedSession(token, online, check) {
	const previousStorage = globalThis.localStorage;
	const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
	const values = new Map([["zeus_token", token], ["zeus_user", JSON.stringify({ username: "student@epita.fr" })]]);
	globalThis.localStorage = {
		getItem: (key) => values.get(key) ?? null,
		removeItem: (key) => values.delete(key),
	};
	Object.defineProperty(globalThis, "navigator", { configurable: true, value: { onLine: online } });
	try {
		check(values);
	} finally {
		if (previousStorage === undefined) delete globalThis.localStorage;
		else globalThis.localStorage = previousStorage;
		if (previousNavigator) Object.defineProperty(globalThis, "navigator", previousNavigator);
		else delete globalThis.navigator;
	}
}

test("restores a Zeus JWT only while it is still valid", () => {
	const exp = Math.floor(Date.now() / 1000) + 120;
	const token = tokenFor(exp);
	withSavedSession(token, true, () => {
		assert.equal(getZeusTokenExpiresAt(token), exp * 1000);
		assert.equal(readSavedSession().token, token);
	});
});

test("expired Zeus sessions go straight to login without retrying Microsoft", () => {
	withSavedSession(tokenFor(Math.floor(Date.now() / 1000) - 60), true, (values) => {
		assert.equal(readSavedSession(), null);
		assert.equal(values.has("zeus_token"), false);
		assert.equal(values.has("zeus_user"), false);
	});
});

test("does not restore unknown or near-expiry tokens online", () => {
	for (const token of ["opaque-token", tokenFor(Math.floor(Date.now() / 1000) + 10)]) {
		withSavedSession(token, true, () => assert.equal(readSavedSession(), null));
	}
});

test("offline access keeps cached schedules even when Zeus expired", () => {
	const token = tokenFor(Math.floor(Date.now() / 1000) - 60);
	withSavedSession(token, false, () => assert.equal(readSavedSession().token, token));
});

test("logout removes only the saved Zeus credentials", () => {
	withSavedSession(tokenFor(Math.floor(Date.now() / 1000) + 120), true, (values) => {
		values.set("zeus_cached_groups", "[]");
		clearSavedSession();
		assert.equal(values.has("zeus_token"), false);
		assert.equal(values.has("zeus_user"), false);
		assert.equal(values.get("zeus_cached_groups"), "[]");
	});
});
