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
		return await fetch(input, { ...init, signal: controller.signal });
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
