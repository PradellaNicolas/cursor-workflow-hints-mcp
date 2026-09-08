#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  recordEvent,
  getContext,
  dismissNudge,
  buildDailySummary,
} from "./core/events.js";
import { loadConfig, saveConfig, loadState } from "./core/state.js";
import { sendNotificationIfNeeded } from "./notify/windows.js";

const server = new McpServer({
  name: "cursor-workflow-hints",
  version: "0.1.0",
});

server.registerTool(
  "hints_record_event",
  {
    description: "Record a Cursor workflow activity event and return optional nudge context.",
    inputSchema: {
      event: z.enum([
        "session_start",
        "file_edit",
        "tool_use",
        "tab_edit",
        "mcp_use",
      ]),
      conversation_id: z.string().optional(),
      path: z.string().optional(),
      tool: z.string().optional(),
      mcp_server: z.string().optional(),
      composer_mode: z.string().optional(),
      is_background_agent: z.boolean().optional(),
    },
  },
  async (args) => {
    const response = recordEvent({
      event: args.event,
      conversationId: args.conversation_id,
      path: args.path,
      tool: args.tool,
      mcpServer: args.mcp_server,
      composerMode: args.composer_mode,
      isBackgroundAgent: args.is_background_agent,
    });

    await sendNotificationIfNeeded(response);

    return {
      content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
    };
  }
);

server.registerTool(
  "hints_get_context",
  {
    description: "Get today's workflow summary as agent context.",
    inputSchema: {},
  },
  async () => {
    const response = getContext();
    return {
      content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
    };
  }
);

server.registerTool(
  "hints_get_daily_summary",
  {
    description: "Get structured counters and timing for today.",
    inputSchema: {},
  },
  async () => {
    const summary = buildDailySummary(loadState());
    return {
      content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
    };
  }
);

server.registerTool(
  "hints_set_preferences",
  {
    description: "Update local hint thresholds and notification settings.",
    inputSchema: {
      idle_threshold_minutes: z.number().optional(),
      low_mcp_after_minutes: z.number().optional(),
      notify_enabled: z.boolean().optional(),
      workdays_only: z.boolean().optional(),
    },
  },
  async (args) => {
    const config = loadConfig();
    if (args.idle_threshold_minutes !== undefined) {
      config.idleThresholdMinutes = args.idle_threshold_minutes;
    }
    if (args.low_mcp_after_minutes !== undefined) {
      config.lowMcpAfterMinutes = args.low_mcp_after_minutes;
    }
    if (args.notify_enabled !== undefined) {
      config.notify.enabled = args.notify_enabled;
    }
    if (args.workdays_only !== undefined) {
      config.workdaysOnly = args.workdays_only;
    }
    saveConfig(config);
    return {
      content: [{ type: "text", text: JSON.stringify(config, null, 2) }],
    };
  }
);

server.registerTool(
  "hints_dismiss_nudge",
  {
    description: "Dismiss nudges for today or mark a specific nudge type as sent.",
    inputSchema: {
      type: z.enum(["dayStart", "idle", "lowMcp", "closeLoop", "all"]).default("all"),
    },
  },
  async (args) => {
    const state = dismissNudge(args.type);
    return {
      content: [{ type: "text", text: JSON.stringify(state, null, 2) }],
    };
  }
);

server.registerResource(
  "hints-today",
  "hints://today",
  {
    description: "Today's workflow counters and timing",
    mimeType: "application/json",
  },
  async () => {
    const summary = buildDailySummary(loadState());
    return {
      contents: [
        {
          uri: "hints://today",
          mimeType: "application/json",
          text: JSON.stringify(summary, null, 2),
        },
      ],
    };
  }
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
