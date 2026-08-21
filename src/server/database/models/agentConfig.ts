import { EntitySchema } from "typeorm";
import type { IBasicEntity } from "~/server/types/common";
import type { ITarget } from "~/server/database/models/target";

export interface IAgentConfig {
  target_id: string;
  // Validated against AgentConfigSchema (src/shared/schemas/agentConfig.ts)
  // on the way in and out — this column just stores whatever shape that
  // schema currently defines, so adding a new config field later never
  // needs a migration.
  config: Record<string, unknown>;
  target?: ITarget;
}

// One row per target — enforced by the unique index on target_id, not by
// application logic, same pattern as WakeFlag/ShutdownFlag. Saving agent
// config upserts this row (ON CONFLICT DO UPDATE) rather than inserting a
// new one.
export const AgentConfig = new EntitySchema<IBasicEntity & IAgentConfig>({
  name: "AgentConfig",
  tableName: "agent_configs",
  columns: {
    id: { type: "uuid", primary: true, generated: "uuid", nullable: false },
    creation_time: { type: "timestamp with time zone", nullable: false },
    modified_time: { type: "timestamp with time zone", nullable: false },
    target_id: { type: "uuid", nullable: false },
    config: { type: "jsonb", nullable: false, default: {} },
  },
  indices: [
    {
      name: "idx_agent_configs_target_id",
      columns: ["target_id"],
      unique: true,
    },
  ],
  relations: {
    target: {
      type: "many-to-one",
      target: "Target",
      joinColumn: { name: "target_id" },
      onDelete: "CASCADE",
      nullable: false,
    },
  },
});
