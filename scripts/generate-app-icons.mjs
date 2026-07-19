import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceLogo = join(projectRoot, "logo.png");
const tauriIcon = join(projectRoot, "src-tauri", "icons", "icon.png");

/** Matches sidebar logo scale (1.65) so the dock/taskbar mark fills the tile. */
const APP_ICON_SCALE = 1.65;
const RENDER_SIZE = 1024;

async function renderAppIcon(size) {
  const logoSize = Math.round(size * APP_ICON_SCALE);
  const logo = sharp(sourceLogo)
    .resize(logoSize, logoSize, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .flatten({ background: "#ffffff" });

  if (logoSize > size) {
    const offset = Math.floor((logoSize - size) / 2);
    return logo
      .extract({ left: offset, top: offset, width: size, height: size })
      .png()
      .toBuffer();
  }

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite([{ input: await logo.toBuffer(), gravity: "center" }])
    .png()
    .toBuffer();
}

if (!existsSync(sourceLogo)) {
  console.error(`[icons] Missing source logo: ${sourceLogo}`);
  process.exit(1);
}

const master = await renderAppIcon(RENDER_SIZE);
await sharp(master).resize(512, 512).toFile(tauriIcon);

console.log(`[icons] Wrote ${tauriIcon} (scale ${APP_ICON_SCALE})`);

execFileSync("npx", ["tauri", "icon", tauriIcon], {
  cwd: projectRoot,
  stdio: "inherit",
});

console.log("[icons] Regenerated platform app icons (icns, ico, ios, android, appx).");
