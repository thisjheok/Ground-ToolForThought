import * as vscode from "vscode";
import { ChatMessage, OllamaProvider } from "../../ai/OllamaProvider";
import { ensureOllamaModelReady } from "../../ai/ensureOllamaSetup";
import { SessionStore } from "../../state/sessionStore";
import {
  EvidenceInsightCard,
  EvidenceSuggestion,
  EvidenceSuggestionAction,
  InsightKind,
} from "../../state/types";

const INSIGHT_KINDS: readonly InsightKind[] = [
  "Implementation",
  "Risk",
  "Test",
  "Performance",
  "Security",
  "Search",
];

const SUGGESTION_ACTIONS: readonly EvidenceSuggestionAction[] = [
  "addActiveFile",
  "addSelection",
  "addDiagnostics",
  "ingestTestLog",
];

function newId(prefix: string, index: number): string {
  return `${prefix}_${Date.now().toString(36)}_${index}`;
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
    return JSON.parse(text.slice(firstBrace, lastBrace + 1));
  }

  throw new Error("Model output is not valid JSON.");
}

function normalizeInsightKind(input: unknown): InsightKind {
  if (typeof input !== "string") return "Implementation";
  return (INSIGHT_KINDS as readonly string[]).includes(input)
    ? (input as InsightKind)
    : "Implementation";
}

function normalizeSuggestionAction(input: unknown): EvidenceSuggestionAction {
  if (typeof input !== "string") return "addDiagnostics";
  return (SUGGESTION_ACTIONS as readonly string[]).includes(input)
    ? (input as EvidenceSuggestionAction)
    : "addDiagnostics";
}

function parseInsights(raw: any): { insights: EvidenceInsightCard[]; suggestions: EvidenceSuggestion[] } {
  const now = new Date().toISOString();
  const cards = Array.isArray(raw?.insights) ? raw.insights : [];
  if (cards.length === 0) {
    throw new Error("No insights returned by model.");
  }

  const insights: EvidenceInsightCard[] = cards.slice(0, 12).map((item: any, idx: number) => {
    const title = typeof item?.title === "string" ? item.title.trim() : "";
    const body = typeof item?.body === "string" ? item.body.trim() : "";
    if (!title || !body) {
      throw new Error(`Insight ${idx + 1} is missing title/body.`);
    }

    return {
      id: newId("ins", idx + 1),
      kind: normalizeInsightKind(item?.kind),
      title,
      body,
      queries: Array.isArray(item?.queries)
        ? item.queries.filter((q: unknown): q is string => typeof q === "string").slice(0, 6)
        : undefined,
      createdAt: now,
    };
  });

  const suggestionsRaw = Array.isArray(raw?.suggestedRawEvidence)
    ? raw.suggestedRawEvidence
    : [];
  const suggestions: EvidenceSuggestion[] = suggestionsRaw.slice(0, 6).map((item: any, idx: number) => {
    const title = typeof item?.title === "string" ? item.title.trim() : "";
    const reason = typeof item?.reason === "string" ? item.reason.trim() : "";
    return {
      id: newId("sug", idx + 1),
      action: normalizeSuggestionAction(item?.action),
      title: title || "Suggested raw evidence",
      reason: reason || "Additional context may be needed for higher confidence.",
      createdAt: now,
    };
  });

  return { insights, suggestions };
}

export async function generateEvidenceInsightsAI(store: SessionStore) {
  const cfg = vscode.workspace.getConfiguration("ground");
  const baseUrl = cfg.get<string>("ollama.baseUrl", "http://localhost:11434");
  const model = cfg.get<string>("ollama.model", "qwen2.5-coder:3b");
  const ollama = new OllamaProvider({ baseUrl, model });

  const ready = await ensureOllamaModelReady(baseUrl, model);
  if (!ready) {
    return;
  }

  const session = store.get() ?? (await store.create("standard"));
  const outline = session.outline;
  const evidence = session.evidence ?? [];

  const evidenceSummary = evidence
    .slice(0, 15)
    .map((item, idx) => {
      const snippet = item.snippet ? ` | snippet: ${item.snippet.slice(0, 200)}` : "";
      return `${idx + 1}. [${item.type}/${item.source ?? "user"}] ${item.title} | ${item.ref}${snippet}`;
    })
    .join("\n");

  const contextText = [
    `definitionOfDone: ${outline.definitionOfDone || "(empty)"}`,
    `constraints: ${outline.constraints || "(empty)"}`,
    `verificationPlan: ${outline.verificationPlan || "(empty)"}`,
    `rawEvidenceCount: ${evidence.length}`,
    evidenceSummary ? `rawEvidence:\n${evidenceSummary}` : "rawEvidence: (none)",
  ].join("\n");

  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        'You are generating AI Evidence Insights for a coding session.\nReturn JSON only with schema: {"insights":[{"kind":"Implementation|Risk|Test|Performance|Security|Search","title":"string","body":"string","queries":["string"]}],"suggestedRawEvidence":[{"action":"addActiveFile|addSelection|addDiagnostics|ingestTestLog","title":"string","reason":"string"}]}.\nRules: 6-8 insights, concise and actionable, grounded in provided outline/evidence, include search queries when useful.',
    },
    {
      role: "user",
      content: `Generate Evidence Insights from this session:\n${contextText}`,
    },
  ];

  try {
    const rawText = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Ground: Generating AI Evidence Insights...",
        cancellable: false,
      },
      async () => ollama.chatOnce(messages)
    );

    const json = parseJsonObject(rawText);
    const { insights, suggestions } = parseInsights(json);
    await store.setEvidenceInsights(insights, suggestions);
    vscode.window.showInformationMessage(
      `Ground: Generated ${insights.length} insights and ${suggestions.length} raw evidence suggestions.`
    );
  } catch (e: any) {
    vscode.window.showErrorMessage(`Ground: AI insights failed. ${String(e?.message ?? e)}`);
  }
}
