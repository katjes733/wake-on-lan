import { z } from "zod";

// forceManualBootScript is what the "wake with script" button (see
// AgentConfig.wakeWithScriptEnabled) sets — it arms ManualScriptFlag
// alongside the normal wake, so manualBootScript runs on the resulting
// boot regardless of whether that boot ends up detected as WOL-triggered.
export const WakeRequestSchema = z.object({
  forceManualBootScript: z.boolean().optional(),
});
export type WakeRequestInput = z.infer<typeof WakeRequestSchema>;
