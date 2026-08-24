// Windows can't run a .ps1/.bat/.cmd file the way it runs a real .exe —
// CreateProcess (what Bun.spawn uses under the hood) doesn't consult
// file-type associations the way Explorer/cmd.exe do, so these need to be
// wrapped in their actual interpreter rather than spawned directly.
export function scriptCommandFor(scriptPath: string): string[] {
  const ext = scriptPath.slice(scriptPath.lastIndexOf(".")).toLowerCase();
  switch (ext) {
    case ".ps1":
      // -ExecutionPolicy Bypass: this path is only ever configured by an
      // admin through the (unauthenticated, LAN-trusted) web UI and must
      // already exist on this exact machine — PowerShell's default
      // script-blocking policy exists to guard against untrusted/remote
      // scripts, a threat model that doesn't apply to a local, admin-set
      // reference (see the no-auth rationale in CLAUDE.md).
      return [
        "powershell.exe",
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        scriptPath,
      ];
    case ".bat":
    case ".cmd":
      return ["cmd.exe", "/c", scriptPath];
    default:
      return [scriptPath];
  }
}
