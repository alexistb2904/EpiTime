import test from "node:test";
import assert from "node:assert/strict";
import { sanitizePushSubscription } from "./pushSubscription.js";

const keys = { p256dh: "BNc", auth: "abc" };

test("keeps real browser push services and drops extra fields", () => {
	for (const endpoint of ["https://fcm.googleapis.com/fcm/send/x", "https://updates.push.services.mozilla.com/wpush/v2/x", "https://wns2-par02p.notify.windows.com/w/?token=x", "https://web.push.apple.com/x"]) {
		assert.deepEqual(sanitizePushSubscription({ endpoint, keys, userGroups: ["1"], extra: "x" }), { endpoint, keys });
	}
});

test("rejects endpoints that would let the server reach other hosts", () => {
	for (const endpoint of [
		"http://fcm.googleapis.com/x",
		"https://127.0.0.1/x",
		"https://fcm.googleapis.com:8443/x",
		"https://fcm.googleapis.com.evil.example/x",
		"https://fcm.googleapis.com@127.0.0.1/x",
		"https://notify.windows.com.evil.example/x",
		"not a url",
		undefined,
	]) {
		assert.equal(sanitizePushSubscription({ endpoint, keys }), null, String(endpoint));
	}
});

test("rejects missing or oversized keys", () => {
	const endpoint = "https://fcm.googleapis.com/x";
	assert.equal(sanitizePushSubscription({ endpoint }), null);
	assert.equal(sanitizePushSubscription({ endpoint, keys: { p256dh: "a".repeat(201), auth: "b" } }), null);
	assert.equal(sanitizePushSubscription(null), null);
});
