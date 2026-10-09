/**
 * CSV exports (05.2): UTF-8 with a byte-order mark (so Excel reads Marathi), CRLF line endings,
 * every cell quoted, and cells that a spreadsheet would run as a formula neutralised with a
 * leading apostrophe (06.4a).
 */

const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: string | number | null | undefined): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (FORMULA_START.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function toCsv(rows: readonly (readonly (string | number | null | undefined)[])[]): string {
  return `﻿${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
