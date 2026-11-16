import express from "express";
import fs from "fs";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";
import webpush from "web-push";
import { sanitizePushSubscription } from "./pushSubscription.js";
import { changesForSubscriber, createScheduleWatcher } from "./scheduleChanges.js";

process.env.TZ ||= "Europe/Paris";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const readPositiveDuration = (value, fallback, minimum) => {
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed >= minimum ? Math.floor(parsed) : fallback;
};

const EXPO_PUSH_API_URL = process.env.EXPO_PUSH_API_URL || "https://exp.host/--/api/v2/push/send";
const EXPO_PUSH_RECEIPTS_API_URL = process.env.EXPO_PUSH_RECEIPTS_API_URL || "https://exp.host/--/api/v2/push/getReceipts";
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, "data");
const WEB_PUSH_STORE = process.env.WEB_PUSH_STORE ? path.resolve(process.env.WEB_PUSH_STORE) : path.join(DATA_DIR, "web-push-subscriptions.json");
const MOBILE_PUSH_STORE = process.env.MOBILE_PUSH_STORE ? path.resolve(process.env.MOBILE_PUSH_STORE) : path.join(DATA_DIR, "mobile-push-subscriptions.json");
const MOBILE_PUSH_RECEIPTS_STORE = process.env.MOBILE_PUSH_RECEIPTS_STORE ? path.resolve(process.env.MOBILE_PUSH_RECEIPTS_STORE) : path.join(DATA_DIR, "mobile-push-receipts.json");
const EXPO_PUSH_RECEIPT_DELAY_MS = readPositiveDuration(process.env.EXPO_PUSH_RECEIPT_DELAY_MS, 15 * 60 * 1000, 60 * 1000);
const EXPO_PUSH_RECEIPT_RETRY_DELAY_MS = readPositiveDuration(process.env.EXPO_PUSH_RECEIPT_RETRY_DELAY_MS, 15 * 60 * 1000, 60 * 1000);
const EXPO_PUSH_RECEIPT_TTL_MS = readPositiveDuration(process.env.EXPO_PUSH_RECEIPT_TTL_MS, 24 * 60 * 60 * 1000, 60 * 60 * 1000);
const MAX_PENDING_EXPO_PUSH_RECEIPTS = readPositiveDuration(process.env.MAX_PENDING_EXPO_PUSH_RECEIPTS, 5000, 100);
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || "";
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || "";
const MAX_MOBILE_SUBSCRIPTIONS = 50_000;

let pushEnabled = false;
if (vapidPublicKey && vapidPrivateKey) {
	webpush.setVapidDetails("mailto:contact@alexistb.com", vapidPublicKey, vapidPrivateKey);
	pushEnabled = true;
}

const subscriptions = new Map();
const mobileSubscriptions = new Map();
const mobilePushReceipts = new Map();
const sentNotifications = new Map();
const eventsCache = new Map();
const storeWriteQueues = new Map();
let mobilePushReceiptCheckInFlight = null;

const isExpoPushToken = (token) => /^Expo(nent)?PushToken\[[^\]]+\]$/.test(String(token || ""));

const normalizeIdArray = (value) => {
	if (!Array.isArray(value)) return [];
	return value
		.map((item) => String(item).trim())
		.filter(Boolean)
		.slice(0, 100);
};

const normalizeNotificationSettings = (settings = {}) => {
	const minutesBefore = Number(settings.minutesBefore ?? settings.minuesBefore);
	const selectedDays = Array.isArray(settings.selectedDays) ? settings.selectedDays.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6) : [];
	const notificationType =
		settings.notificationType === "banner" || settings.notificationType === "sound" || settings.notificationType === "both" ? settings.notificationType : "both";

	return {
		minutesBefore: Number.isFinite(minutesBefore) && minutesBefore > 0 ? Math.min(minutesBefore, 24 * 60) : 15,
		selectedDays: selectedDays.length > 0 ? selectedDays : [0, 1, 2, 3, 4, 5, 6],
		notificationType,
		changeDetectionEnabled: settings.changeDetectionEnabled !== false,
		changeDetectionWindowDays: Math.min(14, Math.max(1, Math.trunc(Number(settings.changeDetectionWindowDays)) || 3)),
	};
};

const mobileCourseChannelId = (notificationType) => (notificationType === "banner" ? "courses-silent" : "courses");
const mobileCourseSound = (notificationType) => (notificationType === "banner" ? undefined : "default");

const mobileSubscriptionKey = (userId, expoPushToken) => `${userId}:${expoPushToken}`;

const removeMobileSubscriptionsForExpoPushToken = (expoPushToken) => {
	let removed = 0;
	for (const [key, subscription] of mobileSubscriptions) {
		if (subscription.expoPushToken === expoPushToken) {
			mobileSubscriptions.delete(key);
			removed++;
		}
	}
	return removed;
};

const writeJsonStoreUnsafe = async (storePath, rows) => {
	await fs.promises.mkdir(path.dirname(storePath), { recursive: true });

	const tmpPath = `${storePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;

	await fs.promises.writeFile(tmpPath, JSON.stringify(rows, null, 2), "utf8");
	await fs.promises.rename(tmpPath, storePath);
};

const writeJsonStore = async (storePath, rows) => {
	const previousWrite = storeWriteQueues.get(storePath) || Promise.resolve();

	const currentWrite = previousWrite.catch(() => {}).then(() => writeJsonStoreUnsafe(storePath, rows));

	storeWriteQueues.set(storePath, currentWrite);

	try {
		await currentWrite;
	} finally {
		if (storeWriteQueues.get(storePath) === currentWrite) {
			storeWriteQueues.delete(storePath);
		}
	}
};

const loadWebSubscriptions = async () => {
	try {
		const raw = await fs.promises.readFile(WEB_PUSH_STORE, "utf8");
		const rows = JSON.parse(raw);
		if (!Array.isArray(rows)) return;
		rows.forEach((row) => {
			const userId = String(row?.userId || "").trim();
			const subscription = row?.subscription || row;
			const clean = sanitizePushSubscription(subscription);
			if (userId && clean) {
				subscriptions.set(userId, {
					...clean,
					userGroups: normalizeIdArray(subscription.userGroups),
					settings: normalizeNotificationSettings(subscription.settings),
				});
			}
		});
		console.log(`Web push: ${subscriptions.size} subscription(s) chargée(s)`);
	} catch (err) {
		if (err.code !== "ENOENT") {
			console.error("Web push store load error:", err.message);
		}
	}
};

const persistWebSubscriptions = async () => {
	const rows = Array.from(subscriptions.entries()).map(([userId, subscription]) => ({
		userId,
		subscription,
	}));
	await writeJsonStore(WEB_PUSH_STORE, rows);
};

const loadMobileSubscriptions = async () => {
	try {
		const raw = await fs.promises.readFile(MOBILE_PUSH_STORE, "utf8");
		const rows = JSON.parse(raw);
		if (!Array.isArray(rows)) return;
		rows.forEach((row) => {
			if (row?.userId && isExpoPushToken(row?.expoPushToken)) {
				row.groups = normalizeIdArray(row.groups);
				row.settings = normalizeNotificationSettings(row.settings);
				mobileSubscriptions.set(mobileSubscriptionKey(row.userId, row.expoPushToken), row);
			}
		});
		console.log(`Mobile push: ${mobileSubscriptions.size} subscription(s) chargée(s)`);
	} catch (err) {
		if (err.code !== "ENOENT") {
			console.error("Mobile push store load error:", err.message);
		}
	}
};

const persistMobileSubscriptions = async () => {
	const rows = Array.from(mobileSubscriptions.values());
	await writeJsonStore(MOBILE_PUSH_STORE, rows);
};

const persistMobilePushReceipts = async () => {
	const rows = Array.from(mobilePushReceipts.values());
	await writeJsonStore(MOBILE_PUSH_RECEIPTS_STORE, rows);
};

const loadMobilePushReceipts = async () => {
	try {
		const raw = await fs.promises.readFile(MOBILE_PUSH_RECEIPTS_STORE, "utf8");
		const rows = JSON.parse(raw);
		if (!Array.isArray(rows)) return;

		const now = Date.now();
		let pruned = false;
		rows.forEach((row) => {
			const ticketId = String(row?.ticketId || "").trim();
			const expoPushToken = String(row?.expoPushToken || "").trim();
			const queuedAt = Number.isFinite(Number(row?.queuedAt)) ? Number(row.queuedAt) : now;
			const expiresAt = Number.isFinite(Number(row?.expiresAt)) ? Number(row.expiresAt) : queuedAt + EXPO_PUSH_RECEIPT_TTL_MS;
			const nextCheckAt = Number.isFinite(Number(row?.nextCheckAt)) ? Number(row.nextCheckAt) : now;

			if (!ticketId || !isExpoPushToken(expoPushToken) || expiresAt <= now) {
				pruned = true;
				return;
			}

			mobilePushReceipts.set(ticketId, {
				ticketId,
				expoPushToken,
				queuedAt,
				expiresAt,
				nextCheckAt,
				attempts: Math.max(0, Number.isFinite(Number(row?.attempts)) ? Math.floor(Number(row.attempts)) : 0),
				lastCheckedAt: Number.isFinite(Number(row?.lastCheckedAt)) ? Number(row.lastCheckedAt) : undefined,
			});
		});

		if (pruned) {
			await persistMobilePushReceipts();
		}
		console.log(`Mobile push: ${mobilePushReceipts.size} reçu(s) Expo en attente chargé(s)`);
	} catch (err) {
		if (err.code !== "ENOENT") {
			console.error("Mobile push receipt store load error:", err.message);
		}
	}
};

const cleanupExpiredMobilePushReceipts = (now = Date.now()) => {
	let removed = 0;
	for (const [ticketId, receipt] of mobilePushReceipts) {
		if (receipt.expiresAt <= now) {
			mobilePushReceipts.delete(ticketId);
			removed++;
		}
	}
	return removed;
};

const scheduleReceiptRetry = (receipt, now) => {
	const attempts = receipt.attempts + 1;
	const delay = Math.min(60 * 60 * 1000, EXPO_PUSH_RECEIPT_RETRY_DELAY_MS * 2 ** Math.min(attempts - 1, 2));
	receipt.attempts = attempts;
	receipt.lastCheckedAt = now;
	receipt.nextCheckAt = Math.min(receipt.expiresAt, now + delay);
};

const trackExpoPushReceipt = (ticket, message, now) => {
	const ticketId = String(ticket?.id || "").trim();
	const expoPushToken = typeof message?.to === "string" ? message.to.trim() : "";
	if (!ticketId || !isExpoPushToken(expoPushToken)) return false;

	mobilePushReceipts.set(ticketId, {
		ticketId,
		expoPushToken,
		queuedAt: now,
		expiresAt: now + EXPO_PUSH_RECEIPT_TTL_MS,
		nextCheckAt: now + EXPO_PUSH_RECEIPT_DELAY_MS,
		attempts: 0,
	});

	while (mobilePushReceipts.size > MAX_PENDING_EXPO_PUSH_RECEIPTS) {
		let oldestTicketId = null;
		let oldestQueuedAt = Infinity;
		for (const [pendingTicketId, pendingReceipt] of mobilePushReceipts) {
			if (pendingReceipt.queuedAt < oldestQueuedAt) {
				oldestTicketId = pendingTicketId;
				oldestQueuedAt = pendingReceipt.queuedAt;
			}
		}
		if (!oldestTicketId) break;
		mobilePushReceipts.delete(oldestTicketId);
		console.warn("Mobile push: limite de reçus en attente atteinte, ancien reçu purgé");
	}

	return true;
};

const getExpoPushReceipts = async (ticketIds) => {
	const response = await fetch(EXPO_PUSH_RECEIPTS_API_URL, {
		method: "POST",
		headers: {
			Accept: "application/json",
			"Accept-encoding": "gzip, deflate",
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ ids: ticketIds }),
	});
	const text = await response.text();
	const parsed = text ? JSON.parse(text) : {};
	if (!response.ok) {
		throw new Error(parsed?.errors?.[0]?.message || parsed?.error || `Expo push receipts HTTP ${response.status}`);
	}
	return parsed?.data && typeof parsed.data === "object" && !Array.isArray(parsed.data) ? parsed.data : {};
};

const checkExpoPushReceipts = async () => {
	if (mobilePushReceiptCheckInFlight) return mobilePushReceiptCheckInFlight;

	const check = (async () => {
		const now = Date.now();
		let receiptsChanged = cleanupExpiredMobilePushReceipts(now) > 0;
		let subscriptionsChanged = false;
		const dueReceipts = Array.from(mobilePushReceipts.values()).filter((receipt) => receipt.nextCheckAt <= now && receipt.expiresAt > now);

		if (dueReceipts.length === 0) {
			if (receiptsChanged) await persistMobilePushReceipts();
			return { checked: 0, removed: 0 };
		}

		let checked = 0;
		let removed = 0;
		try {
			for (let i = 0; i < dueReceipts.length; i += 1000) {
				const chunk = dueReceipts.slice(i, i + 1000);
				let receipts;
				try {
					receipts = await getExpoPushReceipts(chunk.map((receipt) => receipt.ticketId));
				} catch (err) {
					chunk.forEach((receipt) => scheduleReceiptRetry(receipt, now));
					receiptsChanged = true;
					throw err;
				}

				for (const pendingReceipt of chunk) {
					checked++;
					const receipt = receipts[pendingReceipt.ticketId];
					if (!receipt) {
						scheduleReceiptRetry(pendingReceipt, now);
						receiptsChanged = true;
						continue;
					}

					mobilePushReceipts.delete(pendingReceipt.ticketId);
					receiptsChanged = true;
					removed++;

					if (receipt.status === "error") {
						const errorCode = receipt?.details?.error || "UnknownError";
						if (errorCode === "DeviceNotRegistered") {
							const deletedSubscriptions = removeMobileSubscriptionsForExpoPushToken(pendingReceipt.expoPushToken);
							subscriptionsChanged = subscriptionsChanged || deletedSubscriptions > 0;
							console.log(`Mobile push: token désinscrit après reçu Expo (${deletedSubscriptions} subscription(s) supprimée(s))`);
						} else {
							console.error(`Mobile push receipt error ${errorCode}:`, receipt.message || "échec de livraison");
						}
					}
				}
			}
		} finally {
			if (subscriptionsChanged) await persistMobileSubscriptions();
			if (receiptsChanged) await persistMobilePushReceipts();
		}

		return { checked, removed };
	})();

	mobilePushReceiptCheckInFlight = check;
	try {
		return await check;
	} finally {
		if (mobilePushReceiptCheckInFlight === check) {
			mobilePushReceiptCheckInFlight = null;
		}
	}
};

const sendExpoPushMessages = async (messages) => {
	if (!messages.length) return [];
	const results = [];
	let subscriptionsChanged = false;
	let receiptsChanged = false;

	try {
		for (let i = 0; i < messages.length; i += 100) {
			const chunk = messages.slice(i, i + 100);
			const response = await fetch(EXPO_PUSH_API_URL, {
				method: "POST",
				headers: {
					Accept: "application/json",
					"Accept-encoding": "gzip, deflate",
					"Content-Type": "application/json",
				},
				body: JSON.stringify(chunk.map((message) => ({ priority: "high", ...message }))),
			});
			const text = await response.text();
			const parsed = text ? JSON.parse(text) : {};
			if (!response.ok) {
				throw new Error(parsed?.errors?.[0]?.message || parsed?.error || `Expo push HTTP ${response.status}`);
			}
			const data = Array.isArray(parsed?.data) ? parsed.data : [];
			results.push(...data);

			data.forEach((ticket, index) => {
				const message = chunk[index];
				if (ticket?.status === "error" && ticket?.details?.error === "DeviceNotRegistered") {
					subscriptionsChanged = removeMobileSubscriptionsForExpoPushToken(message?.to) > 0 || subscriptionsChanged;
				} else if (ticket?.status === "ok" && trackExpoPushReceipt(ticket, message, Date.now())) {
					receiptsChanged = true;
				}
			});
		}
	} finally {
		if (subscriptionsChanged) await persistMobileSubscriptions();
		if (receiptsChanged) await persistMobilePushReceipts();
	}

	return results;
};

await loadWebSubscriptions();
await loadMobileSubscriptions();
await loadMobilePushReceipts();

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

const scheduleWatcher = createScheduleWatcher();

const notifyScheduleChanges = async (groupIds, start, end, events) => {
	const changes = scheduleWatcher.observe(groupIds, Date.parse(start), Date.parse(end), events);
	if (!changes.length) return;
	let webNotified = 0;
	if (pushEnabled) {
		for (const [userId, subscription] of subscriptions) {
			for (const change of changesForSubscriber(changes, groupIds, { groups: subscription.userGroups, settings: subscription.settings })) {
				const notifKey = `change-web-${userId}-${change.key}`;
				if (sentNotifications.has(notifKey)) continue;
				const payload = JSON.stringify({
					title: change.notification.title,
					body: change.notification.message,
					icon: "/icons/logo.png",
					badge: "/icons/logo.png",
					tag: `change-${change.identity}`,
					data: { type: "course-change", startsAt: change.startDate, changeKey: change.key, kind: change.kind },
				});
				try {
					await webpush.sendNotification(subscription, payload);
					sentNotifications.set(notifKey, Date.now());
					webNotified++;
				} catch (err) {
					if (err.statusCode !== 410) {
						console.error(`Erreur envoi changement web ${userId}:`, err.message);
						continue;
					}
					subscriptions.delete(userId);
					await persistWebSubscriptions();
					break;
				}
			}
		}
	}

	const messages = [];
	const notifKeys = [];
	for (const [subscriptionKey, subscription] of mobileSubscriptions) {
		if (!subscription.changePush) continue;
		const notificationType = subscription.settings?.notificationType || "both";
		for (const change of changesForSubscriber(changes, groupIds, subscription)) {
			const notifKey = `change-${subscriptionKey}-${change.key}`;
			if (sentNotifications.has(notifKey)) continue;
			messages.push({
				to: subscription.expoPushToken,
				sound: mobileCourseSound(notificationType),
				title: change.notification.title,
				body: change.notification.message,
				channelId: mobileCourseChannelId(notificationType),
				data: { type: "course-change", startsAt: change.startDate, changeKey: change.key, kind: change.kind, openPanel: "event-changes", notificationType },
			});
			notifKeys.push(notifKey);
		}
	}
	const tickets = await sendExpoPushMessages(messages);
	tickets.forEach((ticket, index) => {
		if (ticket?.status === "ok") sentNotifications.set(notifKeys[index], Date.now());
	});
	if (webNotified || messages.length) console.log(`Changements de planning: ${changes.length} détecté(s), ${webNotified} web, ${messages.length} mobile`);
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

export const onGroupEventsFetched = (groupIds, start, end, events) => {
	cacheEvents(events, groupIds);
	notifyScheduleChanges(groupIds, start, end, events).catch((err) => console.error("Erreur notification changements:", err.message));
};

const notificationWorker = async () => {
	try {
		await checkExpoPushReceipts();
	} catch (err) {
		console.error("Erreur vérification des reçus Expo:", err.message);
	}

	if (!pushEnabled && mobileSubscriptions.size === 0) return;
	if (subscriptions.size === 0 && mobileSubscriptions.size === 0) return;

	cleanupSentNotifications();
	cleanupEventsCache();
	scheduleWatcher.cleanup();

	const now = new Date();
	const currentDay = now.getDay();

	let totalNotified = 0;
	let totalMobileNotified = 0;

	if (pushEnabled) {
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
								await persistWebSubscriptions();
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
	}

	const mobileMessages = [];
	const mobileNotifKeys = [];

	for (const [subscriptionKey, subscription] of mobileSubscriptions) {
		try {
			const settings = subscription.settings || { minutesBefore: 15, selectedDays: [0, 1, 2, 3, 4, 5, 6], notificationType: "both" };
			const userGroups = subscription.groups || [];

			if (!settings.selectedDays.includes(currentDay) || userGroups.length === 0) {
				continue;
			}

			const events = getEventsFromCache(userGroups);
			if (events.length === 0) {
				continue;
			}

			const minutesBefore = settings.minutesBefore || 15;
			const notificationType =
				settings.notificationType === "banner" || settings.notificationType === "sound" || settings.notificationType === "both" ? settings.notificationType : "both";

			for (const event of events) {
				const eventStart = new Date(event.startDate || event.start);
				const eventId = event.id || event.idReservation;
				const eventName = event.name || "Cours";
				if (!eventId || Number.isNaN(eventStart.getTime())) continue;

				const notifKey = `mobile-${subscriptionKey}-${eventId}`;
				if (sentNotifications.has(notifKey)) {
					continue;
				}

				const timeUntilEvent = eventStart.getTime() - now.getTime();
				const minutesUntilEvent = timeUntilEvent / (60 * 1000);

				if (minutesUntilEvent >= minutesBefore - 1 && minutesUntilEvent <= minutesBefore + 1) {
					mobileMessages.push({
						to: subscription.expoPushToken,
						sound: mobileCourseSound(notificationType),
						title: "Cours bientôt",
						body: `${eventName} commence dans ${Math.round(minutesUntilEvent)} minutes`,
						channelId: mobileCourseChannelId(notificationType),
						data: {
							type: "course-reminder",
							eventId,
							timestamp: Date.now(),
							notificationType,
						},
					});
					mobileNotifKeys.push(notifKey);
				}
			}
		} catch (err) {
			console.error(`Erreur worker mobile pour ${subscription.userId}:`, err.message);
		}
	}

	if (mobileMessages.length > 0) {
		try {
			const tickets = await sendExpoPushMessages(mobileMessages);
			tickets.forEach((ticket, index) => {
				if (ticket?.status === "ok") {
					sentNotifications.set(mobileNotifKeys[index], Date.now());
					totalMobileNotified++;
				}
			});
		} catch (err) {
			console.error("Erreur envoi notifications mobiles:", err.message);
		}
	}

	if (totalNotified > 0 || totalMobileNotified > 0) {
		console.log(`Worker notification: ${totalNotified} web, ${totalMobileNotified} mobile envoyée(s)`);
	}
};

setInterval(notificationWorker, 60 * 1000);

export function createNotificationRouter({ requireUser }) {
	const router = express.Router();

	router.post("/api/subscribe", async (req, res) => {
		try {
			const userId = await requireUser(req, res);
			if (!userId) return;
			const subscription = sanitizePushSubscription(req.body);
			if (!subscription) {
				return res.status(400).json({ error: "Invalid subscription" });
			}
			try {
				subscription.userGroups = normalizeIdArray(JSON.parse(req.headers["x-user-groups"] || "[]"));
				subscription.settings = normalizeNotificationSettings(JSON.parse(req.headers["x-notification-settings"] || "{}"));
			} catch {
				return res.status(400).json({ error: "Invalid notification headers" });
			}

			for (const [existingUserId, existing] of subscriptions) {
				if (existingUserId !== userId && existing.endpoint === subscription.endpoint) subscriptions.delete(existingUserId);
			}
			subscriptions.set(userId, subscription);
			await persistWebSubscriptions();

			res.json({ success: true, message: "Subscription registered" });
		} catch (err) {
			console.error("/api/subscribe error", err);
			res.status(500).json({ error: "Subscription failed" });
		}
	});

	router.post("/api/mobile/subscribe", async (req, res) => {
		try {
			const { expoPushToken, groups = [], settings = {}, platform = "unknown" } = req.body || {};
			const userId = await requireUser(req, res);
			if (!userId) return;

			if (!isExpoPushToken(expoPushToken) || expoPushToken.length > 200) {
				return res.status(400).json({ error: "expoPushToken is invalid" });
			}

			const now = new Date().toISOString();
			const key = mobileSubscriptionKey(userId, expoPushToken);
			const existing = mobileSubscriptions.get(key);
			if (!existing && mobileSubscriptions.size >= MAX_MOBILE_SUBSCRIPTIONS) {
				return res.status(503).json({ error: "Mobile subscriptions full" });
			}
			for (const [existingKey, existingSubscription] of mobileSubscriptions) {
				if (existingKey !== key && existingSubscription.expoPushToken === expoPushToken) {
					mobileSubscriptions.delete(existingKey);
				}
			}
			const subscription = {
				userId,
				expoPushToken,
				groups: normalizeIdArray(groups),
				settings: normalizeNotificationSettings(settings),
				platform: String(platform || "unknown").slice(0, 20),
				changePush: req.body?.changePush === true,
				createdAt: existing?.createdAt || now,
				updatedAt: now,
			};

			mobileSubscriptions.set(key, subscription);
			await persistMobileSubscriptions();

			res.json({
				success: true,
				message: "Mobile push subscription registered",
				changePush: subscription.changePush && subscription.groups.length > 0,
				count: Array.from(mobileSubscriptions.values()).filter((item) => item.userId === userId).length,
			});
		} catch (err) {
			console.error("/api/mobile/subscribe error", err);
			res.status(500).json({ error: "Mobile subscription failed" });
		}
	});

	router.post("/api/mobile/unsubscribe", async (req, res) => {
		try {
			const { expoPushToken } = req.body || {};
			const userId = await requireUser(req, res);
			if (!userId) return;
			let removed = 0;
			for (const [key, subscription] of mobileSubscriptions) {
				if (expoPushToken ? subscription.expoPushToken === expoPushToken : subscription.userId === userId) {
					mobileSubscriptions.delete(key);
					removed++;
				}
			}

			if (removed > 0) {
				await persistMobileSubscriptions();
			}

			res.json({ success: true, removed });
		} catch (err) {
			console.error("/api/mobile/unsubscribe error", err);
			res.status(500).json({ error: "Mobile unsubscribe failed" });
		}
	});

	router.post("/api/mobile/notify-test", async (req, res) => {
		try {
			const userId = await requireUser(req, res);
			if (!userId) return;

			const targets = Array.from(mobileSubscriptions.values()).filter((subscription) => subscription.userId === userId);
			if (targets.length === 0) {
				return res.status(404).json({ error: "Aucune subscription mobile trouvée", sent: 0, total: 0 });
			}

			const messages = targets.map((subscription) => ({
				to: subscription.expoPushToken,
				sound: "default",
				title: "Notification de test",
				body: "EpiTime peut envoyer des notifications natives.",
				channelId: "courses",
				data: { type: "test", timestamp: Date.now() },
			}));

			const tickets = await sendExpoPushMessages(messages);
			const sent = tickets.filter((ticket) => ticket?.status === "ok").length;

			res.json({ success: true, sent, total: targets.length, tickets });
		} catch (err) {
			console.error("/api/mobile/notify-test error", err);
			res.status(500).json({ error: "Mobile test notification failed" });
		}
	});

	router.post("/api/update-notification-settings", async (req, res) => {
		try {
			const userId = await requireUser(req, res);
			if (!userId) return;
			const { minutesBefore, selectedDays, groups } = req.body || {};

			const subscription = subscriptions.get(userId);
			if (!subscription) {
				return res.status(404).json({ error: "Subscription non trouvée" });
			}

			subscription.settings = normalizeNotificationSettings({ minutesBefore, selectedDays });
			if (groups) {
				subscription.userGroups = normalizeIdArray(groups);
			}
			subscriptions.set(userId, subscription);
			await persistWebSubscriptions();

			res.json({ success: true, message: "Settings updated" });
		} catch (err) {
			console.error("/api/update-notification-settings error", err);
			res.status(500).json({ error: "Update failed" });
		}
	});

	router.get("/api/vapid-key", (_req, res) => {
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



	router.post("/api/notify-test", async (req, res) => {
		try {
			const userId = await requireUser(req, res);
			if (!userId) return;

			const payload = JSON.stringify({
				title: "🔔 Notification de test",
				body: "Ceci est une notification de test",
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
					await persistWebSubscriptions();
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

	router.post("/api/unsubscribe", async (req, res) => {
		try {
			const userId = await requireUser(req, res);
			if (!userId) return;
			const removed = subscriptions.delete(userId);
			if (removed) {
				await persistWebSubscriptions();
			}
			console.log(`❌ Subscription supprimée pour ${userId}`);
			res.json({ success: true });
		} catch (err) {
			console.error("/api/unsubscribe error", err);
			res.status(500).json({ error: "Unsubscribe failed" });
		}
	});

	return router;
}
