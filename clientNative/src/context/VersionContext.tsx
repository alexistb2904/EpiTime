import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Alert, AppState, Linking, Platform, ToastAndroid } from "react-native";
import AppUpdateModal from "../components/AppUpdateModal";
import {
	canInstallDownloadedApk,
	downloadUpdateApk,
	installDownloadedApk,
	isIntegratedUpdateSupported,
	openInstallPermissionSettings,
	type UpdatePhase,
} from "../services/appUpdate";
import { getJSON, setJSON } from "../services/storage";
import { EPITIME_REPOSITORY_URL, VersionCheckResult, checkAppVersion, getCurrentAppVersion } from "../services/version";

type VersionContextValue = {
	currentVersion: string;
	latestVersion?: string;
	latestReleaseUrl?: string;
	downloadUrl?: string;
	updateAvailable: boolean;
	checking: boolean;
	error?: string;
	lastCheckedAt?: Date;
	updatePhase: UpdatePhase;
	updateProgress: number;
	updateError?: string;
	checkForUpdates: (manual?: boolean) => Promise<VersionCheckResult | null>;
	openLatestRelease: () => Promise<void>;
	startUpdate: () => Promise<void>;
	showUpdatePrompt: () => void;
};

const VersionContext = createContext<VersionContextValue | null>(null);

const UPDATE_CACHE_KEY = "epitime.androidUpdateCheck";
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

type CachedUpdateCheck = {
	checkedAt: number;
	result: VersionCheckResult;
};

function showToast(message: string) {
	if (Platform.OS === "android") {
		ToastAndroid.show(message, ToastAndroid.LONG);
		return;
	}
	Alert.alert("EpiTime", message);
}

function getErrorMessage(error: unknown) {
	if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
		return error.message;
	}
	return "Impossible de terminer la mise à jour.";
}

export function VersionProvider({ children }: { children: React.ReactNode }) {
	const [result, setResult] = useState<VersionCheckResult | null>(null);
	const [checking, setChecking] = useState(false);
	const [error, setError] = useState<string | undefined>();
	const [lastCheckedAt, setLastCheckedAt] = useState<Date | undefined>();
	const [updatePhase, setUpdatePhase] = useState<UpdatePhase>("idle");
	const [updatePromptVisible, setUpdatePromptVisible] = useState(false);
	const [updateProgress, setUpdateProgress] = useState(0);
	const [updateWrittenBytes, setUpdateWrittenBytes] = useState(0);
	const [updateTotalBytes, setUpdateTotalBytes] = useState(0);
	const [updateError, setUpdateError] = useState<string | undefined>();
	const [downloadedUri, setDownloadedUri] = useState<string | null>(null);

	const checkForUpdates = useCallback(async (manual = false) => {
		setChecking(true);
		setError(undefined);

		try {
			const next = await checkAppVersion();
			const checkedAt = Date.now();
			setResult(next);
			setLastCheckedAt(new Date(checkedAt));
			if (Platform.OS === "android") {
				void setJSON<CachedUpdateCheck>(UPDATE_CACHE_KEY, { checkedAt, result: next }).catch(() => {});
			}

			if (next.updateAvailable) {
				setUpdatePhase((current) => (current === "downloading" || current === "installing" || current === "permission" ? current : "available"));
				if (Platform.OS === "android") setUpdatePromptVisible(true);
				else if (manual) showToast(`Version ${next.latestVersion} disponible.`);
			} else {
				setUpdatePhase("idle");
				setUpdatePromptVisible(false);
				setDownloadedUri(null);
				if (manual) showToast("EpiTime est à jour.");
			}

			return next;
		} catch (err: unknown) {
			const message = getErrorMessage(err) || "Vérification impossible.";
			setError(message);
			if (manual) showToast(`Vérification impossible : ${message}`);
			return null;
		} finally {
			setChecking(false);
		}
	}, []);

	const openLatestRelease = useCallback(async () => {
		await Linking.openURL(result?.latestReleaseUrl || EPITIME_REPOSITORY_URL);
	}, [result?.latestReleaseUrl]);

	const failUpdate = useCallback((err: unknown) => {
		setUpdateError(getErrorMessage(err));
		setUpdatePhase("error");
		setUpdatePromptVisible(true);
	}, []);

	const continueInstall = useCallback(
		async (uri: string, update: VersionCheckResult) => {
			const allowed = await canInstallDownloadedApk();
			if (!allowed) {
				setUpdatePhase("permission");
				setUpdatePromptVisible(true);
				return;
			}

			setUpdatePhase("installing");
			setUpdatePromptVisible(true);
			await installDownloadedApk(uri, update);

			// Android now owns the next screen. If the user cancels the system
			// installer, the cached APK remains ready for a second attempt.
			setUpdatePromptVisible(false);
			setUpdatePhase("available");
		},
		[]
	);

	const startUpdate = useCallback(async () => {
		if (Platform.OS !== "android" || !isIntegratedUpdateSupported()) {
			await openLatestRelease();
			return;
		}

		if (updatePhase === "permission") {
			try {
				await openInstallPermissionSettings();
			} catch (err) {
				failUpdate(err);
			}
			return;
		}

		if (!result?.updateAvailable) {
			await checkForUpdates(true);
			return;
		}

		if (!result.apkAvailable || !result.downloadUrl) {
			await openLatestRelease();
			return;
		}

		setUpdatePromptVisible(true);
		setUpdateError(undefined);

		try {
			let uri = downloadedUri;
			if (!uri) {
				setUpdatePhase("downloading");
				setUpdateProgress(0);
				setUpdateWrittenBytes(0);
				setUpdateTotalBytes(result.apkSize || 0);
				uri = await downloadUpdateApk(result, (progress) => {
					setUpdateProgress(progress.progress);
					setUpdateWrittenBytes(progress.writtenBytes);
					setUpdateTotalBytes(progress.totalBytes || result.apkSize || 0);
				});
				setDownloadedUri(uri);
			}

			setUpdateProgress(1);
			await continueInstall(uri, result);
		} catch (err) {
			failUpdate(err);
		}
	}, [checkForUpdates, continueInstall, downloadedUri, failUpdate, openLatestRelease, result, updatePhase]);

	const showUpdatePrompt = useCallback(() => {
		if (result?.updateAvailable && Platform.OS === "android") setUpdatePromptVisible(true);
	}, [result?.updateAvailable]);

	const dismissUpdatePrompt = useCallback(() => {
		if (updatePhase === "downloading" || updatePhase === "installing") return;
		setUpdatePromptVisible(false);
	}, [updatePhase]);

	useEffect(() => {
		if (Platform.OS !== "android") return;
		let active = true;

		void (async () => {
			const cached = await getJSON<CachedUpdateCheck | null>(UPDATE_CACHE_KEY, null).catch(() => null);
			if (!active) return;

			const currentVersion = getCurrentAppVersion();
			const cacheIsFresh =
				cached &&
				cached.result.currentVersion === currentVersion &&
				Date.now() - cached.checkedAt < UPDATE_CHECK_INTERVAL_MS;

			if (cacheIsFresh && cached) {
				setResult(cached.result);
				setLastCheckedAt(new Date(cached.checkedAt));
				if (cached.result.updateAvailable) {
					setUpdatePhase("available");
					setUpdatePromptVisible(true);
				}
				return;
			}

			await checkForUpdates(false);
		})();

		return () => {
			active = false;
		};
	}, [checkForUpdates]);

	useEffect(() => {
		if (Platform.OS !== "android" || updatePhase !== "permission" || !downloadedUri || !result) return;

		const subscription = AppState.addEventListener("change", (state) => {
			if (state !== "active") return;
			void (async () => {
				try {
					if (!(await canInstallDownloadedApk())) return;
					await continueInstall(downloadedUri, result);
				} catch (err) {
					failUpdate(err);
				}
			})();
		});

		return () => subscription.remove();
	}, [continueInstall, downloadedUri, failUpdate, result, updatePhase]);

	const value = useMemo(
		() => ({
			currentVersion: result?.currentVersion || getCurrentAppVersion(),
			latestVersion: result?.latestVersion,
			latestReleaseUrl: result?.latestReleaseUrl,
			downloadUrl: result?.downloadUrl,
			updateAvailable: Boolean(result?.updateAvailable),
			checking,
			error,
			lastCheckedAt,
			updatePhase,
			updateProgress,
			updateError,
			checkForUpdates,
			openLatestRelease,
			startUpdate,
			showUpdatePrompt,
		}),
		[
			checking,
			checkForUpdates,
			error,
			lastCheckedAt,
			openLatestRelease,
			result,
			showUpdatePrompt,
			startUpdate,
			updateError,
			updatePhase,
			updateProgress,
		]
	);

	return (
		<VersionContext.Provider value={value}>
			{children}
			{Platform.OS === "android" ? (
				<AppUpdateModal
					visible={updatePromptVisible}
					update={result}
					phase={updatePhase}
					progress={updateProgress}
					writtenBytes={updateWrittenBytes}
					totalBytes={updateTotalBytes}
					error={updateError}
					onPrimary={() => void startUpdate()}
					onDismiss={dismissUpdatePrompt}
					onOpenRelease={() => void openLatestRelease()}
				/>
			) : null}
		</VersionContext.Provider>
	);
}

export function useVersion() {
	const value = useContext(VersionContext);
	if (!value) throw new Error("useVersion hors VersionProvider");
	return value;
}
