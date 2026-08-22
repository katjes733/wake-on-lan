import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { z } from "zod";
import { discoverServer } from "~/agent/discovery";
import { getLocalMacAddresses, resolveTargetId } from "~/agent/selfIdentify";

// serverBaseUrl/targetId are optional here — a fresh install ships no
// config.json at all, and both get filled in by resolveAgentConfig() below
// on first run. Everything else the agent needs beyond these bootstrap
// values comes from the server-managed AgentConfig, fetched fresh on every
// call — this keeps a single source of truth for anything that isn't a
// chicken-and-egg bootstrap necessity.
const AgentFileConfigSchema = z.object({
  serverBaseUrl: z.string().url().optional(),
  targetId: z.string().uuid().optional(),
  defaultPollIntervalSeconds: z.number().int().positive().default(30),
  logFilePath: z.string().default("agent.log"),
  // Only needed if the server's DISCOVERY_PORT was changed from its
  // default — must match on both sides for discovery to work at all.
  discoveryPort: z.number().int().positive().optional(),
});
export type AgentFileConfig = z.infer<typeof AgentFileConfigSchema>;

// The fully-resolved shape service.ts/bootHooks.ts actually run against —
// both fields required, guaranteed present by resolveAgentConfig().
const AgentBootstrapConfigSchema = AgentFileConfigSchema.extend({
  serverBaseUrl: z.string().url(),
  targetId: z.string().uuid(),
});
export type AgentBootstrapConfig = z.infer<typeof AgentBootstrapConfigSchema>;

export function defaultConfigPath(): string {
  return path.join(path.dirname(process.execPath), "config.json");
}

export function loadConfig(configPath?: string): AgentFileConfig {
  const resolvedPath = configPath ?? defaultConfigPath();
  const raw = readFileSync(resolvedPath, "utf-8");
  return AgentFileConfigSchema.parse(JSON.parse(raw));
}

/** Missing entirely is fine — an install with no config.json yet resolves everything from scratch. */
export function loadConfigOrEmpty(configPath?: string): AgentFileConfig {
  try {
    return loadConfig(configPath);
  } catch {
    return AgentFileConfigSchema.parse({});
  }
}

export function saveConfig(configPath: string, config: AgentFileConfig): void {
  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

/**
 * Fills in whatever's missing from fileConfig (discovery for
 * serverBaseUrl, MAC-based self-identification for targetId) and persists
 * the result — a field already present is never touched or re-resolved,
 * so a manual override (e.g. pointing at a trusted-cert hostname instead
 * of a discovered raw IP) survives every future run untouched. Resolution
 * only ever runs once per install this way: whichever agent mode happens
 * to start first does it, and every later start of either mode just reads
 * the now-complete file.
 */
export async function resolveAgentConfig(
  fileConfig: AgentFileConfig,
  configPath: string,
): Promise<AgentBootstrapConfig> {
  let { serverBaseUrl, targetId } = fileConfig;
  const alreadyComplete = Boolean(serverBaseUrl && targetId);

  if (!serverBaseUrl) {
    const macAddresses = getLocalMacAddresses();
    const discovered = await discoverServer(
      macAddresses,
      fileConfig.discoveryPort ? { port: fileConfig.discoveryPort } : {},
    );
    if (!discovered) {
      throw new Error(
        "Could not discover the server on this network — set serverBaseUrl in config.json manually.",
      );
    }
    serverBaseUrl = discovered.serverBaseUrl;
    targetId ??= discovered.targetId ?? undefined;
  }

  if (!targetId) {
    const resolved = await resolveTargetId(
      serverBaseUrl,
      getLocalMacAddresses(),
    );
    if (!resolved) {
      throw new Error(
        "Could not resolve this machine's target ID by MAC address — create the target in the app first, or set targetId in config.json manually.",
      );
    }
    targetId = resolved;
  }

  const resolvedConfig: AgentFileConfig = {
    ...fileConfig,
    serverBaseUrl,
    targetId,
  };
  // Skip the write entirely when nothing was actually missing — avoids
  // touching the file (and its formatting/key order) on every single
  // boot-hooks run, which happens on every logon, not just once.
  if (!alreadyComplete) {
    saveConfig(configPath, resolvedConfig);
  }
  return AgentBootstrapConfigSchema.parse(resolvedConfig);
}
