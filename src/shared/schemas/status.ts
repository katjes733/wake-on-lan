import { z } from "zod";

export const AgentStatusSchema = z.object({
  agentVersion: z.string().max(50).optional(),
});
export type AgentStatusInput = z.infer<typeof AgentStatusSchema>;
