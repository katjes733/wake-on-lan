import { z } from "zod";

export const AgentConfigSchema = z.object({
  wolAware: z.boolean().default(false),
  defaultScript: z.string().max(255).nullish(),
  wolScript: z.string().max(255).nullish(),
  manualBootScript: z.string().max(255).nullish(),
  shutdownEnabled: z.boolean().default(false),
  pollIntervalSeconds: z.number().int().positive().nullish(),
  // e.g. http://192.168.2.103:3100/loki/api/v1/push — where the agent ships
  // its own logs directly, alongside its always-on local file.
  lokiPushUrl: z.string().url().nullish(),
});
export type AgentConfigInput = z.infer<typeof AgentConfigSchema>;
