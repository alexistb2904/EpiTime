import React from "react";
import { useUniqueUsers } from "../hooks/useUniqueUsers";
import {
	analyticsConsentValues,
	disableAnalyticsTracking,
	enableAnalyticsTracking,
	getAnalyticsConsent,
	loadAnalyticsScript,
	setAnalyticsConsent,
} from "../utils/analyticsConsent";

const SettingsModal = ({ show, onClose }) => {
	const [analyticsEnabled, setAnalyticsEnabled] = React.useState(() => getAnalyticsConsent() === analyticsConsentValues.accepted);
	const { users, enabledAnalytics, loading: uniqueUsersLoading, error: uniqueUsersError, refresh } = useUniqueUsers({ enabled: show });
	const formattedUsers = typeof users === "number" ? new Intl.NumberFormat("fr-FR").format(users) : "—";

	React.useEffect(() => {
		if (!show) return;
		setAnalyticsEnabled(getAnalyticsConsent() === analyticsConsentValues.accepted);
	}, [show]);

	const handleToggleAnalytics = async () => {
		if (analyticsEnabled) {
			setAnalyticsConsent(analyticsConsentValues.declined);
			disableAnalyticsTracking();
			setAnalyticsEnabled(false);
			return;
		}

		setAnalyticsConsent(analyticsConsentValues.accepted);
		enableAnalyticsTracking();
		await loadAnalyticsScript();
		setAnalyticsEnabled(true);
	};

	if (!show) return null;

	return (
		<div
			className="modal-overlay"
			onClick={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}>
			<div className="modal-content settings-modal" onClick={(e) => e.stopPropagation()}>
				<div className="modal-header">
					<h2>⚙️ Paramètres & Informations</h2>
					<button
						className="btn-icon"
						onClick={(e) => {
							e.stopPropagation();
							onClose();
						}}>
						✕
					</button>
				</div>
				<div className="modal-body settings-body">
					<div className="settings-section">
						<h3 className="settings-section-title">🐞 Signaler un bug</h3>
						<p className="settings-text">Vous avez rencontré un problème ? Merci de le signaler pour améliorer l'application.</p>
						<a href="https://github.com/alexistb2904/EpiTime/issues/new" target="_blank" rel="noopener noreferrer" className="btn-primary settings-btn">
							📝 Signaler sur GitHub
						</a>
					</div>

					<div className="settings-divider"></div>

					<div className="settings-section disclaimer-section">
						<h3 className="settings-section-title">⚠️ Avertissement</h3>
						<div className="disclaimer-box">
							<p className="settings-text">
								<strong>Ce site n'est PAS affilié à :</strong>
							</p>
							<ul className="disclaimer-list">
								<li>❌ Zeus (plateforme officielle)</li>
								<li>❌ IONIS Education Group</li>
								<li>❌ EPITA</li>
							</ul>
							<p className="settings-text highlight">
								🎓 <strong>Projet étudiant indépendant</strong>
								<br />
								Cette application a été développée par un étudiant d'EPITA dans un cadre personnel.
							</p>
						</div>
					</div>

					<div className="settings-divider"></div>

					<div className="settings-section">
						<h3 className="settings-section-title">🔒 Confidentialité & Données</h3>
						<div className="privacy-box">
							<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.8rem", marginBottom: "0.8rem" }}>
								<strong>Analytics anonymes</strong>
								<button type="button" className="btn-primary settings-btn" onClick={handleToggleAnalytics} style={{ margin: 0 }}>
									{analyticsEnabled ? "Activé" : "Désactivé"}
								</button>
							</div>
							<p className="settings-text">
								<strong>Analytics d'usage anonymes (si vous acceptez les cookies)</strong>
								<br />
								<strong>Aucune identification utilisateur envoyée</strong>
								<br />
								<strong>Aucune donnée personnelle (email, nom, identifiant) transmise aux analytics</strong>
								<br />
								<strong>Authentification via Microsoft (EPITA)</strong>
								<br />
								<strong>Données stockées localement (navigateur uniquement)</strong>
							</p>
							<p className="settings-text muted">
								Vos préférences (groupes sélectionnés, thème, notifications, consentement analytics) sont stockées uniquement dans votre navigateur via
								localStorage.
							</p>
						</div>
					</div>

					<div className="settings-divider"></div>

					<div className="settings-section">
						<h3 className="settings-section-title">📊 Audience</h3>
						<div className="analytics-kpi-card">
							<div className="analytics-kpi-head">
								<span className="analytics-kpi-title">Utilisateurs uniques (total)</span>
							</div>
							<div className="analytics-kpi-value">{uniqueUsersLoading ? "…" : formattedUsers}</div>
							{uniqueUsersError && (
								<p className="settings-text" style={{ color: "#d32f2f" }}>
									Erreur API: {uniqueUsersError}
								</p>
							)}
							<button type="button" className="btn-primary settings-btn" onClick={refresh} style={{ margin: 0 }}>
								🔄 Actualiser
							</button>
						</div>
					</div>

					<div className="settings-divider"></div>

					<div className="settings-footer">
						<p className="settings-text muted small">
							Version 1.5.0 • Code source disponible sur{" "}
							<a
								href="https://github.com/alexistb2904/EpiTime"
								target="_blank"
								rel="noopener noreferrer"
								style={{ color: "var(--accent-color)", textDecoration: "none" }}>
								GitHub
							</a>
						</p>
					</div>
				</div>
			</div>
		</div>
	);
};

export default SettingsModal;
