import type { Request } from "express";

export type PaginationParams = {
  take: number;
  skip: number;
};

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

export function parsePagination(req: Request, defaultLimit = DEFAULT_LIMIT): PaginationParams {
  const limitRaw = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : defaultLimit;
  const offsetRaw = typeof req.query.offset === "string" ? parseInt(req.query.offset, 10) : 0;
  const take = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : defaultLimit, 1), MAX_LIMIT);
  const skip = Math.max(Number.isFinite(offsetRaw) ? offsetRaw : 0, 0);
  return { take, skip };
}
