import type { AgentLogger } from "~/agent/log";

export interface GracefulShutdownDeps {
  postOffline: () => Promise<void>;
  sleep: (ms: number) => Promise<void>;
  exit: (code: number) => void;
  logger: AgentLogger;
}

/**
 * Builds the OS shutdown-signal handler for the service loop. Kept separate
 * from service.ts (and its deps injected) purely so this — the one part of
 * the loop that isn't just "wait, then make an HTTP call" — can be unit
 * tested without a real process/network.
 *
 * Races the offline beacon against timeoutMs rather than just awaiting it:
 * the OS only gives a stopping process a short grace window before killing
 * it outright, so a slow/hanging request must not delay exit past that.
 */
export function createShutdownHandler(
  deps: GracefulShutdownDeps,
  timeoutMs: number,
): (signal: string) => void {
  let handled = false;
  return (signal: string) => {
    if (handled) return;
    handled = true;
    deps.logger.log(
      "info",
      { signal },
      "Received shutdown signal — notifying server before exit",
    );
    void Promise.race([
      deps.postOffline().catch(() => {}),
      deps.sleep(timeoutMs),
    ]).finally(() => deps.exit(0));
  };
}
