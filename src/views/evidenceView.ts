// src/views/evidenceView.ts

import * as vscode from "vscode";
import { SessionStore } from "../state/sessionStore";
import { EvidenceItem } from "../state/types";

type IncomingMessage =
  | { type: "ready" }
  | { type: "removeEvidence"; id: string }
  | { type: "editWhy"; id: string }
  | { type: "runCommand"; command: string };

export class EvidenceViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "tft.evidenceView";
  private view?: vscode.WebviewView;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly store: SessionStore
  ) {}

  resolveWebviewView(view: vscode.WebviewView) {
    this.view = view;
    view.webview.options = { enableScripts: true };
    view.webview.html = this.renderHtml();

    view.webview.onDidReceiveMessage(async (msg: IncomingMessage) => {
      if (msg.type === "ready") {
        this.push();
        return;
      }

      if (msg.type === "removeEvidence") {
        await this.store.removeEvidence(msg.id);
        return;
      }

      if (msg.type === "editWhy") {
        const s = this.store.get() ?? (await this.store.load());
        const item = s?.evidence?.find((e) => e.id === msg.id);
        if (!item) return;

        const why = await vscode.window.showInputBox({
          title: "Edit whyIncluded",
          value: item.whyIncluded ?? "",
          prompt: "Explain why this evidence matters (1 line is enough).",
          ignoreFocusOut: true,
        });

        if (typeof why === "string") {
          await this.store.updateEvidenceWhy(msg.id, why);
        }
        return;
      }

      if (msg.type === "runCommand") {
        await vscode.commands.executeCommand(msg.command);
        return;
      }
    });

    this.context.subscriptions.push(
      this.store.onDidChangeSession(() => this.push())
    );

    this.push();
  }

  private push() {
    if (!this.view) return;
    const session = this.store.get();
    this.view.webview.postMessage({
      type: "session",
      payload: session,
    });
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
    body {
        color: var(--vscode-foreground);
        background: var(--vscode-sideBar-background);
    }
    button {
        color: var(--vscode-button-foreground);
        background: var(--vscode-button-background);
        border: 1px solid var(--vscode-button-border, transparent);
        padding: 6px 10px;
        cursor: pointer;
    }
    button:hover {
        background: var(--vscode-button-hoverBackground);
    }
    .card {
        background: var(--vscode-editorWidget-background);
        border: 1px solid var(--vscode-editorWidget-border);
    }
    pre {
        background: var(--vscode-textBlockQuote-background, rgba(0,0,0,0.08));
        border: 1px solid var(--vscode-editorWidget-border);
    }
    .muted {
        color: var(--vscode-descriptionForeground);
        opacity: 1;
    }
    .btns {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;    
        margin: 12px 0 14px;
        }
  </style>
</head>
<body>
  <div class="top">
    <div>
      <div><strong>Evidence</strong></div>
      <div class="muted">Add evidence from selection/diagnostics/logs.</div>
    </div>
    <div class="muted" id="count">0</div>
  </div>

  <div class="btns">
    <button data-cmd="ground.addEvidenceFromSelection">Add from Selection</button>
    <button data-cmd="ground.addEvidenceFromActiveFile">Add Active File</button>
    <button data-cmd="ground.addDiagnosticsEvidence">Add Diagnostics</button>
    <button data-cmd="ground.ingestTestLog">Ingest Test Log</button>
  </div>

  <div id="empty" class="muted" style="display:none;">
    No evidence yet. Add from selection or diagnostics.
  </div>

  <div id="list" class="list"></div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    const listEl = document.getElementById('list');
    const emptyEl = document.getElementById('empty');
    const countEl = document.getElementById('count');

    document.querySelectorAll('button[data-cmd]').forEach(btn => {
      btn.addEventListener('click', () => {
        vscode.postMessage({ type: 'runCommand', command: btn.getAttribute('data-cmd') });
      });
    });

    function render(items) {
      listEl.innerHTML = '';
      const n = items.length;
      countEl.textContent = n + ' items';

      emptyEl.style.display = n === 0 ? 'block' : 'none';
      if (n === 0) return;

      for (const it of items) {
        const card = document.createElement('div');
        card.className = 'card';

        const header = document.createElement('div');
        header.className = 'row';

        const left = document.createElement('div');
        left.innerHTML = '<div class="title"></div><div class="meta"></div>';

        left.querySelector('.title').textContent = it.title || '(no title)';
        left.querySelector('.meta').textContent = (it.type || 'evidence') + ' • ' + (it.ref || '');

        const actions = document.createElement('div');
        actions.className = 'actions';

        const editBtn = document.createElement('button');
        editBtn.textContent = 'Edit why';
        editBtn.addEventListener('click', () => vscode.postMessage({ type: 'editWhy', id: it.id }));

        const rmBtn = document.createElement('button');
        rmBtn.textContent = 'Remove';
        rmBtn.addEventListener('click', () => vscode.postMessage({ type: 'removeEvidence', id: it.id }));

        actions.appendChild(editBtn);
        actions.appendChild(rmBtn);

        header.appendChild(left);
        header.appendChild(actions);

        const why = document.createElement('div');
        why.className = 'why';
        why.textContent = 'Why: ' + (it.whyIncluded || '(empty)');

        card.appendChild(header);
        card.appendChild(why);

        if (it.snippet) {
          const pre = document.createElement('pre');
          pre.textContent = it.snippet;
          card.appendChild(pre);
        }

        listEl.appendChild(card);
      }
    }

    window.addEventListener('message', (e) => {
      const msg = e.data;
      if (msg.type !== 'session') return;
      const s = msg.payload;
      const items = (s && s.evidence) ? s.evidence : [];
      render(items);
    });

    vscode.postMessage({ type: 'ready' });
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
