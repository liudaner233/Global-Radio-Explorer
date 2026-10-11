param(
  [string]$OutputDirectory = ''
)

if (-not $OutputDirectory) {
  $OutputDirectory = Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..')).Path 'assets\icons'
}

if (-not (Test-Path $OutputDirectory)) {
  New-Item -Path $OutputDirectory -ItemType Directory -Force | Out-Null
}

Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class IconTools {
    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern bool DestroyIcon(IntPtr handle);
}
'@

$size = 256
$pngPath = Join-Path $OutputDirectory 'radio-explorer-radar.png'
$icoPath = Join-Path $OutputDirectory 'radio-explorer-radar.ico'

$bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($bmp)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([System.Drawing.Color]::FromArgb(0, 0, 0, 0))

$rect = New-Object System.Drawing.Rectangle(0, 0, $size, $size)
$center = $size / 2

$bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
  [System.Drawing.Point]::new(0, 0),
  [System.Drawing.Point]::new($size, $size),
  [System.Drawing.Color]::FromArgb(255, 5, 12, 28),
  [System.Drawing.Color]::FromArgb(255, 8, 26, 46)
)
$graphics.FillEllipse($bgBrush, $rect)

$outerPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(210, 72, 195, 255), 5)
$graphics.DrawEllipse($outerPen, 8, 8, $size - 16, $size - 16)

$ringPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(140, 70, 165, 220), 2.2)
$graphics.DrawEllipse($ringPen, 30, 30, $size - 60, $size - 60)
$graphics.DrawEllipse($ringPen, 58, 58, $size - 116, $size - 116)
$graphics.DrawEllipse($ringPen, 86, 86, $size - 172, $size - 172)

$gridPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(105, 58, 135, 200), 1.5)
$graphics.DrawLine($gridPen, $center, 18, $center, $size - 18)
$graphics.DrawLine($gridPen, 18, $center, $size - 18, $center)
$graphics.DrawArc($gridPen, 24, 24, $size - 48, $size - 48, 225, 90)
$graphics.DrawArc($gridPen, 24, 24, $size - 48, $size - 48, 45, 90)

$sweepBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(72, 88, 255, 210))
$graphics.FillPie($sweepBrush, 24, 24, $size - 48, $size - 48, 334, 40)

$sweepPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(220, 102, 255, 222), 3.2)
$graphics.DrawLine($sweepPen, $center, $center, $size - 30, $center - 6)

$orbitPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(150, 92, 235, 255), 2)
$graphics.DrawArc($orbitPen, 46, 74, 164, 108, 198, 144)

$blipBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 112, 255, 220))
$graphics.FillEllipse($blipBrush, 166, 82, 16, 16)
$blipGlow = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(150, 112, 255, 220), 2.4)
$graphics.DrawEllipse($blipGlow, 160, 76, 28, 28)
$graphics.DrawEllipse($blipGlow, 154, 70, 40, 40)

$signalPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(180, 112, 220, 255), 2.2)
$graphics.DrawArc($signalPen, 98, 162, 56, 56, 292, 78)
$graphics.DrawArc($signalPen, 90, 154, 72, 72, 292, 78)
$graphics.DrawArc($signalPen, 82, 146, 88, 88, 292, 78)

$starBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(195, 170, 225, 255))
$graphics.FillEllipse($starBrush, 62, 52, 5, 5)
$graphics.FillEllipse($starBrush, 194, 128, 4, 4)
$graphics.FillEllipse($starBrush, 88, 200, 4, 4)

$graphics.Flush()
$bmp.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)

$iconHandle = $bmp.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($iconHandle)
$fileStream = [System.IO.File]::Open($icoPath, [System.IO.FileMode]::Create)
try {
  $icon.Save($fileStream)
} finally {
  $fileStream.Close()
  $icon.Dispose()
  [IconTools]::DestroyIcon($iconHandle) | Out-Null
  $graphics.Dispose()
  $bmp.Dispose()
  $bgBrush.Dispose()
  $outerPen.Dispose()
  $ringPen.Dispose()
  $gridPen.Dispose()
  if ($sweepBrush) {
    $sweepBrush.Dispose()
  }
  $sweepPen.Dispose()
  $orbitPen.Dispose()
  $blipBrush.Dispose()
  $blipGlow.Dispose()
  $signalPen.Dispose()
  $starBrush.Dispose()
}

Write-Host "Generated radar icon PNG: $pngPath"
Write-Host "Generated radar icon ICO: $icoPath"
