import assert from "node:assert/strict";
import test from "node:test";
import { getZeusTokenExpiresAt, isTerminalAuthFailure, isZeusTokenExpired } from "./authUtils.ts";

const tokenFor = (exp) => `header.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.signature`;
const nowSeconds = Math.floor(Date.now() / 1000);

test("reads the expiry of a Zeus JWT", () => {
	assert.equal(getZeusTokenExpiresAt(tokenFor(nowSeconds + 3600)), (nowSeconds + 3600) * 1000);
	assert.equal(getZeusTokenExpiresAt("opaque-token"), null);
	assert.equal(getZeusTokenExpiresAt(null), null);
});

test("a Zeus token is refreshed only once it expires, not every hour", () => {
	assert.equal(isZeusTokenExpired(tokenFor(nowSeconds + 23 * 3600)), false);
	assert.equal(isZeusTokenExpired(tokenFor(nowSeconds + 10)), true);
	assert.equal(isZeusTokenExpired(tokenFor(nowSeconds - 60)), true);
	// Without a readable expiry, the server's 401 decides.
	assert.equal(isZeusTokenExpired("opaque-token"), false);
});

test("only a refusal ends the session, never a temporary failure", () => {
	assert.equal(isTerminalAuthFailure({ code: "invalid_grant" }), true);
	assert.equal(isTerminalAuthFailure({ code: "interaction_required" }), true);
	assert.equal(isTerminalAuthFailure({ status: 401, code: "AUTH_RECONNECT_REQUIRED" }), true);
	assert.equal(isTerminalAuthFailure({ status: 403 }), true);

	assert.equal(isTerminalAuthFailure(new TypeError("Network request failed")), false);
	assert.equal(isTerminalAuthFailure(new Error("Requête expirée")), false);
	assert.equal(isTerminalAuthFailure({ status: 500 }), false);
	assert.equal(isTerminalAuthFailure({ status: 429 }), false);
	assert.equal(isTerminalAuthFailure({ code: "temporarily_unavailable" }), false);
	assert.equal(isTerminalAuthFailure(null), false);
});
