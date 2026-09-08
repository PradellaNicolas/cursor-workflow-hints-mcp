import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { recordEvent } from "../core/events.js";
import { getDataDir, loadState } from "../core/state.js";

const originalDataDir = process.env.WORKFLOW_HINTS_DATA_DIR;
let tempDir = "";

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-hints-test-"));
  process.env.WORKFLOW_HINTS_DATA_DIR = tempDir;
});

afterEach(() => {
  if (originalDataDir === undefined) {
    delete process.env.WORKFLOW_HINTS_DATA_DIR;
  } else {
    process.env.WORKFLOW_HINTS_DATA_DIR = originalDataDir;
  }
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("recordEvent rules", () => {
  it("returns dayStart context on first session of weekday", () => {
    const monday = new Date("2026-09-01T09:00:00");
    const response = recordEvent({
      event: "session_start",
      conversationId: "conv-1",
      now: monday,
    });

    assert.ok(response.additional_context?.includes("Workflow hints"));
    assert.equal(response.notify, true);

    const second = recordEvent({
      event: "session_start",
      conversationId: "conv-2",
      now: new Date("2026-09-01T09:30:00"),
    });

    assert.equal(second.additional_context, undefined);
    assert.equal(second.notify, false);
  });

  it("returns closeLoop nudge once per conversation after edits", () => {
    const now = new Date("2026-09-01T10:00:00");
    recordEvent({ event: "session_start", conversationId: "conv-1", now });

    recordEvent({
      event: "file_edit",
      conversationId: "conv-1",
      path: "c:/projects/my-app/src/api/foo.ts",
      now,
    });

    const nudge = recordEvent({
      event: "tool_use",
      conversationId: "conv-1",
      tool: "Write",
      now,
    });

    assert.ok(nudge.additional_context?.includes("commit"));

    const again = recordEvent({
      event: "tool_use",
      conversationId: "conv-1",
      tool: "Write",
      now,
    });

    assert.equal(again.additional_context, undefined);
  });

  it("tracks mcp invocations", () => {
    const now = new Date("2026-09-01T11:00:00");
    recordEvent({ event: "mcp_use", now });
    const state = loadState(now);
    assert.equal(state.counters.mcpInvocations, 1);
  });

  it("morning_check notifies once per day", () => {
    const now = new Date("2026-09-01T08:30:00");
    const first = recordEvent({ event: "morning_check", now, force: true });
    assert.equal(first.notify, true);
    assert.ok(first.notify_title?.includes("hoy te miden"));

    const second = recordEvent({ event: "morning_check", now, force: true });
    assert.equal(second.notify, false);
  });

  it("morning followup only when no sessions or edits", () => {
    const now = new Date("2026-09-01T10:30:00");
    recordEvent({ event: "morning_check", now, force: true });

    const follow = recordEvent({
      event: "morning_check",
      isFollowup: true,
      now,
      force: true,
    });
    assert.equal(follow.notify, true);

    recordEvent({
      event: "session_start",
      conversationId: "conv-1",
      now,
      force: true,
    });

    const state = loadState(now);
    state.nudgesSent.morningFollowup = false;
    fs.writeFileSync(
      path.join(getDataDir(), "state.json"),
      JSON.stringify(state, null, 2)
    );

    const again = recordEvent({
      event: "morning_check",
      isFollowup: true,
      now,
      force: true,
    });
    assert.equal(again.notify, false);
  });

  it("workspace_open silent if morning already sent", () => {
    const now = new Date("2026-09-01T09:00:00");
    recordEvent({ event: "morning_check", now, force: true });

    const ws = recordEvent({ event: "workspace_open", now, force: true });
    assert.equal(ws.notify, false);
  });

  it("skips outside work hours without force", () => {
    const early = new Date("2026-09-01T07:00:00");
    const response = recordEvent({ event: "morning_check", now: early });
    assert.equal(response.notify, false);
  });
});
