$ErrorActionPreference = 'SilentlyContinue'

try {
    & (Join-Path $PSScriptRoot 'lib\invoke-workflow-hints.ps1') `
        -Event 'workspace_open'
}
catch {
    Write-Output '{}'
    exit 0
}
