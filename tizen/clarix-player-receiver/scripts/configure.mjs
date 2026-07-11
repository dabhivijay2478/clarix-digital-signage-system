import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { normalizeConfig } = require(path.join(projectDir, "js/receiver-core.js"));
const source = JSON.parse(fs.readFileSync(path.join(projectDir, "receiver-config.json"), "utf8"));
const config = normalizeConfig(source);

function update(fileName, transform) {
  const filePath = path.join(projectDir, fileName);
  const before = fs.readFileSync(filePath, "utf8");
  const after = transform(before);
  if (after === before) return;
  fs.writeFileSync(filePath, after);
}

update("config.xml", (value) => value
  .replace(/<access origin="[^"]+" subdomains="false"\/>/, `<access origin="${config.origin}" subdomains="false"/>`)
  .replace(/<tizen:allow-navigation>[^<]+<\/tizen:allow-navigation>/, `<tizen:allow-navigation>${config.origin}/*</tizen:allow-navigation>`));

update("index.html", (value) => value.replace(
  /connect-src [^;]+; frame-src [^;]+;/,
  `connect-src ${config.origin}; frame-src ${config.origin};`
));

console.log(`Receiver locked to ${config.playerUrl}`);
