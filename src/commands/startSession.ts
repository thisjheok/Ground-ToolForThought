import * as vscode from "vscode";
import { SessionStore } from "../state/sessionStore";
import { Mode } from "../state/types";

export async function startSession(store: SessionStore) {
  const modePick = await vscode.window.showQuickPick<
    { label: string; description: string; mode: Mode }
  >(
    [
      { label: "Learning", description: "More friction / more responses required", mode: "learning" },
      { label: "Standard", description: "Default", mode: "standard" },
      { label: "Fast", description: "Minimum friction", mode: "fast" },
    ],
    {
      placeHolder: "Select session mode",
      ignoreFocusOut: true,
    }
  );

  const mode: Mode = modePick?.mode ?? "standard";

  const session = await store.create(mode);

  vscode.window.showInformationMessage(
    `Tool for Thought session started (${session.mode}).`
  );
}
