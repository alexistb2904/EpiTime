import { Download, NotebookPen, Paperclip, Plus, Search, Upload, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { endMs, eventIdentity, formatTime, isMultiDay, startMs, type ZeusEvent } from "../../../shared/src/events.ts";
import { courseRefOf, createNote, matchesSearch, noteLabel, type CourseRef, type Note } from "../../../shared/src/notes/model.ts";
import { findCurrentEvent } from "../../../shared/src/schedule.ts";
import { notesChanged, notesStore, onNotesChanged } from "../../src/lib/notes";
import { browser } from "../../src/lib/platform";
import { useExtensionState, useNow, useTheme } from "../../src/ui/hooks";
import NoteEditor from "../../src/ui/NoteEditor";

const FREE = "free";
const DAY = 86_400_000;
const FOCUS_TTL_MS = 2 * 60_000;

type Focus = { key: string | null; ref: CourseRef | null; at: number };

const shortDay = (value: string | number) => new Date(value).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }).replace(".", "");
const optionLabel = (ref: CourseRef) => `${formatTime(ref.startDate)} · ${ref.title}${ref.rooms.length ? ` · ${ref.rooms.join(", ")}` : ""}`;

const App = () => {
	const { state } = useExtensionState();
	useTheme(state);
	const now = useNow(60_000);
	const [selected, setSelected] = useState<string | null>(null);
	const [extraRef, setExtraRef] = useState<CourseRef | null>(null);
	const [editing, setEditing] = useState<Note | null>(null);
	const [notes, setNotes] = useState<Note[]>([]);
	const [searching, setSearching] = useState(false);
	const [query, setQuery] = useState("");
	const [message, setMessage] = useState<string | null>(null);
	const [loaded, setLoaded] = useState(false);
	const importInput = useRef<HTMLInputElement>(null);

	const reloadNotes = useCallback(
		() =>
			notesStore
				.list()
				.then((list) => {
					setNotes(list);
					setLoaded(true);
				})
				.catch((error: Error) => setMessage(`Notes indisponibles : ${error.message}`)),
		[]
	);
	useEffect(() => {
		reloadNotes();
		return onNotesChanged(() => void reloadNotes());
	}, [reloadNotes]);

	const events = state?.schedule.events ?? [];
	const groups = useMemo(() => {
		const today = new Date(now);
		today.setHours(0, 0, 0, 0);
		const start = today.getTime();
		const usable = events.filter((event) => !isMultiDay(event)).sort((a, b) => startMs(a) - startMs(b));
		const refs = (list: ZeusEvent[]) => list.map(courseRefOf);
		return [
			{ label: "Aujourd'hui", refs: refs(usable.filter((event) => startMs(event) >= start && startMs(event) < start + DAY)) },
			{ label: "À venir", refs: refs(usable.filter((event) => startMs(event) >= start + DAY && startMs(event) < start + 8 * DAY)) },
			{ label: "Ces derniers jours", refs: refs(usable.filter((event) => startMs(event) < start && startMs(event) >= start - 7 * DAY)).reverse() },
		].filter((group) => group.refs.length);
	}, [events, now]);

	const knownRefs = useMemo(() => {
		const map = new Map<string, CourseRef>();
		for (const group of groups) for (const ref of group.refs) map.set(ref.key, ref);
		for (const note of notes) if (note.course && !map.has(note.course.key)) map.set(note.course.key, note.course);
		if (extraRef && !map.has(extraRef.key)) map.set(extraRef.key, extraRef);
		return map;
	}, [groups, notes, extraRef]);

	const otherNoted = [...knownRefs.values()].filter((ref) => !groups.some((group) => group.refs.some((item) => item.key === ref.key)));
	const course = selected && selected !== FREE ? (knownRefs.get(selected) ?? null) : null;

	const applyFocus = useCallback((focus: Focus | undefined) => {
		if (!focus || Date.now() - focus.at > FOCUS_TTL_MS) return false;
		if (focus.ref) setExtraRef(focus.ref);
		setSelected(focus.key ?? FREE);
		setEditing(null);
		setSearching(false);
		void browser.storage.session.remove("notesFocus");
		return true;
	}, []);

	useEffect(() => {
		if (!state || selected !== null) return;
		browser.storage.session.get("notesFocus").then(({ notesFocus }) => {
			if (applyFocus(notesFocus as Focus | undefined)) return;
			const current = findCurrentEvent(state.schedule.events, Date.now());
			setSelected(current ? eventIdentity(current) : FREE);
		});
	}, [state, selected, applyFocus]);

	useEffect(() => {
		const onChanged = (changes: Record<string, { newValue?: unknown }>, area: string) => {
			if (area === "session" && changes.notesFocus?.newValue) applyFocus(changes.notesFocus.newValue as Focus);
		};
		browser.storage.onChanged.addListener(onChanged);
		return () => browser.storage.onChanged.removeListener(onChanged);
	}, [applyFocus]);

	const sessionNotes = useMemo(() => notes.filter((note) => (selected === FREE ? !note.course : note.course?.key === selected)), [notes, selected]);
	const earlier = useMemo(() => (course ? notes.filter((note) => note.course?.subject === course.subject && note.course.key !== course.key) : []), [notes, course]);

	useEffect(() => {
		if (selected === null || !loaded || editing || searching) return;
		const latest = selected === FREE ? null : [...sessionNotes].sort((a, b) => b.updatedAt - a.updatedAt)[0];
		setEditing(latest ?? createNote(selected === FREE ? null : course));
	}, [selected, searching, loaded]);

	const pick = (key: string) => {
		setSelected(key);
		setEditing(null);
	};

	const openNote = (note: Note) => {
		setSearching(false);
		setSelected(note.course?.key ?? FREE);
		setEditing(note);
	};

	const exportNotes = async () => {
		try {
			const bytes = await notesStore.exportArchive();
			const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/zip" }));
			const link = document.createElement("a");
			link.href = url;
			link.download = `epitime-notes-${new Date().toISOString().slice(0, 10)}.zip`;
			link.click();
			setTimeout(() => URL.revokeObjectURL(url), 60_000);
			setMessage("Sauvegarde téléchargée.");
		} catch (error) {
			setMessage(`Sauvegarde impossible : ${(error as Error).message}`);
		}
	};

	const importNotes = async (file: File | undefined) => {
		if (!file) return;
		try {
			const { changed } = await notesStore.importArchive(new Uint8Array(await file.arrayBuffer()));
			notesChanged("local");
			setMessage(changed ? `${changed} note${changed > 1 ? "s" : ""} restaurée${changed > 1 ? "s" : ""}.` : "Ces notes sont déjà toutes là.");
		} catch (error) {
			setMessage((error as Error).message);
		}
	};

	const isLive = course
		? startMs({ startDate: course.startDate, endDate: course.endDate }) <= now && endMs({ startDate: course.startDate, endDate: course.endDate }) > now
		: false;
	const results = searching ? notes.filter((note) => matchesSearch(note, query)) : [];

	return (
		<main className="panel sheet tool-sheet page-sheet" style={{ "--ic": 200 } as React.CSSProperties}>
			<span className="tape modal-tape" aria-hidden="true" />
			<header className="modal-head">
				<div className="modal-title">
					<h2>
						<span className="modal-icon" aria-hidden="true">
							<NotebookPen size={18} strokeWidth={2.2} />
						</span>
						Notes
						{isLive && <span className="hand panel-live">en cours</span>}
					</h2>
				</div>
				<button
					type="button"
					className="tool"
					onClick={() => setSearching((value) => !value)}
					aria-label={searching ? "Fermer la recherche" : "Rechercher dans toutes les notes"}
					title="Toutes les notes">
					{searching ? <X size={18} strokeWidth={2.2} aria-hidden="true" /> : <Search size={18} strokeWidth={2.2} aria-hidden="true" />}
				</button>
			</header>
			<div className="modal-body">
				{searching ? (
					<section className="panel-search">
						<input
							className="input"
							type="search"
							placeholder="Rechercher dans les notes…"
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							autoFocus
							aria-label="Rechercher dans les notes"
						/>
						{results.length ? (
							<ul className="note-rows">
								{results.map((note) => (
									<NoteItem key={note.id} note={note} onOpen={openNote} withCourse />
								))}
							</ul>
						) : (
							<p className="modal-hint">{notes.length ? "Aucune note ne correspond." : "Pas encore de note."}</p>
						)}
					</section>
				) : (
					<>
						<div className="panel-picker">
							<label htmlFor="course" className="visually-hidden">
								Cours de la note
							</label>
							<select id="course" className="input" value={selected ?? FREE} onChange={(event) => pick(event.target.value)}>
								<option value={FREE}>Note libre (sans cours)</option>
								{groups.map((group) => (
									<optgroup key={group.label} label={group.label}>
										{group.refs.map((ref) => (
											<option key={ref.key} value={ref.key}>
												{group.label === "Aujourd'hui" ? optionLabel(ref) : `${shortDay(ref.startDate)} · ${optionLabel(ref)}`}
											</option>
										))}
									</optgroup>
								))}
								{otherNoted.length > 0 && (
									<optgroup label="Autres cours avec des notes">
										{otherNoted.map((ref) => (
											<option key={ref.key} value={ref.key}>
												{`${shortDay(ref.startDate)} · ${optionLabel(ref)}`}
											</option>
										))}
									</optgroup>
								)}
							</select>
							<button type="button" className="tool" onClick={() => setEditing(createNote(course))} aria-label="Nouvelle note pour ce choix" title="Nouvelle note">
								<Plus size={18} strokeWidth={2.4} aria-hidden="true" />
							</button>
						</div>

						{editing && (
							<NoteEditor
								key={editing.id}
								note={editing}
								course={selected === FREE ? null : course}
								onDeleted={() => setEditing(createNote(selected === FREE ? null : course))}
								autoFocus
							/>
						)}

						{sessionNotes.filter((note) => note.id !== editing?.id).length > 0 && (
							<section>
								<h2 className="panel-section">{selected === FREE ? "Autres notes libres" : "Autres notes de cette séance"}</h2>
								<ul className="note-rows">
									{sessionNotes
										.filter((note) => note.id !== editing?.id)
										.map((note) => (
											<NoteItem key={note.id} note={note} onOpen={openNote} />
										))}
								</ul>
							</section>
						)}

						{earlier.length > 0 && (
							<section>
								<h2 className="panel-section">Séances précédentes</h2>
								<ul className="note-rows">
									{earlier.map((note) => (
										<NoteItem key={note.id} note={note} onOpen={openNote} />
									))}
								</ul>
							</section>
						)}
					</>
				)}
			</div>
			<footer className="modal-foot panel-foot">
				<p className="modal-hint">
					Enregistré dans ce navigateur.{" "}
					{state?.link ? "Les notes s'échangent avec EpiTime Web quand tu l'ouvres." : "Associe l'extension à EpiTime pour retrouver ces notes sur le site."}
				</p>
				<div className="panel-foot-actions">
					<button type="button" className="btn is-small" onClick={exportNotes} disabled={!notes.length}>
						<Download size={14} strokeWidth={2.2} aria-hidden="true" />
						Exporter
					</button>
					<button type="button" className="btn is-small" onClick={() => importInput.current?.click()}>
						<Upload size={14} strokeWidth={2.2} aria-hidden="true" />
						Importer
					</button>
					<input
						ref={importInput}
						type="file"
						accept=".zip,application/zip"
						hidden
						onChange={(event) => importNotes(event.target.files?.[0]).then(() => (event.target.value = ""))}
					/>
				</div>
				{message && (
					<p className="modal-hint" role="status">
						{message}
					</p>
				)}
			</footer>
		</main>
	);
};

const NoteItem = ({ note, onOpen, withCourse = false }: { note: Note; onOpen: (note: Note) => void; withCourse?: boolean }) => (
	<li>
		<button type="button" className="note-row" onClick={() => onOpen(note)}>
			<strong>{noteLabel(note)}</strong>
			<span className="note-row-preview">{note.text.replace(/\s+/g, " ").slice(0, 120) || "Note vide"}</span>
			<span className="note-row-meta">
				{withCourse && <span>{note.course?.title ?? "Note libre"}</span>}
				{note.course && <span>{shortDay(note.course.startDate)}</span>}
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

export default App;
