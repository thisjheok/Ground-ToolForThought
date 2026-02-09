import * as vscode from "vscode";
import { SessionStore } from "../state/sessionStore";

type IncomingMessage =
  | { type: "ready" }
  | { type: "newSession" }
  | { type: "switchSession"; sessionId: string }
  | { type: "renameSession"; sessionId: string }
  | { type: "archiveSession"; sessionId: string };

export class SessionHistoryViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "tft.sessionHistoryView";
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
      if (msg.type === "newSession") {
        await vscode.commands.executeCommand("ground.session.new");
        return;
      }
      if (msg.type === "switchSession") {
        await this.store.setActiveSession(msg.sessionId);
        return;
      }
      if (msg.type === "renameSession") {
        if (msg.sessionId !== this.store.getActiveSession()?.id) {
          await this.store.setActiveSession(msg.sessionId);
        }
        await vscode.commands.executeCommand("ground.session.rename");
        return;
      }
      if (msg.type === "archiveSession") {
        if (msg.sessionId !== this.store.getActiveSession()?.id) {
          await this.store.setActiveSession(msg.sessionId);
        }
        await vscode.commands.executeCommand("ground.session.archive");
      }
    });

    this.context.subscriptions.push(this.store.onDidChangeSession(() => this.push()));
    this.context.subscriptions.push(this.store.onDidChangeSessionList(() => this.push()));

    this.push();
  }

  private push() {
    if (!this.view) return;
    const activeSessionId = this.store.getActiveSession()?.id ?? null;
    this.view.webview.postMessage({
      type: "sessions",
      payload: {
        activeSessionId,
        activeTitle: this.store.getActiveSession()?.title ?? null,
        sessions: this.store.listSessions({ includeArchived: true }),
      },
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
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      padding: 10px;
    }
    .top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 10px;
      gap: 8px;
    }
    .muted { color: var(--vscode-descriptionForeground); font-size: 12px; }
    button {
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
      border: 1px solid var(--vscode-button-border, transparent);
      border-radius: 6px;
      padding: 4px 8px;
      cursor: pointer;
      font-size: 12px;
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
    .secondary {
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border-color: var(--vscode-input-border, transparent);
    }
    .list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .card {
      border: 1px solid var(--vscode-editorWidget-border);
      border-radius: 8px;
      padding: 8px;
      background: var(--vscode-editorWidget-background);
    }
    .card.active {
      border-color: var(--vscode-focusBorder);
      outline: 1px solid var(--vscode-focusBorder);
    }
    .title {
      font-weight: 600;
      margin-bottom: 2px;
      word-break: break-word;
    }
    .meta, .stats {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 4px;
      word-break: break-word;
    }
    .actions {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    details { margin-top: 10px; }
    summary { cursor: pointer; }
    .empty {
      border: 1px dashed var(--vscode-editorWidget-border);
      border-radius: 8px;
      padding: 8px;
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }
  </style>
</head>
<body>
  <div class="top">
    <div>
      <div><strong>Session History</strong></div>
      <div class="muted" id="activeLabel">No active session</div>
    </div>
    <button id="newSessionBtn">New Session</button>
  </div>

  <div id="activeList" class="list"></div>
  <details id="archivedSection">
    <summary>Archived Sessions</summary>
    <div id="archivedList" class="list"></div>
  </details>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const activeLabelEl = document.getElementById('activeLabel');
    const activeListEl = document.getElementById('activeList');
    const archivedListEl = document.getElementById('archivedList');
    const archivedSectionEl = document.getElementById('archivedSection');
    document.getElementById('newSessionBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'newSession' });
    });

    function fmtDate(iso) {
      try {
        return new Date(iso).toLocaleString();
      } catch {
        return iso || '';
      }
    }

    function buildCard(session, activeSessionId) {
      const card = document.createElement('div');
      card.className = 'card' + (session.id === activeSessionId ? ' active' : '');

      const title = document.createElement('div');
      title.className = 'title';
      title.textContent = session.title || '(untitled)';

      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent = session.mode + ' • updated ' + fmtDate(session.updatedAt);

      const stats = document.createElement('div');
      stats.className = 'stats';
      stats.textContent =
        'Outline ' + (session.outlineReady ? 'ready' : 'incomplete') +
        ' • Provocation ' + session.provocationResponded + '/' + session.provocationTotal +
        ' • Evidence ' + session.evidenceCount;

      const actions = document.createElement('div');
      actions.className = 'actions';

      if (!session.archived && session.id !== activeSessionId) {
        const switchBtn = document.createElement('button');
        switchBtn.textContent = 'Switch';
        switchBtn.addEventListener('click', () => {
          vscode.postMessage({ type: 'switchSession', sessionId: session.id });
        });
        actions.appendChild(switchBtn);
      }

      if (!session.archived && session.id === activeSessionId) {
        const activeBtn = document.createElement('button');
        activeBtn.className = 'secondary';
        activeBtn.textContent = 'Active';
        activeBtn.disabled = true;
        actions.appendChild(activeBtn);
      }

      if (!session.archived) {
        const renameBtn = document.createElement('button');
        renameBtn.className = 'secondary';
        renameBtn.textContent = 'Rename';
        renameBtn.addEventListener('click', () => {
          vscode.postMessage({ type: 'renameSession', sessionId: session.id });
        });
        actions.appendChild(renameBtn);

        const archiveBtn = document.createElement('button');
        archiveBtn.className = 'secondary';
        archiveBtn.textContent = 'Archive';
        archiveBtn.addEventListener('click', () => {
          vscode.postMessage({ type: 'archiveSession', sessionId: session.id });
        });
        actions.appendChild(archiveBtn);
      }

      card.appendChild(title);
      card.appendChild(meta);
      card.appendChild(stats);
      card.appendChild(actions);
      return card;
    }

    function render(payload) {
      const sessions = Array.isArray(payload.sessions) ? payload.sessions : [];
      const activeSessionId = payload.activeSessionId || null;
      const activeTitle = payload.activeTitle || null;

      activeLabelEl.textContent = activeTitle ? ('Active: ' + activeTitle) : 'No active session';
      activeListEl.innerHTML = '';
      archivedListEl.innerHTML = '';

      const activeSessions = sessions.filter((s) => !s.archived);
      const archivedSessions = sessions.filter((s) => !!s.archived);

      if (activeSessions.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = 'No active sessions. Create a new session.';
        activeListEl.appendChild(empty);
      } else {
        for (const session of activeSessions) {
          activeListEl.appendChild(buildCard(session, activeSessionId));
        }
      }

      archivedSectionEl.style.display = archivedSessions.length > 0 ? 'block' : 'none';
      for (const session of archivedSessions) {
        archivedListEl.appendChild(buildCard(session, activeSessionId));
      }
    }

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'sessions') {
        render(msg.payload || {});
      }
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
