import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import defaultConfig from "../../config/default.config.json" with { type: "json" };
import type { AppConfig, AppState, ConversationState } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function getDataDir(): string {
  const override =
    process.env.WORKFLOW_HINTS_DATA_DIR?.trim() ||
    process.env.PIPOL_HINTS_DATA_DIR?.trim();
  if (override) {
    return path.resolve(override);
  }
  migrateLegacyDataDirIfNeeded();
  return path.join(os.homedir(), ".cursor", "workflow-hints");
}

function migrateLegacyDataDirIfNeeded(): void {
  const newDir = path.join(os.homedir(), ".cursor", "workflow-hints");
  const legacyDir = path.join(os.homedir(), ".cursor", "pipol-hints");
  if (fs.existsSync(newDir) || !fs.existsSync(legacyDir)) {
    return;
  }
  try {
    fs.cpSync(legacyDir, newDir, { recursive: true });
  } catch {
    // ignore migration errors
  }
}

export function getStatePath(): string {
  return path.join(getDataDir(), "state.json");
}

export function getConfigPath(): string {
  return path.join(getDataDir(), "config.json");
}

export function getLegacyStatePath(): string {
  return path.join(os.homedir(), ".cursor", "workflow-hints-state.json");
}

function emptyCounters() {
  return {
    sessions: 0,
    edits: 0,
    mcpInvocations: 0,
    planTasks: 0,
    tabEdits: 0,
  };
}

export function createEmptyState(dateKey: string): AppState {
  return {
    dateKey,
    dayStartedAt: null,
    lastActivityAt: null,
    counters: emptyCounters(),
    nudgesSent: {
      dayStart: false,
      idle: false,
      lowMcp: false,
      morning: false,
      morningFollowup: false,
      workspaceOpen: false,
    },
    conversations: {},
    dismissedForDay: false,
  };
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export function loadConfig(): AppConfig {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) {
    return { ...defaultConfig } as AppConfig;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(configPath, "utf8")) as Partial<AppConfig>;
    return {
      ...defaultConfig,
      ...raw,
      notify: { ...defaultConfig.notify, ...raw.notify },
    } as AppConfig;
  } catch {
    return { ...defaultConfig } as AppConfig;
  }
}

export function saveConfig(config: AppConfig): void {
  const dir = getDataDir();
  ensureDir(dir);
  fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2), "utf8");
}

export function loadState(now = new Date()): AppState {
  migrateLegacyStateIfNeeded();
  const statePath = getStatePath();
  const dateKey = formatDateKey(now);

  if (!fs.existsSync(statePath)) {
    return createEmptyState(dateKey);
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, "utf8")) as AppState;
    if (parsed.dateKey !== dateKey) {
      return createEmptyState(dateKey);
    }
    return normalizeState(parsed);
  } catch {
    return createEmptyState(dateKey);
  }
}

export function saveState(state: AppState): void {
  const dir = getDataDir();
  ensureDir(dir);
  fs.writeFileSync(getStatePath(), JSON.stringify(state, null, 2), "utf8");
}

function normalizeState(state: AppState): AppState {
  return {
    dateKey: state.dateKey,
    dayStartedAt: state.dayStartedAt ?? null,
    lastActivityAt: state.lastActivityAt ?? null,
    counters: { ...emptyCounters(), ...state.counters },
    nudgesSent: {
      dayStart: Boolean(state.nudgesSent?.dayStart),
      idle: Boolean(state.nudgesSent?.idle),
      lowMcp: Boolean(state.nudgesSent?.lowMcp),
      morning: Boolean(state.nudgesSent?.morning),
      morningFollowup: Boolean(state.nudgesSent?.morningFollowup),
      workspaceOpen: Boolean(state.nudgesSent?.workspaceOpen),
    },
    conversations: state.conversations ?? {},
    dismissedForDay: Boolean(state.dismissedForDay),
  };
}

export function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function isWeekday(date: Date): boolean {
  const day = date.getDay();
  return day >= 1 && day <= 5;
}

export function ensureConversation(
  state: AppState,
  conversationId: string
): ConversationState {
  if (!state.conversations[conversationId]) {
    state.conversations[conversationId] = {
      editedFiles: [],
      nudgeSent: false,
    };
  }
  return state.conversations[conversationId];
}

export function migrateLegacyStateIfNeeded(): void {
  const legacyPath = getLegacyStatePath();
  const statePath = getStatePath();
  if (!fs.existsSync(legacyPath) || fs.existsSync(statePath)) {
    return;
  }

  try {
    const legacy = JSON.parse(fs.readFileSync(legacyPath, "utf8")) as {
      lastSessionDate?: string;
      conversations?: Record<string, { editedFiles?: string[]; nudgeSent?: boolean }>;
    };

    const now = new Date();
    const dateKey = formatDateKey(now);
    const state = createEmptyState(dateKey);

    if (legacy.lastSessionDate === dateKey) {
      state.dayStartedAt = now.toISOString();
      state.lastActivityAt = now.toISOString();
      state.counters.sessions = 1;
      state.nudgesSent.dayStart = true;
    }

    if (legacy.conversations) {
      for (const [id, conv] of Object.entries(legacy.conversations)) {
        state.conversations[id] = {
          editedFiles: conv.editedFiles ?? [],
          nudgeSent: Boolean(conv.nudgeSent),
        };
        state.counters.edits += conv.editedFiles?.length ?? 0;
      }
    }

    saveState(state);
    fs.renameSync(legacyPath, `${legacyPath}.migrated`);
  } catch {
    // ignore migration errors
  }
}

export function getStackHint(filePath: string): string | null {
  const hintsPath = path.join(getDataDir(), "stack-hints.json");
  if (!fs.existsSync(hintsPath)) {
    return null;
  }

  try {
    const rules = JSON.parse(fs.readFileSync(hintsPath, "utf8")) as Array<{
      pattern: string;
      hint: string;
    }>;
    const normalized = filePath.replace(/\\/g, "/").toLowerCase();
    for (const rule of rules) {
      if (!rule.pattern || !rule.hint) {
        continue;
      }
      if (new RegExp(rule.pattern, "i").test(normalized)) {
        return rule.hint;
      }
    }
  } catch {
    return null;
  }

  return null;
}
