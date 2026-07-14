"use strict";

const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const envFile = path.resolve(projectRoot, "..", ".env");
const environments = ["development", "preview", "production"];
const requiredPublicKeys = [
	"EXPO_PUBLIC_API_BASE",
	"EXPO_PUBLIC_MICROSOFT_CLIENT_ID",
	"EXPO_PUBLIC_MICROSOFT_TENANT",
	"EXPO_PUBLIC_MICROSOFT_REDIRECT_URI",
	"EXPO_PUBLIC_EXPO_PROJECT_ID",
];
const optionalPublicKeys = ["EXPO_PUBLIC_MICROSOFT_WEB_REDIRECT_URI"];

function parseDotEnv(raw) {
	const parsed = {};
	for (const line of raw.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const equals = trimmed.indexOf("=");
		if (equals <= 0) continue;

		const key = trimmed.slice(0, equals).trim();
		let value = trimmed.slice(equals + 1).trim();
		if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
			value = value.slice(1, -1);
		}
		parsed[key] = value;
	}
	return parsed;
}

if (!fs.existsSync(envFile)) {
	throw new Error("Missing ../.env. Create it locally before synchronizing public EAS variables.");
}

const values = parseDotEnv(fs.readFileSync(envFile, "utf8"));
for (const key of requiredPublicKeys) {
	if (!values[key]) throw new Error(`Missing required public variable in ../.env: ${key}`);
}
const publicKeys = requiredPublicKeys.concat(optionalPublicKeys.filter((key) => values[key]));

const defaultEasBin =
	process.platform === "win32"
		? path.join(process.env.APPDATA || "", "npm", "node_modules", "eas-cli", "bin", "run")
		: "";
const easBin = process.env.EAS_CLI_BIN || defaultEasBin;
if (!easBin || !fs.existsSync(easBin)) {
	throw new Error("Set EAS_CLI_BIN to the EAS CLI bin/run path before synchronizing variables.");
}

const force = process.argv.includes("--force");
for (const key of publicKeys) {
	const args = [
		easBin,
		"env:create",
		"--name",
		key,
		"--value",
		values[key],
		"--type",
		"string",
		"--visibility",
		"plaintext",
		"--scope",
		"project",
		"--non-interactive",
	];
	for (const environment of environments) args.push("--environment", environment);
	if (force) args.push("--force");

	const result = childProcess.spawnSync(process.execPath, args, {
		cwd: projectRoot,
		stdio: "inherit",
	});
	if (result.status !== 0) process.exit(result.status ?? 1);
	console.log(`EAS public variable synchronized: ${key}`);
}
