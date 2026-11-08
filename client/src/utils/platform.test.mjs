import test from "node:test";
import assert from "node:assert/strict";
import { isIOSDevice } from "./platform.js";

for (const [name, device, expected] of [
	["iPhone Safari", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile/15E148 Safari/604.1", platform: "iPhone", maxTouchPoints: 5 }, true],
	["iPhone Chrome", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) CriOS/130.0 Mobile/15E148 Safari/604.1", platform: "iPhone", maxTouchPoints: 5 }, true],
	["iPad", { userAgent: "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)", platform: "iPad", maxTouchPoints: 5 }, true],
	["iPad desktop mode", { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Version/18.0 Safari/605.1.15", platform: "MacIntel", maxTouchPoints: 5 }, true],
	["Mac Safari", { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Version/18.0 Safari/605.1.15", platform: "MacIntel", maxTouchPoints: 0 }, false],
	["Android", { userAgent: "Mozilla/5.0 (Linux; Android 15) Chrome/130.0 Mobile Safari/537.36", platform: "Linux armv8l", maxTouchPoints: 5 }, false],
	["Windows", { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36", platform: "Win32", maxTouchPoints: 0 }, false],
]) {
	test(`iOS detection: ${name}`, () => {
		assert.equal(isIOSDevice(device), expected);
	});
}
