import { spawn } from "node:child_process";
import type { HookResponse } from "../core/types.js";

export async function sendNotificationIfNeeded(
  response: HookResponse
): Promise<void> {
  if (!response.notify || !response.notify_body) {
    return;
  }

  const title = response.notify_title ?? "Cursor — workflow";
  const body = response.notify_body;

  try {
    const notifier = await import("node-notifier");
    notifier.notify({ title, message: body, wait: false });
    return;
  } catch {
    // fallback below
  }

  const script = [
    "[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null",
    "[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null",
    `$xml = New-Object Windows.Data.Xml.Dom.XmlDocument`,
    `$xml.LoadXml('<toast><visual><binding template=\"ToastText02\"><text id=\"1\">${title.replace(/'/g, "''")}</text><text id=\"2\">${body.replace(/'/g, "''")}</text></binding></visual></toast>')`,
    "$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)",
    "[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Cursor').Show($toast)",
  ].join("; ");

  await new Promise<void>((resolve) => {
    const child = spawn(
      "powershell",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
      { stdio: "ignore", windowsHide: true }
    );
    child.on("exit", () => resolve());
    child.on("error", () => resolve());
  });
}
