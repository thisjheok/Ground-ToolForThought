// src/state/gate.ts

import { Mode, Session } from "./types";

function hasText(s?: string): boolean {
  return typeof s === "string" && s.trim().length > 0;
}

function hasValidResponse(session: Session, cardId: string): boolean {
  const response = session.provocationResponses[cardId];
  return Boolean(
    response &&
      hasText(response.decision) &&
      hasText(response.rationale) &&
      response.rationale.trim().length > 0
  );
}

/**
 * Gate rules (MVP):
 * - outlineReady: DoD + constraints + verificationPlan 필수
 * - provocation responded: 카드 1개 이상에 status + reason 기록
 * - mode에 따라 요구치 완화/강화 가능
 */
export function computeGate(session: Session): Session["gate"] {
  const { outline, mode } = session;

  // 기본 outline 필수
  const outlineReadyBase =
    hasText(outline.definitionOfDone) &&
    hasText(outline.constraints) &&
    hasText(outline.verificationPlan);

  // 모드별 완화(원하면 나중에 조정)
  let outlineReady = outlineReadyBase;

  if (mode === "fast") {
    // fast에서는 constraints를 선택으로 완화하고 싶으면 이렇게 바꿀 수 있음
    outlineReady =
      hasText(outline.definitionOfDone) && hasText(outline.verificationPlan);
  }

  const totalCards = session.provocations.length;
  const respondedCount = session.provocations.reduce((count, card) => {
    return count + (hasValidResponse(session, card.id) ? 1 : 0);
  }, 0);
  const provocationReady = totalCards > 0 && respondedCount === totalCards;

  // MVP에서는 patch 생성은 아직 잠금
  const canGeneratePatch = false;

  // Export는 outlineReady만으로도 가능하게 두되(팀 문화 정착), 원하면 provocationReady까지 묶을 수 있음
  const canExport = outlineReady && provocationReady;

  return {
    outlineReady,
    provocationReady,
    provocationRespondedCount: respondedCount,
    provocationTotalCount: totalCards,
    canGeneratePatch,
    canExport,
  };
}
