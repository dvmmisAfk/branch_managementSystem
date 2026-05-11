import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

export async function writeAudit(opts: {
  actorId: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue;
}) {
  await prisma.auditLog.create({
    data: {
      actorId: opts.actorId,
      action: opts.action,
      entityType: opts.entityType,
      entityId: opts.entityId ?? null,
      metadata: opts.metadata === undefined ? undefined : opts.metadata,
    },
  });
}
