// workspaceState에 세션을 저장하고, 업데이트할 때마다 gate를 재계산

import * as vscode from "vscode";
import { computeGate } from "./gate";
import { Mode, Session } from "./types";

const SESSION_KEY = "tft.session.v1";

function nowIso(): string{
    return new Date().toISOString();
}

// 간단한 id 생성 (무작위 수 기반)
// (나중에 crypto.randomUUID 사용 가능)
function newId(prefix = "sess"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// 현재 활성화 된 Session을 get
function getActiveContext(): Session["context"] {
  const editor = vscode.window.activeTextEditor;

  const workspaceFolder =
    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  let activeFile: string | undefined;
  let selection: Session["context"]["selection"] | undefined;

  if (editor) {
    activeFile = editor.document.uri.fsPath;
    const sel = editor.selection;
    selection = {
      startLine: sel.start.line,
      startCharacter: sel.start.character,
      endLine: sel.end.line,
      endCharacter: sel.end.character,
    };
  }

  return { workspaceFolder, activeFile, selection };
}

export class SessionStore {
  private session: Session | null = null;

  private readonly _onDidChangeSession = new vscode.EventEmitter<Session | null>();
  public readonly onDidChangeSession = this._onDidChangeSession.event;
  
  constructor(private readonly ctx: vscode.ExtensionContext) {}
  
  private emit() {
    this._onDidChangeSession.fire(this.session);
  }

  async load(): Promise<Session | null> {
    const raw = this.ctx.workspaceState.get<Session>(SESSION_KEY);
    if (!raw) {
      this.session = null;
      return null;
    }

    // gate는 재계산(버전/로직 변경 대비)
    const normalized: Session = {
      ...raw,
      gate: computeGate(raw),
    };
    this.session = normalized;
    this.emit();
    return normalized;
  }

  get(): Session | null {
    return this.session;
  }

  /**
   * 새 세션 생성 + 저장 + 메모리 반영
   */
  async create(mode: Mode = "standard"): Promise<Session> {
    const createdAt = nowIso();
    const s: Session = {
      id: newId(),
      mode,

      createdAt,
      updatedAt: createdAt,

      context: getActiveContext(),

      outline: {
        definitionOfDone: "",
        constraints: "",
        verificationPlan: "",
        symptom: "",
        reproSteps: "",
        strategy: "",
      },

      evidence: [],
      provocations: [],
      decisions: {},

      gate: {
        outlineReady: false,
        provocationRespondedCount: 0,
        canGeneratePatch: false,
        canExport: false,
      },
    };

    // gate 계산
    s.gate = computeGate(s);

    await this.ctx.workspaceState.update(SESSION_KEY, s);
    this.session = s;
    this.emit();
    return s;
  }

  /**
   * 세션 업데이트 (부분 업데이트)
   * - updatedAt 갱신
   * - gate 재계산
   * - workspaceState에 저장
   */
  async update(patch: Partial<Session>): Promise<Session> {
    const current = this.session ?? (await this.load());
    if (!current) {
      // 세션이 없으면 새로 생성
      const created = await this.create("standard");
      return created;
    }

    // 얕은 merge + 일부 중첩 필드는 호출자가 명확히 patch하도록 설계
    const next: Session = {
      ...current,
      ...patch,
      context: patch.context ? { ...current.context, ...patch.context } : current.context,
      outline: patch.outline ? { ...current.outline, ...patch.outline } : current.outline,
      decisions: patch.decisions ? { ...current.decisions, ...patch.decisions } : current.decisions,
      updatedAt: nowIso(),
    };

    next.gate = computeGate(next);

    await this.ctx.workspaceState.update(SESSION_KEY, next);
    this.session = next;
    this.emit();
    return next;
  }

  /**
   * 세션 삭제(리셋)
   */
  async clear(): Promise<void> {
    await this.ctx.workspaceState.update(SESSION_KEY, undefined);
    this.session = null;
    this.emit();
  }
}