// src/state/types.ts

export type Mode = "learning" | "standard" | "fast";

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

export interface EvidenceItem {
  id: string;
  type: EvidenceType;
  title: string;
  ref: string;           // file path / url / symbol name 등
  snippet?: string;      // optional short context
  whyIncluded: string;   // “포함 이유” (중요)
  createdAt: string;     // ISO string
}

export type ProvocationType =
  | "Counterexample"
  | "HiddenAssumption"
  | "Tradeoff"
  | "Security"
  | "Performance"
  | "TestGap";

export type Severity = "low" | "med" | "high";

export interface ProvocationCard {
  id: string;
  type: ProvocationType;
  severity: Severity;
  prompt: string;
  basedOnEvidenceIds: string[];
  suggestedChecks: string[];
  createdAt: string;
}

export type DecisionStatus = "accept" | "reject" | "hold";

export interface Decision {
  cardId: string;
  status: DecisionStatus;
  reason: string;
  updatedAt: string;
}

export interface GateStatus {
  outlineReady: boolean;
  provocationRespondedCount: number;
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
  mode: Mode;

  createdAt: string;
  updatedAt: string;

  context: SessionContext;

  outline: Outline;
  evidence: EvidenceItem[];
  provocations: ProvocationCard[];
  decisions: Record<string, Decision>; // key = cardId

  gate: GateStatus;
}
