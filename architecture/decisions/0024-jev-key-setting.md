# 0024 AI: codex(모델·effort 선택, 기본 gpt-6-luna)와 Jev(짤 적합도·강조 상자) 만, Jev 키는 사용자가 설정에서 입력

Status: accepted
Source: changes/041-jev-key-setting/plan.md
Supersedes: 0018

## 맥락
0018 은 개발자 Jev 키를 빌드 때 엔진 번들에 넣었다. 자동 업데이트(0021)는 public 레포 `smpbrighton/u3` 의 Release 에 앱을 올린다. 앱 파일을 받은 사람은 번들 안의 키를 꺼낼 수 있다. 사용자는 레포를 나누지 않고 Jev 키를 설정에서 입력하기로 했다.

## 결정
- 대본 생성은 codex CLI 로 한다. 모델과 effort 는 설정 화면에서 고르고 `settings.json` 에 저장한다. 기본값은 모델 `gpt-6-luna` 다. 목록은 codex 의 갱신 목록을 먼저 읽고, 다른 제공자 slug 는 뺀다. 프레임·사진은 `--image` 로 붙인다. 결과는 zod 로 다시 검증한다.
- 설정 화면은 codex 를 쓸 수 있는지(설치·로그인)만 보인다. 실행 파일 경로는 찾지 못했을 때만 직접 지정한다.
- 짤 적합도는 Jev(`jev-1.13.0` 고정)로, 캐러셀 강조 상자는 Jev Box(`jev-1.14.0` 고정)로 찾는다. 기본으로 켠다. Jev 를 끄면 이미지를 보내지 않는다.
- Jev 키는 사용자가 설정 「Jev 짤 판정」 카드에서 입력한다. 키는 macOS login Keychain(account `u3`, service `u3-jev-api-key`)에 저장한다. 엔진은 `security -i` 에 stdin 으로 넘겨 프로세스 인자에 키를 남기지 않는다. 저장 전에 키로 Jev 를 한 번 불러 401·403 이면 거절한다. 응답·로그·`settings.json` 에 키를 쓰지 않는다. 화면에는 끝 4자만 보인다.
- 빌드에 키를 넣지 않는다. 패키징과 릴리스는 엔진 번들에 키 대입이나 `.env` 의 키 값이 있으면 실패한다. 개발 실행은 `.env` 의 `TYPESAFE_API_KEY` 를 먼저 쓴다.
- 키가 없거나 Jev 호출이 실패하면 규칙 점수로 대체한다.
- Claude CLI 와 계정 다중 선택은 없다.

## 결과
0.2.0 부터 사용자는 설정에서 Jev 키를 한 번 입력해야 한다. 로컬 모델(bge-m3 0004, MRX 0008, whisper 0007)은 이 결정과 별개다. 사용자는 codex 를 설치하고 로그인해야 한다.
