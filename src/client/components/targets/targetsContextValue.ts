import { createContext } from "react";
import type {
  ApiTarget,
  TargetInput,
  WakeResult,
} from "~/client/api/targetsApi";

export type TargetsContextType = {
  targets: ApiTarget[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  create: (input: TargetInput) => Promise<ApiTarget>;
  update: (id: string, input: Partial<TargetInput>) => Promise<ApiTarget>;
  remove: (id: string) => Promise<void>;
  wake: (id: string) => Promise<WakeResult>;
};

const notMounted = () => {
  throw new Error("TargetsProvider is not mounted");
};

export const TargetsContext = createContext<TargetsContextType>({
  targets: [],
  loading: false,
  error: null,
  refresh: async () => {},
  create: notMounted,
  update: notMounted,
  remove: notMounted,
  wake: notMounted,
});
