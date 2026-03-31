import React from 'react';

const SettingsModal = ({ show, onClose }) => {
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
							<p className="settings-text">
								<strong>Aucune donnée n'est collectée</strong>
								<br /><strong>Aucune base de données</strong>
								<br /><strong>Authentification via Microsoft (EPITA)</strong>
								<br /><strong>Données stockées localement (navigateur uniquement)</strong>
							</p>
							<p className="settings-text muted">Vos préférences (groupes sélectionnés, thème) sont stockées uniquement dans votre navigateur via localStorage.</p>
						</div>
					</div>

					<div className="settings-divider"></div>

					<div className="settings-footer">
						<p className="settings-text muted small">Version 1.0.0 • Code source disponible sur <a href="https://github.com/alexistb2904/EpiTime" target="_blank" rel="noopener noreferrer">GitHub</a></p>
					</div>
				</div>
			</div>
		</div>
	);
};

export default SettingsModal;
