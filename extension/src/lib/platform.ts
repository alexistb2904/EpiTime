import { browser } from "wxt/browser";
import { ALLOWED_ORIGINS } from "./origins";

export { browser };

export const IS_FIREFOX = import.meta.env.FIREFOX;
export const BROWSER_NAME = IS_FIREFOX ? "firefox" : "chromium";

type SidePanelApi = { open(options: { windowId: number }): Promise<void> };
type SidebarApi = { open(): Promise<void> };

export function openNotesPanel(windowId: number | undefined) {
	if (IS_FIREFOX) return (browser as unknown as { sidebarAction: SidebarApi }).sidebarAction.open();
	if (windowId === undefined) return Promise.reject(new Error("Fenêtre inconnue"));
	return (browser as unknown as { sidePanel: SidePanelApi }).sidePanel.open({ windowId });
}

export async function currentWindowId() {
	return (await browser.windows.getCurrent()).id;
}

export async function setBadge(text: string, color: string) {
	await browser.action.setBadgeText({ text });
	if (text) await browser.action.setBadgeBackgroundColor({ color });

	if (text && IS_FIREFOX) await browser.action.setBadgeTextColor?.({ color: "#141a2e" });
}

export async function notify(id: string, title: string, message: string) {
	await browser.notifications.create(id, {
		type: "basic",
		iconUrl: browser.runtime.getURL("/icon/128.png"),
		title,
		message,

		...(IS_FIREFOX ? {} : { priority: 1 }),
	});
}

export async function openWebApp(origin: string, path = "/") {
	const url = new URL(path, origin).href;
	const [existing] = await browser.tabs.query({ url: `${origin}/*` });
	if (existing?.id !== undefined) {
		await browser.tabs.update(existing.id, { active: true, url: path === "/" ? undefined : url });
		if (existing.windowId !== undefined) await browser.windows.update(existing.windowId, { focused: true });
		return;
	}
	await browser.tabs.create({ url });
}

export function isTrustedContentScript(sender: { id?: string; url?: string; tab?: unknown }) {
	if (sender.id !== browser.runtime.id || !sender.tab || !sender.url) return false;
	try {
		return ALLOWED_ORIGINS.includes(new URL(sender.url).origin);
	} catch {
		return false;
	}
}

export function isExtensionPage(sender: { id?: string; url?: string }) {
	return sender.id === browser.runtime.id && Boolean(sender.url?.startsWith(browser.runtime.getURL("/")));
}
