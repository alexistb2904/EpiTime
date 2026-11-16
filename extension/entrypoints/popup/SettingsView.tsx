import { Minus, Plus, Settings as SettingsIcon } from "lucide-react";
import { useMemo } from "react";
import { eventTitle, subjectKey } from "../../../shared/src/events.ts";
import { clampReminderMinutes, REMINDER_PRESETS } from "../../../shared/src/reminders.ts";
import type { ExtensionState, PageRequest } from "../../src/lib/messages";
import type { ChangeCategories, Settings } from "../../src/lib/state";

const CATEGORY_LABELS: Array<[keyof ChangeCategories, string]> = [
	["room", "Changement de salle"],
	["time", "Changement d'horaire ou de jour"],
	["cancelled", "Annulation ou retrait"],
	["created", "Nouveau cours"],
	["other", "Autres changements (intervenant, groupes…)"],
];

const SettingsView = ({ state, act }: { state: ExtensionState; act: (request: PageRequest) => Promise<void> }) => {
	const settings = state.settings;
	const save = (patch: (draft: Settings) => void) => {
		const next = structuredClone(settings);
		patch(next);
		void act({ type: "settings.save", settings: next });
	};
	const minutes = settings.reminders.minutesBefore;
	const setMinutes = (value: number) => save((draft) => void (draft.reminders.minutesBefore = clampReminderMinutes(value)));
	const webPush = state.link?.webPush;

	const subjects = useMemo(() => {
		const map = new Map<string, string>();
		for (const event of state.schedule.events) map.set(subjectKey(event), eventTitle(event));
		for (const key of settings.ignoredSubjects) if (!map.has(key)) map.set(key, key);
		return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], "fr"));
	}, [state.schedule.events, settings.ignoredSubjects]);

	return (
		<section className="sheet tool-sheet page-sheet" style={{ "--ic": 285 } as React.CSSProperties} aria-label="Réglages">
			<span className="tape modal-tape" aria-hidden="true" />
			<header className="modal-head">
				<div className="modal-title">
					<h2>
						<span className="modal-icon" aria-hidden="true">
							<SettingsIcon size={18} strokeWidth={2.2} />
						</span>
						Réglages
					</h2>
				</div>
			</header>

			<div className="modal-body">
				<section className="settings-block">
					<div className="settings-row">
						<div>
							<h3>Rappel avant chaque cours</h3>
							<p>Une notification du système, même si EpiTime est fermé, tant que le navigateur est ouvert.</p>
						</div>
						<input
							type="checkbox"
							role="switch"
							className="switch"
							checked={settings.reminders.enabled}
							onChange={(event) => save((draft) => void (draft.reminders.enabled = event.target.checked))}
							aria-label="Rappels avant les cours"
						/>
					</div>
					{settings.reminders.enabled && (
						<>
							<div className="notif-field">
								<span className="label" id="reminder-minutes">
									Prévenir
								</span>
								<div className="days-row" role="group" aria-labelledby="reminder-minutes">
									{REMINDER_PRESETS.map((preset) => (
										<button
											key={preset}
											type="button"
											className={`day-chip ${minutes === preset ? "is-on" : ""}`}
											aria-pressed={minutes === preset}
											onClick={() => setMinutes(preset)}>
											{preset} min
										</button>
									))}
								</div>
								<div className="stepper" role="group" aria-label="Délai personnalisé">
									<button type="button" className="tool" onClick={() => setMinutes(minutes - 1)} aria-label="Une minute de moins">
										<Minus size={16} strokeWidth={2.4} aria-hidden="true" />
									</button>
									<input
										type="number"
										className="input"
										value={minutes}
										min={1}
										max={1440}
										onChange={(event) => event.target.value && setMinutes(Number(event.target.value))}
										aria-label="Minutes avant le cours"
									/>
									<button type="button" className="tool" onClick={() => setMinutes(minutes + 1)} aria-label="Une minute de plus">
										<Plus size={16} strokeWidth={2.4} aria-hidden="true" />
									</button>
									<span>min avant</span>
								</div>
							</div>
							{webPush?.enabled && (
								<div className="settings-row">
									<div>
										<h3>Aussi quand les rappels du site sont actifs</h3>
										<p>
											Les notifications d'EpiTime Web préviennent déjà {webPush.minutesBefore} min avant. Laisse ceci coupé pour ne pas recevoir deux rappels
											pour le même cours.
										</p>
									</div>
									<input
										type="checkbox"
										role="switch"
										className="switch"
										checked={settings.reminders.source === "always"}
										onChange={(event) => save((draft) => void (draft.reminders.source = event.target.checked ? "always" : "auto"))}
										aria-label="Rappels de l'extension même avec ceux du site"
									/>
								</div>
							)}
							<p className="notif-summary">
								Rappel <strong>{minutes} min</strong> avant chaque cours
								{webPush?.enabled && settings.reminders.source === "auto" ? ", sauf les jours couverts par les rappels du site." : "."}
							</p>
						</>
					)}
				</section>

				<section className="settings-block">
					<div className="settings-row">
						<div>
							<h3>Alertes de changement</h3>
							<p>Salle, horaire, annulation : repérés en comparant ton planning à chaque vérification.</p>
						</div>
						<input
							type="checkbox"
							role="switch"
							className="switch"
							checked={settings.changes.enabled}
							onChange={(event) => save((draft) => void (draft.changes.enabled = event.target.checked))}
							aria-label="Alertes de changement"
						/>
					</div>
					{settings.changes.enabled && (
						<ul className="checks">
							{CATEGORY_LABELS.map(([key, label]) => (
								<li key={key}>
									<label>
										<input
											type="checkbox"
											checked={settings.changes.categories[key]}
											onChange={(event) => save((draft) => void (draft.changes.categories[key] = event.target.checked))}
										/>
										{label}
									</label>
								</li>
							))}
						</ul>
					)}
					<div className="notif-field">
						<span className="label" id="sync-every">
							Vérifier le planning
						</span>
						<div className="seg" role="group" aria-labelledby="sync-every">
							{[5, 10, 15, 30].map((value) => (
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
				</section>

				{subjects.length > 0 && (
					<section className="settings-block">
						<h3>Cours suivis</h3>
						<p>Décoche un cours pour couper ses rappels et ses alertes. Il reste affiché, en grisé.</p>
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
					</section>
				)}

				<section className="settings-block">
					<div className="notif-field">
						<span className="label" id="theme">
							Thème
						</span>
						<div className="seg" role="group" aria-labelledby="theme">
							{(
								[
									["auto", "Comme EpiTime"],
									["light", "Clair"],
									["dark", "Sombre"],
								] as const
							).map(([value, label]) => (
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
				</section>

				<section className="settings-block settings-disclaimer">
					<h3>Compte</h3>
					{state.link ? (
						<>
							<p>
								Associée à <strong>{state.link.user.name || state.link.user.username}</strong> sur {new URL(state.link.origin).host}. La session vient d'EpiTime
								Web, reste en mémoire jusqu'à la fermeture du navigateur et n'est envoyée qu'au serveur EpiTime.
							</p>
							<button type="button" className="btn is-small account-unlink" onClick={() => act({ type: "link.remove" })}>
								Dissocier l'extension
							</button>
						</>
					) : (
						<p>Pas encore associée à EpiTime.</p>
					)}
					<p className="modal-hint fine-print">
						Les notes restent dans ce navigateur et ne passent par aucun serveur. Désinstaller l'extension efface celles qui n'ont pas été échangées avec EpiTime Web :
						exporte-les depuis le panneau des notes. Aucun rappel ne part quand le navigateur est fermé.
					</p>
				</section>
			</div>
		</section>
	);
};

export default SettingsView;
