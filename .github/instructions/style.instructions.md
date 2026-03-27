---
description: 'Use when: editing SnapEdit source files; enforce minimal code style and Electron architecture conventions'
applyTo: 'src/**/*.{ts,tsx,js,jsx}'
---

# SnapEdit 최소 스타일 지침

## 핵심 원칙

- 기존 구조/명명 규칙을 우선 유지하고, 변경 범위는 요청한 기능으로 한정한다.
- 규칙이 충돌하면 `.github/copilot-instructions.md`를 최우선 기준으로 따른다.

## 공통 타입/구현

- `any` 타입 사용 금지, 가능한 구체 타입/인터페이스를 사용한다.
- 하드코딩 대신 기존 상수/스토어/유틸을 우선 사용한다.
- 컴포넌트 파일은 PascalCase, 훅/유틸은 기존 camelCase 패턴을 유지한다.

## Electron 경계

- `renderer`는 Node.js API에 직접 접근하지 않고 IPC로 위임한다.
- 민감 기능(`fs`, `child_process`, OS 자원)은 `main`에서만 처리한다.
- `preload`는 최소 권한으로 안전한 API만 노출하고 계약 타입을 명시한다.

## 변경 품질

- 수정 후 영향 범위(타입 오류, 빌드 가능 여부)를 짧게 점검한다.
