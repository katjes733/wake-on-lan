import { v4 as uuidv4 } from "uuid";
import AppDataSource, { qualifiedTable } from "~/server/database/datasource";
import {
  AgentConfigSchema,
  type AgentConfigInput,
} from "~/shared/schemas/agentConfig";

/**
 * Returns the target's agent config, or schema defaults if no row exists
 * yet — a freshly created target has no AgentConfig row, and callers (the
 * agent's very first startup call, or the UI's settings dialog) shouldn't
 * have to special-case a 404 for that.
 */
export async function getAgentConfig(
  targetId: string,
): Promise<AgentConfigInput> {
  const ds = await AppDataSource.getInstance();
  const [row] = await ds.query(
    `SELECT config FROM ${qualifiedTable("agent_configs")}
     WHERE target_id = $1;`,
    [targetId],
  );
  return AgentConfigSchema.parse(row?.config ?? {});
}

/**
 * Upserts the target's single agent_configs row — a raw INSERT ... ON
 * CONFLICT, same pattern as armWakeFlag/armShutdownFlag, so this stays a
 * single atomic round-trip.
 */
export async function upsertAgentConfig(
  targetId: string,
  config: AgentConfigInput,
): Promise<void> {
  const ds = await AppDataSource.getInstance();
  await ds.query(
    `INSERT INTO ${qualifiedTable("agent_configs")}
       (id, target_id, config, creation_time, modified_time)
     VALUES ($1, $2, $3, now(), now())
     ON CONFLICT (target_id) DO UPDATE
       SET config = EXCLUDED.config,
           modified_time = EXCLUDED.modified_time;`,
    [uuidv4(), targetId, JSON.stringify(config)],
  );
}
