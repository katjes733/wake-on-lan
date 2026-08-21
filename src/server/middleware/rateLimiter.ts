import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { redis } from "~/server/util/redis";
import type { Request } from "express";

// Namespaced with a "wol:" prefix so keys never collide with
// tesla-powerwall-automation's "rl:*" keys on the same shared Redis instance.
function redisStore(prefix: string) {
  return new RedisStore({
    prefix,
    sendCommand: (...args: string[]) =>
      redis.call(args[0], ...args.slice(1)) as Promise<any>,
  });
}

export const wakeLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  keyGenerator: (req: Request) => ipKeyGenerator(req.ip ?? "unknown"),
  store: redisStore("wol:rl:wake:"),
  passOnStoreError: false,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many wake requests, try again later" },
});

export const consumeLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  keyGenerator: (req: Request) => ipKeyGenerator(req.ip ?? "unknown"),
  store: redisStore("wol:rl:consume:"),
  passOnStoreError: false,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many consume requests, try again later" },
});
