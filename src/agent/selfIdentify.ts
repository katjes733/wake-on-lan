import os from "os";
import { agentFetch } from "~/agent/httpClient";

/**
 * Every real local MAC address this machine has — deliberately not trying
 * to guess "the right" interface (Ethernet vs. Wi-Fi vs. anything else).
 * The server-side match naturally filters to whichever one is actually
 * registered as a target, so sending a few extra irrelevant MACs is
 * harmless.
 */
export function getLocalMacAddresses(): string[] {
  return Object.values(os.networkInterfaces())
    .flat()
    .map((iface) => iface?.mac)
    .filter(
      (mac): mac is string => Boolean(mac) && mac !== "00:00:00:00:00:00",
    );
}

/**
 * Asks the server "which target am I?" by MAC address. Never throws — a
 * failure here (network error, no match, server unreachable) just means
 * this run can't self-identify; the caller decides whether that's fatal.
 */
export async function resolveTargetId(
  serverBaseUrl: string,
  macAddresses: string[],
): Promise<string | null> {
  try {
    const res = await agentFetch(`${serverBaseUrl}/api/v1/targets/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ macAddresses }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { targetId?: string };
    return data.targetId ?? null;
  } catch {
    return null;
  }
}
