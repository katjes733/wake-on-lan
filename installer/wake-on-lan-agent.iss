; Inno Setup script for the wake-on-lan Windows agent.
;
; Installs two things:
;   1. A SYSTEM Windows Service (via bundled NSSM) running the agent in
;      --mode=service — heartbeat + shutdown polling, starts at boot before
;      any login.
;   2. A Scheduled Task, firing on ANY user's logon (see boot-hooks-task.xml),
;      running the agent in --mode=boot-hooks — WOL-boot detection + script
;      execution, the only mode with real desktop-session access.
;
; Built by .github/workflows/build-agent-installer.yml on a windows-latest
; runner — see that workflow for how installer/dist/wake-on-lan-agent.exe
; and installer/vendor/nssm.exe are produced/fetched before this compiles.

#define MyAppName "Wake-on-LAN Agent"
#define MyAppVersion "0.1.0"
#define MyServiceName "WakeOnLanAgent"
#define MyTaskName "WakeOnLanAgentBootHooks"

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
Source: "boot-hooks-task.xml"; DestDir: "{app}"; Flags: ignoreversion

[Code]
var
  ResultCode: Integer;

procedure RunHidden(const Exe, Params: string);
begin
  Exec(Exe, Params, '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
end;

// StringChangeEx requires its first parameter to be a Unicode `String`, but
// LoadStringFromFile/SaveStringToFile only work with `AnsiString` (they just
// read/write raw bytes, with no encoding awareness at all) — mixing the two
// on one variable is a genuine type mismatch in Inno Setup's Pascal Script,
// not just a style choice. Stay in AnsiString the whole way through instead.
function AnsiReplaceAll(const S, FromStr, ToStr: AnsiString): AnsiString;
var
  Work: AnsiString;
  P: Integer;
begin
  Work := S;
  P := Pos(FromStr, Work);
  while P > 0 do
  begin
    Work := Copy(Work, 1, P - 1) + ToStr +
      Copy(Work, P + Length(FromStr), Length(Work) - P - Length(FromStr) + 1);
    P := Pos(FromStr, Work);
  end;
  Result := Work;
end;

// The XML template ships with a {{APP_DIR}} placeholder since it can't know
// the real install path ahead of time (the user can change it at install
// time) — substitute it here, then register the generated file.
procedure RegisterBootHooksTask;
var
  XmlContent: AnsiString;
  GeneratedPath: string;
begin
  LoadStringFromFile(ExpandConstant('{app}\boot-hooks-task.xml'), XmlContent);
  XmlContent := AnsiReplaceAll(XmlContent, '{{APP_DIR}}', AnsiString(ExpandConstant('{app}')));
  GeneratedPath := ExpandConstant('{app}\boot-hooks-task.generated.xml');
  SaveStringToFile(GeneratedPath, XmlContent, False);
  RunHidden(ExpandConstant('{sys}\schtasks.exe'),
    '/create /xml "' + GeneratedPath + '" /tn {#MyTaskName} /f');
end;

procedure InstallService;
var
  Nssm, AppExe: string;
begin
  Nssm := ExpandConstant('{app}\nssm.exe');
  AppExe := ExpandConstant('{app}\wake-on-lan-agent.exe');
  RunHidden(Nssm, 'install {#MyServiceName} "' + AppExe + '" --mode=service');
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
    RegisterBootHooksTask;
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
    RunHidden(ExpandConstant('{sys}\schtasks.exe'), '/delete /tn {#MyTaskName} /f');
  end;
end;

[UninstallDelete]
Type: files; Name: "{app}\boot-hooks-task.generated.xml"
Type: files; Name: "{app}\agent.log"
Type: files; Name: "{app}\config.json"
