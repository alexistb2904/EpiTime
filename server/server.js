import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { validateAnalyticsPayload } from "./analyticsValidation.js";
import { filterEventsByCalendarFilters } from "./calendarFilters.js";
import { createNotificationRouter, onGroupEventsFetched } from "./notifications.js";

process.env.TZ ||= "Europe/Paris";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.set("trust proxy", 1);
const PORT = process.env.PORT || 3001;
const ZEUS_BASE = process.env.ZEUS_BASE || "https://zeus.ionis-it.com";
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS || "";
const RYBBIT_API_BASE = process.env.RYBBIT_API_BASE || "";
const RYBBIT_SITE_NUMBER = process.env.RYBBIT_SITE_NUMBER || "";
const RYBBIT_PHONE_NUMBER = process.env.RYBBIT_PHONE_NUMBER || "";
const RYBBIT_SITE_ID = process.env.RYBBIT_SITE_ID || "";
const RYBBIT_PHONE_SITE_ID = process.env.RYBBIT_PHONE_SITE_ID || "";
const RYBBIT_API_KEY = process.env.RYBBIT_API_KEY || "";
const RYBBIT_TIME_ZONE = process.env.RYBBIT_TIME_ZONE || "Europe/Paris";
const ZEUS_IDENTITY_CLAIMS = [
	"email",
	"upn",
	"unique_name",
	"preferred_username",
	"http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
	"http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name",
	"nameid",
	"http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier",
	"sub",
];
const bearerToken = (req) => (req.headers.authorization || "").match(/^Bearer\s+(.+)/i)?.[1];
const verifiedZeusTokens = new Map();

const authenticateZeus = async (req) => {
	const token = bearerToken(req);
	if (!token) return null;
	const now = Date.now();
	const cached = verifiedZeusTokens.get(token);
	if (cached && cached.expiresAt > now) return cached.userId;

	let claims;
	try {
		claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
	} catch {
		return null;
	}
	const expiresAt = Number(claims?.exp) * 1000;
	const userId = ZEUS_IDENTITY_CLAIMS.map((name) => claims?.[name])
		.find((value) => typeof value === "string" && value.trim())
		?.trim()
		.toLowerCase();
	if (!(expiresAt > now) || !userId) return null;

	const upstream = await fetch(`${ZEUS_BASE}/api/roomtype`, { headers: { Authorization: `Bearer ${token}` } });
	await upstream.text();
	if (upstream.status === 401 || upstream.status === 403) return null;
	if (!upstream.ok) throw new Error(`Zeus token check HTTP ${upstream.status}`);

	for (const [key, entry] of verifiedZeusTokens) if (entry.expiresAt <= now) verifiedZeusTokens.delete(key);
	verifiedZeusTokens.set(token, { userId, expiresAt });
	return userId;
};

const requireUser = async (req, res) => {
	const userId = await authenticateZeus(req);
	if (!userId) res.status(401).json({ error: "Bearer token required" });
	return userId;
};

const courseTypesById = new Map([
	[1, "CourseType.FollowUp"],
	[2, "CourseType.Exam"],
	[3, "CourseType.Lecture"],
	[4, "CourseType.Practice"],
	[5, "CourseType.Conference"],
	[6, "CourseType.Meeting"],
	[7, "CourseType.Defense"],
	[8, "CourseType.Workshop"],
	[9, "CourseType.Rush"],
	[10, "CourseType.TD"],
	[11, "CourseType.EventAsso"],
	[12, "CourseType.LogiWorks"],
	[13, "CourseType.Remediation"],
	[14, "CourseType.Tutoring"],
	[15, "CourseType.Permanence"],
	[16, "CourseType.IntegratedLecture"],
]);

const getFallbackCourseType = (id) => {
	const type = courseTypesById.get(Number(id));
	return type ? { id: Number(id), type } : null;
};


const allowedOrigins = (ALLOWED_ORIGINS || "*")
	.split(",")
	.map((origin) => origin.trim())
	.filter(Boolean);

const allowOriginSet = new Set(allowedOrigins);
const allowAnyOrigin = allowOriginSet.has("*");

const corsOptions = {
	origin: (origin, callback) => callback(null, !origin || allowAnyOrigin || allowOriginSet.has(origin)),
	methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
	allowedHeaders: ["Content-Type", "Authorization", "X-User-ID"],
};

app.disable("x-powered-by");
app.use((_req, res, next) => {
	res.setHeader("X-Content-Type-Options", "nosniff");
	res.setHeader("X-Frame-Options", "SAMEORIGIN");
	res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
	if (process.env.NODE_ENV === "production") res.setHeader("Strict-Transport-Security", "max-age=15552000");
	next();
});
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json({ limit: "100kb" }));

const sensitiveRateLimit = rateLimit({
	windowMs: 10 * 60 * 1000,
	limit: 300,
	standardHeaders: true,
	legacyHeaders: false,
	keyGenerator: (req) => ipKeyGenerator(req.ip),
	message: { error: "Too many requests" },
});
app.use(["/api/auth", "/api/subscribe", "/api/unsubscribe", "/api/update-notification-settings", "/api/notify-test", "/api/mobile"], sensitiveRateLimit);

const analyticsEventRateLimit = rateLimit({
	windowMs: 10 * 60 * 1000,
	limit: 120,
	standardHeaders: true,
	legacyHeaders: false,
	message: { error: "Analytics rate limit exceeded" },
});

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

async function proxyAnalyticsOverview(siteId, routePath, res) {
	try {
		if (!RYBBIT_API_BASE || !siteId || !RYBBIT_API_KEY) {
			return res.status(200).json({
				enabled: false,
				users: null,
				message: "Rybbit non configuré",
			});
		}

		const now = new Date();
		const endDate = now.toISOString().slice(0, 10);
		const startDate = "2020-01-01";

		const url = `${RYBBIT_API_BASE.replace(/\/$/, "")}/sites/${encodeURIComponent(siteId)}/overview?start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}&time_zone=${encodeURIComponent(RYBBIT_TIME_ZONE)}`;

		const upstream = await fetch(url, {
			headers: {
				Authorization: `Bearer ${RYBBIT_API_KEY}`,
			},
		});

		const text = await upstream.text();
		if (!upstream.ok) {
			return res.status(upstream.status).json({
				error: text || "Rybbit upstream error",
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
		console.error(`${routePath} error`, err);
		return res.status(500).json({ error: "Analytics proxy error" });
	}
}

app.get("/api/analytics/overview", async (_req, res) => proxyAnalyticsOverview(RYBBIT_SITE_NUMBER, "/api/analytics/overview", res));

app.get("/api/analytics/phone/overview", async (_req, res) => proxyAnalyticsOverview(RYBBIT_PHONE_NUMBER, "/api/analytics/phone/overview", res));

async function forwardAnalyticsEvent(event, properties) {
	const isPhoneEvent = properties?.platform === "android" || properties?.platform === "ios";
	const siteId = isPhoneEvent ? RYBBIT_PHONE_SITE_ID : RYBBIT_SITE_ID;
	if (!RYBBIT_API_BASE || !siteId || !RYBBIT_API_KEY) return;
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 2500);
	try {
		await fetch(`${RYBBIT_API_BASE.replace(/\/$/, "")}/track`, {
			method: "POST",
			headers: { Authorization: `Bearer ${RYBBIT_API_KEY}`, "Content-Type": "application/json" },
			body: JSON.stringify({ site_id: siteId, type: "custom_event", event_name: event, properties: JSON.stringify(properties) }),
			signal: controller.signal,
		});
	} catch {
		// Analytics is best effort and must never affect the app-facing response.
	} finally {
		clearTimeout(timeout);
	}
}

/* app.post("/api/analytics/event", analyticsEventRateLimit, (req, res) => {
	const result = validateAnalyticsPayload(req.body);
	if (!result.ok) return res.status(400).json({ ok: false, error: result.error });
	void forwardAnalyticsEvent(result.event, result.properties);
	return res.status(202).json({ ok: true, accepted: true });
}); */

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
			return res.status(upstream.status).json({ error: text || "Upstream error" });
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

		const { start, end, groups, rooms, teachers } = req.query;
		if (!start || !end) {
			return res.status(400).json({ error: "start and end query params are required" });
		}

		const parseFilterIds = (value) => {
			if (!value) return [];
			return (Array.isArray(value) ? value : value.split(",")).map((id) => String(id).trim()).filter(Boolean);
		};
		const groupIds = parseFilterIds(groups);
		const roomIds = parseFilterIds(rooms);
		const teacherIds = parseFilterIds(teachers);

		let url = `${ZEUS_BASE}/api/reservation/filter/displayable?StartDate=${encodeURIComponent(start)}&EndDate=${encodeURIComponent(end)}`;

		groupIds.forEach((gid) => {
			url += `&Groups=${encodeURIComponent(gid)}`;
		});
		if (!groupIds.length) {
			teacherIds.forEach((tid) => {
				url += `&Teachers=${encodeURIComponent(tid)}`;
			});
			roomIds.forEach((rid) => {
				url += `&Rooms=${encodeURIComponent(rid)}`;
			});
		}

		const upstream = await fetch(url, {
			headers: { Authorization: `Bearer ${zeusToken}` },
		});

		const text = await upstream.text();
		if (!upstream.ok) {
			return res.status(upstream.status).json({
				error: text || "Upstream error",
			});
		}

		try {
			const data = text ? JSON.parse(text) : null;

			if (Array.isArray(data)) {
				const filteredData = filterEventsByCalendarFilters(data, {
					rooms: roomIds,
					teachers: teacherIds,
				});

				if (groupIds.length) {
					onGroupEventsFetched(groupIds, start, end, data);
				}

				return res.json(filteredData);
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
		if (!/^\d+$/.test(id)) {
			return res.status(400).json({ error: "Invalid reservation id" });
		}
		const url = `${ZEUS_BASE}/api/reservation/${id}/details`;

		const upstream = await fetch(url, {
			headers: { Authorization: `Bearer ${zeusToken}` },
		});

		const text = await upstream.text();
		if (!upstream.ok) {
			return res.status(upstream.status).json({
				error: text || "Upstream error",
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
			return res.status(upstream.status).json({ error: text || "Upstream error" });
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
		if (!/^\d+$/.test(id)) {
			return res.status(400).json({ error: "Invalid course type id" });
		}
		const url = `${ZEUS_BASE}/api/coursetype/${id}`;
		const headers = zeusToken ? { Authorization: `Bearer ${zeusToken}` } : {};

		const upstream = await fetch(url, { headers });

		const text = await upstream.text();
		if (!upstream.ok) {
			const fallback = getFallbackCourseType(id);
			if (fallback) return res.json(fallback);
			return res.status(upstream.status).json({ error: text || "Upstream error" });
		}

		try {
			const data = text ? JSON.parse(text) : null;
			const fallback = getFallbackCourseType(id);
			if (fallback && (!data || !data.type)) return res.json(fallback);
			return res.json(data);
		} catch (parseErr) {
			const fallback = getFallbackCourseType(id);
			if (fallback) return res.json(fallback);
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
			return res.status(upstream.status).json({ error: text || "Upstream error" });
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

app.get("/api/teachers", async (req, res) => {
	try {
		const authHeader = req.headers.authorization || "";
		const match = authHeader.match(/^Bearer\s+(.+)/i);
		const zeusToken = match && match[1];

		const url = `${ZEUS_BASE}/api/teacher/public`;
		const headers = zeusToken ? { Authorization: `Bearer ${zeusToken}` } : {};
		const upstream = await fetch(url, { headers });
		const text = await upstream.text();

		if (!upstream.ok) {
			return res.status(upstream.status).json({ error: text || "Upstream error" });
		}

		try {
			return res.json(text ? JSON.parse(text) : []);
		} catch (parseErr) {
			return res.type("application/json").send(text);
		}
	} catch (err) {
		console.error("/api/teachers error", err);
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
			return res.status(upstream.status).json({ error: text || "Upstream error" });
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
			return res.status(upstream.status).json({ error: text || "Upstream error" });
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

app.get("/api/groups/:id/ics", async (req, res) => {
	try {
		const match = (req.headers.authorization || "").match(/^Bearer\s+(.+)/i);
		const zeusToken = match && match[1];
		if (!zeusToken) {
			return res.status(401).json({ error: "Bearer token required" });
		}
		if (!/^\d+$/.test(req.params.id)) {
			return res.status(400).json({ error: "Invalid group id" });
		}

		const url = `${ZEUS_BASE}/api/group/${req.params.id}/ics`;
		const upstream = await fetch(url, { headers: { Authorization: `Bearer ${zeusToken}` } });
		const text = await upstream.text();

		if (!upstream.ok) {
			return res.status(upstream.status).json({ error: text });
		}

		res.type("text/calendar").send(text);
	} catch (err) {
		console.error("/api/groups/:id/ics error", err);
		res.status(500).json({ error: "Proxy error" });
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
			return res.status(upstream.status).json({ error: text });
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

app.use(createNotificationRouter({ requireUser }));

app.get("*", (req, res) => {
	const indexPath = process.env.NODE_ENV === "production" ? path.join(__dirname, "public/index.html") : path.join(__dirname, "../client/dist/index.html");

	res.sendFile(indexPath, (err) => {
		if (err) {
			if (req.aborted || err.code === "ECONNABORTED") return;
			console.error("Erreur SPA fallback:", err);
			if (!res.headersSent && !res.writableEnded) res.status(404).json({ error: "Not found" });
		}
	});
});

app.listen(PORT, () => {
	console.log(`En ligne sur http://localhost:${PORT}`);
});
