import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";


const HOUR = 3_600_000;
const token = (email) => `x.${Buffer.from(JSON.stringify({ email, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.y`;
const course = (id, extra = {}) => ({
	idReservation: id,
	name: `Cours ${id}`,
	startDate: new Date(Date.now() + 24 * HOUR).toISOString(),
	endDate: new Date(Date.now() + 26 * HOUR).toISOString(),
	groups: [{ id: 10, name: "A" }],
	rooms: [{ name: "S1" }],
	...extra,
});

let zeusEvents = [];
const expoMessages = [];

const listen = async (handler) => {
	const server = http.createServer(handler);
	server.listen(0);
	await once(server, "listening");
	return server;
};

const readBody = async (req) => {
	let body = "";
	for await (const chunk of req) body += chunk;
	return body ? JSON.parse(body) : null;
};

test("the EpiTime-IOS app keeps working and only opted-in apps get server change alerts", async (t) => {
	const zeus = await listen((req, res) => {
		res.setHeader("Content-Type", "application/json");
		res.end(JSON.stringify(req.url.startsWith("/api/reservation/filter/displayable") ? zeusEvents : []));
	});
	const expo = await listen(async (req, res) => {
		const messages = await readBody(req);
		expoMessages.push(...messages);
		res.setHeader("Content-Type", "application/json");
		res.end(JSON.stringify({ data: messages.map((_, index) => ({ status: "ok", id: `ticket-${expoMessages.length}-${index}` })) }));
	});
	const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "epitime-notif-"));
	const port = 3900 + Math.floor(Math.random() * 90);
	const server = spawn(process.execPath, ["server.js"], {
		cwd: import.meta.dirname,
		env: {
			...process.env,
			NODE_ENV: "test",
			PORT: String(port),
			DATA_DIR: dataDir,
			ZEUS_BASE: `http://127.0.0.1:${zeus.address().port}`,
			EXPO_PUSH_API_URL: `http://127.0.0.1:${expo.address().port}/push/send`,
			EXPO_PUSH_RECEIPTS_API_URL: `http://127.0.0.1:${expo.address().port}/push/getReceipts`,
			VAPID_PUBLIC_KEY: "",
			VAPID_PRIVATE_KEY: "",
		},
	});
	t.after(() => {
		server.kill();
		zeus.close();
		expo.close();
		fs.rmSync(dataDir, { recursive: true, force: true });
	});
	let output = "";
	server.stdout.on("data", (chunk) => (output += chunk));
	server.stderr.on("data", (chunk) => (output += chunk));
	while (!output.includes("En ligne")) {
		if (server.exitCode !== null) assert.fail(output);
		await new Promise((resolve) => setTimeout(resolve, 50));
	}

	const api = async (route, { user = "ios@epita.fr", method = "POST", body, headers = {} } = {}) => {
		const res = await fetch(`http://127.0.0.1:${port}${route}`, {
			method,
			headers: { "Content-Type": "application/json", Authorization: `Bearer ${token(user)}`, "X-User-ID": user, ...headers },
			body: body === undefined ? undefined : JSON.stringify(body),
		});
		return { status: res.status, json: await res.json() };
	};
	const settings = { enabled: true, minutesBefore: 15, selectedDays: [0, 1, 2, 3, 4, 5, 6], notificationType: "both", changeDetectionEnabled: true, changeDetectionWindowDays: 3 };

	// EpiTime-IOS
	const ios = await api("/api/mobile/subscribe", { body: { expoPushToken: "ExponentPushToken[ios]", userId: "ios@epita.fr", groups: [10], settings, platform: "ios" } });
	assert.equal(ios.status, 200);
	assert.equal(ios.json.success, true);
	assert.equal(ios.json.changePush, false);

	const android = await api("/api/mobile/subscribe", {
		user: "android@epita.fr",
		body: { expoPushToken: "ExponentPushToken[android]", userId: "android@epita.fr", groups: [10], settings, platform: "android", changePush: true },
	});
	assert.equal(android.json.changePush, true);


	const fetchSchedule = () =>
		api(`/api/events?start=${new Date(Date.now() - HOUR).toISOString()}&end=${new Date(Date.now() + 7 * 24 * HOUR).toISOString()}&groups=10`, { method: "GET" });
	zeusEvents = [course(1), course(2)];
	assert.equal((await fetchSchedule()).status, 200);
	zeusEvents = [course(1, { isCancelled: true }), course(2)];
	assert.equal((await fetchSchedule()).json.length, 2);
	for (let i = 0; i < 40 && !expoMessages.length; i++) await new Promise((resolve) => setTimeout(resolve, 50));
	assert.deepEqual(
		expoMessages.map((message) => [message.to, message.data.type, message.data.kind]),
		[["ExponentPushToken[android]", "course-change", "cancelled"]]
	);

	const testPush = await api("/api/mobile/notify-test", { body: { userId: "ios@epita.fr" } });
	assert.deepEqual([testPush.status, testPush.json.sent, testPush.json.total], [200, 1, 1]);
	assert.deepEqual((await api("/api/mobile/unsubscribe", { body: { expoPushToken: "ExponentPushToken[ios]", userId: "ios@epita.fr" } })).json, { success: true, removed: 1 });
	// EpiTime-IOS re-subscribes when the test push answers 404
	assert.equal((await api("/api/mobile/notify-test", { body: { userId: "ios@epita.fr" } })).status, 404);
	assert.equal((await api("/api/mobile/subscribe", { headers: { Authorization: "" }, body: {} })).status, 401);
});
