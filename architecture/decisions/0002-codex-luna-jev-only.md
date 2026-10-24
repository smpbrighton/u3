# 0002 AI: codex(gpt-6-luna)와 Jev 만

Status: accepted
Source: changes/001-desktop-studio/spec.md

## 맥락
U3 는 사용자의 구독 로그인 세션으로 대본을 만들고, 짤 적합도를 판정한다.

## 결정
- 대본 생성은 codex CLI 를 `-m gpt-6-luna` 로 부른다. 프레임·사진은 `--image` 로 붙인다. 결과는 zod 로 다시 검증한다.
- 짤 적합도는 Jev(`jev-1.13.0` 고정)로 판정한다. 기본으로 켠다.
- Jev 키는 개발자가 등록한 키를 쓴다. 빌드할 때 `.env` 의 `TYPESAFE_API_KEY` 를 sidecar 번들에 넣고, 키가 없으면 빌드를 실패시킨다. 키는 커밋하지 않는다. Jev 호출이 실패하면 규칙 점수로 대체한다.
- Claude CLI 와 계정 다중 선택은 없다.

## 결과
사용자는 codex 를 설치하고 로그인해야 한다. 앱은 시작할 때 `codex login status` 로 확인한다. 설치 파일을 받은 사람은 Jev 키를 꺼낼 수 있다. 외부 배포 전에 키를 서버 뒤로 옮긴다.
