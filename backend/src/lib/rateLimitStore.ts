import type { Store } from "express-rate-limit";

let _store: Store | undefined;

/**
 * Returns a Redis-backed rate-limit store when REDIS_URL is set, otherwise
 * falls back to the express-rate-limit default MemoryStore. The fallback logs
 * a startup warning because per-instance in-memory state resets on every
 * container restart, making limits ineffective on multi-instance deployments.
 */
export async function createRateLimitStore(): Promise<Store | undefined> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.warn(
      "[rate-limit] REDIS_URL is not set — using in-memory MemoryStore. " +
        "Rate-limit counters will reset on every restart and are not shared across instances. " +
        "Set REDIS_URL (e.g. redis://localhost:6379) for persistent, distributed rate limiting.",
    );
    return undefined; // express-rate-limit uses MemoryStore by default
  }

  try {
    const { createClient } = await import("redis");
    const { RedisStore } = await import("rate-limit-redis");

    const client = createClient({ url: redisUrl });
    client.on("error", (err: unknown) => {
      console.error("[rate-limit] Redis client error:", err);
    });
    await client.connect();

    _store = new RedisStore({
      sendCommand: (...args: string[]) => client.sendCommand(args),
    });
    console.log("[rate-limit] Connected to Redis for distributed rate limiting.");
    return _store;
  } catch (err) {
    console.error("[rate-limit] Failed to connect to Redis — falling back to MemoryStore:", err);
    return undefined;
  }
}
