import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import webpush from "web-push";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3001;
const ZEUS_BASE = process.env.ZEUS_BASE || "https://zeus.ionis-it.com";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";
const RYBBIT_API_BASE = process.env.RYBBIT_API_BASE || "";
const RYBBIT_SITE_ID = process.env.RYBBIT_SITE_ID || "";
const RYBBIT_API_KEY = process.env.RYBBIT_API_KEY || "";
const RYBBIT_TIME_ZONE = process.env.RYBBIT_TIME_ZONE || "Europe/Paris";

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || "";
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || "";

let pushEnabled = false;
if (vapidPublicKey && vapidPrivateKey) {
	webpush.setVapidDetails("mailto:alexistb2904@gmail.com", vapidPublicKey, vapidPrivateKey);
	pushEnabled = true;
}

// Possiblement utiliser une BD plus tard
const subscriptions = new Map();
const sentNotifications = new Map();
const eventsCache = new Map();

const cleanupSentNotifications = () => {
	const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
	for (const [key, timestamp] of sentNotifications) {
		if (timestamp < oneDayAgo) {
			sentNotifications.delete(key);
		}
	}
};

const cleanupEventsCache = () => {
	const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;
	for (const [key, data] of eventsCache) {
		if (data.lastUpdate < twoDaysAgo) {
			eventsCache.delete(key);
		}
	}
};

const cacheEvents = (events, groups) => {
	if (!events || !Array.isArray(events)) return;

	const now = Date.now();

	if (groups && groups.length > 0) {
		groups.forEach((groupId) => {
			const cacheKey = String(groupId);
			const existing = eventsCache.get(cacheKey) || { events: [], lastUpdate: now };

			const existingIds = new Set(existing.events.map((e) => e.id || e.idReservation));
			const newEvents = events.filter((e) => !existingIds.has(e.id || e.idReservation));

			eventsCache.set(cacheKey, {
				events: [...existing.events, ...newEvents],
				lastUpdate: now,
			});
		});
	}
};

const getEventsFromCache = (groups) => {
	if (!groups || groups.length === 0) return [];

	const allEvents = new Map();

	groups.forEach((groupId) => {
		const cacheKey = String(groupId);
		const cached = eventsCache.get(cacheKey);

		if (cached && cached.events) {
			cached.events.forEach((event) => {
				const eventId = event.id || event.idReservation;
				if (eventId && !allEvents.has(eventId)) {
					allEvents.set(eventId, event);
				}
			});
		}
	});

	return Array.from(allEvents.values());
};

app.use(cors({ origin: ALLOWED_ORIGIN }));
app.use(express.json({ limit: "1mb" }));

let publicPath;
if (process.env.NODE_ENV === "production") {
	publicPath = path.join(__dirname, "public");
} else {
	const distPath = path.join(__dirname, "../client/dist");
	const publicFallback = path.join(__dirname, "../client/public");
	try {
		fs.accessSync(distPath);
		publicPath = distPath;
	} catch {
		publicPath = publicFallback;
	}
}

app.use(express.static(publicPath));

app.get("/health", (_req, res) => {
	res.json({ ok: true });
});

app.get("/api/analytics/overview", async (_req, res) => {
	try {
		if (!RYBBIT_SITE_ID || !RYBBIT_API_KEY) {
			return res.status(200).json({
				enabled: false,
				users: null,
				message: "Rybbit non configuré",
			});
		}

		const now = new Date();
		const endDate = now.toISOString().slice(0, 10);
		const startDate = "2020-01-01";

		const url = `${RYBBIT_API_BASE}/overview/${encodeURIComponent(RYBBIT_SITE_ID)}?start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}&time_zone=${encodeURIComponent(RYBBIT_TIME_ZONE)}`;

		const upstream = await fetch(url, {
			headers: {
				Authorization: `Bearer ${RYBBIT_API_KEY}`,
			},
		});

		const text = await upstream.text();
		if (!upstream.ok) {
			return res.status(upstream.status).json({
				error: text || "Rybbit upstream error",
				upstream: url,
			});
		}

		const parsed = text ? JSON.parse(text) : {};
		const users = Number(parsed?.data?.users);

		return res.json({
			enabled: true,
			users: Number.isFinite(users) ? users : 0,
			fetchedAt: new Date().toISOString(),
		});
	} catch (err) {
		console.error("/api/analytics/overview error", err);
		return res.status(500).json({ error: "Analytics proxy error" });
	}
});

app.post("/api/auth", async (req, res) => {
	try {
		const { accessToken } = req.body || {};
		if (!accessToken) {
			return res.status(400).json({ error: "accessToken is required" });
		}

		const upstream = await fetch(`${ZEUS_BASE}/api/User/OfficeLogin`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ accessToken }),
		});

		const text = await upstream.text();
		if (!upstream.ok) {
			return res.status(upstream.status).json({ error: text || "Upstream error", upstream: `${ZEUS_BASE}/api/User/OfficeLogin` });
		}

		const token = text.replace(/^"|"$/g, "");
		return res.json({ token });
	} catch (err) {
		console.error("/api/auth error", err);
		return res.status(500).json({ error: "Proxy error" });
	}
});

app.get("/api/events", async (req, res) => {
	try {
		const authHeader = req.headers.authorization || "";
		const match = authHeader.match(/^Bearer\s+(.+)/i);
		const zeusToken = match && match[1];
		if (!zeusToken) {
			return res.status(401).json({ error: "Bearer token required" });
		}

		const { start, end, groups } = req.query;
		if (!start || !end) {
			return res.status(400).json({ error: "start and end query params are required" });
		}

		let url = `${ZEUS_BASE}/api/reservation/filter/displayable?StartDate=${encodeURIComponent(start)}&EndDate=${encodeURIComponent(end)}`;

		if (groups) {
			const groupIds = Array.isArray(groups) ? groups : groups.split(",");
			groupIds.forEach((gid) => {
				url += `&Groups=${encodeURIComponent(gid.trim())}`;
			});
		}

		const { teachers } = req.query;
		if (teachers) {
			const teacherIds = Array.isArray(teachers) ? teachers : teachers.split(",");
			teacherIds.forEach((tid) => {
				url += `&Teachers=${encodeURIComponent(tid.trim())}`;
			});
		}

		const { rooms } = req.query;
		if (rooms) {
			const roomIds = Array.isArray(rooms) ? rooms : rooms.split(",");
			roomIds.forEach((rid) => {
				url += `&Rooms=${encodeURIComponent(rid.trim())}`;
			});
		}

		const upstream = await fetch(url, {
			headers: { Authorization: `Bearer ${zeusToken}` },
		});

		const text = await upstream.text();
		if (!upstream.ok) {
			return res.status(upstream.status).json({
				error: text || "Upstream error",
				upstream: url,
			});
		}

		try {
			const data = text ? JSON.parse(text) : null;

			if (data && Array.isArray(data)) {
				const groupIds = groups ? (Array.isArray(groups) ? groups : groups.split(",")) : [];
				cacheEvents(data, groupIds);
			}

			return res.json(data);
		} catch (parseErr) {
			return res.type("application/json").send(text);
		}
	} catch (err) {
		console.error("/api/events error", err);
		return res.status(500).json({ error: "Proxy error" });
	}
});

app.get("/api/reservation/:id/details", async (req, res) => {
	try {
		const authHeader = req.headers.authorization || "";
		const match = authHeader.match(/^Bearer\s+(.+)/i);
		const zeusToken = match && match[1];
		if (!zeusToken) {
			return res.status(401).json({ error: "Bearer token required" });
		}

		const { id } = req.params;
		const url = `${ZEUS_BASE}/api/reservation/${encodeURIComponent(id)}/details`;

		const upstream = await fetch(url, {
			headers: { Authorization: `Bearer ${zeusToken}` },
		});

		const text = await upstream.text();
		if (!upstream.ok) {
			return res.status(upstream.status).json({
				error: text || "Upstream error",
				upstream: url,
			});
		}

		try {
			const data = text ? JSON.parse(text) : null;
			return res.json(data);
		} catch (parseErr) {
			return res.type("application/json").send(text);
		}
	} catch (err) {
		console.error("/api/reservation/:id/details error", err);
		return res.status(500).json({ error: "Proxy error" });
	}
});

app.get("/api/courses", async (req, res) => {
	try {
		const authHeader = req.headers.authorization || "";
		const match = authHeader.match(/^Bearer\s+(.+)/i);
		const zeusToken = match && match[1];

		const url = `${ZEUS_BASE}/api/course`;
		const headers = zeusToken ? { Authorization: `Bearer ${zeusToken}` } : {};

		const upstream = await fetch(url, { headers });

		const text = await upstream.text();
		if (!upstream.ok) {
			return res.status(upstream.status).json({ error: text || "Upstream error", upstream: url });
		}

		try {
			const data = text ? JSON.parse(text) : null;
			return res.json(data);
		} catch (parseErr) {
			return res.type("application/json").send(text);
		}
	} catch (err) {
		console.error("/api/courses error", err);
		return res.status(500).json({ error: "Proxy error" });
	}
});

app.get("/api/coursetype/:id", async (req, res) => {
	try {
		const authHeader = req.headers.authorization || "";
		const match = authHeader.match(/^Bearer\s+(.+)/i);
		const zeusToken = match && match[1];

		const { id } = req.params;
		const url = `${ZEUS_BASE}/api/coursetype/${encodeURIComponent(id)}`;
		const headers = zeusToken ? { Authorization: `Bearer ${zeusToken}` } : {};

		const upstream = await fetch(url, { headers });

		const text = await upstream.text();
		if (!upstream.ok) {
			return res.status(upstream.status).json({ error: text || "Upstream error", upstream: url });
		}

		try {
			const data = text ? JSON.parse(text) : null;
			return res.json(data);
		} catch (parseErr) {
			return res.type("application/json").send(text);
		}
	} catch (err) {
		console.error("/api/coursetype/:id error", err);
		return res.status(500).json({ error: "Proxy error" });
	}
});

app.get("/api/rooms", async (req, res) => {
	try {
		const authHeader = req.headers.authorization || "";
		const match = authHeader.match(/^Bearer\s+(.+)/i);
		const zeusToken = match && match[1];

		const url = `${ZEUS_BASE}/api/room`;
		const headers = zeusToken ? { Authorization: `Bearer ${zeusToken}` } : {};

		const upstream = await fetch(url, { headers });

		const text = await upstream.text();
		if (!upstream.ok) {
			return res.status(upstream.status).json({ error: text || "Upstream error", upstream: url });
		}

		try {
			const data = text ? JSON.parse(text) : null;
			return res.json(data);
		} catch (parseErr) {
			return res.type("application/json").send(text);
		}
	} catch (err) {
		console.error("/api/rooms error", err);
		return res.status(500).json({ error: "Proxy error" });
	}
});

app.get("/api/roomtypes", async (req, res) => {
	try {
		const authHeader = req.headers.authorization || "";
		const match = authHeader.match(/^Bearer\s+(.+)/i);
		const zeusToken = match && match[1];

		const url = `${ZEUS_BASE}/api/roomtype`;
		const headers = zeusToken ? { Authorization: `Bearer ${zeusToken}` } : {};

		const upstream = await fetch(url, { headers });

		const text = await upstream.text();
		if (!upstream.ok) {
			return res.status(upstream.status).json({ error: text || "Upstream error", upstream: url });
		}

		try {
			const data = text ? JSON.parse(text) : null;
			return res.json(data);
		} catch (parseErr) {
			return res.type("application/json").send(text);
		}
	} catch (err) {
		console.error("/api/roomtypes error", err);
		return res.status(500).json({ error: "Proxy error" });
	}
});

app.get("/api/locations", async (req, res) => {
	try {
		const authHeader = req.headers.authorization || "";
		const match = authHeader.match(/^Bearer\s+(.+)/i);
		const zeusToken = match && match[1];

		const url = `${ZEUS_BASE}/api/location/hierarchy/withrooms`;
		const headers = zeusToken ? { Authorization: `Bearer ${zeusToken}` } : {};

		const upstream = await fetch(url, { headers });

		const text = await upstream.text();
		if (!upstream.ok) {
			return res.status(upstream.status).json({ error: text || "Upstream error", upstream: url });
		}

		try {
			const data = text ? JSON.parse(text) : null;
			return res.json(data);
		} catch (parseErr) {
			return res.type("application/json").send(text);
		}
	} catch (err) {
		console.error("/api/locations error", err);
		return res.status(500).json({ error: "Proxy error" });
	}
});

app.post("/api/rooms/available", async (req, res) => {
	try {
		const authHeader = req.headers.authorization || "";
		const match = authHeader.match(/^Bearer\s+(.+)/i);
		const zeusToken = match && match[1];
		if (!zeusToken) {
			return res.status(401).json({ error: "Bearer token required" });
		}

		const url = `${ZEUS_BASE}/api/room/available/all`;

		const upstream = await fetch(url, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${zeusToken}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(req.body || {}),
		});

		const text = await upstream.text();
		if (!upstream.ok) {
			return res.status(upstream.status).json({
				error: text || "Upstream error",
				upstream: url,
			});
		}

		try {
			const data = text ? JSON.parse(text) : [];
			return res.json(Array.isArray(data) ? data : []);
		} catch (parseErr) {
			return res.type("application/json").send(text);
		}
	} catch (err) {
		console.error("/api/rooms/available error", err);
		return res.status(500).json({ error: "Proxy error" });
	}
});

app.get("/api/groups", async (req, res) => {
	try {
		const authHeader = req.headers.authorization || "";
		const match = authHeader.match(/^Bearer\s+(.+)/i);
		const zeusToken = match && match[1];

		const url = `${ZEUS_BASE}/api/group`;
		const headers = zeusToken ? { Authorization: `Bearer ${zeusToken}` } : {};

		const upstream = await fetch(url, { headers });
		const text = await upstream.text();

		if (!upstream.ok) {
			return res.status(upstream.status).json({ error: text, upstream: url });
		}

		try {
			res.json(JSON.parse(text));
		} catch {
			res.send(text);
		}
	} catch (err) {
		console.error("/api/groups error", err);
		res.status(500).json({ error: "Proxy error" });
	}
});

// ===== notification =====

app.post("/api/subscribe", async (req, res) => {
	try {
		const subscription = req.body;
		const userId = req.headers["x-user-id"] || "anonymous";
		const userGroups = req.headers["x-user-groups"] ? JSON.parse(req.headers["x-user-groups"]) : [];
		const notificationSettings = req.headers["x-notification-settings"]
			? JSON.parse(req.headers["x-notification-settings"])
			: { minutesBefore: 15, selectedDays: [0, 1, 2, 3, 4, 5, 6] };

		if (!subscription.endpoint) {
			return res.status(400).json({ error: "Invalid subscription" });
		}
		if (!notificationSettings.minutesBefore) {
			notificationSettings.minutesBefore = 15;
		}

		subscription.userGroups = userGroups;
		subscription.settings = notificationSettings;
		subscriptions.set(userId, subscription);

		res.json({ success: true, message: "Subscription registered" });
	} catch (err) {
		console.error("/api/subscribe error", err);
		res.status(500).json({ error: "Subscription failed" });
	}
});

app.post("/api/update-notification-settings", async (req, res) => {
	try {
		const userId = req.headers["x-user-id"];
		const { minutesBefore, selectedDays, groups } = req.body;

		if (!userId) {
			return res.status(400).json({ error: "User ID requis" });
		}

		const subscription = subscriptions.get(userId);
		if (!subscription) {
			return res.status(404).json({ error: "Subscription non trouvée" });
		}

		subscription.settings = {
			minutesBefore: minutesBefore || 15,
			selectedDays: selectedDays || [0, 1, 2, 3, 4, 5, 6],
		};
		if (groups) {
			subscription.userGroups = groups;
		}
		subscriptions.set(userId, subscription);

		res.json({ success: true, message: "Settings updated" });
	} catch (err) {
		console.error("/api/update-notification-settings error", err);
		res.status(500).json({ error: "Update failed" });
	}
});

app.get("/api/vapid-key", (_req, res) => {
	if (!pushEnabled) {
		return res.status(200).json({
			enabled: false,
			publicKey: null,
			message: "Push notifications non configurées (VAPID keys manquantes)",
		});
	}
	res.json({
		enabled: true,
		publicKey: vapidPublicKey,
	});
});

const notificationWorker = async () => {
	if (!pushEnabled) return;
	if (subscriptions.size === 0) return;

	cleanupSentNotifications();
	cleanupEventsCache();

	const now = new Date();
	const currentDay = now.getDay();

	let totalNotified = 0;

	for (const [userId, subscription] of subscriptions) {
		try {
			const settings = subscription.settings || { minutesBefore: 15, selectedDays: [0, 1, 2, 3, 4, 5, 6] };
			const userGroups = subscription.userGroups || [];

			if (!settings.selectedDays.includes(currentDay)) {
				continue;
			}

			if (userGroups.length === 0) {
				continue;
			}

			const events = getEventsFromCache(userGroups);
			if (events.length === 0) {
				continue;
			}

			const minutesBefore = settings.minutesBefore || 15;

			for (const event of events) {
				const eventStart = new Date(event.startDate || event.start);
				const eventId = event.id || event.idReservation;
				const eventName = event.name || "Aucun Titre" || "Cours";

				const notifKey = `${userId}-${eventId}`;
				if (sentNotifications.has(notifKey)) {
					continue;
				}

				const timeUntilEvent = eventStart.getTime() - now.getTime();
				const minutesUntilEvent = timeUntilEvent / (60 * 1000);

				if (minutesUntilEvent >= minutesBefore - 1 && minutesUntilEvent <= minutesBefore + 1) {
					const payload = JSON.stringify({
						title: "📚 Cours bientôt!",
						body: `${eventName} commence dans ${Math.round(minutesUntilEvent)} minutes`,
						icon: "/icons/logo.png",
						badge: "/icons/logo.png",
						tag: `event-${eventId}`,
						data: {
							eventId,
							timestamp: Date.now(),
						},
					});

					try {
						await webpush.sendNotification(subscription, payload);
						sentNotifications.set(notifKey, Date.now());
						totalNotified++;
					} catch (err) {
						if (err.statusCode === 410) {
							subscriptions.delete(userId);
							console.log(`Subscription expirée pour ${userId}`);
							break;
						} else {
							console.error(`Erreur envoi notification ${userId}:`, err.message);
						}
					}
				}
			}
		} catch (err) {
			console.error(`Erreur worker pour ${userId}:`, err.message);
		}
	}

	if (totalNotified > 0) {
		console.log(`Worker notification: ${totalNotified} notification(s) envoyée(s)`);
	}
};

setInterval(notificationWorker, 60 * 1000);

app.post("/api/check-notifications", async (req, res) => {
	try {
		if (!pushEnabled) {
			return res.json({ success: true, checked: 0, notified: 0 });
		}

		const { events } = req.body;
		const userId = req.headers["x-user-id"];

		if (!userId) {
			return res.status(400).json({ error: "User ID requis" });
		}

		if (events && Array.isArray(events) && events.length > 0) {
			const subscription = subscriptions.get(userId);
			if (subscription && subscription.userGroups) {
				cacheEvents(events, subscription.userGroups);
			}
		}

		res.json({ success: true, message: "Events cached for notification worker" });
	} catch (err) {
		console.error("/api/check-notifications error", err);
		res.status(500).json({ error: "Check failed" });
	}
});

app.post("/api/notify-test", async (req, res) => {
	try {
		const { title, body } = req.body;
		const userId = req.headers["x-user-id"];

		if (!userId) {
			return res.status(400).json({ error: "User ID requis" });
		}

		const payload = JSON.stringify({
			title: title || "🔔 Notification de test",
			body: body || "Ceci est une notification de test",
			icon: "/icons/logo.png",
			badge: "/icons/logo.png",
		});

		const subscription = subscriptions.get(userId);
		if (!subscription) {
			return res.status(404).json({
				error: "Aucune subscription trouvée pour cet utilisateur",
				sent: 0,
				total: 0,
			});
		}

		let sent = 0;
		try {
			await webpush.sendNotification(subscription, payload);
			sent = 1;
		} catch (err) {
			if (err.statusCode === 410) {
				subscriptions.delete(userId);
			} else {
				console.error(`Erreur envoi notification test à ${userId}:`, err.message);
			}
			throw err;
		}

		res.json({
			success: true,
			sent,
			total: 1,
		});
	} catch (err) {
		console.error("/api/notify-test error", err);
		res.status(500).json({ error: "Test notification failed" });
	}
});

app.post("/api/unsubscribe", async (req, res) => {
	try {
		const userId = req.headers["x-user-id"] || "anonymous";
		subscriptions.delete(userId);
		console.log(`❌ Subscription supprimée pour ${userId}`);
		res.json({ success: true });
	} catch (err) {
		console.error("/api/unsubscribe error", err);
		res.status(500).json({ error: "Unsubscribe failed" });
	}
});

app.get("*", (req, res) => {
	const indexPath = process.env.NODE_ENV === "production" ? path.join(__dirname, "public/index.html") : path.join(__dirname, "../client/dist/index.html");

	res.sendFile(indexPath, (err) => {
		if (err) {
			console.error("Erreur SPA fallback:", err);
			res.status(404).json({ error: "Not found" });
		}
	});
});

app.listen(PORT, () => {
	console.log(`En ligne sur http://localhost:${PORT}`);
});
