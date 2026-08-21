import Redis from "ioredis";

const apiLog = logger.child({ service: "api" });

export const redis = new Redis({
  host: process.env.REDIS_HOST ?? "localhost",
  port: Number(process.env.REDIS_PORT ?? 6379),
  password: process.env.REDIS_PASSWORD || undefined,
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  connectTimeout: 3000,
  commandTimeout: 3000,
});

redis.on("error", (err) => {
  // Logged, not thrown — callers wrap commands in try/catch and fall back gracefully.
  apiLog.warn({ err }, "Redis connection error");
});
