export function readSavedSession() {
	try {
		const token = localStorage.getItem("zeus_token");
		const user = JSON.parse(localStorage.getItem("zeus_user"));
		if (!token || typeof user?.username !== "string" || !user.username) return null;

		if (navigator.onLine && token.split(".").length === 3) {
			const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
			const { exp } = JSON.parse(atob(payload));
			if (typeof exp === "number" && exp * 1000 <= Date.now()) return null;
		}
		return { token, user };
	} catch {
		return null;
	}
}
