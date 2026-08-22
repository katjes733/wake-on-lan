import { describe, it, expect } from "vitest";
import { evaluateShutdown } from "~/agent/util/evaluateShutdown";

describe("evaluateShutdown", () => {
  it("returns true when shutdown is true", () => {
    expect(evaluateShutdown({ shutdown: true, triggeredAt: "x" })).toBe(true);
  });

  it("returns false when shutdown is false", () => {
    expect(evaluateShutdown({ shutdown: false })).toBe(false);
  });
});
