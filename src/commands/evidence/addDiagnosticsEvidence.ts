import * as vscode from "vscode";
import { SessionStore } from "../../state/sessionStore";
import { makeEvidence } from "../../state/evidence";

function sevToString(sev: vscode.DiagnosticSeverity): string {
  switch (sev) {
    case vscode.DiagnosticSeverity.Error: return "Error";
    case vscode.DiagnosticSeverity.Warning: return "Warning";
    case vscode.DiagnosticSeverity.Information: return "Info";
    case vscode.DiagnosticSeverity.Hint: return "Hint";
    default: return "Unknown";
  }
}

export async function addDiagnosticsEvidence(store: SessionStore) {
  const all = vscode.languages.getDiagnostics();

  const flat = all.flatMap(([uri, diags]) => {
    return diags.map(d => ({ uri, d }));
  });

  if (flat.length === 0) {
    vscode.window.showInformationMessage("No diagnostics found.");
    return;
  }

  // Error 우선, 그 다음 Warning...
  flat.sort((a, b) => (a.d.severity ?? 99) - (b.d.severity ?? 99));

  const topN = 10;
  const picked = flat.slice(0, topN);

  const items = picked.map(({ uri, d }) => {
    const line = d.range.start.line + 1;
    const ch = d.range.start.character + 1;
    const sev = sevToString(d.severity);
    return makeEvidence({
      type: "diagnostic",
      title: `${sev}: ${d.message}`,
      ref: `${uri.fsPath}:${line}:${ch}`,
      snippet: d.source ? `source: ${d.source}` : undefined,
      whyIncluded: "Language server/compiler diagnostic indicates a concrete issue.",
      source: "auto",
    });
  });

  await store.addEvidence(items);
  vscode.window.showInformationMessage(`Added ${items.length} diagnostic evidences.`);
}
