#Requires -Version 5.1
$ErrorActionPreference = 'Stop'

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$CliPath = Join-Path $RepoRoot 'dist\cli.js'
$TempData = Join-Path $env:TEMP ("workflow-hints-test-" + [guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $TempData -Force | Out-Null
$env:WORKFLOW_HINTS_DATA_DIR = $TempData

function Invoke-Cli {
    param([string[]]$CliArgs)
    $out = & node $CliPath @CliArgs 2>&1
    return ($out | Out-String).Trim()
}

Write-Host '=== Test workflow-hints CLI ===' -ForegroundColor Cyan

try {
    Write-Host "`n1) session_start (primera del dia)" -ForegroundColor Yellow
    $r1 = Invoke-Cli @('record', '--event', 'session_start', '--conversation-id', 'test-1')
    Write-Host $r1

    Write-Host "`n2) session_start (segunda)" -ForegroundColor Yellow
    $r2 = Invoke-Cli @('record', '--event', 'session_start', '--conversation-id', 'test-2')
    Write-Host $r2

    Write-Host "`n3) file_edit" -ForegroundColor Yellow
    Invoke-Cli @(
        'record', '--event', 'file_edit',
        '--conversation-id', 'test-1',
        '--path', 'c:/projects/my-app/deploy_manifest.txt'
    ) | Out-Null
    Write-Host 'ok'

    Write-Host "`n4) tool_use (primer nudge)" -ForegroundColor Yellow
    $r4 = Invoke-Cli @('record', '--event', 'tool_use', '--conversation-id', 'test-1', '--tool', 'Write')
    Write-Host $r4

    Write-Host "`n5) tool_use (segundo, debe quedar vacio)" -ForegroundColor Yellow
    $r5 = Invoke-Cli @('record', '--event', 'tool_use', '--conversation-id', 'test-1', '--tool', 'Write')
    Write-Host $r5

    Write-Host "`n6) summary" -ForegroundColor Yellow
    Invoke-Cli @('summary') | Write-Host
}
finally {
    Remove-Item -Path $TempData -Recurse -Force -ErrorAction SilentlyContinue
    if ($env:WORKFLOW_HINTS_DATA_DIR -eq $TempData) {
        Remove-Item Env:WORKFLOW_HINTS_DATA_DIR -ErrorAction SilentlyContinue
    }
}

Write-Host "`nListo." -ForegroundColor Green
