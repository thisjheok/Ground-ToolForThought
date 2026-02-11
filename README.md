# Ground

Ground는 VS Code 안에서 동작하는 `Tool for Thought` 확장입니다.  
핵심 목적은 "AI에게 바로 코드 생성을 맡기기"보다, 개발자가 근거와 검증 계획을 먼저 정리하고 판단하도록 돕는 것입니다.

## 철학

`design_plan.md` 기준으로 Ground는 다음 3가지를 중심에 둡니다.

1. `Evidence-first`
코드/진단/테스트 로그 같은 근거를 먼저 모은 뒤 판단합니다.

2. `Productive Friction`
바로 구현으로 뛰어들지 않고, Provocation 질문에 응답하며 가정/리스크를 드러냅니다.

3. `Metacognition Scaffolding`
`Definition of Done`, `Constraints`, `Verification Plan`을 명시적으로 작성하게 만들어 사고 과정을 구조화합니다.

Ground는 "자동 코딩 에이전트"라기보다, "근거 기반 사고를 유도하는 개발 워크플로우 도구"에 가깝습니다.

## 프로젝트 소개 (배경)

최근 IDE 보조 AI는 생산성을 높이지만, 문제 정의/검증 이전에 구현부터 시작하는 흐름을 강화하기 쉽습니다.  
Ground는 이 지점을 개선하기 위해 시작되었습니다.

- 세션 단위로 작업 맥락을 분리합니다.
- 증거(Evidence)와 이유(`whyIncluded`)를 남깁니다.
- Provocation 카드에 `accept/hold/reject + rationale`을 기록하게 합니다.
- Outline 게이트와 Provocation 게이트를 통과해야 "준비됨(ready)" 상태가 됩니다.

즉, 결과물보다 "생각의 과정"을 남기는 것을 중요한 품질 기준으로 둡니다.

## 핵심 개념과 기능

### 1) Session

작업의 기본 단위입니다.

- 모드: `bugfix`, `feature`, `refactor`, `standard`, `learning`, `fast`
- 상태 저장: 세션 목록/순서/활성 세션이 로컬 workspace state에 저장됩니다.
- 관리 기능: 생성, 전환, 이름 변경, 아카이브, 히스토리 조회

주요 명령:
- `Tool for Thought: Start Session`
- `Tool for Thought: Session - New`
- `Tool for Thought: Session - Switch`
- `Tool for Thought: Session - Rename Active`
- `Tool for Thought: Session - Archive Active`
- `Tool for Thought: Session - Show History`

### 2) Outline

문제 해결의 설계 요약입니다.

- 필수 입력:
  - `Definition of Done`
  - `Constraints`
  - `Verification Plan`
- 게이트:
  - 기본 모드: 위 3개가 모두 채워져야 `outlineReady = true`
  - `fast` 모드: `Definition of Done + Verification Plan`으로 완화

### 3) Evidence

판단의 근거를 모으는 영역입니다.

- Raw evidence 타입:
  - `file`, `selection`, `diagnostic`, `testLog`, `diff`, `symbol`, `link`, `insight`
- 각 항목은 `whyIncluded`를 포함합니다.
- 수집 기능:
  - `Build Evidence Pack` (활성 파일/선택 영역/진단 자동 수집)
  - `Add from Selection`
  - `Add Active File`
  - `Add Diagnostics`
  - `Ingest Test Log` (로그 붙여넣기)
- AI 기능:
  - `Generate AI Insights` (insight 카드 + 추가 evidence 제안 생성)

### 4) Provocation

생산적인 반론/점검 질문 카드입니다.

- 카드 종류:
  - `Counterexample`, `Hidden Assumption`, `Trade-off`, `Security`, `Performance`, `Test Gap`
- 생성:
  - `Generate Provocations` (Ollama 기반 AI)
  - `Generate Mock Cards` (테스트/데모용)
- 응답:
  - 각 카드에 `accept/hold/reject` + `rationale` 저장 필수
- 게이트:
  - 모든 카드에 응답해야 `provocationReady = true`

## 사용 방법 (권장 워크플로우)

1. `Tool for Thought` 사이드바에서 세션을 시작합니다.
2. `Outline` 뷰에서 필수 3항목을 작성합니다.
3. `Evidence` 뷰에서 `Build Evidence Pack` 또는 수동 수집 명령으로 근거를 채웁니다.
4. 필요하면 `Generate AI Insights`로 추가 점검 포인트를 받습니다.
5. `Provocations` 뷰에서 카드 생성 후 각 카드에 응답을 남깁니다.
6. Session History에서 세션 전환/아카이브로 흐름을 관리합니다.

## 설치 요건

- `VS Code` 1.108 이상
- `Node.js` + `npm` (개발/빌드용)
- 로컬 AI 기능 사용 시 `Ollama` 설치 필수

AI 기능(`Generate AI Insights`, `Generate Provocations AI`)은 Ollama가 없으면 동작하지 않습니다.

## 설치 및 실행 방법

### 개발 환경에서 실행

1. 의존성 설치
```bash
npm install
```

2. 빌드
```bash
npm run compile
```

3. VS Code에서 `F5`로 Extension Development Host 실행

### 설정 (Ollama)

확장은 아래 설정을 사용합니다.

- `ground.ollama.baseUrl` (기본값: `http://localhost:11434`)
- `ground.ollama.model` (기본값: `qwen2.5-coder:3b`)

필수 준비:

1. Ollama 설치: <https://ollama.com/download>  
2. 모델 다운로드:
```bash
ollama pull qwen2.5-coder:3b
```
3. Ollama 서버 실행 상태 확인 후 VS Code에서 명령 재실행
