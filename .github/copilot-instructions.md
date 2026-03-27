# SnapEdit Copilot 최소 운영 지침

이 문서는 저장소 전역에서 항상 적용되는 핵심 규칙만 정의합니다.
세부 스타일/표현 규칙은 `.github/instructions/*.instructions.md`를 따릅니다.

## 우선순위

- 전역 원칙: 이 문서
- 파일별 스타일/구현 디테일: `.github/instructions/*.instructions.md`
- 충돌 시: 이 문서 우선

## 기술/아키텍처 고정 규칙

- Electron 아키텍처 경계: `main`(시스템 권한) ↔ `preload`(브릿지) ↔ `renderer`(UI)
- `renderer`에서 Node.js API 직접 접근 금지, 필요한 기능은 IPC로 위임
- 민감한 시스템 기능(`fs`, `child_process`, OS 자원)은 `main`에서만 처리
- `preload`는 최소 권한 원칙으로 안전한 API만 노출

## 필수 품질 규칙

- TypeScript `any` 사용 금지
- 하드코딩 최소화, 기존 상수/코드 체계 우선
- 변경은 요청 범위 내 최소 수정 원칙 유지
- 프로세스 간 계약(IPC 요청/응답 타입)을 명시적으로 유지

## 보안/회귀 위험 체크

- IPC 채널은 화이트리스트 기반으로 관리
- `contextIsolation` 전제에서 동작하도록 구현하고 우회 패턴 금지
- `renderer` 입력값은 `main` 처리 전에 검증
- preload 노출 API 변경 시 영향 범위(호출부/권한) 점검

## 빠른 작업 원칙

- 기능 구현 전: 관련 경계(`main/preload/renderer`)를 먼저 확인
- 구현 후: 타입/린트/빌드 가능한 범위에서 최소 검증 (`npm run typecheck`)
- PR 전: `.github/skills/pr-checklist/SKILL.md` 기준으로 점검 (파일이 있을 경우)
