export const API_REQUEST_TIMEOUT_MS = 15_000;

/** Bound API waits so a stale host or unreachable backend cannot leave a view spinning forever. */
export async function fetchApi(input, init = {}, timeoutMs = API_REQUEST_TIMEOUT_MS) {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(new DOMException("API request timed out", "TimeoutError")), timeoutMs);
	const callerSignal = init.signal;
	const abortFromCaller = () => controller.abort(callerSignal.reason);

	if (callerSignal?.aborted) abortFromCaller();
	else callerSignal?.addEventListener("abort", abortFromCaller, { once: true });

	try {
		const response = await fetch(input, { ...init, signal: controller.signal });
		if (response.status === 401) {
			const authorization = new Headers(init.headers).get("Authorization");
			const currentToken = localStorage.getItem("zeus_token");
			if (authorization && currentToken && authorization === `Bearer ${currentToken}`) {
				window.dispatchEvent(new Event("epitime:session-expired"));
			}
		}
		return response;
	} catch (error) {
		if (controller.signal.aborted && !callerSignal?.aborted) {
			throw new Error("La connexion prend plus de temps que prévu. Vérifie ta connexion puis réessaie.", { cause: error });
		}
		throw error;
	} finally {
		clearTimeout(timeoutId);
		callerSignal?.removeEventListener("abort", abortFromCaller);
	}
}
