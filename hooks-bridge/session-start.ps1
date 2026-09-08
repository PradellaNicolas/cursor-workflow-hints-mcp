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

    $conversationId = [string]$payload.conversation_id
    if ([string]::IsNullOrWhiteSpace($conversationId)) {
        $conversationId = [string]$payload.session_id
    }

    & (Join-Path $PSScriptRoot 'lib\invoke-workflow-hints.ps1') `
        -Event 'session_start' `
        -ConversationId $conversationId `
        -ComposerMode ([string]$payload.composer_mode) `
        -IsBackgroundAgent:([bool]$payload.is_background_agent)
}
catch {
    Write-Output '{}'
    exit 0
}
