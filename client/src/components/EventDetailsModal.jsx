import React from 'react';

const EventDetailsModal = ({ event, onClose, onContextSwitch }) => {
	if (!event) return null;

	const mappingCourseTypeToLabel = {
		'CourseType.IntegratedLecture': 'Cours Intégré',
		'CourseType.FollowUp': 'Suivi de Cours',
		'CourseType.Practice': 'Travaux Pratiques',
		'CourseType.Lecture': 'Cours Magistral',
		'CourseType.Meeting': 'Réunion',
		'CourseType.Exam': 'Examen',
		'CourseType.Permanence': 'Permanence',
		'CourseType.Conference': 'Conférence',
		'CourseType.Workshop': 'Atelier',
	};

	return (
		<div
			className="modal-overlay"
			onClick={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}>
			<div className="modal-content" onClick={(e) => e.stopPropagation()}>
				<div className="modal-header">
					<h2>Détails du cours</h2>
					<button
						className="btn-icon"
						onClick={(e) => {
							e.stopPropagation();
							onClose();
						}}>
						✕
					</button>
				</div>
				<div className="modal-body">
					{event.isOnline && (
						<div className="detail-row">
							<span
								className="detail-badge"
								style={{
									display: 'inline-block',
									padding: '4px 12px',
									backgroundColor: 'var(--accent-color)',
									color: 'white',
									borderRadius: '4px',
									fontSize: '0.9rem',
									marginBottom: '8px',
								}}>
								💻 En ligne
							</span>
						</div>
					)}
					{event.code && (
						<div className="detail-row">
							<span className="detail-label">Code</span>
							<span className="detail-value">{event.code}</span>
						</div>
					)}
					<div className="detail-row">
						<span className="detail-label">Matière</span>
						<span className="detail-value" style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>
							{event.name || event.typeName}
						</span>
					</div>

					{event.courseTypeName && (
						<div className="detail-row">
							<span className="detail-label">Type de cours</span>
							<span className="detail-value">{mappingCourseTypeToLabel[event.courseTypeName] || event.courseTypeName}</span>
						</div>
					)}
					<div className="detail-row">
						<span className="detail-label">Horaire</span>
						<span className="detail-value">
							{event.startObj.toDateString() === event.endObj.toDateString() ? (
								<>
									{event.startObj.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} <br />
									{event.startObj.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} -{' '}
									{event.endObj.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
								</>
							) : (
								<>
									<strong>Du:</strong> {event.startObj.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} à{' '}
									{event.startObj.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
									<br />
									<strong>Au:</strong> {event.endObj.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} à{' '}
									{event.endObj.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
								</>
							)}
						</span>
					</div>

					{event.url && (
						<div className="detail-row">
							<span className="detail-label">Lien</span>
							<span className="detail-value">
								<a href={event.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-color)', textDecoration: 'underline' }}>
									{event.url}
								</a>
							</span>
						</div>
					)}

					{event.creationDate && (
						<div className="detail-row">
							<span className="detail-label">Créé le</span>
							<span className="detail-value" style={{ fontSize: '0.85rem', opacity: 0.7 }}>
								{new Date(event.creationDate).toLocaleString('fr-FR')}
							</span>
						</div>
					)}

					{event.rooms && event.rooms.length > 0 && (
						<div className="detail-row">
							<span className="detail-label">Salles</span>
							<div className="detail-value">
								{event.rooms.map((r) => (
									<button className="detail-chip" key={r.id || r.room.id} onClick={() => onContextSwitch('room', r.id || r.room.id, r.name || r.room.name)}>
										📍 {r.name || r.room.name}
									</button>
								))}
							</div>
						</div>
					)}

					{event.teachers && event.teachers.length > 0 && (
						<div className="detail-row">
							<span className="detail-label">Intervenants</span>
							<div className="detail-value">
								{event.teachers.map((t) => (
									<button className="detail-chip" key={t.id} onClick={() => onContextSwitch('teacher', t.id, t.name)}>
										🎓 {t.firstname} {t.name}
									</button>
								))}
							</div>
						</div>
					)}

					{event.groups && event.groups.length > 0 && (
						<div className="detail-row">
							<span className="detail-label">Groupes</span>
							<div className="detail-value">
								{event.groups.map((g) => (
									<button className="detail-chip" key={g.id} onClick={() => onContextSwitch('group', g.id, g.name)}>
										👥 {g.name}
									</button>
								))}
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	);
};

export default EventDetailsModal;
