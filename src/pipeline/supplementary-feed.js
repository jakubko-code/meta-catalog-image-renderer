import { rename, writeFile } from "node:fs/promises";

function csvValue(value) {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function createSupplementaryFeed(rows) {
  const lines = ["id,image_link"];
  for (const row of rows) lines.push(`${csvValue(row.id)},${csvValue(row.imageLink)}`);
  return `${lines.join("\r\n")}\r\n`;
}

export async function writeSupplementaryFeed(outputPath, rows) {
  const temporaryPath = `${outputPath}.tmp-${process.pid}`;
  await writeFile(temporaryPath, createSupplementaryFeed(rows), "utf8");
  await rename(temporaryPath, outputPath);
}
