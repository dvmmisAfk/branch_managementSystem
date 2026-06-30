/**
 * Regenerates prisma/branch-seed.json — 100 anonymized branches, 5 SFHs × 20, 5 states × 20.
 * Run: node scripts/generate-branch-seed.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, "..", "prisma", "branch-seed.json");

const TOTAL = 100;
const PER_GROUP = 20;

function pad3(n) {
  return String(n).padStart(3, "0");
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

const rows = [];
for (let n = 1; n <= TOTAL; n++) {
  const group = Math.ceil(n / PER_GROUP); // 1..5
  const p = pad3(n);
  rows.push({
    branch_code: `BR${p}`,
    sap_code: `SK${p}`,
    branch_name: `BRN-${p}`,
    location: `location-${p}`,
    city: `CITY-${p}`,
    state: `STATE-${pad2(group)}`,
    sfh_name: `SFH-${pad3(group)}`,
  });
}

fs.writeFileSync(outPath, `${JSON.stringify(rows, null, 2)}\n`);
console.log(`Wrote ${rows.length} branches to ${outPath}`);
