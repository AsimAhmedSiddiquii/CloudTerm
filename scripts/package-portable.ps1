$ErrorActionPreference = "Stop"

$workspacePath = Split-Path -Parent $PSScriptRoot
$releasePath = Join-Path $workspacePath "src-tauri\target\release"
$binaryPath = Join-Path $releasePath "app.exe"
$portablePath = Join-Path $releasePath "portable\CloudTerm"
$zipPath = Join-Path $releasePath "CloudTerm-portable-windows.zip"

if (-not (Test-Path -LiteralPath $binaryPath)) {
    throw "Release executable not found. Run: npm run tauri build -- --no-bundle"
}

if (Test-Path -LiteralPath $portablePath) {
    Remove-Item -LiteralPath $portablePath -Recurse -Force
}
New-Item -ItemType Directory -Path $portablePath -Force | Out-Null
Copy-Item -LiteralPath $binaryPath -Destination (Join-Path $portablePath "CloudTerm.exe")
Copy-Item -LiteralPath (Join-Path $workspacePath "README.md") -Destination (Join-Path $portablePath "README.md")

if (Test-Path -LiteralPath $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
}
Compress-Archive -Path (Join-Path $portablePath "*") -DestinationPath $zipPath -CompressionLevel Optimal
Write-Output "Created $zipPath"
