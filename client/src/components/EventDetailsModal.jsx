import React, { useRef } from "react";
import { AlertTriangle, CalendarDays, Laptop, Link2, MapPin } from "lucide-react";
import Modal from "./Modal";
import { trackEvent } from "../utils/analyticsTracker";
import { isExamEvent } from "../utils/courseType";

const EventDetailsModal = ({ event, selectedGroups = [], onClose, onContextSwitch }) => {
	const isCancelled = Boolean(event.isCancelled || event.isCanceled);
	// Placeholders reserve the space of fields that only arrive with /details, so the sheet doesn't jump.
	const loading = Boolean(event.loadingDetails);
	const skeleton = (className = "") => <span className={`skeleton ${className}`} aria-hidden="true" />;
	// Only animate fields that replace a skeleton; cached details open already in place.
	const hadSkeleton = useRef(false);
	if (loading) hadSkeleton.current = true;
	const reveal = (i) => (hadSkeleton.current && !loading ? { className: "reveal", style: { "--i": i } } : {});
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
	// Un examen est connu tout de suite (idType/typeName) : pas besoin d'attendre le type détaillé.
	const isExam = isExamEvent(event);
	const courseTypeLabel = !isExam && event.courseTypeName ? mappingCourseTypeToLabel[event.courseTypeName] || event.courseTypeName : null;
	const title = event.name || event.typeName || "Cours";
	const associatedGroups = (event.groups || []).filter((group) => group.id !== undefined && group.id !== null && selectedGroups.some((id) => String(id) === String(group.id)));

	const hue = event.hue;
	const rooms = (event.rooms || []).map((r) => ({ id: r.id || r.room?.id, name: r.name || r.room?.name || "Salle" }));

	return (
		<Modal
			className="event-sheet"
			style={{ "--h": hue }}
			onClose={onClose}
			title={<span className={isCancelled ? "is-struck" : ""}>{title}</span>}
			titleAside={
				(loading || isExam || courseTypeLabel || isCancelled || event.isOnline || associatedGroups.length > 0) && (
					<p className="event-tags">
						{isCancelled && <span className="hand event-cancelled">annulé</span>}
						{isExam ? <span className="exam-tag">Examen</span> : courseTypeLabel ? <span {...reveal(0)}>{courseTypeLabel}</span> : loading && skeleton("skeleton-chip")}
						{event.isOnline && (
							<span>
								<Laptop size={14} strokeWidth={2.2} aria-hidden="true" />
								En ligne
							</span>
						)}
						{associatedGroups.map((group) => (
							<span key={group.id || group.name}>{group.name || String(group.id)}</span>
						))}
					</p>
				)
			}>
			{isCancelled && (
				<p className="pen-note">
					<AlertTriangle size={18} strokeWidth={2.2} aria-hidden="true" />
					Ce cours n'est plus présent dans le dernier retour Zeus.
				</p>
			)}

			<dl className="facts" aria-busy={loading}>
				<div>
					<dt>Quand</dt>
					<dd>
						<strong>{isSameDay ? formatDate(event.startObj) : `${formatDate(event.startObj)} – ${formatDate(event.endObj)}`}</strong>
						<span className="facts-sub">
							{isSameDay
								? `${formatTime(event.startObj)} – ${formatTime(event.endObj)}`
								: `${formatShortDateTime(event.startObj)} – ${formatShortDateTime(event.endObj)}`}
							{" · "}
							{formatDuration(event.startObj, event.endObj)}
						</span>
					</dd>
				</div>

				{rooms.length > 0 && (
					<div>
						<dt>{rooms.length > 1 ? "Salles" : "Salle"}</dt>
						<dd className="facts-list">
							{rooms.map((room) => (
								<span className="facts-item" key={room.id || room.name}>
									<strong>{room.name}</strong>
									<span className="facts-links">
										<a
											href={getRoomMapUrl(room.name)}
											target="_blank"
											rel="noopener noreferrer"
											onClick={() => trackEvent("room_map_opened", { source: "event_details" })}>
											<MapPin size={14} strokeWidth={2.2} aria-hidden="true" />
											Plan
										</a>
										{room.id && (
											<button type="button" onClick={() => onContextSwitch("room", room.id, room.name)}>
												<CalendarDays size={14} strokeWidth={2.2} aria-hidden="true" />
												Planning de la salle
											</button>
										)}
									</span>
								</span>
							))}
						</dd>
					</div>
				)}

				{event.teachers?.length > 0 && (
					<div>
						<dt>{event.teachers.length > 1 ? "Intervenants" : "Intervenant"}</dt>
						<dd className="facts-list">
							{event.teachers.map((teacher) => (
								<span className="facts-item" key={teacher.id || getTeacherName(teacher)}>
									<strong>{getTeacherName(teacher)}</strong>
									{teacher.id && (
										<span className="facts-links">
											<button type="button" onClick={() => onContextSwitch("teacher", teacher.id, getTeacherName(teacher))}>
												<CalendarDays size={14} strokeWidth={2.2} aria-hidden="true" />
												Son planning
											</button>
										</span>
									)}
								</span>
							))}
						</dd>
					</div>
				)}

				{event.groups?.length > 0 && (
					<div>
						<dt>Groupes</dt>
						<dd className="facts-chips">
							{event.groups.map((group) => (
								<button
									type="button"
									key={group.id || group.name}
									onClick={() => onContextSwitch("group", group.id, group.name)}
									title={`Voir le planning de ${group.name}`}>
									{group.name}
								</button>
							))}
						</dd>
					</div>
				)}

				{event.url && (
					<div>
						<dt>Lien</dt>
						<dd>
							<a
								className="facts-url"
								href={event.url}
								onClick={() => trackEvent("online_course_link_opened", { source: "event_details", link_type: "course" })}
								target="_blank"
								rel="noopener noreferrer">
								<Link2 size={14} strokeWidth={2.2} aria-hidden="true" />
								{event.url}
							</a>
						</dd>
					</div>
				)}

				{(event.code || loading) && (
					<div>
						<dt>Code</dt>
						<dd>{event.code ? <span {...reveal(1)}>{event.code}</span> : skeleton("skeleton-line")}</dd>
					</div>
				)}
			</dl>

			{event.creationDate ? (
				<p className="modal-hint">
					<span {...reveal(2)}>Créé le {new Date(event.creationDate).toLocaleString("fr-FR")}</span>
				</p>
			) : (
				loading && (
					<p className="modal-hint">
						{skeleton("skeleton-line skeleton-wide")}
						<span className="visually-hidden">Chargement des détails…</span>
					</p>
				)
			)}
		</Modal>
	);
};

export default EventDetailsModal;
