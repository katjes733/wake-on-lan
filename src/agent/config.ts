import { readFileSync } from "fs";
import path from "path";
import { z } from "zod";

// Only the bootstrap values the agent needs just to reach the server at all
// live here, in a local config.json next to the installed exe — everything
// else (whether WOL-detection is on, scripts, shutdown, poll interval, the
// Loki push URL) comes from the server-managed AgentConfig and is fetched
// fresh on every call. This keeps a single source of truth for anything
// that isn't a chicken-and-egg bootstrap necessity.
const AgentBootstrapConfigSchema = z.object({
  serverBaseUrl: z.string().url(),
  targetId: z.string().uuid(),
  defaultPollIntervalSeconds: z.number().int().positive().default(30),
  logFilePath: z.string().default("agent.log"),
});

export type AgentBootstrapConfig = z.infer<typeof AgentBootstrapConfigSchema>;

export function defaultConfigPath(): string {
  return path.join(path.dirname(process.execPath), "config.json");
}

export function loadConfig(configPath?: string): AgentBootstrapConfig {
  const resolvedPath = configPath ?? defaultConfigPath();
  const raw = readFileSync(resolvedPath, "utf-8");
  return AgentBootstrapConfigSchema.parse(JSON.parse(raw));
}
