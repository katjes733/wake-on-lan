import type { AgentBootstrapConfig } from "~/agent/config";

export interface AgentConfigResponse {
  wolAware: boolean;
  defaultScript?: string | null;
  wolScript?: string | null;
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

function targetUrl(config: AgentBootstrapConfig, subPath: string): string {
  return `${config.serverBaseUrl}/api/v1/targets/${config.targetId}${subPath}`;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
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
  const res = await fetch(targetUrl(config, "/agent-config"));
  if (!res.ok) {
    throw new Error(`GET agent-config failed: ${res.status}`);
  }
  return res.json() as Promise<AgentConfigResponse>;
}

export async function postStatus(
  config: AgentBootstrapConfig,
  body: { agentVersion?: string },
): Promise<void> {
  const res = await fetch(targetUrl(config, "/status"), {
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
