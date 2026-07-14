"use strict";

const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const androidDirectory = path.join(projectRoot, "android");
const expoCli = path.join(projectRoot, "node_modules", "expo", "bin", "cli");
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

// Gradle settings invoke `node` directly. npm can launch this script even when
// node.exe's directory is absent from PATH, so expose the running Node runtime.
const nodeDirectory = path.dirname(process.execPath);
env.PATH = `${nodeDirectory}${path.delimiter}${env.PATH || ""}`;

if (!fs.existsSync(expoCli)) {
	throw new Error("Expo is not installed. Run npm ci before building the Android release.");
}

const configValidation = childProcess.spawnSync(process.execPath, [expoCli, "config", "--json"], {
	cwd: projectRoot,
	env,
	encoding: "utf8",
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
