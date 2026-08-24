import { describe, it, expect, vi, beforeEach } from "vitest";

// Same tuple-shape gotcha as wakeFlags.test.ts/shutdownFlags.test.ts —
// TypeORM's raw query() wraps UPDATE/DELETE results as [rows, rowCount] but
// returns INSERT/SELECT results as a plain rows array.
const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));

vi.mock("~/server/database/datasource", () => ({
  default: { getInstance: vi.fn(async () => ({ query: mockQuery })) },
  qualifiedTable: (table: string) => `"wake_on_lan".${table}`,
}));

const { armManualScriptFlag, consumeManualScriptFlag } =
  await import("~/server/util/wol/manualScriptFlag");

describe("consumeManualScriptFlag", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("returns triggered:false when no row matches (UPDATE tuple shape: [[], 0])", async () => {
    mockQuery.mockResolvedValueOnce([[], 0]);
    const result = await consumeManualScriptFlag("target-1", 60);
    expect(result).toEqual({ triggered: false });
  });

  it("returns triggered:true with triggeredAt when a row matches (UPDATE tuple shape: [[row], 1])", async () => {
    const triggeredAt = new Date("2026-01-01T00:00:00Z");
    mockQuery.mockResolvedValueOnce([[{ triggered_at: triggeredAt }], 1]);
    const result = await consumeManualScriptFlag("target-1", 60);
    expect(result).toEqual({ triggered: true, triggeredAt });
  });

  it("passes targetId and withinSeconds through as query parameters", async () => {
    mockQuery.mockResolvedValueOnce([[], 0]);
    await consumeManualScriptFlag("target-42", 120);
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("UPDATE"), [
      "target-42",
      120,
    ]);
  });
});

describe("armManualScriptFlag", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("returns triggeredAt from the INSERT ... RETURNING row (plain rows array, not a tuple)", async () => {
    const triggeredAt = new Date("2026-01-01T00:00:00Z");
    mockQuery.mockResolvedValueOnce([{ triggered_at: triggeredAt }]);
    const result = await armManualScriptFlag("target-1");
    expect(result).toEqual({ triggeredAt });
  });
});
