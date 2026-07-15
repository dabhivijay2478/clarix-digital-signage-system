import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceLogo = join(projectRoot, "logo.png");
const publicLogo = join(projectRoot, "public", "logo.png");
const tauriIcon = join(projectRoot, "src-tauri", "icons", "icon.png");

/** Logo fill ratio inside the square canvas (higher = bigger mark). */
const LOGO_SCALE = 0.92;
const RENDER_SIZE = 1024;

async function renderLogoSquare(size) {
  const logoSize = Math.round(size * LOGO_SCALE);
  const logo = await sharp(sourceLogo)
    .resize(logoSize, logoSize, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .flatten({ background: "#ffffff" })
    .toBuffer();

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toBuffer();
}

if (!existsSync(sourceLogo)) {
  console.error(`[icons] Missing source logo: ${sourceLogo}`);
  process.exit(1);
}

const master = await renderLogoSquare(RENDER_SIZE);
await sharp(master).toFile(publicLogo);
await sharp(master).resize(512, 512).toFile(tauriIcon);

console.log(`[icons] Wrote ${publicLogo}`);
console.log(`[icons] Wrote ${tauriIcon}`);

execFileSync("npx", ["tauri", "icon", tauriIcon], {
  cwd: projectRoot,
  stdio: "inherit",
});

console.log("[icons] Regenerated platform icons (icns, ico, ios, android, appx).");
