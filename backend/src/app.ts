import "express-async-errors";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { env, apiDebug } from "./config/env.js";
import { getAllowedOriginList, isOriginAllowed } from "./lib/corsOrigins.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { enforceHttps } from "./middleware/enforceHttps.js";
import { requestIdMiddleware } from "./middleware/requestId.js";
import { createApiLimiter } from "./middleware/rateLimits.js";

import { createRateLimitStore } from "./lib/rateLimitStore.js";
import { setRateLimitStore } from "./middleware/rateLimits.js";
import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import sfhRoutes from "./routes/sfhs.js";
import branchRoutes from "./routes/branches.js";
import mappingRoutes from "./routes/mappings.js";
import quarterRoutes from "./routes/quarters.js";
import categoryRoutes from "./routes/categories.js";
import visitsRoutes from "./routes/visits.js";
import utilityRoutes from "./routes/utility.js";
import dashboardRoutes from "./routes/dashboard.js";
import reportsRoutes from "./routes/reports.js";
import issuesExportRoutes from "./routes/issuesExport.js";
import aiRoutes from "./routes/ai.js";
import editRequestRoutes from "./routes/editRequests.js";
import { ensureQuartersAhead } from "./services/quarterBootstrap.service.js";

/** Log unexpected failures; exit on uncaught exceptions (likely unrecoverable). */
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
  process.exit(1);
});

const app = express();

app.set("trust proxy", 1);

const allowedOrigins = getAllowedOriginList();

const devDefaultOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5174",
  "http://localhost:5175",
  "http://127.0.0.1:5175",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
];

const corsOrigins = allowedOrigins?.length ? allowedOrigins : devDefaultOrigins;

app.use(helmet());
app.use(requestIdMiddleware);
app.use(
  cors({
    credentials: true,
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (corsOrigins.includes(origin) || isOriginAllowed(origin)) return callback(null, true);
      callback(new Error(`CORS blocked for origin: ${origin}`));
    },
  }),
);
app.use(cookieParser());
app.use(express.json({ limit: "2mb" }));
app.use(enforceHttps);

if (apiDebug) {
  app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
      const ms = Date.now() - start;
      console.log(`[api-debug] ${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`);
    });
    next();
  });
  console.warn(
    "[api-debug] API_DEBUG=true — request logging, Prisma query logs, and error stacks are enabled. Set API_DEBUG=false before production.",
  );
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

const apiLimiter = createApiLimiter();
const api = express.Router();

api.use("/auth", authRoutes);
api.use("/users", userRoutes);
api.use("/sfhs", sfhRoutes);
api.use("/branches", branchRoutes);
api.use("/mappings", mappingRoutes);
api.use("/quarters", quarterRoutes);
api.use("/categories", categoryRoutes);
api.use("/visits", visitsRoutes);
api.use("/utility", utilityRoutes);
api.use("/dashboard", dashboardRoutes);
api.use("/reports", reportsRoutes);
api.use("/issues", issuesExportRoutes);
api.use("/ai", aiRoutes);
api.use("/edit-requests", editRequestRoutes);

app.use("/api/v1", apiLimiter, api);

app.use(errorHandler);

void (async () => {
  // F-05: Initialise Redis-backed rate-limit store before accepting requests.
  const rateLimitRedisStore = await createRateLimitStore();
  setRateLimitStore(rateLimitRedisStore);

  try {
    await ensureQuartersAhead();
  } catch (e) {
    console.error("ensureQuartersAhead failed:", e);
  }
  const server = app.listen(env.PORT, () => {
    console.log(`branch-visit-tracker API listening on :${env.PORT}${apiDebug ? " (API_DEBUG)" : ""}`);
  });
  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(`Port ${env.PORT} is already in use. Stop the other process or set PORT in backend/.env.`);
      process.exit(1);
      return;
    }
    console.error("Server listen error:", err);
    process.exit(1);
  });
})();
