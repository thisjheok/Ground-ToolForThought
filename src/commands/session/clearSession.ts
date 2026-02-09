// src/commands/clearSession.ts

import * as vscode from "vscode";
import { SessionStore } from "../../state/sessionStore";

export async function clearSession(store: SessionStore) {
  const answer = await vscode.window.showWarningMessage(
    "Clear all Tool for Thought sessions in this workspace?",
    { modal: true },
    "Clear"
  );

  if (answer !== "Clear") return;

  await store.clear();
  vscode.window.showInformationMessage("Session cleared.");
}
