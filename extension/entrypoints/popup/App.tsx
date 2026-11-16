import { AlertTriangle, ArrowLeft, Bell, CloudOff, ExternalLink, Link2, NotebookPen, RefreshCw, Settings as SettingsIcon, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	courseHue,
	endMs,
	eventIdentity,
	eventTitle,
	formatTime,
	isEventCancelled,
	isExamEvent,
	placeLabel,
	startMs,
	teacherNames,
	type ZeusEvent,
} from "../../../shared/src/events.ts";
import { courseRefOf, type CourseRef } from "../../../shared/src/notes/model.ts";
import { eventsBetween, findCurrentEvent, findNextEvent, formatRelative, isIgnored, remainingToday } from "../../../shared/src/schedule.ts";
import type { ExtensionState } from "../../src/lib/messages";
import { DEFAULT_ORIGIN } from "../../src/lib/origins";
import { browser, currentWindowId, openNotesPanel, openWebApp } from "../../src/lib/platform";
import { useExtensionState, useNow, useTheme } from "../../src/ui/hooks";
import SettingsView from "./SettingsView";

type View = "today" | "week" | "changes" | "settings";
type CSSVars = React.CSSProperties & Record<`--${string}`, string | number>;

const hueOf = (event: ZeusEvent) => courseHue(event.name || event.typeName || "");

const deepLink = (event: ZeusEvent) => {
	const identity = eventIdentity(event);
	const params = new URLSearchParams({ date: event.startDate });
	if (identity.startsWith("r:")) params.set("event", identity.slice(2));
	return `/?${params}`;
};

const App = () => {
	const { state, error, act } = useExtensionState();
	useTheme(state);
	const now = useNow();
	const [view, setView] = useState<View>("today");
	const [panelError, setPanelError] = useState<string | null>(null);
	const [refreshing, setRefreshing] = useState(false);
	const windowId = useRef<number | undefined>(undefined);

	useEffect(() => {
		currentWindowId().then((id) => (windowId.current = id));
	}, []);

	const origin = state?.link?.origin ?? DEFAULT_ORIGIN;
	const openWeb = (path = "/") => openWebApp(origin, path).then(() => window.close());

	const openNotes = (course: CourseRef | null) => {
		const opening = openNotesPanel(windowId.current);
		void browser.storage.session.set({ notesFocus: { key: course?.key ?? null, ref: course, at: Date.now() } });
		opening.then(() => window.close()).catch(() => setPanelError("Impossible d'ouvrir le panneau des notes ici. Réessaie depuis une fenêtre normale."));
	};

	const refresh = async () => {
		setRefreshing(true);
		await act({ type: "schedule.refresh" });
		setRefreshing(false);
	};

	if (!state) {
		return <main className="popup is-loading">{error ? <p className="error-note">{error}</p> : <span className="spinner" aria-label="Chargement" />}</main>;
	}

	const unseen = state.changes.unseen;
	const home = view === "today" || view === "week";
	return (
		<main className="popup">
			<header className="top">
				{home ? (
					<div className="top-brand">
						<img src="/icon/96.png" alt="" width="30" height="30" />
						<span>EpiTime</span>
					</div>
				) : (
					<div className="top-brand">
						<button type="button" className="tool is-bare" onClick={() => setView("today")} aria-label="Retour" title="Retour">
							<ArrowLeft size={19} strokeWidth={2.2} aria-hidden="true" />
						</button>
						<h1>{view === "settings" ? "Réglages" : "Changements"}</h1>
					</div>
				)}
				<div className="top-tools">
					<button type="button" className="tool is-bare" onClick={() => openNotes(null)} aria-label="Ouvrir les notes" title="Notes">
						<NotebookPen size={19} strokeWidth={2.1} aria-hidden="true" />
					</button>
					<button
						type="button"
						className="tool is-bare"
						onClick={() => {
							setView("changes");
							if (unseen) void act({ type: "changes.seen" });
						}}
						aria-label={unseen ? `Changements du planning, ${unseen} non lus` : "Changements du planning"}
						title="Changements">
						<Bell size={19} strokeWidth={2.1} aria-hidden="true" />
						{unseen > 0 && <span className="count">{Math.min(unseen, 99)}</span>}
					</button>
					<button type="button" className="tool is-bare" onClick={() => setView("settings")} aria-label="Réglages" title="Réglages">
						<SettingsIcon size={19} strokeWidth={2.1} aria-hidden="true" />
					</button>
				</div>
			</header>

			{panelError && <Note>{panelError}</Note>}
			{error && <Note>{error}</Note>}

			{view === "settings" ? (
				<SettingsView state={state} act={act} />
			) : view === "changes" ? (
				<ChangesView state={state} now={now} act={act} />
			) : !state.link ? (
				<Onboarding state={state} onLink={() => act({ type: "link.request" }).then(() => window.close())} />
			) : (
				<>
					<div className="subbar">
						<div className="seg" role="group" aria-label="Affichage">
							<button type="button" className={view === "today" ? "is-on" : ""} aria-pressed={view === "today"} onClick={() => setView("today")}>
								Aujourd'hui
							</button>
							<button type="button" className={view === "week" ? "is-on" : ""} aria-pressed={view === "week"} onClick={() => setView("week")}>
								7 jours
							</button>
						</div>
						<SyncStatus state={state} refreshing={refreshing} onRefresh={refresh} />
					</div>
					<SessionNotice state={state} onReconnect={() => openWeb()} />
					{view === "today" ? <TodayView state={state} now={now} openNotes={openNotes} openWeb={openWeb} /> : <WeekView state={state} now={now} openWeb={openWeb} />}
				</>
			)}

			<footer className="foot">
				<button type="button" className="btn is-small" onClick={() => openWeb()}>
					Ouvrir EpiTime Web
					<ExternalLink size={14} strokeWidth={2.2} aria-hidden="true" />
				</button>
			</footer>
		</main>
	);
};

const Note = ({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) => (
	<div className="error-note" role="status">
		<AlertTriangle size={18} strokeWidth={2.2} aria-hidden="true" />
		<span>{children}</span>
		{action}
	</div>
);

const Onboarding = ({ state, onLink }: { state: ExtensionState; onLink: () => void }) => (
	<section className="onboarding">
		<h1>Ton planning, sans ouvrir d'onglet</h1>
		<p>Associe l'extension à ton compte EpiTime pour voir ton prochain cours, recevoir un rappel avant chaque cours et être prévenu quand une salle ou un horaire change.</p>
		<ol>
			<li>EpiTime s'ouvre. Connecte-toi avec Microsoft si besoin.</li>
			<li>L'association se fait toute seule. Ton mot de passe n'est jamais demandé.</li>
		</ol>
		<button type="button" className="btn is-ink" onClick={onLink}>
			<Link2 size={17} strokeWidth={2.2} aria-hidden="true" />
			{state.linkRequested ? "Rouvrir EpiTime" : "Associer à EpiTime"}
		</button>
		<p className="small muted">Tes notes fonctionnent déjà sans association, depuis l'icône carnet en haut.</p>
	</section>
);

const SyncStatus = ({ state, refreshing, onRefresh }: { state: ExtensionState; refreshing: boolean; onRefresh: () => void }) => {
	const offline = state.schedule.lastError?.kind === "offline" || state.schedule.lastError?.kind === "network";
	return (
		<span className="sync">
			{offline && <CloudOff size={14} strokeWidth={2.3} aria-hidden="true" />}
			<span>{state.schedule.lastSync ? `Mis à jour à ${formatTime(state.schedule.lastSync)}` : "Jamais synchronisé"}</span>
			<button
				type="button"
				className={`tool is-bare ${refreshing ? "is-spinning" : ""}`}
				onClick={onRefresh}
				disabled={refreshing}
				aria-label="Actualiser le planning"
				title="Actualiser">
				<RefreshCw size={15} strokeWidth={2.3} aria-hidden="true" />
			</button>
		</span>
	);
};

const SessionNotice = ({ state, onReconnect }: { state: ExtensionState; onReconnect: () => void }) => {
	const lastError = state.schedule.lastError;
	if (!state.session.usable) {
		return (
			<Note
				action={
					<button type="button" className="btn is-small" onClick={onReconnect}>
						Ouvrir EpiTime
					</button>
				}>
				Reconnexion nécessaire : ouvre EpiTime, la session reprendra toute seule. Ton dernier planning reste affiché.
			</Note>
		);
	}
	if (!state.link?.groups.length) {
		return (
			<Note
				action={
					<button type="button" className="btn is-small" onClick={onReconnect}>
						Ouvrir EpiTime
					</button>
				}>
				Choisis tes groupes dans EpiTime pour voir ton planning ici.
			</Note>
		);
	}
	if (lastError && lastError.kind !== "auth") return <Note>{lastError.message} Le dernier planning reçu reste affiché.</Note>;
	return null;
};

const TodayView = ({ state, now, openNotes, openWeb }: { state: ExtensionState; now: number; openNotes: (course: CourseRef | null) => void; openWeb: (path?: string) => void }) => {
	const events = state.schedule.events;
	const filter = { ignoredSubjects: state.settings.ignoredSubjects };
	const current = findCurrentEvent(events, now, filter);
	const next = findNextEvent(events, now, filter);
	const later = remainingToday(events, now).filter((event) => event !== current && event !== next);

	if (!events.length && !state.schedule.lastSync) return <div className="agenda-empty">{state.link?.groups.length ? <p>Premier relevé en cours…</p> : null}</div>;

	return (
		<div className="today">
			{current && <NextUp event={current} now={now} live onNotes={() => openNotes(courseRefOf(current))} onOpen={() => openWeb(deepLink(current))} />}
			{next && <NextUp event={next} now={now} onNotes={() => openNotes(courseRefOf(next))} onOpen={() => openWeb(deepLink(next))} />}
			{!current && !next && (
				<div className="agenda-empty">
					<p>Plus de cours aujourd'hui.</p>
				</div>
			)}
			{later.length > 0 && (
				<div className="agenda">
					<AgendaDay day={now} now={now} events={later} filter={filter} openWeb={openWeb} />
				</div>
			)}
			{!current && (
				<button type="button" className="btn free-note" onClick={() => openNotes(null)}>
					<NotebookPen size={16} strokeWidth={2.2} aria-hidden="true" />
					Note libre
				</button>
			)}
		</div>
	);
};

const NextUp = ({
	event,
	now,
	live = false,
	onNotes,
	onOpen,
}: {
	event: ZeusEvent;
	now: number;
	live?: boolean;
	onNotes: () => void;
	onOpen: () => void;
}) => {
	const exam = isExamEvent(event);
	const label = exam ? (live ? "Examen en cours" : "Prochain examen") : live ? "En cours" : "Prochain cours";
	return (
		<section className={`next-up ${exam ? "is-exam" : ""}`} style={{ "--h": hueOf(event) } as CSSVars} aria-label={label}>
			<span className="next-up-time">{formatTime(startMs(event))}</span>
			<span className="next-up-main">
				<strong>{eventTitle(event)}</strong>
				<span>
					{label} · {placeLabel(event) || "Salle non précisée"}
				</span>
			</span>
			<span className="hand next-up-when">← {formatRelative(event, now)}</span>
			<span className="next-up-actions">
				<button type="button" className={`btn is-small ${live ? "is-ink" : ""}`} onClick={onNotes}>
					<NotebookPen size={15} strokeWidth={2.2} aria-hidden="true" />
					{live ? "Notes du cours" : "Notes"}
				</button>
				<button type="button" className="btn is-small" onClick={onOpen}>
					Détails
				</button>
			</span>
		</section>
	);
};

const AgendaDay = ({
	day,
	now,
	events,
	filter,
	openWeb,
}: {
	day: number;
	now: number;
	events: ZeusEvent[];
	filter: { ignoredSubjects: string[] };
	openWeb: (path?: string) => void;
}) => {
	const date = new Date(day);
	const isToday = date.toDateString() === new Date(now).toDateString();
	return (
		<section className="agenda-day">
			<h2 className="agenda-date">
				{date.toLocaleDateString("fr-FR", { weekday: "long" })}
				<span>{date.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}</span>
				{isToday && <span className="hand agenda-today">aujourd'hui</span>}
			</h2>
			<ol>
				{events.map((event, index) => {
					const cancelled = isEventCancelled(event);
					const exam = isExamEvent(event);
					const teachers = teacherNames(event);
					const className = ["agenda-row", cancelled && "is-cancelled", exam && "is-exam", event.isOnline && "is-online", isIgnored(event, filter) && "is-ignored"]
						.filter(Boolean)
						.join(" ");
					return (
						<li key={eventIdentity(event)} style={{ "--i": index } as CSSVars}>
							<button type="button" className={className} style={{ "--h": hueOf(event) } as CSSVars} onClick={() => openWeb(deepLink(event))}>
								<span className="agenda-time">
									<span>{formatTime(startMs(event))}</span>
									<span>{formatTime(endMs(event))}</span>
								</span>
								<span className="agenda-main">
									{exam && <span className="exam-tag">Examen</span>}
									<strong>{eventTitle(event)}</strong>
									<span>{[placeLabel(event), teachers.join(", ")].filter(Boolean).join(" · ")}</span>
								</span>
								{cancelled && <span className="hand agenda-note">annulé</span>}
							</button>
						</li>
					);
				})}
			</ol>
		</section>
	);
};

const WeekView = ({ state, now, openWeb }: { state: ExtensionState; now: number; openWeb: (path?: string) => void }) => {
	const filter = { ignoredSubjects: state.settings.ignoredSubjects };
	const days = useMemo(() => {
		const start = new Date(now);
		start.setHours(0, 0, 0, 0);
		return Array.from({ length: 7 }, (_, index) => {
			const from = start.getTime() + index * 86_400_000;
			return { from, events: eventsBetween(state.schedule.events, from, from + 86_400_000).filter((event) => startMs(event) >= from) };
		}).filter((day) => day.events.length);
	}, [state.schedule.events, now]);

	if (!days.length) {
		return (
			<div className="agenda-empty">
				<p>Aucun cours dans les 7 prochains jours.</p>
			</div>
		);
	}
	return (
		<div className="agenda">
			{days.map((day) => (
				<AgendaDay key={day.from} day={day.from} now={now} events={day.events} filter={filter} openWeb={openWeb} />
			))}
			<button type="button" className="btn is-small week-more" onClick={() => openWeb()}>
				Planning complet dans EpiTime
				<ExternalLink size={14} strokeWidth={2.2} aria-hidden="true" />
			</button>
		</div>
	);
};

const ChangesView = ({ state, now, act }: { state: ExtensionState; now: number; act: ReturnType<typeof useExtensionState>["act"] }) => {
	const items = state.changes.items;
	const seen = (at: number) =>
		new Date(at).toDateString() === new Date(now).toDateString()
			? `à ${formatTime(at)}`
			: new Date(at).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
	return (
		<section className="settings" aria-label="Changements du planning">
			{items.length === 0 ? (
				<p className="settings-note">Aucun changement repéré pour l'instant. L'extension vérifie ton planning toutes les {state.settings.syncMinutes} minutes.</p>
			) : (
				<>
					<ul className="group-card change-list">
						{items.map((item) => (
							<li key={`${item.key}-${item.detectedAt}`} className={`change ${item.category === "cancelled" ? "is-cancel" : ""}`}>
								<strong>{item.notification.title}</strong>
								<span>{item.notification.message}</span>
								<small>repéré {seen(item.detectedAt)}</small>
								<button
									type="button"
									className="tool is-bare change-remove"
									onClick={() => act({ type: "changes.remove", key: item.key, detectedAt: item.detectedAt })}
									aria-label={`Supprimer : ${item.notification.title}`}
									title="Supprimer">
									<X size={16} strokeWidth={2.3} aria-hidden="true" />
								</button>
							</li>
						))}
					</ul>
					<button type="button" className="btn is-small change-clear" onClick={() => act({ type: "changes.clear" })}>
						Tout effacer
					</button>
				</>
			)}
		</section>
	);
};

export default App;
