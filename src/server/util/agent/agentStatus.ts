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
