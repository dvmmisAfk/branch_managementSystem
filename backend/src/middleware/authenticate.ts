import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { HttpError } from "../utils/HttpError.js";

type JwtUser = {
  sub: string;
  role: string;
  email: string;
  name: string;
};

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return next(new HttpError("Unauthorized", 401));
  }
  const token = header.slice(7).trim();
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as JwtUser;
    req.user = { id: payload.sub, role: payload.role as never, email: payload.email, name: payload.name };
    return next();
  } catch {
    return next(new HttpError("Invalid or expired token", 401));
  }
}
