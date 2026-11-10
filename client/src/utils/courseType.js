const EXAM_TYPE_ID = 2;
const EXAM_TYPE_NAME = "CourseType.Exam";

export const isExamEvent = (event) => Number(event?.idType) === EXAM_TYPE_ID || event?.typeName === EXAM_TYPE_NAME || event?.courseTypeName === EXAM_TYPE_NAME;
