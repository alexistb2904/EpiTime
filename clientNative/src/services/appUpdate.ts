import { Directory, File, Paths } from "expo-file-system";
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
	return new Directory(Paths.cache, "updates");
}

function getDestination(update: VersionCheckResult) {
	const version = normalizeVersion(update.latestVersion).replace(/[^0-9A-Za-z._-]/g, "-");
	return new File(getUpdateDirectory(), `EpiTime-${version}.apk`);
}

function removeQuietly(file: File) {
	try {
		if (file.exists) file.delete();
	} catch {}
}

function hasExpectedSize(file: File, expectedSize?: number) {
	if (!file.exists) return false;
	if (!expectedSize) return true;
	return file.size === expectedSize;
}

export function isIntegratedUpdateSupported() {
	return Platform.OS === "android" && Boolean(nativeUpdater);
}

export async function downloadUpdateApk(update: VersionCheckResult, onProgress?: (progress: UpdateDownloadProgress) => void) {
	if (!update.downloadUrl || !update.apkAvailable) {
		throw new Error("La release GitHub ne contient pas d'APK Android installable.");
	}

	requireAndroidUpdater();
	getUpdateDirectory().create({ intermediates: true, idempotent: true });
	const destination = getDestination(update);

	if (hasExpectedSize(destination, update.apkSize)) {
		const size = update.apkSize || destination.size;
		onProgress?.({ progress: 1, writtenBytes: size, totalBytes: size });
		return destination.uri;
	}

	removeQuietly(destination);

	let result: File;
	try {
		result = await File.downloadFileAsync(update.downloadUrl, destination, {
			headers: { Accept: "application/octet-stream" },
			onProgress: ({ bytesWritten, totalBytes: reportedTotal }) => {
				const totalBytes = reportedTotal || update.apkSize || 0;
				onProgress?.({
					progress: totalBytes > 0 ? Math.min(1, bytesWritten / totalBytes) : 0,
					writtenBytes: bytesWritten,
					totalBytes,
				});
			},
		});
	} catch {
		removeQuietly(destination);
		throw new Error("Le téléchargement de la mise à jour n'a pas abouti.");
	}

	if (!hasExpectedSize(result, update.apkSize)) {
		removeQuietly(result);
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
