/**
 * CSV exports (05.2): UTF-8 with a byte-order mark (so Excel reads Marathi), CRLF line endings,
 * every cell quoted, and cells that a spreadsheet would run as a formula neutralised with a
 * leading apostrophe (06.4a). Numbers, negative ones included, are kept as they are.
 */

const FORMULA_START = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^-?\d+(\.\d+)?%?$/;

export function csvCell(value: string | number | null | undefined): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (typeof value !== "number" && FORMULA_START.test(text) && !PLAIN_NUMBER.test(text)) {
    text = `'${text}`;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

export function toCsv(rows: readonly (readonly (string | number | null | undefined)[])[]): string {
  return `﻿${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

/** `part` as a percentage of `whole`, to one decimal; 0 when there is nothing to divide by. */
export function percent(part: number, whole: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return 0;
  return Math.round((part / whole) * 1000) / 10;
}
