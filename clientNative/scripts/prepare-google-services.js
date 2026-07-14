"use strict";

const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const fallbackFile = path.join(projectRoot, "google-services.json");
const sourceFile = process.env.GOOGLE_SERVICES_JSON || fallbackFile;
const destinationFile = path.join(projectRoot, "android", "app", "google-services.json");
const expectedPackage = require(path.join(projectRoot, "app.json")).expo.android.package;

if (!fs.existsSync(sourceFile)) {
	throw new Error(
		"google-services.json is required for an Android release. Set GOOGLE_SERVICES_JSON to an EAS file secret or provide clientNative/google-services.json locally.",
	);
}

let googleServices;
try {
	googleServices = JSON.parse(fs.readFileSync(sourceFile, "utf8"));
} catch {
	throw new Error("GOOGLE_SERVICES_JSON must point to a valid google-services.json file.");
}

const configuredPackages = (googleServices.client || []).map(
	(client) => client?.client_info?.android_client_info?.package_name,
);
if (!configuredPackages.includes(expectedPackage)) {
	throw new Error(`google-services.json does not contain the Android package ${expectedPackage}.`);
}

fs.mkdirSync(path.dirname(destinationFile), { recursive: true });
if (path.resolve(sourceFile) !== path.resolve(destinationFile)) {
	fs.copyFileSync(sourceFile, destinationFile);
}

console.log("Android Firebase configuration prepared for the release build.");
