import React, { useMemo, useState } from "react";
import ReactCalendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import { Bell, ChevronDown, LogOut, Moon, Plus, Settings, Sun } from "lucide-react";
import { trackEvent } from "../utils/analyticsTracker";
import { androidAppDownloadUrl } from "../utils/downloadLinks";
import { filterCalendarFilterOptions } from "../utils/calendarFilters";

const FilterSelectionSection = ({ title, items, selectedIds, search, setSearch, onToggle, getLabel, searchPlaceholder, emptyLabel, loading }) => {
	const [expanded, setExpanded] = useState(true);
	const filteredItems = useMemo(() => filterCalendarFilterOptions(items, search, getLabel), [items, search, getLabel]);
	const selectedItems = useMemo(() => items.filter((item) => selectedIds.includes(item.id)), [items, selectedIds]);
	const displayedItems = search.trim() ? filteredItems : selectedItems;

	return (
		<section className={`sidebar-section sidebar-filter-section ${expanded ? "is-expanded" : ""}`}>
			<div className="sidebar-section-head">
				<h3 className="sidebar-title">{title}</h3>
				<button
					type="button"
					className="btn-icon sidebar-collapse-btn"
					onClick={() => setExpanded((value) => !value)}
					aria-expanded={expanded}
					aria-label={expanded ? `Réduire la section ${title}` : `Développer la section ${title}`}>
					<ChevronDown size={16} strokeWidth={2.6} />
				</button>
			</div>

			{expanded && (
				<div className="sidebar-filter-content">
					<input
						className="sidebar-filter-search"
						placeholder={searchPlaceholder}
						value={search}
						onChange={(event) => setSearch(event.target.value)}
						aria-label={searchPlaceholder}
					/>
					<div className="group-list sidebar-filter-list">
						{loading ? (
							<div className="empty-state-sidebar">Chargement…</div>
						) : displayedItems.length > 0 ? (
							displayedItems.map((item) => {
								const isSelected = selectedIds.includes(item.id);
								return (
									<button
										type="button"
										key={item.id}
										className={`group-item sidebar-filter-item ${isSelected ? "active" : ""}`}
										onClick={() => onToggle(item.id)}>
										<div className="group-checkbox" aria-hidden="true"></div>
										<span>{getLabel(item)}</span>
									</button>
								);
							})
						) : (
							<div className="empty-state-sidebar">{search.trim() ? "Aucun résultat" : emptyLabel}</div>
						)}
					</div>
				</div>
			)}
		</section>
	);
};

const Sidebar = ({
	sidebarOpen,
	currentDate,
	setCurrentDate,
	selectedGroups,
	groups,
	toggleGroup,
	setShowGroupModal,
	selectedRooms,
	rooms,
	roomSearch,
	setRoomSearch,
	toggleRoom,
	selectedTeachers,
	teachers,
	teacherSearch,
	setTeacherSearch,
	toggleTeacher,
	filterOptionsLoading,
	theme,
	toggleTheme,
	setShowSettingsModal,
	setShowNotificationsModal,
	logout,
}) => {
	const handleAndroidDownload = () => {
		trackEvent("android_download_clicked", {
			area: "sidebar",
			channel: "github_releases",
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

			<section className="sidebar-section">
				<div className="sidebar-section-head">
					<h3 className="sidebar-title">Groupes sélectionnés</h3>
					<button className="btn-icon sidebar-add-btn" onClick={() => setShowGroupModal(true)} title="Modifier la sélection">
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
			</section>

			<FilterSelectionSection
				title="Salles"
				items={rooms}
				selectedIds={selectedRooms}
				search={roomSearch}
				setSearch={setRoomSearch}
				onToggle={toggleRoom}
				getLabel={(room) => room.name || `Salle #${room.id}`}
				searchPlaceholder="Rechercher une salle…"
				emptyLabel=""
				loading={filterOptionsLoading}
			/>

			<FilterSelectionSection
				title="Enseignants"
				items={teachers}
				selectedIds={selectedTeachers}
				search={teacherSearch}
				setSearch={setTeacherSearch}
				onToggle={toggleTeacher}
				getLabel={(teacher) => `${teacher.firstname || ""} ${teacher.name || ""}`.trim() || `Enseignant #${teacher.id}`}
				searchPlaceholder="Rechercher un enseignant…"
				emptyLabel=""
				loading={filterOptionsLoading}
			/>

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
