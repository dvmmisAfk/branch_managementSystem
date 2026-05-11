/** Corporate export palette (aligned with app indigo / slate). */
export const XL = {
  brandFill: "FF1e1b4b",
  brandText: "FFFFFFFF",
  headerFill: "FF312e81",
  headerText: "FFFFFFFF",
  sectionFill: "FFe0e7ff",
  sectionText: "FF1e1b4b",
  metaText: "FF64748b",
  border: "FFcbd5e1",
  zebraA: "FFFFFFFF",
  zebraB: "FFf8fafc",
  labelStrong: "FF0f172a",
} as const;

export const PRODUCT_NAME = "Branch Visit Tracker";

export function generatedAtLabel(): string {
  return `Generated: ${new Date().toISOString().replace("T", " ").slice(0, 19)} UTC`;
}
