import { httpClient } from "~/client/api/httpClient";

export interface AgentConfig {
  wolAware: boolean;
  defaultScript?: string | null;
  wolScript?: string | null;
  manualBootScript?: string | null;
  shutdownEnabled: boolean;
  pollIntervalSeconds?: number | null;
  lokiPushUrl?: string | null;
}

export interface ApiTarget {
  id: string;
  name: string;
  macAddress: string;
  broadcastAddress: string | null;
  staticIp: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string | null;
  online: boolean;
  agentVersion: string | null;
  agentConfig: AgentConfig;
}

export interface TargetInput {
  name: string;
  macAddress: string;
  broadcastAddress?: string | null;
  staticIp?: string | null;
  notes?: string | null;
}

export interface WakeResult {
  triggeredAt: string;
  sent: boolean;
}

export interface ShutdownResult {
  triggeredAt: string;
}

export async function listTargets(): Promise<ApiTarget[]> {
  const { data } = await httpClient.get<ApiTarget[]>("/targets");
  return data;
}

export async function createTarget(input: TargetInput): Promise<ApiTarget> {
  const { data } = await httpClient.post<ApiTarget>("/targets", input);
  return data;
}

export async function updateTarget(
  id: string,
  input: Partial<TargetInput>,
): Promise<ApiTarget> {
  const { data } = await httpClient.patch<ApiTarget>(`/targets/${id}`, input);
  return data;
}

export async function deleteTarget(id: string): Promise<void> {
  await httpClient.delete(`/targets/${id}`);
}

export async function wakeTarget(id: string): Promise<WakeResult> {
  const { data } = await httpClient.post<WakeResult>(`/targets/${id}/wake`);
  return data;
}

export async function shutdownTarget(id: string): Promise<ShutdownResult> {
  const { data } = await httpClient.post<ShutdownResult>(
    `/targets/${id}/shutdown`,
  );
  return data;
}

export async function getAgentConfig(id: string): Promise<AgentConfig> {
  const { data } = await httpClient.get<AgentConfig>(
    `/targets/${id}/agent-config`,
  );
  return data;
}

export async function saveAgentConfig(
  id: string,
  config: AgentConfig,
): Promise<AgentConfig> {
  const { data } = await httpClient.put<AgentConfig>(
    `/targets/${id}/agent-config`,
    config,
  );
  return data;
}
