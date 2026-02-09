import * as vscode from "vscode";
import { SessionStore } from "./state/sessionStore";
import { startSession } from "./commands/session/startSession";
import { showSession } from "./commands/session/showSession";
import { clearSession } from "./commands/session/clearSession";
import { newSession } from "./commands/session/newSession";
import { switchSession } from "./commands/session/switchSession";
import { renameSession } from "./commands/session/renameSession";
import { archiveSession } from "./commands/session/archiveSession";
import { showSessionHistory } from "./commands/session/showSessionHistory";
import { addEvidenceFromSelection } from "./commands/evidence/addEvidenceFromSelection";
import { addEvidenceFromActiveFile } from "./commands/evidence/addEvidenceFromActiveFile";
import { addDiagnosticsEvidence } from "./commands/evidence/addDiagnosticsEvidence";
import { ingestTestLog } from "./commands/evidence/ingestTestLog";
import { generateProvocationsMock } from "./commands/provocation/generateProvocationsMock";
import { OutlineViewProvider } from "./views/outlineView";
import { EvidenceViewProvider } from "./views/evidenceView";
import { ProvocationViewProvider } from "./views/provocationView";
import { SessionHistoryViewProvider } from "./views/sessionHistoryView";

export function activate(context: vscode.ExtensionContext) {
  const store = new SessionStore(context);
  store.load().catch(() => {});

  context.subscriptions.push(
    vscode.commands.registerCommand("ground.startSession", async () => {
      await startSession(store);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("ground.session.new", async () => {
      await newSession(store);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("ground.session.switch", async () => {
      await switchSession(store);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("ground.session.rename", async () => {
      await renameSession(store);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("ground.session.archive", async () => {
      await archiveSession(store);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("ground.session.showHistory", async () => {
      await showSessionHistory();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("ground.showSession", async () => {
      await showSession(store);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("ground.clearSession", async () => {
      await clearSession(store);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("ground.addEvidenceFromSelection", async () => {
      await addEvidenceFromSelection(store);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("ground.addEvidenceFromActiveFile", async () => {
      await addEvidenceFromActiveFile(store);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("ground.addDiagnosticsEvidence", async () => {
      await addDiagnosticsEvidence(store);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("ground.ingestTestLog", async () => {
      await ingestTestLog(store);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("ground.generateProvocationsMock", async () => {
      await generateProvocationsMock(store);
    })
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      OutlineViewProvider.viewType,
      new OutlineViewProvider(context, store),
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      EvidenceViewProvider.viewType,
      new EvidenceViewProvider(context, store),
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      ProvocationViewProvider.viewType,
      new ProvocationViewProvider(context, store),
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      SessionHistoryViewProvider.viewType,
      new SessionHistoryViewProvider(context, store),
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );
}

export function deactivate() {}
