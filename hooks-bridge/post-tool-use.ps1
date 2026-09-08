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
    $toolName = [string]$payload.tool_name

    if ([string]::IsNullOrWhiteSpace($conversationId)) {
        Write-Output '{}'
        exit 0
    }

    if ($toolName -notin @('Write', 'StrReplace', 'EditNotebook', 'Task')) {
        Write-Output '{}'
        exit 0
    }

    $filePath = $null
    $toolInput = $payload.tool_input
    if ($toolInput -is [string] -and -not [string]::IsNullOrWhiteSpace($toolInput)) {
        try { $toolInput = $toolInput | ConvertFrom-Json } catch { $toolInput = $null }
    }
    if ($toolInput) {
        if ($toolInput.path) { $filePath = [string]$toolInput.path }
        elseif ($toolInput.target_notebook) { $filePath = [string]$toolInput.target_notebook }
    }

    & (Join-Path $PSScriptRoot 'lib\invoke-workflow-hints.ps1') `
        -Event 'tool_use' `
        -ConversationId $conversationId `
        -Tool $toolName `
        -FilePath $filePath
}
catch {
    Write-Output '{}'
    exit 0
}
