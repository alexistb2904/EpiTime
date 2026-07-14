import React from "react";
import {
	analyticsConsentValues,
	disableAnalyticsTracking,
	enableAnalyticsTracking,
	getAnalyticsConsent,
	loadAnalyticsScript,
	setAnalyticsConsent,
} from "../utils/analyticsConsent";
import "./LegalPage.css";

const LAST_UPDATED = "15 juillet 2026";

export default function LegalPage() {
	const [analyticsEnabled, setAnalyticsEnabled] = React.useState(() => getAnalyticsConsent() === analyticsConsentValues.accepted);

	const updateAnalyticsConsent = React.useCallback(async (enabled) => {
		setAnalyticsConsent(enabled ? analyticsConsentValues.accepted : analyticsConsentValues.declined);
		if (enabled) {
			enableAnalyticsTracking();
			await loadAnalyticsScript();
		} else {
			disableAnalyticsTracking();
		}
		setAnalyticsEnabled(enabled);
	}, []);

	return (
		<main className="legal-page">
			<div className="legal-orbit legal-orbit--one" aria-hidden="true" />
			<div className="legal-orbit legal-orbit--two" aria-hidden="true" />
			<div className="legal-shell">
				<header className="legal-header">
					<a className="legal-brand" href="/" aria-label="Retour à l'accueil EpiTime">
						<img src="/icons/app_logo.png" alt="" />
						<span>EpiTime</span>
					</a>
					<a className="legal-back" href="/">
						Retour à l'application
					</a>
				</header>

				<section className="legal-hero" aria-labelledby="legal-title">
					<p className="legal-eyebrow">TRANSPARENCE &amp; DONNÉES</p>
					<h1 id="legal-title">
						Politique de confidentialité
						<br />
						et mentions légales
					</h1>
					<p>Les informations utiles pour comprendre les données utilisées par EpiTime, les choix disponibles et les contacts à connaître.</p>
					<span className="legal-updated">Dernière mise à jour : {LAST_UPDATED}</span>
				</section>

				<nav className="legal-nav" aria-label="Sommaire">
					<a href="#privacy">Confidentialité</a>
					<a href="#cookies">Cookies &amp; audience</a>
					<a href="#rights">Vos droits</a>
					<a href="#mentions">Mentions légales</a>
				</nav>

				<section id="privacy" className="legal-section">
					<div className="legal-section-intro">
						<p className="legal-kicker">01 - Confidentialité</p>
						<h2>Ce qu'EpiTime traite</h2>
					</div>
					<div className="legal-copy">
						<p>
							EpiTime est un projet étudiant indépendant qui permet de consulter les données auxquelles l'utilisateur accède avec ses comptes EPITA. Il n'est pas
							affilié à EPITA, IONIS Education Group, Zeus ou Auriga.
						</p>
						<p>
							Le responsable du traitement des données propres à EpiTime est <strong>Alexis Thierry-Bellefond</strong>. Pour toute question :{" "}
							<a href="mailto:alexistb2904@gmail.com">alexistb2904@gmail.com</a>.
						</p>
					</div>
					<div className="legal-table-wrap">
						<table className="legal-table">
							<thead>
								<tr>
									<th>Données et emplacement</th>
									<th>Finalité</th>
									<th>Base et durée</th>
								</tr>
							</thead>
							<tbody>
								<tr>
									<td>Compte Microsoft, jetons de session Zeus et informations de planning</td>
									<td>Authentifier l'utilisateur et afficher son agenda, ses groupes et les salles.</td>
									<td>
										Nécessaire à la fourniture du service demandé. Les données de session et caches restent sur l'appareil jusqu'à la déconnexion ou leur
										suppression par l'utilisateur.
									</td>
								</tr>
								<tr>
									<td>Notes, syllabus, identifiants ou jetons Auriga (mobile, si la fonction est utilisée)</td>
									<td>Afficher les notes et contenus Auriga, y compris hors ligne lorsque le cache est actif.</td>
									<td>
										Nécessaire à la fonction demandée. Les jetons et identifiants mémorisés sont stockés dans l'espace sécurisé du terminal les caches sont
										supprimables depuis l'application.
									</td>
								</tr>
								<tr>
									<td>Préférences locales : thème, groupes, réglages de notifications, événements, notes, photos et fichiers ajoutés par l'utilisateur</td>
									<td>Personnaliser l'application et assurer le fonctionnement hors ligne, des widgets et rappels.</td>
									<td>
										Exécution du service demandé. Les notes, photos et fichiers restent sur l'appareil ils ne sont pas envoyés au serveur EpiTime.
										Conservation jusqu'à leur suppression, la déconnexion ou la désinstallation selon la donnée.
									</td>
								</tr>
								<tr>
									<td>Jeton de notification web ou Expo, identifiant de compte, groupes et réglages (si les notifications sont activées)</td>
									<td>Envoyer les rappels et notifications demandés.</td>
									<td>
										Consentement et action de l'utilisateur. La souscription est retirée à la désactivation ou à la déconnexion l'enregistrement serveur
										associé est alors supprimé.
									</td>
								</tr>
							</tbody>
						</table>
					</div>
					<div className="legal-note">
						<strong>Destinataires.</strong> EpiTime ne vend pas les données personnelles et ne les utilise pas pour de la publicité ciblée. Microsoft, Zeus et Auriga
						reçoivent les requêtes nécessaires aux fonctions que vous activez. Pour les notifications mobiles, le jeton et le contenu de la notification sont transmis à
						Expo, puis au service de notification du système d'exploitation. Ces services appliquent leurs propres politiques de confidentialité.
					</div>
				</section>

				<section id="cookies" className="legal-section legal-section--split">
					<div className="legal-section-intro">
						<p className="legal-kicker">02 - Cookies &amp; audience</p>
						<h2>La mesure d'audience reste votre choix.</h2>
					</div>
					<div className="legal-copy">
						<p>
							Sur le site web, EpiTime charge Rybbit uniquement après votre accord. Rybbit est auto-hébergé sur le même VPS OVHcloud qu'EpiTime : il ne constitue donc
							pas un destinataire externe. Il mesure l'audience à partir de données techniques limitées, dont l'agent utilisateur, les pages consultées et une
							position géographique très approximative. EpiTime n'y envoie ni nom, ni adresse e-mail, ni identifiant de compte, ni jeton d'authentification.
						</p>
						<p>
							La mesure sert uniquement à améliorer l'application et le site. Elle ne sert ni à la publicité ciblée ni au suivi entre sites. Le refus n'empêche pas
							l'utilisation d'EpiTime et votre choix peut être modifié à tout moment ici ou dans les paramètres web.
						</p>
						<div className="legal-consent" aria-live="polite">
							<div>
								<strong>Mesure d'audience</strong>
								<span>{analyticsEnabled ? "Activée" : "Désactivée"}</span>
							</div>
							<div className="legal-consent-actions">
								<button type="button" className="legal-button legal-button--outline" onClick={() => void updateAnalyticsConsent(false)}>
									Refuser / retirer
								</button>
								<button type="button" className="legal-button" onClick={() => void updateAnalyticsConsent(true)}>
									Accepter
								</button>
							</div>
						</div>
					</div>
				</section>

				<section id="rights" className="legal-section legal-section--split">
					<div className="legal-section-intro">
						<p className="legal-kicker">03 - Vos droits</p>
						<h2>Vous gardez la main.</h2>
					</div>
					<div className="legal-copy">
						<p>
							Vous pouvez demander l'accès, la rectification, l'effacement, la limitation, l'opposition ou la portabilité de vos données lorsque ces droits
							s'appliquent. Écrivez à <a href="mailto:alexistb2904@gmail.com?subject=EpiTime%20-%20exercice%20de%20mes%20droits">alexistb2904@gmail.com</a> en
							précisant votre demande et le compte concerné.
						</p>
						<p>
							Vous pouvez aussi supprimer les données locales depuis les réglages de l'appareil, vous déconnecter, désactiver les notifications ou retirer votre
							consentement à l'audience. Si vous estimez que vos droits ne sont pas respectés, vous pouvez saisir la{" "}
							<a href="https://www.cnil.fr/fr/plaintes" target="_blank" rel="noreferrer">
								CNIL
							</a>
							.
						</p>
						<p>EpiTime ne réalise pas de décision automatisée produisant des effets juridiques à votre égard.</p>
					</div>
				</section>

				<section id="mentions" className="legal-section legal-section--mentions">
					<div className="legal-section-intro">
						<p className="legal-kicker">04 - Mentions légales</p>
						<h2>Édition, contenu et code.</h2>
					</div>
					<div className="legal-copy legal-mentions-grid">
						<div>
							<h3>Éditeur</h3>
							<p>
								Alexis Thierry-Bellefond
								<br />
								<a href="mailto:alexistb2904@gmail.com">alexistb2904@gmail.com</a>
								<br />
								Projet personnel, non professionnel et indépendant.
							</p>
						</div>
						<div>
							<h3>Hébergement</h3>
							<p>
								L'application, son API et Rybbit sont hébergés sur le même VPS OVHcloud. Coolify est utilisé sur ce serveur uniquement comme outil de déploiement
								il n'est pas un hébergeur ou un destinataire distinct.
								<br />
								<strong>OVH SAS</strong>, SAS au capital de 50 000 000 €, RCS Lille Métropole 424 761 419 00045
								<br />2 rue Kellermann, 59100 Roubaix, France
							</p>
						</div>
						<div>
							<h3>Propriété intellectuelle</h3>
							<p>
								Le code source d'EpiTime est publié sous licence MIT. Les marques, services et données de Zeus, Auriga, EPITA et IONIS restent la propriété de leurs
								titulaires respectifs.
							</p>
						</div>
						<div>
							<h3>Responsabilité</h3>
							<p>
								EpiTime affiche des informations issues de services tiers. L'utilisateur doit vérifier les informations importantes auprès des plateformes
								officielles. L'éditeur ne garantit pas l'exactitude ou la disponibilité permanente de ces services.
							</p>
						</div>
					</div>
				</section>

				<div className="legal-bottom-back">
					<a className="legal-button legal-bottom-back__button" href="/">
						Retour à l'accueil
					</a>
				</div>
			</div>
		</main>
	);
}
