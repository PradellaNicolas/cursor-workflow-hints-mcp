#Requires -Version 5.1
<#
.SYNOPSIS
    Registra las tareas programadas de Workflow Hints.
    Usa scripts PS1 wrapper copiados al directorio de hooks para evitar
    problemas de quoting con rutas con espacios.
    No requiere permisos de administrador.
.PARAMETER HooksDir
    Directorio donde ya se copiaron los hooks (por Install-Cursor.ps1).
    Por defecto: ~/.cursor/hooks/workflow-hints
.PARAMETER WhatIf
    Muestra lo que haria sin ejecutar nada.
#>
param(
    [string]$HooksDir = (Join-Path $env:USERPROFILE '.cursor\hooks\workflow-hints'),
    [switch]$WhatIf
)

$ErrorActionPreference = 'Continue'

$PsExe = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"

$ForceStartScript = Join-Path $HooksDir 'schtask-force-start-day.ps1'
$DesktopShortcutName = 'Cursor - Iniciar jornada.lnk'

$Tasks = @(
    @{
        Name      = 'WorkflowHints-MorningCheck'
        Script    = Join-Path $HooksDir 'schtask-morning-check.ps1'
        Schedule  = 'ONLOGON'
        Delay     = '0001:00'
    },
    @{
        Name      = 'WorkflowHints-EarlyCheck'
        Script    = $ForceStartScript
        Schedule  = 'DAILY'
        StartTime = '09:00'
    },
    @{
        Name      = 'WorkflowHints-MorningFollowup'
        Script    = Join-Path $HooksDir 'schtask-morning-followup.ps1'
        Schedule  = 'DAILY'
        StartTime = '10:30'
    }
)

$StartupDir = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::Startup)

# Limpiar artefactos con nombres legacy (pipol)
$LegacyStartupVbs = Join-Path $StartupDir 'PipolHints-MorningCheck.vbs'
if ((Test-Path $LegacyStartupVbs) -and -not $WhatIf) {
    Remove-Item $LegacyStartupVbs -Force -ErrorAction SilentlyContinue
}

$LegacyDesktopShortcut = Join-Path ([System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::DesktopDirectory)) 'PipolHints - Iniciar jornada.lnk'
if ((Test-Path $LegacyDesktopShortcut) -and -not $WhatIf) {
    Remove-Item $LegacyDesktopShortcut -Force -ErrorAction SilentlyContinue
}

foreach ($legacyTask in @('PipolHints-MorningCheck', 'PipolHints-EarlyCheck', 'PipolHints-MorningFollowup')) {
    if (-not $WhatIf) {
        $null = cmd /c "schtasks /Delete /TN `"$legacyTask`" /F 2>&1"
    }
}

foreach ($task in $Tasks) {
    if ($WhatIf) {
        Write-Host "[WhatIf] Instalaria tarea: $($task.Name)"
        continue
    }

    if (-not (Test-Path $task.Script)) {
        Write-Warning "Script no encontrado (skip): $($task.Script)"
        continue
    }

    if ($task.Schedule -eq 'ONLOGON') {
        $startupVbs = Join-Path $StartupDir "WorkflowHints-MorningCheck.vbs"
        $vbsContent = @"
' Workflow Hints - morning check al iniciar sesion
Set sh = CreateObject("WScript.Shell")
sh.Run "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File """ & "$($task.Script.Replace('"',''))" & """", 0, False
"@
        $utf8NoBom = New-Object System.Text.UTF8Encoding $false
        [System.IO.File]::WriteAllText($startupVbs, $vbsContent, $utf8NoBom)
        Write-Host "OK: $($task.Name) -> Startup: $startupVbs"
    }
    else {
        $null = cmd /c "schtasks /Delete /TN `"$($task.Name)`" /F 2>&1"

        $shortScript = $task.Script
        try {
            $fso = New-Object -ComObject Scripting.FileSystemObject
            $shortScript = $fso.GetFile($task.Script).ShortPath
        } catch { }

        $tr = "$PsExe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$shortScript`""
        $schtasksArgs = "/Create /TN `"$($task.Name)`" /TR `"$tr`" /SC DAILY /ST $($task.StartTime) /RL LIMITED /F"
        $out = cmd /c "schtasks $schtasksArgs 2>&1"
        if ($LASTEXITCODE -eq 0) {
            Write-Host "OK: $($task.Name)"
        } else {
            Write-Warning "No se pudo registrar $($task.Name): $out"
        }
    }
}

if (-not $WhatIf) {
    if (-not (Test-Path $ForceStartScript)) {
        Write-Warning "Script no encontrado (skip shortcut): $ForceStartScript"
    }
    else {
        $DesktopDir = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::DesktopDirectory)
        $shortcutPath = Join-Path $DesktopDir $DesktopShortcutName

        $shortScript = $ForceStartScript
        try {
            $fso = New-Object -ComObject Scripting.FileSystemObject
            $shortScript = $fso.GetFile($ForceStartScript).ShortPath
        } catch { }

        $shell = New-Object -ComObject WScript.Shell
        $shortcut = $shell.CreateShortcut($shortcutPath)
        $shortcut.TargetPath = $PsExe
        $shortcut.Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$shortScript`""
        $shortcut.WorkingDirectory = $HooksDir
        $shortcut.Description = 'Workflow Hints: forzar inicio de jornada en Cursor'
        $shortcut.Save()

        Write-Host "OK: Acceso directo -> $shortcutPath"
    }
}

Write-Host "Tareas instaladas."
