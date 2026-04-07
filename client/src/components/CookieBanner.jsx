import "./CookieBanner.css";

export function CookieBanner({ show, onAccept, onDecline }) {
	if (!show) return null;

	return (
		<div className="cookie-banner" role="dialog" aria-live="polite" aria-label="Préférences de cookies">
			<div className="cookie-banner__content">
				<div className="cookie-banner__title">🍪 Cookies & Analytics</div>
				<p className="cookie-banner__text">
					On utilise des cookies de mesure d&apos;audience anonymisée pour améliorer EpiTime. Tu peux accepter ou refuser, tu gardes le contrôle. Merci de nous aider à
					rendre EpiTime meilleur pour tout le monde !
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
