import './PWAInstallBanner.css';

export function PWAInstallBanner({ show, onInstall, onDismiss }) {
	if (!show) return null;

	return (
		<div className="pwa-install-banner show">
			<div className="pwa-banner-content">
				<div className="pwa-banner-title">📱 Installer EpiTime</div>
				<div className="pwa-banner-text">Accède rapidement à ton emploi du temps depuis ton écran d'accueil</div>
			</div>
			<div className="pwa-banner-actions">
				<button className="pwa-banner-btn install" onClick={onInstall}>
					Installer
				</button>
				<button className="pwa-banner-btn dismiss" onClick={onDismiss}>
					Plus tard
				</button>
			</div>
		</div>
	);
}
