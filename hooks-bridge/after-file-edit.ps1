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
    $filePath = [string]$payload.file_path

    if ([string]::IsNullOrWhiteSpace($conversationId) -or [string]::IsNullOrWhiteSpace($filePath)) {
        Write-Output '{}'
        exit 0
    }

    & (Join-Path $PSScriptRoot 'lib\invoke-workflow-hints.ps1') `
        -Event 'file_edit' `
        -ConversationId $conversationId `
        -FilePath $filePath

    Write-Output '{}'
}
catch {
    Write-Output '{}'
    exit 0
}
