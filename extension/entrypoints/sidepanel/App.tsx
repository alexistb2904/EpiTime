import { Check, ChevronDown, Download, NotebookPen, Paperclip, Plus, Search, Trash2, Upload, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { courseHue, endMs, eventIdentity, formatTime, isMultiDay, startMs, type ZeusEvent } from "../../../shared/src/events.ts";
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

	const pickerGroups = [
		...groups,
		...(otherNoted.length ? [{ label: "Autres cours avec des notes", refs: otherNoted }] : []),
	];

	return (
		<main className="panel">
			<header className="panel-head">
				<h1>
					<NotebookPen size={19} strokeWidth={2.2} aria-hidden="true" />
					Notes
				</h1>
				<div className="panel-tools">
					{!searching && (
						<button type="button" className="tool is-bare" onClick={() => setEditing(createNote(course))} aria-label="Nouvelle note" title="Nouvelle note">
							<Plus size={19} strokeWidth={2.3} aria-hidden="true" />
						</button>
					)}
					<button
						type="button"
						className={`tool ${searching ? "" : "is-bare"}`}
						onClick={() => setSearching((value) => !value)}
						aria-label={searching ? "Fermer la recherche" : "Rechercher dans toutes les notes"}
						title={searching ? "Fermer" : "Rechercher"}>
						{searching ? <X size={18} strokeWidth={2.2} aria-hidden="true" /> : <Search size={18} strokeWidth={2.2} aria-hidden="true" />}
					</button>
				</div>
			</header>

			<div className="panel-body">
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
							<p className="panel-empty">{notes.length ? "Aucune note ne correspond." : "Pas encore de note."}</p>
						)}
					</section>
				) : (
					<>
						<CoursePicker course={course} live={isLive} groups={pickerGroups} selected={selected ?? FREE} onPick={pick} />

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
							<section className="panel-list">
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
							<section className="panel-list">
								<h2 className="panel-section">Séances précédentes</h2>
								<ul className="note-rows">
									{earlier.map((note) => (
										<NoteItem key={note.id} note={note} onOpen={openNote} withCourse />
									))}
								</ul>
							</section>
						)}
					</>
				)}
			</div>

			<footer className="panel-foot">
				<p role="status">
					{message ?? (state?.link ? "Enregistré dans ce navigateur, échangé avec EpiTime Web quand tu l'ouvres." : "Enregistré dans ce navigateur. Associe l'extension pour retrouver tes notes sur le site.")}
				</p>
				<button type="button" className="tool is-bare" onClick={exportNotes} disabled={!notes.length} aria-label="Exporter les notes (.zip)" title="Exporter">
					<Download size={17} strokeWidth={2.2} aria-hidden="true" />
				</button>
				<button type="button" className="tool is-bare" onClick={() => importInput.current?.click()} aria-label="Importer une sauvegarde" title="Importer">
					<Upload size={17} strokeWidth={2.2} aria-hidden="true" />
				</button>
				<input
					ref={importInput}
					type="file"
					accept=".zip,application/zip"
					hidden
					onChange={(event) => importNotes(event.target.files?.[0]).then(() => (event.target.value = ""))}
				/>
			</footer>
		</main>
	);
};

const CoursePicker = ({
	course,
	live,
	groups,
	selected,
	onPick,
}: {
	course: CourseRef | null;
	live: boolean;
	groups: Array<{ label: string; refs: CourseRef[] }>;
	selected: string;
	onPick: (key: string) => void;
}) => {
	const [open, setOpen] = useState(false);
	const choose = (key: string) => {
		onPick(key);
		setOpen(false);
	};
	return (
		<div className="course-pick" onKeyDown={(event) => event.key === "Escape" && setOpen(false)}>
			<button
				type="button"
				className={`course-card ${course ? "" : "is-free"}`}
				style={course ? ({ "--h": courseHue(course.title) } as React.CSSProperties) : undefined}
				onClick={() => setOpen((value) => !value)}
				aria-expanded={open}
				aria-controls="course-menu">
				{course ? <span className="course-card-time">{formatTime(course.startDate)}</span> : <NotebookPen className="course-card-icon" size={20} strokeWidth={2.2} aria-hidden="true" />}
				<span className="course-card-main">
					<strong>{course ? course.title : "Note libre"}</strong>
					<span>{course ? [shortDay(course.startDate), ...course.rooms].join(" · ") : "Sans cours associé"}</span>
				</span>
				{live && <span className="hand course-card-live">en cours</span>}
				<ChevronDown className="course-card-chevron" size={18} strokeWidth={2.3} aria-hidden="true" />
			</button>
			{open && (
				<div className="course-menu" id="course-menu">
					<button type="button" className="course-option" aria-current={selected === FREE} onClick={() => choose(FREE)}>
						<NotebookPen size={14} strokeWidth={2.4} aria-hidden="true" />
						<strong>Note libre</strong>
						{selected === FREE && <Check className="course-option-check" size={16} strokeWidth={2.6} aria-hidden="true" />}
					</button>
					{groups.map((group) => (
						<section key={group.label}>
							<h2 className="panel-section">{group.label}</h2>
							{group.refs.map((ref) => (
								<button
									key={ref.key}
									type="button"
									className="course-option"
									style={{ "--h": courseHue(ref.title) } as React.CSSProperties}
									aria-current={selected === ref.key}
									onClick={() => choose(ref.key)}>
									<span className="course-option-dot" aria-hidden="true" />
									<span className="course-option-time">{group.label === "Aujourd'hui" ? formatTime(ref.startDate) : shortDay(ref.startDate)}</span>
									<strong>{ref.title}</strong>
									{selected === ref.key && <Check className="course-option-check" size={16} strokeWidth={2.6} aria-hidden="true" />}
								</button>
							))}
						</section>
					))}
				</div>
			)}
		</div>
	);
};

const NoteDelete = ({ noteId }: { noteId: string }) => {
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

const NoteItem = ({ note, onOpen, withCourse = false }: { note: Note; onOpen: (note: Note) => void; withCourse?: boolean }) => (
	<li className="note-row-item">
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
		<NoteDelete noteId={note.id} />
	</li>
);

export default App;
