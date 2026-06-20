import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = new URL(".", import.meta.url).pathname;

const workbook = Workbook.create();
const sheet = workbook.worksheets.add("Truck Import");

const rows = [
  ["truck_number", "gate"],
  ["GJ-05-AB-2147", "d4"],
  ["GJ-05-CD-9081", "d5"],
  ["MH-12-KL-4410", "d4"],
  ["RJ-14-TC-3829", "d5"],
  ["GJ-01-ZZ-1024", "d4"],
  ["MP-09-TR-7602", "d5"],
  ["MH-04-HJ-3398", "d4"],
  ["GJ-18-RS-5521", "d5"],
];

sheet.showGridLines = false;
sheet.getRange(`A1:B${rows.length}`).values = rows;
sheet.getRange("A1:B1").format = {
  fill: "#111827",
  font: { bold: true, color: "#FFFFFF" },
};
sheet.getRange(`A2:B${rows.length}`).format = {
  borders: {
    insideHorizontal: { style: "thin", color: "#E5E7EB" },
  },
};
sheet.getRange(`A1:B${rows.length}`).format.borders = {
  outside: { style: "thin", color: "#9CA3AF" },
};
sheet.getRange("A:A").format.columnWidth = 24;
sheet.getRange("B:B").format.columnWidth = 12;
sheet.getRange("A1:B1").format.rowHeight = 26;
sheet.getRange(`A2:B${rows.length}`).format.rowHeight = 22;
sheet.getRange("B2:B100").dataValidation = {
  rule: { type: "list", values: ["d4", "d5"] },
};
sheet.freezePanes.freezeRows(1);

const values = await workbook.inspect({
  kind: "table",
  sheetId: "Truck Import",
  range: `A1:B${rows.length}`,
  include: "values",
  tableMaxRows: 12,
  tableMaxCols: 2,
});
console.log(values.ndjson);

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 50 },
  summary: "final formula error scan",
});
console.log(errors.ndjson);

const preview = await workbook.render({
  sheetName: "Truck Import",
  autoCrop: "all",
  scale: 1,
  format: "png",
});
await fs.writeFile(`${outputDir}/fake_truck_import_preview.png`, new Uint8Array(await preview.arrayBuffer()));

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(`${outputDir}/fake_truck_import.xlsx`);
