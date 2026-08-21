import path from "path";
import http from "http";
import https from "https";
import fs from "fs";
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
if (!process.env.ALLOWED_ORIGINS) {
  throw new Error("ALLOWED_ORIGINS environment variable is required");
}

const sslEnabled = process.env.SSL_ENABLED === "true";
if (sslEnabled && (!process.env.SSL_KEY_PATH || !process.env.SSL_CERT_PATH)) {
  throw new Error(
    "SSL_KEY_PATH and SSL_CERT_PATH must be set when SSL_ENABLED=true",
  );
}

const allowedOrigins = process.env.ALLOWED_ORIGINS.split(",")
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
        // Helmet includes this directive by default even with a custom
        // directives object — it tells the browser to upgrade every
        // subresource request to HTTPS. Only safe when we actually have a
        // TLS listener; otherwise every asset load fails with
        // ERR_SSL_PROTOCOL_ERROR.
        ...(sslEnabled ? {} : { upgradeInsecureRequests: null }),
      },
    },
    // Meaningless (and generates a console warning) without HTTPS.
    ...(sslEnabled ? {} : { crossOriginOpenerPolicy: false }),
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

// Serves the built React frontend. In dev, Vite's own dev server handles the
// frontend instead (see vite.config.ts's /api/v1 proxy), so this is skipped
// there. Must be registered after the API routes so unmatched requests fall
// through to the SPA here, not the other way around.
if (process.env.NODE_ENV !== "development") {
  logger.info("Serving static files from 'public' directory");

  const NEVER_CACHE = "no-cache, no-store, must-revalidate";
  app.use(
    express.static(path.join(process.cwd(), "public"), {
      setHeaders: (res, filePath) => {
        if (path.basename(filePath) === "index.html") {
          res.setHeader("Cache-Control", NEVER_CACHE);
        } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        }
      },
    }),
  );

  app.use((_req, res) => {
    res.sendFile(path.join(process.cwd(), "public", "index.html"), {
      headers: { "Cache-Control": NEVER_CACHE },
    });
  });
} else {
  logger.info("Not in production mode");
}

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

let server: http.Server | https.Server;
if (sslEnabled) {
  server = https.createServer(
    {
      key: fs.readFileSync(process.env.SSL_KEY_PATH!),
      cert: fs.readFileSync(process.env.SSL_CERT_PATH!),
    },
    app,
  );
  logger.info("SSL is enabled. Running server with HTTPS.");
} else {
  server = http.createServer(app);
  logger.info("SSL is not enabled. Running server with HTTP.");
}

server.listen(port, () => {
  logger.info({ port, ssl: sslEnabled }, "Server listening");
});
