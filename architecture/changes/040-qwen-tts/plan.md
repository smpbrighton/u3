# Plan: qwen-tts (from spec.md)

## 검토 목록
사람이 결정할 항목만 둔다. 각 항목에 추천, 이유, 근거 경로를 적는다.
1. **critic 이후 사용자에게 보이는 동작 변경:** 「음성 만들기」 버튼을 대본 화면에서 편집 화면 목소리(「음성」) 트랙으로 옮겼다. 생성 단위는 대본 장면에서 첫 자막 레이어의 자막 클립으로 바꿨다. 취소하면 클립을 하나도 넣지 않는다. **추천:** 그대로 받는다. **이유:** 대본 화면은 대본을 만들면 바로 편집 화면으로 간다. 장면에는 타임라인 시각이 없다. **근거:** `review.md` I2·n1·n2·n3, `src/ui/screens/Script.tsx:154-163`.
2. **내보내기·음성 분리·TTS 동시 실행 막기(우려 3):** 지금은 내보내기와 음성 분리가 동시에 돈다. 이 변경 뒤에는 동시에 돌지 않는다. **추천:** 막는다. **이유:** 음성 분리는 최대 6.4 GB, 1.7B bf16 은 약 4.5 GB 를 쓰고, 이 Mac 의 메모리는 24GB 다. **근거:** spec 요구사항 11, 결정 0008.
3. **critic 일부 채택 n2:** 대본을 다시 만들면 목소리 트랙이 비워진다. 이 동작은 녹음 클립에도 이미 있다. 이번 변경에서 고치지 않는다. **추천:** 고치지 않는다. **이유:** 고치면 일이 이번 변경보다 커진다. **근거:** `src/core/timeline/from-script.ts:119`.
4. **critic 일부 채택 n8:** 음성이 자막 클립보다 길면 다음 음성과 겹쳐 함께 들린다. 이번 변경은 경고만 보인다. TTS 전용 줄은 만들지 않는다. **추천:** 경고만 둔다. **이유:** 줄을 나누려면 타임라인 줄 구조를 바꿔야 한다. **근거:** `src/ui/studio/timeline-adapter.ts:100`.
5. **Python 을 넣지 않음(우려 1):** S1 에서 Swift 도우미가 1.7B CustomVoice 를 읽지 못하면 이 계획을 멈춘다. 그 뒤 0.6B 로 갈지 사람에게 묻는다. **추천:** Python(mlx-audio)은 넣지 않는다. **이유:** 번들 크기와 서명 부담이 커지고 결정 0007·0008 의 전제가 깨진다. **근거:** spec 우려 1.
6. **8bit 모델(우려 2):** **추천:** S1 에서 8bit 판이 품질 기준을 넘고 라이선스가 Apache-2.0 이면 8bit 를 쓴다. **이유:** 받기 용량이 약 절반이 된다.
7. **Metal Toolchain 내장 디스크 설치(우려 6):** S1 전에 `xcodebuild -downloadComponent MetalToolchain` 을 실행한다. **추천:** 개발 도구 설치본으로 보고 허용한다. **이유:** 이 도구가 없으면 MLX 의 `default.metallib` 를 빌드할 수 없다. **근거:** critic n6 의 `xcrun metal` 실패.
8. **AI 음성 표시(우려 5):** **추천:** 이번 변경에서는 표시 기능을 넣지 않는다. **이유:** 앱에 업로드 기능이 없다.
9. **병합 순서:** 039-script-voice 를 먼저 병합한다. 040 은 039 의 `src/core/script-style.ts` 이모지 정의를 쓰고 `Settings.tsx` 를 함께 고친다. 장부 `depends_on` 에 적었다.

## 바꿀 파일
- `native/u3-tts/` (new): Swift 패키지. swift-qwen3-tts 를 고정 커밋으로 의존한다. `main.swift` 가 표준 입력 JSON 을 읽고 wav 와 진행 이벤트를 낸다. metallib 경로는 인자로 받는다.
- `scripts/build-tts.sh` (new): `native/u3-tts` 를 release 로 빌드한다. 빌드 산출물은 `U3_BUILD_CACHE` 에 둔다. 결과를 `src-tauri/binaries/u3-tts-aarch64-apple-darwin` 과 `src-tauri/resources/tts/default.metallib` 로 복사한다. 시스템 밖 dylib 의존이 있으면 실패한다(`scripts/build-whisper.sh` 와 같은 검사).
- `docs/spikes/qwen-tts.md` (new): S1 측정 기록.
- `package.json`: `package` 스크립트에 `bash scripts/build-tts.sh` 를 더한다.
- `src-tauri/tauri.bundle.conf.json`·`tauri.release.conf.json`: `externalBin` 에 `binaries/u3-tts`, `resources` 에 metallib 를 더한다.
- `scripts/fetch-resources.ts`: 라이선스 파일(swift-qwen3-tts MIT, mlx-swift MIT, Qwen3-TTS Apache-2.0)을 더한다.
- `src/engine/pipeline/models.ts`: `QWEN_TTS_FILES`, `qwenTtsReady`, `downloadQwenTts`. 기존 `downloadModelFile` 을 쓴다.
- `src/engine/pipeline/tts.ts` (new): `runTts({ binary, metallib, modelDir, speaker, instruct, items, outDir, signal, onProgress })`. 취소하면 프로세스를 끝내고 만든 파일을 지운다.
- `src/engine/routes/tts.ts` (new): `POST /api/projects/:id/tts`. 모델이 없으면 받기부터 한다. 결과는 `[{captionId, file, durationSec}]` 다.
- `src/engine/routes/render.ts`·`separate.ts`: `jobs.start` 에 `key: "heavy-media"` 를 더한다.
- `src/engine/routes/models.ts`: TTS 모델 상태와 받기.
- `src/engine/routes/system.ts`: `GET·PUT /api/system/tts-settings`.
- `src/engine/app.ts`: tts 라우트를 등록한다.
- `src/core/tts-clips.ts` (new): `ttsItemsFromTimeline(timeline)`(이모지·결합 문자·줄바꿈 제거, 빈 글 제외)와 `applyTtsResults(timeline, results)`(`tts-<captionId>` 를 바꾸고 녹음 클립은 남김), `ttsOverflow(timeline)`(자막보다 긴 클립 목록).
- `src/ui/studio/Timeline.tsx`: 「음성」 트랙 머리에 「음성 만들기」 버튼과 진행률. 끝나면 `applyTtsResults` 로 지금 타임라인을 고쳐 저장한다.
- `src/ui/studio/Inspector.tsx`: TTS 클립에 「다시 만들기」(항목 하나로 같은 라우트)와 길이 경고.
- `src/ui/screens/Settings.tsx`: 모델 항목에 TTS 모델 받기. 새 「음성」 항목에 화자 선택과 말투 지시.
- 테스트(new): `tests/core/tts-clips.test.ts`, `tests/server/tts.test.ts`(가짜 도우미 스크립트와 가짜 받기 함수), `tests/server/tts-settings.test.ts`, `tests/server/jobs.test.ts` 에 heavy-media 막기 단언.

## 순서
1. **S1 선행:** Metal Toolchain 을 설치한다. 설치 위치를 기록한다.
2. **S1:** `native/u3-tts` 시험판과 `scripts/build-tts.sh` 를 만든다. 1.7B CustomVoice(bf16·8bit)와 0.6B CustomVoice 를 읽는다. 30초 한국어 대본 6장면으로 생성 시간, 최대 메모리, whisper 일치율을 잰다. metallib 를 `Contents/Resources` 와 같은 상대 위치에서 읽는지 확인한다. 레포·revision·라이선스와 함께 `docs/spikes/qwen-tts.md` 에 적는다.
3. **S1 게이트:** 사용자가 wav 를 듣고 판정한다. 1.7B 를 읽지 못하거나, 60초를 넘거나, 사용자가 품질을 거부하면 여기서 멈추고 보고한다. 계속하면 고른 모델(bf16 또는 8bit)을 결정 0023 결과 절에 적는다.
4. `src/core/tts-clips.ts` 테스트를 쓰고 구현한다.
5. `models.ts`·`tts.ts`·`routes/tts.ts`·`routes/models.ts` 의 테스트를 쓰고 구현한다.
6. render·separate·tts 에 `heavy-media` key 를 넣고 테스트한다.
7. `tts-settings` 라우트를 테스트하고 구현한다.
8. UI(편집 화면 버튼·인스펙터·설정)를 구현한다.
9. 패키징 설정과 라이선스 파일을 고친다.
10. `pnpm verify` 를 실행한다. `pnpm package` 를 실행한다. 패키징한 `.app` 에 `scripts/check-macos-executables.sh` 를 실행한다.
11. 패키징한 앱에서 GUI 로 확인한다(증명 6).

## 리스크
- **가장 위험한 단계는 S1 이다.** swift-qwen3-tts 의 지원 목록에 1.7B CustomVoice 가 없다. MLX 가 `Contents/Resources` 의 metallib 를 읽는지도 확인하지 않았다. 둘 중 하나라도 실패하면 3단계에서 멈춘다.
- 서명·공증: `u3-tts` 가 MLX 를 정적으로 링크하는지 확인하지 않았다. 동적 dylib 가 생기면 `build-tts.sh` 검사가 실패한다. 그때는 dylib 를 `Contents/Frameworks` 에 두는 안을 S1 기록에 적고 멈춘다.
- 메모리: 생성 중에 codex 대본 생성이 함께 돌면 메모리가 부족할 수 있다. codex 는 이번 key 에 넣지 않는다. S1 에서 최대 메모리를 재고, 남는 메모리가 6 GB 미만이면 보고한다.
- 039 와의 충돌: 040 을 039 위에 rebase 하지 않으면 `Settings.tsx` 가 충돌한다. `depends_on` 이 막는다.
- 택하지 않은 대안: Python mlx-audio 동봉(번들·서명 부담), 0.6B 기본(한국어 WER 3.053), 엔진이 타임라인에 직접 클립 넣기(생성 중 사용자 편집을 덮음, critic n3).

## 증명
1. `pnpm verify` 가 종료 코드 0 이고 마지막 줄이 `✓ verify passed` 다.
2. `tests/core/tts-clips.test.ts`: 자막 클립 3개와 결과 3개로 `tts-<captionId>` 클립 3개가 자막 시작 시각에 들어간다. 이전 TTS 클립은 바뀌고 녹음 클립은 남는다. 키캡·ZWJ 이모지와 줄바꿈이 입력에서 빠진다.
3. `tests/server/tts.test.ts`: 가짜 도우미로 결과 3개를 돌려준다. 취소하면 `voice/tts-*.wav` 가 남지 않는다. 모델이 없으면 받기 함수가 먼저 불린다. 내보내기 작업 중에는 TTS 시작이 거부된다.
4. `docs/spikes/qwen-tts.md`: 30초 대본 6장면 생성 시간(60초 이하), 최대 메모리, whisper 일치율, 사용자 청취 판정, 모델 레포·revision·라이선스.
5. 패키징한 `.app` 에서 `scripts/check-macos-executables.sh` 가 종료 코드 0 이다.
6. GUI: 패키징한 앱에서 대본을 만들고 「음성 만들기」를 누른다. 목소리 트랙에 클립이 들어가고 미리보기에서 소리가 난다. 스크린샷 경로를 기록한다.
7. 미검증 항목은 완료 보고에 그대로 적는다.

## 롤백
- 새 설정 키(`ttsSpeaker`·`ttsInstruct`)와 `voice/tts-*.wav` 는 기존 데이터를 바꾸지 않는다. 커밋을 되돌리면 TTS 클립은 일반 음성 클립으로 남는다.
- 받은 모델 파일은 모델 캐시 폴더에 남는다. 지우려면 설정의 모델 항목에서 지운다. 지우는 기능이 없으면 폴더를 직접 지운다.
- 결정 0022·0023 을 되돌리려면 새 결정으로 대체한다.
