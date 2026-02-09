// src/state/types.ts

export type Mode =
  | "bugfix"
  | "feature"
  | "refactor"
  | "standard"
  | "learning"
  | "fast";

export interface Outline {
  symptom?: string;            // 버그 모드일 때(선택)
  reproSteps?: string;         // 선택
  definitionOfDone: string;    // 필수
  constraints: string;         // 필수
  strategy?: string;           // 선택
  verificationPlan: string;    // 필수
}

export type EvidenceType =
  | "file"
  | "symbol"
  | "selection"
  | "diagnostic"
  | "testLog"
  | "diff"
  | "link";

export type EvidenceSource = "user" | "auto" | "ai";

export interface EvidenceItem {
  id: string;
  type: EvidenceType;
  title: string;
  ref: string;           // file path / url / symbol name 등
  snippet?: string;      // optional short context
  whyIncluded: string;   // “포함 이유” (중요)
  createdAt: string;     // ISO string
  source?: EvidenceSource;
}

export type ProvocationKind =
  | "Counterexample"
  | "Hidden Assumption"
  | "Trade-off"
  | "Security"
  | "Performance"
  | "Test Gap";

export type Severity = "low" | "med" | "high";

export interface ProvocationCard {
  id: string;
  kind: ProvocationKind;
  title: string;
  body: string;
  severity?: Severity;
  basedOnEvidenceIds?: string[];
  createdAt: string;
}

export type ProvocationDecision = "accept" | "hold" | "reject";

export interface ProvocationResponse {
  decision: ProvocationDecision;
  rationale: string;
  respondedAt: string;
}

export interface GateStatus {
  outlineReady: boolean;
  provocationReady: boolean;
  provocationRespondedCount: number;
  provocationTotalCount: number;
  canGeneratePatch: boolean;
  canExport: boolean;
}

export interface SessionContext {
  workspaceFolder?: string;
  activeFile?: string;
  selection?: {
    startLine: number;
    startCharacter: number;
    endLine: number;
    endCharacter: number;
  };
}

export interface Session {
  id: string;
  title: string;
  mode: Mode;

  createdAt: string;
  updatedAt: string;

  context: SessionContext;

  outline: Outline;
  evidence: EvidenceItem[];
  provocations: ProvocationCard[];
  provocationResponses: Record<string, ProvocationResponse>; // key = cardId

  gate: GateStatus;
  archived?: boolean;
}

export interface SessionMeta {
  id: string;
  title: string;
  mode: Mode;
  createdAt: string;
  updatedAt: string;
  archived?: boolean;
  evidenceCount: number;
  provocationTotal: number;
  provocationResponded: number;
  outlineReady: boolean;
  provocationReady: boolean;
}

export interface SessionStoreState {
  activeSessionId: string | null;
  sessionsById: Record<string, Session>;
  sessionOrder: string[];
}
