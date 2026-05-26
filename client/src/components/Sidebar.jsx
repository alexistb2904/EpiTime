import React from "react";
import ReactCalendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import { Bell, LogOut, Moon, Plus, Settings, Sun } from "lucide-react";
import { trackEvent } from "../utils/analyticsTracker";
import { androidAppDownloadUrl } from "../utils/downloadLinks";

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
	const handleAndroidDownload = () => {
		trackEvent("android_download_clicked", {
			area: "sidebar",
			destination: androidAppDownloadUrl,
		});
		window.open(androidAppDownloadUrl, "_blank", "noopener,noreferrer");
	};

	return (
		<div className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
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
				<div className="sidebar-section-head">
					<h3 className="sidebar-title">Groupe sélectionnés</h3>
					<button
						className="btn-icon sidebar-add-btn"
						onClick={() => setShowGroupModal(true)}
						title="Modifier la sélection">
						<Plus size={16} strokeWidth={2.6} />
					</button>
				</div>
				<div className="group-list">
					{selectedGroups.map((id) => {
						const group = groups.find((g) => g.id === id);
						return (
							<div key={id} className="group-item active" onClick={() => toggleGroup(id)}>
								<div
									className="group-checkbox"
									style={{ borderColor: group?.color || "var(--text-secondary)", backgroundColor: group?.color || "transparent" }}></div>
								<span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{group ? group.name : id}</span>
							</div>
						);
					})}
					{selectedGroups.length === 0 && (
						<div className="empty-state-sidebar" style={{ color: "var(--text-secondary)", fontSize: "0.9rem", fontStyle: "italic" }}>
							Aucun groupe sélectionné
						</div>
					)}
				</div>
			</div>

			<div className="sidebar-footer">
				<button className="sidebar-btn sidebar-download-btn" onClick={handleAndroidDownload}>
					<img src="/icons/android.svg" alt="" className="sidebar-btn-img" aria-hidden="true" />
					<span>Télécharger Android</span>
				</button>
				<button
					className="sidebar-btn"
					onClick={() => {
						trackEvent("theme_toggle_clicked", {
							area: "sidebar",
							to_theme: theme === "light" ? "dark" : "light",
						});
						toggleTheme();
					}}>
					<span className="sidebar-btn-icon">{theme === "light" ? <Moon size={18} strokeWidth={2.3} /> : <Sun size={18} strokeWidth={2.3} />}</span>
					<span>Thème {theme === "light" ? "Sombre" : "Clair"}</span>
				</button>
				<button className="sidebar-btn" onClick={() => setShowNotificationsModal(true)}>
					<span className="sidebar-btn-icon">
						<Bell size={18} strokeWidth={2.3} />
					</span>
					<span>Notifications</span>
				</button>
				<button className="sidebar-btn" onClick={() => setShowSettingsModal(true)}>
					<span className="sidebar-btn-icon">
						<Settings size={18} strokeWidth={2.3} />
					</span>
					<span>Paramètres</span>
				</button>
				<button className="sidebar-btn logout-sidebar-btn" onClick={logout}>
					<span className="sidebar-btn-icon">
						<LogOut size={18} strokeWidth={2.3} />
					</span>
					<span>Déconnexion</span>
				</button>
			</div>
		</div>
	);
};

export default Sidebar;
