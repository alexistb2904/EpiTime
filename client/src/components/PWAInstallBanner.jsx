import "./PWAInstallBanner.css";
import { androidAppDownloadUrl, iosAppDownloadUrl } from "../utils/downloadLinks";

export function PWAInstallBanner({ show, installMethod, onInstall, onDismiss, isAndroid = false, isIOS = false, androidApkUrl = androidAppDownloadUrl, onAndroidBetaInstall }) {
	if (!show) return null;

	const isManualIOSInstall = installMethod === "ios";

	const canShowPWAInstallButton = installMethod === "prompt" || installMethod === "ios" || isAndroid;

	const handleAndroidBetaClick = () => {
		if (onAndroidBetaInstall) {
			onAndroidBetaInstall();
			return;
		}

		window.open(androidApkUrl, "_blank", "noopener,noreferrer");
	};

	return (
		<div className="pwa-install-banner show">
			<div className="pwa-banner-content">
				<div className="pwa-banner-title">Installer EpiTime</div>

				<div className="pwa-banner-text">
					{isIOS
						? "EpiTime est disponible sur l'App Store pour iPhone et iPad."
						: isAndroid
							? "Installe EpiTime en PWA ou télécharge l'application Android beta."
							: "Accède rapidement à ton emploi du temps depuis ton écran d'accueil"}
				</div>

				{isAndroid && <div className="pwa-banner-beta">Application Android beta disponible.</div>}
			</div>

			<div className="pwa-banner-actions">
				{isIOS && (
					<a className="pwa-banner-btn install" href={iosAppDownloadUrl} target="_blank" rel="noopener noreferrer">
						Télécharger sur l’App Store
					</a>
				)}
				{isAndroid && (
					<button className="pwa-banner-btn install" onClick={handleAndroidBetaClick}>
						Télécharger APK
					</button>
				)}
				{canShowPWAInstallButton && (
					<button className="pwa-banner-btn install" onClick={onInstall}>
						{isManualIOSInstall ? "Voir comment" : "Installer PWA"}
					</button>
				)}

				<button className="pwa-banner-btn dismiss" onClick={onDismiss}>
					Plus tard
				</button>
			</div>
		</div>
	);
}
