import { ChevronRight } from "lucide-react";
import { useMemo } from "react";
import { eventTitle, subjectKey } from "../../../shared/src/events.ts";
import type { ExtensionState, PageRequest } from "../../src/lib/messages";
import type { Settings } from "../../src/lib/state";

const SYNC_CHOICES = [5, 10, 15, 30];
const THEMES = [
	["auto", "Comme EpiTime"],
	["light", "Clair"],
	["dark", "Sombre"],
] as const;

const SettingsView = ({ state, act }: { state: ExtensionState; act: (request: PageRequest) => Promise<void> }) => {
	const settings = state.settings;
	const save = (patch: (draft: Settings) => void) => {
		const next = structuredClone(settings);
		patch(next);
		void act({ type: "settings.save", settings: next });
	};

	const subjects = useMemo(() => {
		const map = new Map<string, string>();
		for (const event of state.schedule.events) map.set(subjectKey(event), eventTitle(event));
		for (const key of settings.ignoredSubjects) if (!map.has(key)) map.set(key, key);
		return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], "fr"));
	}, [state.schedule.events, settings.ignoredSubjects]);
	const muted = settings.ignoredSubjects.length;

	return (
		<div className="settings">
			<section className="group" aria-labelledby="g-notif">
				<h2 className="group-label" id="g-notif">
					Notifications
				</h2>
				<div className="group-card">
					<label className="row">
						<span className="row-text">
							<strong>Rappel avant chaque cours</strong>
							<small>{settings.reminders.minutesBefore} min avant, tant que le navigateur est ouvert</small>
						</span>
						<input
							type="checkbox"
							role="switch"
							className="switch"
							checked={settings.reminders.enabled}
							onChange={(event) => save((draft) => void (draft.reminders.enabled = event.target.checked))}
						/>
					</label>
					<label className="row">
						<span className="row-text">
							<strong>Changements de planning</strong>
							<small>Salle, horaire, annulation, nouveau cours</small>
						</span>
						<input
							type="checkbox"
							role="switch"
							className="switch"
							checked={settings.changes.enabled}
							onChange={(event) => save((draft) => void (draft.changes.enabled = event.target.checked))}
						/>
					</label>
				</div>
			</section>

			<section className="group" aria-labelledby="g-planning">
				<h2 className="group-label" id="g-planning">
					Planning
				</h2>
				<div className="group-card">
					<div className="row is-stacked">
						<span className="row-text">
							<strong id="sync-every">Vérifier le planning toutes les</strong>
						</span>
						<div className="seg is-fill" role="group" aria-labelledby="sync-every">
							{SYNC_CHOICES.map((value) => (
								<button
									key={value}
									type="button"
									className={settings.syncMinutes === value ? "is-on" : ""}
									aria-pressed={settings.syncMinutes === value}
									onClick={() => save((draft) => void (draft.syncMinutes = value))}>
									{value} min
								</button>
							))}
						</div>
					</div>
					{subjects.length > 0 && (
						<details className="row-details">
							<summary className="row">
								<span className="row-text">
									<strong>Cours suivis</strong>
									<small>{muted ? `${muted} masqué${muted > 1 ? "s" : ""}, sans rappel ni alerte` : "Tous, avec rappels et alertes"}</small>
								</span>
								<ChevronRight className="row-chevron" size={18} strokeWidth={2.2} aria-hidden="true" />
							</summary>
							<ul className="checks">
								{subjects.map(([key, title]) => (
									<li key={key}>
										<label>
											<input
												type="checkbox"
												checked={!settings.ignoredSubjects.includes(key)}
												onChange={(event) =>
													save((draft) => {
														draft.ignoredSubjects = event.target.checked
															? draft.ignoredSubjects.filter((item) => item !== key)
															: [...draft.ignoredSubjects, key];
													})
												}
											/>
											{title}
										</label>
									</li>
								))}
							</ul>
						</details>
					)}
				</div>
			</section>

			<section className="group" aria-labelledby="g-look">
				<h2 className="group-label" id="g-look">
					Apparence
				</h2>
				<div className="group-card">
					<div className="row is-stacked">
						<div className="seg is-fill" role="group" aria-label="Thème">
							{THEMES.map(([value, label]) => (
								<button
									key={value}
									type="button"
									className={settings.theme === value ? "is-on" : ""}
									aria-pressed={settings.theme === value}
									onClick={() => save((draft) => void (draft.theme = value))}>
									{label}
								</button>
							))}
						</div>
					</div>
				</div>
			</section>

			<section className="group" aria-labelledby="g-account">
				<h2 className="group-label" id="g-account">
					Compte
				</h2>
				<div className="group-card">
					<div className="row">
						<span className="row-text">
							{state.link ? (
								<>
									<strong>{state.link.user.name || state.link.user.username}</strong>
									<small>{new URL(state.link.origin).host}</small>
								</>
							) : (
								<strong>Pas encore associée</strong>
							)}
						</span>
						{state.link && (
							<button type="button" className="btn is-small" onClick={() => act({ type: "link.remove" })}>
								Dissocier
							</button>
						)}
					</div>
				</div>
				<p className="settings-note">
					La session vient d'EpiTime Web, reste enregistrée dans ce navigateur jusqu'à son expiration (24 h, renouvelée à chaque visite d'EpiTime) et n'est envoyée qu'au serveur EpiTime. Les notes restent dans ce
					navigateur : désinstaller l'extension efface celles qui n'ont pas été échangées avec EpiTime Web, pense à les exporter depuis le panneau des notes.
				</p>
			</section>
		</div>
	);
};

export default SettingsView;
