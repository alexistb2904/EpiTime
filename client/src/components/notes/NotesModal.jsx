import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Download, NotebookPen, Plus, Puzzle, RefreshCw, Search, Upload } from "lucide-react";
import { createNote, matchesSearch } from "../../../../shared/src/notes/model.ts";
import { linkExtension, syncWithExtension, unlinkExtension } from "../../notes/extensionBridge";
import { notesChanged, notesStore } from "../../notes/notesDb";
import { useExtensionStatus, useNotesQuery } from "../../notes/useNotes";
import Modal from "../Modal";
import { NoteRow } from "./CourseNotes";
import NoteEditor from "./NoteEditor";

const FILTERS = [
	{ id: "all", label: "Toutes" },
	{ id: "course", label: "Cours" },
	{ id: "free", label: "Libres" },
];

const formatTime = (value) => new Date(value).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

const ExtensionStatus = () => {
	const status = useExtensionStatus();
	const [error, setError] = useState(null);
	const run = (action) => action().catch((err) => setError(err.message));

	if (!status.installed) {
		return (
			<p className="modal-hint">
				Avec l'extension EpiTime pour Chrome, Edge ou Firefox, tu peux prendre des notes depuis n'importe quel onglet. Elles arrivent ici quand tu ouvres EpiTime.
			</p>
		);
	}
	return (
		<div className="notes-extension">
			<Puzzle size={18} strokeWidth={2.2} aria-hidden="true" />
			<p>
				{status.linked ? (
					<>
						<strong>Extension associée.</strong>{" "}
						{status.syncing
							? "Échange des notes…"
							: status.lastSync
								? `Notes échangées à ${formatTime(status.lastSync)}.`
								: "Les notes s'échangent à l'ouverture d'EpiTime."}
					</>
				) : (
					<>
						<strong>Extension détectée.</strong> Associe-la pour partager ta session et tes notes avec elle, dans ce navigateur uniquement.
					</>
				)}
				{(error || status.error) && <span className="notes-extension-error">{error || status.error}</span>}
			</p>
			{status.linked ? (
				<span className="notes-extension-actions">
					<button
						type="button"
						className="tool is-bare"
						onClick={() => run(syncWithExtension)}
						aria-label="Échanger les notes maintenant"
						title="Échanger maintenant"
						disabled={status.syncing}>
						<RefreshCw size={16} strokeWidth={2.2} aria-hidden="true" />
					</button>
					<button type="button" className="btn is-small" onClick={() => run(unlinkExtension)}>
						Dissocier
					</button>
				</span>
			) : (
				<button type="button" className="btn is-small is-ink" onClick={() => run(linkExtension)}>
					Associer
				</button>
			)}
		</div>
	);
};

const NotesModal = ({ onClose }) => {
	const [query, setQuery] = useState("");
	const [filter, setFilter] = useState("all");
	const [editing, setEditing] = useState(null);
	const [message, setMessage] = useState(null);
	const importInput = useRef(null);
	const searchInput = useRef(null);
	const listRef = useRef(null);
	const { notes, loading, error } = useNotesQuery(() => notesStore.list(), []);

	const groups = useMemo(() => {
		const visible = notes.filter((note) => (filter === "all" || (filter === "course") === Boolean(note.course)) && matchesSearch(note, query));
		const bySubject = new Map();
		for (const note of visible) {
			const key = note.course?.subject ?? "";
			if (!bySubject.has(key)) bySubject.set(key, { title: note.course?.title ?? "Notes libres", notes: [] });
			bySubject.get(key).notes.push(note);
		}
		return [...bySubject.values()];
	}, [notes, filter, query]);

	// N : nouvelle note, / : recherche, flèches : parcourir la liste, Entrée dans la recherche : ouvrir le premier résultat.
	useEffect(() => {
		const onKey = (event) => {
			if (event.ctrlKey || event.metaKey || event.altKey) return;
			const rows = [...(listRef.current?.querySelectorAll(".note-row") ?? [])];
			const inSearch = event.target === searchInput.current;
			if (inSearch && event.key === "Enter" && rows[0]) {
				event.preventDefault();
				rows[0].click();
				return;
			}
			if (event.key === "ArrowDown" || event.key === "ArrowUp") {
				const index = rows.indexOf(document.activeElement);
				if (index < 0 && !inSearch) return;
				event.preventDefault();
				rows[Math.min(Math.max(index + (event.key === "ArrowDown" ? 1 : -1), 0), rows.length - 1)]?.focus();
				return;
			}
			if (event.target.closest?.("input, textarea, select, [contenteditable]")) return;
			if (event.key === "n" || event.key === "N") {
				event.preventDefault();
				setEditing(createNote(null));
			} else if (event.key === "/") {
				event.preventDefault();
				searchInput.current?.focus();
			}
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, []);

	const exportNotes = async () => {
		try {
			const bytes = await notesStore.exportArchive();
			const link = document.createElement("a");
			link.href = URL.createObjectURL(new Blob([bytes], { type: "application/zip" }));
			link.download = `epitime-notes-${new Date().toISOString().slice(0, 10)}.zip`;
			link.click();
			setTimeout(() => URL.revokeObjectURL(link.href), 60_000);
			setMessage("Sauvegarde téléchargée. Garde-la hors du navigateur.");
		} catch (err) {
			setMessage(`Sauvegarde impossible : ${err.message}`);
		}
	};

	const importNotes = async (file) => {
		if (!file) return;
		try {
			const { notes: count, changed } = await notesStore.importArchive(new Uint8Array(await file.arrayBuffer()));
			notesChanged("local");
			setMessage(
				changed ? `${changed} note${changed > 1 ? "s" : ""} restaurée${changed > 1 ? "s" : ""} sur ${count}.` : "Toutes les notes de cette sauvegarde sont déjà là."
			);
		} catch (err) {
			setMessage(err.message);
		}
	};

	return (
		<Modal className="notes-sheet" hue={200} icon={<NotebookPen size={18} strokeWidth={2.2} />} title="Mes notes" onClose={onClose}>
			<div className={`notes-split ${editing ? "is-editing" : ""}`}>
				<div className="notes-list">
					<div className="notes-tools">
						<label className="notes-search">
							<Search size={16} strokeWidth={2.2} aria-hidden="true" />
							<input
								ref={searchInput}
								className="input"
								type="search"
								placeholder="Rechercher"
								value={query}
								onChange={(event) => setQuery(event.target.value)}
								aria-label="Rechercher dans les notes"
								aria-keyshortcuts="/"
							/>
							<kbd aria-hidden="true">/</kbd>
						</label>
						<div className="seg" role="group" aria-label="Filtrer">
							{FILTERS.map((item) => (
								<button
									key={item.id}
									type="button"
									className={filter === item.id ? "is-on" : ""}
									aria-pressed={filter === item.id}
									onClick={() => setFilter(item.id)}>
									{item.label}
								</button>
							))}
						</div>
						<button type="button" className="btn is-ink" onClick={() => setEditing(createNote(null))} aria-keyshortcuts="N" title="Nouvelle note libre (N)">
							<Plus size={16} strokeWidth={2.4} aria-hidden="true" />
							Note libre
						</button>
					</div>

					{error ? (
						<p className="pen-note" role="alert">
							Notes indisponibles : {error}. La navigation privée ou un stockage plein peut bloquer IndexedDB.
						</p>
					) : loading ? (
						<div />
					) : groups.length === 0 ? (
						<div className="notes-empty">
							<p>{notes.length ? "Aucune note ne correspond." : "Pas encore de note."}</p>
							{!notes.length && <p className="modal-hint">Ouvre un cours dans le planning pour y prendre une note, ou crée une note libre.</p>}
						</div>
					) : (
						<div ref={listRef} className="notes-groups">
							{groups.map((group) => (
								<section key={group.title} className="notes-group">
									<h3>
										{group.title}
										<span>{group.notes.length}</span>
									</h3>
									<ul className="note-rows">
										{group.notes.map((note) => (
											<NoteRow key={note.id} note={note} onOpen={setEditing} active={editing?.id === note.id} />
										))}
									</ul>
								</section>
							))}
						</div>
					)}

					<section className="notes-backup">
						<ExtensionStatus />
						<div className="notes-backup-actions">
							<button type="button" className="btn is-small" onClick={exportNotes} disabled={!notes.length}>
								<Download size={15} strokeWidth={2.2} aria-hidden="true" />
								Exporter (.zip)
							</button>
							<button type="button" className="btn is-small" onClick={() => importInput.current.click()}>
								<Upload size={15} strokeWidth={2.2} aria-hidden="true" />
								Importer
							</button>
							<input
								ref={importInput}
								type="file"
								accept=".zip,application/zip"
								hidden
								onChange={(event) => importNotes(event.target.files[0]).then(() => (event.target.value = ""))}
							/>
						</div>
						{message && (
							<p className="modal-hint" role="status">
								{message}
							</p>
						)}
					</section>
				</div>

				<div className="notes-pane">
					{editing ? (
						<>
							<button type="button" className="btn is-small notes-back" onClick={() => setEditing(null)}>
								<ArrowLeft size={15} strokeWidth={2.2} aria-hidden="true" />
								Toutes les notes
							</button>
							{editing.course && (
								<p className="notes-course">
									<strong>{editing.course.title}</strong> ·{" "}
									{new Date(editing.course.startDate).toLocaleString("fr-FR", {
										weekday: "long",
										day: "numeric",
										month: "long",
										hour: "2-digit",
										minute: "2-digit",
									})}
									{editing.course.rooms.length > 0 && ` · ${editing.course.rooms.join(", ")}`}
								</p>
							)}
							<NoteEditor key={editing.id} note={editing} onDeleted={() => setEditing(null)} autoFocus={!editing.text} />
						</>
					) : (
						<div className="notes-pane-empty">
							<p>Choisis une note</p>
							<p className="modal-hint">
								ou crée-en une avec <kbd>N</kbd>. <kbd>/</kbd> pour chercher, <kbd>↑</kbd> <kbd>↓</kbd> pour parcourir.
							</p>
						</div>
					)}
				</div>
			</div>
		</Modal>
	);
};

export default NotesModal;
