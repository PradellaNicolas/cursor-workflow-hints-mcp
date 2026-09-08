#!/usr/bin/env node
import { recordEvent, getContext, dismissNudge, buildDailySummary } from "./core/events.js";
import { loadConfig, saveConfig, loadState } from "./core/state.js";
import { sendNotificationIfNeeded } from "./notify/windows.js";
import type { HintEventType, NudgeType } from "./core/types.js";

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const result: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      if (!result._command) {
        result._command = arg;
      }
      continue;
    }
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      result[key] = true;
      continue;
    }
    result[key] = next;
    i += 1;
  }
  return result;
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const command = String(args._command ?? "record");

  if (command === "record") {
    const event = String(args.event ?? "") as HintEventType;
    const response = recordEvent({
      event,
      conversationId: args["conversation-id"] as string | undefined,
      path: args.path as string | undefined,
      tool: args.tool as string | undefined,
      mcpServer: args["mcp-server"] as string | undefined,
      composerMode: args["composer-mode"] as string | undefined,
      isBackgroundAgent: args["background-agent"] === true || args["background-agent"] === "true",
      isFollowup: args["is-followup"] === true || args["is-followup"] === "true",
      force: args.force === true || args.force === "true",
    });

    await sendNotificationIfNeeded(response);
    printJson(response);
    return;
  }

  if (command === "morning-check") {
    const response = recordEvent({
      event: "morning_check",
      isFollowup: args.followup === true || args.followup === "true",
      force: args.force === true || args.force === "true",
    });
    await sendNotificationIfNeeded(response);
    printJson(response);
    return;
  }

  if (command === "context") {
    printJson(getContext());
    return;
  }

  if (command === "summary") {
    printJson(buildDailySummary(loadState()));
    return;
  }

  if (command === "dismiss") {
    const type = (args.type as NudgeType | "all") ?? "all";
    dismissNudge(type);
    printJson({ ok: true });
    return;
  }

  if (command === "set-preferences") {
    const config = loadConfig();
    if (typeof args["idle-threshold-minutes"] === "string") {
      config.idleThresholdMinutes = Number(args["idle-threshold-minutes"]);
    }
    if (typeof args["low-mcp-after-minutes"] === "string") {
      config.lowMcpAfterMinutes = Number(args["low-mcp-after-minutes"]);
    }
    if (args["notify-enabled"] === "true") {
      config.notify.enabled = true;
    }
    if (args["notify-enabled"] === "false") {
      config.notify.enabled = false;
    }
    saveConfig(config);
    printJson({ ok: true, config });
    return;
  }

  printJson({ error: `Unknown command: ${command}` });
  process.exitCode = 1;
}

main().catch((error) => {
  printJson({
    notify: false,
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
