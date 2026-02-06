// src/views/outlineView.ts

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

    view.webview.html = this.renderHtml(view.webview);

    // 메시지 수신
    view.webview.onDidReceiveMessage(async (msg: IncomingMessage) => {
      if (msg.type === "ready") {
        // 웹뷰가 준비되면 현재 세션 push
        this.pushSession();
        return;
      }

      if (msg.type === "updateOutline") {
        // 세션 없으면 생성
        const s = this.store.get() ?? (await this.store.create("standard"));

        await this.store.update({
          outline: {
            ...s.outline,
            ...msg.payload,
          },
        });

        // store 이벤트로 다른 패널도 갱신되지만, outline은 즉시 반영해도 됨
        this.pushSession();
      }
    });

    // store 변경을 웹뷰로 push
    this.context.subscriptions.push(
      this.store.onDidChangeSession(() => this.pushSession())
    );

    // 초기 push
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

  private renderHtml(webview: vscode.Webview): string {
    const nonce = getNonce();

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Outline</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 12px; }
    .row { margin-bottom: 10px; }
    label { display: block; font-size: 12px; opacity: 0.8; margin-bottom: 6px; }
    textarea { width: 100%; box-sizing: border-box; min-height: 70px; resize: vertical; }
    .top { display:flex; align-items:center; justify-content: space-between; margin-bottom: 12px; }
    .badge { font-size: 12px; padding: 4px 8px; border-radius: 10px; }
    .ok { background: rgba(40, 167, 69, 0.15); }
    .warn { background: rgba(255, 193, 7, 0.18); }
    .hint { font-size: 12px; opacity: 0.75; margin-top: 6px; }
    .muted { opacity: 0.7; font-size: 12px; }
  </style>
</head>
<body>
  <div class="top">
    <div>
      <div><strong>Outline</strong></div>
      <div class="muted">Fill required fields to unlock next steps.</div>
    </div>
    <div id="gateBadge" class="badge warn">⚠️ Gate</div>
  </div>

  <div id="noSession" class="hint" style="display:none;">
    No session yet. Run <strong>Tool for Thought: Start Session</strong> or start typing here to auto-create.
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
    const badgeEl = document.getElementById('gateBadge');
    const noSessionEl = document.getElementById('noSession');

    let lastSent = { definitionOfDone: '', constraints: '', verificationPlan: '' };
    let isApplyingRemote = false;

    function updateBadge(session) {
      const ok = !!(session && session.gate && session.gate.outlineReady);
      badgeEl.className = 'badge ' + (ok ? 'ok' : 'warn');
      badgeEl.textContent = ok ? '✅ Outline Ready' : '⚠️ Outline Incomplete';
    }

    function applySession(session) {
      isApplyingRemote = true;

      if (!session) {
        noSessionEl.style.display = 'block';
        dodEl.value = '';
        consEl.value = '';
        verEl.value = '';
        updateBadge(null);
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

      updateBadge(session);
      isApplyingRemote = false;
    }

    function maybeSend() {
      if (isApplyingRemote) return;

      const payload = {
        definitionOfDone: dodEl.value,
        constraints: consEl.value,
        verificationPlan: verEl.value
      };

      // 변화가 있을 때만 전송
      if (
        payload.definitionOfDone === lastSent.definitionOfDone &&
        payload.constraints === lastSent.constraints &&
        payload.verificationPlan === lastSent.verificationPlan
      ) return;

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
