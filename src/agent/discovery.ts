import dgram from "node:dgram";

export interface DiscoveryResult {
  serverBaseUrl: string;
  targetId: string | null;
}

const DEFAULT_DISCOVERY_PORT = 41920;
const DEFAULT_TIMEOUT_MS = 4000;

/**
 * Broadcasts a discovery request and waits for the server's reply — never
 * throws; a failed/timed-out discovery just resolves to null, and the
 * caller decides whether that's fatal for this run. The reply's source
 * address (rinfo.address) is what becomes the discovered serverBaseUrl —
 * deliberately not something the server reports about itself, since a
 * multi-homed server guessing its own address is a less reliable source of
 * truth than "the address this reply actually arrived from."
 */
export function discoverServer(
  macAddresses: string[],
  {
    port = DEFAULT_DISCOVERY_PORT,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  }: { port?: number; timeoutMs?: number } = {},
): Promise<DiscoveryResult | null> {
  return new Promise((resolve) => {
    const socket = dgram.createSocket("udp4");
    let settled = false;

    const finish = (result: DiscoveryResult | null) => {
      if (settled) return;
      settled = true;
      socket.close();
      resolve(result);
    };

    const timer = setTimeout(() => finish(null), timeoutMs);

    socket.on("message", (msg, rinfo) => {
      try {
        const payload = JSON.parse(msg.toString());
        if (payload?.app !== "wake-on-lan") return;
        clearTimeout(timer);
        finish({
          serverBaseUrl: `https://${rinfo.address}:${payload.httpsPort}`,
          targetId: payload.targetId ?? null,
        });
      } catch {
        // Not a valid reply — keep waiting for one, or for the timeout.
      }
    });

    socket.on("error", () => finish(null));

    socket.bind(() => {
      socket.setBroadcast(true);
      socket.send(
        JSON.stringify({ app: "wake-on-lan", type: "discover", macAddresses }),
        port,
        "255.255.255.255",
      );
    });
  });
}
