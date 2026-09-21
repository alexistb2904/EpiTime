import * as FileSystem from "expo-file-system/legacy";
import { NativeModules, Platform } from "react-native";
import type { VersionCheckResult } from "./version";
import { normalizeVersion } from "./versionUtils";

type NativeAppUpdateModule = {
	canRequestPackageInstalls: () => Promise<boolean>;
	openUnknownAppSourcesSettings: () => Promise<void>;
	installApk: (fileUri: string, expectedSha256: string | null, expectedVersion: string | null) => Promise<void>;
};

export type UpdatePhase = "idle" | "available" | "downloading" | "permission" | "installing" | "error";

export type UpdateDownloadProgress = {
	progress: number;
	writtenBytes: number;
	totalBytes: number;
};

const nativeUpdater = NativeModules.EpiTimeAppUpdate as NativeAppUpdateModule | undefined;

function requireAndroidUpdater() {
	if (Platform.OS !== "android") throw new Error("Les mises à jour intégrées sont disponibles uniquement sur Android.");
	if (!nativeUpdater) throw new Error("Le module Android de mise à jour n'est pas disponible dans cette version d'EpiTime.");
	return nativeUpdater;
}

function getUpdateDirectory() {
	if (!FileSystem.cacheDirectory) throw new Error("Le cache local EpiTime n'est pas disponible.");
	return `${FileSystem.cacheDirectory}updates/`;
}

function getDestination(update: VersionCheckResult) {
	const version = normalizeVersion(update.latestVersion).replace(/[^0-9A-Za-z._-]/g, "-");
	return `${getUpdateDirectory()}EpiTime-${version}.apk`;
}

async function ensureUpdateDirectory() {
	await FileSystem.makeDirectoryAsync(getUpdateDirectory(), { intermediates: true });
}

async function removeQuietly(uri: string) {
	await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
}

function hasExpectedSize(info: FileSystem.FileInfo, expectedSize?: number) {
	if (!info.exists) return false;
	if (!expectedSize) return true;
	return "size" in info && info.size === expectedSize;
}

export function isIntegratedUpdateSupported() {
	return Platform.OS === "android" && Boolean(nativeUpdater);
}

export async function downloadUpdateApk(
	update: VersionCheckResult,
	onProgress?: (progress: UpdateDownloadProgress) => void
) {
	if (!update.downloadUrl || !update.apkAvailable) {
		throw new Error("La release GitHub ne contient pas d'APK Android installable.");
	}

	requireAndroidUpdater();
	await ensureUpdateDirectory();
	const destination = getDestination(update);
	const existing = await FileSystem.getInfoAsync(destination);

	if (hasExpectedSize(existing, update.apkSize)) {
		onProgress?.({
			progress: 1,
			writtenBytes: update.apkSize || ("size" in existing ? existing.size : 0),
			totalBytes: update.apkSize || ("size" in existing ? existing.size : 0),
		});
		return destination;
	}

	if (existing.exists) await removeQuietly(destination);

	const download = FileSystem.createDownloadResumable(
		update.downloadUrl,
		destination,
		{
			headers: {
				Accept: "application/octet-stream",
			},
		},
		(snapshot) => {
			const totalBytes = snapshot.totalBytesExpectedToWrite || update.apkSize || 0;
			const writtenBytes = snapshot.totalBytesWritten || 0;
			onProgress?.({
				progress: totalBytes > 0 ? Math.min(1, writtenBytes / totalBytes) : 0,
				writtenBytes,
				totalBytes,
			});
		}
	);

	const result = await download.downloadAsync();
	if (!result?.uri) {
		await removeQuietly(destination);
		throw new Error("Le téléchargement de la mise à jour n'a pas abouti.");
	}

	const info = await FileSystem.getInfoAsync(result.uri);
	if (!hasExpectedSize(info, update.apkSize)) {
		await removeQuietly(result.uri);
		throw new Error("L'APK téléchargé est incomplet. Réessaie le téléchargement.");
	}

	return result.uri;
}

export async function canInstallDownloadedApk() {
	return requireAndroidUpdater().canRequestPackageInstalls();
}

export async function openInstallPermissionSettings() {
	await requireAndroidUpdater().openUnknownAppSourcesSettings();
}

export async function installDownloadedApk(fileUri: string, update: VersionCheckResult) {
	await requireAndroidUpdater().installApk(fileUri, update.apkSha256 || null, normalizeVersion(update.latestVersion) || null);
}
