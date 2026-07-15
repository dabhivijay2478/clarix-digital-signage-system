import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(projectDir, "dist");
const source = path.join(distDir, "MGEnterpriseReceiver.wgt");

if (!fs.existsSync(source)) {
  console.error("Missing dist/MGEnterpriseReceiver.wgt. Build or copy the signed widget there first.");
  process.exit(2);
}

const packageJson = JSON.parse(fs.readFileSync(path.join(projectDir, "package.json"), "utf8"));
const usbDir = path.join(distDir, "SSSP");
const widgetName = "MGEnterpriseReceiver";
const destination = path.join(usbDir, `${widgetName}.wgt`);

fs.rmSync(usbDir, { recursive: true, force: true });
fs.mkdirSync(usbDir, { recursive: true });
fs.copyFileSync(source, destination);

const size = fs.statSync(destination).size;
const manifest = `<?xml version="1.0" encoding="UTF-8"?>
<widget>
  <ver>${packageJson.version}</ver>
  <size>${size}</size>
  <widgetname>${widgetName}</widgetname>
  <webtype>tizen</webtype>
</widget>
`;

fs.writeFileSync(path.join(usbDir, "sssp_config.xml"), manifest, "utf8");
console.log(`USB deployment folder created: ${usbDir}`);
console.log(`Copy the SSSP folder itself to the root of a FAT32 USB flash drive.`);
