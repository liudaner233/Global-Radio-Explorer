param(
  [string]$ShortcutName = ''
)

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$projectName = Split-Path -Path $projectRoot -Leaf
if (-not $ShortcutName) {
  $ShortcutName = $projectName
}
$desktopPath = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktopPath "$ShortcutName.lnk"
$launcherScript = Join-Path $projectRoot 'scripts\open-local-site.ps1'
$iconGeneratorScript = Join-Path $projectRoot 'scripts\generate-radar-icon.ps1'
$radarIconPath = Join-Path $projectRoot 'assets\icons\radio-explorer-radar.ico'
$packageJsonPath = Join-Path $projectRoot 'package.json'
$metadataJsonPath = Join-Path $projectRoot 'metadata.json'

function Get-FirstOnlineUrl {
  param([string[]]$Candidates)

  foreach ($candidate in $Candidates) {
    if (-not $candidate) {
      continue
    }

    $value = $candidate.Trim()
    if (-not $value) {
      continue
    }
    if ($value -notmatch '^https?://') {
      continue
    }
    if ($value -match 'localhost|127\.0\.0\.1|0\.0\.0\.0') {
      continue
    }
    return $value
  }

  return $null
}

function Get-OnlineUrlFromEnvFile {
  param([string]$Path)

  if (-not (Test-Path $Path)) {
    return $null
  }

  $knownKeys = @(
    'SITE_URL',
    'PROJECT_URL',
    'DEPLOY_URL',
    'VITE_SITE_URL',
    'VITE_APP_URL',
    'NEXT_PUBLIC_SITE_URL',
    'PUBLIC_SITE_URL'
  )

  $candidates = @()
  foreach ($line in (Get-Content -LiteralPath $Path -ErrorAction SilentlyContinue)) {
    if ($line -match '^\s*#') {
      continue
    }
    foreach ($key in $knownKeys) {
      if ($line -match "^\s*$key\s*=\s*(.+)\s*$") {
        $rawValue = $matches[1].Trim().Trim("'`"")
        if ($rawValue) {
          $candidates += $rawValue
        }
      }
    }
  }

  return Get-FirstOnlineUrl -Candidates $candidates
}

function Resolve-EntryInfo {
  param(
    [string]$ProjectRoot,
    [string]$PackageJsonPath,
    [string]$MetadataJsonPath
  )

  $candidates = @(
    $env:SITE_URL,
    $env:PROJECT_URL,
    $env:DEPLOY_URL,
    $env:VITE_SITE_URL,
    $env:VITE_APP_URL,
    $env:NEXT_PUBLIC_SITE_URL,
    $env:PUBLIC_SITE_URL
  )

  if (Test-Path $PackageJsonPath) {
    try {
      $pkg = Get-Content -LiteralPath $PackageJsonPath -Raw | ConvertFrom-Json -ErrorAction Stop
      if ($pkg.homepage) {
        $candidates += [string]$pkg.homepage
      }
    } catch {
    }
  }

  if (Test-Path $MetadataJsonPath) {
    try {
      $metadata = Get-Content -LiteralPath $MetadataJsonPath -Raw | ConvertFrom-Json -ErrorAction Stop
      if ($metadata.url) {
        $candidates += [string]$metadata.url
      }
      if ($metadata.siteUrl) {
        $candidates += [string]$metadata.siteUrl
      }
    } catch {
    }
  }

  $envFiles = @(
    (Join-Path $ProjectRoot '.env'),
    (Join-Path $ProjectRoot '.env.local'),
    (Join-Path $ProjectRoot '.env.production')
  )
  foreach ($envFile in $envFiles) {
    $fromFile = Get-OnlineUrlFromEnvFile -Path $envFile
    if ($fromFile) {
      $candidates += $fromFile
    }
  }

  $onlineUrl = Get-FirstOnlineUrl -Candidates $candidates
  if ($onlineUrl) {
    return @{
      Type = 'online'
      Url = $onlineUrl
    }
  }

  return @{
    Type = 'local'
    Url = 'http://localhost:3000'
    Port = 3000
    DevCommand = 'npm run dev'
  }
}

if (-not (Test-Path $launcherScript)) {
  throw "Launcher script not found: $launcherScript"
}

if (-not (Test-Path $radarIconPath)) {
  if (-not (Test-Path $iconGeneratorScript)) {
    throw "Icon generator script not found: $iconGeneratorScript"
  }
  & $iconGeneratorScript
}

$powershellPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$iconCandidates = @(
  $radarIconPath,
  (Join-Path $projectRoot 'favicon.ico'),
  (Join-Path $projectRoot 'public\favicon.ico')
)
$iconPath = "$env:SystemRoot\System32\SHELL32.dll,220"

foreach ($candidate in $iconCandidates) {
  if (Test-Path $candidate) {
    $iconPath = $candidate
    break
  }
}

$wsh = New-Object -ComObject WScript.Shell
$shortcut = $wsh.CreateShortcut($shortcutPath)
$entryInfo = Resolve-EntryInfo -ProjectRoot $projectRoot -PackageJsonPath $packageJsonPath -MetadataJsonPath $metadataJsonPath

if ($entryInfo.Type -eq 'online') {
  $shortcut.TargetPath = "$env:SystemRoot\explorer.exe"
  $shortcut.Arguments = "`"$($entryInfo.Url)`""
  $shortcut.Description = "Open $projectName website"
} else {
  $shortcut.TargetPath = $powershellPath
  $shortcut.Arguments = "-NoExit -NoProfile -ExecutionPolicy Bypass -File `"$launcherScript`" -Port $($entryInfo.Port) -Url `"$($entryInfo.Url)`" -DevCommand `"$($entryInfo.DevCommand)`""
  $shortcut.Description = "Launch $projectName local website"
}

$shortcut.WorkingDirectory = $projectRoot
$shortcut.IconLocation = $iconPath
$shortcut.Save()

if ($entryInfo.Type -eq 'online') {
  Write-Host "Desktop shortcut created: $shortcutPath"
  Write-Host "Project mode: online ($($entryInfo.Url))"
} else {
  Write-Host "Desktop shortcut created: $shortcutPath"
  Write-Host "Project mode: local ($($entryInfo.Url))"
}
