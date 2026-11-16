type ParseHtml = (html: string) => Document;

const ALLOWED = new Set(["P", "BR", "DIV", "STRONG", "B", "EM", "I", "U", "S", "UL", "OL", "LI", "A", "IMG", "H3", "BLOCKQUOTE", "CODE", "PRE"]);

const DROPPED = new Set([
	"SCRIPT",
	"STYLE",
	"IFRAME",
	"OBJECT",
	"EMBED",
	"TEMPLATE",
	"NOSCRIPT",
	"SVG",
	"MATH",
	"HEAD",
	"TITLE",
	"META",
	"LINK",
	"FORM",
	"BUTTON",
	"INPUT",
	"TEXTAREA",
	"SELECT",
]);
const SAFE_URL = /^(https?:|mailto:)/i;

const defaultParse: ParseHtml = (html) => new (globalThis as unknown as { DOMParser: { new (): DOMParser } }).DOMParser().parseFromString(html, "text/html");

export function sanitizeNoteHtml(html: string, parse: ParseHtml = defaultParse): string {
	const doc = parse(`<body>${html}</body>`);
	const clean = (node: Element) => {
		for (const child of Array.from(node.childNodes)) {
			if (child.nodeType === 3) continue;
			if (child.nodeType !== 1) {
				child.remove();
				continue;
			}
			const element = child as Element;
			const tag = element.tagName.toUpperCase();
			if (DROPPED.has(tag)) {
				element.remove();
				continue;
			}
			clean(element);
			if (!ALLOWED.has(tag)) {
				element.replaceWith(...Array.from(element.childNodes));
				continue;
			}
			const href = element.getAttribute("href");
			const attachment = element.getAttribute("data-att");
			for (const name of element.getAttributeNames()) element.removeAttribute(name);
			if (tag === "A") {
				const url = href?.trim() ?? "";
				if (SAFE_URL.test(url)) {
					element.setAttribute("href", url);
					element.setAttribute("target", "_blank");
					element.setAttribute("rel", "noopener noreferrer");
				}
			}
			if (tag === "IMG") {
				if (attachment && /^[\w-]{1,100}$/.test(attachment)) element.setAttribute("data-att", attachment);
				else element.remove();
			}
		}
	};
	clean(doc.body);
	return doc.body.innerHTML;
}

export function noteHtmlToText(html: string, parse: ParseHtml = defaultParse): string {
	const spaced = html.replace(/<(br|p|div|li|ul|ol|h3|blockquote|pre)\b[^>]*>/gi, "\n$&").replace(/<\/(p|div|li|ul|ol|h3|blockquote|pre)>/gi, "$&\n");
	const doc = parse(`<body>${spaced}</body>`);
	return (doc.body.textContent ?? "").replace(/[ \t]*\n\s*/g, "\n").trim();
}
