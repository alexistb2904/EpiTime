import React from "react";
import { Building2, CalendarDays, ChevronLeft, ChevronRight, List, Menu } from "lucide-react";

const formatWeekLabel = (start) => {
	const end = new Date(start);
	end.setDate(end.getDate() + 6);
	const sameMonth = start.getMonth() === end.getMonth();
	const left = start.toLocaleDateString("fr-FR", sameMonth ? { day: "numeric" } : { day: "numeric", month: "short" });
	const right = end.toLocaleDateString("fr-FR", { day: "numeric", month: sameMonth ? "long" : "short" });
	return { label: `${left} – ${right}`, year: end.getFullYear() };
};

const CalendarHeader = ({ weekStart, isOnToday, handleNav, goToToday, viewMode, setViewMode, sidebarOpen, setSidebarOpen, onOpenRoomFinder }) => (
	<header className="app-bar">
		<button
			type="button"
			className="tool is-bare app-menu-btn"
			onClick={() => setSidebarOpen(!sidebarOpen)}
			aria-label="Ouvrir le classeur (groupes, filtres, réglages)"
			aria-expanded={sidebarOpen}>
			<Menu size={20} strokeWidth={2.2} aria-hidden="true" />
		</button>

		<div className="app-brand">
			<img src="/icons/app_logo.png" alt="" width="34" height="34" />
			<span>EpiTime</span>
		</div>

		<div className="app-nav">
			<button type="button" className="tool is-bare" onClick={() => handleNav(-1)} aria-label="Semaine précédente">
				<ChevronLeft size={20} strokeWidth={2.2} aria-hidden="true" />
			</button>
			<button type="button" className="btn is-small" onClick={goToToday} disabled={isOnToday}>
				Aujourd'hui
			</button>
			<button type="button" className="tool is-bare" onClick={() => handleNav(1)} aria-label="Semaine suivante">
				<ChevronRight size={20} strokeWidth={2.2} aria-hidden="true" />
			</button>
		</div>

		<h1 className="app-title" aria-live="polite">
			{formatWeekLabel(weekStart).label} <span className="app-title-year">{formatWeekLabel(weekStart).year}</span>
		</h1>

		<div className="app-actions">
			<div className="seg" role="group" aria-label="Affichage">
				<button type="button" className={viewMode === "week" ? "is-on" : ""} aria-pressed={viewMode === "week"} onClick={() => setViewMode("week")}>
					<CalendarDays size={16} strokeWidth={2.2} aria-hidden="true" />
					<span>Semaine</span>
				</button>
				<button type="button" className={viewMode === "list" ? "is-on" : ""} aria-pressed={viewMode === "list"} onClick={() => setViewMode("list")}>
					<List size={16} strokeWidth={2.2} aria-hidden="true" />
					<span>Liste</span>
				</button>
			</div>
			<button type="button" className="btn app-rooms-btn" onClick={onOpenRoomFinder} aria-label="Salles libres">
				<Building2 size={17} strokeWidth={2.2} aria-hidden="true" />
				<span>Salles libres</span>
			</button>
		</div>
	</header>
);

export default CalendarHeader;
