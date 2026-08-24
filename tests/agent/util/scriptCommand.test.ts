import { describe, it, expect } from "vitest";
import { scriptCommandFor } from "~/agent/util/scriptCommand";

describe("scriptCommandFor", () => {
  it("wraps a .ps1 path with powershell.exe -File", () => {
    expect(scriptCommandFor("C:\\Scripts\\a.ps1")).toEqual([
      "powershell.exe",
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      "C:\\Scripts\\a.ps1",
    ]);
  });

  it("is case-insensitive about the extension", () => {
    expect(scriptCommandFor("C:\\Scripts\\A.PS1")).toEqual([
      "powershell.exe",
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      "C:\\Scripts\\A.PS1",
    ]);
  });

  it("wraps a .bat path with cmd.exe /c", () => {
    expect(scriptCommandFor("C:\\Scripts\\a.bat")).toEqual([
      "cmd.exe",
      "/c",
      "C:\\Scripts\\a.bat",
    ]);
  });

  it("wraps a .cmd path with cmd.exe /c", () => {
    expect(scriptCommandFor("C:\\Scripts\\a.cmd")).toEqual([
      "cmd.exe",
      "/c",
      "C:\\Scripts\\a.cmd",
    ]);
  });

  it("spawns anything else (e.g. .exe) directly, with no wrapping", () => {
    expect(scriptCommandFor("C:\\Scripts\\a.exe")).toEqual([
      "C:\\Scripts\\a.exe",
    ]);
  });

  it("spawns a path with no extension directly", () => {
    expect(scriptCommandFor("C:\\Scripts\\a")).toEqual(["C:\\Scripts\\a"]);
  });
});
