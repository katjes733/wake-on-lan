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
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64
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

// The XML template ships with a {{APP_DIR}} placeholder since it can't know
// the real install path ahead of time (the user can change it at install
// time) — substitute it here, then register the generated file.
procedure RegisterBootHooksTask;
var
  XmlContent: AnsiString;
  GeneratedPath: string;
begin
  LoadStringFromFile(ExpandConstant('{app}\boot-hooks-task.xml'), XmlContent);
  StringChangeEx(XmlContent, '{{APP_DIR}}', ExpandConstant('{app}'), True);
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
