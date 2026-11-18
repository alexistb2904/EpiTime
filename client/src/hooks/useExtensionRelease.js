import { useEffect, useState } from "react";
import { extensionFallback, extensionReleasesUrl } from "../utils/downloadLinks";

const TAG_PATTERN = /^(\d+\.\d+\.\d+)-extension$/;
let pending;

const fetchLatest = () => {
	pending ??= fetch("https://api.github.com/repos/alexistb2904/EpiTime/releases?per_page=30")
		.then((response) => (response.ok ? response.json() : []))
		.then((releases) => {
			const match = releases.find((release) => !release.draft && TAG_PATTERN.test(release.tag_name));
			return match ? { version: match.tag_name.match(TAG_PATTERN)[1], url: `${extensionReleasesUrl}/tag/${match.tag_name}` } : extensionFallback;
		})
		.catch(() => extensionFallback);
	return pending;
};

export const useExtensionRelease = () => {
	const [release, setRelease] = useState(extensionFallback);
	useEffect(() => {
		fetchLatest().then(setRelease);
	}, []);
	return release;
};
