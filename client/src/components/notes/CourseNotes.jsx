import React, { useMemo, useState } from "react";
import { ArrowLeft, NotebookPen, Paperclip, Plus, Trash2 } from "lucide-react";
import { courseRefOf, createNote, noteLabel } from "../../../../shared/src/notes/model.ts";
import { notesChanged, notesStore } from "../../notes/notesDb";
import { useNotesQuery } from "../../notes/useNotes";
import NoteEditor from "./NoteEditor";
import "./Notes.css";

const formatShort = (value) => new Date(value).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }).replace(".", "");
const formatEdited = (value) => new Date(value).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).replace(".", "");

const rowPreview = (note) => {
	if (!note.text.trim()) return "Note vide";
	const rest = note.title.trim() ? note.text : note.text.trim().split("\n").slice(1).join(" ");
	return rest.replace(/\s+/g, " ").slice(0, 140);
};

export const NoteRowDelete = ({ noteId }) => {
	const [confirming, setConfirming] = useState(false);
	const remove = async () => {
		if (!confirming) return setConfirming(true);
		await notesStore.remove(noteId);
		notesChanged("local");
	};
	return (
		<button
			type="button"
			className={`note-row-delete${confirming ? " is-confirming" : ""}`}
			onClick={remove}
			onBlur={() => setConfirming(false)}
			aria-label={confirming ? "Confirmer la suppression" : "Supprimer la note"}
			title={confirming ? "Cliquer encore pour supprimer" : "Supprimer la note"}
		>
			<Trash2 size={15} strokeWidth={2.2} aria-hidden="true" />
			{confirming && "Supprimer ?"}
		</button>
	);
};

export const NoteRow = ({ note, onOpen, showCourse = false, active = false }) => (
	<li className="note-row-item">
		<button type="button" className="note-row" onClick={() => onOpen(note)} aria-current={active || undefined}>
			<strong>{noteLabel(note)}</strong>
			<span className="note-row-preview">{rowPreview(note)}</span>
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
		{!active && <NoteRowDelete noteId={note.id} />}
	</li>
);

const CourseNotes = ({ event }) => {
	const course = useMemo(() => courseRefOf(event), [event.idReservation, event.id, event.startDate, event.endDate, event.name]); // eslint-disable-line react-hooks/exhaustive-deps
	const [picked, setPicked] = useState(null);
	const [draft, setDraft] = useState(() => createNote(course));
	const { notes: sessionNotes, loading } = useNotesQuery(() => notesStore.byCourse(course.key), [course.key]);
	const { notes: subjectNotes } = useNotesQuery(() => notesStore.bySubject(course.subject), [course.subject]);
	const earlier = subjectNotes.filter((note) => note.course?.key !== course.key);
	const editing = picked ?? (sessionNotes.length > 1 ? null : (sessionNotes[0] ?? draft));
	const isThisSession = !editing?.course || editing.course.key === course.key;

	const close = () => {
		setPicked(null);
		setDraft(createNote(course));
	};

	const earlierList = earlier.length > 0 && (
		<details className="course-notes-earlier">
			<summary>Séances précédentes ({earlier.length})</summary>
			<ul className="note-rows">
				{earlier.map((note) => (
					<NoteRow key={note.id} note={note} onOpen={setPicked} />
				))}
			</ul>
		</details>
	);

	if (loading) return null;

	return (
		<section className="course-notes" aria-label="Notes du cours">
			<div className="course-notes-head">
				{picked ? (
					<button type="button" className="btn is-small" onClick={close}>
						<ArrowLeft size={15} strokeWidth={2.2} aria-hidden="true" />
						Notes du cours
					</button>
				) : (
					<h3>
						<NotebookPen size={17} strokeWidth={2.2} aria-hidden="true" />
						Notes
					</h3>
				)}
				{editing && !isThisSession ? (
					<span className="hand">séance du {formatShort(editing.course.startDate)}</span>
				) : (
					sessionNotes.length > 0 && (
						<button type="button" className="btn is-small" onClick={() => setPicked(createNote(course))}>
							<Plus size={15} strokeWidth={2.4} aria-hidden="true" />
							Nouvelle note
						</button>
					)
				)}
			</div>
			{editing ? (
				<NoteEditor key={editing.id} note={editing} course={isThisSession ? course : undefined} onDeleted={close} autoFocus={picked === editing && !editing.text} />
			) : (
				<ul className="note-rows">
					{sessionNotes.map((note) => (
						<NoteRow key={note.id} note={note} onOpen={setPicked} />
					))}
				</ul>
			)}
			{(!editing || isThisSession) && earlierList}
		</section>
	);
};

export default CourseNotes;
