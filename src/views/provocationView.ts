// src/views/provocationView.ts

import * as vscode from "vscode";
import { SessionStore } from "../state/sessionStore";

export class ProvocationViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "tft.provocationView";
  private view?: vscode.WebviewView;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly store: SessionStore
  ) {}

  resolveWebviewView(view: vscode.WebviewView) {
    this.view = view;

    view.webview.options = { enableScripts: true };
    view.webview.html = this.renderHtml();

    this.context.subscriptions.push(
      this.store.onDidChangeSession(() => this.push())
    );

    this.push();
  }

  private push() {
    if (!this.view) return;
    const session = this.store.get();
    this.view.webview.postMessage({ type: "session", payload: session });
  }

  private renderHtml(): string {
    const nonce = getNonce();
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 12px; }
    .muted { opacity: 0.75; font-size: 12px; }
    pre { white-space: pre-wrap; word-break: break-word; background: rgba(0,0,0,0.04); padding: 8px; border-radius: 8px; }
  </style>
</head>
<body>
  <div><strong>Provocations</strong></div>
  <div class="muted">Day 1: view only. Day 3+: generate + accept/reject/hold.</div>
  <pre id="box" class="muted">No session.</pre>

  <script nonce="${nonce}">
    const box = document.getElementById('box');
    window.addEventListener('message', (e) => {
      const msg = e.data;
      if (msg.type !== 'session') return;
      const s = msg.payload;
      if (!s) { box.textContent = 'No session.'; return; }
      const cards = (s.provocations || []).length;
      const responded = (s.gate && s.gate.provocationRespondedCount) || 0;
      box.textContent = 'Cards: ' + cards + '\\nResponded: ' + responded;
    });
  </script>
</body>
</html>`;
  }
}

function getNonce() {
  let text = "";
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) text += possible.charAt(Math.floor(Math.random() * possible.length));
  return text;
}
