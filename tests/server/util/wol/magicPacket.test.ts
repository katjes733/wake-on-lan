import { describe, it, expect } from "vitest";
import { buildMagicPacket } from "~/server/util/wol/magicPacket";

describe("buildMagicPacket", () => {
  it("builds a 102-byte packet: 6x 0xFF header + 16x repeated MAC", () => {
    const packet = buildMagicPacket("AA:BB:CC:DD:EE:FF");
    expect(packet.length).toBe(102);
    expect(packet.subarray(0, 6)).toEqual(
      Buffer.from([0xff, 0xff, 0xff, 0xff, 0xff, 0xff]),
    );
    const macBytes = Buffer.from("AABBCCDDEEFF", "hex");
    for (let i = 0; i < 16; i++) {
      expect(packet.subarray(6 + i * 6, 12 + i * 6)).toEqual(macBytes);
    }
  });

  it("accepts hyphen-separated and bare-hex MAC formats identically", () => {
    const colon = buildMagicPacket("AA:BB:CC:DD:EE:FF");
    const hyphen = buildMagicPacket("AA-BB-CC-DD-EE-FF");
    const bare = buildMagicPacket("AABBCCDDEEFF");
    expect(hyphen).toEqual(colon);
    expect(bare).toEqual(colon);
  });

  it("throws on an invalid MAC address", () => {
    expect(() => buildMagicPacket("not-a-mac")).toThrow();
  });
});
