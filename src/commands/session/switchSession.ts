import * as vscode from "vscode";
import { SessionStore } from "../../state/sessionStore";

export async function switchSession(store: SessionStore) {
  const sessions = store.listSessions();
  if (sessions.length === 0) {
    vscode.window.showInformationMessage("No sessions found. Create one first.");
    return;
  }

  const activeId = store.getActiveSession()?.id ?? null;
  const picked = await vscode.window.showQuickPick(
    sessions.map((session) => ({
      label: session.title,
      description: `${session.mode} • ${new Date(session.updatedAt).toLocaleString()}`,
      detail: [
        `Evidence ${session.evidenceCount}`,
        `Provocation ${session.provocationResponded}/${session.provocationTotal}`,
        session.outlineReady ? "Outline ready" : "Outline incomplete",
      ].join(" • "),
      sessionId: session.id,
      picked: session.id === activeId,
    })),
    {
      title: "Switch Session",
      placeHolder: "Select a session",
      ignoreFocusOut: true,
    }
  );

  if (!picked) return;
  await store.setActiveSession(picked.sessionId);
}
