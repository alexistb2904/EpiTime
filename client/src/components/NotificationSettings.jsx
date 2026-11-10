import React from "react";
import { useNotification } from "../context/NotificationContext";
import { usePushNotifications } from "../hooks/usePushNotifications";
import { trackEvent } from "../utils/analyticsTracker";
import { AlertTriangle, Minus, Plus, RotateCcw, Send } from "lucide-react";
import Modal from "./Modal";

export const NotificationSettings = ({ onClose, userEmail, userGroups = [] }) => {
	const [problem, setProblem] = React.useState("");
	const { notificationSettings, updateSettings } = useNotification();
	const { sendTestNotification, registerPushNotifications, updateNotificationSettings } = usePushNotifications(userEmail, userGroups, notificationSettings);

	const daysOfWeek = [
		{ label: "Lun", value: 1 },
		{ label: "Mar", value: 2 },
		{ label: "Mer", value: 3 },
		{ label: "Jeu", value: 4 },
		{ label: "Ven", value: 5 },
		{ label: "Sam", value: 6 },
		{ label: "Dim", value: 0 },
	];

	const handleToggleEnabled = async () => {
		trackEvent("notification_toggle_clicked", {
			next_state: !notificationSettings.enabled ? "enabled" : "disabled",
		});

		setProblem("");
		if (!notificationSettings.enabled) {
			// Activer : demander permission d'abord
			if (!("Notification" in window)) {
				trackEvent("notification_permission_result", { result: "unsupported", source: "notification_settings" });
				setProblem("Ton navigateur ne gère pas les notifications. Installe l'app Android ou iPhone pour recevoir les rappels.");
				return;
			}

			if (Notification.permission === "denied") {
				trackEvent("notification_permission_result", { result: "denied", source: "notification_settings" });
				setProblem("Les notifications sont bloquées pour EpiTime. Autorise-les dans les réglages du site de ton navigateur, puis réessaie.");
				return;
			}

			if (Notification.permission !== "granted") {
				const permission = await Notification.requestPermission();
				trackEvent("notification_permission_result", { result: permission, source: "notification_settings" });
				if (permission !== "granted") {
					setProblem("Autorisation refusée : sans elle, EpiTime ne peut pas t'envoyer de rappel.");
					return;
				}
			} else {
				trackEvent("notification_permission_result", { result: "granted", source: "notification_settings" });
			}

			const subscription = await registerPushNotifications();
			trackEvent("notification_subscription_result", {
				result: subscription ? "success" : "failure",
				source: "notification_settings",
			});
			if (!subscription) {
				setProblem("Impossible d'enregistrer les notifications push. Vérifie ta connexion et réessaie.");
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

	const step = (delta) => {
		const value = Math.max(1, Math.min(120, notificationSettings.minuesBefore + delta));
		updateSettings({ minuesBefore: value });
		updateNotificationSettings({ ...notificationSettings, minuesBefore: value }, userGroups);
	};

	const dayCount = notificationSettings.selectedDays.length;

	return (
		<Modal className="notif-sheet paper-orange" title="Rappels de cours" onClose={onClose}>
			<div className="settings-row">
				<div>
					<h3>Notifications avant chaque cours</h3>
					<p>Une alerte sur cet appareil avant le début de tes cours.</p>
				</div>
				<input type="checkbox" role="switch" className="switch" checked={notificationSettings.enabled} onChange={handleToggleEnabled} aria-label="Activer les notifications" />
			</div>

			{problem && (
				<p className="pen-note" role="alert">
					<AlertTriangle size={18} strokeWidth={2.2} aria-hidden="true" />
					{problem}
				</p>
			)}

			{notificationSettings.enabled && (
				<>
					<div className="notif-field">
						<span className="label" id="notif-minutes">Prévenir</span>
						<div className="stepper" role="group" aria-labelledby="notif-minutes">
							<button type="button" className="tool" onClick={() => step(-5)} aria-label="5 minutes de moins">
								<Minus size={16} strokeWidth={2.4} aria-hidden="true" />
							</button>
							<input type="number" className="input" value={notificationSettings.minuesBefore} onChange={handleMinutesChange} min="1" max="120" aria-label="Minutes avant le cours" />
							<button type="button" className="tool" onClick={() => step(5)} aria-label="5 minutes de plus">
								<Plus size={16} strokeWidth={2.4} aria-hidden="true" />
							</button>
							<span>min avant</span>
						</div>
					</div>

					<fieldset className="notif-field">
						<legend className="label">Alerte</legend>
						<div className="seg">
							{[
								["banner", "Bannière"],
								["sound", "Son"],
								["both", "Bannière + son"],
							].map(([value, label]) => (
								<label key={value} className={notificationSettings.notificationType === value ? "is-on" : ""}>
									<input type="radio" name="notificationType" value={value} checked={notificationSettings.notificationType === value} onChange={handleNotificationTypeChange} />
									{label}
								</label>
							))}
						</div>
					</fieldset>

					<fieldset className="notif-field">
						<legend className="label">Jours</legend>
						<div className="days-row">
							{daysOfWeek.map((day) => {
								const on = notificationSettings.selectedDays.includes(day.value);
								return (
									<button key={day.value} type="button" className={`day-chip ${on ? "is-on" : ""}`} aria-pressed={on} onClick={() => handleDayToggle(day.value)}>
										{day.label}
									</button>
								);
							})}
							<button type="button" className="btn is-small" onClick={dayCount === 7 ? handleDeselectAllDays : handleSelectAllDays}>
								{dayCount === 7 ? "Aucun" : "Tous"}
							</button>
						</div>
					</fieldset>

					<p className="notif-summary">
						Rappel <strong>{notificationSettings.minuesBefore} min</strong> avant chaque cours,{" "}
						<strong>{dayCount === 7 ? "tous les jours" : dayCount === 0 ? "aucun jour" : `${dayCount} jour${dayCount > 1 ? "s" : ""} sur 7`}</strong>.
					</p>

					<div className="notif-actions">
						<button
							type="button"
							className="btn is-small"
							onClick={() => {
								trackEvent("notification_test_sent", { type: "push" });
								sendTestNotification("Test EpiTime", "Les notifications sont bien activées.");
							}}>
							<Send size={15} strokeWidth={2.2} aria-hidden="true" />
							Envoyer un test
						</button>
						<button
							type="button"
							className="btn is-small"
							onClick={() => {
								trackEvent("notification_reactivate_clicked");
								registerPushNotifications();
							}}>
							<RotateCcw size={15} strokeWidth={2.2} aria-hidden="true" />
							Réenregistrer cet appareil
						</button>
					</div>
				</>
			)}
		</Modal>
	);
};
