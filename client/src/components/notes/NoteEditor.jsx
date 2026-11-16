import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { Bold, Check, Download, ImagePlus, Italic, Link2, List, ListOrdered, LoaderCircle, Paperclip, Trash2, X } from "lucide-react";
import { compareVV, MAX_ATTACHMENT_BYTES } from "../../../../shared/src/notes/model.ts";
import { noteHtmlToText, sanitizeNoteHtml } from "../../../../shared/src/notes/sanitize.ts";
import { notesChanged, notesStore, onNotesChanged } from "../../notes/notesDb";

const SAVE_DELAY_MS = 500;
// Pas de SVG en ligne : un fichier SVG reste une pièce jointe.
const isInlineImage = (type) => /^image\/(png|jpe?g|gif|webp|avif|bmp)$/i.test(type || "");
const escapeHtml = (value) => value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
const formatSize = (bytes) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} Ko` : `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} Mo`);

const normalizeUrl = (raw) => {
	const value = raw.trim();
	if (!value) return null;
	const candidate = /^(https?:|mailto:)/i.test(value) ? value : `https://${value}`;
	try {
		const url = new URL(candidate);
		return ["http:", "https:", "mailto:"].includes(url.protocol) ? url.href : null;
	} catch {
		return null;
	}
};

export async function openAttachment(attachment) {
	const blob = await notesStore.getAttachment(attachment.id);
	if (!blob) throw new Error("Fichier absent de ce navigateur. Synchronise avec l'extension ou importe une sauvegarde.");
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = attachment.name;
	link.click();
	setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Éditeur d'une note. Enregistre tout seul (pas de bouton) : 500 ms après la dernière frappe, en quittant
 * l'onglet et à la fermeture. Les images collées ou déposées deviennent des pièces jointes locales.
 */
const NoteEditor = ({ note, course, onDeleted, autoFocus = false }) => {
	const bodyRef = useRef(null);
	const base = useRef(note);
	const persisted = useRef(note.updatedAt !== note.createdAt || Object.keys(note.vv).length > 0);
	const known = useRef(new Map(note.attachments.map((attachment) => [attachment.id, attachment])));
	const objectUrls = useRef([]);
	const dirty = useRef(false);
	const timer = useRef(null);
	const queue = useRef(Promise.resolve());
	const savedRange = useRef(null);
	const fileInput = useRef(null);
	const imageInput = useRef(null);
	const linkInputId = useId();

	const [title, setTitle] = useState(note.title);
	const [files, setFiles] = useState(() => note.attachments.filter((attachment) => !isInlineImage(attachment.type)));
	const [state, setState] = useState("saved");
	const [message, setMessage] = useState(null);
	const [linkOpen, setLinkOpen] = useState(false);
	const [linkValue, setLinkValue] = useState("");
	const [empty, setEmpty] = useState(!note.text.trim() && !note.html.includes("<img"));
	const [confirmDelete, setConfirmDelete] = useState(false);
	const titleRef = useRef(title);
	const filesRef = useRef(files);
	titleRef.current = title;
	filesRef.current = files;

	const hydrateImages = useCallback(async () => {
		for (const image of bodyRef.current?.querySelectorAll("img[data-att]:not([src])") ?? []) {
			const blob = await notesStore.getAttachment(image.dataset.att);
			if (!blob) {
				image.alt = "Image absente de ce navigateur";
				continue;
			}
			const url = URL.createObjectURL(blob);
			objectUrls.current.push(url);
			image.src = url;
		}
	}, []);

	const loadBody = useCallback(
		(html) => {
			if (!bodyRef.current) return;
			// Nœuds issus du HTML déjà nettoyé, sans réaffecter innerHTML sur le document.
			const parsed = new DOMParser().parseFromString(sanitizeNoteHtml(html), "text/html");
			bodyRef.current.replaceChildren(...Array.from(parsed.body.childNodes));
			setEmpty(!bodyRef.current.textContent.trim() && !bodyRef.current.querySelector("img"));
			hydrateImages();
		},
		[hydrateImages]
	);

	const collect = () => {
		const clone = bodyRef.current.cloneNode(true);
		clone.querySelectorAll("img").forEach((image) => image.removeAttribute("src"));
		const html = sanitizeNoteHtml(clone.innerHTML);
		const imageIds = new Set([...clone.querySelectorAll("img[data-att]")].map((image) => image.dataset.att));
		const images = [...imageIds].map((id) => known.current.get(id)).filter(Boolean);
		return { title: titleRef.current.slice(0, 300), html, text: noteHtmlToText(html), attachments: [...images, ...filesRef.current] };
	};

	const save = useCallback(() => {
		clearTimeout(timer.current);
		if (!dirty.current || !bodyRef.current) return queue.current;
		dirty.current = false;
		const draft = collect();
		// Une note neuve laissée vide n'est pas créée.
		if (!persisted.current && !draft.title.trim() && !draft.text.trim() && !draft.attachments.length) {
			setState("saved");
			return queue.current;
		}
		setState("saving");
		// File d'attente : chaque enregistrement part de la version produite par le précédent.
		queue.current = queue.current.then(async () => {
			try {
				const { note: saved, conflictCopy } = await notesStore.save({ ...base.current, ...draft, course: course === undefined ? base.current.course : course });
				base.current = saved;
				persisted.current = true;
				notesChanged("local");
				setState(dirty.current ? "dirty" : "saved");
				if (conflictCopy) setMessage(`Cette note a aussi été modifiée ailleurs. L'autre version est gardée à part : « ${conflictCopy.title} ».`);
			} catch (error) {
				dirty.current = true;
				setState("error");
				setMessage(`Enregistrement impossible : ${error.message}`);
			}
		});
		return queue.current;
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [course]);

	const markDirty = useCallback(() => {
		dirty.current = true;
		setState("dirty");
		if (bodyRef.current) setEmpty(!bodyRef.current.textContent.trim() && !bodyRef.current.querySelector("img"));
		clearTimeout(timer.current);
		timer.current = setTimeout(save, SAVE_DELAY_MS);
	}, [save]);

	useEffect(() => {
		loadBody(note.html);
		if (autoFocus) bodyRef.current?.focus();
		const flush = () => save();
		const onVisibility = () => document.hidden && save();
		window.addEventListener("pagehide", flush);
		document.addEventListener("visibilitychange", onVisibility);
		return () => {
			window.removeEventListener("pagehide", flush);
			document.removeEventListener("visibilitychange", onVisibility);
			save().finally(() => objectUrls.current.forEach((url) => URL.revokeObjectURL(url)));
		};
		// Monté une fois par note : l'éditeur est recréé (key) quand on change de note.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Modification reçue de l'extension ou d'un autre onglet : rechargée si rien n'est en cours de frappe ici.
	useEffect(
		() =>
			onNotesChanged(async (source) => {
				if (source === "local") return;
				const stored = await notesStore.get(base.current.id);
				if (!stored) return;
				if (stored.deleted) {
					setMessage("Cette note a été supprimée depuis l'extension ou un autre onglet.");
					onDeleted?.();
					return;
				}
				if (dirty.current || compareVV(stored.vv, base.current.vv) === "equal") return;
				base.current = stored;
				stored.attachments.forEach((attachment) => known.current.set(attachment.id, attachment));
				setTitle(stored.title);
				setFiles(stored.attachments.filter((attachment) => !isInlineImage(attachment.type)));
				loadBody(stored.html);
			}),
		[loadBody, onDeleted]
	);

	const exec = (command, value = null) => {
		bodyRef.current.focus();
		document.execCommand(command, false, value);
		markDirty();
	};

	const addFiles = async (fileList, { inline = true } = {}) => {
		for (const file of fileList) {
			if (file.size > MAX_ATTACHMENT_BYTES) {
				setMessage(`« ${file.name} » dépasse 25 Mo : il n'a pas été ajouté.`);
				continue;
			}
			try {
				const name = file.name || `capture-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.png`;
				const attachment = await notesStore.putAttachment(file, name);
				known.current.set(attachment.id, attachment);
				if (inline && isInlineImage(file.type)) {
					const url = URL.createObjectURL(file);
					objectUrls.current.push(url);
					bodyRef.current.focus();
					document.execCommand("insertHTML", false, `<img data-att="${attachment.id}" src="${url}" alt=""><br>`);
				} else {
					setFiles((previous) => [...previous, attachment]);
					filesRef.current = [...filesRef.current, attachment];
				}
				markDirty();
			} catch (error) {
				setMessage(error.message);
			}
		}
	};

	const onPaste = (event) => {
		const data = event.clipboardData;
		const images = [...(data?.files ?? [])];
		if (images.length) {
			event.preventDefault();
			addFiles(images);
			return;
		}
		const html = data?.getData("text/html");
		const text = data?.getData("text/plain") ?? "";
		if (html) {
			event.preventDefault();
			document.execCommand("insertHTML", false, sanitizeNoteHtml(html));
		} else if (/^\s*https?:\/\/\S+\s*$/i.test(text) && normalizeUrl(text)) {
			event.preventDefault();
			const url = escapeHtml(normalizeUrl(text));
			document.execCommand("insertHTML", false, `<a href="${url}">${url}</a>&nbsp;`);
		}
		markDirty();
	};

	const openLink = () => {
		const selection = window.getSelection();
		savedRange.current = selection?.rangeCount && bodyRef.current.contains(selection.anchorNode) ? selection.getRangeAt(0).cloneRange() : null;
		setLinkValue("");
		setLinkOpen(true);
	};

	const insertLink = (event) => {
		event.preventDefault();
		const url = normalizeUrl(linkValue);
		if (!url) {
			setMessage("Adresse invalide : utilise un lien http, https ou mailto.");
			return;
		}
		bodyRef.current.focus();
		const selection = window.getSelection();
		if (savedRange.current) {
			selection.removeAllRanges();
			selection.addRange(savedRange.current);
		}
		if (!savedRange.current || savedRange.current.collapsed) document.execCommand("insertHTML", false, `<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>&nbsp;`);
		else document.execCommand("createLink", false, url);
		setLinkOpen(false);
		setMessage(null);
		markDirty();
	};

	const removeFile = (id) => {
		setFiles((previous) => previous.filter((file) => file.id !== id));
		filesRef.current = filesRef.current.filter((file) => file.id !== id);
		markDirty();
	};

	const deleteNote = async () => {
		clearTimeout(timer.current);
		dirty.current = false;
		await queue.current;
		if (persisted.current) {
			await notesStore.remove(base.current.id);
			notesChanged("local");
		}
		onDeleted?.();
	};

	// Les boutons ne prennent pas le focus : la sélection reste dans le texte.
	const keepSelection = (event) => event.preventDefault();
	const toolButton = (label, Icon, onClick) => (
		<button type="button" className="tool is-bare" onMouseDown={keepSelection} onClick={onClick} aria-label={label} title={label}>
			<Icon size={17} strokeWidth={2.2} aria-hidden="true" />
		</button>
	);

	return (
		<div className="note-editor">
			<input
				className="note-title"
				value={title}
				onChange={(event) => {
					setTitle(event.target.value);
					markDirty();
				}}
				placeholder="Titre"
				aria-label="Titre de la note"
				maxLength={300}
			/>

			<div className="note-toolbar" role="toolbar" aria-label="Mise en forme">
				{toolButton("Gras (Ctrl+B)", Bold, () => exec("bold"))}
				{toolButton("Italique (Ctrl+I)", Italic, () => exec("italic"))}
				{toolButton("Liste à puces", List, () => exec("insertUnorderedList"))}
				{toolButton("Liste numérotée", ListOrdered, () => exec("insertOrderedList"))}
				<span className="note-toolbar-sep" aria-hidden="true" />
				{toolButton("Lien", Link2, openLink)}
				{toolButton("Image", ImagePlus, () => imageInput.current.click())}
				{toolButton("Joindre un fichier", Paperclip, () => fileInput.current.click())}
				<span className={`note-state is-${state}`} role="status" aria-live="polite">
					{state === "saving" || state === "dirty" ? (
						<>
							<LoaderCircle size={14} strokeWidth={2.4} aria-hidden="true" />
							Enregistrement…
						</>
					) : state === "error" ? (
						"Non enregistré"
					) : (
						<>
							<Check size={14} strokeWidth={2.6} aria-hidden="true" />
							Enregistré
						</>
					)}
				</span>
				<input ref={imageInput} type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/avif" multiple hidden onChange={(event) => addFiles([...event.target.files]).then(() => (event.target.value = ""))} />
				<input ref={fileInput} type="file" multiple hidden onChange={(event) => addFiles([...event.target.files], { inline: false }).then(() => (event.target.value = ""))} />
			</div>

			{linkOpen && (
				<form className="note-link" onSubmit={insertLink}>
					<label htmlFor={linkInputId} className="visually-hidden">
						Adresse du lien
					</label>
					<input id={linkInputId} className="input" type="text" inputMode="url" placeholder="https://…" value={linkValue} onChange={(event) => setLinkValue(event.target.value)} autoFocus />
					<button type="submit" className="btn is-small is-ink">
						Ajouter
					</button>
					<button type="button" className="tool is-bare" onClick={() => setLinkOpen(false)} aria-label="Annuler le lien">
						<X size={16} strokeWidth={2.2} aria-hidden="true" />
					</button>
				</form>
			)}

			<div
				ref={bodyRef}
				className={`note-body ${empty ? "is-empty" : ""}`}
				contentEditable
				suppressContentEditableWarning
				role="textbox"
				aria-multiline="true"
				aria-label="Contenu de la note"
				data-placeholder="Écris ici. Colle une capture d'écran avec Ctrl+V."
				onInput={markDirty}
				onPaste={onPaste}
				onDragOver={(event) => event.dataTransfer.types.includes("Files") && event.preventDefault()}
				onDrop={(event) => {
					if (!event.dataTransfer.files.length) return;
					event.preventDefault();
					addFiles([...event.dataTransfer.files]);
				}}
				onBlur={() => save()}
			/>

			{files.length > 0 && (
				<ul className="note-files" aria-label="Pièces jointes">
					{files.map((file) => (
						<li key={file.id}>
							<button type="button" className="note-file" onClick={() => openAttachment(file).catch((error) => setMessage(error.message))} title={`Télécharger ${file.name}`}>
								<Download size={14} strokeWidth={2.4} aria-hidden="true" />
								<span>{file.name}</span>
								<small>{formatSize(file.size)}</small>
							</button>
							<button type="button" className="tool is-bare" onClick={() => removeFile(file.id)} aria-label={`Retirer ${file.name}`}>
								<X size={14} strokeWidth={2.4} aria-hidden="true" />
							</button>
						</li>
					))}
				</ul>
			)}

			{message && (
				<p className="note-message" role="status">
					{message}
					<button type="button" className="tool is-bare" onClick={() => setMessage(null)} aria-label="Masquer le message">
						<X size={14} strokeWidth={2.4} aria-hidden="true" />
					</button>
				</p>
			)}

			<div className="note-foot">
				{confirmDelete ? (
					<>
						<span>Supprimer cette note et ses pièces jointes ?</span>
						<button type="button" className="btn is-small is-danger" onClick={deleteNote}>
							Supprimer
						</button>
						<button type="button" className="btn is-small" onClick={() => setConfirmDelete(false)}>
							Garder
						</button>
					</>
				) : (
					<button type="button" className="btn is-small note-delete" onClick={() => setConfirmDelete(true)}>
						<Trash2 size={15} strokeWidth={2.2} aria-hidden="true" />
						Supprimer la note
					</button>
				)}
			</div>
		</div>
	);
};

export default NoteEditor;
