/**
 * Wipe branch + SFH data and re-run prisma/seed.ts (synthetic roster + branch-seed.json).
 *
 * Usage (local or Render Shell — uses DATABASE_URL from env):
 *   RESEED_CONFIRM=WIPE_AND_RESEED \
 *   SEED_SUPERVISOR_EMAIL=admin@company.com \
 *   SEED_SUPERVISOR_PASSWORD='YourSecurePass1' \
 *   npm run db:reseed-synthetic
 *
 * Preview counts only:
 *   npm run db:reseed-synthetic -- --dry-run
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient, UserRole } from "@prisma/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, "..");
const prisma = new PrismaClient();

const CONFIRM_VALUE = "WIPE_AND_RESEED";
const dryRun = process.argv.includes("--dry-run");

async function counts() {
  const [
    visits,
    branches,
    sfhs,
    mappings,
    sfhUsers,
  ] = await Promise.all([
    prisma.branchVisit.count(),
    prisma.branch.count(),
    prisma.stateFacilityHead.count(),
    prisma.sfhBranchMapping.count(),
    prisma.user.count({ where: { role: { not: UserRole.supervisor } } }),
  ]);
  return { visits, branches, sfhs, mappings, sfhUsers };
}

async function wipeBranchAndSfhData() {
  await prisma.$transaction(async (tx) => {
    await tx.scoreSnapshot.deleteMany();
    await tx.scorecardAuditLog.deleteMany();
    await tx.visitScore.deleteMany();
    await tx.visitIssue.deleteMany();
    await tx.visitEditRequest.deleteMany();
    await tx.branchVisit.deleteMany();
    await tx.utilityConsumption.deleteMany();
    await tx.sfhPasswordResetRequest.deleteMany();
    await tx.sfhBranchMapping.deleteMany();
    await tx.stateFacilityHead.deleteMany();
    await tx.$executeRawUnsafe(`DELETE FROM branch_ops_incharge_archive`);
    await tx.branch.deleteMany();

    const nonSupervisorIds = (
      await tx.user.findMany({
        where: { role: { not: UserRole.supervisor } },
        select: { id: true },
      })
    ).map((u) => u.id);

    if (nonSupervisorIds.length > 0) {
      await tx.refreshSession.deleteMany({ where: { userId: { in: nonSupervisorIds } } });
      await tx.passwordResetToken.deleteMany({ where: { userId: { in: nonSupervisorIds } } });
      await tx.emailVerificationToken.deleteMany({ where: { userId: { in: nonSupervisorIds } } });
      await tx.auditLog.deleteMany({ where: { actorId: { in: nonSupervisorIds } } });
      await tx.user.deleteMany({ where: { id: { in: nonSupervisorIds } } });
    }
  });
}

function runSeed() {
  const result = spawnSync(process.platform === "win32" ? "npx.cmd" : "npx", ["tsx", "prisma/seed.ts"], {
    cwd: backendRoot,
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  const before = await counts();
  console.log("[reseed] Current database:");
  console.log(`  visits=${before.visits} branches=${before.branches} sfhs=${before.sfhs} mappings=${before.mappings} non-supervisor users=${before.sfhUsers}`);

  if (dryRun) {
    console.log("[reseed] --dry-run: no changes made.");
    console.log("[reseed] Would delete all visits, branches, SFHs, mappings, and non-supervisor users, then run prisma/seed.ts.");
    return;
  }

  if (process.env.RESEED_CONFIRM !== CONFIRM_VALUE) {
    console.error(
      `[reseed] Refusing to run. Set RESEED_CONFIRM=${CONFIRM_VALUE} to wipe branch/SFH data and reseed synthetic roster.`,
    );
    process.exit(1);
  }

  if (before.visits > 0) {
    console.warn(`[reseed] WARNING: deleting ${before.visits} branch visit(s) — this cannot be undone.`);
  }

  console.log("[reseed] Wiping branch + SFH data…");
  await wipeBranchAndSfhData();

  const mid = await counts();
  console.log(`[reseed] After wipe: branches=${mid.branches} sfhs=${mid.sfhs} non-supervisor users=${mid.sfhUsers}`);

  console.log("[reseed] Running prisma/seed.ts (synthetic SFHs + branch-seed.json)…");
  runSeed();

  const after = await counts();
  console.log(`[reseed] Done: branches=${after.branches} sfhs=${after.sfhs} mappings expected ~177`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error(err);
    void prisma.$disconnect();
    process.exit(1);
  });
