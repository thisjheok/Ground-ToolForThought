// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { SessionStore } from "./state/sessionStore";
import { startSession } from "./commands/startSession";
import { showSession } from "./commands/showSession";
import { clearSession } from "./commands/clearSession";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  const store = new SessionStore(context);
  
  // (선택) 시작 시 로드해두기
  store.load().catch(() => {});

  context.subscriptions.push(
    vscode.commands.registerCommand("ground.startSession", async () => {
      await startSession(store);
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
}

// This method is called when your extension is deactivated
export function deactivate() {}
