"use strict";

const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const androidDirectory = path.join(projectRoot, "android");
const gradleWrapper = process.platform === "win32" ? "gradlew.bat" : "./gradlew";
const fallbackJavaHome = "C:\\Program Files\\Android\\Android Studio\\jbr";
const env = { ...process.env, NODE_ENV: "production" };
const task = process.argv[2] || "assembleRelease";

if (!/^[A-Za-z][A-Za-z0-9:.-]*$/.test(task)) {
	throw new Error(`Invalid Gradle task: ${task}`);
}

if (!env.JAVA_HOME && process.platform === "win32" && fs.existsSync(fallbackJavaHome)) {
	env.JAVA_HOME = fallbackJavaHome;
}

if (env.JAVA_HOME) {
	const javaBin = path.join(env.JAVA_HOME, "bin");
	if (fs.existsSync(javaBin)) {
		env.PATH = `${javaBin}${path.delimiter}${env.PATH || ""}`;
	}
}

const configValidation = childProcess.spawnSync("npx", ["expo", "config", "--json"], {
	cwd: projectRoot,
	env,
	encoding: "utf8",
	shell: process.platform === "win32",
});
if (configValidation.status !== 0) {
	process.stderr.write(configValidation.stderr || configValidation.stdout || "Expo release configuration validation failed.\n");
	process.exit(configValidation.status ?? 1);
}

const result = childProcess.spawnSync(gradleWrapper, [task], {
	cwd: androidDirectory,
	env,
	stdio: "inherit",
	shell: process.platform === "win32",
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
