const fs = require("node:fs");
const path = require("node:path");

function parseDotEnv(raw) {
	const parsed = {};
	for (const line of raw.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const eqIndex = trimmed.indexOf("=");
		if (eqIndex <= 0) continue;

		const key = trimmed.slice(0, eqIndex).trim();
		let value = trimmed.slice(eqIndex + 1).trim();

		if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
			value = value.slice(1, -1);
		}

		parsed[key] = value;
	}
	return parsed;
}

function loadRootEnv() {
	const rootEnvPath = path.resolve(__dirname, "../.env");
	if (!fs.existsSync(rootEnvPath)) return {};
	return parseDotEnv(fs.readFileSync(rootEnvPath, "utf8"));
}

module.exports = ({ config }) => {
	const rootEnv = loadRootEnv();
	const extra = config.extra || {};

	const read = (key, fallback) => {
		const value = process.env[key] || rootEnv[key] || fallback;
		return typeof value === "string" && value.trim() ? value.trim() : undefined;
	};

	const expoProjectId = read("EXPO_PUBLIC_EXPO_PROJECT_ID", extra.eas?.projectId);
	const appGroupIdentifier = "group.fr.alexistb2904.epitime";

	return {
		...config,
		ios: {
			...config.ios,
			entitlements: {
				...config.ios?.entitlements,
				"com.apple.security.application-groups": [appGroupIdentifier],
			},
		},
		extra: {
			...extra,
			apiBase: read("EXPO_PUBLIC_API_BASE", extra.apiBase),
			microsoftClientId: read("EXPO_PUBLIC_MICROSOFT_CLIENT_ID", extra.microsoftClientId),
			microsoftTenant: read("EXPO_PUBLIC_MICROSOFT_TENANT", extra.microsoftTenant),
			microsoftRedirectUri: read("EXPO_PUBLIC_MICROSOFT_REDIRECT_URI", extra.microsoftRedirectUri),
			microsoftWebRedirectUri: read("EXPO_PUBLIC_MICROSOFT_WEB_REDIRECT_URI", extra.microsoftWebRedirectUri),
			expoProjectId,
			eas: {
				...extra.eas,
				projectId: expoProjectId || extra.eas?.projectId,
			},
		},
	};
};
