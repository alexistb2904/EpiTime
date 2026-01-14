import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import './Login.css';

const Login = () => {
	const { login, loading, error } = useAuth();
	const { theme, toggleTheme } = useTheme();

	return (
		<div className="login-container">
			<button className="theme-toggle-login" onClick={toggleTheme} title="Changer de thème">
				{theme === 'light' ? '🌙' : '☀️'}
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
						<button className="btn-login-primary" onClick={login} disabled={loading}>
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
						<p>Aucune donnée collectée, tout reste local, promis</p>
					</div>
				</div>

				<footer className="login-footer">
					<p className="footer-disclaimer">⚠️ Projet open-source étudiant indépendant • Non affilié à Zeus, IONIS ou EPITA</p>
				</footer>
			</div>
		</div>
	);
};

export default Login;
