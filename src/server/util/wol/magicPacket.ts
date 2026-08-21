import { macAddressToBytes } from "~/server/util/wol/macAddress";

/**
 * Builds a standard Wake-on-LAN magic packet: 6 bytes of 0xFF followed by the
 * target MAC address repeated 16 times (102 bytes total).
 */
export function buildMagicPacket(mac: string): Buffer {
  const macBytes = macAddressToBytes(mac);
  const header = Buffer.alloc(6, 0xff);
  const repeatedMac = Buffer.concat(Array(16).fill(macBytes));
  return Buffer.concat([header, repeatedMac]);
}
