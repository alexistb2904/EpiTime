export function normalizeVersion(version: string) {
	return version.trim().replace(/^v/i, "").split("+")[0].split("-")[0];
}

function parseVersion(version: string) {
	return normalizeVersion(version)
		.split(".")
		.map((part) => {
			const match = part.match(/^\d+/);
			return match ? Number(match[0]) : 0;
		});
}

export function compareVersions(left: string, right: string) {
	const a = parseVersion(left);
	const b = parseVersion(right);
	const length = Math.max(a.length, b.length);

	for (let index = 0; index < length; index += 1) {
		const delta = (a[index] || 0) - (b[index] || 0);
		if (delta > 0) return 1;
		if (delta < 0) return -1;
	}
	return 0;
}

export function isVersionNewer(candidate: string, current: string) {
	return compareVersions(candidate, current) > 0;
}
