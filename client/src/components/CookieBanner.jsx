import "./CookieBanner.css";

export function CookieBanner({ show, onAccept, onDecline }) {
	if (!show) return null;

	return (
		<div className="cookie-banner" role="dialog" aria-live="polite" aria-label="Préférences de mesure d'audience">
			<div className="cookie-banner__content">
				<div className="cookie-banner__title">🍪 Mesure d'audience</div>
				<p className="cookie-banner__text">
					Avec votre accord, EpiTime utilise une mesure d&apos;audience auto-hébergée pour améliorer le service. Vous pouvez accepter ou refuser à tout moment. {" "}
					<a href="/legal">En savoir plus</a>
				</p>
			</div>
			<div className="cookie-banner__actions">
				<button className="cookie-banner__btn cookie-banner__btn--accept" onClick={onAccept}>
					Accepter
				</button>
				<button className="cookie-banner__btn cookie-banner__btn--decline" onClick={onDecline}>
					Refuser
				</button>
			</div>
		</div>
	);
}
