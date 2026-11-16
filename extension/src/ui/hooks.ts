import { useCallback, useEffect, useState } from "react";
import { ask, type ExtensionState, type PageRequest } from "../lib/messages";
import { browser } from "../lib/platform";

export function useExtensionState() {
	const [state, setState] = useState<ExtensionState | null>(null);
	const [error, setError] = useState<string | null>(null);

	const refresh = useCallback(
		() =>
			ask<ExtensionState>({ type: "state.get" })
				.then((next) => {
					setState(next);
					setError(null);
				})
				.catch((err: Error) => setError(err.message)),
		[]
	);

	useEffect(() => {
		refresh();
		let timer: ReturnType<typeof setTimeout> | undefined;
		const onChanged = () => {
			clearTimeout(timer);
			timer = setTimeout(refresh, 80);
		};
		browser.storage.onChanged.addListener(onChanged);
		return () => browser.storage.onChanged.removeListener(onChanged);
	}, [refresh]);

	const act = useCallback(async (request: PageRequest) => {
		try {
			setState(await ask<ExtensionState>(request));
			setError(null);
		} catch (err) {
			setError((err as Error).message);
		}
	}, []);

	return { state, error, act };
}

export function useTheme(state: ExtensionState | null) {
	useEffect(() => {
		const media = window.matchMedia("(prefers-color-scheme: light)");
		const apply = () => {
			const choice = state?.settings.theme ?? "auto";
			const theme = choice !== "auto" ? choice : (state?.link?.theme ?? (media.matches ? "light" : "dark"));
			document.documentElement.dataset.theme = theme;
		};
		apply();
		media.addEventListener("change", apply);
		return () => media.removeEventListener("change", apply);
	}, [state?.settings.theme, state?.link?.theme]);
}

export function useNow(intervalMs = 15_000) {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), intervalMs);
		return () => clearInterval(timer);
	}, [intervalMs]);
	return now;
}
