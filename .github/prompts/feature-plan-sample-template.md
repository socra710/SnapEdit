# Feature Plan Sample Template

아래 템플릿을 복사해 `feature-plan-chain.prompt`의 `${input:요구사항 plan}`에 입력하세요.

```markdown
[요청 개요]

- 요청 제목:
- 요청 배경:
- 신규 기능 여부: (신규 기능 / 기존 기능 개선 중 선택)

[대상 레이어 및 경로]

- main 대상 경로: (예: src/main/index.ts)
- preload 대상 경로: (예: src/preload/index.ts, src/preload/index.d.ts)
- renderer 대상 경로: (예: src/renderer/src/components/..., src/renderer/src/hooks/...)

[기능 요구사항]

1.
2.
3.

[제약사항]

- IPC 보안:
- OS/권한:
- 범위 제외:

[신규 생성 후보(알고 있는 경우)]

- main 생성 후보 파일: (IPC 핸들러)
- preload 생성 후보 파일: (contextBridge 노출 API)
- renderer 생성 후보 파일: (컴포넌트/훅/스토어)

[검증 기준]

- 기능 검증:
- 회귀 검증:
- 보안 검증:

[출력 기대사항]

- 5단계 순차 수행
- 각 단계에서 `## 다음 단계 입력` 포함
- 최종 문서 `문서/검증/` 저장
```

## 빠른 입력 예시

```markdown
[요청 개요]

- 요청 제목: 이미지 파일 내보내기(PNG/JPG) 기능 추가
- 요청 배경: 편집 완료된 캔버스를 로컬 파일로 저장하는 기능이 없어 사용자 불편 발생
- 신규 기능 여부: 신규 기능

[대상 레이어 및 경로]

- main 대상 경로: src/main/index.ts
- preload 대상 경로: src/preload/index.ts, src/preload/index.d.ts
- renderer 대상 경로: src/renderer/src/components/, src/renderer/src/hooks/

[기능 요구사항]

1. 캔버스를 PNG 또는 JPG 형식으로 로컬 파일에 저장
2. 저장 경로는 OS 네이티브 다이얼로그로 사용자가 선택
3. 저장 성공/실패 결과를 renderer에 반환

[제약사항]

- IPC 보안: renderer 입력값(파일명, 포맷) 검증 필수, contextIsolation 유지
- OS/권한: fs.writeFile 등 파일 쓰기는 main에서만 처리
- 범위 제외: 클라우드 업로드, 공유 기능 제외

[신규 생성 후보(알고 있는 경우)]

- main 생성 후보 파일: ipcMain.handle('export-image', ...) 핸들러
- preload 생성 후보 파일: window.api.exportImage(...) 노출
- renderer 생성 후보 파일: components/ExportPanel.tsx, hooks/useExport.ts

[검증 기준]

- 기능 검증: PNG/JPG 저장 후 파일 내용 정합성
- 회귀 검증: 기존 편집 기능 및 기타 IPC 채널 영향 없음
- 보안 검증: 경로 트래버설 차단, 허용된 확장자만 저장 가능

[출력 기대사항]

- 5단계 순차 수행
- 각 단계에서 `## 다음 단계 입력` 포함
- 최종 문서는 `문서/검증/feature-plan-chain-YYYYMMDD-HHmm-이미지내보내기.md`로 저장
```
