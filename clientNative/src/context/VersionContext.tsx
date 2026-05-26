import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Alert, Linking, Platform, ToastAndroid } from "react-native";
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
	checkForUpdates: (manual?: boolean) => Promise<VersionCheckResult | null>;
	openLatestRelease: () => Promise<void>;
};

const VersionContext = createContext<VersionContextValue | null>(null);

function showToast(message: string) {
	if (Platform.OS === "android") {
		ToastAndroid.show(message, ToastAndroid.LONG);
		return;
	}
	Alert.alert("EpiTime", message);
}

export function VersionProvider({ children }: { children: React.ReactNode }) {
	const [result, setResult] = useState<VersionCheckResult | null>(null);
	const [checking, setChecking] = useState(false);
	const [error, setError] = useState<string | undefined>();
	const [lastCheckedAt, setLastCheckedAt] = useState<Date | undefined>();

	const checkForUpdates = useCallback(async (manual = false) => {
		setChecking(true);
		setError(undefined);

		try {
			const next = await checkAppVersion();
			setResult(next);
			setLastCheckedAt(new Date());

			if (next.updateAvailable) {
				showToast(`Version ${next.latestVersion} disponible. Votre version : ${next.currentVersion}.`);
			} else if (manual) {
				showToast("EpiTime est à jour.");
			}

			return next;
		} catch (err: any) {
			const message = err?.message || "Vérification impossible.";
			setError(message);
			if (manual) showToast(`Vérification impossible : ${message}`);
			return null;
		} finally {
			setChecking(false);
		}
	}, []);

	const openLatestRelease = useCallback(async () => {
		await Linking.openURL(result?.downloadUrl || result?.latestReleaseUrl || EPITIME_REPOSITORY_URL);
	}, [result?.downloadUrl, result?.latestReleaseUrl]);

	useEffect(() => {
		checkForUpdates(false);
	}, [checkForUpdates]);

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
			checkForUpdates,
			openLatestRelease,
		}),
		[checking, checkForUpdates, error, lastCheckedAt, openLatestRelease, result]
	);

	return <VersionContext.Provider value={value}>{children}</VersionContext.Provider>;
}

export function useVersion() {
	const value = useContext(VersionContext);
	if (!value) throw new Error("useVersion hors VersionProvider");
	return value;
}
