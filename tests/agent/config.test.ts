import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { writeFileSync, unlinkSync, readFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import {
  loadConfig,
  loadConfigOrEmpty,
  resolveAgentConfig,
} from "~/agent/config";

const { mockDiscoverServer, mockResolveTargetId, mockGetLocalMacAddresses } =
  vi.hoisted(() => ({
    mockDiscoverServer: vi.fn(),
    mockResolveTargetId: vi.fn(),
    mockGetLocalMacAddresses: vi.fn(() => ["AA:BB:CC:DD:EE:FF"]),
  }));

vi.mock("~/agent/discovery", () => ({
  discoverServer: mockDiscoverServer,
}));

vi.mock("~/agent/selfIdentify", () => ({
  getLocalMacAddresses: mockGetLocalMacAddresses,
  resolveTargetId: mockResolveTargetId,
}));

const tmpConfigPath = path.join(
  tmpdir(),
  `wol-agent-config-test-${Date.now()}.json`,
);

function writeConfig(contents: unknown) {
  writeFileSync(tmpConfigPath, JSON.stringify(contents));
}

describe("loadConfig", () => {
  afterEach(() => {
    try {
      unlinkSync(tmpConfigPath);
    } catch {
      // already removed or never written — fine either way
    }
  });

  it("loads and validates a well-formed config, applying defaults for optional fields", () => {
    writeConfig({
      serverBaseUrl: "https://wol.example.com",
      targetId: "11111111-1111-4111-8111-111111111111",
    });
    const config = loadConfig(tmpConfigPath);
    expect(config).toEqual({
      serverBaseUrl: "https://wol.example.com",
      targetId: "11111111-1111-4111-8111-111111111111",
      defaultPollIntervalSeconds: 30,
      logFilePath: "agent.log",
    });
  });

  it("honors explicit overrides for optional fields", () => {
    writeConfig({
      serverBaseUrl: "https://wol.example.com",
      targetId: "11111111-1111-4111-8111-111111111111",
      defaultPollIntervalSeconds: 45,
      logFilePath: "custom.log",
    });
    const config = loadConfig(tmpConfigPath);
    expect(config.defaultPollIntervalSeconds).toBe(45);
    expect(config.logFilePath).toBe("custom.log");
  });

  it("throws when serverBaseUrl is not a valid URL", () => {
    writeConfig({
      serverBaseUrl: "not-a-url",
      targetId: "11111111-1111-4111-8111-111111111111",
    });
    expect(() => loadConfig(tmpConfigPath)).toThrow();
  });

  it("throws when targetId is not a valid UUID", () => {
    writeConfig({
      serverBaseUrl: "https://wol.example.com",
      targetId: "not-a-uuid",
    });
    expect(() => loadConfig(tmpConfigPath)).toThrow();
  });

  it("throws when the config file does not exist", () => {
    expect(() =>
      loadConfig(path.join(tmpdir(), "does-not-exist.json")),
    ).toThrow();
  });
});

describe("loadConfigOrEmpty", () => {
  afterEach(() => {
    try {
      unlinkSync(tmpConfigPath);
    } catch {
      // already removed or never written — fine either way
    }
  });

  it("returns schema defaults (no serverBaseUrl/targetId) when the file doesn't exist", () => {
    const config = loadConfigOrEmpty(
      path.join(tmpdir(), "does-not-exist.json"),
    );
    expect(config).toEqual({
      defaultPollIntervalSeconds: 30,
      logFilePath: "agent.log",
    });
  });

  it("still loads a real file normally when one exists", () => {
    writeConfig({ serverBaseUrl: "https://wol.example.com" });
    const config = loadConfigOrEmpty(tmpConfigPath);
    expect(config.serverBaseUrl).toBe("https://wol.example.com");
  });
});

describe("resolveAgentConfig", () => {
  beforeEach(() => {
    mockDiscoverServer.mockReset();
    mockResolveTargetId.mockReset();
    mockGetLocalMacAddresses.mockClear();
  });

  afterEach(() => {
    try {
      unlinkSync(tmpConfigPath);
    } catch {
      // already removed or never written — fine either way
    }
  });

  it("uses an already-present serverBaseUrl/targetId as-is, never calling discovery or resolve", async () => {
    const fileConfig = {
      serverBaseUrl: "https://wol.example.com",
      targetId: "11111111-1111-4111-8111-111111111111",
      defaultPollIntervalSeconds: 30,
      logFilePath: "agent.log",
    };
    const config = await resolveAgentConfig(fileConfig, tmpConfigPath);
    expect(config).toEqual(fileConfig);
    expect(mockDiscoverServer).not.toHaveBeenCalled();
    expect(mockResolveTargetId).not.toHaveBeenCalled();
  });

  it("discovers serverBaseUrl and uses the bundled targetId when both are missing", async () => {
    mockDiscoverServer.mockResolvedValue({
      serverBaseUrl: "https://192.168.2.110:3001",
      targetId: "11111111-1111-4111-8111-111111111111",
    });
    const fileConfig = {
      defaultPollIntervalSeconds: 30,
      logFilePath: "agent.log",
    };
    const config = await resolveAgentConfig(fileConfig, tmpConfigPath);
    expect(config.serverBaseUrl).toBe("https://192.168.2.110:3001");
    expect(config.targetId).toBe("11111111-1111-4111-8111-111111111111");
    expect(mockResolveTargetId).not.toHaveBeenCalled();
  });

  it("passes a configured discoveryPort override through to discoverServer", async () => {
    mockDiscoverServer.mockResolvedValue({
      serverBaseUrl: "https://192.168.2.110:3001",
      targetId: "11111111-1111-4111-8111-111111111111",
    });
    const fileConfig = {
      defaultPollIntervalSeconds: 30,
      logFilePath: "agent.log",
      discoveryPort: 12345,
    };
    await resolveAgentConfig(fileConfig, tmpConfigPath);
    expect(mockDiscoverServer).toHaveBeenCalledWith(["AA:BB:CC:DD:EE:FF"], {
      port: 12345,
    });
  });

  it("falls back to a separate resolve call when discovery finds the server but not the target", async () => {
    mockDiscoverServer.mockResolvedValue({
      serverBaseUrl: "https://192.168.2.110:3001",
      targetId: null,
    });
    mockResolveTargetId.mockResolvedValue(
      "22222222-2222-4222-8222-222222222222",
    );
    const fileConfig = {
      defaultPollIntervalSeconds: 30,
      logFilePath: "agent.log",
    };
    const config = await resolveAgentConfig(fileConfig, tmpConfigPath);
    expect(config.targetId).toBe("22222222-2222-4222-8222-222222222222");
    expect(mockResolveTargetId).toHaveBeenCalledWith(
      "https://192.168.2.110:3001",
      ["AA:BB:CC:DD:EE:FF"],
    );
  });

  it("resolves targetId by MAC without touching discovery when serverBaseUrl is already known", async () => {
    mockResolveTargetId.mockResolvedValue(
      "33333333-3333-4333-8333-333333333333",
    );
    const fileConfig = {
      serverBaseUrl: "https://wol.example.com",
      defaultPollIntervalSeconds: 30,
      logFilePath: "agent.log",
    };
    const config = await resolveAgentConfig(fileConfig, tmpConfigPath);
    expect(config.targetId).toBe("33333333-3333-4333-8333-333333333333");
    expect(mockDiscoverServer).not.toHaveBeenCalled();
  });

  it("persists the resolved values back to the config file", async () => {
    mockDiscoverServer.mockResolvedValue({
      serverBaseUrl: "https://192.168.2.110:3001",
      targetId: "11111111-1111-4111-8111-111111111111",
    });
    const fileConfig = {
      defaultPollIntervalSeconds: 30,
      logFilePath: "agent.log",
    };
    await resolveAgentConfig(fileConfig, tmpConfigPath);
    const persisted = JSON.parse(readFileSync(tmpConfigPath, "utf-8"));
    expect(persisted.serverBaseUrl).toBe("https://192.168.2.110:3001");
    expect(persisted.targetId).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("throws a clear error when discovery fails and nothing is cached", async () => {
    mockDiscoverServer.mockResolvedValue(null);
    const fileConfig = {
      defaultPollIntervalSeconds: 30,
      logFilePath: "agent.log",
    };
    await expect(resolveAgentConfig(fileConfig, tmpConfigPath)).rejects.toThrow(
      /Could not discover the server/,
    );
  });

  it("throws a clear error when the server is known but no target matches this machine's MAC", async () => {
    mockResolveTargetId.mockResolvedValue(null);
    const fileConfig = {
      serverBaseUrl: "https://wol.example.com",
      defaultPollIntervalSeconds: 30,
      logFilePath: "agent.log",
    };
    await expect(resolveAgentConfig(fileConfig, tmpConfigPath)).rejects.toThrow(
      /Could not resolve this machine's target ID/,
    );
  });
});
