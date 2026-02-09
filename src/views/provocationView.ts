import * as vscode from "vscode";
import { SessionStore } from "../state/sessionStore";
import { ProvocationDecision } from "../state/types";

type IncomingMessage =
  | { type: "ready" }
  | { type: "generateProvocations" }
  | { type: "saveResponse"; id: string; decision: ProvocationDecision; rationale: string };

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

    view.webview.onDidReceiveMessage(async (msg: IncomingMessage) => {
      if (msg.type === "ready") {
        this.push();
        return;
      }

      if (msg.type === "generateProvocations") {
        await vscode.commands.executeCommand("ground.generateProvocationsMock");
        return;
      }

      if (msg.type === "saveResponse") {
        try {
          await this.store.upsertProvocationResponse(msg.id, msg.decision, msg.rationale);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Failed to save provocation response.";
          this.view?.webview.postMessage({ type: "toast", message, level: "error" });
        }
      }
    });

    this.context.subscriptions.push(this.store.onDidChangeSession(() => this.push()));

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
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      padding: 12px;
    }
    .top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 12px;
    }
    .muted {
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
    }
    .gate {
      font-size: 12px;
      margin-bottom: 10px;
    }
    button {
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
      border: 1px solid var(--vscode-button-border, transparent);
      border-radius: 6px;
      padding: 6px 10px;
      cursor: pointer;
    }
    button:hover {
      background: var(--vscode-button-hoverBackground);
    }
    button.secondary {
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border-color: var(--vscode-input-border, transparent);
    }
    .cards {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .card {
      background: var(--vscode-editorWidget-background);
      border: 1px solid var(--vscode-editorWidget-border);
      border-radius: 8px;
      padding: 10px;
    }
    .cardTitle {
      font-weight: 600;
      margin-bottom: 4px;
    }
    .chipRow {
      display: flex;
      gap: 6px;
      margin-bottom: 8px;
      flex-wrap: wrap;
    }
    .chip {
      font-size: 11px;
      border: 1px solid var(--vscode-editorWidget-border);
      border-radius: 999px;
      padding: 2px 8px;
      color: var(--vscode-descriptionForeground);
    }
    .body {
      margin-bottom: 10px;
      white-space: pre-wrap;
      word-break: break-word;
      font-size: 12px;
    }
    .decisionRow {
      display: flex;
      gap: 6px;
      margin-bottom: 8px;
      flex-wrap: wrap;
    }
    .decisionBtn.active {
      border-color: var(--vscode-focusBorder);
      outline: 1px solid var(--vscode-focusBorder);
    }
    textarea {
      width: 100%;
      min-height: 60px;
      resize: vertical;
      box-sizing: border-box;
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border, transparent);
      border-radius: 6px;
      padding: 8px;
      margin-bottom: 8px;
    }
    .footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
    }
    .error {
      color: var(--vscode-errorForeground);
      font-size: 12px;
      min-height: 16px;
    }
    .empty {
      border: 1px dashed var(--vscode-editorWidget-border);
      border-radius: 8px;
      padding: 12px;
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="top">
    <div>
      <div><strong>Provocations</strong></div>
      <div class="muted">Productive friction: respond before apply/export steps.</div>
    </div>
    <button id="generateBtn">Generate Provocations</button>
  </div>

  <div id="gate" class="gate">Responded 0/0 (Not Ready)</div>
  <div id="toast" class="error"></div>
  <div id="cards" class="cards"></div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    const gateEl = document.getElementById('gate');
    const cardsEl = document.getElementById('cards');
    const toastEl = document.getElementById('toast');
    const generateBtn = document.getElementById('generateBtn');

    function setToast(message) {
      toastEl.textContent = message || '';
    }

    function gateText(session) {
      const responded = (session && session.gate && session.gate.provocationRespondedCount) || 0;
      const total = (session && session.gate && session.gate.provocationTotalCount) || 0;
      const ready = !!(session && session.gate && session.gate.provocationReady);
      return 'Responded ' + responded + '/' + total + ' (' + (ready ? 'Ready' : 'Not Ready') + ')';
    }

    function renderSession(session) {
      gateEl.textContent = gateText(session);
      cardsEl.innerHTML = '';

      if (!session) {
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = 'No session yet. Start session first, then generate provocations.';
        cardsEl.appendChild(empty);
        return;
      }

      const cards = Array.isArray(session.provocations) ? session.provocations : [];
      const responses = session.provocationResponses || {};

      if (cards.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = 'No provocation cards. Click "Generate Provocations".';
        cardsEl.appendChild(empty);
        return;
      }

      for (const card of cards) {
        const response = responses[card.id] || {};
        const selectedDecision = response.decision || '';
        const rationale = response.rationale || '';

        const cardEl = document.createElement('div');
        cardEl.className = 'card';

        const title = document.createElement('div');
        title.className = 'cardTitle';
        title.textContent = card.title || card.kind;

        const chips = document.createElement('div');
        chips.className = 'chipRow';
        chips.innerHTML = [
          '<span class="chip">' + (card.kind || 'Provocation') + '</span>',
          card.severity ? '<span class="chip">severity: ' + card.severity + '</span>' : '',
          Array.isArray(card.basedOnEvidenceIds) && card.basedOnEvidenceIds.length
            ? '<span class="chip">evidence: ' + card.basedOnEvidenceIds.length + '</span>'
            : ''
        ].join('');

        const body = document.createElement('div');
        body.className = 'body';
        body.textContent = card.body || '';

        const decisionRow = document.createElement('div');
        decisionRow.className = 'decisionRow';

        const decisions = ['accept', 'hold', 'reject'];
        for (const d of decisions) {
          const btn = document.createElement('button');
          btn.className = 'secondary decisionBtn' + (selectedDecision === d ? ' active' : '');
          btn.textContent = d[0].toUpperCase() + d.slice(1);
          btn.dataset.decision = d;
          btn.addEventListener('click', () => {
            decisionRow.querySelectorAll('.decisionBtn').forEach((el) => el.classList.remove('active'));
            btn.classList.add('active');
          });
          decisionRow.appendChild(btn);
        }

        const rationaleEl = document.createElement('textarea');
        rationaleEl.value = rationale;
        rationaleEl.placeholder = 'Why did you choose this decision? (required)';

        const errorEl = document.createElement('div');
        errorEl.className = 'error';

        const footerEl = document.createElement('div');
        footerEl.className = 'footer';

        const respondedAtEl = document.createElement('div');
        respondedAtEl.className = 'muted';
        respondedAtEl.textContent = response.respondedAt ? ('Last saved: ' + response.respondedAt) : '';

        const saveBtn = document.createElement('button');
        saveBtn.textContent = 'Save';
        saveBtn.addEventListener('click', () => {
          const active = decisionRow.querySelector('.decisionBtn.active');
          const decision = active && active.dataset ? active.dataset.decision : '';
          const rationaleValue = rationaleEl.value || '';

          if (decision !== 'accept' && decision !== 'hold' && decision !== 'reject') {
            errorEl.textContent = 'Select Accept, Hold, or Reject.';
            return;
          }
          if (!rationaleValue.trim()) {
            errorEl.textContent = 'Rationale is required.';
            return;
          }

          errorEl.textContent = '';
          setToast('');
          vscode.postMessage({
            type: 'saveResponse',
            id: card.id,
            decision,
            rationale: rationaleValue
          });
        });

        footerEl.appendChild(respondedAtEl);
        footerEl.appendChild(saveBtn);

        cardEl.appendChild(title);
        cardEl.appendChild(chips);
        cardEl.appendChild(body);
        cardEl.appendChild(decisionRow);
        cardEl.appendChild(rationaleEl);
        cardEl.appendChild(errorEl);
        cardEl.appendChild(footerEl);

        cardsEl.appendChild(cardEl);
      }
    }

    generateBtn.addEventListener('click', () => {
      setToast('');
      vscode.postMessage({ type: 'generateProvocations' });
    });

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'session') {
        renderSession(msg.payload);
      }
      if (msg.type === 'toast') {
        setToast(msg.message || '');
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
