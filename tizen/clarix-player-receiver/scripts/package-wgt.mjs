import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const signingProfile = process.env.TIZEN_SIGNING_PROFILE;

if (!signingProfile) {
  console.error("Set TIZEN_SIGNING_PROFILE to a Samsung TV certificate profile created in Tizen Studio.");
  process.exit(2);
}

function run(command, args, cwd = projectDir) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.error?.code === "ENOENT") {
    console.error(`Cannot find '${command}'. Install Tizen Studio and add its tools/ide/bin directory to PATH.`);
    process.exit(2);
  }
  if (result.status !== 0) process.exit(result.status || 1);
}

run(process.execPath, ["scripts/configure.mjs"]);
run(process.execPath, ["--test", "test/receiver-core.test.js"]);
run("tizen", ["build-web", "--", projectDir]);

const buildDir = path.join(projectDir, ".buildResult");
run("tizen", ["package", "-t", "wgt", "-s", signingProfile, "--", buildDir]);

const packageName = fs.readdirSync(buildDir).find((name) => name.endsWith(".wgt"));
if (!packageName) {
  console.error("Tizen CLI completed without producing a .wgt package.");
  process.exit(1);
}

const distDir = path.join(projectDir, "dist");
fs.mkdirSync(distDir, { recursive: true });
const destination = path.join(distDir, "ClarixPlayerReceiver.wgt");
fs.copyFileSync(path.join(buildDir, packageName), destination);
console.log(`Created signed package: ${destination}`);
