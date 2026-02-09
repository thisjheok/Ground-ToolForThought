import * as vscode from "vscode";
import { SessionStore } from "../../state/sessionStore";
import { makeEvidence } from "../../state/evidence";

export async function addEvidenceFromActiveFile(store: SessionStore) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage("No active editor.");
    return;
  }

  const path = editor.document.uri.fsPath;

  const ev = makeEvidence({
    type: "file",
    title: "Active file",
    ref: path,
    whyIncluded: "File currently being edited; likely relevant context.",
    source: "user",
  });

  await store.addEvidence(ev);
  vscode.window.showInformationMessage("Added active file as evidence.");
}
