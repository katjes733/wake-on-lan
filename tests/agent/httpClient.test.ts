import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { agentFetch } from "~/agent/httpClient";

describe("agentFetch", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("adds tls.rejectUnauthorized:false for a raw IPv4 host", async () => {
    await agentFetch("https://192.168.2.110:3001/api/v1/health/status-server");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://192.168.2.110:3001/api/v1/health/status-server",
      expect.objectContaining({ tls: { rejectUnauthorized: false } }),
    );
  });

  it("does not add the tls option for a real hostname", async () => {
    await agentFetch(
      "https://wake-on-lan.example.com/api/v1/health/status-server",
    );
    const [, options] = mockFetch.mock.calls[0];
    expect(options?.tls).toBeUndefined();
  });

  it("preserves other init options alongside the tls override", async () => {
    await agentFetch("https://192.168.2.110:3001/api/v1/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    expect(mockFetch).toHaveBeenCalledWith(
      "https://192.168.2.110:3001/api/v1/status",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        tls: { rejectUnauthorized: false },
      }),
    );
  });
});
