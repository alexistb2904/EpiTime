import React from "react";
import { Building2, CalendarDays, ChevronLeft, ChevronRight, List, LogOut, Menu } from "lucide-react";

const CalendarHeader = ({
	currentDate,
	setCurrentDate,
	handleNav,
	viewMode,
	setViewMode,
	scheduleContext,
	resetContext,
	sidebarOpen,
	setSidebarOpen,
	logout,
	onOpenRoomFinder,
}) => {
	return (
		<header className="calendar-header">
			<div className="header-section header-left">
				<button className="btn-icon hamburger-btn" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Menu">
					<Menu size={21} strokeWidth={2.4} />
				</button>

				<div className="date-navigation">
					<button className="btn-icon nav-btn" onClick={() => handleNav(-1)} aria-label="Semaine précédente">
						<ChevronLeft size={20} strokeWidth={2.5} />
					</button>
					<button className="btn-today" onClick={() => setCurrentDate(new Date())}>
						Aujourd'hui
					</button>
					<button className="btn-icon nav-btn" onClick={() => handleNav(1)} aria-label="Semaine suivante">
						<ChevronRight size={20} strokeWidth={2.5} />
					</button>
				</div>

				<h2 className="current-date">{currentDate.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}</h2>
			</div>

			<div className="header-section header-center">
				{scheduleContext.type !== "group" && (
					<div className="context-badge">
						<span className="context-icon">{scheduleContext.type === "single-group" ? "👥" : "📅"}</span>
						<span className="context-label">{scheduleContext.label}</span>
						<button className="context-close" onClick={resetContext} title="Retour à mes groupes">
							×
						</button>
					</div>
				)}
			</div>

			<div className="header-section header-right">
				<div className="view-switcher">
					<button className={`view-btn ${viewMode === "week" ? "active" : ""}`} onClick={() => setViewMode("week")} title="Vue semaine">
						<span className="desktop-label">Semaine</span>
						<span className="mobile-icon">
							<CalendarDays size={18} strokeWidth={2.4} />
						</span>
					</button>
					<button className={`view-btn ${viewMode === "list" ? "active" : ""}`} onClick={() => setViewMode("list")} title="Vue liste">
						<span className="desktop-label">Liste</span>
						<span className="mobile-icon">
							<List size={18} strokeWidth={2.4} />
						</span>
					</button>
				</div>

				<div className="header-actions">
					<button className="btn-icon room-finder-btn" onClick={onOpenRoomFinder} title="Trouver une salle libre">
						<span className="desktop-label">Salles libres</span>
						<span className="mobile-icon">
							<Building2 size={18} strokeWidth={2.4} />
						</span>
					</button>
					<button className="btn-icon logout-btn desktop-only" onClick={logout} title="Déconnexion">
						<span className="desktop-label">Déconnexion</span>
						<span className="mobile-icon">
							<LogOut size={18} strokeWidth={2.4} />
						</span>
					</button>
				</div>
			</div>
		</header>
	);
};

export default CalendarHeader;
