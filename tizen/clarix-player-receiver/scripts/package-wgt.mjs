import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stagingRoot = path.join(projectDir, ".tizen-build");
const buildDir = path.join(stagingRoot, "build");
const signingProfile = process.env.TIZEN_SIGNING_PROFILE;
const isWindows = process.platform === "win32";
const tizenCli = process.env.TIZEN_CLI || "tizen";
const appEntries = [
  "config.xml",
  "css",
  "icon.png",
  "index.html",
  "js",
  "logo.png"
];

if (!signingProfile) {
  console.error("Set TIZEN_SIGNING_PROFILE to a Samsung TV certificate profile created in Tizen Studio.");
  process.exit(2);
}

if (!/^[a-z0-9._ -]+$/i.test(signingProfile)) {
  console.error("TIZEN_SIGNING_PROFILE contains unsupported characters.");
  process.exit(2);
}

function quoteWindowsShellArg(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`;
}

function run(command, args, cwd = projectDir, useWindowsShell = false) {
  const commandLine = isWindows && useWindowsShell
    ? [command, ...args.map(quoteWindowsShellArg)].join(" ")
    : command;
  const result = spawnSync(commandLine, isWindows && useWindowsShell ? [] : args, {
    cwd,
    stdio: "inherit",
    shell: isWindows && useWindowsShell
  });
  if (result.error?.code === "ENOENT") {
    console.error(`Cannot find '${command}'. Add Tizen Studio tools/ide/bin to PATH or set TIZEN_CLI to the full tizen.bat path.`);
    process.exit(2);
  }
  if (result.status !== 0) process.exit(result.status || 1);
}

function stageApp() {
  fs.rmSync(stagingRoot, { recursive: true, force: true });
  fs.mkdirSync(buildDir, { recursive: true });
  for (const entry of appEntries) {
    const source = path.join(projectDir, entry);
    const destination = path.join(buildDir, entry);
    fs.cpSync(source, destination, { recursive: true });
  }
}

run(process.execPath, ["--test", "test/receiver-core.test.js"]);
stageApp();
run(tizenCli, ["package", "-t", "wgt", "-s", signingProfile, "--", buildDir], projectDir, true);

const packageName = fs.readdirSync(buildDir).find((name) => name.endsWith(".wgt"));
if (!packageName) {
  console.error("Tizen CLI completed without producing a .wgt package.");
  process.exit(1);
}

const distDir = path.join(projectDir, "dist");
fs.mkdirSync(distDir, { recursive: true });
const destination = path.join(distDir, "MGEnterpriseReceiver.wgt");
fs.copyFileSync(path.join(buildDir, packageName), destination);
console.log(`Created signed package: ${destination}`);
run(process.execPath, ["scripts/prepare-usb.mjs"]);
