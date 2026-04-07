import React from "react";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useUniqueUsers } from "../hooks/useUniqueUsers";
import { trackEvent } from "../utils/analyticsTracker";
import "./Login.css";

const Login = () => {
	const { login, loading, error } = useAuth();
	const { theme, toggleTheme } = useTheme();
	const { users, enabledAnalytics, loading: uniqueUsersLoading } = useUniqueUsers();

	const formattedUsers = typeof users === "number" ? new Intl.NumberFormat("fr-FR").format(users) : "—";

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

	return (
		<div className="login-container">
			<button className="theme-toggle-login" onClick={handleThemeToggle} title="Changer de thème">
				{theme === "light" ? "🌙" : "☀️"}
			</button>

			<div className="login-content">
				<div className="login-card">
					<div className="login-header">
						<h1 className="login-title">Bienvenue sur EpiTime</h1>
						<p className="login-subtitle">Ton emploi du temps, enfin bien fait ✨</p>
					</div>

					{error && (
						<div className="error-banner">
							<span className="error-icon">⚠️</span>
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
									<span className="btn-icon">🔐</span>
									<span>Se connecter avec Microsoft</span>
								</>
							)}
						</button>

						<p className="login-hint">
							<span className="hint-icon">ℹ️</span>
							Utilise ton compte EPITA (@epita.fr)
						</p>
					</div>
					{/* Avant 10 utilisateurs, on affiche pas pour éviter de faire peur aux nouveaux mdr */}
					{enabledAnalytics && !uniqueUsersLoading && formattedUsers > 10 && (
						<div className="kpi-hero-card">
							<span className="kpi-hero-label">Utilisateurs utilisant EpiTime</span>
							<div className="kpi-hero-value">{uniqueUsersLoading ? "…" : formattedUsers}</div>
							<p className="kpi-hero-caption">Total d'utilisateurs uniques</p>
						</div>
					)}
				</div>

				<div className="login-features">
					<div className="feature-card">
						<div className="feature-icon">📅</div>
						<h3>PWA</h3>
						<p>Installe le site en tant qu'application</p>
					</div>
					<div className="feature-card">
						<div className="feature-icon">🎨</div>
						<h3>Quelque chose de.. beau ?</h3>
						<p>Oui enfin, un emploi du temps agréable à utiliser</p>
					</div>
					<div className="feature-card">
						<div className="feature-icon">🔒</div>
						<h3>Confidentialité</h3>
						<p>Mesure d'usage anonyme uniquement et sous réserve de consentement</p>
					</div>
				</div>

				<footer className="login-footer">
					<p className="footer-disclaimer">
						⚠️ Projet open-source étudiant indépendant • Non affilié à Zeus, IONIS ou EPITA •{" "}
						<a href="https://github.com/alexistb2904/EpiTime" target="_blank" rel="noopener noreferrer">
							Voir sur GitHub
						</a>
					</p>
					<p className="footer-contact">
						📬 Contact : <a href="mailto:alexistb2904@gmail.com">alexistb2904@gmail.com</a> ou alexistb2904 sur Discord
					</p>
				</footer>
			</div>
		</div>
	);
};

export default Login;
