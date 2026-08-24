import type { AgentBootstrapConfig } from "~/agent/config";

export interface AgentConfigResponse {
  wolAware: boolean;
  defaultScript?: string | null;
  wolScript?: string | null;
  manualBootScript?: string | null;
  shutdownEnabled: boolean;
  pollIntervalSeconds?: number | null;
  lokiPushUrl?: string | null;
}

export interface WolFlagConsumeResponse {
  woken: boolean;
  triggeredAt?: string;
}

export interface ShutdownFlagConsumeResponse {
  shutdown: boolean;
  triggeredAt?: string;
}

export interface ManualScriptFlagConsumeResponse {
  triggered: boolean;
  triggeredAt?: string;
}

// A real CA-issued certificate for a bare IP literal is never going to
// exist in this app's deployment model — Caddy-fronted access always uses
// a real hostname with a real trusted cert; anything else (auto-discovered
// or manually configured as a raw IP) is always this app's own self-signed
// cert. Detecting that from the URL itself avoids needing to separately
// track *why* a given serverBaseUrl is a raw IP.
const IPV4_HOST_PATTERN = /^https:\/\/(\d{1,3}\.){3}\d{1,3}(:\d+)?/;

function fetchOptionsFor(
  url: string,
  init: BunFetchRequestInit = {},
): BunFetchRequestInit {
  return IPV4_HOST_PATTERN.test(url)
    ? { ...init, tls: { rejectUnauthorized: false } }
    : init;
}

/** Shared fetch wrapper — every agent HTTP call, including self-identification, goes through this so the raw-IP TLS handling above is never duplicated or forgotten. */
export function agentFetch(
  url: string,
  init: BunFetchRequestInit = {},
): Promise<Response> {
  return fetch(url, fetchOptionsFor(url, init));
}

function targetUrl(config: AgentBootstrapConfig, subPath: string): string {
  return `${config.serverBaseUrl}/api/v1/targets/${config.targetId}${subPath}`;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await agentFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`POST ${url} failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function getAgentConfig(
  config: AgentBootstrapConfig,
): Promise<AgentConfigResponse> {
  const res = await agentFetch(targetUrl(config, "/agent-config"));
  if (!res.ok) {
    throw new Error(`GET agent-config failed: ${res.status}`);
  }
  return res.json() as Promise<AgentConfigResponse>;
}

export async function postStatus(
  config: AgentBootstrapConfig,
  body: { agentVersion?: string },
): Promise<void> {
  const res = await agentFetch(targetUrl(config, "/status"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`POST status failed: ${res.status}`);
  }
}

export async function postWolFlagConsume(
  config: AgentBootstrapConfig,
  withinSeconds: number,
): Promise<WolFlagConsumeResponse> {
  return postJson(targetUrl(config, "/wol-flag/consume"), { withinSeconds });
}

export async function postShutdownFlagConsume(
  config: AgentBootstrapConfig,
  withinSeconds: number,
): Promise<ShutdownFlagConsumeResponse> {
  return postJson(targetUrl(config, "/shutdown-flag/consume"), {
    withinSeconds,
  });
}

export async function postManualScriptFlagConsume(
  config: AgentBootstrapConfig,
  withinSeconds: number,
): Promise<ManualScriptFlagConsumeResponse> {
  return postJson(targetUrl(config, "/manual-script-flag/consume"), {
    withinSeconds,
  });
}

/** Best-effort "I'm going offline now" beacon — see the shutdown-signal handler in service.ts. */
export async function postOffline(config: AgentBootstrapConfig): Promise<void> {
  const res = await agentFetch(targetUrl(config, "/offline"), {
    method: "POST",
  });
  if (!res.ok) {
    throw new Error(`POST offline failed: ${res.status}`);
  }
}
