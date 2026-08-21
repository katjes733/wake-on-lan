export interface ShutdownConsumeResponse {
  shutdown: boolean;
  triggeredAt?: string;
}

export function evaluateShutdown(response: ShutdownConsumeResponse): boolean {
  return response.shutdown === true;
}
