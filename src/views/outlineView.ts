import * as vscode from "vscode";
import { SessionStore } from "../state/sessionStore";
import { Session } from "../state/types";

type IncomingMessage =
  | { type: "ready" }
  | {
      type: "updateOutline";
      payload: Partial<Session["outline"]>;
    };

export class OutlineViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "tft.outlineView";

  private view?: vscode.WebviewView;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly store: SessionStore
  ) {}

  resolveWebviewView(view: vscode.WebviewView) {
    this.view = view;

    view.webview.options = {
      enableScripts: true,
    };

    view.webview.html = this.renderHtml();

    view.webview.onDidReceiveMessage(async (msg: IncomingMessage) => {
      if (msg.type === "ready") {
        this.pushSession();
        return;
      }

      if (msg.type === "updateOutline") {
        const s = this.store.get() ?? (await this.store.create("standard"));
        await this.store.update({
          outline: {
            ...s.outline,
            ...msg.payload,
          },
        });
        this.pushSession();
      }
    });

    this.context.subscriptions.push(this.store.onDidChangeSession(() => this.pushSession()));

    this.pushSession();
  }

  private pushSession() {
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
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Outline</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      padding: 12px;
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
    }
    .row { margin-bottom: 10px; }
    label { display: block; font-size: 12px; color: var(--vscode-descriptionForeground); margin-bottom: 6px; }
    textarea {
      width: 100%;
      box-sizing: border-box;
      min-height: 70px;
      resize: vertical;
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border, transparent);
      padding: 6px;
    }
    .top { display:flex; align-items:center; justify-content: space-between; margin-bottom: 8px; }
    .badge { font-size: 12px; padding: 4px 8px; border-radius: 10px; }
    .ok { background: var(--vscode-charts-green, #388a34); color: var(--vscode-editor-background); }
    .warn { background: var(--vscode-charts-yellow, #cca700); color: var(--vscode-editor-background); }
    .hint { font-size: 12px; color: var(--vscode-descriptionForeground); margin-top: 6px; }
    .muted { color: var(--vscode-descriptionForeground); font-size: 12px; }
    .gateRow { margin-bottom: 12px; font-size: 12px; color: var(--vscode-descriptionForeground); }
  </style>
</head>
<body>
  <div class="top">
    <div>
      <div><strong>Outline</strong></div>
      <div class="muted">Fill required fields to unlock next steps.</div>
    </div>
    <div id="outlineGateBadge" class="badge warn">Outline Incomplete</div>
  </div>
  <div id="provGateRow" class="gateRow">Provocations: 0/0 responded (Not Ready)</div>

  <div id="noSession" class="hint" style="display:none;">
    No session yet. Run <strong>Tool for Thought: Start Session</strong> or start typing to auto-create.
  </div>

  <div class="row">
    <label>Definition of Done (required)</label>
    <textarea id="dod" placeholder="What does success look like?"></textarea>
  </div>

  <div class="row">
    <label>Constraints (required)</label>
    <textarea id="constraints" placeholder="Performance, security, compatibility, deadline..."></textarea>
  </div>

  <div class="row">
    <label>Verification Plan (required)</label>
    <textarea id="verify" placeholder="How will you know it's correct? Tests, logs, metrics..."></textarea>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    const dodEl = document.getElementById('dod');
    const consEl = document.getElementById('constraints');
    const verEl = document.getElementById('verify');
    const outlineGateBadgeEl = document.getElementById('outlineGateBadge');
    const provGateRowEl = document.getElementById('provGateRow');
    const noSessionEl = document.getElementById('noSession');

    let lastSent = { definitionOfDone: '', constraints: '', verificationPlan: '' };
    let isApplyingRemote = false;

    function updateGateUI(session) {
      const outlineReady = !!(session && session.gate && session.gate.outlineReady);
      const provResponded = (session && session.gate && session.gate.provocationRespondedCount) || 0;
      const provTotal = (session && session.gate && session.gate.provocationTotalCount) || 0;
      const provReady = !!(session && session.gate && session.gate.provocationReady);

      outlineGateBadgeEl.className = 'badge ' + (outlineReady ? 'ok' : 'warn');
      outlineGateBadgeEl.textContent = outlineReady ? 'Outline Ready' : 'Outline Incomplete';

      provGateRowEl.textContent =
        'Provocations: ' + provResponded + '/' + provTotal + ' responded (' + (provReady ? 'Ready' : 'Not Ready') + ')';
    }

    function applySession(session) {
      isApplyingRemote = true;

      if (!session) {
        noSessionEl.style.display = 'block';
        dodEl.value = '';
        consEl.value = '';
        verEl.value = '';
        updateGateUI(null);
        isApplyingRemote = false;
        return;
      }

      noSessionEl.style.display = 'none';

      const o = session.outline || {};
      dodEl.value = o.definitionOfDone || '';
      consEl.value = o.constraints || '';
      verEl.value = o.verificationPlan || '';

      lastSent = {
        definitionOfDone: dodEl.value,
        constraints: consEl.value,
        verificationPlan: verEl.value
      };

      updateGateUI(session);
      isApplyingRemote = false;
    }

    function maybeSend() {
      if (isApplyingRemote) return;

      const payload = {
        definitionOfDone: dodEl.value,
        constraints: consEl.value,
        verificationPlan: verEl.value
      };

      if (
        payload.definitionOfDone === lastSent.definitionOfDone &&
        payload.constraints === lastSent.constraints &&
        payload.verificationPlan === lastSent.verificationPlan
      ) {
        return;
      }

      lastSent = payload;
      vscode.postMessage({ type: 'updateOutline', payload });
    }

    dodEl.addEventListener('input', debounce(maybeSend, 150));
    consEl.addEventListener('input', debounce(maybeSend, 150));
    verEl.addEventListener('input', debounce(maybeSend, 150));

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'session') {
        applySession(msg.payload);
      }
    });

    vscode.postMessage({ type: 'ready' });

    function debounce(fn, ms) {
      let t = null;
      return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), ms);
      };
    }
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
