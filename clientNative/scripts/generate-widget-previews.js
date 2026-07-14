"use strict";

/**
 * Generates picker previews from the same geometry and palette as the 4 x 2
 * semester widgets. These are layout snapshots, not marketing illustrations.
 */

const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const projectRoot = path.resolve(__dirname, "..");
const previewDirectory = path.join(projectRoot, "assets", "widget-preview");
const drawableDirectory = path.join(projectRoot, "android", "app", "src", "main", "res", "drawable");
const chrome = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

// 240 x 110dp rendered at 4x: the minimum Android picker footprint is 4 x 2.
const WIDTH = 960;
const HEIGHT = 440;
const colors = {
	surface: "#FFFFFF",
	surfaceSoft: "#F2F4F8",
	border: "#E2E8F0",
	text: "#1A1C20",
	muted: "#6E7A8A",
	accent: "#5B5FEF",
	transparent: "#00000000",
};

function verifyWidgetSourceContract() {
	const contracts = [
		[
			"src/widgets/SemesterGradesWidget.tsx",
			[
				'import { FlexWidget, ListWidget, TextWidget }',
				'`Notes · ${semesterLabel}`',
				'const latestGrades = summary?.latestGrades || [];',
				'text="DERNIÈRES NOTES"',
				'width: 70',
				'height: 24',
				'padding: 8',
				'borderRadius: 18',
				'width: 38',
			],
		],
		[
			"src/widgets/SemesterOverviewWidget.tsx",
			[
				'import { FlexWidget, ListWidget, TextWidget }',
				'const courses = upcomingCourses(payload, 8);',
				'text="Aperçu semestre"',
				'text="PROCHAINS COURS"',
				'width: 55',
				'height: 24',
				'padding: 8',
				'borderRadius: 18',
				"const timeColor = active ? accent : theme.textMuted;",
			],
		],
		[
			"android/app/src/main/res/xml/widgetprovider_semestergrades.xml",
			['android:minWidth="240dp"', 'android:targetCellHeight="2"', 'android:targetCellWidth="4"'],
		],
		[
			"android/app/src/main/res/xml/widgetprovider_semesteroverview.xml",
			['android:minWidth="240dp"', 'android:targetCellHeight="2"', 'android:targetCellWidth="4"'],
		],
		[
			"src/widgets/courseWidgetTheme.ts",
			["primaryContainer: hex(palette.accentSoft, hex(palette.surfaceSoft))", "rowMuted: hex(palette.surfaceSoft)"],
		],
		[
			"src/theme/palettes.ts",
			['surface: "#ffffff"', 'surfaceSoft: "#f2f4f8"', 'border: "#e2e8f0"', 'text: "#1a1c20"', 'muted: "#6e7a8a"', 'accent: "#5b5fef"'],
		],
	];

	for (const [relativePath, expectedFragments] of contracts) {
		const source = fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
		for (const fragment of expectedFragments) {
			if (!source.includes(fragment)) {
				throw new Error(`${relativePath} changed; update this preview generator before regenerating assets (missing: ${fragment}).`);
			}
		}
	}
}

function svgDocument(content) {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <title>EpiTime widget preview</title>
  <g font-family="Roboto, Arial, sans-serif">${content}</g>
</svg>\n`;
}

function text({ x, y, value, size, color, weight = "400", anchor = "start" }) {
	return `<text x="${x}" y="${y}" fill="${color}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}">${escapeXml(value)}</text>`;
}

function escapeXml(value) {
	return value.replace(/[<>&'"]/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[character]);
}

function refreshButton(x, y) {
	return `
  <rect x="${x}" y="${y}" width="128" height="128" rx="64" fill="${colors.surfaceSoft}" stroke="${colors.border}" stroke-width="4"/>
  <g transform="translate(${x + 28} ${y + 28}) scale(3)" fill="none" stroke="${colors.accent}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
    <path d="M3 3v5h5"/>
    <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
    <path d="M16 16h5v5"/>
  </g>`;
}

function root() {
	return `<rect width="${WIDTH}" height="${HEIGHT}" rx="72" fill="${colors.surface}"/>`;
}

function gradeRow(y, score, subject, label) {
	return `
  <rect x="348" y="${y + 12}" width="152" height="72" rx="24" fill="${colors.surfaceSoft}"/>
  ${text({ x: 424, y: y + 57, value: score, size: 32, color: colors.accent, weight: "700", anchor: "middle" })}
  ${text({ x: 520, y: y + 38, value: subject, size: 36, color: colors.text, weight: "700" })}
  ${text({ x: 520, y: y + 65, value: label, size: 28, color: colors.muted })}`;
}

function courseRow(y, { active, time, title, details }) {
	const accent = active ? colors.accent : colors.border;
	const timeColor = active ? colors.accent : colors.muted;
	return `
  ${active ? `<rect x="32" y="${y}" width="896" height="96" rx="28" fill="${colors.surfaceSoft}"/>` : ""}
  <rect x="36" y="${y + 16}" width="8" height="64" rx="8" fill="${accent}"/>
  ${text({ x: 60, y: y + 50, value: time, size: 32, color: timeColor, weight: "700" })}
  ${text({ x: 204, y: y + 38, value: title, size: 36, color: colors.text, weight: "700" })}
  ${text({ x: 204, y: y + 68, value: details, size: 28, color: colors.muted })}`;
}

function semesterGradesSvg() {
	return svgDocument(`
  ${root()}
  ${text({ x: 32, y: 84, value: "Notes · Semestre 6", size: 48, color: colors.text, weight: "700" })}
  ${refreshButton(800, 32)}
  <rect x="32" y="176" width="280" height="232" rx="48" fill="${colors.surfaceSoft}"/>
  <rect x="56" y="200" width="72" height="8" rx="4" fill="${colors.accent}"/>
  ${text({ x: 56, y: 236, value: "MOYENNE /20", size: 28, color: colors.muted, weight: "700" })}
  ${text({ x: 56, y: 350, value: "14,25", size: 76, color: colors.text, weight: "700" })}
  ${text({ x: 348, y: 208, value: "DERNIÈRES NOTES", size: 28, color: colors.muted, weight: "700" })}
  ${gradeRow(220, "16,5/20", "Algorithmique", "Évaluation finale")}
  ${gradeRow(324, "15/20", "Réseaux", "Contrôle continu")}
`, WIDTH, HEIGHT);
}

function semesterOverviewSvg() {
	return svgDocument(`
  ${root()}
  ${text({ x: 32, y: 64, value: "Semestre 6", size: 28, color: colors.muted, weight: "700" })}
  ${text({ x: 32, y: 108, value: "Aperçu semestre", size: 44, color: colors.text, weight: "700" })}
  <rect x="564" y="32" width="220" height="128" rx="36" fill="${colors.surfaceSoft}"/>
  ${text({ x: 584, y: 110, value: "14,25", size: 48, color: colors.text, weight: "700" })}
  ${text({ x: 712, y: 106, value: "/20", size: 24, color: colors.muted, weight: "700" })}
  ${refreshButton(800, 32)}
  ${text({ x: 36, y: 208, value: "PROCHAINS COURS", size: 28, color: colors.muted, weight: "700" })}
  ${courseRow(220, { active: true, time: "10:30", title: "Réseaux", details: "mar. 15 sept. · A 201" })}
  ${courseRow(324, { active: false, time: "14:00", title: "Projet", details: "mer. 16 sept. · Lab 3" })}
`, WIDTH, HEIGHT);
}

function rasterize(svgPath, pngPath) {
	if (!fs.existsSync(chrome)) throw new Error(`Chrome headless is required to rasterize the preview. Not found: ${chrome}`);
	const temporaryProfile = fs.mkdtempSync(path.join(os.tmpdir(), "epitime-widget-preview-"));
	try {
		childProcess.execFileSync(
			chrome,
			[
				"--headless=new",
				"--disable-gpu",
				"--hide-scrollbars",
				"--force-device-scale-factor=1",
				"--default-background-color=00000000",
				`--user-data-dir=${temporaryProfile}`,
				`--window-size=${WIDTH},${HEIGHT}`,
				`--screenshot=${pngPath}`,
				pathToFileURL(svgPath).href,
			],
			{ stdio: "inherit" },
		);
	} finally {
		fs.rmSync(temporaryProfile, { recursive: true, force: true });
	}
}

function writePreview(name, svg) {
	const svgPath = path.join(previewDirectory, `${name}.svg`);
	const pngPath = path.join(previewDirectory, `${name}.png`);
	const drawablePath = path.join(drawableDirectory, `${name}_preview.png`);
	fs.writeFileSync(svgPath, svg, "utf8");
	rasterize(svgPath, pngPath);
	fs.copyFileSync(pngPath, drawablePath);
	return { pngPath, drawablePath };
}

fs.mkdirSync(previewDirectory, { recursive: true });
fs.mkdirSync(drawableDirectory, { recursive: true });
verifyWidgetSourceContract();

for (const output of [writePreview("semestergrades", semesterGradesSvg()), writePreview("semesteroverview", semesterOverviewSvg())]) {
	process.stdout.write(`${output.pngPath}\n${output.drawablePath}\n`);
}
