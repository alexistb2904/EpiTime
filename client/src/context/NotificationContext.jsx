import React, { createContext, useContext, useState, useCallback } from 'react';

const NotificationContext = createContext();

export const NotificationProvider = ({ children }) => {
	const [notificationSettings, setNotificationSettings] = useState(() => {
		const saved = localStorage.getItem('notification-settings');
		return saved
			? JSON.parse(saved)
			: {
					enabled: false,
					minuesBefore: 15,
					selectedDays: [0, 1, 2, 3, 4, 5, 6],
					notificationType: 'both',
			  };
	});

	const updateSettings = useCallback((newSettings) => {
		setNotificationSettings((prev) => {
			const updated = { ...prev, ...newSettings };
			localStorage.setItem('notification-settings', JSON.stringify(updated));
			return updated;
		});
	}, []);

	const shouldNotifyForEvent = useCallback(
		(event) => {
			if (!notificationSettings.enabled) return false;

			const eventDate = new Date(event.start);
			const dayOfWeek = eventDate.getDay();
			return notificationSettings.selectedDays.includes(dayOfWeek);
		},
		[notificationSettings]
	);

	const getNotificationTime = useCallback(
		(eventStart) => {
			const eventDate = new Date(eventStart);
			const notificationDate = new Date(eventDate.getTime() - notificationSettings.minuesBefore * 60000);
			return notificationDate;
		},
		[notificationSettings.minuesBefore]
	);

	return (
		<NotificationContext.Provider
			value={{
				notificationSettings,
				updateSettings,
				shouldNotifyForEvent,
				getNotificationTime,
			}}>
			{children}
		</NotificationContext.Provider>
	);
};

export const useNotification = () => {
	const context = useContext(NotificationContext);
	if (!context) {
		throw new Error('useNotification doit être utilisé dans NotificationProvider');
	}
	return context;
};
