import React from "react";
import { AlertCircle, Check, Minus, Moon, Sun } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { trackEvent } from "../utils/analyticsTracker";
import { androidAppDownloadUrl, iosAppDownloadUrl } from "../utils/downloadLinks";
import { isIOSDevice } from "../utils/platform";
import { courseHue } from "../utils/courseColor";
import "./Login.css";

const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven"];
const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
const NEXT_DAY = 2;

// Planning d'exemple affiché sur la feuille (pas de vraies données).
const SAMPLE = [
	[
		{ start: 9, end: 11, title: "Algorithmique", room: "Amphi 1" },
		{ start: 14, end: 16, title: "Mathématiques discrètes", room: "Salle 2.07" },
	],
	[
		{ start: 10, end: 12, title: "Anglais", room: "Salle 1.12" },
		{ start: 13, end: 15, title: "Programmation C", room: "Labo SM14" },
	],
	[
		{ start: 9, end: 12, title: "Approximation de fonctions", room: "Amphi 2" },
		{ start: 14, end: 16, title: "Architecture logicielle", room: "Amphi 4", oldRoom: "Amphi 2", next: true },
		{ start: 16, end: 18, title: "Projet libre", room: "Salle machines" },
	],
	[
		{ start: 9, end: 11, title: "Éléments réseau", room: "Salle 3.01" },
		{ start: 11, end: 13, title: "Recherche opérationnelle", room: "Amphi 1" },
	],
	[
		{ start: 9, end: 11, title: "Séminaire APC", room: "Amphi 3" },
		{ start: 11, end: 13, title: "Anglais", room: "Salle 1.12" },
	],
];

const PLATFORMS = [
	{ key: "web", label: "Web" },
	{ key: "android", label: "Android" },
	{ key: "ios", label: "iPhone, iPad" },
];

const FEATURES = [
	{ label: "Planning de la semaine", on: ["web", "android", "ios"] },
	{ label: "Salles libres", on: ["web", "android", "ios"] },
	{ label: "Rappels avant les cours", on: ["web", "android", "ios"] },
	{ label: "Notes et syllabus", on: ["android", "ios"] },
	{ label: "Widgets d'écran d'accueil", on: ["android"] },
	{ label: "Sans installation", on: ["web"] },
];

const weekLabel = () => {
	const monday = new Date();
	monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
	return `Semaine du ${monday.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}`;
};

const detectPlatform = () => {
	if (typeof navigator === "undefined") return "web";
	if (/Android/i.test(navigator.userAgent)) return "android";
	if (isIOSDevice(navigator)) return "ios";
	return "web";
};

const MicrosoftMark = () => (
	<span className="ms-mark" aria-hidden="true">
		<span></span>
		<span></span>
		<span></span>
		<span></span>
	</span>
);

const Pin = ({ className }) => (
	<svg className={`pin ${className || ""}`} viewBox="0 0 20 20" aria-hidden="true">
		<circle cx="10" cy="10" r="7" />
		<circle cx="7.6" cy="7.4" r="2" className="pin-shine" />
	</svg>
);

const Login = () => {
	const { login, loading, error } = useAuth();
	const { theme, toggleTheme } = useTheme();
	const platform = React.useMemo(detectPlatform, []);
	const week = React.useMemo(weekLabel, []);

	const handleThemeToggle = () => {
		trackEvent("theme_toggle_clicked", { area: "login", to_theme: theme === "light" ? "dark" : "light" });
		toggleTheme();
	};

	const tickets = {
		web: (
			<button key="web" type="button" className="ticket" onClick={login} disabled={loading}>
				<span className="ticket-stub">{loading ? <span className="ticket-spinner" aria-hidden="true"></span> : <MicrosoftMark />}</span>
				<span className="ticket-text">
					<strong>{loading ? "Connexion en cours…" : "Se connecter avec Microsoft"}</strong>
					<small>Version web, compte @epita.fr</small>
				</span>
			</button>
		),
		android: (
			<a
				key="android"
				className="ticket"
				href={androidAppDownloadUrl}
				target="_blank"
				rel="noopener noreferrer"
				onClick={() => trackEvent("android_download_clicked", { area: "login", channel: "github_releases" })}>
				<span className="ticket-stub">
					<img src="/icons/android.svg" alt="" />
				</span>
				<span className="ticket-text">
					<strong>App Android</strong>
					<small>APK sur GitHub</small>
				</span>
			</a>
		),
		ios: (
			<a
				key="ios"
				className="ticket"
				href={iosAppDownloadUrl}
				target="_blank"
				rel="noopener noreferrer"
				onClick={() => trackEvent("ios_download_clicked", { area: "login", channel: "app_store" })}>
				<span className="ticket-stub">
					<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
						<path d="M16.37 12.73c-.02-2.3 1.88-3.4 1.96-3.46-1.07-1.56-2.73-1.78-3.32-1.8-1.41-.14-2.76.83-3.47.83-.72 0-1.82-.81-3-.79-1.54.02-2.96.9-3.76 2.28-1.6 2.78-.41 6.9 1.15 9.16.76 1.1 1.67 2.34 2.86 2.3 1.15-.05 1.58-.74 2.97-.74 1.38 0 1.77.74 2.98.72 1.23-.02 2.01-1.12 2.76-2.23.87-1.28 1.23-2.52 1.25-2.58-.03-.01-2.4-.92-2.42-3.66zM14.1 5.98c.63-.77 1.06-1.83.94-2.89-.91.04-2.01.61-2.66 1.37-.58.67-1.1 1.75-.96 2.79 1.01.08 2.05-.52 2.68-1.27z" />
					</svg>
				</span>
				<span className="ticket-text">
					<strong>App iPhone et iPad</strong>
					<small>Sur l'App Store</small>
				</span>
			</a>
		),
	};

	// Le ticket principal dépend de l'appareil : l'app native sur mobile, la connexion web ailleurs.
	const order = [platform, ...["web", "android", "ios"].filter((key) => key !== platform)];
	const ticketRow = (
		<div className="tickets" data-primary={platform}>
			{order.map((key) => tickets[key])}
		</div>
	);

	return (
		<div className="board">
			<header className="board-bar">
				<a className="board-brand" href="/">
					<img src="/icons/app_logo.png" alt="" width="40" height="40" />
					<span>EpiTime</span>
				</a>
				<nav className="board-tools" aria-label="Liens">
					<a className="board-tool" href="https://github.com/alexistb2904/EpiTime" target="_blank" rel="noopener noreferrer" aria-label="Code source sur GitHub">
						<svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true" fill="currentColor">
							<path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
						</svg>
					</a>
					<button className="board-tool" type="button" onClick={handleThemeToggle} aria-label={theme === "dark" ? "Passer au thème clair" : "Passer au thème sombre"}>
						{theme === "dark" ? <Sun size={18} strokeWidth={2.2} aria-hidden="true" /> : <Moon size={18} strokeWidth={2.2} aria-hidden="true" />}
					</button>
				</nav>
			</header>

			<main>
				<section className="board-hero" aria-labelledby="hero-title">
					<article className="sheet notice paper-pink">
						<Pin className="pin-a" />
						<h1 id="hero-title">Ton emploi du temps EPITA, enfin lisible.</h1>
						<p className="notice-lede">Tes cours, tes salles et des rappels avant chaque cours, sur le web, Android et iPhone. Gratuit, open source, fait par un étudiant.</p>

						{error && (
							<p className="notice-error" role="alert">
								<AlertCircle size={18} strokeWidth={2.4} aria-hidden="true" />
								<span>{error}</span>
							</p>
						)}

						{ticketRow}
					</article>

					<figure className="sheet timetable" aria-label="Exemple d'emploi du temps EpiTime">
						<span className="tape" aria-hidden="true"></span>
						<Pin className="pin-b" />
						<header className="timetable-head">
							<strong>Emploi du temps</strong>
							<span>{week}</span>
						</header>
						<div className="timetable-grid" style={{ "--rows": HOURS.length }}>
							<span className="tt-corner" aria-hidden="true"></span>
							{DAYS.map((day, index) => (
								<span key={day} className={`tt-day ${index === NEXT_DAY ? "is-today" : ""}`} style={{ gridColumn: index + 2 }}>
									{day}
								</span>
							))}
							{HOURS.map((hour, index) => (
								<span key={hour} className="tt-hour" style={{ gridRow: index + 2 }}>
									{String(hour).padStart(2, "0")}h
								</span>
							))}
							{SAMPLE.map((courses, day) =>
								courses.map((course) => (
									<div
										key={`${day}-${course.start}`}
										className={`tt-course ${course.next ? "is-next" : ""} ${day === NEXT_DAY ? "is-today" : ""}`}
										style={{ gridColumn: day + 2, gridRow: `${course.start - 6} / ${course.end - 6}`, "--h": courseHue(course.title) }}>
										<span className="tt-time">
											{course.start}h–{course.end}h
										</span>
										<strong>{course.next ? <mark className="marker">{course.title}</mark> : course.title}</strong>
										{course.oldRoom ? (
											<span className="tt-room">
												<s aria-label={`ancienne salle ${course.oldRoom}`}>{course.oldRoom}</s> <span className="pen">{course.room}</span>
											</span>
										) : (
											<span className="tt-room">{course.room}</span>
										)}
										{course.next && <span className="scribble">← toi, dans 12 min</span>}
									</div>
								))
							)}
						</div>
						<figcaption className="timetable-sample">Exemple</figcaption>
					</figure>
				</section>

				<section className="showcase" aria-labelledby="showcase-title">
					<header className="sheet showcase-label paper-sky">
						<Pin className="pin-a" />
						<h2 id="showcase-title">Sur ordi, en PWA ou en app.</h2>
						<p>Captures de l'app, avec des données d'exemple.</p>
					</header>

					<figure className="shot shot-web">
						<span className="tape" aria-hidden="true"></span>
						<img src="/showcase/web.webp" alt="EpiTime dans le navigateur : la semaine en grille, le prochain cours en haut, les groupes et filtres à gauche." width="1600" height="1000" loading="lazy" decoding="async" />
						<figcaption className="hand">le site, sur ordi</figcaption>
					</figure>

					<figure className="shot shot-pwa">
						<Pin className="pin-b" />
						<div className="phone">
							<img src="/showcase/pwa.webp" alt="EpiTime installé en PWA sur téléphone : la journée en cours et le prochain cours." width="780" height="1688" loading="lazy" decoding="async" />
						</div>
						<figcaption className="hand">la PWA, sans installer d'app</figcaption>
					</figure>

					<figure className="shot shot-native">
						<img src="/showcase/native.webp" alt="L'application mobile EpiTime : recherche de salle, détails d'un cours et agenda de la semaine." width="1440" height="1533" loading="lazy" decoding="async" />
						<figcaption className="hand">l'app Android et iPhone, avec tes notes</figcaption>
					</figure>
				</section>

				<section className="board-row" aria-labelledby="where-title">
					<article className="sheet matrix paper-mint">
						<Pin className="pin-c" />
						<h2 id="where-title">Le même planning, partout.</h2>
						<table>
							<thead>
								<tr>
									<td></td>
									{PLATFORMS.map((item) => (
										<th key={item.key} scope="col" className={item.key === platform ? "is-yours" : ""}>
											{item.label}
										</th>
									))}
								</tr>
							</thead>
							<tbody>
								{FEATURES.map((feature) => (
									<tr key={feature.label}>
										<th scope="row">{feature.label}</th>
										{PLATFORMS.map((item) => (
											<td key={item.key} className={item.key === platform ? "is-yours" : ""}>
												{feature.on.includes(item.key) ? (
													<Check size={18} strokeWidth={2.6} aria-label="Oui" />
												) : (
													<Minus size={16} strokeWidth={2} className="is-off" aria-label="Non" />
												)}
											</td>
										))}
									</tr>
								))}
							</tbody>
						</table>
					</article>

					<article className="sheet memo paper-orange">
						<span className="tape tape-memo" aria-hidden="true"></span>
						<h2>Pas EPITA, pas Zeus : un projet étudiant.</h2>
						<p>Les mêmes données que Zeus et Auriga, rangées pour être lues d'un coup d'œil. Pas de pub, et une mesure d'audience seulement si tu l'acceptes.</p>
						{tickets[platform]}
					</article>
				</section>
			</main>

			<footer className="board-footer">
				<p>
					Projet open-source étudiant indépendant. Non affilié à Zeus, IONIS ou EPITA. <a href="/legal">Confidentialité & mentions légales</a>
					{" · "}
					<a href="https://github.com/alexistb2904/EpiTime" target="_blank" rel="noopener noreferrer">
						Voir sur GitHub
					</a>
				</p>
				<p>
					Contact : <a href="mailto:contact@alexistb.com">contact@alexistb.com</a> ou alexistb2904 sur Discord
				</p>
			</footer>
		</div>
	);
};

export default Login;
