import * as path from "path";
import * as vscode from "vscode";
import { computeGate } from "./gate";
import {
  Mode,
  ProvocationCard,
  ProvocationDecision,
  ProvocationResponse,
  Session,
  SessionMeta,
  SessionStoreState,
} from "./types";
import { EvidenceItem } from "./types";

const LEGACY_SESSION_KEY = "tft.session.v1";
const SESSION_STORE_KEY = "tft.sessions.v2";

function nowIso(): string {
  return new Date().toISOString();
}

function newId(prefix = "sess"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function isValidMode(mode: unknown): mode is Mode {
  return (
    mode === "bugfix" ||
    mode === "feature" ||
    mode === "refactor" ||
    mode === "standard" ||
    mode === "learning" ||
    mode === "fast"
  );
}

function getActiveContext(): Session["context"] {
  const editor = vscode.window.activeTextEditor;
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

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

function summarizeSession(session: Session) {
  return {
    evidenceCount: session.evidence.length,
    provocationTotal: session.gate.provocationTotalCount,
    provocationResponded: session.gate.provocationRespondedCount,
    outlineReady: session.gate.outlineReady,
    provocationReady: session.gate.provocationReady,
  };
}

function getSessionMeta(session: Session): SessionMeta {
  return {
    id: session.id,
    title: session.title,
    mode: session.mode,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    archived: session.archived,
    ...summarizeSession(session),
  };
}

function normalizeProvocations(raw: any): ProvocationCard[] {
  const items: any[] = Array.isArray(raw?.provocations) ? raw.provocations : [];
  return items
    .filter((item) => typeof item?.id === "string")
    .map((item) => {
      const kind = typeof item.kind === "string" ? item.kind : item.type;
      const title = typeof item.title === "string" ? item.title : item.type ?? "Provocation";
      const body = typeof item.body === "string" ? item.body : item.prompt ?? "";
      const severity =
        item.severity === "low" || item.severity === "med" || item.severity === "high"
          ? item.severity
          : undefined;
      const basedOnEvidenceIds = Array.isArray(item.basedOnEvidenceIds)
        ? item.basedOnEvidenceIds.filter((id: unknown): id is string => typeof id === "string")
        : undefined;

      return {
        id: item.id,
        kind: typeof kind === "string" ? kind : "Counterexample",
        title,
        body,
        severity,
        basedOnEvidenceIds,
        createdAt: typeof item.createdAt === "string" ? item.createdAt : nowIso(),
      } as ProvocationCard;
    });
}

function normalizeResponses(raw: any): Record<string, ProvocationResponse> {
  const legacy = raw?.decisions ?? {};
  const current = raw?.provocationResponses ?? {};
  const source =
    typeof current === "object" && current !== null && Object.keys(current).length > 0
      ? current
      : legacy;

  const out: Record<string, ProvocationResponse> = {};
  for (const [key, value] of Object.entries(source)) {
    const response = value as any;
    if (!response || typeof key !== "string") continue;
    const decision = response.decision ?? response.status;
    const rationale = response.rationale ?? response.reason;
    if (decision !== "accept" && decision !== "hold" && decision !== "reject") continue;
    if (typeof rationale !== "string" || rationale.trim().length === 0) continue;

    out[key] = {
      decision,
      rationale: rationale.trim(),
      respondedAt:
        typeof response.respondedAt === "string"
          ? response.respondedAt
          : typeof response.updatedAt === "string"
            ? response.updatedAt
            : nowIso(),
    };
  }
  return out;
}

function defaultTitleForMode(mode: Mode, activeFile?: string): string {
  const fileName = activeFile ? path.basename(activeFile) : "";
  if (mode === "bugfix") return fileName ? `Bugfix: ${fileName}` : "Bugfix Session";
  if (mode === "feature") return fileName ? `Feature: ${fileName}` : "Feature Session";
  if (mode === "refactor") return fileName ? `Refactor: ${fileName}` : "Refactor Session";
  if (mode === "learning") return fileName ? `Learning: ${fileName}` : "Learning Session";
  if (mode === "fast") return fileName ? `Fast: ${fileName}` : "Fast Session";
  return fileName ? `Session: ${fileName}` : "Standard Session";
}

function normalizeSession(raw: any): Session {
  const createdAt = typeof raw?.createdAt === "string" ? raw.createdAt : nowIso();
  const updatedAt = typeof raw?.updatedAt === "string" ? raw.updatedAt : createdAt;
  const context = {
    workspaceFolder:
      typeof raw?.context?.workspaceFolder === "string" ? raw.context.workspaceFolder : undefined,
    activeFile: typeof raw?.context?.activeFile === "string" ? raw.context.activeFile : undefined,
    selection: raw?.context?.selection,
  };
  const mode: Mode = isValidMode(raw?.mode) ? raw.mode : "standard";
  const title =
    typeof raw?.title === "string" && raw.title.trim().length > 0
      ? raw.title.trim()
      : defaultTitleForMode(mode, context.activeFile);

  const session: Session = {
    id: typeof raw?.id === "string" ? raw.id : newId(),
    title,
    mode,
    createdAt,
    updatedAt,
    archived: raw?.archived === true ? true : undefined,
    context,
    outline: {
      symptom: typeof raw?.outline?.symptom === "string" ? raw.outline.symptom : "",
      reproSteps: typeof raw?.outline?.reproSteps === "string" ? raw.outline.reproSteps : "",
      definitionOfDone:
        typeof raw?.outline?.definitionOfDone === "string" ? raw.outline.definitionOfDone : "",
      constraints: typeof raw?.outline?.constraints === "string" ? raw.outline.constraints : "",
      strategy: typeof raw?.outline?.strategy === "string" ? raw.outline.strategy : "",
      verificationPlan:
        typeof raw?.outline?.verificationPlan === "string" ? raw.outline.verificationPlan : "",
    },
    evidence: Array.isArray(raw?.evidence) ? (raw.evidence as EvidenceItem[]) : [],
    provocations: normalizeProvocations(raw),
    provocationResponses: normalizeResponses(raw),
    gate: {
      outlineReady: false,
      provocationReady: false,
      provocationRespondedCount: 0,
      provocationTotalCount: 0,
      canGeneratePatch: false,
      canExport: false,
    },
  };

  session.gate = computeGate(session);
  return session;
}

function normalizeStoreState(raw: any): SessionStoreState {
  if (!raw || typeof raw !== "object") {
    return { activeSessionId: null, sessionsById: {}, sessionOrder: [] };
  }

  const sessionsById: Record<string, Session> = {};
  const entries = Object.entries(raw.sessionsById ?? {});
  for (const [, value] of entries) {
    const session = normalizeSession(value);
    sessionsById[session.id] = session;
  }

  const sessionOrder: string[] = Array.isArray(raw.sessionOrder)
    ? raw.sessionOrder.filter((id: unknown): id is string => typeof id === "string")
    : [];
  const dedupedOrder: string[] = [...new Set(sessionOrder)].filter((id) => Boolean(sessionsById[id]));
  const missingIds = Object.keys(sessionsById).filter((id) => !dedupedOrder.includes(id));
  const mergedOrder: string[] = [...dedupedOrder, ...missingIds];

  const rawActiveSessionId = typeof raw.activeSessionId === "string" ? raw.activeSessionId : null;
  const activeSessionId =
    rawActiveSessionId && sessionsById[rawActiveSessionId]
      ? rawActiveSessionId
      : mergedOrder[0] ?? null;

  return {
    activeSessionId,
    sessionsById,
    sessionOrder: mergedOrder,
  };
}

function emptyState(): SessionStoreState {
  return { activeSessionId: null, sessionsById: {}, sessionOrder: [] };
}

export class SessionStore {
  private state: SessionStoreState = emptyState();
  private loaded = false;

  private readonly _onDidChangeSession = new vscode.EventEmitter<Session | null>();
  public readonly onDidChangeSession = this._onDidChangeSession.event;

  private readonly _onDidChangeSessionList = new vscode.EventEmitter<SessionMeta[]>();
  public readonly onDidChangeSessionList = this._onDidChangeSessionList.event;

  constructor(private readonly ctx: vscode.ExtensionContext) {}

  private get activeSession(): Session | null {
    const id = this.state.activeSessionId;
    return id ? this.state.sessionsById[id] ?? null : null;
  }

  private async persistState() {
    await this.ctx.workspaceState.update(SESSION_STORE_KEY, this.state);
  }

  private emitSession() {
    this._onDidChangeSession.fire(this.activeSession);
  }

  private emitSessionList() {
    this._onDidChangeSessionList.fire(this.listSessions({ includeArchived: true }));
  }

  private async ensureLoaded() {
    if (!this.loaded) {
      await this.load();
    }
  }

  private bumpOrder(sessionId: string) {
    this.state.sessionOrder = [sessionId, ...this.state.sessionOrder.filter((id) => id !== sessionId)];
  }

  private updateSessionInternal(sessionId: string, patch: Partial<Session>, touchUpdatedAt = true): Session {
    const current = this.state.sessionsById[sessionId];
    if (!current) {
      throw new Error(`Unknown session: ${sessionId}`);
    }

    const next: Session = {
      ...current,
      ...patch,
      context: patch.context ? { ...current.context, ...patch.context } : current.context,
      outline: patch.outline ? { ...current.outline, ...patch.outline } : current.outline,
      provocationResponses: patch.provocationResponses
        ? { ...current.provocationResponses, ...patch.provocationResponses }
        : current.provocationResponses,
      updatedAt: touchUpdatedAt ? nowIso() : current.updatedAt,
    };
    next.gate = computeGate(next);
    this.state.sessionsById[sessionId] = next;
    return next;
  }

  async load(): Promise<Session | null> {
    const current = this.ctx.workspaceState.get<any>(SESSION_STORE_KEY);
    if (current) {
      this.state = normalizeStoreState(current);
      this.loaded = true;
      await this.persistState();
      this.emitSessionList();
      this.emitSession();
      return this.activeSession;
    }

    // One-time migration from legacy single-session schema.
    const legacy = this.ctx.workspaceState.get<any>(LEGACY_SESSION_KEY);
    if (legacy) {
      const session = normalizeSession(legacy);
      this.state = {
        activeSessionId: session.id,
        sessionsById: { [session.id]: session },
        sessionOrder: [session.id],
      };
      this.loaded = true;
      await this.persistState();
      await this.ctx.workspaceState.update(LEGACY_SESSION_KEY, undefined);
      this.emitSessionList();
      this.emitSession();
      return this.activeSession;
    }

    this.state = emptyState();
    this.loaded = true;
    this.emitSessionList();
    this.emitSession();
    return null;
  }

  get(): Session | null {
    return this.activeSession;
  }

  getActiveSession(): Session | null {
    return this.activeSession;
  }

  getStateSnapshot(): SessionStoreState {
    return {
      activeSessionId: this.state.activeSessionId,
      sessionsById: { ...this.state.sessionsById },
      sessionOrder: [...this.state.sessionOrder],
    };
  }

  listSessions(options?: { includeArchived?: boolean }): SessionMeta[] {
    const includeArchived = options?.includeArchived ?? false;
    return this.state.sessionOrder
      .map((id) => this.state.sessionsById[id])
      .filter((session): session is Session => Boolean(session))
      .filter((session) => includeArchived || !session.archived)
      .map((session) => getSessionMeta(session));
  }

  async setActiveSession(sessionId: string): Promise<void> {
    await this.ensureLoaded();
    const session = this.state.sessionsById[sessionId];
    if (!session) {
      throw new Error("Session not found.");
    }
    if (session.archived) {
      throw new Error("Archived session cannot be active.");
    }

    this.state.activeSessionId = sessionId;
    this.bumpOrder(sessionId);
    this.updateSessionInternal(sessionId, {}, true);
    await this.persistState();
    this.emitSessionList();
    this.emitSession();
  }

  async createSession(mode: Mode = "standard", title?: string): Promise<string> {
    await this.ensureLoaded();
    const createdAt = nowIso();
    const context = getActiveContext();
    const id = newId();
    const resolvedTitle =
      typeof title === "string" && title.trim().length > 0
        ? title.trim()
        : defaultTitleForMode(mode, context.activeFile);

    const session: Session = {
      id,
      title: resolvedTitle,
      mode,
      createdAt,
      updatedAt: createdAt,
      context,
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
      provocationResponses: {},
      gate: {
        outlineReady: false,
        provocationReady: false,
        provocationRespondedCount: 0,
        provocationTotalCount: 0,
        canGeneratePatch: false,
        canExport: false,
      },
      archived: undefined,
    };
    session.gate = computeGate(session);

    this.state.sessionsById[id] = session;
    this.state.activeSessionId = id;
    this.bumpOrder(id);

    await this.persistState();
    this.emitSessionList();
    this.emitSession();
    return id;
  }

  async renameSession(sessionId: string, newTitle: string): Promise<void> {
    await this.ensureLoaded();
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    this.updateSessionInternal(sessionId, { title: trimmed }, true);
    this.bumpOrder(sessionId);
    await this.persistState();
    this.emitSessionList();
    this.emitSession();
  }

  async archiveSession(sessionId: string): Promise<void> {
    await this.ensureLoaded();
    this.updateSessionInternal(sessionId, { archived: true }, true);

    if (this.state.activeSessionId === sessionId) {
      const nextActive = this.state.sessionOrder.find((id) => {
        const session = this.state.sessionsById[id];
        return session && !session.archived && id !== sessionId;
      });
      this.state.activeSessionId = nextActive ?? null;
    }

    await this.persistState();
    this.emitSessionList();
    this.emitSession();
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.ensureLoaded();
    delete this.state.sessionsById[sessionId];
    this.state.sessionOrder = this.state.sessionOrder.filter((id) => id !== sessionId);

    if (this.state.activeSessionId === sessionId) {
      const nextActive = this.state.sessionOrder.find((id) => {
        const session = this.state.sessionsById[id];
        return session && !session.archived;
      });
      this.state.activeSessionId = nextActive ?? null;
    }

    await this.persistState();
    this.emitSessionList();
    this.emitSession();
  }

  async touchSessionUpdatedAt(sessionId: string): Promise<void> {
    await this.ensureLoaded();
    this.updateSessionInternal(sessionId, {}, true);
    this.bumpOrder(sessionId);
    await this.persistState();
    this.emitSessionList();
    if (this.state.activeSessionId === sessionId) {
      this.emitSession();
    }
  }

  async updateSession(sessionId: string, patch: Partial<Session>): Promise<Session> {
    await this.ensureLoaded();
    const next = this.updateSessionInternal(sessionId, patch, true);
    this.bumpOrder(sessionId);
    await this.persistState();
    this.emitSessionList();
    if (this.state.activeSessionId === sessionId) {
      this.emitSession();
    }
    return next;
  }

  async updateActiveSession(patch: Partial<Session>): Promise<Session> {
    await this.ensureLoaded();
    const activeId = this.state.activeSessionId;
    if (!activeId) {
      const createdId = await this.createSession("standard");
      return this.state.sessionsById[createdId];
    }
    return this.updateSession(activeId, patch);
  }

  // Compatibility API for existing callers.
  async create(mode: Mode = "standard"): Promise<Session> {
    const id = await this.createSession(mode);
    return this.state.sessionsById[id];
  }

  // Compatibility API for existing callers.
  async update(patch: Partial<Session>): Promise<Session> {
    return this.updateActiveSession(patch);
  }

  async clear(): Promise<void> {
    this.state = emptyState();
    this.loaded = true;
    await this.persistState();
    this.emitSessionList();
    this.emitSession();
  }

  async setProvocations(cards: ProvocationCard[]): Promise<Session> {
    const current = this.activeSession ?? (await this.create("standard"));
    const nextResponses: Record<string, ProvocationResponse> = {};
    for (const card of cards) {
      const existing = current.provocationResponses[card.id];
      if (existing) {
        nextResponses[card.id] = existing;
      }
    }

    return this.updateActiveSession({
      provocations: cards,
      provocationResponses: nextResponses,
    });
  }

  async upsertProvocationResponse(
    cardId: string,
    decision: ProvocationDecision,
    rationale: string
  ): Promise<Session> {
    const current = this.activeSession ?? (await this.create("standard"));
    const exists = current.provocations.some((card) => card.id === cardId);
    if (!exists) {
      throw new Error("Unknown provocation card.");
    }

    const trimmed = rationale.trim();
    if (trimmed.length === 0) {
      throw new Error("Rationale is required.");
    }

    return this.updateActiveSession({
      provocationResponses: {
        [cardId]: {
          decision,
          rationale: trimmed,
          respondedAt: nowIso(),
        },
      },
    });
  }

  async addEvidence(items: EvidenceItem | EvidenceItem[]): Promise<void> {
    const current = this.activeSession ?? (await this.create("standard"));
    const newItems = Array.isArray(items) ? items : [items];

    await this.updateActiveSession({
      evidence: [...(current.evidence ?? []), ...newItems],
    });
  }

  async removeEvidence(evidenceId: string): Promise<void> {
    const session = this.activeSession;
    if (!session) return;

    const next = (session.evidence ?? []).filter((e) => e.id !== evidenceId);
    await this.updateActiveSession({ evidence: next });
  }

  async updateEvidenceWhy(evidenceId: string, whyIncluded: string): Promise<void> {
    const session = this.activeSession;
    if (!session) return;

    const next = (session.evidence ?? []).map((e) => (e.id === evidenceId ? { ...e, whyIncluded } : e));
    await this.updateActiveSession({ evidence: next });
  }
}
