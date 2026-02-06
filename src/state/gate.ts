// src/state/gate.ts

import { Mode, Session } from "./types";

function hasText(s?: string): boolean {
  return typeof s === "string" && s.trim().length > 0;
}

function countDecisionsWithReason(session: Session, minReasonLen: number): number {
  return Object.values(session.decisions).filter((d) => {
    return hasText(d.status) && hasText(d.reason) && d.reason.trim().length >= minReasonLen;
  }).length;
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

  // provocation 응답 조건
  const minReasonLen = mode === "learning" ? 20 : mode === "standard" ? 10 : 5;
  const respondedCount = countDecisionsWithReason(session, minReasonLen);

  const minCards =
    mode === "learning" ? 2 :
    mode === "standard" ? 1 :
    1;

  const provocationReady = respondedCount >= minCards;

  // MVP에서는 patch 생성은 아직 잠금
  const canGeneratePatch = false;

  // Export는 outlineReady만으로도 가능하게 두되(팀 문화 정착), 원하면 provocationReady까지 묶을 수 있음
  const canExport = outlineReady && provocationReady;

  return {
    outlineReady,
    provocationRespondedCount: respondedCount,
    canGeneratePatch,
    canExport,
  };
}
