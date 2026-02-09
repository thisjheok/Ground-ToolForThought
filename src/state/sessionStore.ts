import * as vscode from "vscode";
import { computeGate } from "./gate";
import {
  Mode,
  ProvocationCard,
  ProvocationDecision,
  ProvocationResponse,
  Session,
} from "./types";
import { EvidenceItem } from "./types";

const SESSION_KEY = "tft.session.v1";

function nowIso(): string {
  return new Date().toISOString();
}

function newId(prefix = "sess"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
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

function normalizeProvocations(raw: any): ProvocationCard[] {
  const items: any[] = Array.isArray(raw?.provocations) ? raw.provocations : [];
  return items
    .filter((item) => typeof item?.id === "string")
    .map((item) => {
      const kind = typeof item.kind === "string" ? item.kind : item.type;
      const title = typeof item.title === "string" ? item.title : item.type ?? "Provocation";
      const body = typeof item.body === "string" ? item.body : item.prompt ?? "";
      const severity = item.severity === "low" || item.severity === "med" || item.severity === "high"
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
  const source = typeof current === "object" && current !== null && Object.keys(current).length > 0
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

function normalizeSession(raw: any): Session {
  const createdAt = typeof raw?.createdAt === "string" ? raw.createdAt : nowIso();
  const updatedAt = typeof raw?.updatedAt === "string" ? raw.updatedAt : createdAt;

  const session: Session = {
    id: typeof raw?.id === "string" ? raw.id : newId(),
    mode:
      raw?.mode === "learning" || raw?.mode === "standard" || raw?.mode === "fast"
        ? raw.mode
        : "standard",
    createdAt,
    updatedAt,
    context: {
      workspaceFolder:
        typeof raw?.context?.workspaceFolder === "string" ? raw.context.workspaceFolder : undefined,
      activeFile: typeof raw?.context?.activeFile === "string" ? raw.context.activeFile : undefined,
      selection: raw?.context?.selection,
    },
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

export class SessionStore {
  private session: Session | null = null;

  private readonly _onDidChangeSession = new vscode.EventEmitter<Session | null>();
  public readonly onDidChangeSession = this._onDidChangeSession.event;

  constructor(private readonly ctx: vscode.ExtensionContext) {}

  private emit() {
    this._onDidChangeSession.fire(this.session);
  }

  async load(): Promise<Session | null> {
    const raw = this.ctx.workspaceState.get<any>(SESSION_KEY);
    if (!raw) {
      this.session = null;
      return null;
    }

    const normalized = normalizeSession(raw);
    this.session = normalized;
    await this.ctx.workspaceState.update(SESSION_KEY, normalized);
    this.emit();
    return normalized;
  }

  get(): Session | null {
    return this.session;
  }

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
      provocationResponses: {},
      gate: {
        outlineReady: false,
        provocationReady: false,
        provocationRespondedCount: 0,
        provocationTotalCount: 0,
        canGeneratePatch: false,
        canExport: false,
      },
    };

    s.gate = computeGate(s);

    await this.ctx.workspaceState.update(SESSION_KEY, s);
    this.session = s;
    this.emit();
    return s;
  }

  async update(patch: Partial<Session>): Promise<Session> {
    const current = this.session ?? (await this.load());
    if (!current) {
      return this.create("standard");
    }

    const next: Session = {
      ...current,
      ...patch,
      context: patch.context ? { ...current.context, ...patch.context } : current.context,
      outline: patch.outline ? { ...current.outline, ...patch.outline } : current.outline,
      provocationResponses: patch.provocationResponses
        ? { ...current.provocationResponses, ...patch.provocationResponses }
        : current.provocationResponses,
      updatedAt: nowIso(),
    };

    next.gate = computeGate(next);

    await this.ctx.workspaceState.update(SESSION_KEY, next);
    this.session = next;
    this.emit();
    return next;
  }

  async clear(): Promise<void> {
    await this.ctx.workspaceState.update(SESSION_KEY, undefined);
    this.session = null;
    this.emit();
  }

  async setProvocations(cards: ProvocationCard[]): Promise<Session> {
    const current = this.session ?? (await this.load()) ?? (await this.create("standard"));
    const nextResponses: Record<string, ProvocationResponse> = {};
    for (const card of cards) {
      const existing = current.provocationResponses[card.id];
      if (existing) {
        nextResponses[card.id] = existing;
      }
    }

    return this.update({
      provocations: cards,
      provocationResponses: nextResponses,
    });
  }

  async upsertProvocationResponse(
    cardId: string,
    decision: ProvocationDecision,
    rationale: string
  ): Promise<Session> {
    const current = this.session ?? (await this.load()) ?? (await this.create("standard"));
    const exists = current.provocations.some((card) => card.id === cardId);
    if (!exists) {
      throw new Error("Unknown provocation card.");
    }

    const trimmed = rationale.trim();
    if (trimmed.length === 0) {
      throw new Error("Rationale is required.");
    }

    return this.update({
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
    const current = this.session ?? (await this.load());
    if (!current) {
      await this.create("standard");
    }
    const s = this.session!;
    const newItems = Array.isArray(items) ? items : [items];

    await this.update({
      evidence: [...(s.evidence ?? []), ...newItems],
    });
  }

  async removeEvidence(evidenceId: string): Promise<void> {
    const s = this.session ?? (await this.load());
    if (!s) return;

    const next = (s.evidence ?? []).filter((e) => e.id !== evidenceId);
    await this.update({ evidence: next });
  }

  async updateEvidenceWhy(evidenceId: string, whyIncluded: string): Promise<void> {
    const s = this.session ?? (await this.load());
    if (!s) return;

    const next = (s.evidence ?? []).map((e) => (e.id === evidenceId ? { ...e, whyIncluded } : e));
    await this.update({ evidence: next });
  }
}
