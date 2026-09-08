param(
    [Parameter(Mandatory = $true)][string]$Event,
    [string]$ConversationId,
    [string]$FilePath,
    [string]$Tool,
    [string]$McpServer,
    [string]$ComposerMode,
    [bool]$IsBackgroundAgent = $false
)

$ErrorActionPreference = 'SilentlyContinue'

$configPath = Join-Path (Split-Path $PSScriptRoot -Parent) 'workflow-hints.env.json'
if (-not (Test-Path $configPath)) {
    Write-Output '{}'
    exit 0
}

try {
    $config = Get-Content -Path $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $cliPath = [string]$config.cliPath
    if ([string]::IsNullOrWhiteSpace($cliPath) -or -not (Test-Path $cliPath)) {
        Write-Output '{}'
        exit 0
    }

    $args = @('record', '--event', $Event)
    if (-not [string]::IsNullOrWhiteSpace($ConversationId)) { $args += @('--conversation-id', $ConversationId) }
    if (-not [string]::IsNullOrWhiteSpace($FilePath)) { $args += @('--path', $FilePath) }
    if (-not [string]::IsNullOrWhiteSpace($Tool)) { $args += @('--tool', $Tool) }
    if (-not [string]::IsNullOrWhiteSpace($McpServer)) { $args += @('--mcp-server', $McpServer) }
    if (-not [string]::IsNullOrWhiteSpace($ComposerMode)) { $args += @('--composer-mode', $ComposerMode) }
    if ($IsBackgroundAgent) { $args += @('--background-agent', 'true') }

    $result = & node $cliPath @args 2>$null
    if ([string]::IsNullOrWhiteSpace($result)) {
        Write-Output '{}'
        exit 0
    }

    $parsed = $result | ConvertFrom-Json
    $hookOut = @{}

    if ($parsed.additional_context) {
        $hookOut.additional_context = [string]$parsed.additional_context
    }

    if ($hookOut.Count -eq 0) {
        Write-Output '{}'
    }
    else {
        $hookOut | ConvertTo-Json -Compress | Write-Output
    }
    exit 0
}
catch {
    Write-Output '{}'
    exit 0
}
