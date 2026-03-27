# SnapEdit Copilot Customizations

현재 저장소의 Copilot 커스텀 구성은 **6단계 순차 체인** 기준으로 운영합니다.

## Quick Start

1. `.github/prompts/feature-plan-chain.prompt.md` 실행
2. 입력 plan 전달
3. 1~6단계 에이전트 순차 수행 (`다음 단계 입력` 누락 시 해당 단계 보완 후 재실행)
4. 신규 기능이면 `Electron 메인 개발자`와 `프론트 개발자`가 필요한 파일을 생성해 작업
5. 결과 문서(`문서/검증/`) 저장 확인

## 6-Step Agents

1. `.github/agents/project-leader.agent.md` (`프로젝트 리더`)
2. `.github/agents/backend-developer.agent.md` (`Electron 메인 개발자`)
3. `.github/agents/frontend-developer.agent.md` (`프론트 개발자`)
4. `.github/agents/code-quality-reviewer.agent.md` (`코드 품질 리뷰어`)
5. `.github/agents/security-auditor.agent.md` (`보안 점검자`)
6. `.github/agents/report-writer.agent.md` (`코드 및 보안점검 문서 생성자`)

## Prompts

- `.github/prompts/feature-plan-chain.prompt.md`
- `.github/prompts/README.md`

## Skills

- `.github/skills/feature-plan-6step/SKILL.md`
- `.github/skills/pr-checklist/SKILL.md`

## Rules

- 프로젝트 전역 규칙: `.github/copilot-instructions.md`
- 소스 수정 시 스타일 규칙: `.github/instructions/style.instructions.md`
