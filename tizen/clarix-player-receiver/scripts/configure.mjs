import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function update(fileName, transform) {
  const filePath = path.join(projectDir, fileName);
  const before = fs.readFileSync(filePath, "utf8");
  const after = transform(before);
  if (after === before) return;
  fs.writeFileSync(filePath, after);
}

update("config.xml", (value) => value
  .replace(/<access origin="[^"]+" subdomains="[^"]+"\s*\/>/, `<access origin="*" subdomains="true"/>`)
  .replace(/<tizen:allow-navigation>[^<]+<\/tizen:allow-navigation>/, `<tizen:allow-navigation>http://*/*</tizen:allow-navigation>`));

update("index.html", (value) => value.replace(
  /connect-src [^;]+; frame-src [^;]+;/,
  `connect-src 'self' http:; frame-src http:;`
));

console.log("Receiver uses runtime controller IP entry; no receiver-config.json is required.");
