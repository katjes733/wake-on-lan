import { describe, it, expect, vi } from "vitest";
import { runScriptIfConfigured } from "~/agent/util/runScriptIfConfigured";

describe("runScriptIfConfigured", () => {
  it("returns ran:false and never calls spawn when no script is configured", async () => {
    const spawn = vi.fn();
    const result = await runScriptIfConfigured(null, spawn);
    expect(result).toEqual({ ran: false });
    expect(spawn).not.toHaveBeenCalled();
  });

  it("runs the configured script (wrapped in its interpreter) and returns its exit code", async () => {
    const spawn = vi.fn(() => ({ exited: Promise.resolve(0) }));
    const result = await runScriptIfConfigured("C:\\Scripts\\a.ps1", spawn);
    expect(result).toEqual({ ran: true, exitCode: 0 });
    expect(spawn).toHaveBeenCalledWith([
      "powershell.exe",
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      "C:\\Scripts\\a.ps1",
    ]);
  });

  it("reports a non-zero exit code without treating it as an error", async () => {
    const spawn = vi.fn(() => ({ exited: Promise.resolve(1) }));
    const result = await runScriptIfConfigured("C:\\Scripts\\a.ps1", spawn);
    expect(result).toEqual({ ran: true, exitCode: 1 });
  });

  it("captures a spawn failure (e.g. missing file) as an error, without throwing", async () => {
    const spawn = vi.fn(() => {
      throw new Error("ENOENT: no such file");
    });
    const result = await runScriptIfConfigured("C:\\missing.ps1", spawn);
    expect(result).toEqual({ ran: true, error: "ENOENT: no such file" });
  });
});
