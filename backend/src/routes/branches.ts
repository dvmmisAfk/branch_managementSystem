import { Router } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { BranchType, DgOwnership, Prisma, UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRoles } from "../middleware/requireRoles.js";
import { HttpError } from "../utils/HttpError.js";
import { securityLog } from "../lib/securityLog.js";
import { writeAudit } from "../services/auditLog.service.js";

// G-8 / xlsx HIGH CVE compensating controls:
//   - File-size cap: 10 MB (Multer)
//   - Row cap: reject workbooks that would force xlsx to process > MAX_UPLOAD_ROWS rows
//   - Column cap: reject sheets wider than MAX_UPLOAD_COLS columns
// xlsx.read() is synchronous; it cannot be safely interrupted once started, so the
// row/col caps must be enforced AFTER the parse. A worker-thread isolation layer is
// documented as a follow-up item in SECURITY_FIXES.md.
const MAX_UPLOAD_ROWS = 5_000;
const MAX_UPLOAD_COLS = 100;

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB — first line of defence against oversized payloads
});

function normHeader(s: string): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseBranchType(raw: unknown): BranchType | null {
  const s = String(raw ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  if (s === "vistaar") return BranchType.vistaar;
  if (s === "non_vistaar" || s === "nonvistaar") return BranchType.non_vistaar;
  return null;
}

function parseDg(raw: unknown): DgOwnership | null {
  const s = String(raw ?? "").trim().toLowerCase();
  if (s.includes("rent")) return DgOwnership.rented;
  if (s.includes("company") || s.includes("owned")) return DgOwnership.owned;
  return null;
}

function cell(row: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const nk = normHeader(k);
    for (const [col, val] of Object.entries(row)) {
      if (normHeader(col) === nk && val !== null && val !== undefined) {
        const s = String(val).trim();
        if (s) return s;
      }
    }
  }
  return undefined;
}

function cellNum(row: Record<string, unknown>, ...keys: string[]): number | undefined {
  const s = cell(row, ...keys);
  if (s === undefined) return undefined;
  const n = Number(String(s).replace(/,/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

function cellBool(row: Record<string, unknown>, ...keys: string[]): boolean | undefined {
  let raw: unknown;
  for (const k of keys) {
    const nk = normHeader(k);
    for (const [col, val] of Object.entries(row)) {
      if (normHeader(col) === nk) raw = val;
    }
  }
  if (raw === null || raw === undefined) return undefined;
  const s = String(raw).trim().toLowerCase();
  if (s === "yes" || s === "true" || s === "1" || s === "y") return true;
  if (s === "no" || s === "false" || s === "0" || s === "n") return false;
  return undefined;
}

async function authorizedBranchIds(role: UserRole, userId: string): Promise<string[] | null> {
  if (role === UserRole.supervisor) return null;
  if (role === UserRole.sfh) {
    const sfh = await prisma.stateFacilityHead.findUnique({ where: { userId }, select: { id: true } });
    if (!sfh) return [];
    const maps = await prisma.sfhBranchMapping.findMany({
      where: { sfhId: sfh.id, isCurrent: true, approvalStatus: "approved" },
      select: { branchId: true },
    });
    return maps.map((m) => m.branchId);
  }
  return [];
}

const branchBody = z.object({
  branchCode: z.string().min(1),
  sapCode: z.string().nullable().optional(),
  branchName: z.string().min(1),
  location: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  zone: z.string().nullable().optional(),
  branchType: z.nativeEnum(BranchType),
  dateOfOperationalization: z.string().nullable().optional(),
  carpetAreaSqft: z.union([z.number(), z.null()]).optional(),
  boiName: z.string().nullable().optional(),
  branchManagerName: z.string().nullable().optional(),
  branchOperationIncharge: z.string().nullable().optional(),
  premiseOwner: z.string().nullable().optional(),
  staffOutsource: z.number().int().optional(),
  staffCompanyRoll: z.number().int().optional(),
  staffHkResources: z.number().int().optional(),
  staffTalicEmployees: z.number().int().optional(),
  workstationsLinear: z.number().int().optional(),
  workstationsLshape: z.number().int().optional(),
  workstationsCubical: z.number().int().optional(),
  upsCapacityKva: z.union([z.number(), z.null()]).optional(),
  upsBackupTimeMins: z.union([z.number(), z.null()]).optional(),
  acTonnage: z.union([z.number(), z.null()]).optional(),
  electricityLoadKw: z.union([z.number(), z.null()]).optional(),
  rmsVendorPresent: z.boolean().optional(),
  rmsVendorName: z.string().nullable().optional(),
  fireExtinguisherCount: z.number().int().optional(),
  dgOwnership: z.enum(["owned", "rented"]).nullable().optional(),
  dgCapacityKva: z.union([z.number(), z.null()]).optional(),
  isActive: z.boolean().optional(),
});

function uncheckedFromBody(body: z.infer<typeof branchBody>): Prisma.BranchUncheckedCreateInput {
  return {
    branchCode: body.branchCode,
    sapCode: body.sapCode ?? null,
    branchName: body.branchName,
    location: body.location ?? null,
    city: body.city ?? null,
    state: body.state ?? null,
    zone: body.zone ?? null,
    branchType: body.branchType,
    dateOfOperationalization:
      body.dateOfOperationalization?.trim() ? new Date(body.dateOfOperationalization) : null,
    carpetAreaSqft: body.carpetAreaSqft ?? null,
    boiName: body.boiName ?? null,
    branchManagerName: body.branchManagerName ?? null,
    branchOperationIncharge: body.branchOperationIncharge ?? null,
    premiseOwner: body.premiseOwner ?? null,
    staffOutsource: body.staffOutsource ?? 0,
    staffCompanyRoll: body.staffCompanyRoll ?? 0,
    staffHkResources: body.staffHkResources ?? 0,
    staffTalicEmployees: body.staffTalicEmployees ?? 0,
    workstationsLinear: body.workstationsLinear ?? 0,
    workstationsLshape: body.workstationsLshape ?? 0,
    workstationsCubical: body.workstationsCubical ?? 0,
    upsCapacityKva: body.upsCapacityKva ?? null,
    upsBackupTimeMins: body.upsBackupTimeMins ?? null,
    acTonnage: body.acTonnage ?? null,
    electricityLoadKw: body.electricityLoadKw ?? null,
    rmsVendorPresent: body.rmsVendorPresent ?? false,
    rmsVendorName: body.rmsVendorName ?? null,
    fireExtinguisherCount: body.fireExtinguisherCount ?? 0,
    dgOwnership: body.dgOwnership ?? null,
    dgCapacityKva: body.dgCapacityKva ?? null,
    isActive: body.isActive ?? true,
  };
}

function spreadsheetRowToInput(row: Record<string, unknown>): {
  input: Prisma.BranchUncheckedCreateInput;
  errors: string[];
} {
  const errors: string[] = [];
  const code = cell(row, "Branch Code", "branch code");
  const name = cell(row, "Branch Name", "branch name") ?? cell(row, "Location", "location");
  const bt = parseBranchType(cell(row, "Branch Type", "branch type"));
  if (!code) errors.push("missing branch code");
  if (!name) errors.push("missing branch name / location");
  if (!bt) errors.push("missing or invalid branch type");
  let dateOp: Date | null | undefined = null;
  const opStr = cell(row, "Operational Date", "Date of Operationalization");
  if (opStr) {
    const d = new Date(opStr);
    dateOp = Number.isFinite(d.getTime()) ? d : null;
    if (!Number.isFinite(d.getTime())) errors.push("bad operational date");
  }
  const rmsPresent = cellBool(row, "RMS Vendor Present", "rms vendor present");
  const input: Prisma.BranchUncheckedCreateInput = {
    branchCode: code ?? "INVALID",
    sapCode: cell(row, "SAP Code", "sap code") ?? null,
    branchName: name ?? code ?? "?",
    location: cell(row, "Location", "location") ?? null,
    city: cell(row, "City", "city") ?? null,
    state: cell(row, "State", "state") ?? null,
    zone: cell(row, "Zone", "zone") ?? null,
    branchType: bt ?? BranchType.non_vistaar,
    dateOfOperationalization: dateOp,
    carpetAreaSqft: cellNum(row, "Carpet Area", "carpet area") ?? null,
    boiName: cell(row, "BOI Name", "boi name") ?? null,
    branchManagerName:
      cell(row, "Branch Manager", "branch manager") ?? cell(row, "Branch Manager Name") ?? null,
    branchOperationIncharge:
      cell(row, "Branch Ops Incharge", "Branch Operation Incharge", "branch ops incharge") ?? null,
    premiseOwner: cell(row, "Premise Owner", "premise owner") ?? null,
    staffOutsource: cellNum(row, "Staff Outsource", "staff outsource") ?? 0,
    staffCompanyRoll:
      cellNum(row, "Staff Company Roll", "staff company roll") ?? cellNum(row, "Staff Company roll") ?? 0,
    staffHkResources:
      cellNum(row, "Staff HK Resources", "staff hk resources", "Staff Hk Resources") ?? 0,
    staffTalicEmployees: cellNum(row, "Staff TALIC Employees", "staff talic employees") ?? 0,
    workstationsLinear: cellNum(row, "Workstations Linear", "workstations linear") ?? 0,
    workstationsLshape:
      cellNum(row, "Workstations L Shape", "Workstations L-Shape", "workstations l-shape") ?? 0,
    workstationsCubical: cellNum(row, "Workstations Cubical", "workstations cubical") ?? 0,
    upsCapacityKva: cellNum(row, "UPS KVA", "ups kva") ?? null,
    upsBackupTimeMins:
      cellNum(row, "UPS Backup Mins", "UPS Backup Time Mins", "UPS Backup Minutes") ?? undefined,
    acTonnage: cellNum(row, "AC Tonnage", "ac tonnage") ?? null,
    electricityLoadKw:
      cellNum(row, "Electricity Load KW", "electricity load kw", "Electricity Load Kw") ?? null,
    rmsVendorPresent: rmsPresent ?? false,
    rmsVendorName: cell(row, "RMS Vendor Name", "rms vendor name") ?? null,
    fireExtinguisherCount: cellNum(row, "Fire Extinguisher Count", "fire extinguisher count") ?? 0,
    dgOwnership: parseDg(cell(row, "DG Ownership", "dg ownership")),
    dgCapacityKva: cellNum(row, "DG Capacity KVA", "dg capacity kva") ?? null,
  };
  return { input, errors };
}

router.use(authenticate);

router.get("/", async (req, res, next) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const allow = await authorizedBranchIds(req.user!.role, req.user!.id);
    if (allow?.length === 0) return res.json([]);
    const includeInactive =
      req.user!.role === UserRole.supervisor &&
      (req.query.includeInactive === "true" || req.query.includeInactive === "1");

    const whereBase: Prisma.BranchWhereInput =
      allow === null ?
        includeInactive ? {}
        : { isActive: true }
      : { id: { in: allow }, isActive: true };
    const where: Prisma.BranchWhereInput =
      q.length > 0 ?
        {
          ...whereBase,
          OR: [
            { branchName: { contains: q, mode: "insensitive" } },
            { branchCode: { contains: q, mode: "insensitive" } },
            { sapCode: { contains: q, mode: "insensitive" } },
            { city: { contains: q, mode: "insensitive" } },
            { location: { contains: q, mode: "insensitive" } },
          ],
        }
      : whereBase;
    res.json(await prisma.branch.findMany({ where, orderBy: { branchCode: "asc" } }));
  } catch (e) {
    next(e);
  }
});

router.post("/", requireRoles(UserRole.supervisor), async (req, res, next) => {
  try {
    const body = branchBody.parse(req.body);
    const row = await prisma.branch.create({ data: uncheckedFromBody(body) });
    res.status(201).json(row);
  } catch (e) {
    next(e);
  }
});

router.post(
  "/bulk-upload",
  requireRoles(UserRole.supervisor),
  upload.single("file"),
  async (req, res, next) => {
    try {
      if (!req.file?.buffer) throw new HttpError("multipart field \"file\" is required", 400);

      // G-8: parse then immediately check dimensions before processing any row data.
      const wb = XLSX.read(req.file.buffer, { type: "buffer" });
      const sheet = wb.Sheets[wb.SheetNames[0]];

      // Estimate column count from the sheet's reference range (e.g. "A1:CZ500").
      const ref = sheet["!ref"];
      if (ref) {
        const range = XLSX.utils.decode_range(ref);
        const cols = range.e.c - range.s.c + 1;
        if (cols > MAX_UPLOAD_COLS) {
          securityLog("suspicious_upload_rejected", {
            req,
            reason: "xlsx_col_limit",
            cols,
            limit: MAX_UPLOAD_COLS,
          });
          throw new HttpError(
            `Spreadsheet has ${cols} columns — maximum is ${MAX_UPLOAD_COLS}. Upload a simpler file.`,
            422,
          );
        }
      }

      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

      if (rows.length > MAX_UPLOAD_ROWS) {
        securityLog("suspicious_upload_rejected", {
          req,
          reason: "xlsx_row_limit",
          rows: rows.length,
          limit: MAX_UPLOAD_ROWS,
        });
        throw new HttpError(
          `Spreadsheet has ${rows.length} rows — maximum is ${MAX_UPLOAD_ROWS}. Split the file and upload in batches.`,
          422,
        );
      }
      let inserted = 0;
      let updated = 0;
      const errors: { row: number; reason: string }[] = [];

      const updateDataFromInput = (input: Prisma.BranchUncheckedCreateInput): Prisma.BranchUpdateInput => ({
        sapCode: input.sapCode,
        branchName: input.branchName ?? undefined,
        location: input.location ?? undefined,
        city: input.city ?? undefined,
        state: input.state ?? undefined,
        zone: input.zone ?? undefined,
        branchType: input.branchType,
        dateOfOperationalization: input.dateOfOperationalization ?? undefined,
        carpetAreaSqft: input.carpetAreaSqft ?? undefined,
        boiName: input.boiName ?? undefined,
        branchManagerName: input.branchManagerName ?? undefined,
        branchOperationIncharge: input.branchOperationIncharge ?? undefined,
        premiseOwner: input.premiseOwner ?? undefined,
        staffOutsource: input.staffOutsource,
        staffCompanyRoll: input.staffCompanyRoll,
        staffHkResources: input.staffHkResources,
        staffTalicEmployees: input.staffTalicEmployees,
        workstationsLinear: input.workstationsLinear,
        workstationsLshape: input.workstationsLshape,
        workstationsCubical: input.workstationsCubical,
        upsCapacityKva: input.upsCapacityKva ?? undefined,
        upsBackupTimeMins: input.upsBackupTimeMins ?? undefined,
        acTonnage: input.acTonnage ?? undefined,
        electricityLoadKw: input.electricityLoadKw ?? undefined,
        rmsVendorPresent: !!input.rmsVendorPresent,
        rmsVendorName: input.rmsVendorName ?? undefined,
        fireExtinguisherCount: input.fireExtinguisherCount ?? undefined,
        dgOwnership: input.dgOwnership ?? null,
        dgCapacityKva: input.dgCapacityKva ?? undefined,
      });

      for (let i = 0; i < rows.length; i++) {
        const rowNum = i + 2;
        const { input, errors: er } = spreadsheetRowToInput(rows[i]);
        if (er.length) {
          errors.push({ row: rowNum, reason: er.join("; ") });
          continue;
        }
        const existing = await prisma.branch.findUnique({ where: { branchCode: input.branchCode } });
        const dataPatch = updateDataFromInput(input);
        if (existing) {
          await prisma.branch.update({ where: { id: existing.id }, data: dataPatch });
          updated += 1;
        } else {
          await prisma.branch.create({
            data: {
              branchCode: input.branchCode as string,
              sapCode: input.sapCode ?? null,
              branchName: input.branchName as string,
              location: input.location ?? null,
              city: input.city ?? null,
              state: input.state ?? null,
              zone: input.zone ?? null,
              branchType: input.branchType as BranchType,
              dateOfOperationalization: input.dateOfOperationalization ?? null,
              carpetAreaSqft: input.carpetAreaSqft ?? null,
              boiName: input.boiName ?? null,
              branchManagerName: input.branchManagerName ?? null,
              branchOperationIncharge: input.branchOperationIncharge ?? null,
              premiseOwner: input.premiseOwner ?? null,
              staffOutsource: input.staffOutsource ?? 0,
              staffCompanyRoll: input.staffCompanyRoll ?? 0,
              staffHkResources: input.staffHkResources ?? 0,
              staffTalicEmployees: input.staffTalicEmployees ?? 0,
              workstationsLinear: input.workstationsLinear ?? 0,
              workstationsLshape: input.workstationsLshape ?? 0,
              workstationsCubical: input.workstationsCubical ?? 0,
              upsCapacityKva: input.upsCapacityKva ?? null,
              upsBackupTimeMins: input.upsBackupTimeMins ?? null,
              acTonnage: input.acTonnage ?? null,
              electricityLoadKw: input.electricityLoadKw ?? null,
              rmsVendorPresent: !!input.rmsVendorPresent,
              rmsVendorName: input.rmsVendorName ?? null,
              fireExtinguisherCount: input.fireExtinguisherCount ?? 0,
              dgOwnership: input.dgOwnership ?? null,
              dgCapacityKva: input.dgCapacityKva ?? null,
            },
          });
          inserted += 1;
        }
      }
      res.json({ inserted, updated, errors });
    } catch (e) {
      next(e);
    }
  }
);



router.get("/unmapped", requireRoles(UserRole.supervisor), async (_req, res, next) => {
  try {
    const mapped = await prisma.sfhBranchMapping.findMany({
      where: { isCurrent: true, approvalStatus: "approved" },
      select: { branchId: true },
    });
    const mappedIds = mapped.map((m) => m.branchId);
    const branches = await prisma.branch.findMany({
      where: { isActive: true, id: { notIn: mappedIds.length ? mappedIds : ["00000000-0000-0000-0000-000000000000"] } },
      orderBy: { branchCode: "asc" },
    });
    res.json(branches);
  } catch (e) {
    next(e);
  }
});

router.get("/:id", async (req, res, next) => {



  try {



    const id = z.string().uuid().parse(req.params.id);



    const allow = await authorizedBranchIds(req.user!.role, req.user!.id);



    if (allow !== null && !allow.includes(id)) throw new HttpError("Forbidden", 403);



    const row = await prisma.branch.findUnique({ where: { id } });



    if (!row) throw new HttpError("Not found", 404);



    res.json(row);



  } catch (e) {



    next(e);



  }



});



router.patch("/:id", requireRoles(UserRole.supervisor), async (req, res, next) => {


  try {


    const id = z.string().uuid().parse(req.params.id);


    const parsed = branchBody.partial().omit({ branchCode: true }).parse(req.body);


    const merged: Prisma.BranchUpdateInput = {};


    if (parsed.sapCode !== undefined) merged.sapCode = parsed.sapCode ?? null;


    if (parsed.branchName !== undefined) merged.branchName = parsed.branchName;


    if (parsed.location !== undefined) merged.location = parsed.location ?? null;


    if (parsed.city !== undefined) merged.city = parsed.city ?? null;


    if (parsed.state !== undefined) merged.state = parsed.state ?? null;


    if (parsed.zone !== undefined) merged.zone = parsed.zone ?? null;


    if (parsed.branchType !== undefined) merged.branchType = parsed.branchType;


    if (parsed.dateOfOperationalization !== undefined)


      merged.dateOfOperationalization = parsed.dateOfOperationalization?.trim()
        ?
          new Date(parsed.dateOfOperationalization)
        : null;


    if (parsed.carpetAreaSqft !== undefined) merged.carpetAreaSqft = parsed.carpetAreaSqft ?? null;


    if (parsed.boiName !== undefined) merged.boiName = parsed.boiName ?? null;


    if (parsed.branchManagerName !== undefined) merged.branchManagerName = parsed.branchManagerName ?? null;


    if (parsed.branchOperationIncharge !== undefined)


      merged.branchOperationIncharge = parsed.branchOperationIncharge ?? null;


    if (parsed.premiseOwner !== undefined) merged.premiseOwner = parsed.premiseOwner ?? null;


    if (parsed.staffOutsource !== undefined) merged.staffOutsource = parsed.staffOutsource;


    if (parsed.staffCompanyRoll !== undefined) merged.staffCompanyRoll = parsed.staffCompanyRoll;


    if (parsed.staffHkResources !== undefined) merged.staffHkResources = parsed.staffHkResources;


    if (parsed.staffTalicEmployees !== undefined) merged.staffTalicEmployees = parsed.staffTalicEmployees;


    if (parsed.workstationsLinear !== undefined) merged.workstationsLinear = parsed.workstationsLinear;


    if (parsed.workstationsLshape !== undefined) merged.workstationsLshape = parsed.workstationsLshape;


    if (parsed.workstationsCubical !== undefined) merged.workstationsCubical = parsed.workstationsCubical;


    if (parsed.upsCapacityKva !== undefined) merged.upsCapacityKva = parsed.upsCapacityKva ?? null;


    if (parsed.upsBackupTimeMins !== undefined) merged.upsBackupTimeMins = parsed.upsBackupTimeMins ?? null;


    if (parsed.acTonnage !== undefined) merged.acTonnage = parsed.acTonnage ?? null;


    if (parsed.electricityLoadKw !== undefined) merged.electricityLoadKw = parsed.electricityLoadKw ?? null;


    if (parsed.rmsVendorPresent !== undefined) merged.rmsVendorPresent = parsed.rmsVendorPresent;


    if (parsed.rmsVendorName !== undefined) merged.rmsVendorName = parsed.rmsVendorName ?? null;


    if (parsed.fireExtinguisherCount !== undefined) merged.fireExtinguisherCount = parsed.fireExtinguisherCount;


    if (parsed.dgOwnership !== undefined) merged.dgOwnership = parsed.dgOwnership;


    if (parsed.dgCapacityKva !== undefined) merged.dgCapacityKva = parsed.dgCapacityKva ?? null;


    if (parsed.isActive !== undefined) merged.isActive = parsed.isActive;


    const row = await prisma.branch.update({ where: { id }, data: merged });


    res.json(row);


  } catch (e) {


    next(e);


  }


});



const destroyBranchSchema = z.object({
  branchCode: z.string().min(1).max(20),
});

router.post("/:id/destroy", requireRoles(UserRole.supervisor), async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id);
    const { branchCode } = destroyBranchSchema.parse(req.body);
    const typedCode = branchCode.trim();

    const branch = await prisma.branch.findUnique({ where: { id } });
    if (!branch) throw new HttpError("Branch not found", 404);
    if (branch.isActive) {
      throw new HttpError("Branch must be deactivated before it can be deleted.", 409);
    }
    if (typedCode !== branch.branchCode) {
      throw new HttpError("Branch code does not match. Type the exact code shown for this branch.", 400);
    }

    await prisma.$transaction(async (tx) => {
      await tx.branch.delete({ where: { id } });
    });

    await writeAudit({
      actorId: req.user!.id,
      action: "branch_destroy",
      entityType: "branch",
      entityId: id,
      metadata: { branchCode: branch.branchCode, branchName: branch.branchName },
    });

    securityLog("branch_destroyed", { branchId: id, branchCode: branch.branchCode, actorId: req.user!.id });

    res.status(204).send();
  } catch (e) {
    next(e);
  }
});

router.delete("/:id", requireRoles(UserRole.supervisor), async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id);
    const branch = await prisma.branch.findUnique({ where: { id }, select: { id: true, isActive: true } });
    if (!branch) throw new HttpError("Branch not found", 404);
    if (!branch.isActive) {
      throw new HttpError("Branch is already inactive. Use destroy with branch code confirmation to delete permanently.", 409);
    }

    await prisma.branch.update({ where: { id }, data: { isActive: false } });

    await writeAudit({
      actorId: req.user!.id,
      action: "branch_deactivate",
      entityType: "branch",
      entityId: id,
    });

    res.status(204).send();
  } catch (e) {
    next(e);
  }
});



export default router;
