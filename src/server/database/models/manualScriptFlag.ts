import { EntitySchema } from "typeorm";
import type { IBasicEntity } from "~/server/types/common";
import type { ITarget } from "~/server/database/models/target";

export interface IManualScriptFlag {
  target_id: string;
  triggered_at: Date;
  consumed_at: Date | null;
  target?: ITarget;
}

// Lets a Wake click force manualBootScript to run on the resulting boot even
// when the boot itself is WOL-triggered (which would otherwise run wolScript
// instead, or nothing) — e.g. waking the machine remotely but still wanting
// whatever manualBootScript does (turning on a display via CEC, say) to run
// too. Same shape and same upsert-per-target pattern as WakeFlag/ShutdownFlag
// — a dedicated entity+function pair per concern, not a generic mechanism.
export const ManualScriptFlag = new EntitySchema<
  IBasicEntity & IManualScriptFlag
>({
  name: "ManualScriptFlag",
  tableName: "manual_script_flags",
  columns: {
    id: { type: "uuid", primary: true, generated: "uuid", nullable: false },
    creation_time: { type: "timestamp with time zone", nullable: false },
    modified_time: { type: "timestamp with time zone", nullable: false },
    target_id: { type: "uuid", nullable: false },
    triggered_at: { type: "timestamp with time zone", nullable: false },
    consumed_at: { type: "timestamp with time zone", nullable: true },
  },
  indices: [
    {
      name: "idx_manual_script_flags_target_id",
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
