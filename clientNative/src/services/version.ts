import Constants from "expo-constants";
import { isVersionNewer, normalizeVersion } from "./versionUtils";

export const EPITIME_REPOSITORY_URL = "https://github.com/alexistb2904/EpiTime";
const LATEST_RELEASE_API_URL = "https://api.github.com/repos/alexistb2904/EpiTime/releases/latest";

type GitHubReleaseAsset = {
	name?: string;
	browser_download_url?: string;
	content_type?: string;
	size?: number;
	digest?: string | null;
};

type GitHubRelease = {
	tag_name?: string;
	name?: string;
	html_url?: string;
	body?: string | null;
	published_at?: string | null;
	assets?: GitHubReleaseAsset[];
};

export type VersionCheckResult = {
	currentVersion: string;
	latestVersion: string;
	latestReleaseUrl: string;
	downloadUrl?: string;
	apkName?: string;
	apkSize?: number;
	apkSha256?: string;
	apkAvailable: boolean;
	releaseNotes?: string;
	publishedAt?: string;
	updateAvailable: boolean;
};

export function getCurrentAppVersion() {
	return Constants.nativeAppVersion || Constants.expoConfig?.version || "0.0.0";
}

function getReleaseVersion(release: GitHubRelease) {
	const version = release.tag_name || release.name;
	if (!version) throw new Error("La dernière release GitHub ne contient pas de version.");
	return version;
}

function getApkAsset(release: GitHubRelease) {
	const assets = (release.assets || []).filter(
		(asset) => asset.browser_download_url && asset.name?.toLowerCase().endsWith(".apk")
	);
	if (!assets.length) return undefined;

	return (
		assets.find((asset) => {
			const name = asset.name?.toLowerCase() || "";
			return name.includes("release") && !name.includes("debug");
		}) || assets.find((asset) => !asset.name?.toLowerCase().includes("debug")) || assets[0]
	);
}

function extractSha256(digest?: string | null) {
	if (!digest) return undefined;
	const match = digest.match(/^sha256:([a-f0-9]{64})$/i);
	return match?.[1]?.toLowerCase();
}

export async function checkAppVersion(): Promise<VersionCheckResult> {
	const response = await fetch(LATEST_RELEASE_API_URL, {
		headers: {
			Accept: "application/vnd.github+json",
			"X-GitHub-Api-Version": "2026-03-10",
		},
	});

	if (!response.ok) {
		throw new Error(`GitHub a répondu ${response.status}.`);
	}

	const release = (await response.json()) as GitHubRelease;
	const currentVersion = getCurrentAppVersion();
	const latestVersion = getReleaseVersion(release);
	const latestReleaseUrl = release.html_url || EPITIME_REPOSITORY_URL;
	const apkAsset = getApkAsset(release);

	return {
		currentVersion,
		latestVersion,
		latestReleaseUrl,
		downloadUrl: apkAsset?.browser_download_url,
		apkName: apkAsset?.name,
		apkSize: apkAsset?.size,
		apkSha256: extractSha256(apkAsset?.digest),
		apkAvailable: Boolean(apkAsset?.browser_download_url),
		releaseNotes: release.body?.trim() || undefined,
		publishedAt: release.published_at || undefined,
		updateAvailable: isVersionNewer(normalizeVersion(latestVersion), normalizeVersion(currentVersion)),
	};
}
