import React from "react";
import ReactDOM from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";

const showPwaUpdateToast = () => {
	const toast = document.createElement("div");
	toast.textContent = "✅ Mise à jour disponible, rechargement…";
	toast.setAttribute("role", "status");
	toast.setAttribute("aria-live", "polite");

	Object.assign(toast.style, {
		position: "fixed",
		right: "16px",
		bottom: "16px",
		zIndex: "9999",
		padding: "12px 14px",
		borderRadius: "12px",
		background: "rgba(18, 18, 24, 0.95)",
		color: "#fff",
		fontSize: "14px",
		fontWeight: "600",
		boxShadow: "0 8px 24px rgba(0, 0, 0, 0.28)",
		maxWidth: "320px",
	});

	document.body.appendChild(toast);

	setTimeout(() => {
		if (toast.isConnected) toast.remove();
	}, 2200);
};

if ("serviceWorker" in navigator) {
	let hasRefreshed = false;
	let triggerUpdate = () => {};

	triggerUpdate = registerSW({
		immediate: true,
		onNeedRefresh() {
			triggerUpdate(true);
		},
		onRegisteredSW(_swUrl, registration) {
			if (!registration) return;

			registration.update();

			const intervalMs = 60 * 2000;
			setInterval(() => {
				registration.update();
			}, intervalMs);
		},
	});

	navigator.serviceWorker.addEventListener("controllerchange", () => {
		if (hasRefreshed) return;
		hasRefreshed = true;
		showPwaUpdateToast();
		setTimeout(() => {
			window.location.reload();
		}, 900);
	});
}

ReactDOM.createRoot(document.getElementById("root")).render(
	<React.StrictMode>
		<App />
	</React.StrictMode>
);
