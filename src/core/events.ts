import type {
  AppConfig,
  AppState,
  DailySummary,
  HookResponse,
  NudgeType,
  RecordEventInput,
} from "./types.js";
import {
  ensureConversation,
  formatDateKey,
  getStackHint,
  isWeekday,
  loadConfig,
  loadState,
  saveState,
} from "./state.js";

const MORNING_TITLE = "Cursor — hoy te miden";
const MORNING_BODY =
  "Dia habil: te miden por dia calificado (~1M tokens). Abri Cursor y manda un prompt con trabajo real.";
const FOLLOWUP_BODY =
  "Todavia no hay uso de Cursor hoy. Un dia en blanco baja frecuencia; un maraton el viernes no lo recupera.";

function minutesBetween(fromIso: string | null, to: Date): number | null {
  if (!fromIso) {
    return null;
  }
  const from = new Date(fromIso).getTime();
  return Math.floor((to.getTime() - from) / 60_000);
}

function emptyResponse(): HookResponse {
  return { notify: false };
}

function withContext(
  parts: string[],
  notify: { title: string; body: string } | null,
  config: AppConfig
): HookResponse {
  const response: HookResponse = {
    notify: Boolean(notify && config.notify.enabled),
    additional_context: parts.join(" "),
  };

  if (response.notify && notify) {
    response.notify_title = notify.title;
    response.notify_body = notify.body;
  }

  return response;
}

function isWithinWorkHours(config: AppConfig, now: Date, force = false): boolean {
  if (force) {
    return true;
  }
  const hour = now.getHours();
  return hour >= config.workHours.start && hour < config.workHours.end;
}

function shouldSkip(
  config: AppConfig,
  now: Date,
  state: AppState,
  force = false
): boolean {
  if (config.workdaysOnly && !isWeekday(now)) {
    return true;
  }
  if (!isWithinWorkHours(config, now, force)) {
    return true;
  }
  if (state.dismissedForDay) {
    return true;
  }
  return false;
}

function hasPriorMorningNudge(state: AppState): boolean {
  return (
    state.nudgesSent.morning ||
    state.nudgesSent.workspaceOpen ||
    state.nudgesSent.morningFollowup
  );
}

function markActivity(state: AppState, now: Date): void {
  state.lastActivityAt = now.toISOString();
}

function startDayIfNeeded(state: AppState, now: Date): boolean {
  if (state.dayStartedAt) {
    return false;
  }
  state.dayStartedAt = now.toISOString();
  return true;
}

function evaluateMorningCheck(
  state: AppState,
  config: AppConfig,
  isFollowup: boolean
): HookResponse | null {
  if (isFollowup) {
    if (state.nudgesSent.morningFollowup) {
      return null;
    }
    if (state.counters.sessions > 0 || state.counters.edits > 0) {
      return null;
    }

    state.nudgesSent.morningFollowup = true;
    return withContext(
      [
        "Todavia no hay uso de Cursor hoy.",
        "Un dia en blanco baja frecuencia; un maraton el viernes no lo recupera.",
        "Abri el workspace y manda un prompt con trabajo real.",
      ],
      { title: MORNING_TITLE, body: FOLLOWUP_BODY },
      config
    );
  }

  if (state.nudgesSent.morning) {
    return null;
  }

  state.nudgesSent.morning = true;
  return withContext(
    [
      "Hoy es dia habil.",
      "Te miden por dia calificado en Cursor (~1M tokens).",
      "Abri el workspace y manda un prompt con trabajo real, no un hola.",
    ],
    { title: MORNING_TITLE, body: MORNING_BODY },
    config
  );
}

function evaluateWorkspaceOpen(
  state: AppState,
  config: AppConfig
): HookResponse | null {
  if (state.nudgesSent.morning || state.nudgesSent.workspaceOpen) {
    return null;
  }

  state.nudgesSent.workspaceOpen = true;
  return withContext(
    [
      "Abriste Cursor hoy.",
      "Te miden por dia calificado (~1M tokens).",
      "Manda un prompt con trabajo real, no un hola.",
    ],
    { title: MORNING_TITLE, body: MORNING_BODY },
    config
  );
}

function evaluateDayStart(
  state: AppState,
  config: AppConfig
): HookResponse | null {
  if (state.nudgesSent.dayStart) {
    return null;
  }

  state.nudgesSent.dayStart = true;
  const notify =
    hasPriorMorningNudge(state) || !config.notify.aggressive
      ? null
      : {
          title: "Cursor — workflow",
          body: "Arranco el dia: una sesion con trabajo concreto alcanza.",
        };

  return withContext(
    [
      "Workflow hints (solo hoy, sin insistir):",
      "Preferi trabajo concreto en esta sesion.",
      "Si el cambio cruza varios archivos, ofrece un Plan una sola vez.",
      "Si hay diffs utiles al cerrar, ofrece commit.",
      "Si hay un skill o MCP del workspace que encaje, mencionalo una vez.",
      "Para ediciones chicas, Tab alcanza; no infles el alcance.",
    ],
    notify,
    config
  );
}

function evaluateIdle(
  state: AppState,
  config: AppConfig,
  now: Date
): HookResponse | null {
  if (state.nudgesSent.idle || !state.lastActivityAt) {
    return null;
  }

  const idleMinutes = minutesBetween(state.lastActivityAt, now);
  if (idleMinutes === null || idleMinutes < config.idleThresholdMinutes) {
    return null;
  }

  state.nudgesSent.idle = true;
  return withContext(
    [
      `Llevas un rato sin actividad en Cursor hoy (~${idleMinutes} min).`,
      "Si retomas, prioriza una tarea concreta en lugar de iterar sin cerrar.",
    ],
    {
      title: "Cursor — workflow",
      body: "Llevas un rato sin usar Cursor hoy.",
    },
    config
  );
}

function evaluateLowMcp(
  state: AppState,
  config: AppConfig,
  now: Date
): HookResponse | null {
  if (state.nudgesSent.lowMcp || !state.dayStartedAt) {
    return null;
  }

  const minutes = minutesBetween(state.dayStartedAt, now);
  if (minutes === null || minutes < config.lowMcpAfterMinutes) {
    return null;
  }
  if (state.counters.mcpInvocations > 0) {
    return null;
  }

  state.nudgesSent.lowMcp = true;
  return withContext(
    [
      "Hoy todavia no invocaste MCP en Cursor.",
      "Si encaja con la tarea, menciona una sola vez un MCP o skill del workspace.",
    ],
    null,
    config
  );
}

function evaluateCloseLoop(
  state: AppState,
  config: AppConfig,
  conversationId: string
): HookResponse | null {
  const conversation = state.conversations[conversationId];
  if (!conversation || conversation.nudgeSent) {
    return null;
  }
  if (conversation.editedFiles.length === 0) {
    return null;
  }

  conversation.nudgeSent = true;

  const parts = [
    "Hay cambios en archivos. Al terminar, ofrece commit si los diffs son utiles.",
  ];

  if (conversation.editedFiles.length >= 2) {
    parts.push(
      "Como tocaste varios archivos, ofrece un Plan una sola vez si todavia falta cerrar alcance."
    );
  }

  for (const filePath of conversation.editedFiles) {
    const hint = getStackHint(filePath);
    if (hint) {
      parts.push(hint);
      break;
    }
  }

  parts.push("No hace falta inflar el alcance.");

  return withContext(parts, null, config);
}

export function buildDailySummary(state: AppState, now = new Date()): DailySummary {
  return {
    dateKey: state.dateKey,
    dayStartedAt: state.dayStartedAt,
    lastActivityAt: state.lastActivityAt,
    counters: { ...state.counters },
    minutesSinceLastActivity: minutesBetween(state.lastActivityAt, now),
    minutesSinceDayStart: minutesBetween(state.dayStartedAt, now),
  };
}

export function dismissNudge(
  type: NudgeType | "all",
  now = new Date()
): AppState {
  const state = loadState(now);

  if (type === "all") {
    state.dismissedForDay = true;
  } else if (type in state.nudgesSent) {
    (state.nudgesSent as unknown as Record<string, boolean>)[type] = true;
  }

  saveState(state);
  return state;
}

export function recordEvent(input: RecordEventInput): HookResponse {
  const now = input.now ?? new Date();
  const config = loadConfig();
  const state = loadState(now);

  if (state.dateKey !== formatDateKey(now)) {
    Object.assign(state, loadState(now));
  }

  if (shouldSkip(config, now, state, input.force)) {
    return emptyResponse();
  }

  let response: HookResponse | null = null;

  switch (input.event) {
    case "morning_check": {
      response = evaluateMorningCheck(state, config, Boolean(input.isFollowup));
      break;
    }

    case "workspace_open": {
      response = evaluateWorkspaceOpen(state, config);
      break;
    }

    case "session_start": {
      if (input.isBackgroundAgent) {
        return emptyResponse();
      }

      state.counters.sessions += 1;
      const isFirstDaySession = startDayIfNeeded(state, now);

      if (isFirstDaySession) {
        response = evaluateDayStart(state, config);
      } else {
        response = evaluateIdle(state, config, now);
        if (!response) {
          response = evaluateLowMcp(state, config, now);
        }
      }

      markActivity(state, now);
      break;
    }

    case "file_edit": {
      if (!input.conversationId || !input.path) {
        return emptyResponse();
      }

      const conversation = ensureConversation(state, input.conversationId);
      if (!conversation.editedFiles.includes(input.path)) {
        conversation.editedFiles.push(input.path);
        state.counters.edits += 1;
      }
      markActivity(state, now);
      break;
    }

    case "tab_edit": {
      state.counters.tabEdits += 1;
      markActivity(state, now);
      break;
    }

    case "mcp_use": {
      state.counters.mcpInvocations += 1;
      markActivity(state, now);
      break;
    }

    case "tool_use": {
      if (input.conversationId && input.path) {
        const conversation = ensureConversation(state, input.conversationId);
        if (!conversation.editedFiles.includes(input.path)) {
          conversation.editedFiles.push(input.path);
          state.counters.edits += 1;
        }
      }

      if (input.tool === "Task") {
        state.counters.planTasks += 1;
      }

      if (input.mcpServer) {
        state.counters.mcpInvocations += 1;
      }

      markActivity(state, now);

      if (input.conversationId) {
        response = evaluateCloseLoop(state, config, input.conversationId);
      }
      break;
    }
  }

  saveState(state);
  return response ?? emptyResponse();
}

export function getContext(now = new Date()): HookResponse {
  const config = loadConfig();
  const state = loadState(now);

  if (shouldSkip(config, now, state)) {
    return emptyResponse();
  }

  const summary = buildDailySummary(state, now);
  const parts = [
    `Resumen de hoy (${summary.dateKey}):`,
    `sesiones=${summary.counters.sessions},`,
    `edits=${summary.counters.edits},`,
    `mcp=${summary.counters.mcpInvocations},`,
    `plans=${summary.counters.planTasks}.`,
  ];

  if (summary.minutesSinceLastActivity !== null) {
    parts.push(`Ultima actividad hace ${summary.minutesSinceLastActivity} min.`);
  }

  return {
    notify: false,
    additional_context: parts.join(" "),
  };
}
