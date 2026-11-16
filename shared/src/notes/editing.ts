const BLOCK = /^(P|DIV|LI|H3|BLOCKQUOTE|PRE)$/;
const SHORTCUTS: Record<string, "ul" | "ol" | "check" | "h3"> = { "-": "ul", "*": "ul", "1.": "ol", "[]": "check", "[ ]": "check", "#": "h3" };

const elementOf = (node: Node | null) => (node?.nodeType === 1 ? (node as Element) : (node?.parentElement ?? null));

const caretElement = (body: HTMLElement) => {
	const element = elementOf(window.getSelection()?.anchorNode ?? null);
	return element && body.contains(element) ? element : null;
};

export function toggleHeading(body: HTMLElement) {
	body.focus();
	const inHeading = caretElement(body)?.closest("h3");
	document.execCommand("formatBlock", false, inHeading ? "div" : "h3");
}

export function toggleChecklist(body: HTMLElement) {
	body.focus();
	const list = caretElement(body)?.closest("ul");
	if (list && !list.hasAttribute("data-check")) {
		list.setAttribute("data-check", "");
		return;
	}
	document.execCommand("insertUnorderedList");
	if (list) return;
	caretElement(body)?.closest("ul")?.setAttribute("data-check", "");
}

const checklistItem = (target: EventTarget | null) => {
	const item = elementOf(target as Node | null)?.closest("li");
	return item?.parentElement?.hasAttribute("data-check") ? item : null;
};

export function onChecklistClick(event: MouseEvent): boolean {
	const item = checklistItem(event.target);
	if (!item || event.target !== item) return false;
	const box = parseFloat(getComputedStyle(item).paddingLeft);
	if (event.clientX - item.getBoundingClientRect().left > box) return false;
	event.preventDefault();
	item.toggleAttribute("data-done");
	return true;
}

export function onEditorKeyDown(body: HTMLElement, event: KeyboardEvent): boolean {
	const selection = window.getSelection();
	if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
		const item = checklistItem(selection?.anchorNode ?? null);
		if (!item) return false;
		event.preventDefault();
		item.toggleAttribute("data-done");
		return true;
	}
	if (event.key === "Enter" && !event.shiftKey && checklistItem(selection?.anchorNode ?? null)) {
		event.preventDefault();
		document.execCommand("insertParagraph");
		const current = window.getSelection();
		checklistItem(current?.anchorNode ?? null)?.removeAttribute("data-done");
		if (current?.rangeCount) {
			const range = current.getRangeAt(0);
			current.removeAllRanges();
			current.addRange(range);
		}
		return true;
	}
	if (event.key !== " " || !selection?.isCollapsed || selection.anchorNode?.nodeType !== 3) return false;

	let block = selection.anchorNode.parentElement;
	while (block && block !== body && !BLOCK.test(block.tagName)) block = block.parentElement;
	if (!block || !body.contains(block) || block.tagName === "LI" || block.tagName === "H3") return false;
	const range = document.createRange();
	range.setStart(block, 0);
	range.setEnd(selection.anchorNode, selection.anchorOffset);
	const kind = SHORTCUTS[range.toString().replace(/\u00a0/g, " ")];
	if (!kind) return false;

	event.preventDefault();
	selection.removeAllRanges();
	selection.addRange(range);
	document.execCommand("delete");
	if (kind === "h3") toggleHeading(body);
	else if (kind === "check") toggleChecklist(body);
	else document.execCommand(kind === "ul" ? "insertUnorderedList" : "insertOrderedList");
	return true;
}
