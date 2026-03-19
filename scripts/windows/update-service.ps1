param(
  [string]$InstallRoot = 'C:\Services\GanttChartForMe-Go',
  [string]$ServiceName = 'GanttChartForMe-Go'
)

$ErrorActionPreference = 'Stop'

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent (Split-Path -Parent $scriptRoot)

$backendExe = Join-Path $repoRoot 'backend\server.exe'
$frontendBuild = Join-Path $repoRoot 'frontend\build'

if (!(Test-Path $backendExe)) {
  throw "Missing backend executable: $backendExe. Build backend/server.exe first."
}

if (!(Test-Path $frontendBuild)) {
  throw "Missing frontend build directory: $frontendBuild. Run frontend build first."
}

$currentDir = Join-Path $InstallRoot 'current'
$frontendDir = Join-Path $currentDir 'frontend'
$winswExe = Join-Path (Join-Path $InstallRoot 'winsw') "$ServiceName.exe"

if (!(Test-Path $winswExe)) {
  throw "WinSW executable not found: $winswExe. Run install-service.ps1 first."
}

& $winswExe stop | Out-Null

Copy-Item -Force $backendExe (Join-Path $currentDir 'server.exe')
if (Test-Path $frontendDir) {
  Remove-Item -Recurse -Force $frontendDir
}
New-Item -ItemType Directory -Force -Path $frontendDir | Out-Null
Copy-Item -Recurse -Force (Join-Path $frontendBuild '*') $frontendDir

& $winswExe start

Write-Host "Updated service '$ServiceName' at http://192.168.123.97:3001/"
