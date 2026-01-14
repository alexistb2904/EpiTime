import React from 'react';

const CalendarHeader = ({ currentDate, setCurrentDate, handleNav, viewMode, setViewMode, scheduleContext, resetContext, sidebarOpen, setSidebarOpen, logout }) => {
	return (
		<header className="calendar-header">
			<div className="header-section header-left">
				<button className="btn-icon hamburger-btn" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Menu">
					☰
				</button>

				<div className="date-navigation">
					<button className="btn-icon nav-btn" onClick={() => handleNav(-1)} aria-label="Semaine précédente">
						‹
					</button>
					<button className="btn-today" onClick={() => setCurrentDate(new Date())}>
						Aujourd'hui
					</button>
					<button className="btn-icon nav-btn" onClick={() => handleNav(1)} aria-label="Semaine suivante">
						›
					</button>
				</div>

				<h2 className="current-date">{currentDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</h2>
			</div>

			<div className="header-section header-center">
				{scheduleContext.type !== 'group' && (
					<div className="context-badge">
						<span className="context-icon">{scheduleContext.type === 'single-group' ? '👥' : '📅'}</span>
						<span className="context-label">{scheduleContext.label}</span>
						<button className="context-close" onClick={resetContext} title="Retour à mes groupes">
							×
						</button>
					</div>
				)}
			</div>

			<div className="header-section header-right">
				<div className="view-switcher">
					<button className={`view-btn ${viewMode === 'week' ? 'active' : ''}`} onClick={() => setViewMode('week')} title="Vue semaine">
						<span className="desktop-label">Semaine</span>
						<span className="mobile-icon">📅</span>
					</button>
					<button className={`view-btn ${viewMode === 'list' ? 'active' : ''}`} onClick={() => setViewMode('list')} title="Vue liste">
						<span className="desktop-label">Liste</span>
						<span className="mobile-icon">📋</span>
					</button>
				</div>

				<div className="header-actions">
					<button className="btn-icon logout-btn desktop-only" onClick={logout} title="Déconnexion">
						<span className="desktop-label">Déconnexion</span>
						<span className="mobile-icon">🚪</span>
					</button>
				</div>
			</div>
		</header>
	);
};

export default CalendarHeader;
