$ErrorActionPreference = 'Stop'
$source = (Resolve-Path -LiteralPath $env:AGY_CHAT_EXPORT_SOURCE).Path
$config = Join-Path $env:USERPROFILE '.gemini\config'
$name = 'antigravity-chat-export'
$target = Join-Path (Join-Path $config 'plugins') $name
if ($source -eq $target) {
    throw 'Run the installer from a freshly extracted package.'
}

function Get-PackageFileHash($path) {
    $algorithm = [Security.Cryptography.SHA256]::Create()
    try {
        return [Convert]::ToBase64String($algorithm.ComputeHash([IO.File]::ReadAllBytes($path)))
    } finally {
        $algorithm.Dispose()
    }
}

$files = @(
    'sidecars\export\save-dialog.ps1'
    'sidecars\export\transcript.mjs'
    'sidecars\export\server.mjs'
    'sidecars\export\index.html'
    'sidecars\export\sidecar.json'
    'install.ps1'
    'install.cmd'
    '安装说明.txt'
    'plugin.json'
)
foreach ($file in $files) {
    if (!(Test-Path -LiteralPath (Join-Path $source $file) -PathType Leaf)) {
        throw 'Extract the entire ZIP before installing.'
    }
}
$notices = @('LICENSE', 'THIRD-PARTY-NOTICES.md') | Where-Object {
    Test-Path -LiteralPath (Join-Path $source $_) -PathType Leaf
}
$files = @($files | Where-Object { $_ -ne 'plugin.json' }) + @($notices) + @('plugin.json')
$package = Get-Content -LiteralPath (Join-Path $source 'plugin.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if ($package.name -ne $name) { throw 'Invalid plugin package.' }

$backup = $null
if (Test-Path -LiteralPath $target) {
    $installed = Get-Content -LiteralPath (Join-Path $target 'plugin.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($installed.name -ne $name) { throw 'The target folder belongs to a different plugin.' }
    if ([version]$installed.version -gt [version]$package.version) { throw 'A newer version is already installed.' }
    $backupRoot = Join-Path $config 'plugin-backups'
    $backupName = '{0}-{1}-{2}' -f $name, $installed.version, [guid]::NewGuid().ToString('N')
    $backup = Join-Path $backupRoot $backupName
    New-Item -Path $backupRoot -ItemType Directory -Force | Out-Null
    Copy-Item -LiteralPath $target -Destination $backup -Recurse
}

try {
    foreach ($file in $files) {
        $destination = Join-Path $target $file
        New-Item -Path (Split-Path -Parent $destination) -ItemType Directory -Force | Out-Null
        Copy-Item -LiteralPath (Join-Path $source $file) -Destination $destination -Force
        if ((Get-PackageFileHash $destination) -ne (Get-PackageFileHash (Join-Path $source $file))) {
            throw 'The installed file failed verification.'
        }
    }
} catch {
    if ($backup) {
        foreach ($file in $files) {
            $previous = Join-Path $backup $file
            if (Test-Path -LiteralPath $previous -PathType Leaf) {
                Copy-Item -LiteralPath $previous -Destination (Join-Path $target $file) -Force
            }
        }
    }
    throw
}

Write-Host ('Installed {0}. Turn the plugin off and on again in Antigravity, then reopen its panel.' -f $package.version)
