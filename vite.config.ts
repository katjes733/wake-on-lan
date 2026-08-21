import { fileURLToPath } from "url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
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
    proxy: {
      // Matches "/api/v1" specifically (not bare "/api") — the backend only
      // ever serves versioned routes under /api/v1/*, and a bare "/api"
      // prefix would collide with this project's own src/client/api/
      // source folder, which Vite serves at the root-relative URL
      // "/api/*" (root-relative to `root: "src/client"` above).
      "/api/v1": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
