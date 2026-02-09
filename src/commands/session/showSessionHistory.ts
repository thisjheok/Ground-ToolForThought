import * as vscode from "vscode";

export async function showSessionHistory() {
  await vscode.commands.executeCommand("workbench.view.extension.tftContainer");
  await vscode.commands.executeCommand("tft.sessionHistoryView.focus");
}
