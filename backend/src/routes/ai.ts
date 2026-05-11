import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import { aiGenerationLimiter } from "../middleware/rateLimits.js";

const router = Router();
router.use(authenticate);

/** Placeholder for future LLM / report AI features — rate-limited to prevent abuse. */
router.post("/generate", aiGenerationLimiter, (_req, res) => {
  res.status(501).json({ error: "AI generation is not configured." });
});

export default router;
