import React from "react";
import { AlertTriangle, CalendarDays, Clock3, Laptop, Link2, Timer, X } from "lucide-react";

const EventDetailsModal = ({ event, onClose, onContextSwitch }) => {
	if (!event) return null;
	const isCancelled = Boolean(event.isCancelled || event.isCanceled);
	const isSameDay = event.startObj.toDateString() === event.endObj.toDateString();

	const getRoomMapUrl = (roomName = "") => {
		const BASE_URL = "https://maps.forge.epita.fr";
		const normalized = String(roomName || "").toLowerCase();
		const upper = String(roomName || "").toUpperCase();

		if (normalized.includes("paritalie") || normalized.includes("partialie")) {
			let floor = "f0";
			if (normalized.includes("rdc")) floor = "f0";
			else if (normalized.includes("1er")) floor = "f1";
			else if (normalized.includes("2ème") || normalized.includes("2eme")) floor = "f2";
			else if (normalized.includes("3ème") || normalized.includes("3eme")) floor = "f3";
			else if (normalized.includes("4ème") || normalized.includes("4eme")) floor = "f4";
			else if (normalized.includes("5ème") || normalized.includes("5eme")) floor = "f5";

			return `${BASE_URL}/campus/kb/building/paritalie/floor/${floor}`;
		}

		if (normalized.includes("pasteur")) {
			return `${BASE_URL}/campus/kb/building/pasteur`;
		}

		if (upper.includes("KB")) {
			const kbMatch = upper.match(/KB\s*([0-6])/);
			if (kbMatch) {
				return `${BASE_URL}/campus/kb/building/voltaire/floor/f${kbMatch[1]}`;
			}
			return `${BASE_URL}/campus/kb/building/voltaire`;
		}

		return BASE_URL;
	};

	const mappingCourseTypeToLabel = {
		"CourseType.FollowUp": "Suivi de Cours",
		"CourseType.Exam": "Examen",
		"CourseType.Lecture": "Cours Magistral",
		"CourseType.Practice": "Travaux Pratiques",
		"CourseType.Conference": "Conférence",
		"CourseType.Meeting": "Réunion",
		"CourseType.Defense": "Soutenance",
		"CourseType.Workshop": "Atelier",
		"CourseType.Rush": "Rush",
		"CourseType.TD": "TD",
		"CourseType.EventAsso": "Événement Asso",
		"CourseType.LogiWorks": "LogiWorks",
		"CourseType.Remediation": "Remédiation",
		"CourseType.Tutoring": "Tutorat",
		"CourseType.Permanence": "Permanence",
		"CourseType.IntegratedLecture": "Cours Intégré",
	};

	const capitalizeFirst = (value = "") => value.charAt(0).toUpperCase() + value.slice(1);
	const formatDate = (date) => capitalizeFirst(date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }));
	const formatShortDateTime = (date) =>
		`${date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} ${date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
	const formatTime = (date) => date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
	const formatDuration = (start, end) => {
		const totalMinutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
		const days = Math.floor(totalMinutes / 1440);
		const hours = Math.floor((totalMinutes % 1440) / 60);
		const minutes = totalMinutes % 60;

		if (days > 0) return `${days}j${hours > 0 ? ` ${hours}h${minutes > 0 ? String(minutes).padStart(2, "0") : ""}` : minutes > 0 ? ` ${minutes}min` : ""}`;
		if (hours > 0) return `${hours}h${minutes > 0 ? String(minutes).padStart(2, "0") : ""}`;
		return `${minutes}min`;
	};
	const getTeacherName = (teacher) => [teacher.firstname, teacher.name].filter(Boolean).join(" ") || teacher.displayname || teacher.name || "Intervenant";
	const courseTypeLabel = event.courseTypeName ? mappingCourseTypeToLabel[event.courseTypeName] || event.courseTypeName : null;
	const title = event.name || event.typeName || "Cours";

	return (
		<div
			className="modal-overlay"
			onClick={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}>
			<div className="modal-content event-detail-modal" onClick={(e) => e.stopPropagation()}>
				<div className="modal-header event-detail-header">
					<div className="event-detail-title-block">
						<span className="event-detail-eyebrow">Détails du cours</span>
						<h2 className={isCancelled ? "detail-value-cancelled" : ""}>{title}</h2>
						{event.code && <span className="event-detail-code">Code : {event.code}</span>}
					</div>
					<div className="event-detail-header-actions">
						{isCancelled && <span className="event-detail-status cancelled">Annulé</span>}
						{event.isOnline && (
							<span className="event-detail-status online">
								<Laptop size={15} aria-hidden="true" />
								En ligne
							</span>
						)}
						{courseTypeLabel && <span className="event-detail-status">{courseTypeLabel}</span>}
						<button
							type="button"
							className="btn-icon event-detail-close"
							aria-label="Fermer les détails"
							onClick={(e) => {
								e.stopPropagation();
								onClose();
							}}>
							<X size={20} aria-hidden="true" />
						</button>
					</div>
				</div>
				<div className="modal-body event-detail-body">
					{isCancelled && (
						<div className="detail-cancelled-notice">
							<AlertTriangle size={18} aria-hidden="true" />
							<span>Ce cours n'est plus présent dans le dernier retour Zeus.</span>
						</div>
					)}

					<div className="event-detail-stat-grid">
						<div className="event-detail-stat-card">
							<div className="detail-label">
								<CalendarDays size={14} aria-hidden="true" />
								Date
							</div>
							<div className="detail-value">{isSameDay ? formatDate(event.startObj) : `${formatDate(event.startObj)} - ${formatDate(event.endObj)}`}</div>
						</div>
						<div className="event-detail-stat-card">
							<div className="detail-label">
								<Clock3 size={14} aria-hidden="true" />
								Horaire
							</div>
							<div className="detail-value">{isSameDay ? `${formatTime(event.startObj)} - ${formatTime(event.endObj)}` : `${formatShortDateTime(event.startObj)} - ${formatShortDateTime(event.endObj)}`}</div>
						</div>
						<div className="event-detail-stat-card">
							<div className="detail-label">
								<Timer size={14} aria-hidden="true" />
								Durée
							</div>
							<div className="detail-value">{formatDuration(event.startObj, event.endObj)}</div>
						</div>
					</div>

					{event.teachers && event.teachers.length > 0 && (
						<div className="event-detail-section">
							<span className="detail-label">
								Intervenants
							</span>
							<div className="event-detail-chip-row">
								{event.teachers.map((t) => (
									<button type="button" className="detail-chip" key={t.id || getTeacherName(t)} onClick={() => onContextSwitch("teacher", t.id, getTeacherName(t))}>
										<span className="detail-chip-emoji" aria-hidden="true">
											🎓
										</span>
										{getTeacherName(t)}
									</button>
								))}
							</div>
						</div>
					)}

					{event.rooms && event.rooms.length > 0 && (
						<div className="event-detail-section">
							<span className="detail-label">
								Salles
							</span>
							<div className="event-detail-chip-row">
								{event.rooms.map((r) => {
									const roomId = r.id || r.room?.id;
									const roomName = r.name || r.room?.name || "Salle";
									return (
										<span className="detail-room-chip-group" key={roomId || roomName}>
											<button type="button" className="detail-chip" onClick={() => onContextSwitch("room", roomId, roomName)}>
												<span className="detail-chip-emoji" aria-hidden="true">
													📍
												</span>
												{roomName}
											</button>
											<button
												type="button"
												className="detail-map-icon-btn"
												title="Voir sur la carte"
												aria-label={`Voir ${roomName} sur la carte`}
												onClick={() => window.open(getRoomMapUrl(roomName), "_blank", "noopener,noreferrer")}>
												<span aria-hidden="true">🗺️</span>
											</button>
										</span>
									);
								})}
							</div>
						</div>
					)}

					{event.groups && event.groups.length > 0 && (
						<div className="event-detail-section">
							<span className="detail-label">
								Groupes
							</span>
							<div className="event-detail-chip-row">
								{event.groups.map((g) => (
									<button type="button" className="detail-chip" key={g.id || g.name} onClick={() => onContextSwitch("group", g.id, g.name)}>
										<span className="detail-chip-emoji" aria-hidden="true">
											👥
										</span>
										{g.name}
									</button>
								))}
							</div>
						</div>
					)}

					{event.url && (
						<div className="event-detail-section">
							<span className="detail-label">
								<Link2 size={14} aria-hidden="true" />
								Lien
							</span>
							<a className="event-detail-link" href={event.url} target="_blank" rel="noopener noreferrer">
								{event.url}
							</a>
						</div>
					)}

					{event.creationDate && <div className="event-detail-created">Créé le {new Date(event.creationDate).toLocaleString("fr-FR")}</div>}
				</div>
			</div>
		</div>
	);
};

export default EventDetailsModal;
