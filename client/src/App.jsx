import React from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { NotificationProvider } from './context/NotificationContext';
import Login from './components/Login';
import Calendar from './components/Calendar';
import { PWAInstallBanner } from './components/PWAInstallBanner';
import { usePWA } from './hooks/usePWA';
import './App.css';

function AppContent() {
	const { user, loading } = useAuth();
	const { showInstallBanner, isOnline, handleInstall, handleDismiss } = usePWA();

	React.useEffect(() => {
		document.body.classList.toggle('offline', !isOnline);
	}, [isOnline]);

	if (loading) {
		return (
			<div className="loading-screen">
				<div className="spinner"></div>
				<p>Chargement...</p>
			</div>
		);
	}

	return (
		<>
			<PWAInstallBanner show={showInstallBanner} onInstall={handleInstall} onDismiss={handleDismiss} />
			{user ? <Calendar /> : <Login />}
		</>
	);
}

function App() {
	return (
		<ThemeProvider>
			<AuthProvider>
				<NotificationProvider>
					<AppContent />
				</NotificationProvider>
			</AuthProvider>
		</ThemeProvider>
	);
}

export default App;
