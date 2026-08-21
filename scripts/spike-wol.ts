// Spike script — run this BEFORE relying on sendMagicPacket() in the real app.
// Confirms Wake-on-LAN actually works from this exact runtime/network
// combination against a real device on the LAN.
//
// Usage:
//   MAC=AA:BB:CC:DD:EE:FF BROADCAST_ADDR=192.168.2.255 bun run scripts/spike-wol.ts
//
// Optional: PORT (default 9, try 7 as an alternate if 9 gets no response).
//
// Run this in escalating environments, stopping once one reliably wakes the
// real device — see README.md "Deployment" for exactly how to run each:
//   1. Bare `bun run` on your dev machine (sanity-checks packet construction
//      and that WOL is enabled on the target at all).
//   2. A throwaway container with `--network host` (isolates a Bun bug from
//      a Docker networking issue — can run on any machine with Docker).
//   3. A throwaway container on the NAS's `tesla-macvlan` network with a
//      throwaway static IP — this is the one that must run ON the NAS,
//      since a macvlan network only exists in the Docker daemon it was
//      created on. This is the environment that actually matters: it's the
//      real deployment topology.
//
// Verification: power the target fully off (G3 soft-off, not S3 sleep — the
// real use case is boot-from-off), with WOL enabled in BIOS/UEFI and at the
// OS level (Windows: NIC "Allow this device to wake the computer" checked,
// Fast Startup disabled; Linux: `ethtool -s <iface> wol g`). Run this script,
// then confirm the device powers on within ~5-15 seconds. Also run a
// NEGATIVE CONTROL — flip one byte of the MAC and confirm it does NOT wake —
// to rule out a coincidental wake (scheduled BIOS wake, etc.).

import dgram from "node:dgram";
import { buildMagicPacket } from "~/server/util/wol/magicPacket";
import { normalizeMacAddress } from "~/server/util/wol/macAddress";

const mac = process.env.MAC;
const broadcastAddress = process.env.BROADCAST_ADDR;
const port = parseInt(process.env.PORT || "9", 10);

if (!mac || !broadcastAddress) {
  console.error("Usage: MAC=<mac> BROADCAST_ADDR=<broadcast> bun run scripts/spike-wol.ts");
  process.exit(1);
}

const normalized = normalizeMacAddress(mac);
if (!normalized) {
  console.error(`Invalid MAC address: ${mac}`);
  process.exit(1);
}

console.log(`Target MAC: ${normalized}`);
console.log(`Broadcast address: ${broadcastAddress}:${port}`);

async function attemptDgram(): Promise<void> {
  console.log("\n--- Attempt 1: node:dgram ---");
  const packet = buildMagicPacket(normalized!);
  const socket = dgram.createSocket("udp4");
  try {
    await new Promise<void>((resolve, reject) => {
      socket.bind(() => {
        socket.setBroadcast(true);
        socket.send(packet, 0, packet.length, port, broadcastAddress, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      socket.once("error", reject);
    });
    console.log("dgram send: SUCCESS (no error thrown)");
  } catch (err) {
    console.error("dgram send: FAILED —", err);
  } finally {
    socket.close();
  }
}

async function attemptWakeonlanCli(): Promise<void> {
  console.log("\n--- Attempt 2: wakeonlan CLI ---");
  try {
    const proc = Bun.spawn(["wakeonlan", "-i", broadcastAddress!, normalized!], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    console.log(`wakeonlan exit code: ${exitCode}`);
    if (stdout) console.log(`stdout: ${stdout.trim()}`);
    if (stderr) console.log(`stderr: ${stderr.trim()}`);
  } catch (err) {
    console.error(
      "wakeonlan CLI: FAILED to spawn — is the `wakeonlan` package installed? —",
      err,
    );
  }
}

await attemptDgram();
await attemptWakeonlanCli();

console.log(
  "\nNow physically check whether the target powered on within ~5-15 seconds.",
);
