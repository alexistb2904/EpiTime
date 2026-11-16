import { useCallback, useEffect, useState } from "react";
import { getExtensionStatus, onExtensionStatus } from "./extensionBridge";
import { onNotesChanged } from "./notesDb";

export function useNotesQuery(load, deps) {
	const [state, setState] = useState({ notes: [], loading: true, error: null });
	// eslint-disable-next-line react-hooks/exhaustive-deps
	const run = useCallback(load, deps);
	useEffect(() => {
		let alive = true;
		const refresh = () =>
			run()
				.then((notes) => alive && setState({ notes, loading: false, error: null }))
				.catch((error) => alive && setState({ notes: [], loading: false, error: error.message || "Notes indisponibles" }));
		refresh();
		const unsubscribe = onNotesChanged(refresh);
		return () => {
			alive = false;
			unsubscribe();
		};
	}, [run]);
	return state;
}

export function useExtensionStatus() {
	const [status, setStatus] = useState(getExtensionStatus);
	useEffect(() => onExtensionStatus(setStatus), []);
	return status;
}
