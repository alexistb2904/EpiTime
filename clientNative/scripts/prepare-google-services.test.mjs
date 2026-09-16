import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptsDirectory, "..");
const prepareScript = path.join(scriptsDirectory, "prepare-google-services.js");

test("allows local Android setup without a Firebase configuration file", () => {
	const result = spawnSync(process.execPath, [prepareScript], {
		cwd: projectRoot,
		encoding: "utf8",
	});

	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /skipping Google services setup/i);
});

test("requires a Firebase configuration file for release setup", () => {
	const result = spawnSync(process.execPath, [prepareScript, "--require"], {
		cwd: projectRoot,
		encoding: "utf8",
	});

	assert.notEqual(result.status, 0);
	assert.match(result.stderr, /google-services\.json is required/i);
});
