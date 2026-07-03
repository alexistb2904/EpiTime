export function secondsValue(duration?: number | string | null) {
	if (duration === null || duration === undefined || duration === "") return null;
	const value =
		typeof duration === "number"
			? duration
			: Number(
					String(duration)
						.replace(",", ".")
						.replace(/[^\d.-]/g, "")
				);
	return Number.isFinite(value) && value > 0 ? value : null;
}

export function formatSecondsAsHours(duration?: number | string | null, fallback = "-") {
	const seconds = secondsValue(duration);
	if (!seconds) return fallback;
	const totalMinutes = Math.round(seconds / 60);
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	if (!hours) return `${Math.max(1, minutes)} min`;
	return minutes ? `${hours} h ${minutes}` : `${hours} h`;
}
