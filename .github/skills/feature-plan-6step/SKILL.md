---
name: feature-plan-6step
description: 'Use when: running the SnapEdit 1~6 sequential workflow from plan input to final report. Triggers on: 1~6단계, 6단계 체인, plan 기반 구현, 프로젝트 리더부터 문서 생성자까지'
---

# Feature Plan 6-Step Workflow

SnapEdit의 `plan` 입력을 기준으로 6단계 에이전트를 순차 실행할 때 사용하는 표준 스킬입니다.

## 적용 대상

- 신규 기능 구현 요청 (IPC 채널 신설, 새 UI 패널, OS 자원 접근 등)
- 기존 main/preload/renderer 동시 변경 요청
- 구현 + 품질점검 + 보안점검 + 문서화가 한 번에 필요한 요청

## 필수 입력

- 요구사항 plan 본문
- 영향받는 레이어 (main / preload / renderer 중 해당)
- 제약사항 (권한, OS, 제외 범위)

## 6단계 실행 계약

### 1단계: 프로젝트 리더

- 요구사항 정제
- 포함/제외 범위 확정
- 레이어별 작업 분해 (main / preload / renderer)
- 신규 기능 여부를 판단하고 생성 대상 파일 후보를 명시
- IPC 채널 신규 생성 필요 여부 판단
- 출력 말미에 `다음 단계 입력(Electron 메인 개발자용)` 포함

### 2단계: Electron 메인 개발자

- `src/main` IPC 핸들러, `src/preload` 노출 API 구현
- `contextBridge.exposeInMainWorld`로 최소 권한 노출 원칙 준수
- renderer 입력값 검증을 main에서 처리
- 신규 기능으로 대상 파일이 없으면 필요한 main/preload 파일을 생성해 작업
- 출력 말미에 `다음 단계 입력(프론트 개발자용 IPC 계약)` 포함

### 3단계: 프론트 개발자

- preload가 노출한 `window.api.*` IPC API 기준 renderer 구현
- TypeScript `any` 금지
- Zustand, React 훅, Tailwind CSS 기존 패턴 준수
- 신규 화면으로 대상 파일이 없으면 필요한 컴포넌트/훅/스토어 파일을 생성해 작업
- 출력 말미에 `다음 단계 입력(코드 품질 리뷰어용)` 포함

### 4단계: 코드 품질 리뷰어

- Electron 아키텍처 경계/IPC 패턴/회귀 위험 점검
- Critical/High 우선 분류
- 출력 말미에 `다음 단계 입력(보안 점검자용)` 포함

### 5단계: 보안 점검자

- Electron 보안(contextIsolation, nodeIntegration, IPC 화이트리스트) 점검
- OWASP 기준 입력 검증/민감 정보/로그 노출 확인
- 출력 말미에 `다음 단계 입력(코드 및 보안점검 문서 생성자용)` 포함

### 6단계: 코드 및 보안점검 문서 생성자

- 4~5단계 결과 통합
- 문서 저장 경로: `문서/검증/`
- 파일명: `feature-plan-chain-YYYYMMDD-HHmm-[대상요약].md`
- 중복 시 `-v2`, `-v3` 부여

## 단계 간 전달 형식 (고정)

각 단계 출력은 아래 섹션을 순서대로 포함합니다.

```markdown
## 요약

## 변경/점검 범위

## Critical/High 이슈

## 결정 사항

## 다음 단계 입력
```

## 실패 처리 규칙

- 선행 단계에서 `다음 단계 입력`이 누락되면 다음 단계 진행 금지
- 누락 섹션을 보완하도록 동일 단계를 재실행
- 범위가 모호하면 최소 범위로 축소 후 재실행

## 최종 산출물 규칙

최종 응답에는 반드시 아래를 포함합니다.

- 저장 문서 경로
- 단계별 핵심 결과(1~6)
- 수정 파일 목록
- 잔여 위험 항목

## 연계 권장 스킬

- PR 직전: `pr-checklist`
