import { NativeEventEmitter, NativeModules, Platform } from "react-native";

export type NetworkState = {
	isConnected: boolean;
	isInternetReachable: boolean | null;
	updatedAt: number;
};

const EVENT_NAME = "EpiTimeNetworkStatusChanged";
const NativeNetworkStatus = NativeModules.EpiTimeNetworkStatus as
	| {
			getCurrentState?: () => Promise<Partial<NetworkState>>;
	  }
	| undefined;

const normalizeNetworkState = (state?: Partial<NetworkState> | null): NetworkState => ({
	isConnected: state?.isConnected !== false,
	isInternetReachable: typeof state?.isInternetReachable === "boolean" ? state.isInternetReachable : null,
	updatedAt: typeof state?.updatedAt === "number" ? state.updatedAt : Date.now(),
});

export const isNetworkOnline = (state?: NetworkState | null) => !state || (state.isConnected && state.isInternetReachable !== false);

export const isNetworkOffline = (state?: NetworkState | null) => Boolean(state && !isNetworkOnline(state));

export async function getNetworkState(): Promise<NetworkState> {
	if (Platform.OS === "android" && NativeNetworkStatus?.getCurrentState) {
		return normalizeNetworkState(await NativeNetworkStatus.getCurrentState());
	}

	if (Platform.OS === "web" && typeof navigator !== "undefined") {
		return normalizeNetworkState({
			isConnected: navigator.onLine,
			isInternetReachable: navigator.onLine,
		});
	}

	return normalizeNetworkState();
}

export function subscribeNetworkState(listener: (state: NetworkState) => void) {
	if (Platform.OS === "android" && NativeNetworkStatus) {
		const emitter = new NativeEventEmitter(NativeNetworkStatus as any);
		const subscription = emitter.addListener(EVENT_NAME, (state) => listener(normalizeNetworkState(state)));
		return () => subscription.remove();
	}

	if (Platform.OS === "web" && typeof window !== "undefined") {
		const emit = () => {
			listener(
				normalizeNetworkState({
					isConnected: navigator.onLine,
					isInternetReachable: navigator.onLine,
				})
			);
		};
		window.addEventListener("online", emit);
		window.addEventListener("offline", emit);
		return () => {
			window.removeEventListener("online", emit);
			window.removeEventListener("offline", emit);
		};
	}

	return () => {};
}
