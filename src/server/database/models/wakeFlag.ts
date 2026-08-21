import { EntitySchema } from "typeorm";
import type { IBasicEntity } from "~/server/types/common";
import type { ITarget } from "~/server/database/models/target";

export interface IWakeFlag {
  target_id: string;
  triggered_at: Date;
  consumed_at: Date | null;
  target?: ITarget;
}

// One row per target — enforced by the unique index on target_id, not by
// application logic. Sending a wake upserts this row (ON CONFLICT DO UPDATE)
// rather than inserting a new one, so this table's size is capped at the
// target count by construction. id/creation_time/modified_time are kept only
// for consistency with every other entity's IBasicEntity shape.
export const WakeFlag = new EntitySchema<IBasicEntity & IWakeFlag>({
  name: "WakeFlag",
  tableName: "wake_flags",
  columns: {
    id: { type: "uuid", primary: true, generated: "uuid", nullable: false },
    creation_time: { type: "timestamp with time zone", nullable: false },
    modified_time: { type: "timestamp with time zone", nullable: false },
    target_id: { type: "uuid", nullable: false },
    triggered_at: { type: "timestamp with time zone", nullable: false },
    consumed_at: { type: "timestamp with time zone", nullable: true },
  },
  indices: [
    { name: "idx_wake_flags_target_id", columns: ["target_id"], unique: true },
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
