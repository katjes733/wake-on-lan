import dgram from "node:dgram";
import { buildMagicPacket } from "~/server/util/wol/magicPacket";
import { normalizeMacAddress } from "~/server/util/wol/macAddress";

const wolLog = logger.child({ service: "wol" });

export type SendMethod = "dgram" | "wakeonlan";

const WOL_PORT = 9;

// Bun's native Bun.udpSocket() has a confirmed open bug (oven-sh/bun#15746)
// where a broadcast send fails with EACCES because SO_BROADCAST isn't set.
// node:dgram is Bun's Node-compat shim and is used here instead — verify this
// still holds on whatever Bun version is pinned via scripts/spike-wol.ts
// before relying on it in production.
async function sendViaDgram(
  packet: Buffer,
  broadcastAddress: string,
): Promise<void> {
  const socket = dgram.createSocket("udp4");
  try {
    await new Promise<void>((resolve, reject) => {
      socket.bind(() => {
        socket.setBroadcast(true);
        socket.send(
          packet,
          0,
          packet.length,
          WOL_PORT,
          broadcastAddress,
          (err) => {
            if (err) reject(err);
            else resolve();
          },
        );
      });
      socket.once("error", reject);
    });
  } finally {
    socket.close();
  }
}

// Fallback for environments where node:dgram's broadcast support regresses —
// shells out to the `wakeonlan` CLI, which must be installed in the runtime
// image (see Dockerfile).
async function sendViaWakeonlanCli(
  mac: string,
  broadcastAddress: string,
): Promise<void> {
  const normalized = normalizeMacAddress(mac);
  if (!normalized) throw new Error(`Invalid MAC address: ${mac}`);
  const proc = Bun.spawn(["wakeonlan", "-i", broadcastAddress, normalized], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`wakeonlan exited with code ${exitCode}: ${stderr}`);
  }
}

/**
 * Sends a Wake-on-LAN magic packet to `mac` via a broadcast to
 * `broadcastAddress`. Method is controlled by WOL_SEND_METHOD:
 * - "dgram": always use node:dgram, never fall back.
 * - "wakeonlan": always shell out to the wakeonlan CLI.
 * - "auto" (default): try dgram first, fall back to the CLI on a
 *   broadcast-permission-shaped error (EACCES/ENOTSUP) so a future Bun
 *   regression degrades gracefully instead of breaking wake entirely.
 */
export async function sendMagicPacket(
  mac: string,
  broadcastAddress: string,
): Promise<{ method: SendMethod }> {
  const configuredMethod = process.env.WOL_SEND_METHOD || "auto";

  if (configuredMethod === "wakeonlan") {
    await sendViaWakeonlanCli(mac, broadcastAddress);
    return { method: "wakeonlan" };
  }

  const packet = buildMagicPacket(mac);

  if (configuredMethod === "dgram") {
    await sendViaDgram(packet, broadcastAddress);
    return { method: "dgram" };
  }

  // auto
  try {
    await sendViaDgram(packet, broadcastAddress);
    return { method: "dgram" };
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "EACCES" || code === "ENOTSUP") {
      wolLog.warn(
        { err, mac, broadcastAddress },
        "dgram broadcast send failed, falling back to wakeonlan CLI",
      );
      await sendViaWakeonlanCli(mac, broadcastAddress);
      return { method: "wakeonlan" };
    }
    throw err;
  }
}
