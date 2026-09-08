$ErrorActionPreference = 'SilentlyContinue'

function Read-HookInput {
    $inputText = [Console]::In.ReadToEnd()
    if ([string]::IsNullOrWhiteSpace($inputText)) { return $null }
    try { return ($inputText | ConvertFrom-Json) } catch { return $null }
}

try {
    $payload = Read-HookInput
    if (-not $payload) {
        Write-Output '{}'
        exit 0
    }

    $mcpServer = [string]$payload.mcp_server_name
    if ([string]::IsNullOrWhiteSpace($mcpServer)) {
        Write-Output '{}'
        exit 0
    }

    & (Join-Path $PSScriptRoot 'lib\invoke-workflow-hints.ps1') `
        -Event 'mcp_use' `
        -McpServer $mcpServer

    Write-Output '{}'
}
catch {
    Write-Output '{}'
    exit 0
}
