import * as vscode from "vscode";
import { OllamaProvider, ChatMessage } from "../../ai/OllamaProvider";
import { ensureOllamaModelReady } from "../../ai/ensureOllamaSetup";
import { SessionStore } from "../../state/sessionStore";
import { ProvocationCard, ProvocationKind, Severity } from "../../state/types";

const ALLOWED_KINDS: readonly ProvocationKind[] = [
  "Counterexample",
  "Hidden Assumption",
  "Trade-off",
  "Security",
  "Performance",
  "Test Gap",
];

const ALLOWED_SEVERITIES: readonly Severity[] = ["low", "med", "high"];

function newCardId(index: number): string {
  return `prov_ai_${Date.now().toString(36)}_${index}`;
}

function normalizeKind(input: unknown): ProvocationKind {
  if (typeof input !== "string") return "Counterexample";
  return (ALLOWED_KINDS as readonly string[]).includes(input) ? (input as ProvocationKind) : "Counterexample";
}

function normalizeSeverity(input: unknown): Severity {
  if (typeof input !== "string") return "med";
  return (ALLOWED_SEVERITIES as readonly string[]).includes(input) ? (input as Severity) : "med";
}

function parseJsonObject(text: string): any {
  try {
    return JSON.parse(text);
  } catch {}

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {}
  }

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const candidate = text.slice(firstBrace, lastBrace + 1);
    return JSON.parse(candidate);
  }

  throw new Error("Model output is not valid JSON.");
}

function toCards(raw: any, evidenceIds: string[]): ProvocationCard[] {
  const items: any[] = Array.isArray(raw?.cards) ? raw.cards : [];
  if (items.length === 0) {
    throw new Error("No cards in model output.");
  }

  const now = new Date().toISOString();
  const cards: ProvocationCard[] = items.slice(0, 7).map((item, idx) => {
    const title = typeof item?.title === "string" ? item.title.trim() : "";
    const body = typeof item?.body === "string" ? item.body.trim() : "";
    if (!title || !body) {
      throw new Error(`Card ${idx + 1} is missing title/body.`);
    }

    return {
      id: newCardId(idx + 1),
      kind: normalizeKind(item?.kind),
      title,
      body,
      severity: normalizeSeverity(item?.severity),
      basedOnEvidenceIds: evidenceIds,
      createdAt: now,
    };
  });

  return cards;
}

// 실제 Provocation 생성 위치 
export async function generateProvocationsAI(store: SessionStore) {
  const cfg = vscode.workspace.getConfiguration("ground");
  const baseUrl = cfg.get<string>("ollama.baseUrl", "http://localhost:11434");
  const model = cfg.get<string>("ollama.model", "qwen2.5-coder:3b");

  const ollama = new OllamaProvider({ baseUrl, model });

  const ready = await ensureOllamaModelReady(baseUrl, model);
  if (!ready) {
    return;
  }

  // 활성 세션 가져오기 
  const session = store.get() ?? (await store.create("standard"));
  const evidence = session.evidence ?? [];
  const evidenceIds = evidence.slice(0, 3).map((item) => item.id);
  const evidenceSummary = evidence
    .slice(0, 5)
    .map((item, idx) => `${idx + 1}. [${item.type}] ${item.title} :: ${item.whyIncluded}`)
    .join("\n");

  const outline = session.outline;
  const contextText = [
    `definitionOfDone: ${outline.definitionOfDone || "(empty)"}`,
    `constraints: ${outline.constraints || "(empty)"}`,
    `verificationPlan: ${outline.verificationPlan || "(empty)"}`,
    evidenceSummary ? `evidence:\n${evidenceSummary}` : "evidence: (none)",
  ].join("\n");

  // AI 에게 전달할 프롬포트 생성
  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        'You generate provocation cards for engineering review.\nReturn JSON only in this schema: {"cards":[{"kind":"Counterexample|Hidden Assumption|Trade-off|Security|Performance|Test Gap","title":"string","body":"string","severity":"low|med|high"}]}.\nConstraints: exactly 5 cards, concise but specific, no markdown, no prose outside JSON.'
    },
    {
      role: "user",
      content: `Generate provocation cards from this session context:\n${contextText}`,
    },
  ];

  try {
    const rawText = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Ground: Generating provocations...",
        cancellable: false,
      },
      async () => ollama.chatOnce(messages) // Ollama 호출 부분
    );

    const json = parseJsonObject(rawText);
    const cards = toCards(json, evidenceIds);
    await store.setProvocations(cards);
    vscode.window.showInformationMessage(`Ground: Generated ${cards.length} provocation cards with ${model}.`);
  } catch (e: any) {
    vscode.window.showErrorMessage(`Ground: AI request failed. ${String(e?.message ?? e)}`);
  }
}
