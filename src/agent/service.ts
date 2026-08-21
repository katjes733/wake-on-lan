import type { AgentBootstrapConfig } from "~/agent/config";
import {
  getAgentConfig,
  postStatus,
  postShutdownFlagConsume,
} from "~/agent/httpClient";
import { createLogger, type AgentLogger } from "~/agent/log";
import { evaluateShutdown } from "~/agent/util/evaluateShutdown";
import { AGENT_VERSION } from "~/agent/version";

// A few multiples of the poll interval, so a single missed tick doesn't
// immediately make the server think the flag went stale.
const SHUTDOWN_WITHIN_SECONDS_MULTIPLIER = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Actually shuts the machine down. Guarded to only ever run on Windows —
 * this file is also imported when sanity-testing the service loop's HTTP
 * logic from a dev machine, and shutting down the developer's own machine
 * would be a very bad way to find a bug.
 */
async function shutDownMachine(logger: AgentLogger): Promise<void> {
  if (process.platform !== "win32") {
    logger.log(
      "warn",
      { platform: process.platform },
      "Shutdown consumed, but skipping actual shutdown on a non-Windows platform",
    );
    return;
  }
  Bun.spawn(["shutdown", "/s", "/t", "0"]);
}

/**
 * SYSTEM service, NSSM-wrapped, starts at boot. Heartbeat + shutdown-poll
 * only — never touches scripts or wol-flag/consume, since those need real
 * desktop-session access this mode doesn't have (see bootHooks.ts).
 */
export async function runService(config: AgentBootstrapConfig): Promise<void> {
  const logger = createLogger({
    targetId: config.targetId,
    logFilePath: config.logFilePath,
  });
  logger.log("info", {}, "Agent service started");

  for (;;) {
    let pollIntervalSeconds = config.defaultPollIntervalSeconds;
    try {
      const agentConfig = await getAgentConfig(config);
      logger.setLokiPushUrl(agentConfig.lokiPushUrl);
      pollIntervalSeconds =
        agentConfig.pollIntervalSeconds ?? config.defaultPollIntervalSeconds;

      await postStatus(config, { agentVersion: AGENT_VERSION });
      logger.log("info", {}, "Heartbeat sent");

      if (agentConfig.shutdownEnabled) {
        const withinSeconds =
          pollIntervalSeconds * SHUTDOWN_WITHIN_SECONDS_MULTIPLIER;
        const result = await postShutdownFlagConsume(config, withinSeconds);
        if (evaluateShutdown(result)) {
          logger.log("info", {}, "Shutdown consumed, shutting down");
          await shutDownMachine(logger);
        }
      }
    } catch (err) {
      logger.log(
        "error",
        { err: err instanceof Error ? err.message : String(err) },
        "Service loop error",
      );
    }
    await sleep(pollIntervalSeconds * 1000);
  }
}
