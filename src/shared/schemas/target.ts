import { z } from "zod";

const MAC_PATTERN = /^([0-9a-fA-F]{2}[:-]){5}[0-9a-fA-F]{2}$|^[0-9a-fA-F]{12}$/;
const IPV4_PATTERN =
  /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

export const MacAddressSchema = z
  .string()
  .regex(MAC_PATTERN, "Invalid MAC address");
export const Ipv4Schema = z
  .string()
  .regex(IPV4_PATTERN, "Invalid IPv4 address");

export const TargetCreateSchema = z.object({
  name: z.string().min(1).max(255),
  macAddress: MacAddressSchema,
  broadcastAddress: Ipv4Schema.nullish(),
  staticIp: Ipv4Schema.nullish(),
  notes: z.string().max(2000).nullish(),
});
export type TargetCreateInput = z.infer<typeof TargetCreateSchema>;

export const TargetUpdateSchema = TargetCreateSchema.partial();
export type TargetUpdateInput = z.infer<typeof TargetUpdateSchema>;
