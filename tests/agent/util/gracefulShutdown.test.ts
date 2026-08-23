import { describe, it, expect, vi } from "vitest";
import { createShutdownHandler } from "~/agent/util/gracefulShutdown";
import type { AgentLogger } from "~/agent/log";

function makeLogger(): AgentLogger {
  return { log: vi.fn(), setLokiPushUrl: vi.fn() };
}

describe("createShutdownHandler", () => {
  it("calls postOffline, then exits once it resolves", async () => {
    const postOffline = vi.fn().mockResolvedValue(undefined);
    const sleep = vi.fn().mockResolvedValue(undefined);
    const exit = vi.fn();
    const logger = makeLogger();

    const handle = createShutdownHandler(
      { postOffline, sleep, exit, logger },
      1500,
    );
    handle("SIGINT");
    await new Promise((r) => setImmediate(r));

    expect(postOffline).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
    expect(logger.log).toHaveBeenCalledWith(
      "info",
      { signal: "SIGINT" },
      "Received shutdown signal — notifying server before exit",
    );
  });

  it("still exits if postOffline rejects, instead of hanging", async () => {
    const postOffline = vi.fn().mockRejectedValue(new Error("network down"));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const exit = vi.fn();

    const handle = createShutdownHandler(
      { postOffline, sleep, exit, logger: makeLogger() },
      1500,
    );
    handle("SIGTERM");
    await new Promise((r) => setImmediate(r));

    expect(exit).toHaveBeenCalledWith(0);
  });

  it("exits via the timeout race if postOffline never settles", async () => {
    const postOffline = vi.fn(() => new Promise<void>(() => {}));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const exit = vi.fn();

    const handle = createShutdownHandler(
      { postOffline, sleep, exit, logger: makeLogger() },
      1500,
    );
    handle("SIGBREAK");
    await new Promise((r) => setImmediate(r));

    expect(sleep).toHaveBeenCalledWith(1500);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("ignores a second signal once the first is already being handled", async () => {
    const postOffline = vi.fn().mockResolvedValue(undefined);
    const sleep = vi.fn().mockResolvedValue(undefined);
    const exit = vi.fn();

    const handle = createShutdownHandler(
      { postOffline, sleep, exit, logger: makeLogger() },
      1500,
    );
    handle("SIGINT");
    handle("SIGTERM");
    await new Promise((r) => setImmediate(r));

    expect(postOffline).toHaveBeenCalledTimes(1);
  });
});
