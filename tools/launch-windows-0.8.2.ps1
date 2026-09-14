[CmdletBinding()]
param(
    [switch]$RestoreOnly,
    [string]$ImportEnvironmentBackup = ''
)

$ErrorActionPreference = 'Stop'
$codexHostVersion = '0.8.2'
$trackedEnvironmentNames = @(
    'CODEX_CLI_PATH'
    'CODEXHOST_STOCK_CODEX_PATH'
    'CODEXHOST_HOST_NODE_PATH'
    'CODEXHOST_HOST_RUNTIME_PATH'
    'CODEXHOST_DEFAULT_AGENT'
    'CODEXHOST_DATA_DIR'
    'CODEXHOST_LAUNCHER_EXECUTABLE'
)

$codexHostRoot = Join-Path $env:LOCALAPPDATA 'Programs\codexhost'
$codexHostExecutablePath = Join-Path $codexHostRoot 'bin\codexhost.exe'
$codexHostNodePath = Join-Path $codexHostRoot 'runtime\node.exe'
$codexHostShimPath = Join-Path $codexHostRoot 'libexec\codexhost-shim.exe'
$codexHostRuntimePath = Join-Path $codexHostRoot 'app\host-runtime.mjs'
$codexHostControllerPath = Join-Path $codexHostRoot 'app\desktop-controller.mjs'
$codexHostRendererPath = Join-Path $codexHostRoot 'app\renderer-extension.js'
$distributionPath = Join-Path $codexHostRoot 'app\codexhost-distribution.json'
$dataDirectory = Join-Path $HOME '.codexhost'
$backupRoot = Join-Path $dataDirectory 'backups'
$fallbackStatePath = Join-Path $dataDirectory 'windows-082-launch-fallback.json'

function Convert-ToNormalPath {
    param([string]$Path)
    if ($Path -like '\\?\*') { return $Path.Substring(4) }
    return $Path
}

function Get-RegistryEnvironmentSnapshot {
    $snapshot = @()
    $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment', $false)
    try {
        $valueNames = @($key.GetValueNames())
        foreach ($name in $trackedEnvironmentNames) {
            if ($valueNames -contains $name) {
                $value = $key.GetValue(
                    $name,
                    $null,
                    [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames
                )
                $snapshot += [pscustomobject]@{
                    name = $name
                    exists = $true
                    value = $value
                    valueKind = [int]$key.GetValueKind($name)
                }
            }
            else {
                $snapshot += [pscustomobject]@{
                    name = $name
                    exists = $false
                    value = $null
                    valueKind = $null
                }
            }
        }
        return $snapshot
    }
    finally {
        $key.Dispose()
    }
}

function Write-JsonFile {
    param(
        [string]$Path,
        [object]$Value
    )
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Path) | Out-Null
    $Value | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $Path -Encoding utf8NoBOM
}

function Read-FallbackState {
    if (-not (Test-Path -LiteralPath $fallbackStatePath -PathType Leaf)) { return $null }
    try {
        $state = Get-Content -LiteralPath $fallbackStatePath -Raw | ConvertFrom-Json
        if ($state.schemaVersion -ne 1 -or $null -eq $state.environment) { return $null }
        return $state
    }
    catch {
        Write-Warning "Ignoring unreadable CodexHost fallback state: $_"
        return $null
    }
}

function Convert-LegacyEnvironmentBackup {
    param(
        [Parameter(Mandatory = $true)]
        [object]$Backup
    )

    $environment = @()
    foreach ($name in $trackedEnvironmentNames) {
        $property = $Backup.PSObject.Properties[$name]
        $hasValue = $null -ne $property -and $null -ne $property.Value
        $environment += [pscustomobject]@{
            name = $name
            exists = $hasValue
            value = if ($hasValue) { $property.Value } else { $null }
            valueKind = if ($hasValue) { [int][Microsoft.Win32.RegistryValueKind]::String } else { $null }
        }
    }
    return $environment
}

function Invoke-EnvironmentChangeBroadcast {
    Add-Type -Namespace CodexHostLaunch -Name NativeMethods -MemberDefinition @'
[DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
public static extern IntPtr SendMessageTimeout(
    IntPtr hWnd,
    uint message,
    UIntPtr wParam,
    string lParam,
    uint flags,
    uint timeout,
    out UIntPtr result);
'@
    $result = [UIntPtr]::Zero
    [CodexHostLaunch.NativeMethods]::SendMessageTimeout(
        [IntPtr]0xffff,
        0x001A,
        [UIntPtr]::Zero,
        'Environment',
        0x0002,
        5000,
        [ref]$result
    ) | Out-Null
}

function Restore-RegistryEnvironment {
    param(
        [Parameter(Mandatory = $true)]
        [object]$Environment
    )

    $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment', $true)
    try {
        foreach ($entry in $Environment) {
            if ($trackedEnvironmentNames -notcontains $entry.name) { continue }
            if ($entry.exists) {
                $kind = [Microsoft.Win32.RegistryValueKind]$entry.valueKind
                $key.SetValue($entry.name, [string]$entry.value, $kind)
            }
            else {
                $key.DeleteValue($entry.name, $false)
            }
        }
    }
    finally {
        $key.Dispose()
    }
    Invoke-EnvironmentChangeBroadcast
}

function Remove-CodexHostProcessEnvironment {
    foreach ($name in $trackedEnvironmentNames) {
        Remove-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue
    }
}

function Restore-CodexConfigCliPath {
    param([string]$StockCodexPath)
    if ([string]::IsNullOrWhiteSpace($StockCodexPath)) { return $false }
    $configPath = Join-Path $HOME '.codex\config.toml'
    if (-not (Test-Path -LiteralPath $configPath -PathType Leaf)) { return $false }

    $lines = [System.Collections.Generic.List[string]]::new()
    $lines.AddRange([string[]](Get-Content -LiteralPath $configPath))
    $changed = $false
    for ($index = 0; $index -lt $lines.Count; $index++) {
        if ($lines[$index] -notmatch '^\s*CODEX_CLI_PATH\s*=') { continue }
        if ($lines[$index] -notlike '*codexhost-shim.exe*') { continue }
        $escapedPath = $StockCodexPath.Replace("'", "''")
        $lines[$index] = "CODEX_CLI_PATH = '$escapedPath'"
        $changed = $true
    }
    if (-not $changed) { return $false }

    $temporaryPath = Join-Path (Split-Path -Parent $configPath) ".codex-config-restore-$PID.tmp"
    try {
        [System.IO.File]::WriteAllLines(
            $temporaryPath,
            $lines,
            [System.Text.UTF8Encoding]::new($false)
        )
        Move-Item -LiteralPath $temporaryPath -Destination $configPath -Force
    }
    finally {
        if (Test-Path -LiteralPath $temporaryPath) {
            Remove-Item -LiteralPath $temporaryPath -Force
        }
    }
    return $true
}

function Get-ShimProcess {
    $normalizedShimPath = $codexHostShimPath.ToLowerInvariant()
    Get-CimInstance Win32_Process -Filter "Name = 'codexhost-shim.exe'" |
        Where-Object {
            $executablePath = Convert-ToNormalPath ([string]$_.ExecutablePath)
            $executablePath.ToLowerInvariant() -eq $normalizedShimPath
        } |
        Sort-Object ProcessId |
        Select-Object -First 1
}

function Get-StockCodexCliPath {
    $inspectOutput = & $codexHostExecutablePath inspect 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "codexhost inspect failed: $($inspectOutput -join ' ')"
    }
    $line = [string]($inspectOutput | Where-Object { $_ -match '^executable_codex_cli=' } | Select-Object -First 1)
    if ([string]::IsNullOrWhiteSpace($line)) {
        throw 'codexhost inspect did not return executable_codex_cli.'
    }
    $path = Convert-ToNormalPath ($line -replace '^executable_codex_cli=', '').Trim()
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "CodexHost inspect returned a missing CLI path: $path"
    }
    return $path
}

function Restore-FromState {
    param([object]$State)
    if ($null -eq $State) { return $false }
    Restore-RegistryEnvironment -Environment $State.environment
    Remove-CodexHostProcessEnvironment
    [void](Restore-CodexConfigCliPath -StockCodexPath $State.stockCodexCliPath)
    Remove-Item -LiteralPath $fallbackStatePath -Force -ErrorAction SilentlyContinue
    return $true
}

$state = Read-FallbackState
if (-not [string]::IsNullOrWhiteSpace($ImportEnvironmentBackup)) {
    if (-not (Test-Path -LiteralPath $ImportEnvironmentBackup -PathType Leaf)) {
        throw "Environment backup not found: $ImportEnvironmentBackup"
    }
    $legacyBackup = Get-Content -LiteralPath $ImportEnvironmentBackup -Raw | ConvertFrom-Json
    $state = [pscustomobject]@{
        environment = Convert-LegacyEnvironmentBackup -Backup $legacyBackup
        stockCodexCliPath = Get-StockCodexCliPath
    }
}
if ($RestoreOnly) {
    if (Restore-FromState -State $state) { exit 0 }
    [void](Restore-CodexConfigCliPath -StockCodexPath (Get-StockCodexCliPath))
    exit 1
}

foreach ($requiredPath in @(
    $codexHostExecutablePath,
    $codexHostNodePath,
    $codexHostShimPath,
    $codexHostRuntimePath,
    $codexHostControllerPath,
    $codexHostRendererPath,
    $distributionPath
)) {
    if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
        throw "CodexHost $codexHostVersion launcher artifact is missing: $requiredPath"
    }
}
$distribution = Get-Content -LiteralPath $distributionPath -Raw | ConvertFrom-Json
if ($distribution.version -ne $codexHostVersion) {
    throw "This launcher supports CodexHost $codexHostVersion only; found $($distribution.version)."
}

$stockCodexCliPath = Get-StockCodexCliPath
Restore-CodexConfigCliPath -StockCodexPath $stockCodexCliPath | Out-Null

if ($null -ne $state -and $null -eq (Get-ShimProcess)) {
    Restore-FromState -State $state | Out-Null
    $state = $null
}

$attachedToExistingShim = $null -ne $state -and $null -ne (Get-ShimProcess)
if (-not $attachedToExistingShim) {
    if ($null -ne (Get-ShimProcess)) {
        Remove-CodexHostProcessEnvironment
    }
    else {
        $stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
        $backupDirectory = Join-Path $backupRoot "env-082-launch-$stamp"
        $environment = Get-RegistryEnvironmentSnapshot
        Write-JsonFile -Path (Join-Path $backupDirectory 'environment.json') -Value $environment
        $state = [pscustomobject]@{
            schemaVersion = 1
            codexHostVersion = $codexHostVersion
            createdAt = (Get-Date).ToUniversalTime().ToString('o')
            backupPath = $backupDirectory
            stockCodexCliPath = $stockCodexCliPath
            shimPath = $codexHostShimPath
            environment = $environment
        }
        Write-JsonFile -Path $fallbackStatePath -Value $state

        $fallbackValues = @{
            CODEX_CLI_PATH = $codexHostShimPath
            CODEXHOST_STOCK_CODEX_PATH = $stockCodexCliPath
            CODEXHOST_HOST_NODE_PATH = $codexHostNodePath
            CODEXHOST_HOST_RUNTIME_PATH = $codexHostRuntimePath
            CODEXHOST_DEFAULT_AGENT = 'codex'
            CODEXHOST_DATA_DIR = $dataDirectory
            CODEXHOST_LAUNCHER_EXECUTABLE = $codexHostExecutablePath
        }
        $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment', $true)
        try {
            foreach ($name in $fallbackValues.Keys) {
                $key.SetValue($name, [string]$fallbackValues[$name], [Microsoft.Win32.RegistryValueKind]::String)
                Set-Content -LiteralPath "Env:$name" -Value $fallbackValues[$name]
            }
        }
        finally {
            $key.Dispose()
        }
        Invoke-EnvironmentChangeBroadcast

        foreach ($proxyVariable in @('http_proxy', 'https_proxy', 'all_proxy', 'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY')) {
            Remove-Item -LiteralPath "Env:$proxyVariable" -ErrorAction SilentlyContinue
        }
        $env:NO_PROXY = 'localhost,127.0.0.1,::1'
        $env:no_proxy = 'localhost,127.0.0.1,::1'
        $env:CODEXHOST_WINDOWS_APPX_ENV_FALLBACK = '1'

        $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
        $startInfo.FileName = $codexHostExecutablePath
        $startInfo.WorkingDirectory = $codexHostRoot
        $startInfo.UseShellExecute = $false
        $startInfo.CreateNoWindow = $true
        foreach ($launchArgument in @(
            'launch',
            '--node', $codexHostNodePath,
            '--shim', $codexHostShimPath,
            '--host-runtime', $codexHostRuntimePath,
            '--desktop-controller', $codexHostControllerPath,
            '--renderer', $codexHostRendererPath
        )) {
            [void]$startInfo.ArgumentList.Add($launchArgument)
        }
        [System.Diagnostics.Process]::Start($startInfo) | Out-Null
    }
}

$readyDeadline = (Get-Date).AddSeconds(120)
do {
    Start-Sleep -Seconds 2
    $shim = Get-ShimProcess
} while ($null -eq $shim -and (Get-Date) -lt $readyDeadline)

if ($null -eq $shim) {
    Restore-FromState -State (Read-FallbackState) | Out-Null
    throw "CodexHost $codexHostVersion did not start the Host shim before timeout."
}

do {
    Start-Sleep -Seconds 2
    $shim = Get-ShimProcess
} while ($null -ne $shim)

Start-Sleep -Seconds 5
if ($null -eq (Get-ShimProcess)) {
    Restore-FromState -State (Read-FallbackState) | Out-Null
}
