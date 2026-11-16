import { defineConfig } from "wxt";
import { DEV_ORIGINS, PROD_ORIGINS } from "./src/origins";

export default defineConfig({
	modules: ["@wxt-dev/module-react"],
	srcDir: ".",
	manifestVersion: 3,
	manifest: ({ browser }) => ({
		name: "EpiTime",
		description: "Ton prochain cours en un clic, des rappels avant chaque cours, les changements de planning et des notes par cours.",

		permissions: ["storage", "alarms", "notifications"],

		host_permissions: PROD_ORIGINS.map((origin) => `${origin}/*`),
		action: { default_title: "EpiTime" },
		...(browser === "firefox"
			? {
					browser_specific_settings: {
						gecko: {
							id: "extension@epitime.epita.it",

							strict_min_version: "140.0",

							data_collection_permissions: { required: ["authenticationInfo"] },
						},
						gecko_android: { strict_min_version: "142.0" },
					},
				}
			: {}),
	}),
	hooks: {
		"build:manifestGenerated": (wxt, manifest) => {
			if (wxt.config.mode !== "development") return;
			const dev = DEV_ORIGINS.map((origin) => `${origin}/*`);
			manifest.host_permissions = [...(manifest.host_permissions ?? []), ...dev];
			for (const script of manifest.content_scripts ?? []) script.matches = [...(script.matches ?? []), ...dev];
		},
	},

	zip: {
		sourcesRoot: "..",
		includeSources: [
			"extension/**",
			"shared/src/**",
			"shared/package.json",
			"client/src/App.css",
			"client/src/components/Calendar.css",
			"client/src/components/notes/Notes.css",
		],
		excludeSources: ["**/node_modules/**", "extension/.output/**"],
	},
	vite: () => ({
		server: { fs: { allow: [".", "../shared", "../client/src"] } },
	}),
});
