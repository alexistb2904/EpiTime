export const isIOSDevice = ({ userAgent, maxTouchPoints, platform }) =>
	/iPad|iPhone|iPod/i.test(userAgent) ||
	(maxTouchPoints > 1 && /MacIntel/.test(platform));
