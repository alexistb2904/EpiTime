import test from "node:test";
import assert from "node:assert/strict";
import { isExamEvent } from "./courseType.js";

for (const [name, event, expected] of [
	["exam by id", { idType: 2 }, true],
	["exam by id as string", { idType: "2" }, true],
	["exam by type name", { typeName: "CourseType.Exam" }, true],
	["exam by fetched type", { idType: null, courseTypeName: "CourseType.Exam" }, true],
	["integrated lecture", { idType: 16, typeName: "CourseType.IntegratedLecture" }, false],
	["no type", {}, false],
	["no event", undefined, false],
]) {
	test(`exam detection: ${name}`, () => {
		assert.equal(isExamEvent(event), expected);
	});
}
