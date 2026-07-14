"use strict";

const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const packageJson = require(path.join(projectRoot, "package.json"));
const packageLock = require(path.join(projectRoot, "package-lock.json"));
const appConfig = require(path.join(projectRoot, "app.json"));
const gradlePath = path.join(projectRoot, "android", "app", "build.gradle");
const gradle = fs.readFileSync(gradlePath, "utf8");

const versionNameMatch = gradle.match(/\bversionName\s+["']([^"']+)["']/);
const versionCodeMatch = gradle.match(/\bversionCode\s+(\d+)/);
const versionName = versionNameMatch?.[1];
const versionCode = Number(versionCodeMatch?.[1]);
const expectedVersion = packageJson.version;

const failures = [];
if (appConfig.expo?.version !== expectedVersion) failures.push("app.json");
if (packageLock.version !== expectedVersion) failures.push("package-lock.json");
if (packageLock.packages?.[""]?.version !== expectedVersion) failures.push("package-lock.json packages root");
if (versionName !== expectedVersion) failures.push("android/app/build.gradle versionName");
if (!Number.isInteger(versionCode) || versionCode < 1) failures.push("android/app/build.gradle versionCode");

if (failures.length) {
	throw new Error(`Android release metadata is inconsistent: ${failures.join(", ")}.`);
}

if (process.argv.includes("--artifact")) {
	const outputDirectory = path.join(projectRoot, "android", "app", "build", "outputs", "apk", "release");
	const metadataPath = path.join(outputDirectory, "output-metadata.json");
	if (!fs.existsSync(metadataPath)) {
		throw new Error("Release APK metadata is missing. Run npm run apk:build first.");
	}

	const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
	const artifact = metadata.elements?.find((element) => element.outputFile === "app-release.apk") || metadata.elements?.[0];
	if (!artifact) throw new Error("Release APK metadata does not contain an artifact.");

	if (artifact.versionName !== expectedVersion || Number(artifact.versionCode) !== versionCode) {
		throw new Error(
			`Release APK metadata is stale (found ${artifact.versionName} / ${artifact.versionCode}, expected ${expectedVersion} / ${versionCode}).`,
		);
	}

	if (!fs.existsSync(path.join(outputDirectory, artifact.outputFile))) {
		throw new Error("Release APK file is missing. Run npm run apk:build first.");
	}
}

console.log(`Android release metadata is consistent: ${expectedVersion} (versionCode ${versionCode}).`);
