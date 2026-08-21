import { appendFileSync } from "fs";

export type LogLevel = "info" | "warn" | "error";

export interface AgentLogger {
  log(level: LogLevel, fields: Record<string, unknown>, msg: string): void;
  setLokiPushUrl(url: string | null | undefined): void;
}

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export interface AgentLoggerDeps {
  appendFile?: typeof appendFileSync;
  fetchFn?: FetchFn;
}

/**
 * Every call writes a local file line first — the one thing that never
 * depends on the network, so logging still works if Loki (or the network
 * entirely) is unreachable. The Loki push on top of that is always
 * best-effort/fire-and-forget: a failed push is swallowed, never thrown,
 * since Loki being briefly down (e.g. during a NAS reboot) must never break
 * the agent's real job.
 */
export function createLogger(
  options: { targetId: string; logFilePath: string },
  deps: AgentLoggerDeps = {},
): AgentLogger {
  const appendFile = deps.appendFile ?? appendFileSync;
  const fetchFn = deps.fetchFn ?? fetch;
  let lokiPushUrl: string | null = null;

  return {
    setLokiPushUrl(url) {
      lokiPushUrl = url ?? null;
    },
    log(level, fields, msg) {
      const line = JSON.stringify({
        level,
        service: "agent",
        targetId: options.targetId,
        time: new Date().toISOString(),
        ...fields,
        msg,
      });

      try {
        appendFile(options.logFilePath, line + "\n");
      } catch {
        // Nowhere left to report a local logging failure to.
      }

      if (!lokiPushUrl) return;
      void fetchFn(lokiPushUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          streams: [
            {
              stream: { service: "agent", target_id: options.targetId },
              values: [[`${Date.now()}000000`, line]],
            },
          ],
        }),
      }).catch(() => {});
    },
  };
}
