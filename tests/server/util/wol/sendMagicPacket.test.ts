import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockCreateSocket, mockSpawn } = vi.hoisted(() => ({
  mockCreateSocket: vi.fn(),
  mockSpawn: vi.fn(),
}));

vi.mock("node:dgram", () => ({
  default: { createSocket: mockCreateSocket },
}));

import { sendMagicPacket } from "~/server/util/wol/sendMagicPacket";

function makeFakeSocket(sendError: Error | null) {
  return {
    bind: (cb: () => void) => cb(),
    setBroadcast: vi.fn(),
    send: (
      _packet: Buffer,
      _offset: number,
      _length: number,
      _port: number,
      _address: string,
      cb: (_err: Error | null) => void,
    ) => cb(sendError),
    once: vi.fn(),
    close: vi.fn(),
  };
}

function fakeWakeonlanProc(exitCode: number, stderrText = "") {
  return {
    exited: Promise.resolve(exitCode),
    stdout: new ReadableStream(),
    stderr: new ReadableStream({
      start(controller) {
        if (stderrText)
          controller.enqueue(new TextEncoder().encode(stderrText));
        controller.close();
      },
    }),
  };
}

// Bun.spawn() is a Bun-only global that's undefined under Vitest's worker
// processes (see CLAUDE.md's "Environment variables in tests") — stub it
// explicitly rather than relying on it existing.
describe("sendMagicPacket", () => {
  beforeEach(() => {
    mockCreateSocket.mockReset();
    mockSpawn.mockReset();
    delete process.env.WOL_SEND_METHOD;
    vi.stubGlobal("Bun", { spawn: mockSpawn });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends via dgram by default (auto) and reports method dgram", async () => {
    mockCreateSocket.mockReturnValue(makeFakeSocket(null));

    const result = await sendMagicPacket("AA:BB:CC:DD:EE:FF", "192.168.1.255");

    expect(result).toEqual({ method: "dgram" });
    expect(mockCreateSocket).toHaveBeenCalledWith("udp4");
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it("falls back to the wakeonlan CLI when dgram fails with EACCES, in auto mode", async () => {
    const eacces = Object.assign(new Error("permission denied"), {
      code: "EACCES",
    });
    mockCreateSocket.mockReturnValue(makeFakeSocket(eacces));
    mockSpawn.mockReturnValue(fakeWakeonlanProc(0));

    const result = await sendMagicPacket("AA:BB:CC:DD:EE:FF", "192.168.1.255");

    expect(result).toEqual({ method: "wakeonlan" });
    expect(mockSpawn).toHaveBeenCalledWith(
      ["wakeonlan", "-i", "192.168.1.255", "AA:BB:CC:DD:EE:FF"],
      expect.objectContaining({ stdout: "pipe", stderr: "pipe" }),
    );
  });

  it("falls back to the wakeonlan CLI when dgram fails with ENOTSUP, in auto mode", async () => {
    const enotsup = Object.assign(new Error("not supported"), {
      code: "ENOTSUP",
    });
    mockCreateSocket.mockReturnValue(makeFakeSocket(enotsup));
    mockSpawn.mockReturnValue(fakeWakeonlanProc(0));

    const result = await sendMagicPacket("AA:BB:CC:DD:EE:FF", "192.168.1.255");

    expect(result).toEqual({ method: "wakeonlan" });
  });

  it("propagates a non-broadcast-permission dgram error in auto mode without falling back", async () => {
    const otherErr = Object.assign(new Error("boom"), { code: "ENOENT" });
    mockCreateSocket.mockReturnValue(makeFakeSocket(otherErr));

    await expect(
      sendMagicPacket("AA:BB:CC:DD:EE:FF", "192.168.1.255"),
    ).rejects.toThrow("boom");
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it("WOL_SEND_METHOD=dgram never falls back, even on an EACCES failure", async () => {
    process.env.WOL_SEND_METHOD = "dgram";
    const eacces = Object.assign(new Error("permission denied"), {
      code: "EACCES",
    });
    mockCreateSocket.mockReturnValue(makeFakeSocket(eacces));

    await expect(
      sendMagicPacket("AA:BB:CC:DD:EE:FF", "192.168.1.255"),
    ).rejects.toThrow("permission denied");
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it("WOL_SEND_METHOD=wakeonlan skips dgram entirely", async () => {
    process.env.WOL_SEND_METHOD = "wakeonlan";
    mockSpawn.mockReturnValue(fakeWakeonlanProc(0));

    const result = await sendMagicPacket("AA:BB:CC:DD:EE:FF", "192.168.1.255");

    expect(result).toEqual({ method: "wakeonlan" });
    expect(mockCreateSocket).not.toHaveBeenCalled();
  });

  it("throws when the wakeonlan CLI exits non-zero", async () => {
    process.env.WOL_SEND_METHOD = "wakeonlan";
    mockSpawn.mockReturnValue(fakeWakeonlanProc(1, "no such device"));

    await expect(
      sendMagicPacket("AA:BB:CC:DD:EE:FF", "192.168.1.255"),
    ).rejects.toThrow(/exited with code 1/);
  });
});
