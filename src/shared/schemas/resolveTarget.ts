import { z } from "zod";
import { MacAddressSchema } from "~/shared/schemas/target";

// Sent by the agent at startup when it needs to identify itself — every
// local MAC address it can find, not just one, since the server-side match
// naturally filters to whichever one is actually registered as a target.
export const ResolveTargetSchema = z.object({
  macAddresses: z.array(MacAddressSchema).min(1).max(16),
});
export type ResolveTargetInput = z.infer<typeof ResolveTargetSchema>;
