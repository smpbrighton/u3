# Review: desktop-studio
Author: claude-opus-5-5[1m]. Status: draft. Round: 1.
<!-- Author는 작성한 에이전트 이름이다. Status: draft | accepted. accepted 는 사람이 /smp:accept 로 바꾼다. 발견은 게이트를 막지 않는다. Round 는 critic 회차이고 stage.sh 가 올린다. 3회차가 상한이다. -->

## 대조한 것
- 변경 문서: `architecture/changes/001-desktop-studio/intent.md`, `architecture/changes/001-desktop-studio/spec.md`. 둘 다 워크트리의 현재 내용을 읽었다. 이 내용에는 커밋 `8562cd3` 뒤에 추가하고 커밋하지 않은 받아 적기(STT) 부분이 들어 있다.
- 레포 지침: `AGENTS.md`, `architecture/INTENT.md`.
- 결정: `architecture/decisions/0001-tauri-node-sidecar.md` ~ `0006-voice-record-separate.md`(커밋됨), `0003-core-scope.md` 의 커밋하지 않은 수정분, `0007-whisper-stt.md`(커밋하지 않은 새 파일).
- 위키: `architecture/wiki/index.md`, `SCHEMA.md`, `log.md`. 페이지가 없다(`wiki/pages/` 비어 있음).
- 진행 중인 다른 변경: `ledger.sh show` 에는 001-desktop-studio 하나만 있다. 대조할 다른 변경이 없다.
- 화면설계 아티팩트(https://claude.ai/artifact/KhEuMmtnQYHehoLgCfhAst): `project/canvas.json`, `Studio.dc.html`, `StudioStt.dc.html`, `Settings.dc.html`, `Script.dc.html`.
- spec 이 가리키는 uUu 코드: `src/pipeline/codex.ts`(`codexCliArgs`), `src/pipeline/jev.ts`(`JEV_MODEL`), `src/core/estimated-audio.ts`(`DEFAULT_CHARS_PER_SEC = 5.7`), `src/core/captions.ts`(`buildCaptionChunks`), `src/core/schema.ts`(`WordStamp`), `src/pipeline/ffmpeg.ts`, `src/pipeline/meme-embed.ts`, `.env` 의 `TYPESAFE_API_KEY` 존재, `node_modules/@remotion/compositor-darwin-arm64@4.0.529`(ffmpeg·ffprobe 포함).
- whisper.cpp 원본(GitHub `ggml-org/whisper.cpp`, 최신 릴리스 v1.9.5): `README.md`, `examples/cli/cli.cpp`, `src/whisper.cpp`(`whisper_wrap_segment`), `CMakeLists.txt`, `ggml/CMakeLists.txt`, 릴리스 자산 목록.

## 발견
Important 는 없다. 유효 결정 0001~0007 과 spec 사이에 모순이 없다. 위키에 페이지가 없고, 진행 중인 다른 변경이 없다.

### nit
1. **받아 적기 추가분이 커밋되지 않은 채 accepted 표시 아래에 있다.** spec·intent 의 Status 는 커밋 `8562cd3` 의 승인 표시다. 요구사항 13·14, 설계의 받아 적기 항목, 우려 사항 10·11, 결정 0007, 0003 의 받아 적기 줄은 그 뒤에 워크트리에서만 추가됐다. `AGENTS.md` 는 "커밋된 것만 다음 단계의 입력"이라고 정한다. 이대로 plan 을 쓰면 사람이 승인하지 않은 요구사항이 plan 의 입력이 된다. 추가분을 빼고 커밋된 0003 만 기준으로 하면 요구사항 14(AI 추천에 받아 적은 말소리를 넘김)가 0003 의 "AI 추천은 영상마다 같은 간격 10장과 사진 전체를 본다"와 어긋난다. intent 의 기대 결과 2("프레임 10장과 사진을 보고")와 spec 의 열린 질문 답 4 도 받아 적은 말소리를 넣지 않았다. 근거: `git status`(intent.md·spec.md·0003·INTENT.md 수정, 0007 미추적), `AGENTS.md` 컨벤션 2번째 줄.
2. **`pnpm verify` 가 574 MB 모델과 cmake 빌드에 묶인다.** 검증 기준은 받아 적기 단위 테스트가 한국어 fixture 를 실제로 받아 적게 한다. 모델은 앱 리소스에 없고 처음 쓸 때 받는다. 바이너리는 빌드 단계에서 `cmake` 로 만든다. 새로 받은 레포나 네트워크가 없는 환경에서 verify 는 574 MB 를 받거나 실패한다. MRX 단위 테스트는 앱 리소스의 31 MB 모델을 쓰므로 이 문제가 없다. spec 은 테스트용 작은 모델(예: ggml-tiny)을 쓰는지, 모델이 없으면 건너뛰는지를 정하지 않았다. 근거: `spec.md` 검증 기준 4번째 항목, 설계 「받아 적기(STT)」.
3. **whisper.cpp 기본 빌드는 공유 라이브러리를 만든다.** `CMakeLists.txt` 는 Emscripten·MinGW 가 아니면 `BUILD_SHARED_LIBS` 기본값을 ON 으로 둔다. 그러면 `whisper-cli` 는 `libwhisper`·`libggml*` dylib 에 묶인다. spec 은 "Metal 빌드 바이너리"만 적는다. dylib 를 함께 넣고 서명하지 않으면 설치한 앱에서 받아 적기가 시작되지 않는다. plan 은 정적 빌드(`-DBUILD_SHARED_LIBS=OFF`)와 dylib 동봉 중 하나를 정해야 한다. Metal 셰이더 내장(`GGML_METAL_EMBED_LIBRARY`, Metal 이 켜지면 기본 ON)을 유지하는지도 적어야 한다. 근거: whisper.cpp `CMakeLists.txt` 52~77행, `ggml/CMakeLists.txt` 67~85·242행, `spec.md` 설계 「받아 적기(STT)」.
4. **`-ml 1` 의 출력 단위는 단어가 아니라 토큰이다.** `whisper_wrap_segment` 는 `-sow`(`--split-on-word`)가 없으면 모든 토큰 경계에서 나눈다. 한국어 어절은 여러 토큰 조각이 된다. 바이트 단위 BPE 토큰이 한 음절의 UTF-8 바이트를 나누면 조각의 글자가 깨질 수 있다(코드 구조에서 추론, 실측하지 않음). spec 의 대체 방안(문장 시각을 글자 수로 나눔)은 시각 어긋남만 다루고 단위 문제는 다루지 않는다. 스파이크 후보에 `-ml 1 -sow` 와 `--dtw large.v3.turbo`(토큰 시각)를 넣어야 한다. 근거: whisper.cpp `src/whisper.cpp` `should_split_on_word`·`whisper_wrap_segment`, `examples/cli/cli.cpp` 179·204행, `spec.md` 우려 사항 10.
5. **자막 나누기 규칙이 옮겨 오는 uUu 자막 규칙과 다르다.** spec 은 `core/` 의 captions·measure·safezone 을 옮긴다. uUu `buildCaptionChunks` 는 단어 시각(`WordStamp`)을 측정 폭(px)과 줄 수(1 또는 2)로 묶고 문장 끝에서 끊는다. 단어가 줄 폭을 넘으면 `overflow` 로 표시하고, 세이프존 검사가 렌더를 막는다. spec 은 같은 일을 "한 줄 최대 글자(기본 16자)"로 정하고 「새로 만든다」에 넣었다. 두 규칙이 같이 있으면 16자 자막이 폭 검사에 걸려 내보내기가 막힐 수 있다. 어느 규칙을 쓰는지 하나로 정해야 한다. 근거: uUu `src/core/captions.ts` 1~60행, `src/core/schema.ts` 201행, `spec.md` 요구사항 13, 「uUu 에서 옮기는 것과 버리는 것」.
6. **받아 적은 시각을 타임라인 시각으로 옮기는 규칙이 없다.** 원본 소리는 영상 클립을 따라간다. 한 입력은 자르기로 여러 클립이 되고 순서가 바뀐다. spec 에는 입력 기준 단어 시각을 클립의 `inStartSec`·`inEndSec` 로 잘라 타임라인 시각으로 옮기는 규칙이 없다. 클립 밖 단어를 버리는 규칙도 없다. 받아 적기 뒤에 영상 클립을 자르거나 옮기면 자막은 따라가지 않는다(`captions` 는 "시각을 자유롭게 둔다"). 저장 경로 `transcripts/<입력 또는 클립 id>.json` 은 같은 입력의 원본 소리와 분리한 목소리를 같은 키로 둔다. 분리 뒤 다시 받아 적으면 앞 결과를 덮거나 낡은 결과를 다시 쓴다. 근거: `spec.md` 요구사항 13, 데이터 「`Timeline`」·`transcripts/` 줄, 결정 0005·0006.
7. **말소리가 없는 구간의 처리가 없다.** intent 기대 결과 5 는 "말소리가 있으면" 받아 적는다고 하지만 spec 에 판정 방법이 없다. whisper 는 음악·무음 구간에서 없는 문장을 만들 수 있다(알려진 동작, 이 앱 조건에서 확인하지 않음). 그 문장은 자막과 codex 프롬프트에 같이 들어간다. whisper.cpp 에는 `--vad`·`--vad-model`, `-nth`, `-sns` 옵션이 있다. 스파이크 측정 항목에 무음·음악 구간의 헛 문장을 넣어야 한다. 근거: `intent.md` 기대 결과 5, `spec.md` 요구사항 13·14, whisper.cpp `examples/cli/cli.cpp` 172·210·216~217행.
8. **화면설계 아티팩트와 spec 이 어긋난다.** spec 은 스튜디오 상황을 6개로 적는다. 아티팩트에는 「4-7 스튜디오 · 말소리로 자막 만들기」까지 7개가 있다. 아티팩트의 받아 적기 패널에서 사용자는 받아 적을 대상(목소리 트랙·음성 트랙)을 고르고 「한 줄 최대 글자」를 고친다. spec 은 대상 선택을 정하지 않았고, 글자 수를 저장할 곳(`project.json`·`settings.json`)도 정하지 않았다. spec 의 확인 창(Critical)과 진행률은 아티팩트에 없다. 우려 사항 11 은 설정 화면에 모델별 받기 상태를 보인다고 한다. 아티팩트의 설정 화면은 「짤 검색 모델」만 보인다. spec 은 아티팩트를 확인하기 전에는 화면을 구현하지 않는다고 정한다. 그래서 이 차이는 구현 전에 풀려야 한다. 근거: `spec.md` 설계 첫 문단·우려 사항 11, 아티팩트 `project/canvas.json`, `project/Studio.dc.html` 168~181행, `project/Settings.dc.html`.
9. **받아 적기의 진행률·취소·실패 처리가 없다.** 음성 분리(요구사항 11)는 진행률과 취소를 정했다. 「자막 만들기」(요구사항 13)는 정하지 않았다. 요구사항 14 는 모델이 없을 때만 프레임만 넘긴다고 정한다. 한 영상의 받아 적기가 실패하거나 오래 걸릴 때 codex 호출이 기다리는지, 그 영상을 빼고 넘기는지가 없다. 입력 20개를 모두 받아 적은 뒤에 codex 를 부르면 대본 생성 대기 시간이 늘어난다. 근거: `spec.md` 요구사항 11·13·14, AI 연동 「받아 적은 말소리」.
10. **모델 받기 시점이 결정 0007 의 문장과 다르다.** 0007 과 설계는 "처음 쓸 때 받는다"고 적는다. 요구사항 14 는 AI 추천을 누르면 받아 적기를 쓰지 않았어도 574 MB 받기를 뒤에서 시작한다. 사용자가 고르지 않은 큰 파일 받기 시점이 하나 더 생긴다. 0007 의 문장을 요구사항 14 에 맞추거나, 요구사항 14 의 자동 받기를 빼야 한다. 근거: `decisions/0007-whisper-stt.md` 결정 2번째 줄, `spec.md` 요구사항 14.
11. **"AI 는 codex 와 Jev 만" 문장이 로컬 모델과 겹쳐 읽힌다.** intent 판정 기준과 결정 0002 의 제목은 AI 를 codex 와 Jev 로 한정한다. 실제로는 bge-m3(0004), MRX(0006), whisper(0007)도 로컬에서 도는 모델이다. 0004·0006 이 이미 accepted 이므로 모순은 아니다. 판정 기준을 "원격 AI 호출은 codex 와 Jev 만"처럼 범위를 넣어 적어야 한 뜻으로 읽힌다. 근거: `intent.md` 판정 기준 3번째 줄, `decisions/0002-codex-luna-jev-only.md` 제목, `decisions/0007-whisper-stt.md`.
12. **서식.** spec 우려 사항 9 와 10 사이에 빈 줄이 있다. 데이터 목록에서 `transcripts/` 줄이 다른 `projects/<id>/` 줄과 떨어져 `cache/models/` 뒤에 있다. 근거: `spec.md` 우려 사항 절, 데이터(파일 기반) 절.

## 처리

| # | 발견 | 판단 |
|---|---|---|
| 1 | 받아 적기 추가분이 커밋 전이고 intent·0003 과 어긋남 | 채택 |
| 2 | verify 가 574 MB 모델·cmake 빌드에 묶임 | 채택 |
| 3 | whisper.cpp 기본 빌드가 dylib 를 만듦 | 채택 |
| 4 | `-ml 1` 이 토큰 단위로 나눔 | 채택 |
| 5 | 16자 규칙이 uUu 자막 규칙과 다름 | 채택 |
| 6 | 받아 적은 시각을 클립 시각으로 옮기는 규칙 없음 | 채택 |
| 7 | 무음·음악 구간의 헛 문장 처리 없음 | 채택 |
| 8 | 화면설계와 spec 어긋남 | 채택 |
| 9 | 받아 적기 진행률·취소·실패 처리 없음 | 채택 |
| 10 | 모델 받기 시점이 0007 과 요구사항 14 에서 다름 | 채택 |
| 11 | "AI 는 codex·Jev 만"이 로컬 모델과 겹쳐 읽힘 | 채택 |
| 12 | 서식 | 채택 |

1 채택 — 추가분을 이 review 커밋에 함께 넣고 plan 승인으로 받는다. intent 기대 결과 2, spec 열린 질문 답 4, 0003 에 받아 적은 말소리를 넣었다.
2 채택 — 받아 적기 단위 테스트는 `whisper-cli` 출력 JSON fixture 로 바꿨다. 실제 모델 확인은 `pnpm test:models` 로 verify 밖에 둔다.
3 채택 — `cmake -DBUILD_SHARED_LIBS=OFF` 정적 빌드, Metal 셰이더 내장, `otool -L` 확인을 spec·0007 에 넣었다.
4 채택 — `-ml 1 -sow` 로 바꾸고, 스파이크에서 `--dtw large.v3.turbo` 와 비교한다(우려 사항 10).
5 채택 — 16자 규칙을 지우고 옮겨 오는 `buildCaptionChunks` 를 쓴다. 화면설계의 글자 수 입력을 지웠다.
6 채택 — 입력 기준 시각을 클립 `inStartSec`~`inEndSec` 로 잘라 옮기는 규칙과 클립 밖 단어 버리기를 넣었다. transcripts 키를 `.source`·`.voice`·음성 clipId 로 나눴다.
7 채택 — `-sns` 를 켜고 스파이크 측정 항목에 무음·음악 구간의 헛 문장을 넣었다. 빈도가 높으면 `--vad` 를 검토한다.
8 채택 — spec 의 스튜디오 상황을 7개로 고치고 받아 적을 트랙 선택을 요구사항 13 에 넣었다. 화면설계 설정에 받아 적기 모델 받기를 더했다. 확인 창과 진행률은 SEED Alert Dialog·Progress Circle 로 구현 때 그린다.
9 채택 — 자막 만들기의 진행률·취소·실패(Snackbar, 자막 유지)와 AI 추천의 실패·60초 지연 처리(그 영상은 프레임만, 경고 한 줄)를 넣었다.
10 채택 — AI 추천의 자동 받기를 뺐다. 모델은 사용자가 자막 만들기를 처음 누르거나 설정에서 받기를 누를 때만 받는다.
11 채택 — intent 판정 기준·제약과 0002 에 "원격 AI 호출" 범위를 적었다.
12 채택 — 빈 줄을 지우고 transcripts 줄을 projects 줄 곁으로 옮겼다.

