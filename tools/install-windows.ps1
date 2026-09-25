[CmdletBinding()]
param(
    [string]$AppPlugins = '',
    [string]$UserPlugins = (Join-Path $HOME '.codexhost\plugins'),
    [string]$BackupRoot = (Join-Path $HOME '.codexhost\backups')
)

$ErrorActionPreference = 'Stop'
$expectedPluginSha256 = '57D1EDD1394F2011B0FF4C88830870FF64C6D4A0A49BFA3BAF0C7094FDA4436A'

# Run scripts/apply-codexhost-0.10.1.mjs first on a clean installation. That
# migration installs the controller/renderer mappings; this helper moves only
# the plugin bundle to CodexHost's user plugin directory.
$expectedIconSha256 = '950FA9B06484F9D56C51A976679252D3061832279292658C20E59D9F06FE75DF'
$pluginSource = Join-Path $PSScriptRoot '..\snapshots\codex-host-runtime\0.10.1\plugin'
$pluginSource = [System.IO.Path]::GetFullPath($pluginSource)
$requiredFiles = @(
    (Join-Path $pluginSource 'manifest.json')
    (Join-Path $pluginSource 'plugin.mjs')
    (Join-Path $pluginSource 'assets\icon.svg')
)
foreach ($file in $requiredFiles) {
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) {
        throw "Verified HMHarness plugin artifact is missing: $file"
    }
}

if ([string]::IsNullOrWhiteSpace($AppPlugins)) {
    $installerPlugins = Join-Path $env:LOCALAPPDATA 'Programs\codexhost\app\plugins'
    $npmPlugins = Join-Path $env:APPDATA 'npm\node_modules\@codexhost\cli\node_modules\@codexhost\cli-win32-x64\app\plugins'
    $AppPlugins = if (Test-Path -LiteralPath $installerPlugins -PathType Container) {
        $installerPlugins
    } else {
        $npmPlugins
    }
}
if (-not (Test-Path -LiteralPath $AppPlugins -PathType Container)) {
    throw "Cannot find CodexHost plugin directory: $AppPlugins"
}

$pluginSha256 = (Get-FileHash -LiteralPath (Join-Path $pluginSource 'plugin.mjs') -Algorithm SHA256).Hash
if ($pluginSha256 -ne $expectedPluginSha256) {
    throw "Verified HMHarness plugin hash mismatch. Expected $expectedPluginSha256, found $pluginSha256."
}
$iconSha256 = (Get-FileHash -LiteralPath (Join-Path $pluginSource 'assets\icon.svg') -Algorithm SHA256).Hash
if ($iconSha256 -ne $expectedIconSha256) {
    throw "Verified HMHarness icon hash mismatch. Expected $expectedIconSha256, found $iconSha256."
}

$manifest = Get-Content -LiteralPath (Join-Path $pluginSource 'manifest.json') -Raw |
    ConvertFrom-Json
if ($manifest.id -ne 'hmharness' -or $manifest.adapterApiVersion -ne 1) {
    throw 'The bundled artifact is not the verified HMHarness adapter API v1 plugin.'
}
if ($manifest.icon -ne './assets/icon.svg') {
    throw 'The bundled HMHarness artifact does not reference its verified icon.'
}

$distributionPath = [System.IO.Path]::GetFullPath((Join-Path $AppPlugins '..\codexhost-distribution.json'))
if (-not (Test-Path -LiteralPath $distributionPath -PathType Leaf)) {
    throw "Cannot find CodexHost distribution metadata at: $distributionPath"
}
$distribution = Get-Content -LiteralPath $distributionPath -Raw | ConvertFrom-Json
if ($distribution.version -ne '0.10.1') {
    throw "This artifact is verified only with CodexHost 0.10.1; found $($distribution.version)."
}

$appPluginsResolved = (Resolve-Path -LiteralPath $AppPlugins).Path
$separator = [System.IO.Path]::DirectorySeparatorChar
$expectedSuffixes = @(
    ($separator + (@('codexhost', 'app', 'plugins') -join $separator)),
    ($separator + (@('@codexhost\cli', 'node_modules', '@codexhost', 'cli-win32-x64', 'app', 'plugins') -join $separator))
)
if (-not ($expectedSuffixes | Where-Object { $appPluginsResolved.EndsWith($_, [System.StringComparison]::OrdinalIgnoreCase) })) {
    throw "Refusing unexpected CodexHost plugin directory: $appPluginsResolved"
}

New-Item -ItemType Directory -Force -Path $UserPlugins | Out-Null
$userPluginsResolved = (Resolve-Path -LiteralPath $UserPlugins).Path
$userPlugin = Join-Path $userPluginsResolved 'hmharness'
$misplacedPlugin = Join-Path $userPluginsResolved 'plugin'
if (Test-Path -LiteralPath $misplacedPlugin -PathType Container) {
    $misplacedResolved = (Resolve-Path -LiteralPath $misplacedPlugin).Path
    if ($misplacedResolved -ne $misplacedPlugin) {
        throw "Refusing unexpected misplaced plugin path: $misplacedResolved"
    }
    Remove-Item -LiteralPath $misplacedResolved -Recurse -Force
}
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
New-Item -ItemType Directory -Force -Path $userPlugin | Out-Null
Copy-Item -Path (Join-Path $pluginSource '*') -Destination $userPlugin -Recurse -Force

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
    $bundledBackup = Join-Path $BackupRoot "codexhost-0101-hmharness-plugin-$stamp"
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
    CodexHost = $distribution.version
    Distribution = $distribution.distribution
    InstalledPlugin = $userPlugin
    PluginSha256 = (Get-FileHash -LiteralPath (Join-Path $userPlugin 'plugin.mjs') -Algorithm SHA256).Hash
    IconSha256 = (Get-FileHash -LiteralPath (Join-Path $userPlugin 'assets\icon.svg') -Algorithm SHA256).Hash
    BundledDuplicateRemoved = $removedBundledDuplicate
    RestartRequired = $true
}
