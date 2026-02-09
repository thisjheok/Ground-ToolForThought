import * as vscode from "vscode";
import { SessionStore } from "../../state/sessionStore";

export async function archiveSession(store: SessionStore) {
  const active = store.getActiveSession();
  if (!active) {
    vscode.window.showWarningMessage("No active session.");
    return;
  }

  const answer = await vscode.window.showWarningMessage(
    `Archive session "${active.title}"?`,
    { modal: true },
    "Archive"
  );
  if (answer !== "Archive") return;

  await store.archiveSession(active.id);
}
