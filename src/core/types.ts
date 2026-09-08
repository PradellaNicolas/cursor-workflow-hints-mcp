export type HintEventType =
  | "session_start"
  | "file_edit"
  | "tool_use"
  | "tab_edit"
  | "mcp_use"
  | "morning_check"
  | "workspace_open";

export type NudgeType =
  | "dayStart"
  | "idle"
  | "lowMcp"
  | "closeLoop"
  | "morning"
  | "morningFollowup"
  | "workspaceOpen";

export interface DayCounters {
  sessions: number;
  edits: number;
  mcpInvocations: number;
  planTasks: number;
  tabEdits: number;
}

export interface ConversationState {
  editedFiles: string[];
  nudgeSent: boolean;
}

export interface NudgesSentToday {
  dayStart: boolean;
  idle: boolean;
  lowMcp: boolean;
  morning: boolean;
  morningFollowup: boolean;
  workspaceOpen: boolean;
}

export interface AppState {
  dateKey: string;
  dayStartedAt: string | null;
  lastActivityAt: string | null;
  counters: DayCounters;
  nudgesSent: NudgesSentToday;
  conversations: Record<string, ConversationState>;
  dismissedForDay: boolean;
}

export interface WorkHoursConfig {
  start: number;
  end: number;
}

export interface NotifyConfig {
  enabled: boolean;
  aggressive: boolean;
}

export interface AppConfig {
  idleThresholdMinutes: number;
  lowMcpAfterMinutes: number;
  followupHour: number;
  followupMinute: number;
  workHours: WorkHoursConfig;
  notify: NotifyConfig;
  workdaysOnly: boolean;
}

export interface RecordEventInput {
  event: HintEventType;
  conversationId?: string;
  path?: string;
  tool?: string;
  mcpServer?: string;
  composerMode?: string;
  isBackgroundAgent?: boolean;
  isFollowup?: boolean;
  force?: boolean;
  now?: Date;
}

export interface HookResponse {
  additional_context?: string;
  notify: boolean;
  notify_title?: string;
  notify_body?: string;
}

export interface DailySummary {
  dateKey: string;
  dayStartedAt: string | null;
  lastActivityAt: string | null;
  counters: DayCounters;
  minutesSinceLastActivity: number | null;
  minutesSinceDayStart: number | null;
}
