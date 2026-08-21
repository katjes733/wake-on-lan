import { EntitySchema } from "typeorm";
import type { IBasicEntity } from "~/server/types/common";

export interface ITarget {
  name: string;
  mac_address: string;
  broadcast_address: string | null;
  static_ip: string | null;
  notes: string | null;
}

export const Target = new EntitySchema<IBasicEntity & ITarget>({
  name: "Target",
  tableName: "targets",
  columns: {
    id: { type: "uuid", primary: true, generated: "uuid", nullable: false },
    creation_time: { type: "timestamp with time zone", nullable: false },
    modified_time: { type: "timestamp with time zone", nullable: false },
    name: { type: "varchar", length: 255, nullable: false },
    mac_address: { type: "varchar", length: 17, nullable: false },
    broadcast_address: { type: "varchar", length: 45, nullable: true },
    static_ip: { type: "varchar", length: 45, nullable: true },
    notes: { type: "text", nullable: true },
  },
  indices: [
    { name: "idx_targets_mac_address", columns: ["mac_address"], unique: true },
    { name: "idx_targets_name", columns: ["name"], unique: false },
  ],
});
