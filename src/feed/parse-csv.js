function parseRows(source, delimiter) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];

    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        value += character;
      }
      continue;
    }

    if (character === '"' && value === "") {
      quoted = true;
    } else if (character === delimiter) {
      row.push(value);
      value = "";
    } else if (character === "\n") {
      row.push(value.endsWith("\r") ? value.slice(0, -1) : value);
      rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }

  if (quoted) throw new Error("Invalid CSV: unterminated quoted field.");
  if (value !== "" || row.length > 0) {
    row.push(value.endsWith("\r") ? value.slice(0, -1) : value);
    rows.push(row);
  }
  return rows;
}

export function parseCsvFeed(source, delimiter) {
  const rows = parseRows(source.replace(/^\uFEFF/, ""), delimiter).filter(
    (row) => row.some((value) => value.trim() !== ""),
  );
  if (rows.length === 0) throw new Error("CSV feed contains no rows.");

  const headers = rows[0].map((header) => header.trim());
  if (headers.some((header) => header === "")) throw new Error("CSV header contains an empty column name.");
  if (new Set(headers).size !== headers.length) throw new Error("CSV header contains duplicate column names.");

  return rows.slice(1).map((row, rowIndex) => {
    if (row.length !== headers.length) {
      throw new Error(`CSV row ${rowIndex + 2} has ${row.length} columns; expected ${headers.length}.`);
    }
    return Object.fromEntries(headers.map((header, index) => [header, row[index].trim()]));
  });
}
