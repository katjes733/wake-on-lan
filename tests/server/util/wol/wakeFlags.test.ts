import { describe, it, expect, vi, beforeEach } from "vitest";

// TypeORM's raw query() wraps UPDATE/DELETE results as [rows, rowCount] but
// returns INSERT/SELECT results as a plain rows array — a real bug was
// caused by consumeWakeFlag() not accounting for this distinction (it always
// returned woken:true because the outer 2-element tuple's .length was never
// 0). These mocks encode the exact real driver shapes to lock that in.
const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));

vi.mock("~/server/database/datasource", () => ({
  default: { getInstance: vi.fn(async () => ({ query: mockQuery })) },
  qualifiedTable: (table: string) => `"wake_on_lan".${table}`,
}));

const { armWakeFlag, consumeWakeFlag } =
  await import("~/server/util/wol/wakeFlags");

describe("consumeWakeFlag", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("returns woken:false when no row matches (UPDATE tuple shape: [[], 0])", async () => {
    mockQuery.mockResolvedValueOnce([[], 0]);
    const result = await consumeWakeFlag("target-1", 60);
    expect(result).toEqual({ woken: false });
  });

  it("returns woken:true with triggeredAt when a row matches (UPDATE tuple shape: [[row], 1])", async () => {
    const triggeredAt = new Date("2026-01-01T00:00:00Z");
    mockQuery.mockResolvedValueOnce([[{ triggered_at: triggeredAt }], 1]);
    const result = await consumeWakeFlag("target-1", 60);
    expect(result).toEqual({ woken: true, triggeredAt });
  });

  it("passes targetId and withinSeconds through as query parameters", async () => {
    mockQuery.mockResolvedValueOnce([[], 0]);
    await consumeWakeFlag("target-42", 120);
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("UPDATE"), [
      "target-42",
      120,
    ]);
  });
});

describe("armWakeFlag", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("returns triggeredAt from the INSERT ... RETURNING row (plain rows array, not a tuple)", async () => {
    const triggeredAt = new Date("2026-01-01T00:00:00Z");
    mockQuery.mockResolvedValueOnce([{ triggered_at: triggeredAt }]);
    const result = await armWakeFlag("target-1");
    expect(result).toEqual({ triggeredAt });
  });
});
