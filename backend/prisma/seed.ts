import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import bcrypt from "bcryptjs";
import { PrismaClient, BranchType, UserRole } from "@prisma/client";
import { fileURLToPath } from "url";
import { categorySeeds } from "./seed-assessment-data.js";
import { generateSfhPassword } from "../src/lib/generateSfhPassword.js";
import { normalizeSfhEmployeeCode, syntheticEmailFromEmployeeCode } from "../src/lib/employeeAuth.js";
import { encryptSfhSupervisorPasswordVault } from "../src/lib/sfhSupervisorPasswordVault.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(backendRoot, ".env") });
if (process.env.DOTENV_CONFIG_PATH) {
  dotenv.config({ path: process.env.DOTENV_CONFIG_PATH, override: true });
}

const prisma = new PrismaClient();

type BranchRow = {
  branch_code: string;
  sap_code: string;
  location: string;
  city: string;
  state: string;
  sfh_name: string;
};

function financialYearStart(d: Date): number {
  const m = d.getMonth() + 1;
  const y = d.getFullYear();
  return m >= 4 ? y : y - 1;
}

function quarterLabel(fyStart: number, q: number): string {
  const a = String(fyStart).slice(-2);
  const b = String(fyStart + 1).slice(-2);
  return `FY${a}-${b} Q${q}`;
}

function quartersForFY(fyStart: number) {
  const y = fyStart;
  return [
    {
      financialYear: fyStart,
      quarterNumber: 1,
      startDate: new Date(Date.UTC(y, 3, 1)),
      endDate: new Date(Date.UTC(y, 6, 31)),
      label: quarterLabel(fyStart, 1),
    },
    {
      financialYear: fyStart,
      quarterNumber: 2,
      startDate: new Date(Date.UTC(y, 7, 1)),
      endDate: new Date(Date.UTC(y, 10, 30)),
      label: quarterLabel(fyStart, 2),
    },
    {
      financialYear: fyStart,
      quarterNumber: 3,
      startDate: new Date(Date.UTC(y, 11, 1)),
      endDate: new Date(Date.UTC(y + 1, 2, 31)),
      label: quarterLabel(fyStart, 3),
    },
  ];
}

async function seedQuarters(now: Date) {
  const fy0 = financialYearStart(now);
  const all = [...quartersForFY(fy0), ...quartersForFY(fy0 + 1), ...quartersForFY(fy0 + 2)];
  for (const q of all) {
    await prisma.quarter.upsert({
      where: {
        financialYear_quarterNumber: {
          financialYear: q.financialYear,
          quarterNumber: q.quarterNumber,
        },
      },
      update: { startDate: q.startDate, endDate: q.endDate, label: q.label },
      create: q,
    });
  }
}

async function seedAssessment() {
  for (const cat of categorySeeds) {
    let row = await prisma.assessmentCategory.findFirst({
      where: { displayOrder: cat.displayOrder, isActive: true },
      orderBy: { version: "desc" },
    });
    if (!row) {
      row = await prisma.assessmentCategory.create({
        data: {
          name: cat.name,
          displayOrder: cat.displayOrder,
          maxPoints: cat.maxPoints,
          version: 1,
        },
      });
    } else if (row.name !== cat.name || row.maxPoints !== cat.maxPoints) {
      row = await prisma.assessmentCategory.update({
        where: { id: row.id },
        data: { name: cat.name, maxPoints: cat.maxPoints },
      });
    }
    for (const sub of cat.subcategories) {
      await prisma.assessmentSubcategory.upsert({
        where: {
          categoryId_displayOrder: { categoryId: row.id, displayOrder: sub.displayOrder },
        },
        update: {
          name: sub.name,
          description: sub.description,
          maxScore: sub.maxScore,
          isActive: true,
        },
        create: {
          categoryId: row.id,
          name: sub.name,
          description: sub.description,
          maxScore: sub.maxScore,
          displayOrder: sub.displayOrder,
        },
      });
    }
  }
}

async function main() {
  const supEmail = process.env.SEED_SUPERVISOR_EMAIL?.trim().toLowerCase();
  const supPass = process.env.SEED_SUPERVISOR_PASSWORD;
  if (!supEmail || !supEmail.includes("@") || !supPass || supPass.length < 8) {
    console.error(
      "Set SEED_SUPERVISOR_EMAIL and SEED_SUPERVISOR_PASSWORD (min 8 characters) in backend/.env before running db:seed. Do not commit real values.",
    );
    process.exit(1);
  }

  const emailConflict = await prisma.user.findFirst({
    where: { email: supEmail, NOT: { role: UserRole.supervisor } },
  });
  if (emailConflict) {
    console.error(`SEED_SUPERVISOR_EMAIL is already in use by a non-supervisor account: ${supEmail}`);
    process.exit(1);
  }

  const adminHash = await bcrypt.hash(supPass, 12);
  const existingSupervisor = await prisma.user.findFirst({
    where: { role: UserRole.supervisor },
    orderBy: { createdAt: "asc" },
  });

  if (existingSupervisor) {
    await prisma.user.update({
      where: { id: existingSupervisor.id },
      data: {
        email: supEmail,
        passwordHash: adminHash,
        emailVerifiedAt: new Date(),
      },
    });
  } else {
    await prisma.user.create({
      data: {
        name: "System Supervisor",
        email: supEmail,
        passwordHash: adminHash,
        role: UserRole.supervisor,
        emailVerifiedAt: new Date(),
      },
    });
  }

  const supervisorForApproval = await prisma.user.findUniqueOrThrow({
    where: { email: supEmail },
  });

  const sfhSpecs = [
    { name: "Rajiv Mehta", legacyEmail: "rajiv.mehta@company.com", employeeId: "SFH-101", stateRegion: "Uttarakhand" },
    { name: "Priya Sharma", legacyEmail: "priya.sharma@company.com", employeeId: "SFH-102", stateRegion: "Uttarakhand" },
    { name: "Suresh Verma", legacyEmail: "suresh.verma@company.com", employeeId: "SFH-103", stateRegion: "Uttar Pradesh" },
    { name: "Deepak Gupta", legacyEmail: "deepak.gupta@company.com", employeeId: "SFH-104", stateRegion: "Rajasthan" },
    { name: "Vinod Yadav", legacyEmail: "vinod.yadav@company.com", employeeId: "SFH-105", stateRegion: "Haryana" },
  ] as const;

  const sfhByName = new Map<string, string>();
  for (const s of sfhSpecs) {
    const code = normalizeSfhEmployeeCode(s.employeeId);
    const email = syntheticEmailFromEmployeeCode(code);
    const plain = generateSfhPassword();
    const passwordHash = await bcrypt.hash(plain, 12);
    const supervisorPasswordEnc = encryptSfhSupervisorPasswordVault(plain);

    let user = await prisma.user.findUnique({ where: { email: s.legacyEmail } });
    if (!user) {
      user = await prisma.user.findUnique({ where: { email } });
    }
    if (user) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          name: s.name,
          email,
          passwordHash,
          role: UserRole.sfh,
          emailVerifiedAt: new Date(),
        },
      });
    } else {
      user = await prisma.user.create({
        data: {
          name: s.name,
          email,
          passwordHash,
          role: UserRole.sfh,
          emailVerifiedAt: new Date(),
        },
      });
    }

    const sfhRow = await prisma.stateFacilityHead.upsert({
      where: { userId: user.id },
      update: { employeeCode: code, stateRegion: s.stateRegion, supervisorPasswordEnc },
      create: { userId: user.id, employeeCode: code, stateRegion: s.stateRegion, supervisorPasswordEnc },
    });
    sfhByName.set(s.name, sfhRow.id);
    console.log(`[seed] SFH ${s.name} — login ID: ${code} — one-time password: ${plain}`);
  }

  await seedAssessment();
  await seedQuarters(new Date());

  const branchPath = path.join(__dirname, "branch-seed.json");
  const raw = fs.readFileSync(branchPath, "utf8");
  const branches: BranchRow[] = JSON.parse(raw) as BranchRow[];

  const mappingEffective = new Date(Date.UTC(2020, 0, 1));

  for (const b of branches) {
    const sfhId = sfhByName.get(b.sfh_name);
    if (!sfhId) {
      console.warn(`Skipping branch ${b.branch_code}: SFH '${b.sfh_name}' not in seed roster`);
      continue;
    }

    await prisma.branch.upsert({
      where: { branchCode: b.branch_code },
      update: {
        sapCode: b.sap_code || null,
        branchName: b.location || b.branch_code,
        location: b.location,
        city: b.city,
        state: b.state,
        branchType: BranchType.non_vistaar,
      },
      create: {
        branchCode: b.branch_code,
        sapCode: b.sap_code || null,
        branchName: b.location || b.branch_code,
        location: b.location,
        city: b.city,
        state: b.state,
        branchType: BranchType.non_vistaar,
      },
    });

    const branch = await prisma.branch.findUniqueOrThrow({ where: { branchCode: b.branch_code } });
    const existingCurrent = await prisma.sfhBranchMapping.findFirst({
      where: { branchId: branch.id, isCurrent: true, approvalStatus: "approved" },
    });
    if (!existingCurrent) {
      await prisma.sfhBranchMapping.create({
        data: {
          sfhId,
          branchId: branch.id,
          approvedById: supervisorForApproval.id,
          approvalStatus: "approved",
          effectiveFrom: mappingEffective,
          isCurrent: true,
        },
      });
    }
  }

  console.log(`Seeded branches: ${branches.length}, SFHs: ${sfhByName.size}, assessment OK, quarters OK.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    void prisma.$disconnect();
    process.exit(1);
  });
