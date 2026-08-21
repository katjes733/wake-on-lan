import { httpClient } from "~/client/api/httpClient";

export interface ApiTarget {
  id: string;
  name: string;
  macAddress: string;
  broadcastAddress: string | null;
  staticIp: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
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
