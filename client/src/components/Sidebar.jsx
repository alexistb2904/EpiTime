import React from 'react';
import ReactCalendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';

const Sidebar = ({
	sidebarOpen,
	currentDate,
	setCurrentDate,
	selectedGroups,
	groups,
	toggleGroup,
	setShowGroupModal,
	theme,
	toggleTheme,
	setShowSettingsModal,
	setShowNotificationsModal,
	logout,
}) => {
	return (
		<div className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
			<div className="sidebar-header">
				<div className="sidebar-logo">EpiTime</div>
			</div>

			<div className="sidebar-section sidebar-calendar-card">
				<ReactCalendar
					value={currentDate}
					onChange={(date) => {
						if (date) setCurrentDate(date);
					}}
					locale="fr-FR"
					view="month"
					next2Label={null}
					prev2Label={null}
					className="sidebar-calendar"
				/>
			</div>

			<div className="sidebar-section">
				<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
					<h3 className="sidebar-title">Filtres sélectionnés</h3>
					<button
						className="btn-icon"
						style={{ padding: '4px', width: '24px', height: '24px', fontSize: '0.9rem' }}
						onClick={() => setShowGroupModal(true)}
						title="Modifier la sélection">
						+
					</button>
				</div>
				<div className="filter-list">
					{selectedGroups.map((id) => {
						const group = groups.find((g) => g.id === id);
						return (
							<div key={id} className="filter-item active" onClick={() => toggleGroup(id)}>
								<div
									className="filter-checkbox"
									style={{ borderColor: group?.color || 'var(--text-secondary)', backgroundColor: group?.color || 'transparent' }}></div>
								<span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{group ? group.name : id}</span>
							</div>
						);
					})}
					{selectedGroups.length === 0 && (
						<div className="empty-state-sidebar" style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontStyle: 'italic' }}>
							Aucun groupe sélectionné
						</div>
					)}
				</div>
			</div>

			<div className="sidebar-footer">
				<button className="sidebar-btn" onClick={toggleTheme}>
					<span>{theme === 'light' ? '🌙' : '☀️'}</span>
					<span>Thème {theme === 'light' ? 'Sombre' : 'Clair'}</span>
				</button>
				<button className="sidebar-btn" onClick={() => setShowNotificationsModal(true)}>
					<span>🔔</span>
					<span>Notifications</span>
				</button>
				<button className="sidebar-btn" onClick={() => setShowSettingsModal(true)}>
					<span>⚙️</span>
					<span>Paramètres</span>
				</button>
				<button className="sidebar-btn logout-sidebar-btn" onClick={logout}>
					<span>🚪</span>
					<span>Déconnexion</span>
				</button>
			</div>
		</div>
	);
};

export default Sidebar;
