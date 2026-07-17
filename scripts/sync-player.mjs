import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(projectRoot, "out");
const debugPlayerDir = resolve(projectRoot, "src-tauri/target/debug/browser-player");

if (!existsSync(outDir)) {
  console.error("[sync-player] Missing Next export output. Run `npm run build` first.");
  process.exit(1);
}

rmSync(debugPlayerDir, { recursive: true, force: true });
mkdirSync(debugPlayerDir, { recursive: true });
cpSync(outDir, debugPlayerDir, { recursive: true });

console.log(`[sync-player] Copied ${outDir} -> ${debugPlayerDir}`);
