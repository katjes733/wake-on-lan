import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockNetworkInterfaces, mockAgentFetch } = vi.hoisted(() => ({
  mockNetworkInterfaces: vi.fn(),
  mockAgentFetch: vi.fn(),
}));

vi.mock("os", () => ({
  default: { networkInterfaces: mockNetworkInterfaces },
  networkInterfaces: mockNetworkInterfaces,
}));

vi.mock("~/agent/httpClient", () => ({
  agentFetch: mockAgentFetch,
}));

const { getLocalMacAddresses, resolveTargetId } =
  await import("~/agent/selfIdentify");

describe("getLocalMacAddresses", () => {
  it("returns every real MAC address found, across all interfaces", () => {
    mockNetworkInterfaces.mockReturnValue({
      eth0: [{ mac: "AA:BB:CC:DD:EE:FF" }],
      wlan0: [{ mac: "11:22:33:44:55:66" }],
    });
    expect(getLocalMacAddresses()).toEqual([
      "AA:BB:CC:DD:EE:FF",
      "11:22:33:44:55:66",
    ]);
  });

  it("filters out the all-zero MAC (loopback/virtual adapters with no real address)", () => {
    mockNetworkInterfaces.mockReturnValue({
      lo: [{ mac: "00:00:00:00:00:00" }],
      eth0: [{ mac: "AA:BB:CC:DD:EE:FF" }],
    });
    expect(getLocalMacAddresses()).toEqual(["AA:BB:CC:DD:EE:FF"]);
  });

  it("returns an empty array when no interfaces have a MAC at all", () => {
    mockNetworkInterfaces.mockReturnValue({});
    expect(getLocalMacAddresses()).toEqual([]);
  });
});

describe("resolveTargetId", () => {
  beforeEach(() => {
    mockAgentFetch.mockReset();
  });

  it("returns the targetId on a successful match", async () => {
    mockAgentFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ targetId: "target-1" }),
    });
    const result = await resolveTargetId("https://server", [
      "AA:BB:CC:DD:EE:FF",
    ]);
    expect(result).toBe("target-1");
  });

  it("returns null when the server responds with 404 (no match)", async () => {
    mockAgentFetch.mockResolvedValue({ ok: false, status: 404 });
    const result = await resolveTargetId("https://server", [
      "AA:BB:CC:DD:EE:FF",
    ]);
    expect(result).toBeNull();
  });

  it("returns null (never throws) on a network error", async () => {
    mockAgentFetch.mockRejectedValue(new Error("network unreachable"));
    const result = await resolveTargetId("https://server", [
      "AA:BB:CC:DD:EE:FF",
    ]);
    expect(result).toBeNull();
  });
});
