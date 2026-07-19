import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv[2] === "build" ? "build" : "dev";
const outDir = resolve(projectRoot, "out");
const nextDir = resolve(projectRoot, ".next");
const debugPlayerDir = resolve(projectRoot, "src-tauri/target/debug/browser-player");

const listeningProcesses = (port) => {
  try {
    const output = execFileSync(
      "lsof",
      ["-nP", "-t", `-iTCP:${port}`, "-sTCP:LISTEN"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );

    return Array.from(new Set(output.trim().split(/\s+/).filter(Boolean))).map((pid) => {
      let command = "unknown process";
      try {
        command = execFileSync("ps", ["-p", pid, "-o", "command="], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        }).trim() || command;
      } catch {
        // The listener may have exited between lsof and ps.
      }
      return { pid, command };
    });
  } catch {
    return [];
  }
};

if (mode === "dev") {
  const occupiedPorts = [4200, 7420]
    .map((port) => ({ port, processes: listeningProcesses(port) }))
    .filter(({ processes }) => processes.length > 0);

  if (occupiedPorts.length > 0) {
    console.error("[tauri:dev] A previous development/controller process is still running:");
    for (const { port, processes } of occupiedPorts) {
      for (const { pid, command } of processes) {
        console.error(`  port ${port} · PID ${pid} · ${command}`);
      }
    }
    console.error(
      "[tauri:dev] Stop the previous `bun tauri dev` with Ctrl+C, then run `bun tauri dev` again.",
    );
    process.exit(1);
  }
}

const removeGenerated = (path) => {
  if (existsSync(path)) {
    rmSync(path, { recursive: true, force: true });
  }
};

console.log(`[tauri:${mode}] Clearing generated web output from the previous branch...`);
removeGenerated(nextDir);
removeGenerated(outDir);
// Tauri starts Cargo in parallel with beforeDevCommand and validates the
// configured resource path immediately. Keep the directory present while
// Next regenerates its contents so the two startup processes cannot race.
mkdirSync(outDir, { recursive: true });

if (mode === "dev") {
  removeGenerated(debugPlayerDir);
}

console.log(`[tauri:${mode}] Building the active branch with Bun...`);
const currentNodeOptions = process.env.NODE_OPTIONS?.trim() ?? "";
const buildNodeOptions = currentNodeOptions.includes("--max-old-space-size")
  ? currentNodeOptions
  : `${currentNodeOptions} --max-old-space-size=4096`.trim();
const build = spawnSync("bun", ["run", "build"], {
  cwd: projectRoot,
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_OPTIONS: buildNodeOptions,
  },
});

if (build.error) {
  throw build.error;
}

if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

const requiredExports = ["index.html", "player.html"];
const missingExports = requiredExports.filter((filename) => !existsSync(resolve(outDir, filename)));
if (missingExports.length > 0) {
  console.error(`[tauri:${mode}] Next export is incomplete. Missing: ${missingExports.join(", ")}`);
  process.exit(1);
}

const readGitValue = (args, fallback) => {
  try {
    return execFileSync("git", args, {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim() || fallback;
  } catch {
    return fallback;
  }
};

const buildInfo = {
  branch: readGitValue(["branch", "--show-current"], "detached"),
  commit: readGitValue(["rev-parse", "--short", "HEAD"], "unknown"),
  mode,
  builtAt: new Date().toISOString(),
};

writeFileSync(
  resolve(outDir, "build-info.json"),
  `${JSON.stringify(buildInfo, null, 2)}\n`,
  "utf8",
);

if (mode === "dev") {
  mkdirSync(debugPlayerDir, { recursive: true });
  cpSync(outDir, debugPlayerDir, { recursive: true });
}

console.log(
  `[tauri:${mode}] Ready: ${buildInfo.branch}@${buildInfo.commit} (${buildInfo.builtAt})`,
);
