import express from "express";
import helmet from "helmet";
import cors from "cors";
import pinoHttp from "pino-http";
import { router as HealthRouter } from "~/server/routes/health";
import { router as TargetsRouter } from "~/server/routes/targets";

// Fail-fast: required env vars are checked synchronously at module load,
// not lazily on first request.
if (
  !process.env.DB_HOST ||
  !process.env.DB_USERNAME ||
  !process.env.DB_PASSWORD ||
  !process.env.DB_NAME
) {
  throw new Error(
    "DB_HOST, DB_USERNAME, DB_PASSWORD, and DB_NAME environment variables are required",
  );
}
if (process.env.DB_SSL === "true" && !process.env.DB_SSL_CA_PATH) {
  throw new Error("DB_SSL_CA_PATH must be set when DB_SSL=true");
}
if (!process.env.REDIS_HOST) {
  throw new Error("REDIS_HOST environment variable is required");
}

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "http://localhost:5173")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const app = express();

app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    customLogLevel: (req, res, err) => {
      if (err || res.statusCode >= 500) return "error";
      if (res.statusCode >= 400) return "warn";
      return "debug";
    },
  }),
);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        fontSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
      },
    },
  }),
);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) callback(null, true);
      else callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE"],
  }),
);

app.use(express.json({ limit: "100kb" }));

app.use("/api/v1/health", HealthRouter);
app.use("/api/v1/targets", TargetsRouter);

app.use(
  (
    err: Error,
    req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    logger.error({ err }, "Unhandled request error");
    res.status(500).json({
      error:
        process.env.NODE_ENV === "development"
          ? err.message
          : "Something went wrong",
    });
  },
);

const port = parseInt(process.env.PORT || "3001", 10);
app.listen(port, () => {
  logger.info({ port }, "Server listening");
});
