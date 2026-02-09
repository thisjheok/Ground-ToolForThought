import * as vscode from "vscode";
import { SessionStore } from "../../state/sessionStore";

export async function renameSession(store: SessionStore) {
  const active = store.getActiveSession();
  if (!active) {
    vscode.window.showWarningMessage("No active session.");
    return;
  }

  const nextTitle = await vscode.window.showInputBox({
    title: "Rename active session",
    value: active.title,
    prompt: "Session title",
    ignoreFocusOut: true,
  });
  if (typeof nextTitle !== "string") return;

  const trimmed = nextTitle.trim();
  if (!trimmed) return;
  await store.renameSession(active.id, trimmed);
}
