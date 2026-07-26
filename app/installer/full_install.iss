; RealCad desktop app installer (Inno Setup script)
;
; This is the SOURCE for the installer, not the installer itself.
; Build flow:
;   1) installer\build.ps1 bundles sch\home_screen.py into dist\RealCad.exe (PyInstaller)
;   2) The same script compiles this .iss with ISCC.exe (Inno Setup Compiler)
;   3) Output lands at installer\output\RealCad_Setup.exe
;
; Get Inno Setup here: https://jrsoftware.org/isdl.php

#define MyAppName "RealCad"
#define MyAppVersion "0.1.0"
#define MyAppPublisher "RealCad"
#define MyAppExeName "RealCad.exe"

[Setup]
AppId={{292409F7-B10A-4DC1-A195-2BE432BBD41E}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir=output
OutputBaseFilename=RealCad_Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayIcon={app}\{#MyAppExeName}
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "chinesetrad"; MessagesFile: "compiler:Languages\ChineseTraditional.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "dist\{#MyAppExeName}"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#MyAppName}}"; Flags: nowait postinstall skipifsilent
