import test from "node:test";
import assert from "node:assert/strict";
import { compareVersions, isVersionNewer, normalizeVersion } from "./versionUtils.ts";

test("normalizeVersion strips v prefix, prerelease and build metadata", () => {
	assert.equal(normalizeVersion("v1.2.3-beta+42"), "1.2.3");
});

test("compareVersions handles patch and minor updates", () => {
	assert.equal(compareVersions("1.1.16", "1.1.15"), 1);
	assert.equal(compareVersions("1.2.0", "1.1.99"), 1);
	assert.equal(compareVersions("1.1.14", "1.1.15"), -1);
});

test("isVersionNewer never proposes a downgrade or an equal release", () => {
	assert.equal(isVersionNewer("v1.1.15", "1.1.15"), false);
	assert.equal(isVersionNewer("1.1.14", "1.1.15"), false);
	assert.equal(isVersionNewer("1.1.16", "1.1.15"), true);
});
