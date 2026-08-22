import { describe, it, expect } from "vitest";
import { computeWolWithinSeconds } from "~/agent/util/computeWolWithinSeconds";

describe("computeWolWithinSeconds", () => {
  it("adds the boot buffer to a short uptime (login happened quickly after boot)", () => {
    expect(computeWolWithinSeconds(30, 90)).toBe(120);
  });

  it("scales with a large uptime (login delayed well after boot) without needing a separately-guessed constant", () => {
    // "woke it from my phone, arrived and logged in 40 minutes later" —
    // the whole point of computing this from uptime rather than a fixed
    // guess is that this case needs no special-casing at all.
    expect(computeWolWithinSeconds(40 * 60, 90)).toBe(2490);
  });

  it("rounds a fractional uptime up before adding the buffer", () => {
    expect(computeWolWithinSeconds(29.4, 90)).toBe(120);
  });
});
