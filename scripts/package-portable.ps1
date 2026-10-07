$ErrorActionPreference = "Stop"

$workspacePath = Split-Path -Parent $PSScriptRoot
$previousLocation = Get-Location
try {
    Set-Location -LiteralPath $workspacePath
    npm run tauri build -- --no-bundle
}
finally {
    Set-Location -LiteralPath $previousLocation
}

$releasePath = Join-Path $workspacePath "src-tauri\target\release"
$binaryPath = Join-Path $releasePath "app.exe"
$portablePath = Join-Path $releasePath "portable\CloudTerm"
$zipPath = Join-Path $releasePath "CloudTerm-portable-windows.zip"
$checksumPath = Join-Path $releasePath "CloudTerm-portable-windows.zip.sha256"

if (-not (Test-Path -LiteralPath $binaryPath)) {
    throw "Release executable not found. Run: npm run tauri build -- --no-bundle"
}

if (Test-Path -LiteralPath $portablePath) {
    Remove-Item -LiteralPath $portablePath -Recurse -Force
}
New-Item -ItemType Directory -Path $portablePath -Force | Out-Null
Copy-Item -LiteralPath $binaryPath -Destination (Join-Path $portablePath "CloudTerm.exe")
foreach ($document in @("README.md", "LICENSE", "SECURITY.md")) {
    Copy-Item -LiteralPath (Join-Path $workspacePath $document) -Destination (Join-Path $portablePath $document)
}

if (Test-Path -LiteralPath $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
}
Compress-Archive -Path (Join-Path $portablePath "*") -DestinationPath $zipPath -CompressionLevel Optimal
if (Test-Path -LiteralPath $checksumPath) {
    Remove-Item -LiteralPath $checksumPath -Force
}
$checksum = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
Set-Content -LiteralPath $checksumPath -Value "$checksum  $(Split-Path -Leaf $zipPath)" -Encoding ascii
Write-Output "Created $zipPath"
Write-Output "Created $checksumPath"
