import { useCallback, useEffect, useState, type ReactNode } from "react";
import { TargetsContext } from "./targetsContextValue";
import * as targetsApi from "~/client/api/targetsApi";
import type { ApiTarget, TargetInput } from "~/client/api/targetsApi";
import { useNotification } from "~/client/components/notification/useNotification";

// How often to silently re-fetch targets in the background so online/offline
// status stays live without a manual refresh. "Silent" means it never
// touches loading/error state — see refresh() below — so it doesn't flicker
// the whole page into its loading spinner every tick.
const STATUS_POLL_MS = 20_000;

export const TargetsProvider = ({ children }: { children: ReactNode }) => {
  const [targets, setTargets] = useState<ApiTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { showNotification } = useNotification();

  const refresh = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const data = await targetsApi.listTargets();
      setTargets(data);
      if (!opts?.silent) setError(null);
    } catch {
      if (!opts?.silent) setError("Failed to load targets");
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(
      () => refresh({ silent: true }),
      STATUS_POLL_MS,
    );

    // Browsers throttle or fully pause setInterval in backgrounded tabs, so
    // a status change (e.g. a target shutting down) while the tab isn't
    // focused can sit stale for well past STATUS_POLL_MS. Re-fetching the
    // instant the tab becomes visible/focused again closes that gap without
    // needing a manual reload.
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh({ silent: true });
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
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
      try {
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
      } catch (err) {
        showNotification("Failed to send wake request", "error");
        throw err;
      }
    },
    [showNotification],
  );

  const shutdown = useCallback(
    async (id: string) => {
      try {
        const result = await targetsApi.shutdownTarget(id);
        showNotification("Shutdown requested", "success");
        return result;
      } catch (err) {
        showNotification("Failed to request shutdown", "error");
        throw err;
      }
    },
    [showNotification],
  );

  return (
    <TargetsContext.Provider
      value={{
        targets,
        loading,
        error,
        refresh,
        create,
        update,
        remove,
        wake,
        shutdown,
      }}
    >
      {children}
    </TargetsContext.Provider>
  );
};
