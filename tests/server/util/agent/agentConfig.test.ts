import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));

vi.mock("~/server/database/datasource", () => ({
  default: { getInstance: vi.fn(async () => ({ query: mockQuery })) },
  qualifiedTable: (table: string) => `"wake_on_lan".${table}`,
}));

const { getAgentConfig, upsertAgentConfig } =
  await import("~/server/util/agent/agentConfig");

describe("getAgentConfig", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("returns schema defaults when no row exists yet for this target", async () => {
    mockQuery.mockResolvedValueOnce([]);
    const result = await getAgentConfig("target-1");
    expect(result).toEqual({
      wolAware: false,
      shutdownEnabled: false,
    });
  });

  it("returns the stored config when a row exists", async () => {
    mockQuery.mockResolvedValueOnce([
      {
        config: {
          wolAware: true,
          wolScript: "C:\\Scripts\\cec-silent-boot.ps1",
          shutdownEnabled: true,
          pollIntervalSeconds: 45,
        },
      },
    ]);
    const result = await getAgentConfig("target-1");
    expect(result).toEqual({
      wolAware: true,
      wolScript: "C:\\Scripts\\cec-silent-boot.ps1",
      shutdownEnabled: true,
      pollIntervalSeconds: 45,
    });
  });
});

describe("upsertAgentConfig", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("upserts via INSERT ... ON CONFLICT, passing the config as a JSON string parameter", async () => {
    mockQuery.mockResolvedValueOnce([]);
    await upsertAgentConfig("target-1", {
      wolAware: true,
      shutdownEnabled: false,
    });
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("ON CONFLICT"),
      [
        expect.any(String),
        "target-1",
        JSON.stringify({ wolAware: true, shutdownEnabled: false }),
      ],
    );
  });
});
