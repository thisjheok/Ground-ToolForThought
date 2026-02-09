import * as vscode from "vscode";
import { SessionStore } from "../../state/sessionStore";
import { formatRefFromRange, makeEvidence } from "../../state/evidence";

export async function addEvidenceFromSelection(store: SessionStore) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage("No active editor.");
    return;
  }

  const sel = editor.selection;
  if (sel.isEmpty) {
    vscode.window.showWarningMessage("Selection is empty. Highlight some code first.");
    return;
  }

  const text = editor.document.getText(sel);
  const ref = formatRefFromRange(editor.document.uri, sel);

  const ev = makeEvidence({
    type: "selection",
    title: "Selected code snippet",
    ref,
    snippet: text.slice(0, 4000), // 안전상 길이 제한
    whyIncluded: "User-selected suspicious or relevant code region.",
    source: "user",
  });

  await store.addEvidence(ev);
  vscode.window.showInformationMessage("Added evidence from selection.");
}
