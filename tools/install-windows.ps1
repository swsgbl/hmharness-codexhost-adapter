[CmdletBinding()]
param(
    [string]$AppPlugins = (
        Join-Path $env:APPDATA 'npm\node_modules\@codexhost\cli\node_modules\@codexhost\cli-win32-x64\app\plugins'
    ),
    [string]$UserPlugins = (Join-Path $HOME '.codexhost\plugins'),
    [string]$BackupRoot = (Join-Path $HOME '.codexhost\backups')
)

$ErrorActionPreference = 'Stop'
$expectedPluginSha256 = '57D1EDD1394F2011B0FF4C88830870FF64C6D4A0A49BFA3BAF0C7094FDA4436A'

# Run scripts/apply-codexhost-0.7.1.mjs first on a clean installation. That
# migration installs the controller/renderer mappings; this helper moves only
# the plugin bundle to CodexHost's user plugin directory.
$pluginSource = Join-Path $PSScriptRoot '..\snapshots\codex-host-runtime\0.7.1\plugin'
$pluginSource = [System.IO.Path]::GetFullPath($pluginSource)
$requiredFiles = @(
    (Join-Path $pluginSource 'manifest.json')
    (Join-Path $pluginSource 'plugin.mjs')
)
foreach ($file in $requiredFiles) {
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) {
        throw "Verified HMHarness plugin artifact is missing: $file"
    }
}

$pluginSha256 = (Get-FileHash -LiteralPath (Join-Path $pluginSource 'plugin.mjs') -Algorithm SHA256).Hash
if ($pluginSha256 -ne $expectedPluginSha256) {
    throw "Verified HMHarness plugin hash mismatch. Expected $expectedPluginSha256, found $pluginSha256."
}

$manifest = Get-Content -LiteralPath (Join-Path $pluginSource 'manifest.json') -Raw |
    ConvertFrom-Json
if ($manifest.id -ne 'hmharness' -or $manifest.adapterApiVersion -ne 1) {
    throw 'The bundled artifact is not the verified HMHarness adapter API v1 plugin.'
}

$cliPackage = [System.IO.Path]::GetFullPath((Join-Path $AppPlugins '..\..\package.json'))
if (-not (Test-Path -LiteralPath $cliPackage -PathType Leaf)) {
    throw "Cannot find @codexhost/cli package metadata at: $cliPackage"
}
$cliVersion = (Get-Content -LiteralPath $cliPackage -Raw | ConvertFrom-Json).version
if ($cliVersion -ne '0.7.1') {
    throw "This artifact is verified only with @codexhost/cli 0.7.1; found $cliVersion."
}

$appPluginsResolved = (Resolve-Path -LiteralPath $AppPlugins).Path
$expectedParts = @('@codexhost\cli', 'node_modules', '@codexhost', 'cli-win32-x64', 'app', 'plugins')
$separator = [System.IO.Path]::DirectorySeparatorChar
$expectedSuffix = $separator + ($expectedParts -join $separator)
if (-not $appPluginsResolved.EndsWith($expectedSuffix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing unexpected CodexHost plugin directory: $appPluginsResolved"
}

New-Item -ItemType Directory -Force -Path $UserPlugins | Out-Null
$userPluginsResolved = (Resolve-Path -LiteralPath $UserPlugins).Path
$userPlugin = Join-Path $userPluginsResolved 'hmharness'
if (Test-Path -LiteralPath $userPlugin) {
    $existingUserPluginResolved = (Resolve-Path -LiteralPath $userPlugin).Path
    if (-not $existingUserPluginResolved.StartsWith($userPluginsResolved, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing unexpected user plugin path: $existingUserPluginResolved"
    }
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $userBackup = Join-Path $BackupRoot "hmharness-user-plugin-$stamp"
    New-Item -ItemType Directory -Force -Path $userBackup | Out-Null
    Copy-Item -LiteralPath $userPlugin -Destination $userBackup -Recurse
    Remove-Item -LiteralPath $userPlugin -Recurse -Force
}
Copy-Item -LiteralPath $pluginSource -Destination $userPluginsResolved -Recurse

$userEnabledPath = Join-Path $userPluginsResolved 'enabled.json'
$userEnabled = if (Test-Path -LiteralPath $userEnabledPath -PathType Leaf) {
    Get-Content -LiteralPath $userEnabledPath -Raw | ConvertFrom-Json -AsHashtable
} else {
    @{ version = 1; enabled = @() }
}
if ($userEnabled.version -ne 1) {
    throw "Unsupported user plugin configuration version: $($userEnabled.version)"
}
$enabled = @($userEnabled.enabled | Where-Object { $_ -ne 'hmharness' })
$userEnabled.enabled = @($enabled + 'hmharness')
$userEnabled | ConvertTo-Json -Depth 8 |
    Set-Content -LiteralPath $userEnabledPath -Encoding utf8NoBOM

$removedBundledDuplicate = $false
# A manually copied plugin inside the npm package is removed so the plugin ID is
# unique and npm upgrades cannot silently strand an old adapter there.
$bundledPlugin = Join-Path $appPluginsResolved 'hmharness'
if (Test-Path -LiteralPath $bundledPlugin -PathType Container) {
    $bundledResolved = (Resolve-Path -LiteralPath $bundledPlugin).Path
    if (-not $bundledResolved.StartsWith($appPluginsResolved, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing unexpected bundled plugin path: $bundledResolved"
    }
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $bundledBackup = Join-Path $BackupRoot "codexhost-071-hmharness-plugin-$stamp"
    New-Item -ItemType Directory -Force -Path $bundledBackup | Out-Null
    Copy-Item -LiteralPath $bundledResolved -Destination $bundledBackup -Recurse
    Remove-Item -LiteralPath $bundledResolved -Recurse -Force
    $removedBundledDuplicate = $true
}

$appEnabledPath = Join-Path $appPluginsResolved 'enabled.json'
if (Test-Path -LiteralPath $appEnabledPath -PathType Leaf) {
    $appEnabled = Get-Content -LiteralPath $appEnabledPath -Raw | ConvertFrom-Json -AsHashtable
    if ($appEnabled.version -eq 1) {
        $appEnabled.enabled = @($appEnabled.enabled | Where-Object { $_ -ne 'hmharness' })
        $appEnabled | ConvertTo-Json -Depth 8 |
            Set-Content -LiteralPath $appEnabledPath -Encoding utf8NoBOM
    }
}

[pscustomobject]@{
    CodexHost = $cliVersion
    InstalledPlugin = $userPlugin
    PluginSha256 = (Get-FileHash -LiteralPath (Join-Path $userPlugin 'plugin.mjs') -Algorithm SHA256).Hash
    BundledDuplicateRemoved = $removedBundledDuplicate
    RestartRequired = $true
}
