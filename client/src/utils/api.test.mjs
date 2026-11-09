import test from "node:test";
import assert from "node:assert/strict";
import { fetchApi } from "./api.js";

test("fetchApi aborts a request that exceeds its timeout", async () => {
	const originalFetch = globalThis.fetch;
	globalThis.fetch = (_input, { signal }) => new Promise((_resolve, reject) => {
		signal.addEventListener("abort", () => reject(signal.reason), { once: true });
	});

	try {
		await assert.rejects(fetchApi("/api/slow", {}, 5), /plus de temps que prévu/);
	} finally {
		globalThis.fetch = originalFetch;
	}
});

test("fetchApi preserves the caller abort signal", async () => {
	const originalFetch = globalThis.fetch;
	globalThis.fetch = async (_input, { signal }) => ({ signal });
	const controller = new AbortController();
	controller.abort();

	try {
		const result = await fetchApi("/api/cancelled", { signal: controller.signal });
		assert.equal(result.signal.aborted, true);
	} finally {
		globalThis.fetch = originalFetch;
	}
});

test("fetchApi signals an expired active Zeus session on HTTP 401", async () => {
	const previousFetch = globalThis.fetch;
	const previousWindow = globalThis.window;
	const previousStorage = globalThis.localStorage;
	const events = [];
	globalThis.fetch = async () => ({ status: 401 });
	globalThis.window = { dispatchEvent: (event) => events.push(event.type) };
	globalThis.localStorage = { getItem: (key) => (key === "zeus_token" ? "current" : null) };

	try {
		await fetchApi("/api/groups", { headers: { Authorization: "Bearer current" } });
		assert.deepEqual(events, ["epitime:session-expired"]);

		await fetchApi("/api/auth", { method: "POST" });
		await fetchApi("/api/groups", { headers: { Authorization: "Bearer old" } });
		assert.deepEqual(events, ["epitime:session-expired"]);
	} finally {
		globalThis.fetch = previousFetch;
		if (previousWindow === undefined) delete globalThis.window;
		else globalThis.window = previousWindow;
		if (previousStorage === undefined) delete globalThis.localStorage;
		else globalThis.localStorage = previousStorage;
	}
});
