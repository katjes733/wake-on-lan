import { describe, it, expect, afterEach } from "vitest";
import { writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { loadConfig } from "~/agent/config";

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
