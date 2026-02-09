// src/commands/showSession.ts

import * as vscode from "vscode";
import { SessionStore } from "../../state/sessionStore";

export async function showSession(store: SessionStore) {
  const session = store.get() ?? (await store.load());

  if (!session) {
    vscode.window.showWarningMessage("No active session. Run 'Start Session' first.");
    return;
  }

  const json = JSON.stringify(session, null, 2);

  const doc = await vscode.workspace.openTextDocument({
    content: json,
    language: "json",
  });

  await vscode.window.showTextDocument(doc, { preview: false });
}
