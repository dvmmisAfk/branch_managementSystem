import fs from "fs";
import readline from "readline";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const rtfPath = path.join(repoRoot, "Prompt.rtf");
const outPath = path.join(__dirname, "..", "prisma", "branch-seed.json");

function parseRow(line) {
  if (!line.includes("\\pard\\intbl") || !line.includes("\\cell\\row")) return null;
  let rest = line.slice(line.indexOf("\\pard\\intbl"));
  rest = rest.replace(/^\\pard\\intbl(?:\\b0)?\s*/, "");
  const parts = rest.split("\\cell");
  if (parts.length < 6) return null;
  const branchCode = parts[0].trim();
  if (!branchCode || branchCode.includes("Branch Code") || branchCode.includes("SAP")) return null;
  const sfh = parts[5].trim().replace(/\\row.*$/s, "");
  return {
    branch_code: branchCode,
    sap_code: parts[1].trim(),
    location: parts[2].trim(),
    city: parts[3].trim(),
    state: parts[4].trim(),
    sfh_name: sfh.replace(/\\.*$/, "").trim(),
  };
}

async function main() {
  const rl = readline.createInterface({
    input: fs.createReadStream(rtfPath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  const rows = [];
  for await (const line of rl) {
    const r = parseRow(line);
    if (r) rows.push(r);
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(rows, null, 2), "utf8");
  const sfhs = [...new Set(rows.map((x) => x.sfh_name))].sort();
  console.log(`Wrote ${rows.length} branches to ${outPath}`);
  console.log("SFH names:", sfhs.join(", "));
}

main().catch(console.error);
