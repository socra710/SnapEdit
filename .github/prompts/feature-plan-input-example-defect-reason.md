# Feature Plan Input Example (Image Export)

아래 본문 전체를 복사해 `feature-plan-chain.prompt`의 `${input:요구사항 plan}`에 입력하면 됩니다.

```markdown
[요청 개요]

- 요청 제목: 이미지 파일 내보내기(PNG/JPG) 기능 추가
- 요청 배경: 편집 완료된 캔버스를 로컬 파일로 저장하는 기능이 없어 사용자 불편 발생. Fabric.js 캔버스를 DataURL로 직렬화 후 main에서 파일 쓰기 처리 필요.
- 신규 기능 여부: 신규 기능

[대상 레이어 및 경로]

- main 대상 경로: src/main/index.ts
- preload 대상 경로: src/preload/index.ts, src/preload/index.d.ts
- renderer 대상 경로: src/renderer/src/components/, src/renderer/src/hooks/

[기능 요구사항]

1. 캔버스를 PNG 또는 JPG 형식으로 로컬 파일에 저장
2. 저장 경로는 OS 네이티브 다이얼로그(`dialog.showSaveDialog`)로 사용자가 선택
3. 저장 성공/실패 결과를 renderer에 반환해 UI에 토스트 메시지 표시
4. 파일 저장 중 진행 상태 표시(로딩 인디케이터)

[제약사항]

- IPC 보안: renderer 입력값(DataURL, 포맷) 검증 필수, contextIsolation: true 유지
- OS/권한: fs.writeFile 등 파일 쓰기는 main에서만 처리, renderer에서 Node.js API 직접 접근 금지
- 범위 제외: 클라우드 업로드, 이메일 공유 기능 제외

[신규 생성 후보(알고 있는 경우)]

- main 생성 후보 파일:
  - src/main/index.ts: ipcMain.handle('export-image', ...) 핸들러 추가
- preload 생성 후보 파일:
  - src/preload/index.ts: window.api.exportImage(dataUrl, format) 노출
  - src/preload/index.d.ts: ExportImageArgs, ExportImageResult 타입 정의
- renderer 생성 후보 파일:
  - src/renderer/src/components/ExportPanel.tsx: 내보내기 UI 패널
  - src/renderer/src/hooks/useExport.ts: IPC 호출 및 상태 관리 훅

[검증 기준]

- 기능 검증: PNG/JPG 저장 후 파일 내용 정합성, 취소 시 에러 없음
- 회귀 검증: 기존 편집 기능(캔버스 조작, 되돌리기) 및 다른 IPC 채널 영향 없음
- 보안 검증: 경로 트래버설 차단, DataURL 형식 검증, 허용 확장자(png/jpg)만 저장
- 품질 검증: 신규 기능 검토 시 기존 코드 참조와 신규 대상 확정 이슈 구분 기록

[출력 기대사항]

- 6단계 순차 수행
- 각 단계에서 `## 다음 단계 입력` 포함
- 리뷰/보안 단계는 `기존 코드 참조`와 `신규 대상 확정/추가 확인 필요`를 구분
- 최종 문서는 `문서/검증/feature-plan-chain-YYYYMMDD-HHmm-이미지내보내기.md`로 저장
```
