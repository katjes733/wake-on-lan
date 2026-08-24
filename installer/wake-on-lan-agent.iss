; Inno Setup script for the wake-on-lan Windows agent.
;
; Installs a single SYSTEM Windows Service (via bundled NSSM) running the
; agent — heartbeat + shutdown polling, plus a one-time boot-time script
; check (defaultScript/wolScript/manualBootScript, WOL-boot detection) run
; right at startup. Deliberately just one piece, not split against a
; separate per-logon Scheduled Task: local script execution has no real
; need for desktop-session access, and gating it on a logon having already
; happened is actively wrong for a script meant to bring up a display
; before anyone could see a login screen (see CLAUDE.md's Windows agent
; section for the fuller history — an earlier version of this agent did
; split it that way).
;
; Built by .github/workflows/build-agent-installer.yml on a windows-latest
; runner — see that workflow for how installer/dist/wake-on-lan-agent.exe
; and installer/vendor/nssm.exe are produced/fetched before this compiles.

#define MyAppName "Wake-on-LAN Agent"
#define MyAppVersion "0.1.0"
#define MyServiceName "WakeOnLanAgent"

[Setup]
AppId={{6E6C6194-6F6C-4B61-9C7A-57616B654F4C}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
; Same icon as the web app's favicon (src/client/public/favicon.svg,
; rasterized to installer/icon.ico) — used for the setup/uninstall exe and,
; via UninstallDisplayIcon below, the Add/Remove Programs entry.
SetupIconFile=icon.ico
UninstallDisplayIcon={app}\wake-on-lan-agent.exe
; Plain "x64" is deprecated as of Inno Setup 6.7 — "x64compatible" matches
; both native x64 and ARM64 Windows installs that can run x64 code via
; emulation, which is what we actually want (the agent binary itself is a
; genuine x64 build with no separate ARM64 build).
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=Output
OutputBaseFilename=WakeOnLanAgentSetup
Compression=lzma
SolidCompression=yes
PrivilegesRequired=admin

[Files]
Source: "dist\wake-on-lan-agent.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "vendor\nssm.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "config.example.json"; DestDir: "{app}"; Flags: ignoreversion

[Code]
var
  ResultCode: Integer;

procedure RunHidden(const Exe, Params: string);
begin
  Exec(Exe, Params, '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
end;

procedure InstallService;
var
  Nssm, AppExe: string;
begin
  Nssm := ExpandConstant('{app}\nssm.exe');
  AppExe := ExpandConstant('{app}\wake-on-lan-agent.exe');
  RunHidden(Nssm, 'install {#MyServiceName} "' + AppExe + '"');
  RunHidden(Nssm, 'set {#MyServiceName} AppDirectory "' + ExpandConstant('{app}') + '"');
  RunHidden(Nssm, 'set {#MyServiceName} Start SERVICE_AUTO_START');
  RunHidden(Nssm, 'set {#MyServiceName} AppExit Default Restart');
  RunHidden(Nssm, 'start {#MyServiceName}');
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    // No config.json to write here anymore — the agent itself resolves
    // serverBaseUrl/targetId on first run (LAN discovery + MAC-based
    // self-identification, src/agent/config.ts's resolveAgentConfig) and
    // persists the result, so starting the service with no config.json
    // present at all is the expected first-run state, not an error.
    InstallService;
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  Nssm: string;
begin
  if CurUninstallStep = usUninstall then
  begin
    Nssm := ExpandConstant('{app}\nssm.exe');
    RunHidden(Nssm, 'stop {#MyServiceName}');
    RunHidden(Nssm, 'remove {#MyServiceName} confirm');
  end;
end;

[UninstallDelete]
Type: files; Name: "{app}\agent.log"
Type: files; Name: "{app}\config.json"
