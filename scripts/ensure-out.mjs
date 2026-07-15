import { existsSync } from "node:fs";
import { execSync } from "node:child_process";

if (!existsSync("out/player.html")) {
  console.log("Static export missing — running next build...");
  execSync("npm run build", { stdio: "inherit" });
}
