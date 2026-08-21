import { describe, it, expect, vi } from "vitest";
import { createLogger } from "~/agent/log";

describe("createLogger", () => {
  it("always writes a local file line, even with no Loki URL configured", () => {
    const appendFile = vi.fn();
    const fetchFn = vi.fn();
    const logger = createLogger(
      { targetId: "target-1", logFilePath: "agent.log" },
      { appendFile, fetchFn },
    );

    logger.log("info", { foo: "bar" }, "Something happened");

    expect(appendFile).toHaveBeenCalledTimes(1);
    const [path, line] = appendFile.mock.calls[0];
    expect(path).toBe("agent.log");
    expect(JSON.parse(line.trimEnd())).toMatchObject({
      level: "info",
      service: "agent",
      targetId: "target-1",
      foo: "bar",
      msg: "Something happened",
    });
    // No lokiPushUrl was ever set — the push must never be attempted.
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("pushes to Loki (fire-and-forget) once a push URL has been set", () => {
    const appendFile = vi.fn();
    const fetchFn = vi.fn().mockResolvedValue({ ok: true });
    const logger = createLogger(
      { targetId: "target-1", logFilePath: "agent.log" },
      { appendFile, fetchFn },
    );

    logger.setLokiPushUrl("http://192.168.2.103:3100/loki/api/v1/push");
    logger.log("error", {}, "Something failed");

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, options] = fetchFn.mock.calls[0];
    expect(url).toBe("http://192.168.2.103:3100/loki/api/v1/push");
    const body = JSON.parse(options.body);
    expect(body.streams[0].stream).toEqual({
      service: "agent",
      target_id: "target-1",
    });
  });

  it("still writes the local file line even when the Loki push rejects", async () => {
    const appendFile = vi.fn();
    const fetchFn = vi.fn().mockRejectedValue(new Error("network unreachable"));
    const logger = createLogger(
      { targetId: "target-1", logFilePath: "agent.log" },
      { appendFile, fetchFn },
    );

    logger.setLokiPushUrl("http://192.168.2.103:3100/loki/api/v1/push");
    expect(() => logger.log("error", {}, "Something failed")).not.toThrow();
    expect(appendFile).toHaveBeenCalledTimes(1);

    // Let the rejected promise's .catch(() => {}) settle so it doesn't
    // surface as an unhandled rejection in a later test.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it("does not throw when the local file write itself fails", () => {
    const appendFile = vi.fn(() => {
      throw new Error("ENOSPC: no space left on device");
    });
    const logger = createLogger(
      { targetId: "target-1", logFilePath: "agent.log" },
      { appendFile, fetchFn: vi.fn() },
    );

    expect(() => logger.log("error", {}, "Something failed")).not.toThrow();
  });

  it("clears the push URL when set to null/undefined, reverting to file-only logging", () => {
    const appendFile = vi.fn();
    const fetchFn = vi.fn();
    const logger = createLogger(
      { targetId: "target-1", logFilePath: "agent.log" },
      { appendFile, fetchFn },
    );

    logger.setLokiPushUrl("http://192.168.2.103:3100/loki/api/v1/push");
    logger.setLokiPushUrl(null);
    logger.log("info", {}, "Something happened");

    expect(fetchFn).not.toHaveBeenCalled();
  });
});
