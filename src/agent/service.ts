import os from "os";
import type { AgentBootstrapConfig } from "~/agent/config";
import {
  getAgentConfig,
  postStatus,
  postShutdownFlagConsume,
  postOffline,
  postWolFlagConsume,
  postManualScriptFlagConsume,
} from "~/agent/httpClient";
import { createLogger, type AgentLogger } from "~/agent/log";
import { evaluateShutdown } from "~/agent/util/evaluateShutdown";
import { createShutdownHandler } from "~/agent/util/gracefulShutdown";
import { computeWolWithinSeconds } from "~/agent/util/computeWolWithinSeconds";
import {
  runScriptIfConfigured,
  type RunScriptResult,
} from "~/agent/util/runScriptIfConfigured";
import { AGENT_VERSION } from "~/agent/version";

// A few multiples of the poll interval, so a single missed tick doesn't
// immediately make the server think the flag went stale.
const SHUTDOWN_WITHIN_SECONDS_MULTIPLIER = 3;

// Kept short and well under NSSM's own stop-method escalation timeouts —
// this is a best-effort courtesy call, not something worth risking a forced
// TerminateProcess over if the network happens to be slow right then.
const SHUTDOWN_NOTIFY_TIMEOUT_MS = 1500;

// SIGINT/SIGBREAK are how NSSM (and Windows more generally) asks a console
// process to stop — via a generated Ctrl+C/Ctrl+Break event — for both an
// explicit service stop and a real OS shutdown/reboot. SIGTERM is included
// for parity with how the loop is also run un-wrapped during local testing.
const SHUTDOWN_SIGNALS = ["SIGINT", "SIGTERM", "SIGBREAK"] as const;

// Covers only the small, hardware-dependent gap between the magic packet
// arriving and Windows finishing POST/boot up to this service actually
// starting — the service starts automatically at boot, before any login,
// so unlike a logon-triggered check there's no separate boot→login gap to
// account for on top of that.
const BOOT_BUFFER_SECONDS = 90;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function logScriptResult(
  logger: AgentLogger,
  script: string,
  result: RunScriptResult,
): void {
  if (result.error) {
    logger.log(
      "error",
      { script, err: result.error },
      "Script execution failed",
    );
  } else if (result.ran) {
    logger.log(
      "info",
      { script, exitCode: result.exitCode },
      "Script executed",
    );
  }
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
 * Runs once, right at service startup, before the perpetual loop below.
 * Deliberately part of the SYSTEM service rather than a separate
 * per-logon task: local script/hardware automation (e.g. a CEC command)
 * has no real need for desktop-session access, and a script meant to
 * bring up a display needs to run *before* anyone could see a login
 * screen — gating it on a logon having already happened is backwards.
 */
async function runBootTimeScripts(
  config: AgentBootstrapConfig,
  logger: AgentLogger,
): Promise<void> {
  const agentConfig = await getAgentConfig(config);
  logger.setLokiPushUrl(agentConfig.lokiPushUrl);

  if (agentConfig.defaultScript) {
    const result = await runScriptIfConfigured(agentConfig.defaultScript);
    logScriptResult(logger, agentConfig.defaultScript, result);
  }

  const withinSeconds = computeWolWithinSeconds(
    os.uptime(),
    BOOT_BUFFER_SECONDS,
  );

  // Checked unconditionally, independent of wolAware below — the "wake
  // with script" button (AgentConfig.wakeWithScriptEnabled) forces
  // manualBootScript to run on this boot regardless of whether it turns
  // out to be WOL-triggered, so it can't be gated on the very detection
  // it's meant to override.
  let ranManualBootScript = false;
  const { triggered: forcedManualScript } = await postManualScriptFlagConsume(
    config,
    withinSeconds,
  );
  if (forcedManualScript && agentConfig.manualBootScript) {
    const result = await runScriptIfConfigured(agentConfig.manualBootScript);
    logScriptResult(logger, agentConfig.manualBootScript, result);
    ranManualBootScript = true;
  }

  if (agentConfig.wolAware) {
    const { woken } = await postWolFlagConsume(config, withinSeconds);
    if (woken && agentConfig.wolScript) {
      const result = await runScriptIfConfigured(agentConfig.wolScript);
      logScriptResult(logger, agentConfig.wolScript, result);
    } else if (!woken && !ranManualBootScript && agentConfig.manualBootScript) {
      const result = await runScriptIfConfigured(agentConfig.manualBootScript);
      logScriptResult(logger, agentConfig.manualBootScript, result);
    }
  }
}

/**
 * SYSTEM service, NSSM-wrapped, starts at boot. Runs the boot-time script
 * checks once, then loops forever sending heartbeats and polling for a
 * pending shutdown.
 */
export async function runService(config: AgentBootstrapConfig): Promise<void> {
  const logger = createLogger({
    targetId: config.targetId,
    logFilePath: config.logFilePath,
  });
  logger.log("info", {}, "Agent service started");

  const handleShutdownSignal = createShutdownHandler(
    {
      postOffline: () => postOffline(config),
      sleep,
      exit: (code) => process.exit(code),
      logger,
    },
    SHUTDOWN_NOTIFY_TIMEOUT_MS,
  );
  for (const signal of SHUTDOWN_SIGNALS) {
    process.on(signal, () => handleShutdownSignal(signal));
  }

  try {
    await runBootTimeScripts(config, logger);
  } catch (err) {
    logger.log(
      "error",
      { err: err instanceof Error ? err.message : String(err) },
      "Boot-time script check failed",
    );
  }

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
