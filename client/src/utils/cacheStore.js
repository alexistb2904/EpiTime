const STORE = "cache";
let database;

const openDatabase = () =>
	new Promise((resolve, reject) => {
		const request = indexedDB.open("epitime", 1);
		request.onupgradeneeded = () => request.result.createObjectStore(STORE);
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});

const run = async (mode, action) => {
	const store = (await (database ??= openDatabase())).transaction(STORE, mode).objectStore(STORE);
	return new Promise((resolve, reject) => {
		const request = action(store);
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
};

export async function cacheSet(key, value) {
	try {
		await run("readwrite", (store) => store.put(value, key));
	} catch {
		//
	}
}

const WEEK_CACHE_MAX_AGE_MS = 30 * 86_400_000;

const migrated = (async () => {
	try {
		for (const key of Object.keys(localStorage)) {
			if (key !== "zeus_cached_groups" && !key.startsWith("zeus_events_")) continue;
			await cacheSet(key, JSON.parse(localStorage.getItem(key)));
			localStorage.removeItem(key);
		}
		// Week caches end with the ISO date the week ends on: drop the ones that ended over a month ago.
		for (const key of await run("readonly", (store) => store.getAllKeys())) {
			if (key.startsWith("zeus_events_") && Date.parse(key.slice(-24)) < Date.now() - WEEK_CACHE_MAX_AGE_MS) {
				await run("readwrite", (store) => store.delete(key));
			}
		}
	} catch {
		//
	}
})();

export async function cacheGet(key) {
	try {
		await migrated;
		return await run("readonly", (store) => store.get(key));
	} catch {
		return undefined;
	}
}
