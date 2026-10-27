# Spec: qwen-tts
Source: intent.md (accepted). Status: accepted.
<!-- Status: draft | accepted. 제품 책임자가 바꾼다. accepted 커밋 뒤 /smp:critic으로 대조한다. -->

## 열린 질문에 대한 답
1. 판정 기준: 후보 1(30초 대본 음성을 60초 안에)과 후보 2(사용자 청취 판정)를 함께 쓴다. 후보 3(whisper 일치율)은 보조 지표로 스파이크에서만 잰다. 속도는 기계로 재고 품질은 사람만 판정할 수 있기 때문이다.
2. 첫 자막 레이어의 메인 자막 클립 단위로 만든다. 대본을 만든 직후에는 자막 클립 하나가 장면 하나다(`src/core/timeline/from-script.ts`). 자막 클립은 타임라인 시각(`startSec`)과 스튜디오에서 고친 글을 함께 가진다. 대본 장면(`ScriptScene.startSec`)은 원본 영상 구간이라 타임라인 시각으로 쓸 수 없다.
3. 자막 클립과 장면을 늘리지 않는다. 음성이 자막 클립보다 길면 음성을 그대로 두고 경고를 보인다. 장면 길이는 원본 영상 구간에 묶여 있어 늘릴 수 없는 경우가 있다.
4. 기본 화자는 Sohee 다. 설정에서 9개 프리셋 화자 중 하나를 고를 수 있다. 말투 지시(instruct)는 1.7B 모델에서만 동작한다. 1.7B 를 쓰면 설정에 한 줄 입력으로 두고, 0.6B 로 내리면 입력을 숨긴다.
5. 넣지 않는다. 목소리 복제는 동의 확인 같은 별도 정책이 필요하다. 다음 단계로 넘김.
6. Swift 도우미를 기본안으로 한다. 앱에 Python 런타임을 넣지 않는 결정(0007·0008)을 지킨다. 스파이크 S1 에서 Swift 도우미가 1.7B CustomVoice 를 읽지 못하면 이 답을 다시 연다(우려 사항 1).
7. 1.7B CustomVoice 를 기본으로 한다. 한국어 프리셋 화자 WER 이 0.6B(3.053)보다 낮다(1.741). 스파이크 S1 에서 속도 기준을 못 넘으면 0.6B 로 내린다.

## 요구사항
1. 사용자는 설정의 모델 항목에서 TTS 모델 받기를 누른다. 앱은 받기 진행률을 보이고, 받은 뒤 모델 상태를 "준비됨"으로 보인다.
2. 모델이 없을 때 사용자가 "음성 만들기"를 누르면 앱은 모델을 먼저 받고 이어서 음성을 만든다. 진행률은 받기와 생성을 나눠 보인다(0023, whisper 「자막 만들기」와 같은 방식).
3. 사용자는 편집 화면에서 "음성 만들기"를 누른다. 앱은 첫 자막 레이어의 메인 자막 클립마다 그 글로 음성 파일 하나를 만든다.
4. 생성이 끝나면 앱은 음성 클립을 목소리 트랙의 자막 클립 시작 시각에 놓는다. 자막 클립 하나에 음성 클립 하나다. 같은 자막 클립의 이전 TTS 클립은 바꾼다. 녹음 클립은 건드리지 않는다.
5. 앱은 TTS 에 넘기기 전에 자막 글에서 이모지와 줄바꿈을 지운다. 이모지 정의는 039-script-voice 의 정의(`src/core/script-style.ts`)를 그대로 쓰고, 이모지에 붙은 변형 선택자(U+FE0F)·키캡 결합 문자(U+20E3)·ZWJ(U+200D)도 지운다.
6. 음성 길이가 자막 클립 길이보다 길면 앱은 그 클립에 "다음 음성과 겹쳐 함께 들린다"는 경고를 보인다.
7. 사용자는 편집 화면 인스펙터에서 TTS 클립 하나를 다시 만든다. 다시 만든 음성은 같은 클립 자리를 바꾼다.
8. 사용자는 생성을 취소한다. 취소하면 만든 파일을 지우고 클립을 하나도 넣지 않는다.
9. 설정에서 화자(기본 Sohee)와 말투 지시 한 줄을 정한다.
10. 생성은 모델을 받은 뒤 네트워크 없이 동작한다.
11. TTS 작업은 내보내기·음성 분리 작업과 동시에 돌지 않는다. 하나가 돌고 있으면 다른 것을 시작할 때 "다른 작업이 끝난 뒤 시작할 수 있어요"를 보인다.

## 설계
### 도우미 실행 파일
- `u3-tts`(new): swift-qwen3-tts(MIT)를 감싼 Swift 실행 파일이다. 입력은 표준 입력 JSON(`model`, `speaker`, `instruct`, `items: [{id, text}]`, `outDir`)이다. 출력은 항목마다 `<id>.wav`(24 kHz mono)와 표준 출력 줄 단위 JSON 진행 이벤트다.
- 모델을 한 번 읽고 항목을 차례로 만든다. 항목마다 프로세스를 새로 띄우지 않는다.
- 빌드: `scripts/build-tts.sh`(new)가 Swift 로 빌드한다. 빌드 캐시는 `U3_BUILD_CACHE` 아래에 둔다. `default.metallib` 를 빌드하려면 Xcode Metal Toolchain(`xcodebuild -downloadComponent MetalToolchain`)이 필요하다. 이 Mac 에는 아직 없다.
- 패키징: Tauri `externalBin` 에 `u3-tts` 를 더한다(`Contents/MacOS`). `default.metallib` 는 Mach-O 가 아니므로 `Contents/Resources` 에 둔다(결정 0021: `Contents/MacOS` 에는 Mach-O 만 둔다). `u3-tts` 는 실행할 때 metallib 경로를 MLX 에 넘긴다. MLX 가 그 경로에서 읽는지는 스파이크 S1 에서 확인한다.
- 서명: `scripts/sign-nested.sh` 가 `u3-tts` 를 안쪽부터 서명한다. `scripts/check-macos-executables.sh` 가 통과해야 한다.

### 엔진
- `src/engine/pipeline/models.ts`: `QWEN_TTS_FILES`(Hugging Face 레포, 고정 revision, sha256)와 `downloadQwenTts` 를 더한다. 레포와 revision 은 스파이크 S1 에서 정한다. 받는 위치는 whisper 모델과 같은 모델 캐시 폴더다.
- `src/engine/pipeline/tts.ts`(new): `u3-tts` 를 띄우고 진행 이벤트를 작업 진행률로 옮긴다. 취소 신호에 프로세스를 끝내고 만든 파일을 지운다.
- `src/engine/routes/tts.ts`(new): `POST /api/projects/:id/tts`. 입력은 `items: [{captionId, text}]` 이다. 모델이 없으면 같은 작업 안에서 먼저 받는다. 결과 파일은 프로젝트 `voice/tts-<captionId>.wav` 다. 작업 결과(`done` 페이로드)는 `[{captionId, file, durationSec}]` 다. 엔진은 프로젝트 타임라인을 고치지 않는다.
- 작업 key: TTS·내보내기(`render`)·음성 분리(`separate`)가 같은 key `heavy-media` 를 쓴다(`src/engine/jobs.ts` 의 같은 key 막기). 음성 분리는 최대 6.4 GB(0008), 1.7B bf16 은 약 4.5 GB 를 쓴다.
- `src/engine/routes/models.ts`: TTS 모델 상태와 받기를 더한다.
- `src/engine/routes/system.ts`: `GET·PUT /api/system/tts-settings`(new). `script-voice` 라우트(039 가 고침)와 나눈다.

### 데이터
- `AudioClip` 스키마는 바꾸지 않는다. TTS 클립은 `voice` 배열에 일반 클립으로 들어간다. 클립 `id` 는 `tts-<captionId>` 다. 다시 만들기와 바꾸기는 이 id 로 찾는다.
- 설정: `ttsSpeaker`(기본 "Sohee"), `ttsInstruct`(기본 빈 값).

### 화면
- 편집 화면: 목소리 트랙 머리에 "음성 만들기" 버튼과 진행률. 생성이 끝나면 UI 가 지금 편집 중인 타임라인에 클립을 넣고 저장한다. 그래서 생성 중의 사용자 편집을 덮지 않는다.
- 편집 화면 인스펙터: TTS 클립에 "다시 만들기"와 길이 경고.
- 설정: 모델 항목에 TTS 모델 받기. 새 "음성" 항목에 화자 선택과 말투 지시.
- 대본 화면은 바꾸지 않는다. 대본 화면은 대본을 만든 즉시 편집 화면으로 간다(`src/ui/screens/Script.tsx`).

### 스파이크 S1(plan 첫 단계)
이 머신(Apple M6, 24GB, macOS 27.0.1)에서 잰다. 결과는 `docs/spikes/qwen-tts.md` 에 둔다.
- 선행 조건: Metal Toolchain 설치. 설치 위치를 기록한다.
- `u3-tts` 시험판으로 1.7B CustomVoice(bf16, 8bit)와 0.6B CustomVoice 를 읽는다. 읽은 Hugging Face 레포·revision·라이선스를 기록한다.
- metallib 를 `Contents/Resources` 위치에서 읽는지 확인한다.
- 30초 분량 한국어 대본 6장면의 생성 시간, 최대 메모리, whisper 일치율을 잰다.
- 사용자가 음성 파일을 듣고 판정한다.

## 결정
- 0022 범위 개정: 0017 을 대체한다. 음성 합성(TTS)을 범위에 넣는다. 나머지 범위는 0017 과 같다. → `../../decisions/0022-scope-add-tts.md`
- 0023 TTS: Qwen3-TTS 1.7B CustomVoice 를 Swift 도우미(swift-qwen3-tts, MLX)로 로컬 실행한다. 모델은 받기를 고를 때나 처음 음성 만들기 때 받는다. 기본 화자 Sohee. 첫 자막 레이어의 자막 클립 단위로 목소리 트랙에 놓는다. → `../../decisions/0023-qwen-tts-local.md`

## 우려 사항
1. swift-qwen3-tts 는 1.7B CustomVoice 를 지원 목록에 두지 않았다(0.6B CustomVoice, 1.7B Base, 1.7B VoiceDesign 만 있음). 읽지 못하면 0.6B(한국어 품질 낮음)로 가거나 Python(mlx-audio)을 앱에 넣어야 한다. Python 은 0007·0008 의 전제를 깬다. 정책 소유자: 제품 책임자. 추천: 스파이크 S1 결과로 정하고, Python 은 넣지 않는다. 이유: 번들 크기와 서명·업데이트 부담이 커진다.
2. 모델 크기 약 4.5 GB(1.7B bf16)를 사용자 디스크에 받는다. 8bit 판은 공식 레포가 아닐 수 있다. 정책 소유자: 제품 책임자. 추천: 8bit 판이 품질 기준을 넘고 라이선스가 Apache-2.0 이면 8bit 를 쓴다. 이유: 받기 시간과 디스크가 절반가량 준다.
3. TTS·내보내기·음성 분리를 한 key 로 묶으면 내보내기와 음성 분리도 서로 동시에 돌지 못한다. 지금은 동시에 돈다. 정책 소유자: 제품 책임자. 추천: 묶는다. 이유: 둘을 함께 돌리면 24GB 에서 메모리가 부족할 수 있다.
4. `u3-tts` 와 metallib 가 공증 대상에 들어간다. 038-auto-update 는 병합됐고 0.2.0 → 0.2.1 자동 업데이트 확인이 남았다. 정책 소유자: 엔지니어링. 추천: 038 의 릴리스 확인이 끝난 뒤 이 변경을 릴리스한다.
5. AI 가 만든 목소리라는 표시 의무가 플랫폼마다 있다. 정책 소유자: 제품 책임자. 추천: 이번 변경에서는 표시 기능을 넣지 않고, 업로드 단계에서 사용자가 표시한다. 이유: 앱에 업로드 기능이 없다(0017).
6. Metal Toolchain 은 Xcode 구성 요소라 내장 디스크에 설치될 가능성이 크다(확인하지 않음). AGENTS.md 는 내장 디스크에 설치본만 둔다. 정책 소유자: 사용자. 추천: 개발 도구 설치본으로 보고 허용한다.

## 검증 기준
1. `pnpm verify` 가 종료 코드 0 이고 마지막 줄이 `✓ verify passed` 다.
2. 엔진 테스트: 가짜 `u3-tts`(진행 이벤트와 wav 를 내는 스크립트)로 항목 3개 작업이 결과 3개(`captionId`, `file`, `durationSec`)를 돌려준다.
3. 단위 테스트: 자막 클립 3개와 결과 3개로 목소리 트랙에 `tts-<captionId>` 클립 3개가 자막 시작 시각에 들어간다. 같은 id 의 이전 클립은 바뀌고 녹음 클립은 남는다.
4. 단위 테스트: 이모지(키캡·ZWJ 연결 포함)와 줄바꿈이 도우미 입력에서 빠진다.
5. 엔진 테스트: 취소하면 도우미 프로세스가 끝나고 `voice/tts-*.wav` 가 남지 않는다.
6. 엔진 테스트: 모델이 없으면 TTS 작업이 받기 단계를 먼저 실행한다(가짜 받기 함수).
7. 엔진 테스트: 내보내기 작업이 돌고 있으면 TTS 작업 시작이 거부된다.
8. `scripts/check-macos-executables.sh` 가 패키징한 `.app` 에서 통과한다(`Contents/MacOS` 에 metallib 없음).
9. 스파이크 S1 기록: 30초 대본 6장면 생성 시간 60초 이하, 최대 메모리, 사용자 청취 판정.
10. 패키징: `pnpm package` 로 만든 `.app` 에서 음성 만들기가 동작한다(GUI 확인, 스크린샷 경로 기록).
