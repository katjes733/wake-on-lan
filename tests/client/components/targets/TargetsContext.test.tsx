// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act, cleanup } from "@testing-library/react";
import type { ReactNode } from "react";
import { TargetsProvider } from "~/client/components/targets/TargetsContext";
import { useTargets } from "~/client/components/targets/useTargets";
import type { ApiTarget } from "~/client/api/targetsApi";

const {
  mockListTargets,
  mockCreateTarget,
  mockUpdateTarget,
  mockDeleteTarget,
  mockWakeTarget,
  mockShutdownTarget,
} = vi.hoisted(() => ({
  mockListTargets: vi.fn(),
  mockCreateTarget: vi.fn(),
  mockUpdateTarget: vi.fn(),
  mockDeleteTarget: vi.fn(),
  mockWakeTarget: vi.fn(),
  mockShutdownTarget: vi.fn(),
}));

vi.mock("~/client/api/targetsApi", () => ({
  listTargets: mockListTargets,
  createTarget: mockCreateTarget,
  updateTarget: mockUpdateTarget,
  deleteTarget: mockDeleteTarget,
  wakeTarget: mockWakeTarget,
  shutdownTarget: mockShutdownTarget,
}));

function makeTarget(overrides: Partial<ApiTarget> = {}): ApiTarget {
  return {
    id: "target-1",
    name: "HTPC",
    macAddress: "AA:BB:CC:DD:EE:FF",
    broadcastAddress: null,
    staticIp: null,
    notes: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    lastSeenAt: null,
    online: false,
    agentVersion: null,
    agentConfig: {
      wolAware: false,
      shutdownEnabled: false,
      wakeWithScriptEnabled: false,
    },
    ...overrides,
  };
}

function wrapper({ children }: { children: ReactNode }) {
  return <TargetsProvider>{children}</TargetsProvider>;
}

describe("TargetsProvider", () => {
  beforeEach(() => {
    mockListTargets.mockReset().mockResolvedValue([]);
    mockCreateTarget.mockReset();
    mockUpdateTarget.mockReset();
    mockDeleteTarget.mockReset();
    mockWakeTarget.mockReset();
    mockShutdownTarget.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("loads targets on mount", async () => {
    const target = makeTarget();
    mockListTargets.mockResolvedValue([target]);

    const { result } = renderHook(() => useTargets(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.targets).toEqual([target]);
  });

  it("wake() passes options straight through to the API", async () => {
    mockWakeTarget.mockResolvedValue({
      triggeredAt: "2026-01-01T00:00:01.000Z",
      sent: true,
    });
    const { result } = renderHook(() => useTargets(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.wake("target-1", { forceManualBootScript: true });
    });

    expect(mockWakeTarget).toHaveBeenCalledWith("target-1", {
      forceManualBootScript: true,
    });
  });

  it("shutdown() calls the API for the given target", async () => {
    mockShutdownTarget.mockResolvedValue({
      triggeredAt: "2026-01-01T00:00:01.000Z",
    });
    const { result } = renderHook(() => useTargets(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.shutdown("target-1");
    });

    expect(mockShutdownTarget).toHaveBeenCalledWith("target-1");
  });

  // Regression: AgentConfigDialog saves via targetsApi directly, then calls
  // setAgentConfig to patch the result into this context's state — without
  // it, a card kept showing the pre-save agentConfig (e.g. a newly-enabled
  // "Wake + Script" button) until the next silent poll or a manual reload.
  it("setAgentConfig() patches only the given target's agentConfig", async () => {
    const targetA = makeTarget({ id: "target-1", name: "HTPC" });
    const targetB = makeTarget({ id: "target-2", name: "NAS" });
    mockListTargets.mockResolvedValue([targetA, targetB]);

    const { result } = renderHook(() => useTargets(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const newConfig = {
      wolAware: false,
      shutdownEnabled: false,
      wakeWithScriptEnabled: true,
      wakeWithScriptButtonLabel: "Wake + TV",
    };
    act(() => {
      result.current.setAgentConfig("target-1", newConfig);
    });

    const updated = result.current.targets.find((t) => t.id === "target-1");
    const untouched = result.current.targets.find((t) => t.id === "target-2");
    expect(updated?.agentConfig).toEqual(newConfig);
    expect(untouched?.agentConfig).toEqual(targetB.agentConfig);
  });

  // Regression: the background poll alone left "Offline" showing stale for
  // up to STATUS_POLL_MS after a real status change if the tab was
  // backgrounded when it happened (browsers throttle/pause setInterval in
  // hidden tabs) — refreshing on visibilitychange/focus closes that gap.
  it("refetches when the tab becomes visible again", async () => {
    const { result } = renderHook(() => useTargets(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockListTargets).toHaveBeenCalledTimes(1);

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    await waitFor(() => expect(mockListTargets).toHaveBeenCalledTimes(2));
  });

  it("refetches on window focus", async () => {
    const { result } = renderHook(() => useTargets(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockListTargets).toHaveBeenCalledTimes(1);

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });

    await waitFor(() => expect(mockListTargets).toHaveBeenCalledTimes(2));
  });
});
