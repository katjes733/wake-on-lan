import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const sslEnabled = env.SSL_ENABLED === "true";
  const httpsOptions = sslEnabled
    ? {
        key: fs.readFileSync(path.resolve(env.SSL_KEY_PATH ?? "ssl/key.pem")),
        cert: fs.readFileSync(
          path.resolve(env.SSL_CERT_PATH ?? "ssl/cert.pem"),
        ),
      }
    : undefined;

  return {
    root: "src/client",
    build: {
      outDir: "../../public",
      emptyOutDir: true,
    },
    resolve: {
      alias: {
        "~": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    plugins: [react()],
    server: {
      https: httpsOptions,
      proxy: {
        // Matches "/api/v1" specifically (not bare "/api") — the backend only
        // ever serves versioned routes under /api/v1/*, and a bare "/api"
        // prefix would collide with this project's own src/client/api/
        // source folder, which Vite serves at the root-relative URL
        // "/api/*" (root-relative to `root: "src/client"` above).
        "/api/v1": {
          target: sslEnabled
            ? "https://localhost:3001"
            : "http://localhost:3001",
          secure: false, // allow a self-signed cert on the backend
          changeOrigin: true,
        },
      },
    },
  };
});
