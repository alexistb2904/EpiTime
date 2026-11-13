import React, { useEffect, useMemo, useState } from "react";
import ReactCalendar from "react-calendar";
import { Bell, ChevronDown, Download, LogOut, Moon, Settings, Sun, X } from "lucide-react";
import { trackEvent } from "../utils/analyticsTracker";
import { androidAppDownloadUrl, iosAppDownloadUrl } from "../utils/downloadLinks";
import { filterCalendarFilterOptions } from "../utils/calendarFilters";

const getRoomLabel = (room) => room.name || `Salle #${room.id}`;
const getTeacherLabel = (teacher) => `${teacher.firstname || ""} ${teacher.name || ""}`.trim() || `Enseignant #${teacher.id}`;

const FilterSelectionSection = ({ title, items, selectedIds, onToggle, getLabel, searchPlaceholder, loading }) => {
	const [expanded, setExpanded] = useState(selectedIds.length > 0);
	const [search, setSearch] = useState("");
	const filteredItems = useMemo(() => filterCalendarFilterOptions(items, search, getLabel), [items, search, getLabel]);
	const selectedItems = useMemo(() => items.filter((item) => selectedIds.includes(item.id)), [items, selectedIds]);
	const displayedItems = search.trim() ? filteredItems.slice(0, 40) : selectedItems;

	return (
		<section className="drawer-section">
			<button type="button" className="drawer-section-toggle" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
				<h3>{title}</h3>
				{selectedIds.length > 0 && <span className="drawer-count">{selectedIds.length}</span>}
				<ChevronDown size={16} strokeWidth={2.4} aria-hidden="true" />
			</button>

			{expanded && (
				<div className="drawer-filter">
					<input
						className="input"
						type="search"
						placeholder={searchPlaceholder}
						value={search}
						onChange={(event) => setSearch(event.target.value)}
						aria-label={searchPlaceholder}
					/>
					{loading && items.length === 0 ? (
						<p className="drawer-empty">Chargement…</p>
					) : displayedItems.length > 0 ? (
						<ul className="drawer-checks">
							{displayedItems.map((item) => (
								<li key={item.id}>
									<label>
										<input type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => onToggle(item.id)} />
										<span>{getLabel(item)}</span>
									</label>
								</li>
							))}
						</ul>
					) : (
						search.trim() && <p className="drawer-empty">Aucun résultat pour « {search.trim()} ».</p>
					)}
				</div>
			)}
		</section>
	);
};

const Sidebar = ({
	sidebarOpen,
	onClose,
	currentDate,
	setCurrentDate,
	jumpToDate,
	selectedGroups,
	groups,
	toggleGroup,
	exportGroup,
	setShowGroupModal,
	selectedRooms,
	rooms,
	toggleRoom,
	selectedTeachers,
	teachers,
	toggleTeacher,
	filterOptionsLoading,
	theme,
	toggleTheme,
	setShowSettingsModal,
	setShowNotificationsModal,
	logout,
}) => {
	const monthOf = (date) => new Date(date.getFullYear(), date.getMonth(), 1);
	const [activeStart, setActiveStart] = useState(() => monthOf(currentDate));
	useEffect(() => setActiveStart(monthOf(currentDate)), [currentDate]);

	const openExternal = (url, eventName, channel) => {
		trackEvent(eventName, { area: "sidebar", channel });
		window.open(url, "_blank", "noopener,noreferrer");
	};

	return (
		<aside className={`drawer sheet ${sidebarOpen ? "is-open" : ""}`} aria-label="Classeur">
			<div className="drawer-head">
				<strong>Classeur</strong>
				<button type="button" className="tool" onClick={onClose} aria-label="Fermer le classeur">
					<X size={18} strokeWidth={2.2} aria-hidden="true" />
				</button>
			</div>

			<div className="drawer-scroll">
				<section className="drawer-section drawer-month">
					<ReactCalendar
						value={currentDate}
						onChange={(date) => {
							if (date) setCurrentDate(date);
						}}
						activeStartDate={activeStart}
						onActiveStartDateChange={({ activeStartDate }) => activeStartDate && setActiveStart(activeStartDate)}
						onClickMonth={(date) => jumpToDate(date)}
						locale="fr-FR"
						minDetail="decade"
						next2Label={null}
						prev2Label={null}
						className="month"
					/>
				</section>

				<section className="drawer-section">
					<div className="drawer-section-head">
						<h3>Mes groupes</h3>
						<button type="button" className="btn is-small" onClick={() => setShowGroupModal(true)}>
							Modifier
						</button>
					</div>
					{selectedGroups.length > 0 ? (
						<ul className="drawer-groups">
							{selectedGroups.map((id) => {
								const group = groups.find((g) => g.id === id);
								const name = group ? group.name : `Groupe ${id}`;
								return (
									<li key={id}>
										<span className="swatch" style={{ background: group?.color || "var(--rule-strong)" }} aria-hidden="true" />
										<span className="drawer-group-name">{name}</span>
										<button
											type="button"
											className="drawer-remove"
											onClick={() => exportGroup(id, name)}
											title="Exporter vers un agenda (.ics)"
											aria-label={`Exporter ${name} vers un agenda (.ics)`}>
											<Download size={14} strokeWidth={2.4} aria-hidden="true" />
										</button>
										<button type="button" className="drawer-remove" onClick={() => toggleGroup(id)} aria-label={`Retirer ${name}`}>
											<X size={14} strokeWidth={2.4} aria-hidden="true" />
										</button>
									</li>
								);
							})}
						</ul>
					) : (
						<p className="drawer-empty">Aucun groupe : choisis-en un pour voir ton planning.</p>
					)}
				</section>

				<FilterSelectionSection
					title="Salles"
					items={rooms}
					selectedIds={selectedRooms}
					onToggle={toggleRoom}
					getLabel={getRoomLabel}
					searchPlaceholder="Ajouter une salle…"
					loading={filterOptionsLoading}
				/>

				<FilterSelectionSection
					title="Enseignants"
					items={teachers}
					selectedIds={selectedTeachers}
					onToggle={toggleTeacher}
					getLabel={getTeacherLabel}
					searchPlaceholder="Ajouter un enseignant…"
					loading={filterOptionsLoading}
				/>

				<nav className="drawer-actions" aria-label="Réglages et applications">
					<button type="button" onClick={() => setShowNotificationsModal(true)}>
						<Bell size={18} strokeWidth={2.1} aria-hidden="true" />
						Notifications
					</button>
					<button type="button" onClick={() => setShowSettingsModal(true)}>
						<Settings size={18} strokeWidth={2.1} aria-hidden="true" />
						Paramètres
					</button>
					<button
						type="button"
						onClick={() => {
							trackEvent("theme_toggle_clicked", { area: "sidebar", to_theme: theme === "light" ? "dark" : "light" });
							toggleTheme();
						}}>
						{theme === "light" ? <Moon size={18} strokeWidth={2.1} aria-hidden="true" /> : <Sun size={18} strokeWidth={2.1} aria-hidden="true" />}
						{theme === "light" ? "Thème sombre" : "Thème clair"}
					</button>
					<button type="button" onClick={() => openExternal(androidAppDownloadUrl, "android_download_clicked", "github_releases")}>
						<img src="/icons/android.svg" alt="" width="18" height="18" />
						App Android
					</button>
					<button type="button" onClick={() => openExternal(iosAppDownloadUrl, "ios_download_clicked", "app_store")}>
						<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
							<path d="M16.37 12.73c-.02-2.3 1.88-3.4 1.96-3.46-1.07-1.56-2.73-1.78-3.32-1.8-1.41-.14-2.76.83-3.47.83-.72 0-1.82-.81-3-.79-1.54.02-2.96.9-3.76 2.28-1.6 2.78-.41 6.9 1.15 9.16.76 1.1 1.67 2.34 2.86 2.3 1.15-.05 1.58-.74 2.97-.74 1.38 0 1.77.74 2.98.72 1.23-.02 2.01-1.12 2.76-2.23.87-1.28 1.23-2.52 1.25-2.58-.03-.01-2.4-.92-2.42-3.66zM14.1 5.98c.63-.77 1.06-1.83.94-2.89-.91.04-2.01.61-2.66 1.37-.58.67-1.1 1.75-.96 2.79 1.01.08 2.05-.52 2.68-1.27z" />
						</svg>
						App iPhone et iPad
					</button>
					<button type="button" className="is-logout" onClick={logout}>
						<LogOut size={18} strokeWidth={2.1} aria-hidden="true" />
						Déconnexion
					</button>
				</nav>
			</div>
		</aside>
	);
};

export default Sidebar;
