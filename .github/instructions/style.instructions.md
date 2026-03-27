---
description: 'Use when: editing SnapEdit source files; enforce minimal code style and Electron architecture conventions'
applyTo: 'src/**/*.{ts,tsx,js,jsx}'
---

# SnapEdit 최소 스타일 지침

## 핵심 원칙

- 기존 구조/명명 규칙을 우선 유지하고, 변경 범위는 요청한 기능으로 한정한다.
- 규칙이 충돌하면 `.github/copilot-instructions.md`를 최우선 기준으로 따른다.

## Electron 아키텍처

- `src/main`: Node.js API(`fs`, `shell`, `child_process` 등) 사용 가능, IPC 핸들러(`ipcMain.handle`) 등록
- `src/preload`: `contextBridge.exposeInMainWorld`로 최소 API만 renderer에 노출, 타입은 `src/preload/index.d.ts`에 정의
- `src/renderer/src`: React/TypeScript UI, `window.api.*`로만 IPC 호출, Node.js API 직접 접근 금지

## 코드 스타일

- `any` 타입 사용 금지, 구체 타입/인터페이스를 사용한다.
- 컴포넌트 파일은 PascalCase, 훅/유틸/스토어는 camelCase 패턴을 유지한다.
- Zustand 스토어는 `src/renderer/src/store/`, React 훅은 `src/renderer/src/hooks/`에 위치한다.
- Tailwind CSS 클래스는 하드코딩 최소화, 기존 스타일 패턴을 재사용한다.

## IPC 보안

- IPC 채널명은 화이트리스트 방식으로 관리한다.
- renderer 입력값은 main 처리 전에 검증한다 (경로 트래버설, 타입 검증).
- `contextIsolation: true`, `nodeIntegration: false` 기준으로 구현한다.

## 변경 품질

- 하드코딩 대신 기존 상수/코드 체계를 우선 사용한다.
- 수정 후 영향 범위(타입 오류, `npm run typecheck` 통과 여부)를 짧게 점검한다.
