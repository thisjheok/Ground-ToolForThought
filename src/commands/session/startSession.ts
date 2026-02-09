import * as vscode from "vscode";
import { SessionStore } from "../../state/sessionStore";
import { Mode } from "../../state/types";

const MODE_ITEMS: Array<{ label: string; description: string; mode: Mode }> = [
  { label: "Bugfix", description: "Investigate and resolve a defect", mode: "bugfix" },
  { label: "Feature", description: "Implement a new capability", mode: "feature" },
  { label: "Refactor", description: "Improve structure and maintainability", mode: "refactor" },
  { label: "Standard", description: "General purpose session", mode: "standard" },
];

export async function runCreateSessionFlow(store: SessionStore) {
  const modePick = await vscode.window.showQuickPick<
    { label: string; description: string; mode: Mode }
  >(
    MODE_ITEMS,
    {
      placeHolder: "Select session mode",
      ignoreFocusOut: true,
    }
  );
  if (!modePick) return;

  const title = await vscode.window.showInputBox({
    title: "Session title (optional)",
    prompt: "Leave empty to auto-generate from mode and active file.",
    ignoreFocusOut: true,
  });

  const sessionId = await store.createSession(modePick.mode, title);
  await store.setActiveSession(sessionId);

  const session = store.getActiveSession();
  if (!session) return;

  vscode.window.showInformationMessage(
    `Tool for Thought session started: ${session.title}`
  );
}

export async function startSession(store: SessionStore) {
  await runCreateSessionFlow(store);
}
