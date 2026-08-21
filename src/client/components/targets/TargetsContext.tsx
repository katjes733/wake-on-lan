import { useCallback, useEffect, useState, type ReactNode } from "react";
import { TargetsContext } from "./targetsContextValue";
import * as targetsApi from "~/client/api/targetsApi";
import type { ApiTarget, TargetInput } from "~/client/api/targetsApi";
import { useNotification } from "~/client/components/notification/useNotification";

export const TargetsProvider = ({ children }: { children: ReactNode }) => {
  const [targets, setTargets] = useState<ApiTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { showNotification } = useNotification();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await targetsApi.listTargets();
      setTargets(data);
      setError(null);
    } catch {
      setError("Failed to load targets");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const create = useCallback(async (input: TargetInput) => {
    const target = await targetsApi.createTarget(input);
    setTargets((prev) =>
      [...prev, target].sort((a, b) => a.name.localeCompare(b.name)),
    );
    return target;
  }, []);

  const update = useCallback(
    async (id: string, input: Partial<TargetInput>) => {
      const target = await targetsApi.updateTarget(id, input);
      setTargets((prev) =>
        prev
          .map((t) => (t.id === id ? target : t))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
      return target;
    },
    [],
  );

  const remove = useCallback(async (id: string) => {
    await targetsApi.deleteTarget(id);
    setTargets((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const wake = useCallback(
    async (id: string) => {
      const result = await targetsApi.wakeTarget(id);
      if (result.sent) {
        showNotification("Wake packet sent", "success");
      } else {
        showNotification(
          "Wake flag recorded, but sending the packet failed",
          "warning",
        );
      }
      return result;
    },
    [showNotification],
  );

  return (
    <TargetsContext.Provider
      value={{ targets, loading, error, refresh, create, update, remove, wake }}
    >
      {children}
    </TargetsContext.Provider>
  );
};
