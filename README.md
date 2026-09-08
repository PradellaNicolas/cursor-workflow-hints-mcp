# cursor-workflow-hints-mcp

MCP + CLI para recordatorios de flujo en Cursor: estado local, nudges al agente, toasts Windows y contadores diarios (sesiones, edits, MCP, Plans).

Herramienta generica para equipos que usan Cursor. Nombre del servidor en Cursor: **workflow-hints**.

## Requisitos

- Node.js 20+
- Windows (toasts; el core funciona sin notificaciones)
- Cursor con hooks y MCP habilitados

## Instalacion

```powershell
cd <ruta-al-repo>
npm ci
npm run build
powershell -ExecutionPolicy Bypass -File .\hooks-bridge\Install-Cursor.ps1 -ReplaceLegacyWorkflowHints
```

`-ReplaceLegacyWorkflowHints` quita entradas legacy de otros packs en `hooks.json` (opcional).

Reinicia Cursor. Verifica **Settings → MCP** (`workflow-hints`) y **Settings → Hooks**.

## CLI (hooks)

```powershell
node dist/cli.js record --event session_start --conversation-id <id>
node dist/cli.js record --event file_edit --conversation-id <id> --path <abs>
node dist/cli.js morning-check --force
node dist/cli.js summary
node dist/cli.js context
node dist/cli.js dismiss --type all
```

## MCP tools

| Tool | Descripcion |
|------|-------------|
| `hints_record_event` | Registra evento y devuelve nudge |
| `hints_get_context` | Resumen para el agente |
| `hints_get_daily_summary` | Contadores estructurados |
| `hints_set_preferences` | Umbrales y toasts |
| `hints_dismiss_nudge` | Silenciar por tipo o todo el dia |

Resource: `hints://today`

## Estado local

`%USERPROFILE%\.cursor\workflow-hints\`

- `state.json` — dia, contadores, conversaciones
- `config.json` — umbrales (se crea al editar preferencias)
- `stack-hints.json` — hints opcionales por patron de ruta (ver `config/stack-hints.example.json`)

Migracion automatica desde `%USERPROFILE%\.cursor\pipol-hints\` y `%USERPROFILE%\.cursor\workflow-hints-state.json` si existen.

## Tareas programadas (Windows)

| Tarea | Cuando |
|-------|--------|
| `WorkflowHints-MorningCheck` | Al iniciar sesion (Startup) |
| `WorkflowHints-EarlyCheck` | Diario 9:00 |
| `WorkflowHints-MorningFollowup` | Diario 10:30 si no hubo uso |

Acceso directo en Escritorio: **Cursor - Iniciar jornada**

## Tests

```powershell
npm test
powershell -ExecutionPolicy Bypass -File .\test\Test-WorkflowHints.ps1
```

## Desinstalacion

```powershell
powershell -ExecutionPolicy Bypass -File .\hooks-bridge\Uninstall-ScheduledTasks.ps1
```

1. Quitar `workflow-hints` de `~/.cursor/mcp.json`
2. Quitar entradas `hooks/workflow-hints/` de `~/.cursor/hooks.json`
3. Borrar `~/.cursor/hooks/workflow-hints/` (opcional)
4. Borrar `~/.cursor/workflow-hints/` (opcional)

## Variables de entorno

`WORKFLOW_HINTS_DATA_DIR` — directorio alternativo para state/config.
