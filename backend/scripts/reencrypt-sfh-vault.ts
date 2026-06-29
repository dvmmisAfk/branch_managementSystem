/**
 * G-3 / F-02 — SFH vault re-encryption migration script.
 *
 * Migrates supervisor_password_enc rows from the legacy fixed-salt format
 * (no "v2:" prefix) to the current per-record-salt format ("v2:" prefix).
 *
 * Usage (from the backend/ directory):
 *   npx tsx scripts/reencrypt-sfh-vault.ts --dry-run   # report-only, no writes
 *   npx tsx scripts/reencrypt-sfh-vault.ts              # apply re-encryption
 *
 * On Render: run as a one-off job against the managed DB by setting the same
 * DATABASE_URL, VAULT_SECRET, and JWT_SECRET env vars used by the API service,
 * then: npx tsx scripts/reencrypt-sfh-vault.ts
 *
 * When all rows are in v2 format, legacy-format decrypt support (the branch
 * in vaultDecryptCore that reads JWT_SECRET as legacySecret) can be removed.
 * Planned removal: once all SFH accounts have either been re-encrypted by this
 * script or had their password regenerated via the supervisor UI.
 */

import { PrismaClient } from "@prisma/client";
import { vaultDecryptCore, vaultEncryptCore } from "../src/lib/sfhSupervisorPasswordVault.js";
import { env } from "../src/config/env.js";

const isDryRun = process.argv.includes("--dry-run");
const prisma = new PrismaClient();

const V2_PREFIX = "v2:";

function isLegacyBlob(blob: string): boolean {
  return !blob.startsWith(V2_PREFIX);
}

async function main() {
  console.log(`\n=== SFH vault re-encryption (${isDryRun ? "DRY RUN" : "LIVE"}) ===\n`);

  const rows = await prisma.stateFacilityHead.findMany({
    select: { id: true, userId: true, supervisorPasswordEnc: true },
  });

  const legacy = rows.filter((r) => r.supervisorPasswordEnc && isLegacyBlob(r.supervisorPasswordEnc));
  const v2already = rows.filter((r) => r.supervisorPasswordEnc && !isLegacyBlob(r.supervisorPasswordEnc));
  const noBlob = rows.filter((r) => !r.supervisorPasswordEnc);

  console.log(`Total SFH rows: ${rows.length}`);
  console.log(`  Already v2 format: ${v2already.length}`);
  console.log(`  Legacy format (need migration): ${legacy.length}`);
  console.log(`  No password stored: ${noBlob.length}`);
  console.log();

  if (legacy.length === 0) {
    console.log("No legacy-format rows found. Nothing to do.");
    await prisma.$disconnect();
    return;
  }

  if (isDryRun) {
    console.log("DRY RUN — no writes will be made.");
    for (const row of legacy) {
      console.log(`  Would re-encrypt SFH id=${row.id} userId=${row.userId}`);
    }
    console.log(`\nTo apply: run without --dry-run`);
    await prisma.$disconnect();
    return;
  }

  let succeeded = 0;
  let failed = 0;

  for (const row of legacy) {
    const blob = row.supervisorPasswordEnc!;
    try {
      // Decrypt using the legacy scheme (fixed salt + JWT_SECRET).
      const plaintext = vaultDecryptCore(blob, env.VAULT_SECRET, env.JWT_SECRET);
      // Re-encrypt using the current scheme (per-record salt + VAULT_SECRET).
      const newBlob = vaultEncryptCore(plaintext, env.VAULT_SECRET);

      await prisma.$transaction([
        prisma.stateFacilityHead.update({
          where: { id: row.id },
          data: { supervisorPasswordEnc: newBlob },
        }),
      ]);

      // Verify the new blob round-trips correctly before moving on.
      const verify = vaultDecryptCore(newBlob, env.VAULT_SECRET);
      if (verify !== plaintext) {
        throw new Error(`Round-trip verification failed for SFH id=${row.id}`);
      }

      console.log(`  ✓ Re-encrypted SFH id=${row.id}`);
      succeeded++;
    } catch (err) {
      console.error(`  ✗ Failed SFH id=${row.id}: ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }
  }

  console.log(`\nDone. Succeeded: ${succeeded}, Failed: ${failed}`);
  if (failed > 0) {
    console.error("\nSome rows failed. Check the errors above and retry.");
    process.exitCode = 1;
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exitCode = 1;
  prisma.$disconnect().catch(() => undefined);
});
