import { z } from "zod";

export const WolFlagConsumeSchema = z.object({
  withinSeconds: z.number().positive().max(3600),
});
export type WolFlagConsumeInput = z.infer<typeof WolFlagConsumeSchema>;
