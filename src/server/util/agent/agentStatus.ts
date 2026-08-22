import { v4 as uuidv4 } from "uuid";
import AppDataSource, { qualifiedTable } from "~/server/database/datasource";

export interface AgentStatusResult {
  lastSeenAt: Date | null;
  agentVersion: string | null;
}

/**
 * Upserts the target's single agent_statuses row on every heartbeat.
 * agent_version uses COALESCE so a heartbeat call that doesn't report a
 * version (an older agent build, or a transient omission) never clobbers a
 * previously-reported one.
 */
export async function recordHeartbeat(
  targetId: string,
  agentVersion?: string,
): Promise<void> {
  const ds = await AppDataSource.getInstance();
  await ds.query(
    `INSERT INTO ${qualifiedTable("agent_statuses")}
       (id, target_id, last_seen_at, agent_version, creation_time, modified_time)
     VALUES ($1, $2, now(), $3, now(), now())
     ON CONFLICT (target_id) DO UPDATE
       SET last_seen_at = EXCLUDED.last_seen_at,
           agent_version = COALESCE(EXCLUDED.agent_version, agent_statuses.agent_version),
           modified_time = EXCLUDED.modified_time;`,
    [uuidv4(), targetId, agentVersion ?? null],
  );
}

/**
 * Marks the target offline immediately, rather than waiting for
 * AGENT_STALE_THRESHOLD_SECONDS to pass with no heartbeat. Called right
 * when a shutdown-flag consume succeeds — the server already knows at that
 * exact moment the machine is about to power off; a real heartbeat will
 * naturally resume once it next boots and the agent starts up again. A
 * no-op if there's no agent_statuses row yet (nothing to clear).
 */
export async function clearHeartbeat(targetId: string): Promise<void> {
  const ds = await AppDataSource.getInstance();
  await ds.query(
    `UPDATE ${qualifiedTable("agent_statuses")}
       SET last_seen_at = NULL, modified_time = now()
     WHERE target_id = $1;`,
    [targetId],
  );
}

export async function getAgentStatus(
  targetId: string,
): Promise<AgentStatusResult> {
  const ds = await AppDataSource.getInstance();
  const [row] = await ds.query(
    `SELECT last_seen_at, agent_version
     FROM ${qualifiedTable("agent_statuses")}
     WHERE target_id = $1;`,
    [targetId],
  );
  return {
    lastSeenAt: row?.last_seen_at ?? null,
    agentVersion: row?.agent_version ?? null,
  };
}
