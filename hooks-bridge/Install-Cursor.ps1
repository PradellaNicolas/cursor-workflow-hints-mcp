#Requires -Version 5.1
param(
    [string]$RepoPath = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
    [switch]$ReplaceLegacyWorkflowHints,
    [switch]$WhatIf
)

$ErrorActionPreference = 'Stop'

$CursorRoot = Join-Path $env:USERPROFILE '.cursor'
$HooksJsonPath = Join-Path $CursorRoot 'hooks.json'
$McpJsonPath = Join-Path $CursorRoot 'mcp.json'
$TargetHooksDir = Join-Path $CursorRoot 'hooks\workflow-hints'
$LegacyHooksDir = Join-Path $CursorRoot 'hooks\pipol-hints'
$BridgeDir = Join-Path $RepoPath 'hooks-bridge'
$CliPath = Join-Path $RepoPath 'dist\cli.js'
$McpIndexPath = Join-Path $RepoPath 'dist\index.js'
$Marker = 'hooks/workflow-hints/session-start.ps1'
$McpServerName = 'workflow-hints'

function Merge-HookArrays {
    param([object[]]$Existing, [object[]]$Incoming)
    $result = @()
    if ($Existing) { $result += $Existing }

    foreach ($entry in $Incoming) {
        $duplicate = $false
        foreach ($current in $result) {
            if (([string]$current.command) -eq ([string]$entry.command)) {
                $duplicate = $true
                break
            }
        }
        if (-not $duplicate) { $result += $entry }
    }
    return ,$result
}

function Remove-LegacyHookEntries {
    param($HooksConfig)
    if (-not $HooksConfig.hooks) { return }

    foreach ($eventName in @($HooksConfig.hooks.PSObject.Properties.Name)) {
        $filtered = @($HooksConfig.hooks.$eventName | Where-Object {
            $cmd = [string]$_.command
            -not ($cmd -like '*workflow-hints/*' -or $cmd -like '*pipol-hints/*')
        })
        $HooksConfig.hooks.$eventName = $filtered
    }
}

function Remove-OldHookCommands {
    param($HooksConfig)
    if (-not $HooksConfig.hooks) { return }

    foreach ($eventName in @($HooksConfig.hooks.PSObject.Properties.Name)) {
        $filtered = @($HooksConfig.hooks.$eventName | Where-Object {
            $cmd = [string]$_.command
            -not ($cmd -like '*pipol-hints/*')
        })
        $HooksConfig.hooks.$eventName = $filtered
    }
}

if (-not (Test-Path $CliPath)) {
    throw "No se encontro dist/cli.js. Ejecuta: npm ci && npm run build en $RepoPath"
}

if ($WhatIf) {
    Write-Host "[WhatIf] Instalaria workflow-hints desde $RepoPath"
    exit 0
}

New-Item -ItemType Directory -Path $TargetHooksDir -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $TargetHooksDir 'lib') -Force | Out-Null

Copy-Item -Path (Join-Path $BridgeDir '*.ps1') -Destination $TargetHooksDir -Force
Copy-Item -Path (Join-Path $BridgeDir 'lib\invoke-workflow-hints.ps1') -Destination (Join-Path $TargetHooksDir 'lib\invoke-workflow-hints.ps1') -Force

@{ cliPath = $CliPath.Replace('\', '/') } | ConvertTo-Json | Set-Content -Path (Join-Path $TargetHooksDir 'workflow-hints.env.json') -Encoding UTF8

$fragment = Get-Content -Path (Join-Path $BridgeDir 'hooks.fragment.json') -Raw -Encoding UTF8 | ConvertFrom-Json

if (Test-Path $HooksJsonPath) {
    $hooksConfig = Get-Content -Path $HooksJsonPath -Raw -Encoding UTF8 | ConvertFrom-Json
}
else {
    $hooksConfig = [ordered]@{ version = 1; hooks = [ordered]@{} }
}

if (-not $hooksConfig.hooks) {
    $hooksConfig | Add-Member -NotePropertyName hooks -NotePropertyValue ([ordered]@{}) -Force
}

if ($ReplaceLegacyWorkflowHints) {
    Remove-LegacyHookEntries -HooksConfig $hooksConfig
}

Remove-OldHookCommands -HooksConfig $hooksConfig

foreach ($eventName in $fragment.PSObject.Properties.Name) {
    $incoming = @($fragment.$eventName)
    $existing = @()
    if ($hooksConfig.hooks.$eventName) { $existing = @($hooksConfig.hooks.$eventName) }
    $merged = Merge-HookArrays -Existing $existing -Incoming $incoming
    if ($hooksConfig.hooks.PSObject.Properties.Name -contains $eventName) {
        $hooksConfig.hooks.$eventName = $merged
    }
    else {
        $hooksConfig.hooks | Add-Member -NotePropertyName $eventName -NotePropertyValue $merged -Force
    }
}

if (Test-Path $HooksJsonPath) {
    Copy-Item $HooksJsonPath "$HooksJsonPath.bak-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
}
$hooksConfig | ConvertTo-Json -Depth 12 | Set-Content -Path $HooksJsonPath -Encoding UTF8

if (Test-Path $McpJsonPath) {
    $mcpConfig = Get-Content -Path $McpJsonPath -Raw -Encoding UTF8 | ConvertFrom-Json
}
else {
    $mcpConfig = [ordered]@{ mcpServers = [ordered]@{} }
}

if (-not $mcpConfig.mcpServers) {
    $mcpConfig | Add-Member -NotePropertyName mcpServers -NotePropertyValue ([ordered]@{}) -Force
}

$serverEntry = [ordered]@{
    command = 'node'
    args    = @($McpIndexPath.Replace('\', '/'))
}

if ($mcpConfig.mcpServers.PSObject.Properties.Name -contains $McpServerName) {
    $mcpConfig.mcpServers.$McpServerName = $serverEntry
}
else {
    $mcpConfig.mcpServers | Add-Member -NotePropertyName $McpServerName -NotePropertyValue $serverEntry -Force
}

if ($mcpConfig.mcpServers.PSObject.Properties.Name -contains 'pipol-hints') {
    $mcpConfig.mcpServers.PSObject.Properties.Remove('pipol-hints')
}

if (Test-Path $McpJsonPath) {
    Copy-Item $McpJsonPath "$McpJsonPath.bak-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
}
$mcpConfig | ConvertTo-Json -Depth 12 | Set-Content -Path $McpJsonPath -Encoding UTF8

Write-Host "workflow-hints instalado."
Write-Host "Hooks: $TargetHooksDir"
Write-Host "MCP: $McpServerName -> $McpIndexPath"

$ScheduleScript = Join-Path $BridgeDir 'Install-ScheduledTasks.ps1'
if (Test-Path $ScheduleScript) {
    Write-Host ""
    Write-Host "Registrando tareas programadas..."
    & $ScheduleScript -HooksDir $TargetHooksDir
}

Write-Host ""
Write-Host "Reinicia Cursor y revisa Settings > Hooks / MCP."
