# 0025 앱 구조: Tauri 셸 + Node sidecar 엔진 + shadcn UI

Status: accepted
Source: changes/043-shadcn-redesign/spec.md
Supersedes: 0001

## 맥락
U3 는 사용자 PC 의 codex CLI 세션, ffmpeg, Remotion 렌더를 쓴다. uUu 의 엔진 코드는 Node(TypeScript)로 되어 있다.

SEED 는 모바일 우선 디자인 시스템이라 데스크톱 편집기 화면이 너저분하고 밀도가 낮았다(changes/043-shadcn-redesign/intent.md).

## 결정
- Tauri 2 가 창·설치 파일·파일 대화상자·sidecar 실행을 맡는다.
- UI 는 React + Vite + shadcn/ui(Radix) + Tailwind CSS 다. 테마는 다크·라이트이고 설정에서 고른다(기본 다크, 시스템 설정 따르기 가능). 글꼴은 앱에 넣은 Pretendard 다. 미리보기는 `@remotion/player` 다.
- 엔진은 Node sidecar(`bundle.externalBin`)다. 127.0.0.1 임의 포트에 묶고, Tauri 가 넘긴 일회용 토큰이 없는 요청은 거부한다.
- 지원 OS 는 macOS Apple Silicon 하나다.

## 결과
UI 는 데스크톱 편집기 밀도(컨트롤 32px, 속성 한 줄)로 만든다. uUu 의 Node 코드를 그대로 옮길 수 있다. 설치 파일에 Node 런타임이 들어간다.
