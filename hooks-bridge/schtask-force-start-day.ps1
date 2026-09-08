$ErrorActionPreference = 'SilentlyContinue'
try {
    $configPath = Join-Path $PSScriptRoot 'workflow-hints.env.json'
    if (-not (Test-Path $configPath)) { exit 0 }
    $config = Get-Content -Path $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $cliPath = [string]$config.cliPath
    if ([string]::IsNullOrWhiteSpace($cliPath) -or -not (Test-Path $cliPath)) { exit 0 }
    & node $cliPath 'morning-check' '--force'
} catch { exit 0 }
