// src/commands/showSession.ts

import * as vscode from "vscode";
import { SessionStore } from "../../state/sessionStore";

export async function showSession(store: SessionStore) {
  await store.load();
  const state = store.getStateSnapshot();
  const json = JSON.stringify(state, null, 2);

  const doc = await vscode.workspace.openTextDocument({
    content: json,
    language: "json",
  });

  await vscode.window.showTextDocument(doc, { preview: false });
}
