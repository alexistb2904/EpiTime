import { cleanHtml, extractSubjectCode, type AurigaExam, type AurigaGrade, type AurigaSyllabus } from "./aurigaTypes";
import { getSubjectCoefficientOverride, getSubjectCoefficientOverrideKey, type SubjectCoefficientOverrides } from "./gradeCoefficientOverrides";
import type { GradeOverrides } from "./gradeOverrides";
import type { ManualGrade } from "./manualGrades";

export type GradeScore = {
	value: number;
	outOf?: number;
	status?: string;
	disabled?: boolean;
};

export type DisplayGrade = {
	id: string;
	subjectId: string;
	subjectName: string;
	description: string;
	givenAt?: Date;
	syncedAt?: number;
	studentScore?: GradeScore;
	outOf: GradeScore;
	coefficient: number;
	alphaMark?: string;
	rawCode: string;
	isSAE?: boolean;
	isManual?: boolean;
	manualId?: string;
	examId?: number;
	examType?: string;
	examIndex?: number;
	syllabusId?: number;
	overrideKey?: string;
	coefficientOverridden?: boolean;
};

export type DisplaySubject = {
	id: string;
	name: string;
	ueCode: string;
	studentAverage: GradeScore;
	outOf: GradeScore;
	grades: DisplayGrade[];
	syllabus?: AurigaSyllabus;
	isValidationOnly?: boolean;
	hasNonValidated?: boolean;
	syllabusCoeff?: number;
	baseSyllabusCoeff?: number;
	coefficientKey: string;
	coefficientOverridden?: boolean;
	hasManualGrades?: boolean;
};

export type DisplayUE = {
	id: string;
	name: string;
	studentAverage: GradeScore;
	outOf: GradeScore;
	subjects: DisplaySubject[];
	isValidationOnly?: boolean;
	hasNonValidated?: boolean;
	hasManualGrades?: boolean;
};

export type GradesPeriod = {
	id: string;
	name: string;
	semester: number;
	overallAverage: GradeScore;
	ues: DisplayUE[];
	hasManualGrades?: boolean;
};

export const UE_NAMES: Record<string, string> = {
	PR: "Produire",
	AG: "Agir",
	CN: "Concevoir",
	PROJET: "Projet",
	PL: "Piloter",
	SH: "Sciences Humaines",
	STOUV: "Stage Ouvrier",
	CDSF: "Cahier des Spécifications Fonctionnel",
	MIF: "Mathématiques et Informatique Fondamentales",
	MIA: "Mathématiques et Informatique Avancées",
	LANGAGES: "Ingénierie des Sciences du Numériques - LANGAGES",
	BASES: "Ingénierie des Sciences du Numériques - BASES",
	CYBER: "Cybersécurité",
	SHSJC: "Sciences Humaines, Sociales, Juridiques et de Communication",
	ENT: "Rapport de stage",
};

export const DEFAULT_EXAM_TYPES = ["EXA", "EXF", "EXP", "EXB", "EXR", "RAT", "CC", "CB", "CT", "CONT", "DS", "DM", "QCM", "ORAL", "TP", "TPNOTE"];

type SubjectAccumulator = {
	id: string;
	name: string;
	ueCode: string;
	syllabus?: AurigaSyllabus;
	grades: DisplayGrade[];
	hasNonValidated: boolean;
};

export type BuildGradesOptions = {
	useWeightedAverages?: boolean;
	manualGrades?: ManualGrade[];
	subjectCoefficientOverrides?: SubjectCoefficientOverrides;
	gradeOverrides?: GradeOverrides;
};

export function splitEcueAndExam(fullCode: string, knownExamTypes = new Set(DEFAULT_EXAM_TYPES)) {
	const parts = fullCode.split("_");
	const compactMatch = fullCode.match(/^(.*)_(EXA|EXF|EXP|EXB|EXR|EX|EXAM|TPNOTE|TP|CC|CB|CT|CONT|DS|DM|QCM|ORAL|RAT)_?(\d+)?$/i);
	if (compactMatch?.[1]) {
		return { ecueCode: compactMatch[1], examPart: [compactMatch[2].toUpperCase(), compactMatch[3]].filter(Boolean).join("_") };
	}

	if (parts.length >= 3 && /^\d+$/.test(parts[parts.length - 1]) && knownExamTypes.has(parts[parts.length - 2])) {
		return {
			ecueCode: parts.slice(0, -2).join("_"),
			examPart: parts.slice(-2).join("_"),
		};
	}

	if (parts.length >= 2 && knownExamTypes.has(parts[parts.length - 1])) {
		return {
			ecueCode: parts.slice(0, -1).join("_"),
			examPart: parts[parts.length - 1],
		};
	}

	return { ecueCode: fullCode, examPart: "" };
}

function findSyllabusForGrade(gradeFullCode: string, syllabusList: AurigaSyllabus[]) {
	return syllabusList.find((syllabus) => {
		const syllabusCode = extractSubjectCode(syllabus.name);
		return gradeFullCode.startsWith(`${syllabusCode}_`) || gradeFullCode === syllabusCode;
	});
}

function examFamily(value?: string) {
	const normalized = String(value || "")
		.toUpperCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^A-Z0-9]+/g, " ");
	if (/\bTP\b|TRAVAUX? PRATIQUES?/.test(normalized)) return "TP";
	if (/\bEX[A-Z]*\b|\bEXAMEN\b|\bECRIT\b|PAPIER/.test(normalized)) return "EX";
	return normalized.trim();
}

/** Returns an exam only when the raw Auriga code points to one unambiguously. */
function findExam(syllabus: AurigaSyllabus | undefined, examPart: string): AurigaExam | undefined {
	if (!syllabus || !examPart) return undefined;
	const [type, indexRaw] = examPart.split("_");
	const family = examFamily(type);
	const typeMatches = syllabus.exams.filter((exam) => exam.type === type || examFamily(exam.type) === family || examFamily(exam.typeName) === family);
	if (!typeMatches.length) return undefined;
	const index = Number(indexRaw);
	if (Number.isFinite(index)) {
		const indexed = typeMatches.filter((exam) => exam.index === index);
		return indexed.length === 1 ? indexed[0] : undefined;
	}
	return typeMatches.length === 1 ? typeMatches[0] : undefined;
}

function escapeRegExp(value: string) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function describeExam(exam: AurigaExam | undefined, examPart: string) {
	const description = cleanHtml(exam?.description?.fr);
	if (description && exam?.typeName) return `${exam.typeName} - ${description}`;
	if (description) return description;
	if (exam?.typeName) return exam.typeName;
	return examPart ? examPart.replace(/_/g, " ") : "Evaluation";
}

function scoreForGrade(grade: AurigaGrade): GradeScore | undefined {
	if (grade.alphaMark) {
		return {
			value: 0,
			status: grade.alphaMark === "VA" ? "Val." : grade.alphaMark === "NV" ? "N.Val." : grade.alphaMark,
			disabled: true,
		};
	}
	return { value: grade.grade, outOf: 20 };
}

function gradeCoefficient(grade: AurigaGrade, exam: AurigaExam | undefined) {
	if (typeof grade.coefficient === "number") return grade.coefficient / 100;
	if (typeof exam?.weighting === "number") return exam.weighting / 100;
	return 1;
}

function rattrapageKey(grade: DisplayGrade) {
	return grade.rawCode.replace(/_EX[AF](_\d+)?$/i, "_EXAM$1");
}

function isRattrapage(grade: DisplayGrade) {
	return /_EXF(?:_|$)/i.test(grade.rawCode) || grade.description.toLowerCase().includes("rattrapage");
}

function isExam(grade: DisplayGrade) {
	return /_EXA(?:_|$)/i.test(grade.rawCode) || grade.description.toLowerCase().includes("examen");
}

function numericAverage(grades: DisplayGrade[], useWeightedAverages: boolean) {
	const eligible = grades.filter((grade) => grade.studentScore?.outOf && !grade.isSAE);
	const byKey = new Map<string, DisplayGrade[]>();

	for (const grade of eligible) {
		const key = isExam(grade) || isRattrapage(grade) ? rattrapageKey(grade) : grade.id;
		const group = byKey.get(key) || [];
		group.push(grade);
		byKey.set(key, group);
	}

	let sum = 0;
	let coeffSum = 0;
	for (const group of byKey.values()) {
		const best = group.reduce((candidate, grade) => {
			const currentScore = grade.studentScore?.value ?? -Infinity;
			const candidateScore = candidate.studentScore?.value ?? -Infinity;
			return currentScore > candidateScore ? grade : candidate;
		}, group[0]);
		if (!best?.studentScore?.outOf) continue;
		const coefficient = useWeightedAverages && best.coefficient > 0 ? best.coefficient : 1;
		sum += best.studentScore.value * coefficient;
		coeffSum += coefficient;
	}

	if (!coeffSum) return null;
	return sum / coeffSum;
}

function makeValidationScore(hasNonValidated: boolean): GradeScore {
	return { value: 0, status: hasNonValidated ? "N.Val." : "Val.", disabled: true };
}

function buildSubject(acc: SubjectAccumulator, useWeightedAverages: boolean, subjectCoefficientOverrides: SubjectCoefficientOverrides): DisplaySubject {
	const average = numericAverage(acc.grades, useWeightedAverages);
	const validationOnly = average === null;
	const coefficientReference = { syllabusId: acc.syllabus?.id, subjectId: acc.id };
	const coefficientOverride = getSubjectCoefficientOverride(coefficientReference, subjectCoefficientOverrides);
	const coefficientKey = getSubjectCoefficientOverrideKey(coefficientReference) || `subject:${acc.id}`;
	return {
		id: acc.id,
		name: acc.name,
		ueCode: acc.ueCode,
		grades: acc.grades,
		syllabus: acc.syllabus,
		syllabusCoeff: coefficientOverride ?? acc.syllabus?.coeff,
		baseSyllabusCoeff: acc.syllabus?.coeff,
		coefficientKey,
		coefficientOverridden: coefficientOverride !== undefined,
		hasNonValidated: acc.hasNonValidated,
		hasManualGrades: acc.grades.some((grade) => grade.isManual),
		isValidationOnly: validationOnly,
		studentAverage: validationOnly ? makeValidationScore(acc.hasNonValidated) : { value: average, outOf: 20 },
		outOf: { value: 20 },
	};
}

function buildUE(ueCode: string, subjects: DisplaySubject[], useWeightedAverages: boolean): DisplayUE {
	const numericSubjects = subjects.filter((subject) => !subject.isValidationOnly && subject.studentAverage.outOf);
	const hasNonValidated = subjects.some((subject) => subject.hasNonValidated);
	const isValidationOnly = numericSubjects.length === 0;
	let value = 0;
	if (!isValidationOnly) {
		let sum = 0;
		let coeffSum = 0;
		for (const subject of numericSubjects) {
			const coeff = useWeightedAverages ? subject.syllabusCoeff || 1 : 1;
			sum += subject.studentAverage.value * coeff;
			coeffSum += coeff;
		}
		value = coeffSum ? sum / coeffSum : 0;
	}
	return {
		id: ueCode,
		name: UE_NAMES[ueCode] || ueCode,
		subjects,
		hasNonValidated,
		hasManualGrades: subjects.some((subject) => subject.hasManualGrades),
		isValidationOnly,
		studentAverage: isValidationOnly ? makeValidationScore(hasNonValidated) : { value, outOf: 20 },
		outOf: { value: 20 },
	};
}

function addManualGradeToMap(manualGrade: ManualGrade, syllabusList: AurigaSyllabus[], bySemester: Map<number, Map<string, SubjectAccumulator>>) {
	const matchingSyllabus = syllabusList.find((syllabus) => syllabus.id === manualGrade.syllabusId || extractSubjectCode(syllabus.name) === manualGrade.subjectCode);
	const semester = matchingSyllabus?.semester || Number(manualGrade.subjectId.split("-")[0]) || 0;
	const ecueCode = manualGrade.subjectCode;
	const ueCode = ecueCode.split("_")[0] || "OTHER";
	const semesterSubjects = bySemester.get(semester) || new Map<string, SubjectAccumulator>();
	const subject =
		semesterSubjects.get(ecueCode) ||
		({
			id: `${semester}-${ecueCode}`,
			name: matchingSyllabus?.caption?.name || matchingSyllabus?.name || ecueCode,
			ueCode,
			syllabus: matchingSyllabus,
			grades: [],
			hasNonValidated: false,
		} satisfies SubjectAccumulator);
	subject.grades.push({
		id: manualGrade.id,
		subjectId: subject.id,
		subjectName: subject.name,
		description: manualGrade.description,
		syncedAt: manualGrade.createdAt,
		studentScore: { value: manualGrade.grade, outOf: 20 },
		outOf: { value: 20 },
		coefficient: manualGrade.coefficient || 1,
		rawCode: `${ecueCode}_${manualGrade.examType || "MANUAL"}${manualGrade.examIndex ? `_${manualGrade.examIndex}` : ""}`,
		isManual: true,
		manualId: manualGrade.id,
		examId: manualGrade.examId,
	});
	semesterSubjects.set(ecueCode, subject);
	bySemester.set(semester, semesterSubjects);
}

export function buildGradesPeriods(grades: AurigaGrade[], syllabusList: AurigaSyllabus[], options: BuildGradesOptions = {}): GradesPeriod[] {
	const useWeightedAverages = options.useWeightedAverages !== false;
	const subjectCoefficientOverrides = options.subjectCoefficientOverrides || {};
	const gradeOverrides = options.gradeOverrides || {};
	const bySemester = new Map<number, Map<string, SubjectAccumulator>>();

	for (const grade of grades) {
		const gradeFullCode = extractSubjectCode(grade.name);
		const matchingSyllabus = findSyllabusForGrade(gradeFullCode, syllabusList);
		const split = splitEcueAndExam(gradeFullCode);
		const ecueCode = matchingSyllabus ? extractSubjectCode(matchingSyllabus.name) : split.ecueCode;
		const examPart = matchingSyllabus ? gradeFullCode.replace(new RegExp(`^${escapeRegExp(ecueCode)}_?`), "") || split.examPart : split.examPart;
		const ueCode = ecueCode.split("_")[0] || "OTHER";
		const subjectName = matchingSyllabus?.caption?.name || matchingSyllabus?.name || ecueCode;
		const semester = grade.semester || matchingSyllabus?.semester || 0;
		const semesterSubjects = bySemester.get(semester) || new Map<string, SubjectAccumulator>();
		const subject =
			semesterSubjects.get(ecueCode) ||
			({
				id: `${semester}-${ecueCode}`,
				name: subjectName,
				ueCode,
				syllabus: matchingSyllabus,
				grades: [],
				hasNonValidated: false,
			} satisfies SubjectAccumulator);
		const score = scoreForGrade(grade);
		const rawCode = gradeFullCode;
		const overrideKey = `raw:${rawCode}:${subject.grades.length}`;
		const override = gradeOverrides[overrideKey];
		const autoExam = findExam(matchingSyllabus, examPart);
		const exam = override?.examId === undefined ? autoExam : override.examId === null ? undefined : matchingSyllabus?.exams.find((item) => item.id === override.examId);
		const displayGrade: DisplayGrade = {
			id: `${rawCode}-${subject.grades.length}`,
			subjectId: subject.id,
			subjectName,
			description: describeExam(exam, examPart),
			syncedAt: grade.syncedAt,
			studentScore: score,
			outOf: { value: 20 },
			coefficient: override?.coefficient ?? (override?.examId === null ? 1 : override?.examId !== undefined ? gradeCoefficient({ ...grade, coefficient: undefined }, exam) : gradeCoefficient(grade, exam)),
			alphaMark: grade.alphaMark,
			rawCode,
			isSAE: /(^|_)SAE(_|$)/i.test(rawCode),
			examId: exam?.id,
			examType: exam?.typeName || exam?.type,
			examIndex: exam?.index,
			syllabusId: matchingSyllabus?.id,
			overrideKey,
			coefficientOverridden: override?.coefficient !== undefined,
		};
		if (grade.alphaMark === "NV") subject.hasNonValidated = true;
		subject.grades.push(displayGrade);
		semesterSubjects.set(ecueCode, subject);
		bySemester.set(semester, semesterSubjects);
	}

	for (const manualGrade of options.manualGrades || []) addManualGradeToMap(manualGrade, syllabusList, bySemester);

	return Array.from(bySemester.entries())
		.sort(([a], [b]) => a - b)
		.map(([semester, subjectsMap]) => {
			const subjects = Array.from(subjectsMap.values()).map((subject) => buildSubject(subject, useWeightedAverages, subjectCoefficientOverrides));
			const ueMap = new Map<string, DisplaySubject[]>();
			for (const subject of subjects) {
				const ueSubjects = ueMap.get(subject.ueCode) || [];
				ueSubjects.push(subject);
				ueMap.set(subject.ueCode, ueSubjects);
			}
			const ues = Array.from(ueMap.entries())
				.map(([ueCode, ueSubjects]) => buildUE(ueCode, ueSubjects.sort((a, b) => a.name.localeCompare(b.name, "fr")), useWeightedAverages))
				.sort((a, b) => a.name.localeCompare(b.name, "fr"));
			const numericUes = ues.filter((ue) => !ue.isValidationOnly && ue.studentAverage.outOf);
			let overallValue = 0;
			if (numericUes.length) {
				let sum = 0;
				let coeffSum = 0;
				for (const ue of numericUes) {
					const coeff = useWeightedAverages ? ue.subjects.reduce((total, subject) => total + (subject.syllabusCoeff || 1), 0) || 1 : 1;
					sum += ue.studentAverage.value * coeff;
					coeffSum += coeff;
				}
				overallValue = coeffSum ? sum / coeffSum : 0;
			}
			return {
				id: `semester-${semester}`,
				name: semester ? `Semestre ${semester}` : "Sans semestre",
				semester,
				overallAverage: numericUes.length ? { value: overallValue, outOf: 20 } : makeValidationScore(ues.some((ue) => ue.hasNonValidated)),
				ues,
				hasManualGrades: ues.some((ue) => ue.hasManualGrades),
			};
		});
}
