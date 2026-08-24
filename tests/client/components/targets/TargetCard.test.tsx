// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TargetCard from "~/client/components/targets/TargetCard";
import type { ApiTarget } from "~/client/api/targetsApi";

const { mockWake, mockShutdown } = vi.hoisted(() => ({
  mockWake: vi.fn(),
  mockShutdown: vi.fn(),
}));

vi.mock("~/client/components/targets/useTargets", () => ({
  useTargets: () => ({ wake: mockWake, shutdown: mockShutdown }),
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

describe("TargetCard", () => {
  beforeEach(() => {
    mockWake.mockReset().mockResolvedValue({ sent: true });
    mockShutdown.mockReset().mockResolvedValue({});
  });

  afterEach(() => {
    cleanup();
  });

  it("shows the target name and an Offline chip when offline", () => {
    render(<TargetCard target={makeTarget({ online: false })} />);
    expect(screen.getByText("HTPC")).toBeInTheDocument();
    expect(screen.getByText("Offline")).toBeInTheDocument();
  });

  it("shows an Online chip when online", () => {
    render(<TargetCard target={makeTarget({ online: true })} />);
    expect(screen.getByText("Online")).toBeInTheDocument();
  });

  it("renders staticIp and notes when present", () => {
    render(
      <TargetCard
        target={makeTarget({
          staticIp: "192.168.2.191",
          notes: "Living room HTPC",
        })}
      />,
    );
    expect(screen.getByText("192.168.2.191")).toBeInTheDocument();
    expect(screen.getByText("Living room HTPC")).toBeInTheDocument();
  });

  it("clicking Wake calls wake() with no extra options", async () => {
    const user = userEvent.setup();
    render(<TargetCard target={makeTarget()} />);

    await user.click(screen.getByRole("button", { name: /wake/i }));

    expect(mockWake).toHaveBeenCalledWith("target-1");
  });

  it("disables Wake once the target is online", () => {
    render(<TargetCard target={makeTarget({ online: true })} />);
    expect(screen.getByRole("button", { name: /^wake$/i })).toBeDisabled();
  });

  it("uses a custom wakeButtonLabel when configured", () => {
    render(
      <TargetCard
        target={makeTarget({
          agentConfig: {
            wolAware: false,
            shutdownEnabled: false,
            wakeWithScriptEnabled: false,
            wakeButtonLabel: "Turn On",
          },
        })}
      />,
    );
    expect(screen.getByRole("button", { name: "Turn On" })).toBeInTheDocument();
  });

  it("does not render the 'Wake + Script' button when wakeWithScriptEnabled is off", () => {
    render(<TargetCard target={makeTarget()} />);
    expect(
      screen.queryByRole("button", { name: /wake \+ script/i }),
    ).not.toBeInTheDocument();
  });

  it("renders and wires the 'Wake + Script' button when enabled", async () => {
    const user = userEvent.setup();
    render(
      <TargetCard
        target={makeTarget({
          agentConfig: {
            wolAware: false,
            shutdownEnabled: false,
            wakeWithScriptEnabled: true,
          },
        })}
      />,
    );

    const button = screen.getByRole("button", { name: /wake \+ script/i });
    await user.click(button);

    expect(mockWake).toHaveBeenCalledWith("target-1", {
      forceManualBootScript: true,
    });
  });

  it("uses a custom wakeWithScriptButtonLabel when configured", () => {
    render(
      <TargetCard
        target={makeTarget({
          agentConfig: {
            wolAware: false,
            shutdownEnabled: false,
            wakeWithScriptEnabled: true,
            wakeWithScriptButtonLabel: "Wake + TV",
          },
        })}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Wake + TV" }),
    ).toBeInTheDocument();
  });

  it("disables Shutdown when shutdownEnabled is off, even while online", () => {
    render(
      <TargetCard
        target={makeTarget({
          online: true,
          agentConfig: {
            wolAware: false,
            shutdownEnabled: false,
            wakeWithScriptEnabled: false,
          },
        })}
      />,
    );
    expect(screen.getByRole("button", { name: /shutdown/i })).toBeDisabled();
  });

  it("disables Shutdown when the target appears offline, even if enabled", () => {
    render(
      <TargetCard
        target={makeTarget({
          online: false,
          agentConfig: {
            wolAware: false,
            shutdownEnabled: true,
            wakeWithScriptEnabled: false,
          },
        })}
      />,
    );
    expect(screen.getByRole("button", { name: /shutdown/i })).toBeDisabled();
  });

  it("clicking Shutdown then confirming calls shutdown()", async () => {
    const user = userEvent.setup();
    render(
      <TargetCard
        target={makeTarget({
          online: true,
          agentConfig: {
            wolAware: false,
            shutdownEnabled: true,
            wakeWithScriptEnabled: false,
          },
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: /shutdown/i }));
    expect(screen.getByText(/shut down this device/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /shut down/i }));

    await waitFor(() => expect(mockShutdown).toHaveBeenCalledWith("target-1"));
  });
});
