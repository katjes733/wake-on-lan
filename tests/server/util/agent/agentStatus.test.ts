import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));

vi.mock("~/server/database/datasource", () => ({
  default: { getInstance: vi.fn(async () => ({ query: mockQuery })) },
  qualifiedTable: (table: string) => `"wake_on_lan".${table}`,
}));

const { recordHeartbeat, getAgentStatus } =
  await import("~/server/util/agent/agentStatus");

describe("getAgentStatus", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("returns nulls when no row exists yet for this target", async () => {
    mockQuery.mockResolvedValueOnce([]);
    const result = await getAgentStatus("target-1");
    expect(result).toEqual({ lastSeenAt: null, agentVersion: null });
  });

  it("returns the stored last_seen_at/agent_version when a row exists", async () => {
    const lastSeenAt = new Date("2026-01-01T00:00:00Z");
    mockQuery.mockResolvedValueOnce([
      { last_seen_at: lastSeenAt, agent_version: "1.2.3" },
    ]);
    const result = await getAgentStatus("target-1");
    expect(result).toEqual({ lastSeenAt, agentVersion: "1.2.3" });
  });
});

describe("recordHeartbeat", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("upserts via INSERT ... ON CONFLICT, passing targetId and agentVersion through", async () => {
    mockQuery.mockResolvedValueOnce([]);
    await recordHeartbeat("target-1", "1.2.3");
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("ON CONFLICT"),
      [expect.any(String), "target-1", "1.2.3"],
    );
  });

  it("passes null for agentVersion when not provided, relying on COALESCE to preserve the old value", async () => {
    mockQuery.mockResolvedValueOnce([]);
    await recordHeartbeat("target-1");
    expect(mockQuery).toHaveBeenCalledWith(expect.any(String), [
      expect.any(String),
      "target-1",
      null,
    ]);
  });
});
