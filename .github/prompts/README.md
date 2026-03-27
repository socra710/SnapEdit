# SnapEdit Prompts Index

## 목록

### Feature Plan Chain

- 파일: `feature-plan-chain.prompt.md`
- 목적: 5개 에이전트 순차 실행(프로젝트 리더 -> 프론트 개발자 -> 코드 품질 리뷰어 -> 보안 점검자 -> 코드 및 보안점검 문서 생성자)
- 사용 예시:
  - `이미지 내보내기 기능 추가, 대상: src/main/index.ts, src/preload/index.ts, src/renderer/src/components/`
  - `기존 캔버스 편집 화면 개선, IPC 채널 검증 강화`

### Feature Plan Sample Template

- 파일: `feature-plan-sample-template.md`
- 목적: slash prompt 입력용 plan 본문 템플릿 제공(신규 기능/기존 기능 공통)
- 사용 방법: 템플릿을 복사해 `${input:요구사항 plan}`에 붙여 넣어 실행

### Feature Plan Input Example (Defect Reason)

- 파일: `feature-plan-input-example-defect-reason.md`
- 목적: 바로 실행 가능한 완성형 plan 입력 예시 제공
- 사용 방법: 파일의 코드블록 본문을 그대로 복사해 `${input:요구사항 plan}`에 붙여 넣어 실행

### Feature Plan Smoke Test Input

- 파일: `feature-plan-smoke-test-input.md`
- 목적: 체인 프롬프트/에이전트 연결 점검용 최소 스모크 테스트 입력 제공
- 사용 방법: 본문 코드블록을 복사해 `${input:요구사항 plan}`에 붙여 넣어 5단계 체인 실행

## 운영 규칙

- 프롬프트는 반복되는 업무(리뷰/점검/문서화)를 표준화할 때 사용합니다.
- 체인 실행 시 각 단계 출력의 `## 다음 단계 입력` 존재 여부를 확인한 뒤 다음 단계로 진행합니다.
- 모든 단계는 `요약 -> 변경/점검 범위 -> Critical/High 이슈 -> 결정 사항 -> 다음 단계 입력` 순서를 유지합니다.
- 신규 화면/기능으로 대상 파일이 없으면 `프론트 개발자` 단계에서 필요한 파일 생성 후 구현합니다.
- 신규 기능 검토 시 `코드 품질 리뷰어`, `보안 점검자`는 기존 화면 참조와 신규 대상 확정 이슈를 구분해 기록합니다.
- 프롬프트 실행 결과는 반드시 Markdown 문서 파일로 저장합니다. (기본 경로: `문서/검증/`)
- 시뮬레이션이 아닌 실행 모드에서는 `코드 및 보안점검 문서 생성자` 단계에서 실제 문서 파일을 생성합니다.
- 프로젝트 규칙은 항상 `.github/copilot-instructions.md`를 따릅니다.
- 보안만 집중 점검이 필요하면 프롬프트 대신 `보안 점검자` 에이전트를 사용합니다.
