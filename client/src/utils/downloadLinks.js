export const androidAppDownloadUrl =
	import.meta.env.VITE_ANDROID_APK_URL || "https://github.com/alexistb2904/EpiTime/releases";

export const iosAppDownloadUrl = "https://apps.apple.com/fr/app/epitime/id6822687222";

export const extensionReleasesUrl = "https://github.com/alexistb2904/EpiTime/releases";
export const extensionFallback = {
	version: "0.1.0",
	url: `${extensionReleasesUrl}/tag/0.1.0-extension`,
};
