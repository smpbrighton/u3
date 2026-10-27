# Review: qwen-tts
Author: claude-opus-5-5[1m]. Status: accepted. Round: 1.

## 대조한 것
- 변경: `architecture/changes/040-qwen-tts/intent.md`, `architecture/changes/040-qwen-tts/spec.md`
- 지침: `AGENTS.md`, `architecture/INTENT.md`
- 유효 결정: `architecture/decisions/0001-tauri-node-sidecar.md`, `0004-bundled-library-lazy-model.md`, `0007-whisper-stt.md`, `0008-voice-record-separate-cpu.md`, `0013-generation-merge-clips-memes.md`, `0016-caption-layers-opacity-brand.md`, `0018-codex-jev-box.md`, `0021-auto-update.md`, `0022-scope-add-tts.md`, `0023-qwen-tts-local.md`. 대체된 `0017-scope-carousel-two-modes.md` 는 0022 와의 차이만 봤다.
- 위키: `architecture/wiki/index.md`, `pages/concept-local-models.md`, `pages/concept-timeline-editing.md`, `pages/entity-desktop-app.md`, `pages/entity-engine-shutdown.md`
- 진행 중인 변경(장부 `ledger.sh show`): 039-script-voice(`/Volumes/X31/workspace/smp_workspace/u3-039-script-voice/architecture/changes/039-script-voice/plan.md`), 038-auto-update·037-brand-title-content(워크트리 없음, 이 워크트리의 `plan.md`), 001 워크트리인 main(`f49516e` 의 0021·INTENT 수정). `git merge-tree HEAD main` 은 충돌이 없다.
- 코드: `src-tauri/tauri.bundle.conf.json`, `src-tauri/tauri.release.conf.json`, `scripts/check-macos-executables.sh`, `scripts/sign-nested.sh`, `scripts/release.sh`, `scripts/build-whisper.sh`, `src/core/schema.ts`, `src/core/timeline/from-script.ts`, `src/ui/screens/Script.tsx`, `src/ui/screens/Settings.tsx`, `src/ui/studio/timeline-adapter.ts`, `src/engine/pipeline/models.ts`, `src/engine/routes/{models,transcribe,separate,script,system}.ts`, `src/engine/jobs.ts`
- 환경: 이 Mac 의 칩·메모리·OS(`Apple M6`, 24 GiB, macOS 27.0.1)와 `xcrun metal` 실행 결과.

## 발견

### Important
1. **`default.metallib` 를 실행 파일 옆에 두면 결정 0021 을 어긴다.** spec 「도우미 실행 파일」은 `u3-tts` 를 Tauri `externalBin` 에 넣고 `default.metallib` 를 실행 파일 옆에 둔다고 쓴다. `externalBin` 은 `Contents/MacOS` 에 들어간다(`src-tauri/tauri.bundle.conf.json` 의 `binaries/whisper-cli`). 0021 은 "`Contents/MacOS` 에는 Mach-O 만 둔다"고 정했다. `scripts/check-macos-executables.sh` 는 Mach-O 가 아닌 파일이 있으면 실패하고, `scripts/release.sh:138` 이 서명 전에 이 검사를 부른다. 그대로 구현하면 릴리스와 자동 업데이트 파일 생성이 멈춘다. 검증 기준 7 은 `pnpm package`(ad-hoc, 이 검사를 부르지 않음)만 보므로 이 실패를 잡지 못한다. 근거: `architecture/decisions/0021-auto-update.md`, `scripts/check-macos-executables.sh`, `scripts/release.sh`, `tests/scripts/macos-executables.test.ts`.
2. **모델이 없을 때의 동작이 결정 0023 과 다르다.** 0023 은 "사용자가 설정에서 받기를 누르거나 처음 음성 만들기를 누를 때 받는다"고 정했다. spec 요구사항 2 는 모델이 없으면 「음성 만들기」가 받기 안내를 보인다고 쓰고, 검증 기준 5 는 TTS 라우트가 409 와 받기 안내를 돌려준다고 쓴다. 첫 「음성 만들기」에서 받기를 시작하는 경로가 spec 에 없다. spec 을 0023 에 맞추거나 0023 을 새 결정으로 대체해야 한다. 근거: `architecture/decisions/0023-qwen-tts-local.md`, `architecture/changes/040-qwen-tts/spec.md`(요구사항 2, 검증 기준 5).
3. **039-script-voice 와 같은 파일·같은 영역을 고친다.** 039 plan 은 `src/ui/screens/Settings.tsx` 의 대본 프롬프트 영역에서 "자막 검수" 입력란을 지우고, `src/engine/routes/system.ts` 의 `/api/system/script-voice` 에서 `review` 를 지우고, `src/ui/screens/Script.tsx` 의 경고 줄에 `styleWarnings` 를 붙인다. 040 spec 은 같은 대본 항목에 화자 선택과 말투 지시를 더하고, 같은 `Script.tsx` 에 버튼·진행률·장면 경고를 더한다. `ttsSpeaker`·`ttsInstruct` 를 어느 라우트로 저장하는지는 spec 에 없다. `script-voice` 라우트에 넣으면 그 라우트도 겹친다. 039 는 장부에서 "구현 대기(사용자 지시로 보류)"이므로 병합 순서가 정해지지 않았다. 또 039 는 이모지를 `\p{Extended_Pictographic}` 로 정의한다(`src/core/script-style.ts` 예정). 040 요구사항 5 의 이모지 제거 규칙은 정의가 없다. 두 변경이 다른 정의를 쓰면 039 가 허용한 이모지 일부(키캡 `1️⃣` 의 `U+FE0F`·`U+20E3`, ZWJ 연결 문자 등)가 TTS 입력에 남을 수 있다(추정, 확인하지 않음). 근거: `/Volumes/X31/workspace/smp_workspace/u3-039-script-voice/architecture/changes/039-script-voice/plan.md`, `src/ui/screens/Settings.tsx:377`, `src/engine/routes/system.ts:210-229`.

### nit
1. **"장면 시각(`startSec`)이 이미 타임라인에 있다"는 사실과 다르다.** spec 열린 질문 2 의 답은 이 전제로 장면 단위를 골랐다. `ScriptScene.startSec` 은 원본 영상의 구간 시작이고 사진 장면은 `null` 이다(`src/core/schema.ts:232-235`). 타임라인 위치는 `timelineFromScript` 가 `cursor` 로 계산하고 저장하지 않는다(`src/core/timeline/from-script.ts:46-56`). 0013 은 이어지는 장면을 영상 1 클립 하나로 합치므로 영상 클립에도 장면 경계가 없다. 위키는 효과음을 "자막 시작 시각"에 놓는다고 적는다(`architecture/wiki/pages/concept-timeline-editing.md`). 사용자가 타임라인을 자르거나 옮긴 뒤에 장면 시작 시각을 어디서 구하는지 spec 에 없다. 또 `script.json` 은 스튜디오에서 고친 자막을 반영하지 않으므로, caption 을 `script.json` 에서 읽으면 고치기 전 글로 음성을 만든다.
2. **대본 화면에는 장면 목록이 없고, 대본을 다시 만들면 목소리 트랙이 비워진다.** `Script.tsx` 는 대본을 만든 즉시 `timelineFromScript` 로 타임라인을 저장하고 스튜디오로 간다(`src/ui/screens/Script.tsx:154-163`). 장면별 경고를 붙일 목록이 화면에 없다. `timelineFromScript` 는 `voice: []` 를 돌려준다(`src/core/timeline/from-script.ts:119`). 대본을 다시 만들면 TTS 클립과 녹음 클립이 함께 사라진다. 이 동작은 지금도 녹음에 대해 같지만, TTS 는 대본 화면에서 시작하므로 사용자가 이 경로를 더 자주 밟는다.
3. **누가 언제 클립을 프로젝트에 넣는지 spec 에 없다.** 요구사항 8 은 취소 때 "이미 넣은 클립은 남긴다"고 써서 작업 중에 클립을 하나씩 넣는다는 뜻으로 읽힌다. 엔진이 넣으면 기존 `separate` 처럼 작업 시작 때의 프로젝트 사본을 저장해 그동안의 사용자 편집을 덮을 수 있다(`src/engine/routes/separate.ts:49`). UI 가 넣으면 결과를 받는 시점과 형식(`done(...)` 페이로드)이 정해져야 한다. 30초 대본에 최대 60초가 걸리는 작업이라 그 사이 편집이 일어날 수 있다.
4. **클립과 파일의 식별자가 서로 다르다.** 「데이터」는 클립 `id` 를 `tts-<sceneIndex>` 로 짓는다. 「엔진」의 라우트는 `/tts/:sceneId` 이고 파일은 `voice/tts-<sceneId>.wav` 다. `ScriptScene` 에는 `id` 가 없다. 대본을 다시 만들면 같은 `sceneIndex` 가 다른 장면을 가리키므로, 다시 만들기가 엉뚱한 클립 자리를 바꿀 수 있다.
5. **우려 사항 3 의 추천이 요구사항·설계·검증 기준에 없다.** 추천은 내보내기와 TTS 를 동시에 돌리지 않게 작업 큐에서 막는 것이다. `jobs.ts` 는 같은 `key` 의 작업만 막고, 내보내기(`render`)와 음성 분리는 `key` 가 없다(`src/engine/routes/render.ts:24`, `src/engine/routes/separate.ts:33`). 음성 분리는 최대 메모리 6.4 GB 를 쓴다(0008). 막을 작업 종류의 목록이 정해지지 않았다.
6. **이 Mac 에는 Metal Toolchain 이 없다.** `xcrun metal --version` 은 "missing Metal Toolchain; use: xcodebuild -downloadComponent MetalToolchain" 으로 실패한다. `default.metallib` 를 빌드하려면 이 구성 요소가 필요하다(MLX 빌드 요건은 추정, 소스로 확인하지 않음). 스파이크 S1 과 빌드 단계의 선행 조건에 없다. 구성 요소를 받는 위치가 내장 디스크인지 확인하지 않았다. AGENTS.md 는 내장 디스크에 설치본만 두도록 한다.
7. **가중치 출처가 정해지지 않았다.** `QWEN_TTS_FILES` 의 Hugging Face 레포가 spec 에 없다. 의도의 라이선스 확인은 공식 Qwen 레포 기준이다. swift-qwen3-tts 가 공식 가중치를 그대로 읽는지, MLX 로 바꾼 별도 레포(예: 8bit 판)를 요구하는지는 확인하지 않았다(추정). 우려 사항 2 의 8bit 판을 쓰면 다른 레포가 되므로 그 레포의 라이선스와 고정 revision 도 따로 확인해야 한다.
8. **장면보다 긴 음성은 다음 장면의 음성과 겹쳐 함께 들린다.** 목소리 트랙은 한 줄이다(`src/ui/studio/timeline-adapter.ts:100`). 요구사항 6 은 경고만 보이므로, 겹친 두 클립이 동시에 재생되고 타임라인에서 서로 가려진다. 녹음 클립이 이미 있는 구간에 TTS 를 넣을 때도 같다.
9. **우려 사항 4 의 추천이 지난 상태를 전제로 한다.** "038 병합 뒤 이 변경을 병합한다"고 쓰지만 038 은 이미 병합됐다(이 브랜치의 기준 `b9f7c76`). 장부의 038 남은 일은 `release.sh` 0.2.0 → 0.2.1 자동 업데이트 확인이다. 040 이 기다릴 대상은 병합이 아니라 이 릴리스 확인이다.
10. **0.6B 로 내리면 말투 지시 설정이 동작하지 않는다.** 열린 질문 4 의 답은 말투 지시가 1.7B 에서만 동작한다고 쓴다. 열린 질문 7·0023 은 S1 결과에 따라 0.6B 로 내릴 수 있다. 그때 설정의 말투 지시 입력을 숨길지, 무시할지 정해지지 않았다.

## 처리
| # | 발견 | 판단 |
|---|------|------|
| I1 | metallib 를 `Contents/MacOS` 에 두면 0021 위반 | 채택 |
| I2 | 모델 없을 때 동작이 0023 과 다름 | 채택 |
| I3 | 039 와 같은 파일·영역, 이모지 정의 불일치 | 채택 |
| n1 | 장면 `startSec` 은 타임라인 시각이 아님 | 채택 |
| n2 | 대본 화면에 장면 목록 없음, 대본 재생성 때 목소리 트랙 비움 | 일부 채택 |
| n3 | 클립을 넣는 주체·시점 없음 | 채택 |
| n4 | 클립·파일 식별자 불일치 | 채택 |
| n5 | 동시 실행 막기가 설계에 없음 | 채택 |
| n6 | Metal Toolchain 없음 | 채택 |
| n7 | 가중치 레포 미정 | 채택 |
| n8 | 긴 음성이 다음 음성과 겹침 | 일부 채택 |
| n9 | 038 은 이미 병합됨 | 채택 |
| n10 | 0.6B 에서 말투 지시 동작 미정 | 채택 |

- I1 채택: metallib 를 `Contents/Resources` 에 둔다. 검증 기준 8 에 `check-macos-executables.sh` 를 넣었다. 0023 을 같은 내용으로 고쳤다.
- I2 채택: 첫 음성 만들기가 받기부터 한다(요구사항 2, 검증 기준 6). 409 응답을 지웠다.
- I3 채택: TTS 설정은 새 라우트 `/api/system/tts-settings` 와 새 설정 "음성" 항목에 둔다. 이모지 정의는 039 의 `script-style.ts` 를 쓰고 결합 문자를 함께 지운다. 장부 `depends_on` 에 script-voice 를 적어 039 를 먼저 병합한다.
- n1·n4 채택: 단위를 첫 자막 레이어의 메인 자막 클립으로 바꿨다. 클립 id·파일 이름·라우트가 모두 `captionId` 를 쓴다. 0023 을 같은 내용으로 고쳤다.
- n2 일부 채택: 버튼을 편집 화면으로 옮겼다. 대본을 다시 만들면 목소리 트랙이 비워지는 동작은 녹음에도 이미 있는 동작이라 이번 변경에서 바꾸지 않는다(YAGNI).
- n3 채택: 엔진은 파일과 결과 목록만 돌려준다. 생성이 끝나면 UI 가 지금 타임라인에 넣는다. 취소하면 클립을 넣지 않는다(요구사항 8 변경).
- n5 채택: TTS·render·separate 가 key `heavy-media` 를 쓴다(요구사항 11, 우려 사항 3, 검증 기준 7).
- n6 채택: S1 선행 조건과 빌드 절에 Metal Toolchain 을 넣었다. 내장 디스크 설치는 우려 사항 6 으로 올렸다.
- n7 채택: S1 에서 레포·revision·라이선스를 정하고 기록한다. 우려 사항 2 에 8bit 레포 라이선스 조건을 넣었다.
- n8 일부 채택: 경고 문구에 겹쳐 들린다는 사실을 넣었다. TTS 전용 목소리 줄(lane)은 이번 변경 크기보다 커서 넣지 않는다.
- n9 채택: 우려 사항 4 를 038 릴리스 확인 기준으로 고쳤다.
- n10 채택: 0.6B 로 내리면 말투 지시 입력을 숨긴다(열린 질문 4).
