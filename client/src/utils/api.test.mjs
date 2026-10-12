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
