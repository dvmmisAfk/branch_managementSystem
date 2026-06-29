import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export const REQUEST_ID_HEADER = "x-request-id";

// F-10: Only accept safe alphanumeric/hyphen/underscore characters to prevent log injection.
const SAFE_REQUEST_ID = /^[a-zA-Z0-9\-_]{1,64}$/;

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const id =
    typeof incoming === "string" && SAFE_REQUEST_ID.test(incoming) ?
      incoming
    : crypto.randomUUID();
  req.requestId = id;
  res.setHeader(REQUEST_ID_HEADER, id);
  next();
}
