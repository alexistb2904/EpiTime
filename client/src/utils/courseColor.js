// Une teinte de papier par matière ; la plage 85–135 (jaune-vert) reste au surligneur.
const COURSE_HUES = [18, 42, 64, 150, 170, 192, 216, 242, 268, 294, 320, 344];

export const courseHue = (name = "") => {
	let hash = 0;
	for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
	return COURSE_HUES[Math.abs(hash) % COURSE_HUES.length];
};
