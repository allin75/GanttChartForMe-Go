param(
  [string]$InstallRoot = 'C:\Services\GanttChartForMe-Go',
  [string]$ServiceName = 'GanttChartForMe-Go',
  [string]$Port = '3001',
  [string]$WinswVersion = 'v2.12.0'
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
$dataDir = Join-Path $InstallRoot 'data'
$logsDir = Join-Path $InstallRoot 'logs'
$winswDir = Join-Path $InstallRoot 'winsw'

New-Item -ItemType Directory -Force -Path $InstallRoot, $currentDir, $dataDir, $logsDir, $winswDir | Out-Null

Copy-Item -Force $backendExe (Join-Path $currentDir 'server.exe')
if (Test-Path $frontendDir) {
  Remove-Item -Recurse -Force $frontendDir
}
New-Item -ItemType Directory -Force -Path $frontendDir | Out-Null
Copy-Item -Recurse -Force (Join-Path $frontendBuild '*') $frontendDir

$winswExe = Join-Path $winswDir "$ServiceName.exe"
$winswXml = Join-Path $winswDir "$ServiceName.xml"

if (!(Test-Path $winswExe)) {
  $downloadUrl = "https://github.com/winsw/winsw/releases/download/$WinswVersion/WinSW-x64.exe"
  Invoke-WebRequest -Uri $downloadUrl -OutFile $winswExe
}

$xml = @"
<service>
  <id>$ServiceName</id>
  <name>$ServiceName</name>
  <description>GanttChartForMe-Go Windows Service</description>
  <executable>$currentDir\server.exe</executable>
  <workingdirectory>$currentDir</workingdirectory>
  <logpath>$logsDir</logpath>
  <log mode="roll-by-size-time">
    <sizeThreshold>10240</sizeThreshold>
    <pattern>yyyyMMdd</pattern>
    <autoRollAtTime>00:00:00</autoRollAtTime>
    <zipOlderThanNumDays>7</zipOlderThanNumDays>
    <keepFiles>14</keepFiles>
  </log>
  <env name="PORT" value="$Port" />
  <env name="DATA_PATH" value="$dataDir\gantt.db" />
  <env name="FRONTEND_DIR" value="$frontendDir" />
  <env name="CORS_ALLOW_ORIGIN" value="http://192.168.123.97:$Port" />
  <onfailure action="restart" delay="10 sec" />
  <onfailure action="restart" delay="20 sec" />
  <onfailure action="restart" delay="30 sec" />
</service>
"@

Set-Content -Path $winswXml -Value $xml -Encoding UTF8

$serviceExists = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($serviceExists) {
  & $winswExe stop | Out-Null
  & $winswExe uninstall | Out-Null
}

& $winswExe install
& $winswExe start

if (-not (Get-NetFirewallRule -DisplayName $ServiceName -ErrorAction SilentlyContinue)) {
  New-NetFirewallRule -DisplayName $ServiceName -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port | Out-Null
}

Write-Host "Installed service '$ServiceName' at http://192.168.123.97:$Port/"
