import React, { useMemo, useState } from "react";
import { ArrowLeft, NotebookPen, Paperclip, Plus } from "lucide-react";
import { courseRefOf, createNote, noteLabel } from "../../../../shared/src/notes/model.ts";
import { notesStore } from "../../notes/notesDb";
import { useNotesQuery } from "../../notes/useNotes";
import NoteEditor from "./NoteEditor";
import "./Notes.css";

const formatShort = (value) => new Date(value).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }).replace(".", "");
const formatEdited = (value) =>
	new Date(value).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).replace(".", "");

export const NoteRow = ({ note, onOpen, showCourse = false }) => (
	<li>
		<button type="button" className="note-row" onClick={() => onOpen(note)}>
			<strong>{noteLabel(note)}</strong>
			<span className="note-row-preview">{note.text.replace(/\s+/g, " ").slice(0, 140) || "Note vide"}</span>
			<span className="note-row-meta">
				{showCourse && note.course && <span>{note.course.title}</span>}
				{note.course && <span>{formatShort(note.course.startDate)}</span>}
				<span>modifiée {formatEdited(note.updatedAt)}</span>
				{note.attachments.length > 0 && (
					<span>
						<Paperclip size={12} strokeWidth={2.4} aria-hidden="true" />
						{note.attachments.length}
					</span>
				)}
			</span>
		</button>
	</li>
);

/** Notes du cours ouvert : celles de cette séance, puis celles des séances précédentes de la même matière. */
const CourseNotes = ({ event }) => {
	const course = useMemo(() => courseRefOf(event), [event.idReservation, event.id, event.startDate, event.endDate, event.name]); // eslint-disable-line react-hooks/exhaustive-deps
	const [editing, setEditing] = useState(null);
	const { notes: sessionNotes } = useNotesQuery(() => notesStore.byCourse(course.key), [course.key]);
	const { notes: subjectNotes } = useNotesQuery(() => notesStore.bySubject(course.subject), [course.subject]);
	const earlier = subjectNotes.filter((note) => note.course?.key !== course.key);

	if (editing) {
		const isThisSession = !editing.course || editing.course.key === course.key;
		return (
			<section className="course-notes" aria-label="Note">
				<div className="course-notes-head">
					<button type="button" className="btn is-small" onClick={() => setEditing(null)}>
						<ArrowLeft size={15} strokeWidth={2.2} aria-hidden="true" />
						Notes du cours
					</button>
					{!isThisSession && <span className="hand">séance du {formatShort(editing.course.startDate)}</span>}
				</div>
				{/* La note suit le cours : l'instantané (salle, horaire) se met à jour à l'enregistrement. */}
				<NoteEditor key={editing.id} note={editing} course={isThisSession ? course : undefined} onDeleted={() => setEditing(null)} autoFocus={!editing.text} />
			</section>
		);
	}

	return (
		<section className="course-notes" aria-label="Notes du cours">
			<div className="course-notes-head">
				<h3>
					<NotebookPen size={17} strokeWidth={2.2} aria-hidden="true" />
					Notes
				</h3>
				<button type="button" className="btn is-small is-ink" onClick={() => setEditing(createNote(course))}>
					<Plus size={15} strokeWidth={2.4} aria-hidden="true" />
					Nouvelle note
				</button>
			</div>
			{sessionNotes.length > 0 ? (
				<ul className="note-rows">
					{sessionNotes.map((note) => (
						<NoteRow key={note.id} note={note} onOpen={setEditing} />
					))}
				</ul>
			) : (
				<p className="modal-hint">Aucune note pour cette séance. Les notes sont gardées dans ce navigateur et restent lisibles hors ligne.</p>
			)}
			{earlier.length > 0 && (
				<details className="course-notes-earlier">
					<summary>Séances précédentes ({earlier.length})</summary>
					<ul className="note-rows">
						{earlier.map((note) => (
							<NoteRow key={note.id} note={note} onOpen={setEditing} />
						))}
					</ul>
				</details>
			)}
		</section>
	);
};

export default CourseNotes;
