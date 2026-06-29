import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, "..");
const prodEnv = path.join(backendRoot, ".env.production.local");

if (!fs.existsSync(prodEnv)) {
  console.error(
    "[reseed-production] Missing backend/.env.production.local\n" +
      "  Copy backend/.env.production.local.example → backend/.env.production.local\n" +
      "  Fill Supabase DATABASE_URL + Render VAULT_SECRET, then run again.",
  );
  process.exit(1);
}

process.env.RESEED_CONFIRM = "WIPE_AND_RESEED";

const cmd = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(cmd, ["tsx", "scripts/reseed-synthetic-data.ts"], {
  cwd: backendRoot,
  stdio: "inherit",
  env: process.env,
});

process.exit(result.status ?? 1);
