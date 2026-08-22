import { EntitySchema } from "typeorm";
import type { IBasicEntity } from "~/server/types/common";
import type { ITarget } from "~/server/database/models/target";

export interface IAgentStatus {
  target_id: string;
  last_seen_at: Date | null;
  agent_version: string | null;
  target?: ITarget;
}

// One row per target — enforced by the unique index on target_id, not by
// application logic, same pattern as WakeFlag/ShutdownFlag/AgentConfig. Kept
// as its own table (not columns on Target, not merged into AgentConfig) so
// frequent heartbeat writes (every ~30s) never contend with infrequent
// config edits on the same row.
export const AgentStatus = new EntitySchema<IBasicEntity & IAgentStatus>({
  name: "AgentStatus",
  tableName: "agent_statuses",
  columns: {
    id: { type: "uuid", primary: true, generated: "uuid", nullable: false },
    creation_time: { type: "timestamp with time zone", nullable: false },
    modified_time: { type: "timestamp with time zone", nullable: false },
    target_id: { type: "uuid", nullable: false },
    last_seen_at: { type: "timestamp with time zone", nullable: true },
    agent_version: { type: "varchar", length: 50, nullable: true },
  },
  indices: [
    {
      name: "idx_agent_statuses_target_id",
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
