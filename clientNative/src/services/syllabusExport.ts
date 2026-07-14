import { NativeModules, Platform } from "react-native";
import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system/legacy";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { cleanHtml, type AurigaExam, type AurigaSyllabus } from "./aurigaTypes";
import { getSubjectCoefficientOverride, type SubjectCoefficientOverrides } from "./gradeCoefficientOverrides";
import { formatSecondsAsHours } from "../utils/syllabusTime";

export type SyllabusSemesterRange = {
	startSemester: number;
	endSemester: number;
	label: string;
	fileLabel: string;
};

export type SyllabusExportDetail = "minimal" | "complete";

export type SyllabusSemesterFilter = {
	syllabus: AurigaSyllabus[];
	semesters: number[];
};

export type ExportSyllabusOptions = {
	syllabus: AurigaSyllabus[];
	overrides?: SubjectCoefficientOverrides;
	selectedSemester?: number | null;
	startSemester?: number;
	endSemester?: number;
	detail?: SyllabusExportDetail;
	now?: Date;
};

export type ExportSyllabusResult = {
	semesterRange: SyllabusSemesterRange;
	syllabusCount: number;
	detail: SyllabusExportDetail;
	fileName: string;
	saved: boolean;
	uri?: string;
};

const PdfDownloads = NativeModules.EpiTimePdfDownloads as
	| {
			savePdfToDownloads?: (sourceUri: string, fileName: string) => Promise<string>;
	  }
	| undefined;

export function getSyllabusSemesterRange(startSemester: number, endSemester = startSemester): SyllabusSemesterRange {
	const safeStartSemester = Math.max(1, Math.trunc(startSemester));
	const safeEndSemester = Math.max(safeStartSemester, Math.trunc(endSemester));
	return {
		startSemester: safeStartSemester,
		endSemester: safeEndSemester,
		label: safeStartSemester === safeEndSemester ? `Semestre ${safeStartSemester}` : `Semestres ${safeStartSemester} - ${safeEndSemester}`,
		fileLabel: safeStartSemester === safeEndSemester ? `S${safeStartSemester}` : `S${safeStartSemester} - S${safeEndSemester}`,
	};
}

export function getAvailableSyllabusSemesters(syllabus: AurigaSyllabus[], selectedSemester?: number | null) {
	const semesters = new Set(syllabus.map((item) => item.semester).filter((semester): semester is number => Number.isFinite(semester) && semester > 0));
	if (!semesters.size && selectedSemester && selectedSemester > 0) semesters.add(selectedSemester);
	return Array.from(semesters).sort((left, right) => left - right);
}

export function filterSyllabusForSemesterRange(syllabus: AurigaSyllabus[], semesterRange: SyllabusSemesterRange): SyllabusSemesterFilter {
	const filtered = syllabus
		.filter((item) => item.semester >= semesterRange.startSemester && item.semester <= semesterRange.endSemester)
		.sort((left, right) => left.semester - right.semester || displayName(left).localeCompare(displayName(right), "fr"));
	return {
		syllabus: uniqueSyllabus(filtered),
		semesters: getAvailableSyllabusSemesters(filtered),
	};
}

export async function exportSemesterSyllabusPdf(options: ExportSyllabusOptions): Promise<ExportSyllabusResult> {
	const availableSemesters = getAvailableSyllabusSemesters(options.syllabus, options.selectedSemester);
	const fallbackSemester = availableSemesters[availableSemesters.length - 1] || 1;
	const startSemester = Number.isFinite(options.startSemester) ? Math.trunc(options.startSemester!) : fallbackSemester;
	const endSemester = Number.isFinite(options.endSemester) ? Math.trunc(options.endSemester!) : startSemester;
	const semesterRange = getSyllabusSemesterRange(startSemester, endSemester);
	const detail = options.detail || "complete";
	const filtered = filterSyllabusForSemesterRange(options.syllabus, semesterRange);
	if (!filtered.syllabus.length) throw new Error(`Aucun syllabus disponible pour ${semesterRange.label.toLowerCase()}.`);

	const fileName = `Syllabus ${semesterRange.fileLabel}.pdf`;
	const html = await buildAcademicSyllabusHtml({ semesterRange, ...filtered, overrides: options.overrides || {}, detail, fileName });

	if (Platform.OS === "web") {
		openWebPrintDialog(html, fileName);
		return {
			semesterRange,
			syllabusCount: filtered.syllabus.length,
			detail,
			fileName,
			saved: true,
		};
	}

	const { uri } = await Print.printToFileAsync({ html });
	const savedUri = Platform.OS === "android" ? await savePdfToAndroidDownloads(uri, fileName) : await savePdfForIos(uri, fileName);
	return {
		semesterRange,
		syllabusCount: filtered.syllabus.length,
		detail,
		fileName,
		saved: Boolean(savedUri),
		uri: savedUri || uri,
	};
}

async function savePdfToAndroidDownloads(sourceUri: string, fileName: string) {
	if (!PdfDownloads?.savePdfToDownloads) throw new Error("Le téléchargement direct nécessite la dernière version de l’application.");
	return PdfDownloads.savePdfToDownloads(sourceUri, fileName);
}

async function savePdfForIos(sourceUri: string, fileName: string) {
	const documentDirectory = FileSystem.documentDirectory;
	if (!documentDirectory) return null;
	const targetUri = `${documentDirectory}${fileName}`;
	await FileSystem.deleteAsync(targetUri, { idempotent: true });
	await FileSystem.copyAsync({ from: sourceUri, to: targetUri });
	if (await Sharing.isAvailableAsync()) {
		await Sharing.shareAsync(targetUri, {
			dialogTitle: fileName,
			mimeType: "application/pdf",
			UTI: "com.adobe.pdf",
		});
	}
	return targetUri;
}

function openWebPrintDialog(html: string, fileName: string) {
	if (typeof window === "undefined") throw new Error("L’export PDF nécessite un navigateur.");
	const printWindow = window.open("", "_blank");
	if (!printWindow) throw new Error("Autorise les fenêtres contextuelles pour exporter le syllabus.");
	printWindow.document.open();
	printWindow.document.write(html);
	printWindow.document.title = fileName.replace(/\.pdf$/i, "");
	printWindow.document.close();
	window.setTimeout(() => {
		printWindow.focus();
		printWindow.print();
	}, 180);
}

async function buildAcademicSyllabusHtml({
	semesterRange,
	syllabus,
	semesters,
	overrides,
	detail,
	fileName,
}: SyllabusSemesterFilter & { semesterRange: SyllabusSemesterRange; overrides: SubjectCoefficientOverrides; detail: SyllabusExportDetail; fileName: string }) {
	const contentTitle = detail === "minimal" ? "Synthèse des enseignements" : "Programme détaillé";
	const detailLabel = detail === "minimal" ? "Édition réduite" : "Édition complète";
	const semesterHtml = semesters
		.map((semester, index) => {
			const grouped = new Map<string, AurigaSyllabus[]>();
			for (const item of syllabus.filter((entry) => entry.semester === semester)) {
				const ue = item.UE?.trim() || "Autres enseignements";
				const entries = grouped.get(ue) || [];
				entries.push(item);
				grouped.set(ue, entries);
			}
			const groups = Array.from(grouped.entries())
				.sort(([left], [right]) => left.localeCompare(right, "fr"))
				.map(
					([ue, entries]) =>
						`<section class="ue"><div class="ue-title">${escapeHtml(ue)}</div>${entries.map((item) => renderSyllabus(item, overrides, detail)).join("")}</section>`
				)
				.join("");
			const count = Array.from(grouped.values()).reduce((total, entries) => total + entries.length, 0);
			return `<section class="semester-section${index > 0 ? " semester-break" : ""}"><header class="content-header"><h2>Semestre ${semester}</h2><p>${escapeHtml(contentTitle)}<br />${count} matière${count > 1 ? "s" : ""}</p></header>${groups}</section>`;
		})
		.join("");
	const logoUri = await getLogoUri();

	return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(fileName.replace(/\.pdf$/i, ""))}</title>
<style>
@page { size: A4; margin: 8mm 9mm 10mm; }
* { box-sizing: border-box; }
body { margin: 0; color: #102a43; background: #ffffff; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 9.6pt; line-height: 1.35; }
.cover { min-height: 260mm; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 12mm; color: #102a43; background: #ffffff; text-align: center; page-break-after: always; break-after: page; }
.cover-logo { display: block; width: 70mm; max-height: 70mm; margin: 0 auto 12mm; object-fit: contain; }
.cover-kicker { margin: 0 0 4mm; color: #0b6e99; font-size: 9pt; font-weight: 900; letter-spacing: .16em; text-transform: uppercase; }
.cover h1 { margin: 0; color: #023c69; font-size: 32pt; line-height: 1; letter-spacing: -.04em; }
.cover-year { margin: 5mm 0 0; color: #0b6e99; font-size: 20pt; font-weight: 800; letter-spacing: -.02em; }
.cover-copy { max-width: 120mm; margin: 8mm auto 0; color: #486581; font-size: 11.5pt; line-height: 1.45; }
.cover-footer { margin-top: 16mm; color: #627d98; font-size: 9pt; font-weight: 700; }
.content-header { display: flex; justify-content: space-between; align-items: end; gap: 8mm; padding: 0 0 3.5mm; border-bottom: 1.5px solid #0b6e99; }
.content-header h2 { margin: 0; color: #023c69; font-size: 17pt; letter-spacing: -.025em; }
.content-header p { margin: 0; color: #486581; font-size: 8.8pt; font-weight: 800; text-align: right; }
.semester-section { display: block; }
.semester-break { break-before: page; page-break-before: always; }
.ue { margin-top: 5mm; }
.ue-title { margin: 0 0 2mm; color: #0b608a; font-size: 8.2pt; font-weight: 900; letter-spacing: .09em; text-transform: uppercase; break-after: avoid; page-break-after: avoid; }
.course { margin: 0 0 2.8mm; padding: 3.2mm 3.6mm; background: #f7fafc; border: 1px solid #d9e8ef; border-radius: 2.6mm; }
.course-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 4mm; break-after: avoid; page-break-after: avoid; }
.course h3 { margin: 0; color: #102a43; font-size: 11.8pt; line-height: 1.2; letter-spacing: -.012em; }
.code { margin-top: .8mm; color: #627d98; font-size: 7.8pt; font-weight: 700; }
.coefficient { flex: 0 0 auto; min-width: 20mm; padding: 1.6mm 2.4mm; color: #035778; background: #dff5f5; border-radius: 999px; font-size: 7.8pt; font-weight: 900; text-align: center; }
.facts { display: flex; flex-wrap: wrap; gap: 1.2mm 3.5mm; margin: 2.5mm 0 0; color: #486581; font-size: 7.9pt; font-weight: 700; }
.facts span { white-space: nowrap; }
.block { margin-top: 2.7mm; break-inside: avoid; page-break-inside: avoid; }
.block h4 { margin: 0 0 .7mm; color: #243b53; font-size: 8.1pt; font-weight: 900; break-after: avoid; page-break-after: avoid; }
.block p { margin: 0; color: #334e68; white-space: pre-line; }
.exams { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1.7mm; margin-top: 1.8mm; }
.exam { min-height: 10mm; padding: 1.8mm 2mm; background: #ffffff; border: 1px solid #e2edf2; border-radius: 1.8mm; break-inside: avoid; page-break-inside: avoid; }
.exam-title { color: #16364a; font-size: 7.9pt; font-weight: 900; }
.exam-meta { margin-top: .6mm; color: #627d98; font-size: 7.4pt; }
.empty { margin: 2.4mm 0 0; color: #829ab1; font-size: 8pt; font-style: italic; }
.document-list { margin: 1mm 0 0; padding-left: 4mm; color: #486581; }
.document-list li { margin: .6mm 0; }
.course-minimal { break-inside: avoid; page-break-inside: avoid; }
.minimal-facts { display: grid; grid-template-columns: 20mm minmax(0, 1fr) 24mm; gap: 2mm 4mm; margin: 2.4mm 0 0; padding: 2.2mm 0 0; border-top: 1px solid #dce9ee; }
.minimal-fact dt { margin: 0; color: #627d98; font-size: 7pt; font-weight: 900; text-transform: uppercase; }
.minimal-fact dd { margin: .45mm 0 0; color: #243b53; font-size: 8.4pt; font-weight: 800; }
.minimal-exams { grid-column: 1 / -1; margin-top: .4mm; padding-top: 2.3mm; border-top: 1px solid #dce9ee; }
.minimal-exams-label { margin: 0 0 1.4mm; color: #627d98; font-size: 7pt; font-weight: 900; letter-spacing: .06em; text-transform: uppercase; }
.minimal-exam-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1.5mm; }
.minimal-exam { min-width: 0; padding: 1.8mm 2mm; background: #ffffff; border: 1px solid #dce9ee; border-radius: 1.8mm; }
.minimal-exam-top { display: flex; justify-content: space-between; align-items: baseline; gap: 2mm; }
.minimal-exam-name { min-width: 0; color: #16364a; font-size: 7.8pt; font-weight: 900; }
.minimal-exam-weight { flex: 0 0 auto; color: #035778; font-size: 7.4pt; font-weight: 900; }
.minimal-exam-description { margin-top: .7mm; color: #627d98; font-size: 7.1pt; line-height: 1.25; }
.minimal-exams-empty { color: #829ab1; font-size: 7.6pt; font-style: italic; }
.page-footer { margin-top: 5mm; color: #829ab1; font-size: 7.4pt; text-align: right; }
</style>
</head>
<body>
<section class="cover">
${logoUri ? `<img class="cover-logo" src="${logoUri}" alt="EpiTime" />` : '<div class="cover-kicker">EpiTime</div>'}
<h1>Syllabus</h1>
<p class="cover-year">${escapeHtml(semesterRange.label)}</p>
<p class="cover-copy">${detail === "minimal" ? "Les matières, responsables référents et volumes horaires de votre parcours." : "Une synthèse structurée de vos enseignements, évaluations, objectifs et volumes de travail."}</p>
<p class="cover-footer">${syllabus.length} matière${syllabus.length > 1 ? "s" : ""} · ${escapeHtml(detailLabel)} · Généré le ${escapeHtml(new Date().toLocaleDateString("fr-FR"))}</p>
<p class="cover-footer">Les coefficients des matières sont indiqués à titre informatif et sont généralement différents de ceux utilisés pour le calcul de la moyenne par l'administration. Pour toute question sur les coefficients, merci de contacter le service pédagogique.</p>
</section>
<main>
${semesterHtml}
<footer class="page-footer">EpiTime · Syllabus ${escapeHtml(semesterRange.label)}</footer>
</main>
</body>
</html>`;
}

async function getLogoUri() {
	try {
		const asset = Asset.fromModule(require("../../assets/app_logo.png"));
		if (!asset.localUri) await asset.downloadAsync();
		const localUri = asset.localUri || asset.uri;
		const base64 = await FileSystem.readAsStringAsync(localUri, { encoding: FileSystem.EncodingType.Base64 });
		return `data:image/png;base64,${base64}`;
	} catch {
		return "";
	}
}

function renderSyllabus(syllabus: AurigaSyllabus, overrides: SubjectCoefficientOverrides, detail: SyllabusExportDetail) {
	const coefficient = getSubjectCoefficientOverride({ syllabusId: syllabus.id }, overrides) ?? syllabus.coeff ?? 1;
	const title = displayName(syllabus);
	const code = syllabus.code || syllabus.name;
	const exams = syllabus.exams?.length
		? `<div class="block"><h4>Évaluations</h4><div class="exams">${syllabus.exams.map((exam) => renderExam(exam, syllabus.exams.length)).join("")}</div></div>`
		: "";
	const minimalExams = renderMinimalExams(syllabus.exams);
	if (detail === "minimal") {
		return `<article class="course course-minimal">
<div class="course-head"><div><h3>${escapeHtml(title)}</h3><div class="code">${escapeHtml(code)}</div></div><div class="coefficient">S${escapeHtml(String(syllabus.semester || "-"))}</div></div>
<dl class="minimal-facts">
<div class="minimal-fact"><dt>Professeur référent</dt><dd>${escapeHtml(formatResponsables(syllabus))}</dd></div>
<div class="minimal-fact"><dt>Nombre d’heures</dt><dd>${escapeHtml(formatSecondsAsHours(totalCourseDuration(syllabus), "-"))}</dd></div>
${minimalExams}
</dl>
</article>`;
	}

	const facts = [
		`Semestre ${syllabus.semester || "-"}`,
		formatPeriod(syllabus.period?.startDate, syllabus.period?.endDate),
		`Encadré ${formatSecondsAsHours(totalCourseDuration(syllabus), "-")}`,
		`Travail ${formatSecondsAsHours(syllabus.estimatedStudentWorkload, "-")}`,
		syllabus.minScore ? `Seuil ${syllabus.minScore}/20` : null,
	]
		.filter(Boolean)
		.map((item) => `<span>${escapeHtml(item!)}</span>`)
		.join("");
	const description = cleanHtml(syllabus.courseDescription?.coursPlan?.fr);
	const goals = cleanHtml(syllabus.caption?.goals?.fr);
	const program = cleanHtml(syllabus.caption?.program?.fr);
	const prerequisites = cleanHtml(syllabus.prerequisites?.fr);
	const details = [
		renderTextBlock("Description", description),
		renderTextBlock("Objectifs", goals),
		renderTextBlock("Programme", program),
		renderTextBlock("Prérequis", prerequisites),
	]
		.filter(Boolean)
		.join("");

	const documents = syllabus.documents?.length
		? `<div class="block"><h4>Documents</h4><ul class="document-list">${syllabus.documents.map((document) => `<li>${escapeHtml([document.fileName || "Document", document.fileExtension?.toUpperCase(), formatFileSize(document.fileSize)].filter(Boolean).join(" · "))}</li>`).join("")}</ul></div>`
		: "";

	return `<article class="course">
<div class="course-head"><div><h3>${escapeHtml(title)}</h3><div class="code">${escapeHtml(code)}</div></div><div class="coefficient">Coeff. ${escapeHtml(formatCoefficient(coefficient))}</div></div>
<div class="facts">${facts}</div>
${details || '<p class="empty">Aucun détail pédagogique disponible.</p>'}
${exams}
${documents}
</article>`;
}

function renderExam(exam: AurigaExam, count: number) {
	const weight = examWeight(exam, count);
	const description = cleanHtml(exam.description?.fr);
	return `<div class="exam"><div class="exam-title">${escapeHtml(exam.typeName || exam.type || "Évaluation")}</div><div class="exam-meta">${escapeHtml(`${formatCoefficient(weight)}%${description ? ` · ${description}` : ""}`)}</div></div>`;
}

function renderMinimalExams(exams?: AurigaExam[]) {
	if (!exams?.length) return `<div class="minimal-exams"><div class="minimal-exams-label">Évaluations</div><div class="minimal-exams-empty">Aucune évaluation renseignée.</div></div>`;
	return `<div class="minimal-exams"><div class="minimal-exams-label">Évaluations</div><div class="minimal-exam-list">${exams
		.map((exam) => {
			const description = cleanHtml(exam.description?.fr);
			return `<div class="minimal-exam"><div class="minimal-exam-top"><span class="minimal-exam-name">${escapeHtml(exam.typeName || exam.type || "Évaluation")}</span><span class="minimal-exam-weight">${escapeHtml(`${formatCoefficient(examWeight(exam, exams.length))}%`)}</span></div>${description ? `<div class="minimal-exam-description">${escapeHtml(description)}</div>` : ""}</div>`;
		})
		.join("")}</div></div>`;
}

function examWeight(exam: AurigaExam, count: number) {
	return typeof exam.weighting === "number" && exam.weighting > 0 ? exam.weighting : 100 / Math.max(1, count);
}

function renderTextBlock(title: string, text: string) {
	if (!text.trim()) return "";
	return `<div class="block"><h4>${escapeHtml(title)}</h4><p>${escapeHtml(text)}</p></div>`;
}

function parseLocalDate(value?: string) {
	if (!value) return null;
	const dateOnly = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
	if (dateOnly) {
		const [, year, month, day] = dateOnly;
		const date = new Date(Number(year), Number(month) - 1, Number(day));
		return Number.isNaN(date.getTime()) ? null : date;
	}
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

function uniqueSyllabus(syllabus: AurigaSyllabus[]) {
	const ids = new Set<number>();
	return syllabus.filter((item) => {
		if (ids.has(item.id)) return false;
		ids.add(item.id);
		return true;
	});
}

function displayName(syllabus: AurigaSyllabus) {
	return syllabus.caption?.name || syllabus.name || "Syllabus";
}

function totalCourseDuration(syllabus: AurigaSyllabus) {
	if (typeof syllabus.duration === "number" && syllabus.duration > 0) return syllabus.duration;
	return (syllabus.activities || []).reduce((total, activity) => total + (typeof activity.duration === "number" ? activity.duration : 0), 0);
}

function formatResponsables(syllabus: AurigaSyllabus) {
	const people = (syllabus.responsables || [])
		.map((person) => [person.firstName, person.lastName].filter(Boolean).join(" ").trim() || person.login?.trim() || "")
		.filter(Boolean);
	return people.length ? people.join(" · ") : "Non renseigné";
}

function formatCoefficient(value: number) {
	return value.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

function formatPeriod(start?: string, end?: string) {
	const values = [start, end].map((value) => parseLocalDate(value)?.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })).filter(Boolean);
	return values.join(" - ") || "Période non renseignée";
}

function formatFileSize(size?: number) {
	if (!size || !Number.isFinite(size)) return "";
	if (size < 1024 * 1024) return `${Math.round(size / 1024)} Ko`;
	return `${(size / 1024 / 1024).toFixed(1)} Mo`;
}

function escapeHtml(value: string) {
	return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] || character);
}
