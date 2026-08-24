import { vi, beforeEach, afterEach } from "vitest";
import type { MockInstance } from "vitest";
// Side-effect import: registers jest-dom's matchers (toBeInTheDocument(),
// toHaveValue(), etc.) with Vitest's `expect` at runtime — this is also
// listed directly in vitest.config.ts's setupFiles, so the registration
// itself doesn't depend on this import. What this import IS needed for is
// the *type* side: it's the one place in the whole program that pulls in
// jest-dom's ambient augmentation of Vitest's `Assertion` interface, so
// `tsc` recognizes those matchers everywhere else. Safe for non-DOM
// (node-environment) tests too — it only defines matcher functions, never
// touches `document` at import time.
import "@testing-library/jest-dom/vitest";

// ---------------------------------------------------------------------------
// Logger silencing — applies to every test automatically.
//
// To assert on log calls in a specific test, use logSpy():
//
//   import { logSpy } from "../setup";
//   expect(logSpy("error")).toHaveBeenCalledWith(
//     expect.objectContaining({ err: expect.anything() }),
//     "Magic packet send failed",
//   );
// ---------------------------------------------------------------------------

type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

const noop = (): void => {};

function makeChildStub(): unknown {
  const stub: Record<string, unknown> = {};
  for (const lvl of [
    "trace",
    "debug",
    "info",
    "warn",
    "error",
    "fatal",
  ] as LogLevel[]) {
    stub[lvl] = vi.fn(noop);
  }
  stub["child"] = vi.fn(makeChildStub);
  return stub;
}

beforeEach(() => {
  for (const lvl of [
    "trace",
    "debug",
    "info",
    "warn",
    "error",
    "fatal",
  ] as LogLevel[]) {
    vi.spyOn(logger, lvl).mockImplementation(noop);
  }
  vi.spyOn(logger, "child").mockImplementation(
    makeChildStub as typeof logger.child,
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * Returns the spy for a top-level logger method so you can assert on it.
 * Only valid inside a test body — the spy is set up in beforeEach.
 */
export function logSpy(level: LogLevel): MockInstance {
  return logger[level] as unknown as MockInstance;
}
