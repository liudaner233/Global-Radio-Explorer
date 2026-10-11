param(
  [int]$Port = 3000,
  [string]$Url = 'http://localhost:3000',
  [string]$DevCommand = 'npm run dev',
  [int]$TimeoutSeconds = 45,
  [string]$TerminalTitle = 'Local Dev Server'
)

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

function Test-PortOpen {
  param([int]$TargetPort)

  try {
    $client = New-Object System.Net.Sockets.TcpClient
    $connectAsync = $client.BeginConnect('127.0.0.1', $TargetPort, $null, $null)
    $connected = $connectAsync.AsyncWaitHandle.WaitOne(400)
    if ($connected -and $client.Connected) {
      $client.EndConnect($connectAsync)
      $client.Close()
      return $true
    }
    $client.Close()
    return $false
  } catch {
    return $false
  }
}

if (-not (Test-PortOpen -TargetPort $Port)) {
  $escapedProjectRoot = $projectRoot.Replace("'", "''")
  $escapedTitle = $TerminalTitle.Replace("'", "''")
  $startCommand = "& { Set-Location -LiteralPath '$escapedProjectRoot'; `$Host.UI.RawUI.WindowTitle = '$escapedTitle'; $DevCommand }"
  Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoExit', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $startCommand -WorkingDirectory $projectRoot | Out-Null
}

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
while ((Get-Date) -lt $deadline) {
  if (Test-PortOpen -TargetPort $Port) {
    break
  }
  Start-Sleep -Milliseconds 500
}

if (-not (Test-PortOpen -TargetPort $Port)) {
  $shell = New-Object -ComObject WScript.Shell
  $shell.Popup("Unable to start local server on port $Port. Please run '$DevCommand' in the project folder and try again.", 10, 'Radio Explorer', 48) | Out-Null
  exit 1
}

Write-Host "Local server is ready on $Url"
Start-Process $Url
