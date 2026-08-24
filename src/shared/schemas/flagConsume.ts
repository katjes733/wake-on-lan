import { z } from "zod";

// Shared by both /wol-flag/consume and /shutdown-flag/consume — identical
// shape, no reason to duplicate it. The cap was raised from 3600 to 14400:
// callers now compute withinSeconds dynamically from their own uptime (see
// the agent's computeWolWithinSeconds) rather than a fixed guess, so this
// ceiling only matters for an extreme, pathologically slow boot.
export const FlagConsumeSchema = z.object({
  withinSeconds: z.number().positive().max(14400),
});
export type FlagConsumeInput = z.infer<typeof FlagConsumeSchema>;
