import React from "react";
import { Calendar, Download, Palette } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useUniqueUsers } from "../hooks/useUniqueUsers";
import { trackEvent } from "../utils/analyticsTracker";
import { androidAppDownloadUrl } from "../utils/downloadLinks";
import "./Login.css";

const Login = () => {
	const { login, loading, error } = useAuth();
	const { theme, toggleTheme } = useTheme();
	const { users, enabledAnalytics, loading: uniqueUsersLoading } = useUniqueUsers();

	const formattedUsers = typeof users === "number" ? new Intl.NumberFormat("fr-FR").format(users) : "—";
	const showUserKpi = enabledAnalytics && !uniqueUsersLoading && typeof users === "number" && users > 10;

	const handleThemeToggle = () => {
		trackEvent("theme_toggle_clicked", {
			area: "login",
			to_theme: theme === "light" ? "dark" : "light",
		});
		toggleTheme();
	};

	const handleLoginClick = () => {
		trackEvent("login_button_clicked", {
			provider: "microsoft",
		});
		login();
	};

	const handleAndroidDownload = () => {
		trackEvent("android_download_clicked", {
			area: "login",
			destination: androidAppDownloadUrl,
		});
		window.open(androidAppDownloadUrl, "_blank", "noopener,noreferrer");
	};

	return (
		<div className="login-container">
			<div className="login-background" aria-hidden="true">
				<span className="login-grid"></span>
				<span className="login-signal login-signal-one"></span>
				<span className="login-signal login-signal-two"></span>
			</div>

			<button className={`theme-toggle-login ${theme === "light" ? "is-moon" : "is-sun"}`} onClick={handleThemeToggle} title="Changer de thème" aria-label="Changer de thème">
				<Palette size={18} strokeWidth={2.5} />
			</button>

			<div className="login-content">
				<header className="login-topbar">
					<a className="login-brand" href="/" aria-label="EpiTime">
						<img src="/icons/app_logo.png" alt="" className="login-brand-mark" />
						<span>EpiTime</span>
					</a>
				</header>

				<main className="login-hero">
					<section className="login-copy" aria-labelledby="login-title">
						<h1 id="login-title" className="login-title">
							EpiTime
						</h1>
						<p className="login-subtitle">
							Ton planning EPITA simple sur web, PWA et Android. Cours, salles et notifications tout a portée dans une interface soignée.
						</p>

						{error && (
							<div className="error-banner" role="alert">
								<span className="error-icon" aria-hidden="true"></span>
								<span className="error-text">{error}</span>
							</div>
						)}

						<div className="login-actions">
							<button className="btn-login-primary" onClick={handleLoginClick} disabled={loading}>
								{loading ? (
									<>
										<span className="btn-spinner"></span>
										<span>Connexion en cours...</span>
									</>
								) : (
									<>
										<span className="btn-microsoft" aria-hidden="true">
											<span></span>
											<span></span>
											<span></span>
											<span></span>
										</span>
										<span>Se connecter avec Microsoft</span>
									</>
								)}
							</button>

							<button className="btn-login-secondary" type="button" onClick={handleAndroidDownload}>
								<img className="btn-android-icon" src="/icons/android.svg" alt="" aria-hidden="true" />
								<span>Télécharger l'application Android</span>
							</button>
						</div>

						<p className="login-hint">Connexion réservée aux comptes EPITA en @epita.fr.</p>

						{showUserKpi && (
							<div className="kpi-hero-card">
								<span className="kpi-hero-label">Utilisateurs uniques</span>
								<div className="kpi-hero-value">{formattedUsers}</div>
								<p className="kpi-hero-caption">Mesure anonyme, avec consentement</p>
							</div>
						)}
					</section>

					<section className="login-showcase" aria-label="Aperçu EpiTime">
						<div className="schedule-preview">
							<div className="schedule-preview-header">
								<span>Mercredi</span>
								<strong>14:00</strong>
							</div>
							<div className="schedule-timeline">
								<div className="schedule-event schedule-event-primary">
									<span>14:00</span>
									<strong>Architecture logicielle</strong>
									<small>Amphi 4 - Kremlin Bicêtre</small>
								</div>
								<div className="schedule-event schedule-event-secondary">
									<span>16:15</span>
									<strong>Projet libre</strong>
									<small>Salle machines</small>
								</div>
								<div className="schedule-event schedule-event-dark">
									<span>18:00</span>
									<strong>Rappel live</strong>
									<small>Partialie Apprentissage 1</small>
								</div>
							</div>
						</div>

						<div className="android-card">
							<div className="android-card-glow" aria-hidden="true"></div>
							<div className="phone-frame">
								<div className="phone-speaker"></div>
								<img src="/icons/app_logo.png" alt="" className="phone-logo" />
								<span className="phone-label">EpiTime Android</span>
								<div className="phone-notification">
									<strong>Cours maintenant</strong>
									<span>Projet libre - 16h15</span>
								</div>
								<button className="phone-download" type="button" onClick={handleAndroidDownload}>
									Obtenir l'app
								</button>
							</div>
						</div>
					</section>
				</main>

				<section className="login-features" aria-label="Fonctionnalités">
					<article className="feature-card feature-card-web">
						<span className="feature-icon" aria-hidden="true">
							<Calendar size={23} strokeWidth={2.4} />
						</span>
						<h2>Lecture immédiate</h2>
						<p>Une vue claire de ta journée, des couleurs par groupe et des salles visibles sans fouiller.</p>
					</article>
					<article className="feature-card feature-card-install">
						<span className="feature-icon" aria-hidden="true">
							<Download size={23} strokeWidth={2.5} />
						</span>
						<h2>Installable partout</h2>
						<p>Garde EpiTime sur ton écran d'accueil en PWA, avec une expérience légère sur desktop et mobile.</p>
					</article>
					<article className="feature-card feature-card-android">
						<span className="feature-icon" aria-hidden="true">
							<img src="/icons/android.svg" alt="" />
						</span>
						<h2>Nouvelle app Android</h2>
						<p>Notifications, accès rapide et interface pensée pour consulter ton planning en déplacement.</p>
					</article>
				</section>

				<footer className="login-footer">
					<p className="footer-disclaimer">
						Projet open-source étudiant indépendant. Non affilié à Zeus, IONIS ou EPITA.{" "}
						<a href="https://github.com/alexistb2904/EpiTime" target="_blank" rel="noopener noreferrer">
							Voir sur GitHub
						</a>
					</p>
					<p className="footer-contact">
						Contact : <a href="mailto:alexistb2904@gmail.com">alexistb2904@gmail.com</a> ou alexistb2904 sur Discord
					</p>
				</footer>
			</div>
		</div>
	);
};

export default Login;
