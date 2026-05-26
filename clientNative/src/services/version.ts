import Constants from "expo-constants";

export const EPITIME_REPOSITORY_URL = "https://github.com/alexistb2904/EpiTime";
const LATEST_RELEASE_API_URL = "https://api.github.com/repos/alexistb2904/EpiTime/releases/latest";

type GitHubRelease = {
	tag_name?: string;
	name?: string;
	html_url?: string;
	assets?: {
		name?: string;
		browser_download_url?: string;
	}[];
};

export type VersionCheckResult = {
	currentVersion: string;
	latestVersion: string;
	latestReleaseUrl: string;
	downloadUrl: string;
	updateAvailable: boolean;
};

export function getCurrentAppVersion() {
	return Constants.nativeAppVersion || Constants.expoConfig?.version || "0.0.0";
}

function normalizeVersion(version: string) {
	return version.trim().replace(/^v/i, "").split("+")[0].split("-")[0];
}

function getReleaseVersion(release: GitHubRelease) {
	const version = release.tag_name || release.name;
	if (!version) throw new Error("La dernière release GitHub ne contient pas de version.");
	return version;
}

function getDownloadUrl(release: GitHubRelease) {
	const apkAsset = release.assets?.find((asset) => asset.browser_download_url && asset.name?.toLowerCase().endsWith(".apk"));
	return apkAsset?.browser_download_url || release.html_url || EPITIME_REPOSITORY_URL;
}

export async function checkAppVersion(): Promise<VersionCheckResult> {
	const response = await fetch(LATEST_RELEASE_API_URL, {
		headers: {
			Accept: "application/vnd.github+json",
			"X-GitHub-Api-Version": "2022-11-28",
		},
	});

	if (!response.ok) {
		throw new Error(`GitHub a répondu ${response.status}.`);
	}

	const release = (await response.json()) as GitHubRelease;
	const currentVersion = getCurrentAppVersion();
	const latestVersion = getReleaseVersion(release);
	const latestReleaseUrl = release.html_url || EPITIME_REPOSITORY_URL;

	return {
		currentVersion,
		latestVersion,
		latestReleaseUrl,
		downloadUrl: getDownloadUrl(release),
		updateAvailable: normalizeVersion(currentVersion) !== normalizeVersion(latestVersion),
	};
}
