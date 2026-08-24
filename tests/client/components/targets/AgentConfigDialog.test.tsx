// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AgentConfigDialog from "~/client/components/targets/AgentConfigDialog";
import type { ApiTarget, AgentConfig } from "~/client/api/targetsApi";

const {
  mockGetAgentConfig,
  mockSaveAgentConfig,
  mockSetAgentConfig,
  mockShowNotification,
} = vi.hoisted(() => ({
  mockGetAgentConfig: vi.fn(),
  mockSaveAgentConfig: vi.fn(),
  mockSetAgentConfig: vi.fn(),
  mockShowNotification: vi.fn(),
}));

vi.mock("~/client/api/targetsApi", () => ({
  getAgentConfig: mockGetAgentConfig,
  saveAgentConfig: mockSaveAgentConfig,
}));

vi.mock("~/client/components/targets/useTargets", () => ({
  useTargets: () => ({ setAgentConfig: mockSetAgentConfig }),
}));

vi.mock("~/client/components/notification/useNotification", () => ({
  useNotification: () => ({ showNotification: mockShowNotification }),
}));

const baseConfig: AgentConfig = {
  wolAware: false,
  defaultScript: null,
  wolScript: null,
  manualBootScript: null,
  shutdownEnabled: false,
  wakeWithScriptEnabled: false,
  wakeButtonLabel: null,
  wakeWithScriptButtonLabel: null,
  pollIntervalSeconds: null,
  lokiPushUrl: null,
};

const target: ApiTarget = {
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
  agentConfig: baseConfig,
};

describe("AgentConfigDialog", () => {
  beforeEach(() => {
    mockGetAgentConfig.mockReset().mockResolvedValue(baseConfig);
    mockSaveAgentConfig.mockReset();
    mockSetAgentConfig.mockReset();
    mockShowNotification.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("loads and displays the fetched config", async () => {
    mockGetAgentConfig.mockResolvedValue({
      ...baseConfig,
      wolAware: true,
      defaultScript: "C:\\Scripts\\on-boot.ps1",
      wakeButtonLabel: "Turn On",
    });

    render(<AgentConfigDialog open target={target} onClose={vi.fn()} />);

    await waitFor(() =>
      expect(screen.getByLabelText(/script to run on every boot/i)).toHaveValue(
        "C:\\Scripts\\on-boot.ps1",
      ),
    );
    expect(screen.getByLabelText(/wake button label/i)).toHaveValue("Turn On");
    expect(
      screen.getByRole("switch", { name: /detect wake-on-lan boots/i }),
    ).toBeChecked();
  });

  it("keeps the manual-boot script field enabled even when wolAware is off (unlike the WOL-boot script field)", async () => {
    render(<AgentConfigDialog open target={target} onClose={vi.fn()} />);

    await waitFor(() =>
      expect(
        screen.getByRole("switch", { name: /detect wake-on-lan boots/i }),
      ).not.toBeChecked(),
    );

    expect(
      screen.getByLabelText(/script to run when a wol boot is detected/i),
    ).toBeDisabled();
    expect(
      screen.getByLabelText(/script to run on a manual \(non-wol\) boot/i),
    ).toBeEnabled();
  });

  it("disables the 'Wake + Script' label field until the feature switch is on", async () => {
    const user = userEvent.setup();
    render(<AgentConfigDialog open target={target} onClose={vi.fn()} />);

    const labelField = await screen.findByLabelText(
      /'wake \+ script' button label/i,
    );
    expect(labelField).toBeDisabled();

    await user.click(
      screen.getByRole("switch", {
        name: /show a second wake button/i,
      }),
    );

    expect(labelField).toBeEnabled();
  });

  it("saves, patches context state, notifies, and closes on success", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const saved = { ...baseConfig, wakeButtonLabel: "Turn On" };
    mockSaveAgentConfig.mockResolvedValue(saved);

    render(<AgentConfigDialog open target={target} onClose={onClose} />);

    const labelField = await screen.findByLabelText(/wake button label/i);
    await user.type(labelField, "Turn On");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() =>
      expect(mockSaveAgentConfig).toHaveBeenCalledWith(
        "target-1",
        expect.objectContaining({ wakeButtonLabel: "Turn On" }),
      ),
    );
    expect(mockSetAgentConfig).toHaveBeenCalledWith("target-1", saved);
    expect(mockShowNotification).toHaveBeenCalledWith(
      "Agent settings saved",
      "success",
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("shows an error and does not close when the save request fails", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    mockSaveAgentConfig.mockRejectedValue(new Error("network error"));

    render(<AgentConfigDialog open target={target} onClose={onClose} />);

    await screen.findByLabelText(/wake button label/i);
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() =>
      expect(
        screen.getByText(/failed to save agent settings/i),
      ).toBeInTheDocument(),
    );
    expect(mockSetAgentConfig).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("rejects invalid input locally and never calls the save API", async () => {
    const user = userEvent.setup();

    render(<AgentConfigDialog open target={target} onClose={vi.fn()} />);

    const pollField = await screen.findByLabelText(/poll interval/i);
    await user.type(pollField, "-5");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() =>
      expect(screen.queryByText(/failed to save/i)).not.toBeInTheDocument(),
    );
    expect(mockSaveAgentConfig).not.toHaveBeenCalled();
  });

  it("shows a load error when fetching the config fails", async () => {
    mockGetAgentConfig.mockRejectedValue(new Error("network error"));

    render(<AgentConfigDialog open target={target} onClose={vi.fn()} />);

    await waitFor(() =>
      expect(
        screen.getByText(/failed to load agent config/i),
      ).toBeInTheDocument(),
    );
  });
});
