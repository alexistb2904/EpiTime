import React from "react";
import { ArrowUpRight, RefreshCw } from "lucide-react";
import Modal from "./Modal";
import { useUniqueUsers } from "../hooks/useUniqueUsers";
import {
	analyticsConsentValues,
	disableAnalyticsTracking,
	enableAnalyticsTracking,
	getAnalyticsConsent,
	loadAnalyticsScript,
	setAnalyticsConsent,
} from "../utils/analyticsConsent";
import { trackEvent } from "../utils/analyticsTracker";

const SettingsModal = ({ onClose }) => {
	const [analyticsEnabled, setAnalyticsEnabled] = React.useState(() => getAnalyticsConsent() === analyticsConsentValues.accepted);
	const { users, enabledAnalytics, loading: uniqueUsersLoading, error: uniqueUsersError, refresh } = useUniqueUsers({ enabled: true });
	const formattedUsers = typeof users === "number" ? new Intl.NumberFormat("fr-FR").format(users) : "-";

	const handleToggleAnalytics = async () => {
		if (analyticsEnabled) {
			setAnalyticsConsent(analyticsConsentValues.declined);
			const mustReload = disableAnalyticsTracking();
			setAnalyticsEnabled(false);
			if (mustReload) window.location.reload();
			return;
		}

		setAnalyticsConsent(analyticsConsentValues.accepted);
		enableAnalyticsTracking();
		await loadAnalyticsScript();
		setAnalyticsEnabled(true);
	};

	return (
		<Modal className="settings-sheet paper-lilac" title="Paramètres" onClose={onClose}>
			<section className="settings-block">
				<div className="settings-row">
					<div>
						<h3>Mesure d'audience auto-hébergée</h3>
						<p>Mesure d'usage limitée, après ton accord : un identifiant aléatoire local par navigateur. Aucun nom, e-mail, identifiant de compte ou jeton n'est transmis à Rybbit.</p>
					</div>
					<input
						type="checkbox"
						role="switch"
						className="switch"
						checked={analyticsEnabled}
						onChange={handleToggleAnalytics}
						aria-label="Mesure d'audience"
					/>
				</div>
				<ul className="settings-facts">
					<li>Authentification via Microsoft (EPITA).</li>
					<li>Tes préférences (groupes sélectionnés, thème, notifications, consentement analytics) sont stockées uniquement dans ton navigateur via localStorage.</li>
				</ul>
				<a href="/legal" className="settings-link">
					Politique de confidentialité et mentions légales
					<ArrowUpRight size={15} strokeWidth={2.2} aria-hidden="true" />
				</a>
			</section>

			<section className="settings-block">
				<div className="settings-row">
					<div>
						<h3>Utilisateurs uniques (total)</h3>
						<p className="settings-kpi">{uniqueUsersLoading ? "…" : formattedUsers}</p>
						{uniqueUsersError && <p className="settings-error">Impossible de charger le compteur : {uniqueUsersError}</p>}
					</div>
					<button type="button" className="tool" onClick={refresh} aria-label="Actualiser le compteur" disabled={uniqueUsersLoading}>
						<RefreshCw size={17} strokeWidth={2.2} aria-hidden="true" />
					</button>
				</div>
			</section>

			<section className="settings-block">
				<div className="settings-row">
					<div>
						<h3>Signaler un bug</h3>
						<p>Un problème ? Signale-le pour améliorer l'application.</p>
					</div>
					<a
						href="https://github.com/alexistb2904/EpiTime/issues/new"
						onClick={() => trackEvent("bug_report_opened", { source: "settings" })}
						target="_blank"
						rel="noopener noreferrer"
						className="btn is-small">
						Ouvrir une issue
						<ArrowUpRight size={15} strokeWidth={2.2} aria-hidden="true" />
					</a>
				</div>
			</section>

			<section className="settings-block settings-disclaimer">
				<h3>Projet étudiant indépendant</h3>
				<p>
					Développé par un étudiant d'EPITA dans un cadre personnel. <strong>Non affilié</strong> à Zeus (plateforme officielle), IONIS Education Group ni EPITA.
				</p>
			</section>

			<p className="modal-hint">
				Version 1.5.0 · Code source sur{" "}
				<a href="https://github.com/alexistb2904/EpiTime" target="_blank" rel="noopener noreferrer">
					GitHub
				</a>
			</p>
		</Modal>
	);
};

export default SettingsModal;
