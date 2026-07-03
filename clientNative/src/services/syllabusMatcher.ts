import type { ZeusEvent } from "../types";
import { getEventTitle } from "../utils/calendar";
import { extractSubjectCode, type AurigaSyllabus } from "./aurigaTypes";

function normalizeText(value?: string | number | null) {
	return String(value ?? "")
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9]+/g, " ")
		.trim()
		.replace(/\s+/g, " ");
}

function normalizeCode(value?: string | number | null) {
	return String(value ?? "")
		.toUpperCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^A-Z0-9_]+/g, "_")
		.replace(/^_+|_+$/g, "");
}

function syllabusCodes(syllabus: AurigaSyllabus) {
	return [syllabus.code, syllabus.name, extractSubjectCode(syllabus.name)].map(normalizeCode).filter(Boolean);
}

function syllabusLabels(syllabus: AurigaSyllabus) {
	return [syllabus.caption?.name, syllabus.name, extractSubjectCode(syllabus.name)].map(normalizeText).filter((value) => value.length >= 4);
}

function scoreSyllabusForEvent(event: ZeusEvent, syllabus: AurigaSyllabus) {
	const eventCodes = [event.code, event.name].map(normalizeCode).filter(Boolean);
	const eventLabels = [getEventTitle(event), event.name, event.typeName].map(normalizeText).filter((value) => value.length >= 4);
	const codes = syllabusCodes(syllabus);
	const labels = syllabusLabels(syllabus);

	for (const eventCode of eventCodes) {
		for (const syllabusCode of codes) {
			if (eventCode === syllabusCode) return 100;
			if (eventCode.startsWith(`${syllabusCode}_`) || syllabusCode.startsWith(`${eventCode}_`)) return 90;
		}
	}

	for (const eventLabel of eventLabels) {
		for (const syllabusLabel of labels) {
			if (eventLabel === syllabusLabel) return 80;
			if (syllabusLabel.length >= 8 && eventLabel.includes(syllabusLabel)) return 70;
			if (eventLabel.length >= 8 && syllabusLabel.includes(eventLabel)) return 60;
		}
	}

	return 0;
}

export function findSyllabusForEvent(event: ZeusEvent, syllabusList: AurigaSyllabus[]) {
	let best: { syllabus: AurigaSyllabus; score: number } | null = null;
	for (const syllabus of syllabusList) {
		const score = scoreSyllabusForEvent(event, syllabus);
		if (score > (best?.score ?? 0)) best = { syllabus, score };
	}
	return best && best.score >= 60 ? best.syllabus : null;
}
