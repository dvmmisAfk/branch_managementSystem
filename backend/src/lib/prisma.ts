import { PrismaClient } from "@prisma/client";
import { apiDebug, env } from "../config/env.js";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const prismaLog =
  apiDebug ? (["query", "warn", "error"] as const)
  : env.NODE_ENV === "development" ? (["error", "warn"] as const)
  : (["error"] as const);

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: [...prismaLog],
  });

if (env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
