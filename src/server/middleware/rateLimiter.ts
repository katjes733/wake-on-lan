import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { redis } from "~/server/util/redis";
import type { Request, Response, NextFunction } from "express";

const apiLog = logger.child({ service: "api" });

// Namespaced with a "wol:" prefix so keys never collide with
// tesla-powerwall-automation's "rl:*" keys on the same shared Redis instance.
function redisStore(prefix: string) {
  return new RedisStore({
    prefix,
    sendCommand: (...args: string[]) =>
      redis.call(args[0], ...args.slice(1)) as Promise<any>,
  });
}

// A custom handler (rather than the `message` option) is required to log the
// hit — express-rate-limit calls this instead of its default response logic
// once the limit is exceeded, so it's also responsible for sending the response.
function logAndRespond(message: string) {
  return (req: Request, res: Response, _next: NextFunction) => {
    apiLog.warn({ route: req.path, ip: req.ip }, "Rate limit exceeded");
    res.status(429).json({ error: message });
  };
}

export const wakeLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  keyGenerator: (req: Request) => ipKeyGenerator(req.ip ?? "unknown"),
  store: redisStore("wol:rl:wake:"),
  passOnStoreError: false,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: logAndRespond("Too many wake requests, try again later"),
});

export const consumeLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  keyGenerator: (req: Request) => ipKeyGenerator(req.ip ?? "unknown"),
  store: redisStore("wol:rl:consume:"),
  passOnStoreError: false,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: logAndRespond("Too many consume requests, try again later"),
});
