# 0001 앱 구조: Tauri 셸 + Node sidecar 엔진

Status: superseded-by 0025
Source: changes/001-desktop-studio/spec.md

## 맥락
U3 는 사용자 PC 의 codex CLI 세션, ffmpeg, Remotion 렌더를 쓴다. uUu 의 엔진 코드는 Node(TypeScript)로 되어 있다.

## 결정
- Tauri 2 가 창·설치 파일·파일 대화상자·sidecar 실행을 맡는다.
- UI 는 React + Vite + SEED 다. 미리보기는 `@remotion/player` 다.
- 엔진은 Node sidecar(`bundle.externalBin`)다. 127.0.0.1 임의 포트에 묶고, Tauri 가 넘긴 일회용 토큰이 없는 요청은 거부한다.
- 지원 OS 는 macOS Apple Silicon 하나다.

## 결과
uUu 의 Node 코드를 그대로 옮길 수 있다. 설치 파일에 Node 런타임이 들어간다. Remotion 을 sidecar 로 묶는 방법은 plan 첫 단계에서 검증한다.
