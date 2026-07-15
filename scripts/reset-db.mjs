import { existsSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const APP_IDENTIFIER = "com.clarix.app";

function resolveAppDataDir() {
  const home = homedir();
  switch (process.platform) {
    case "darwin":
      return join(home, "Library", "Application Support", APP_IDENTIFIER);
    case "win32": {
      const appData = process.env.APPDATA;
      if (!appData) {
        throw new Error("APPDATA is not set on this Windows machine.");
      }
      return join(appData, APP_IDENTIFIER);
    }
    default:
      return join(home, ".local", "share", APP_IDENTIFIER);
  }
}

const appDataDir = resolveAppDataDir();

console.log("[db:reset] Quit MG Enterprise / Clarix before running this script.");
console.log(`[db:reset] Target: ${appDataDir}`);

if (!existsSync(appDataDir)) {
  console.log("[db:reset] Nothing to delete — app data folder does not exist yet.");
  process.exit(0);
}

try {
  rmSync(appDataDir, { recursive: true, force: true });
  console.log("[db:reset] Deleted app data folder.");
  console.log("[db:reset] Launch the app again for a fresh empty database (seeded admin only).");
} catch (error) {
  console.error("[db:reset] Failed to delete app data folder.");
  console.error(error instanceof Error ? error.message : error);
  console.error("[db:reset] Make sure the app is fully quit, then retry.");
  process.exit(1);
}
