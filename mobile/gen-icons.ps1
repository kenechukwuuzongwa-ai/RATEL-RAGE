# Android launcher icons from the title-screen logo.
# Masters are built once with ffmpeg (scale + pad), then rasterised to every
# mipmap density: the square/round launcher icons on the game's dark navy,
# and the adaptive-icon foreground on transparency inside the safe zone.
$ErrorActionPreference = 'Stop'
$ff = 'C:\Users\kenec\AndroidDev\ff\ffmpeg-master-latest-win64-gpl\bin\ffmpeg.exe'
$logo = 'frontend\ui\ratel-logo-title.png'
$res = 'mobile\android\app\src\main\res'
$tmp = 'C:\Users\kenec\AndroidDev\icons'
New-Item -ItemType Directory -Force -Path $tmp | Out-Null

# masters: 1024 square (launcher) and 432 transparent (adaptive foreground)
& $ff -y -loglevel error -i $logo -vf "scale=920:-1,pad=1024:1024:(ow-iw)/2:(oh-ih)/2:color=0x080b12" -frames:v 1 "$tmp\master.png"
& $ff -y -loglevel error -i $logo -vf "scale=240:-1,pad=432:432:(ow-iw)/2:(oh-ih)/2:color=0x00000000" -frames:v 1 "$tmp\fg.png"

$densities = @(
  @{ dir = 'mipmap-mdpi';    icon = 48;  fg = 108 },
  @{ dir = 'mipmap-hdpi';    icon = 72;  fg = 162 },
  @{ dir = 'mipmap-xhdpi';   icon = 96;  fg = 216 },
  @{ dir = 'mipmap-xxhdpi';  icon = 144; fg = 324 },
  @{ dir = 'mipmap-xxxhdpi'; icon = 192; fg = 432 }
)
foreach ($d in $densities) {
  $outDir = Join-Path $res $d.dir
  & $ff -y -loglevel error -i "$tmp\master.png" -vf "scale=$($d.icon):$($d.icon)" -frames:v 1 "$outDir\ic_launcher.png"
  Copy-Item "$outDir\ic_launcher.png" "$outDir\ic_launcher_round.png" -Force
  & $ff -y -loglevel error -i "$tmp\fg.png" -vf "scale=$($d.fg):$($d.fg)" -frames:v 1 "$outDir\ic_launcher_foreground.png"
  Write-Output "$($d.dir): icon $($d.icon), foreground $($d.fg)"
}
Write-Output 'icons generated'
