import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { apiDebug } from "../config/env.js";
import { HttpError } from "../utils/HttpError.js";
import { securityLog } from "../lib/securityLog.js";

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const requestId = req.requestId;

  if (err instanceof ZodError) {
    const body: Record<string, unknown> = {
      error: "Validation failed",
      code: "VALIDATION_FAILED",
      details: err.flatten(),
    };
    if (requestId) body.requestId = requestId;
    if (apiDebug) body.issues = err.issues;
    return res.status(400).json(body);
  }
  if (err instanceof HttpError) {
    const body: Record<string, unknown> = {
      error: err.message,
      code: err.code ?? "HTTP_ERROR",
    };
    if (err.details !== undefined) body.details = err.details;
    if (requestId) body.requestId = requestId;
    if (apiDebug && err.statusCode >= 500 && err instanceof Error && err.stack) body.stack = err.stack;
    return res.status(err.statusCode).json(body);
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      const body: Record<string, unknown> = {
        error: "Unique constraint violated",
        code: "UNIQUE_VIOLATION",
        meta: err.meta,
      };
      if (requestId) body.requestId = requestId;
      if (apiDebug && err.stack) body.stack = err.stack;
      return res.status(409).json(body);
    }
    if (err.code === "P2025") {
      const body: Record<string, unknown> = {
        error: "Record not found",
        code: "NOT_FOUND",
      };
      if (requestId) body.requestId = requestId;
      if (apiDebug && err.stack) body.stack = err.stack;
      return res.status(404).json(body);
    }
    if (err.code === "P2022") {
      const body: Record<string, unknown> = {
        error:
          "Database schema is out of date (missing column). Run `npx prisma migrate deploy` in the backend folder against this database.",
        code: "SCHEMA_OUT_OF_DATE",
        meta: err.meta,
      };
      if (requestId) body.requestId = requestId;
      if (apiDebug && err.stack) body.stack = err.stack;
      return res.status(503).json(body);
    }
  }
  console.error(err);
  const message = err instanceof Error ? err.message : String(err);
  securityLog("api_error", {
    req,
    message: message.slice(0, 500),
    name: err instanceof Error ? err.name : typeof err,
  });
  const body: Record<string, unknown> = {
    error: "Internal server error",
    code: "INTERNAL_ERROR",
  };
  if (requestId) body.requestId = requestId;
  if (apiDebug && err instanceof Error && err.stack) body.stack = err.stack;
  return res.status(500).json(body);
}
