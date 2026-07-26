# Builds the RealCad desktop app installer end to end:
#   1) PyInstaller: sch\home_screen.py -> installer\dist\RealCad.exe
#   2) Inno Setup:  full_install.iss   -> installer\output\RealCad_Setup.exe
#
# Usage:
#   .\installer\build.ps1                # build exe + installer
#   .\installer\build.ps1 -SkipExeBuild  # reuse existing dist\RealCad.exe, only re-run Inno Setup

param(
    [switch]$SkipExeBuild
)

$ErrorActionPreference = "Stop"

$installerDir = $PSScriptRoot
$repoRoot = Split-Path -Parent $installerDir
$distDir = Join-Path $installerDir "dist"
$buildDir = Join-Path $installerDir "build"

if (-not $SkipExeBuild) {
    Write-Host "==> Checking PyInstaller..."
    python -m pip show pyinstaller 2>$null 1>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "==> Installing PyInstaller..."
        python -m pip install pyinstaller
    }

    Write-Host "==> Building RealCad.exe with PyInstaller..."
    python -m PyInstaller `
        --name RealCad `
        --onefile `
        --windowed `
        --distpath $distDir `
        --workpath $buildDir `
        --specpath $installerDir `
        (Join-Path $repoRoot "sch\home_screen.py")

    if ($LASTEXITCODE -ne 0) {
        throw "PyInstaller build failed."
    }
}

Write-Host "==> Locating Inno Setup Compiler (ISCC.exe)..."
$isccPath = $null
$isccCmd = Get-Command ISCC.exe -ErrorAction SilentlyContinue
if ($isccCmd) {
    $isccPath = $isccCmd.Source
} else {
    $candidates = @(
        "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
        "$env:ProgramFiles\Inno Setup 6\ISCC.exe"
    )
    $isccPath = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
}

if (-not $isccPath) {
    throw "ISCC.exe not found. Install Inno Setup from https://jrsoftware.org/isdl.php, then re-run this script."
}

Write-Host "==> Compiling installer with Inno Setup..."
& $isccPath (Join-Path $installerDir "full_install.iss")

if ($LASTEXITCODE -ne 0) {
    throw "Inno Setup compile failed."
}

Write-Host "==> Done. Installer at: $installerDir\output\RealCad_Setup.exe"
