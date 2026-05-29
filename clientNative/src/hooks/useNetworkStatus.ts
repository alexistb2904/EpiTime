import { useEffect, useState } from "react";
import { getNetworkState, isNetworkOffline, isNetworkOnline, NetworkState, subscribeNetworkState } from "../services/networkStatus";

export function useNetworkStatus() {
	const [networkState, setNetworkState] = useState<NetworkState | null>(null);

	useEffect(() => {
		let mounted = true;
		getNetworkState()
			.then((state) => {
				if (mounted) setNetworkState(state);
			})
			.catch(() => {});

		const unsubscribe = subscribeNetworkState((state) => {
			if (mounted) setNetworkState(state);
		});

		return () => {
			mounted = false;
			unsubscribe();
		};
	}, []);

	return {
		networkState,
		isOnline: isNetworkOnline(networkState),
		isOffline: isNetworkOffline(networkState),
	};
}
