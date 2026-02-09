import * as vscode from "vscode";
import { SessionStore } from "../../state/sessionStore";
import { ProvocationCard } from "../../state/types";

function newCardId(index: number): string {
  return `prov_${Date.now().toString(36)}_${index}`;
}

function buildCards(store: SessionStore): ProvocationCard[] {
  const session = store.get();
  const outline = session?.outline;
  const evidence = session?.evidence ?? [];
  const evidenceIds = evidence.slice(0, 2).map((item) => item.id);

  const dod = outline?.definitionOfDone?.trim() || "the current plan";
  const constraints = outline?.constraints?.trim() || "stated constraints";
  const verification = outline?.verificationPlan?.trim() || "the verification plan";
  const firstEvidence = evidence[0]?.title || "current evidence";

  const now = new Date().toISOString();

  return [
    {
      id: newCardId(1),
      kind: "Counterexample",
      title: "Counterexample for success criteria",
      body: `What scenario would make "${dod}" appear successful while still violating user intent?`,
      severity: "high",
      createdAt: now,
      basedOnEvidenceIds: evidenceIds,
    },
    {
      id: newCardId(2),
      kind: "Hidden Assumption",
      title: "Assumption audit",
      body: `Which hidden assumption in "${constraints}" could break when input or scale changes?`,
      severity: "med",
      createdAt: now,
      basedOnEvidenceIds: evidenceIds,
    },
    {
      id: newCardId(3),
      kind: "Trade-off",
      title: "Trade-off checkpoint",
      body: `If we optimize for this approach, what do we deliberately give up, and is that acceptable now?`,
      severity: "med",
      createdAt: now,
      basedOnEvidenceIds: evidenceIds,
    },
    {
      id: newCardId(4),
      kind: "Test Gap",
      title: "Test gap against verification",
      body: `Which failure path is not covered by "${verification}" and should be tested first?`,
      severity: "high",
      createdAt: now,
      basedOnEvidenceIds: evidenceIds,
    },
    {
      id: newCardId(5),
      kind: "Security",
      title: "Security and misuse check",
      body: `Could user-controlled input, secrets, or permissions around "${firstEvidence}" create an exploit path?`,
      severity: "high",
      createdAt: now,
      basedOnEvidenceIds: evidenceIds,
    },
  ];
}

export async function generateProvocationsMock(store: SessionStore) {
  if (!store.get()) {
    await store.create("standard");
  }

  const cards = buildCards(store);
  await store.setProvocations(cards);

  vscode.window.showInformationMessage(`Generated ${cards.length} provocation cards.`);
}
