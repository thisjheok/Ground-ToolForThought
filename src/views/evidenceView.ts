import * as vscode from "vscode";
import { SessionStore } from "../state/sessionStore";
import { EvidenceSuggestionAction } from "../state/types";

type IncomingMessage =
  | { type: "ready" }
  | { type: "removeEvidence"; id: string }
  | { type: "editWhy"; id: string }
  | { type: "runCommand"; command: string }
  | { type: "applySuggestion"; id: string; action: EvidenceSuggestionAction };

function commandForSuggestion(action: EvidenceSuggestionAction): string {
  switch (action) {
    case "addActiveFile":
      return "ground.addEvidenceFromActiveFile";
    case "addSelection":
      return "ground.addEvidenceFromSelection";
    case "addDiagnostics":
      return "ground.addDiagnosticsEvidence";
    case "ingestTestLog":
      return "ground.ingestTestLog";
    default:
      return "ground.addDiagnosticsEvidence";
  }
}

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

      if (msg.type === "applySuggestion") {
        const command = commandForSuggestion(msg.action);
        await vscode.commands.executeCommand(command);
        await this.store.removeEvidenceSuggestion(msg.id);
      }
    });

    this.context.subscriptions.push(this.store.onDidChangeSession(() => this.push()));
    this.push();
  }

  private push() {
    if (!this.view) return;
    this.view.webview.postMessage({
      type: "session",
      payload: this.store.get(),
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
    body { color: var(--vscode-foreground); background: var(--vscode-sideBar-background); padding: 10px; }
    .muted { color: var(--vscode-descriptionForeground); font-size: 12px; }
    .row { display: flex; justify-content: space-between; align-items: center; gap: 8px; min-width: 0; }
    .evidenceRow { align-items: flex-start; flex-wrap: wrap; }
    .evidenceMain { flex: 1 1 180px; min-width: 0; }
    .evidenceActions { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
    .evidenceMain .title, .evidenceMain .meta { overflow-wrap: anywhere; }
    .suggestionRow { align-items: flex-start; flex-wrap: wrap; }
    .suggestionTitle { flex: 1 1 180px; min-width: 0; overflow-wrap: anywhere; }
    .toolbar { display: flex; gap: 8px; flex-wrap: wrap; margin: 10px 0 14px; }
    .toolbar button {
      flex: 1 1 150px;
      min-width: 0;
      white-space: normal;
      overflow-wrap: anywhere;
    }
    button {
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
      border: 1px solid var(--vscode-button-border, transparent);
      padding: 6px 10px;
      border-radius: 6px;
      cursor: pointer;
    }
    button.secondary {
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      border-color: var(--vscode-input-border, transparent);
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
    .sectionTitle { margin: 12px 0 8px; font-size: 12px; color: var(--vscode-descriptionForeground); text-transform: uppercase; }
    .card {
      background: var(--vscode-editorWidget-background);
      border: 1px solid var(--vscode-editorWidget-border);
      border-radius: 8px;
      padding: 10px;
      margin-bottom: 8px;
    }
    .meta { font-size: 12px; color: var(--vscode-descriptionForeground); }
    .title { font-weight: 600; margin-bottom: 4px; }
    .why { margin-top: 8px; font-size: 12px; }
    pre {
      background: var(--vscode-textBlockQuote-background, rgba(0,0,0,0.08));
      border: 1px solid var(--vscode-editorWidget-border);
      border-radius: 6px;
      padding: 8px;
      font-size: 11px;
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 120px;
      overflow: auto;
      margin-top: 8px;
    }
    .chip {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 11px;
      border: 1px solid var(--vscode-editorWidget-border);
      margin-right: 6px;
    }
    .empty { color: var(--vscode-descriptionForeground); font-size: 12px; padding: 8px 0; }
  </style>
</head>
<body>
  <div class="row">
    <div>
      <div><strong>Evidence Pack</strong></div>
      <div class="muted">Raw evidence + AI insights for grounded implementation decisions.</div>
    </div>
    <div id="count" class="muted">0 items</div>
  </div>

  <div class="toolbar">
    <button data-cmd="ground.buildEvidencePack">Build Evidence Pack</button>
    <button data-cmd="ground.generateEvidenceInsightsAI">Generate AI Insights</button>
    <button class="secondary" data-cmd="ground.addEvidenceFromSelection">Add Selection</button>
    <button class="secondary" data-cmd="ground.addDiagnosticsEvidence">Add Diagnostics</button>
  </div>

  <div class="sectionTitle">AI Insights</div>
  <div id="insightsEmpty" class="empty">No insights yet. Click "Generate AI Insights".</div>
  <div id="insights"></div>

  <div class="sectionTitle">Suggested Raw Evidence</div>
  <div id="suggestionsEmpty" class="empty">No suggested additions.</div>
  <div id="suggestions"></div>

  <div class="sectionTitle">Raw Evidence</div>
  <div id="rawEmpty" class="empty">No evidence yet. Click "Build Evidence Pack".</div>
  <div id="rawList"></div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const rawListEl = document.getElementById('rawList');
    const rawEmptyEl = document.getElementById('rawEmpty');
    const insightsEl = document.getElementById('insights');
    const insightsEmptyEl = document.getElementById('insightsEmpty');
    const suggestionsEl = document.getElementById('suggestions');
    const suggestionsEmptyEl = document.getElementById('suggestionsEmpty');
    const countEl = document.getElementById('count');

    document.querySelectorAll('button[data-cmd]').forEach((btn) => {
      btn.addEventListener('click', () => {
        vscode.postMessage({ type: 'runCommand', command: btn.getAttribute('data-cmd') });
      });
    });

    function renderRaw(items) {
      rawListEl.innerHTML = '';
      rawEmptyEl.style.display = items.length === 0 ? 'block' : 'none';
      for (const it of items) {
        const card = document.createElement('div');
        card.className = 'card';

        const top = document.createElement('div');
        top.className = 'row evidenceRow';

        const left = document.createElement('div');
        left.className = 'evidenceMain';
        left.innerHTML = '<div class="title"></div><div class="meta"></div>';
        left.querySelector('.title').textContent = it.title || '(no title)';
        left.querySelector('.meta').textContent = (it.type || 'evidence') + ' • ' + (it.ref || '');

        const right = document.createElement('div');
        right.className = 'evidenceActions';
        const editBtn = document.createElement('button');
        editBtn.className = 'secondary';
        editBtn.textContent = 'Edit why';
        editBtn.addEventListener('click', () => vscode.postMessage({ type: 'editWhy', id: it.id }));

        const rmBtn = document.createElement('button');
        rmBtn.className = 'secondary';
        rmBtn.textContent = 'Remove';
        rmBtn.addEventListener('click', () => vscode.postMessage({ type: 'removeEvidence', id: it.id }));
        right.appendChild(editBtn);
        right.appendChild(rmBtn);

        top.appendChild(left);
        top.appendChild(right);
        card.appendChild(top);

        const chips = document.createElement('div');
        const source = document.createElement('span');
        source.className = 'chip';
        source.textContent = 'source: ' + (it.source || 'user');
        chips.appendChild(source);
        card.appendChild(chips);

        const why = document.createElement('div');
        why.className = 'why';
        why.textContent = 'Why: ' + (it.whyIncluded || '(empty)');
        card.appendChild(why);

        if (it.snippet) {
          const pre = document.createElement('pre');
          pre.textContent = it.snippet;
          card.appendChild(pre);
        }

        rawListEl.appendChild(card);
      }
    }

    function renderInsights(items) {
      insightsEl.innerHTML = '';
      insightsEmptyEl.style.display = items.length === 0 ? 'block' : 'none';
      function insightBorderColor(kind) {
        if (kind === 'Risk') return 'var(--vscode-editorError-foreground, #cc6666)';
        if (kind === 'Security') return 'var(--vscode-editorWarning-foreground, #d7ba7d)';
        if (kind === 'Test') return 'var(--vscode-terminal-ansiBlue, #569cd6)';
        if (kind === 'Performance') return 'var(--vscode-terminal-ansiYellow, #dcdcaa)';
        if (kind === 'Search') return 'var(--vscode-terminal-ansiCyan, #4ec9b0)';
        return 'var(--vscode-terminal-ansiGreen, #6a9955)';
      }
      for (const it of items) {
        const card = document.createElement('div');
        card.className = 'card';

        const kindChip = document.createElement('span');
        kindChip.className = 'chip';
        kindChip.textContent = it.kind || 'Implementation';
        kindChip.style.borderColor = insightBorderColor(it.kind || 'Implementation');
        kindChip.style.marginRight = '8px';

        const titleWrap = document.createElement('div');
        titleWrap.className = 'row';
        const left = document.createElement('div');
        left.appendChild(kindChip);
        const titleText = document.createElement('span');
        titleText.textContent = it.title || 'Insight';
        left.appendChild(titleText);
        titleWrap.appendChild(left);
        card.appendChild(titleWrap);

        const body = document.createElement('div');
        body.className = 'why';
        body.textContent = it.body || '';
        card.appendChild(body);

        if (Array.isArray(it.queries) && it.queries.length > 0) {
          const q = document.createElement('pre');
          q.textContent = it.queries.join('\\n');
          card.appendChild(q);
        }

        insightsEl.appendChild(card);
      }
    }

    function actionLabel(action) {
      if (action === 'addActiveFile') return 'Add Active File';
      if (action === 'addSelection') return 'Add Selection';
      if (action === 'addDiagnostics') return 'Add Diagnostics';
      if (action === 'ingestTestLog') return 'Ingest Test Log';
      return 'Add Diagnostics';
    }

    function renderSuggestions(items) {
      suggestionsEl.innerHTML = '';
      suggestionsEmptyEl.style.display = items.length === 0 ? 'block' : 'none';
      for (const it of items) {
        const card = document.createElement('div');
        card.className = 'card';

        const top = document.createElement('div');
        top.className = 'row suggestionRow';
        const title = document.createElement('div');
        title.className = 'title suggestionTitle';
        title.textContent = it.title || 'Suggested raw evidence';
        top.appendChild(title);

        const applyBtn = document.createElement('button');
        applyBtn.textContent = actionLabel(it.action);
        applyBtn.addEventListener('click', () => {
          vscode.postMessage({ type: 'applySuggestion', id: it.id, action: it.action });
        });
        top.appendChild(applyBtn);

        const reason = document.createElement('div');
        reason.className = 'why';
        reason.textContent = it.reason || '';

        card.appendChild(top);
        card.appendChild(reason);
        suggestionsEl.appendChild(card);
      }
    }

    window.addEventListener('message', (e) => {
      const msg = e.data;
      if (msg.type !== 'session') return;
      const s = msg.payload || {};
      const evidence = Array.isArray(s.evidence) ? s.evidence : [];
      const insights = Array.isArray(s.evidenceInsights) ? s.evidenceInsights : [];
      const suggestions = Array.isArray(s.evidenceSuggestions) ? s.evidenceSuggestions : [];
      countEl.textContent = evidence.length + ' raw items';
      renderRaw(evidence);
      renderInsights(insights);
      renderSuggestions(suggestions);
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
