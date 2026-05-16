/** Prevent Excel formula injection when writing user-supplied text to cells. */
export function sanitizeExcelCellValue(value: string | number | null | undefined): string | number {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return value;
  const s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) return `'${s}`;
  return s;
}
