import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export const REQUEST_ID_HEADER = "x-request-id";

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const id =
    typeof incoming === "string" && incoming.trim().length > 0 && incoming.length <= 64 ?
      incoming.trim()
    : crypto.randomUUID();
  req.requestId = id;
  res.setHeader(REQUEST_ID_HEADER, id);
  next();
}
