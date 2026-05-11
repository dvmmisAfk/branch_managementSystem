/**
 * Wipes all branch visit records and dependent data so dashboards show zero visits.
 * Keeps branches, SFHs, mappings, quarters, assessment rubric, and utility consumption.
 *
 * Run: npm run db:clear-visits --prefix backend
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const visitCount = await prisma.branchVisit.count();
  const scoreCount = await prisma.visitScore.count();
  const issueCount = await prisma.visitIssue.count();
  const snapCount = await prisma.scoreSnapshot.count();
  const auditCount = await prisma.auditLog.count({ where: { entityType: "branch_visit" } });

  await prisma.$transaction(async (tx) => {
    await tx.auditLog.deleteMany({ where: { entityType: "branch_visit" } });
    await tx.visitScore.deleteMany();
    await tx.visitIssue.deleteMany();
    await tx.scoreSnapshot.deleteMany();
    await tx.branchVisit.deleteMany();
  });

  console.log("[clear-visits] Deleted:");
  console.log(`  branch_visits:        ${visitCount}`);
  console.log(`  visit_scores:         ${scoreCount}`);
  console.log(`  visit_issues:         ${issueCount}`);
  console.log(`  score_snapshots:      ${snapCount}`);
  console.log(`  audit_logs (visit):   ${auditCount}`);
  console.log("[clear-visits] Done. SFH / supervisor visit counts will read as 0 until new visits are created.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
