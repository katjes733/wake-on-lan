export interface RunScriptResult {
  ran: boolean;
  exitCode?: number;
  error?: string;
}

export type SpawnFn = (cmd: string[]) => { exited: Promise<number> };

/**
 * Runs the given local script reference if one is configured, capturing
 * any failure (missing file, non-zero exit, spawn error) rather than
 * throwing — a bad or stale script reference must never crash the agent
 * itself. scriptPath is always a reference to something that must already
 * exist on this machine; this function never receives script content.
 */
export async function runScriptIfConfigured(
  scriptPath: string | null | undefined,
  spawn: SpawnFn = (cmd) => Bun.spawn(cmd),
): Promise<RunScriptResult> {
  if (!scriptPath) return { ran: false };
  try {
    const proc = spawn([scriptPath]);
    const exitCode = await proc.exited;
    return { ran: true, exitCode };
  } catch (err) {
    return {
      ran: true,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
