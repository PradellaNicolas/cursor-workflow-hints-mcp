#Requires -Version 5.1
param(
    [switch]$WhatIf
)

$ErrorActionPreference = 'SilentlyContinue'

$StartupDir = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::Startup)
$DesktopDir = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::DesktopDirectory)

foreach ($startupVbs in @(
    (Join-Path $StartupDir 'WorkflowHints-MorningCheck.vbs'),
    (Join-Path $StartupDir 'PipolHints-MorningCheck.vbs')
)) {
    if (Test-Path $startupVbs) {
        if ($WhatIf) { Write-Host "[WhatIf] Eliminaria: $startupVbs" }
        else {
            Remove-Item $startupVbs -Force
            Write-Host "Eliminado: $startupVbs"
        }
    }
}

foreach ($desktopShortcut in @(
    (Join-Path $DesktopDir 'Cursor - Iniciar jornada.lnk'),
    (Join-Path $DesktopDir 'PipolHints - Iniciar jornada.lnk')
)) {
    if (Test-Path $desktopShortcut) {
        if ($WhatIf) { Write-Host "[WhatIf] Eliminaria: $desktopShortcut" }
        else {
            Remove-Item $desktopShortcut -Force
            Write-Host "Eliminado: $desktopShortcut"
        }
    }
}

$DailyTasks = @(
    'WorkflowHints-EarlyCheck',
    'WorkflowHints-MorningFollowup',
    'PipolHints-EarlyCheck',
    'PipolHints-MorningFollowup'
)
foreach ($name in $DailyTasks) {
    if ($WhatIf) {
        Write-Host "[WhatIf] Eliminaria tarea: $name"
        continue
    }
    $out = cmd /c "schtasks /Delete /TN `"$name`" /F 2>&1"
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Tarea eliminada: $name"
    }
}
