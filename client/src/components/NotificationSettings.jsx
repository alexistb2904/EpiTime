import React from 'react';
import { useNotification } from '../context/NotificationContext';
import { usePushNotifications } from '../hooks/usePushNotifications';
import './NotificationSettings.css';

export const NotificationSettings = ({ isOpen, onClose, userEmail, userGroups = [] }) => {
	const { notificationSettings, updateSettings } = useNotification();
	const { sendTestNotification, registerPushNotifications, updateNotificationSettings } = usePushNotifications(userEmail, userGroups, notificationSettings);

	const daysOfWeek = [
		{ label: 'Lun', value: 1 },
		{ label: 'Mar', value: 2 },
		{ label: 'Mer', value: 3 },
		{ label: 'Jeu', value: 4 },
		{ label: 'Ven', value: 5 },
		{ label: 'Sam', value: 6 },
		{ label: 'Dim', value: 0 },
	];

	const handleToggleEnabled = async () => {
		if (!notificationSettings.enabled) {
			// Activer : demander permission d'abord
			if (!('Notification' in window)) {
				alert('Les notifications ne sont pas supportées sur ce navigateur');
				return;
			}

			if (Notification.permission === 'denied') {
				alert('Les notifications sont bloquées. Veuillez les autoriser dans les paramètres de votre navigateur.');
				return;
			}

			if (Notification.permission !== 'granted') {
				const permission = await Notification.requestPermission();
				if (permission !== 'granted') {
					alert('Permission de notification refusée');
					return;
				}
			}

			const subscription = await registerPushNotifications();
			if (!subscription) {
				alert("Impossible d'enregistrer les notifications push");
				return;
			}
		}

		updateSettings({ enabled: !notificationSettings.enabled });
	};

	const handleMinutesChange = (e) => {
		const value = Math.max(1, Math.min(120, parseInt(e.target.value) || 120));
		updateSettings({ minuesBefore: value });
		updateNotificationSettings({ ...notificationSettings, minuesBefore: value }, userGroups);
	};

	const handleDayToggle = (dayValue) => {
		const updated = notificationSettings.selectedDays.includes(dayValue)
			? notificationSettings.selectedDays.filter((d) => d !== dayValue)
			: [...notificationSettings.selectedDays, dayValue];
		updateSettings({ selectedDays: updated });
		updateNotificationSettings({ ...notificationSettings, selectedDays: updated }, userGroups);
	};

	const handleNotificationTypeChange = (e) => {
		updateSettings({ notificationType: e.target.value });
	};

	const handleSelectAllDays = () => {
		updateSettings({ selectedDays: [0, 1, 2, 3, 4, 5, 6] });
		updateNotificationSettings({ ...notificationSettings, selectedDays: [0, 1, 2, 3, 4, 5, 6] }, userGroups);
	};

	const handleDeselectAllDays = () => {
		updateSettings({ selectedDays: [] });
		updateNotificationSettings({ ...notificationSettings, selectedDays: [] }, userGroups);
	};

	if (!isOpen) return null;

	return (
		<div className="modal-overlay" onClick={onClose}>
			<div className="modal-content" onClick={(e) => e.stopPropagation()}>
				<div className="modal-header">
					<h2>⚙️ Paramètres des notifications</h2>
					<button className="close-btn" onClick={onClose}>
						✕
					</button>
				</div>
				<div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
					<div className="setting-group">
						<div className="setting-row">
							<label className="toggle-label">
								<input type="checkbox" checked={notificationSettings.enabled} onChange={handleToggleEnabled} className="toggle-input" />
								<span className="toggle-text">Activer les notifications</span>
							</label>
						</div>
					</div>

					{notificationSettings.enabled && (
						<>
							<div className="setting-group">
								<label className="setting-label">⏱️ Alerter avant (minutes)</label>
								<div className="minutes-control">
									<button className="minutes-btn" onClick={() => updateSettings({ minuesBefore: Math.max(1, notificationSettings.minuesBefore - 5) })}>
										−
									</button>
									<input type="number" value={notificationSettings.minuesBefore} onChange={handleMinutesChange} className="minutes-input" min="1" max="120" />
									<button className="minutes-btn" onClick={() => updateSettings({ minuesBefore: Math.min(120, notificationSettings.minuesBefore + 5) })}>
										+
									</button>
								</div>
								<small>Entre 1 et 120 minutes</small>
							</div>

							<div className="setting-group">
								<label className="setting-label">🔔 Type de notification</label>
								<div className="notification-type-options">
									<label>
										<input
											type="radio"
											name="notificationType"
											value="banner"
											checked={notificationSettings.notificationType === 'banner'}
											onChange={handleNotificationTypeChange}
										/>
										Bannière uniquement
									</label>
									<label>
										<input
											type="radio"
											name="notificationType"
											value="sound"
											checked={notificationSettings.notificationType === 'sound'}
											onChange={handleNotificationTypeChange}
										/>
										Son uniquement
									</label>
									<label>
										<input
											type="radio"
											name="notificationType"
											value="both"
											checked={notificationSettings.notificationType === 'both'}
											onChange={handleNotificationTypeChange}
										/>
										Bannière + Son
									</label>
								</div>
							</div>

							<div className="setting-group">
								<label className="setting-label">📅 Jours d'alerte</label>
								<div className="days-control">
									<button className="quick-select-btn" onClick={handleSelectAllDays}>
										Tous
									</button>
									<button className="quick-select-btn" onClick={handleDeselectAllDays}>
										Aucun
									</button>
								</div>
								<div className="days-grid">
									{daysOfWeek.map((day) => (
										<button
											key={day.value}
											className={`day-btn ${notificationSettings.selectedDays.includes(day.value) ? 'active' : ''}`}
											onClick={() => handleDayToggle(day.value)}>
											{day.label}
										</button>
									))}
								</div>
							</div>

							<div className="setting-group summary">
								<p>
									📌 <strong>Résumé :</strong> Vous recevrez une notification <strong>{notificationSettings.minuesBefore} minutes</strong> avant chaque cours sur{' '}
									<strong>{notificationSettings.selectedDays.length === 7 ? 'tous les jours' : `${notificationSettings.selectedDays.length} jours`}</strong>.
								</p>
							</div>

							<div className="setting-group">
								<label className="setting-label">🧪 Test des notifications</label>
								<div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
									<button className="btn-test" onClick={() => sendTestNotification('📚 Test - Notification Push', 'Les notifications sont bien activées!')}>
										Tester Push Notification
									</button>
									<button className="btn-test" onClick={() => registerPushNotifications()}>
										🔔 Réactiver notifications
									</button>
								</div>
							</div>
						</>
					)}
				</div>

				<div className="modal-footer">
					<button className="btn-primary" onClick={onClose}>
						Fermer
					</button>
				</div>
			</div>
		</div>
	);
};
