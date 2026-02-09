import * as vscode from "vscode";
import { SessionStore } from "../../state/sessionStore";
import { makeEvidence } from "../../state/evidence";

export async function ingestTestLog(store: SessionStore) {
  const text = await vscode.window.showInputBox({
    title: "Paste test/build log",
    prompt: "Paste the failing log (stacktrace, error message, etc).",
    ignoreFocusOut: true,
  });

  if (!text || !text.trim()) return;

  const snippet = text.trim().slice(0, 6000);

  const ev = makeEvidence({
    type: "testLog",
    title: "Test/Build log (pasted)",
    ref: `testlog:paste:${new Date().toISOString()}`,
    snippet,
    whyIncluded: "Repro/failure evidence that can guide debugging and verification.",
    source: "user",
  });

  await store.addEvidence(ev);
  vscode.window.showInformationMessage("Added test log evidence.");
}
