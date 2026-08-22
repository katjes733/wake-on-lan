import os from "os";
import type { AgentBootstrapConfig } from "~/agent/config";
import { getAgentConfig, postWolFlagConsume } from "~/agent/httpClient";
import { createLogger, type AgentLogger } from "~/agent/log";
import {
  runScriptIfConfigured,
  type RunScriptResult,
} from "~/agent/util/runScriptIfConfigured";
import { computeWolWithinSeconds } from "~/agent/util/computeWolWithinSeconds";

// Covers only the small, hardware-dependent gap between the magic packet
// arriving and Windows finishing POST/boot — the separate, much larger
// boot→login gap is already covered by os.uptime() itself.
const BOOT_BUFFER_SECONDS = 90;

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
 * Runs once per logon, as the logging-on user — the only agent mode with
 * real desktop-session access, which is why script execution and the
 * wol-flag/consume check both live here rather than in the SYSTEM service.
 * Never a long-running process; exits when done.
 */
export async function runBootHooks(
  config: AgentBootstrapConfig,
): Promise<void> {
  const logger = createLogger({
    targetId: config.targetId,
    logFilePath: config.logFilePath,
  });

  try {
    const agentConfig = await getAgentConfig(config);
    logger.setLokiPushUrl(agentConfig.lokiPushUrl);

    if (agentConfig.defaultScript) {
      const result = await runScriptIfConfigured(agentConfig.defaultScript);
      logScriptResult(logger, agentConfig.defaultScript, result);
    }

    if (agentConfig.wolAware) {
      const withinSeconds = computeWolWithinSeconds(
        os.uptime(),
        BOOT_BUFFER_SECONDS,
      );
      const { woken } = await postWolFlagConsume(config, withinSeconds);
      if (woken && agentConfig.wolScript) {
        const result = await runScriptIfConfigured(agentConfig.wolScript);
        logScriptResult(logger, agentConfig.wolScript, result);
      }
    }
  } catch (err) {
    logger.log(
      "error",
      { err: err instanceof Error ? err.message : String(err) },
      "Boot hooks error",
    );
  }
}
