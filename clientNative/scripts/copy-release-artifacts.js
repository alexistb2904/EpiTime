"use strict";

const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const version = require(path.join(projectRoot, "package.json")).version;
const releaseDirectory = path.join(projectRoot, "android", "app", "build", "outputs");

const artifacts = [
	{
		source: path.join(releaseDirectory, "apk", "release", "app-release.apk"),
		destination: path.join(projectRoot, `EpiTime-${version}-release.apk`),
		label: "APK",
	},
	{
		source: path.join(releaseDirectory, "mapping", "release", "mapping.txt"),
		destination: path.join(projectRoot, `EpiTime-${version}-release-mapping.txt`),
		label: "R8 mapping",
		optional: true,
	},
];

for (const artifact of artifacts) {
	if (!fs.existsSync(artifact.source)) {
		if (artifact.optional) continue;
		throw new Error(`${artifact.label} is missing: ${artifact.source}`);
	}

	fs.copyFileSync(artifact.source, artifact.destination);
	console.log(`${artifact.label} copied to ${path.basename(artifact.destination)}`);
}
