const PUSH_SERVICE_HOST = /^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[\w-]+\.notify\.windows\.com|web\.push\.apple\.com)$/;

export const sanitizePushSubscription = (value) => {
	try {
		const url = new URL(value?.endpoint);
		const { p256dh, auth } = value?.keys || {};
		if (url.protocol !== "https:" || url.port || !PUSH_SERVICE_HOST.test(url.hostname) || value.endpoint.length > 1000) return null;
		if (typeof p256dh !== "string" || typeof auth !== "string" || p256dh.length > 200 || auth.length > 100) return null;
		return { endpoint: value.endpoint, keys: { p256dh, auth } };
	} catch {
		return null;
	}
};
