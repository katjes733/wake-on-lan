import dgram from "node:dgram";
import { findTargetByMacAddress } from "~/server/util/routes/targets";
import { normalizeMacAddress } from "~/server/util/wol/macAddress";

const discoveryLog = logger.child({ service: "discovery" });

const DEFAULT_DISCOVERY_PORT = 41920;

/**
 * Answers LAN broadcast discovery requests from the Windows agent — lets it
 * find this server's address (and, in the same round trip, resolve its own
 * target by MAC) without any manually-configured serverBaseUrl/targetId.
 * No auth on the reply: it leaks nothing beyond "a wake-on-lan server is
 * reachable at this address", already discoverable by anyone on the LAN
 * who could otherwise just probe the known port directly.
 */
export function startDiscoveryResponder(httpsPort: number): void {
  if (process.env.DISCOVERY_ENABLED === "false") {
    discoveryLog.info(
      "Discovery responder disabled via DISCOVERY_ENABLED=false",
    );
    return;
  }

  const port = parseInt(
    process.env.DISCOVERY_PORT || String(DEFAULT_DISCOVERY_PORT),
    10,
  );
  const socket = dgram.createSocket("udp4");

  socket.on("message", async (msg, rinfo) => {
    try {
      const payload = JSON.parse(msg.toString());
      if (payload?.app !== "wake-on-lan" || payload?.type !== "discover") {
        return;
      }

      let targetId: string | null = null;
      for (const mac of payload.macAddresses ?? []) {
        const normalized = normalizeMacAddress(mac);
        if (!normalized) continue;
        const target = await findTargetByMacAddress(normalized);
        if (target) {
          targetId = target.id;
          break;
        }
      }

      const reply = JSON.stringify({
        app: "wake-on-lan",
        httpsPort,
        targetId,
      });
      socket.send(reply, rinfo.port, rinfo.address);
      discoveryLog.info(
        { from: rinfo.address, targetId },
        "Discovery request answered",
      );
    } catch (err) {
      discoveryLog.warn({ err }, "Ignoring malformed discovery request");
    }
  });

  socket.on("error", (err) => {
    discoveryLog.error({ err }, "Discovery responder socket error");
  });

  socket.bind(port, () => {
    discoveryLog.info({ port }, "Discovery responder listening");
  });
}
