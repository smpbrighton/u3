# Plan: desktop-studio (from spec.md)

## 검토 목록
사람이 읽고 정할 것만 둔다. 항목마다 추천과 근거를 적는다.

1. **받아 적기(STT)는 intent 승인 뒤에 더했다.** 이 plan 승인이 그 추가분(요구사항 13·14, 결정 0007)의 승인이다. 추천: 받는다. 이유: 자막과 AI 대본의 품질을 함께 올리고, 로컬에서 돌아 비용이 없다. 근거: `review.md` nit 1, `decisions/0007-whisper-stt.md`.
2. **자막 나누기 규칙을 16자에서 uUu `buildCaptionChunks`(측정 폭, 2줄 이내)로 바꿨다.** 사용자는 글자 수를 고칠 수 없다. 추천: 받는다. 이유: 글자 수 규칙은 세이프존 폭 검사에 걸려 내보내기를 막을 수 있다. 근거: `review.md` nit 5, uUu `src/core/captions.ts`.
3. **AI 추천 대본은 whisper 모델을 자동으로 받지 않는다.** 모델이 없으면 프레임만 본다. 추천: 받는다. 이유: 사용자가 고르지 않은 574 MB 받기를 막는다. 근거: `review.md` nit 10, `spec.md` 요구사항 14.
4. **원본 소리 트랙에도 음소거가 있다.** 추천: 둔다. 이유: 녹음 음성만 쓰는 영상에서 필요하고, 다른 오디오 트랙과 규칙이 같다. 근거: `spec.md` 데이터 `audio.source: Gain`.
5. **Jev 키가 설치 파일에 들어간다.** 추천: 내부 배포 동안만 허용한다. 이유: 키를 숨길 서버가 없다. 근거: `spec.md` 우려 사항 6.
6. **서명은 ad-hoc 으로 하고 내부 Mac 에서만 쓴다.** 추천: Developer ID 는 외부 배포 전에 정한다. 근거: `spec.md` 우려 사항 2.
7. **설치 파일은 수백 MB 이고, 처음 실행 뒤 받는 모델은 최대 2.7 GB 다.** 추천: 받는다. 근거: `spec.md` 우려 사항 3·11.
8. **codex 설치와 로그인은 터미널에서 한 번 한다.** 추천: 예외로 받는다. 근거: `spec.md` 우려 사항 4.
9. **타임라인 라이브러리는 MIT `@xzdarcy/react-timeline-editor` 다.** 유료 Remotion Editor Starter($600)는 쓰지 않는다. 추천: 받는다. 이유: Editor Starter 는 데스크톱 배포 허용이 문서에 없다. 근거: 결정 0005.
10. **`/smp:init` 이 만든 CLAUDE.md 정본을 AGENTS.md 정본으로 바꾼다.** 추천: 1단계에서 한다. 이유: 전역 규칙이 AGENTS.md 를 정본으로 정한다. 근거: 레포 `CLAUDE.md`, `AGENTS.md`.
11. **스파이크 4개 중 하나가 실패하면 구현을 멈추고 spec 을 고친다.** 추천: 받는다. 이유: 렌더 묶기, 분리, 받아 적기, 녹음이 모두 검증되지 않았다. 근거: `spec.md` 우려 사항 1·7·8·10.
12. **음성 분리 실행 공급자를 CoreML 먼저에서 CPU 만으로 바꿨다(0006 → 0008 대체).** 사용자가 스파이크 판정 뒤 받았다. 이유: S2 에서 CPU 가 60초 클립 3개 모두 더 빨랐고(19초 대 34~90초), CoreML 은 최대 메모리가 13~15 GB 였다. 근거: `docs/spikes/mrx.md`, `decisions/0008-voice-record-separate-cpu.md`.

13. **codex 모델·effort 를 설정에서 고르게 바꿨다(0002 → 0009 대체).** 기본은 `gpt-6-luna` 다. 설정 화면은 codex 사용 가능 여부만 보이고 경로는 찾지 못했을 때만 지정한다. 사용자가 구현 중에 받았다. 같은 때 캐러셀은 사이드바에 「준비 중」 메뉴로만 두기로 했다. 0003 은 바꾸지 않고, 캐러셀 기능은 새 변경으로 한다. 근거: `decisions/0009-codex-model-select-jev.md`.
## Context
uUu 는 사용자 PC 의 codex 세션과 로컬 도구를 써서 웹으로 배포할 수 없다. U3 는 uUu 의 핵심(영상·사진 입력, 대본, 짤, 효과음)만 옮긴 Tauri 설치형 앱이다. 영상 편집기형 다중 트랙 타임라인, 녹음, 음성 분리, 받아 적기를 더한다. 화면은 화면설계 아티팩트 https://claude.ai/artifact/KhEuMmtnQYHehoLgCfhAst 를 따른다. 구현은 다른 세션이 `/smp:resume desktop-studio` 로 이어받는다. 이 plan 만 읽고 구현할 수 있게 쓴다.

입력 문서: `architecture/changes/001-desktop-studio/{intent,spec,review}.md`, 결정 `0001`~`0007`.

## 바꿀 파일
새 레포라 모두 (new)다. 대표 경로만 적는다.

**레포 바탕**
- `AGENTS.md`: 정본으로 바꾼다. 커맨드·구조·컨벤션·「에이전트가 틀리는 것」. `CLAUDE.md` 는 지운다.
- `package.json`·`pnpm-lock.yaml`·`tsconfig*.json`·`vite.config.ts`·`vitest.config.ts`·`.env.example`·`.gitignore`
- `src-tauri/`: `tauri.conf.json`(externalBin: `binaries/u3-engine`, `binaries/whisper-cli`), `Info.plist`(NSMicrophoneUsageDescription), `entitlements.plist`(audio-input), `capabilities/default.json`(shell:allow-spawn sidecar), `src/main.rs`(sidecar 띄우기, 포트·토큰을 UI 에 넘기기)

**core (순수 모듈, `src/core/`)**
- 옮긴다(uUu `src/core/`): `captions.ts`, `measure.ts`, `fonts.ts`, `meme-segment.ts`, `meme-match.ts`, `meme-rank.ts`, `sfx.ts`, `mix.ts`, `jev-api.ts`, `geometry.ts`. `layout.ts`·`safezone.ts` 는 제목·자막 배치만 남기고 훅·CTA 를 지운다.
- `schema.ts`: U3 전용으로 새로 쓴다. `Input`, `Timeline`, `VideoClip`, `TextClip`, `AudioClip`, `Gain`, `Project`, 짤·효과음 사이드카, codex 대본 출력. uUu `schema.ts` 는 옮기지 않는다. 옮긴 모듈은 필요한 타입만 여기서 가져오게 고친다.
- `timeline/ops.ts`: 자르기, 트림, 이동, 지우기, 영상 트랙 이어 붙이기
- `timeline/history.ts`: 스냅숏 실행 취소 스택(최대 100개)
- `timeline/from-script.ts`: codex 대본 → `Timeline`
- `timeline/to-render.ts`: `Timeline` → Remotion 입력(프레임 단위)
- `transcript.ts`: whisper 출력 읽기, 입력 기준 시각 → 클립 시각 옮기기, 겹치는 자막 바꾸기

**Remotion (`src/remotion/`)**
- `Root.tsx`: `U3Short`(1080×1920·30fps) 하나
- `U3Short.tsx`: 영상 트랙(본 화면·사진·짤 반복), 자막, 오디오(원본·분리 트랙·짤 소리·음성·효과음)
- uUu 의 `SceneCaption` 과 짤 반복 재생 레이어를 옮긴다. uUu 의 `compose.ts`, `Short.tsx`, HookTitle, RevealFlash, CtaTail, Mosaic 은 옮기지 않는다.

**엔진 sidecar (`src/engine/`)**
- `main.ts`: 127.0.0.1 포트 0 에 바인딩하고, 일회용 토큰을 검사하고, stdout 에 `PORT <n>` 을 낸다
- `app.ts`·`http.ts`: uUu `src/server/app.ts`·`http.ts` 를 바탕으로 쓴다. `localOnly` 검사와 토큰 검사를 둔다
- `store.ts`: `~/Library/Application Support/U3/` 파일 저장소. uUu `store.ts` 의 잠금 방식을 따른다
- `jobs.ts`·`routes/events.ts`: 작업 큐(PQueue)와 SSE 진행률·취소
- `routes/`: `projects`, `inputs`, `script`, `memes`, `library`, `render`, `separate`, `transcribe`, `models`, `system`(codex 상태), `media`
- `pipeline/`:
  - 옮긴다: `codex.ts`(claude.ts·ai-accounts.ts 의존을 지우고 codex 경로·모델 `gpt-6-luna` 만 남긴다), `codex-schema.ts`, `jev.ts`, `ffmpeg.ts`, `media-server.ts`, `usage.ts`(codex·jev 만)
  - 일부만 옮긴다: `render.ts` 는 `getBundle`·`renderShort` 만. `meme-embed.ts`·`meme-rank.ts` 는 approval 에 묶인 `meme-import.ts` 대신 새 `library.ts` 의 `listMemes` 를 쓴다
  - 새로 쓴다: `library.ts`(짤·효과음 사이드카 읽기), `frames.ts`(영상마다 10장, 최대 40장), `separate.ts`(onnxruntime-node + MRX), `whisper.ts`(whisper-cli 실행), `models.ts`(bge-m3·whisper 받기와 진행률), `codex-path.ts`(로그인 셸로 경로 찾기, `codex login status`)

**UI (`src/ui/`)**
- `App.tsx`: 화면 전환과 sidecar 연결(포트·토큰)
- `screens/`: `Home`, `Input`, `Script`, `Studio`, `Settings`. 내보내기는 `ExportDialog`
- `studio/`: `Timeline.tsx`(`@xzdarcy/react-timeline-editor` 와 자르기·실행 취소 단축키), `Inspector.tsx`, `LibraryPanel.tsx`(미디어·짤·효과음·음성 탭), `Recorder.tsx`(MediaRecorder + wavesurfer.js v8), `Preview.tsx`(`@remotion/player`)
- SEED: `seed-design/ui/` 스니펫(SEED CLI 로 추가). 앞서 받은 SEED 검토의 높음·중간 9건을 화면에 반영한다(Page Banner, warning 색, 해요체, 버튼 위계, Attachment Input, 시스템 글꼴, Progress Circle).

**빌드·리소스 스크립트 (`scripts/`)**
- `build-engine.ts`: 엔진을 번들하고 Node 런타임과 함께 `src-tauri/binaries/u3-engine-aarch64-apple-darwin` 을 만든다(방식은 스파이크 S1 결과로 정한다)
- `build-whisper.sh`: whisper.cpp v1.9.5 를 `cmake -DBUILD_SHARED_LIBS=OFF -DGGML_METAL=ON` 으로 빌드하고 `otool -L` 로 확인한다
- `fetch-resources.ts`: 짤·효과음 라이브러리와 짤 색인을 `UUU_LIBRARY_DIR`(uUu `data/library`)과 `UUU_EMBED_DIR`(uUu `data/cache/meme-embed`)에서 `src-tauri/resources/` 로 복사한다. MRX int8 모델을 받아 체크섬을 확인한다. 리소스는 커밋하지 않는다
- `smoke.ts`: fixture 렌더와 ffprobe 검사
- `verify.sh`: typecheck → vitest → `cargo check` → smoke 순서로 돌고, 끝나면 `✓ verify passed` 를 낸다
- `test-models.ts`(`pnpm test:models`): 실제 whisper·MRX 모델로 확인한다. verify 에 넣지 않는다

**테스트 (`tests/`)**
- `core/timeline-ops.test.ts`, `history.test.ts`, `from-script.test.ts`, `to-render.test.ts`, `transcript.test.ts`, `captions.test.ts`(옮긴 것), `meme-rank.test.ts`
- `engine/codex.test.ts`(zod 검증, 가짜 runner), `jev.test.ts`(fakeJevClient), `library.test.ts`, `frames.test.ts`, `token.test.ts`(토큰 없는 요청 401, 다른 Origin 거부)
- `fixtures/`: `project/`(영상 1·사진 1, 짤 앞·뒤, 자른 클립, 음성 클립, 효과음), `whisper-output.json`, `ko-5s.wav`(macOS `say`)

**문서**
- `docs/spikes/{remotion-sidecar,mrx,whisper,mic}.md`: 스파이크 결과(수치·판정)

## 순서
1. **레포 바탕**: AGENTS.md 정본 전환, pnpm·Vite·React·vitest·Tauri 2 바탕, `verify.sh` 의 빈 통과. 이 단계 끝에 `pnpm verify` 가 통과한다.
2. **스파이크(go/no-go)**: 4개 모두 `docs/spikes/` 에 수치와 판정을 남긴다. 하나라도 판정이 no-go 면 멈추고 spec 변경을 사람에게 올린다.
   - S1 Remotion sidecar: Node 단일 실행 파일(SEA)과 "Node 바이너리 + JS 번들 리소스" 중 하나로, 설치한 .app 안에서 3초 composition 을 mp4 로 렌더한다. 헤드리스 Chrome·compositor 경로가 앱 번들 안에서 풀리는지 본다.
   - S2 MRX: onnxruntime-node(CoreML → CPU)로 실제 숏폼 60초 3개(말소리·음악·무음 포함)를 나눈다. 처리 시간과 청취 판정(목소리 잔향, 배경 누출)을 적는다.
   - S3 whisper: 정적 Metal 빌드를 만들고 S2 와 같은 3개를 받아 적는다. 속도, 글자 오류, `-ml 1 -sow` 와 `--dtw large.v3.turbo` 의 시각 어긋남, 무음·음악 구간 헛 문장을 적는다.
   - S4 마이크: ad-hoc 서명한 `pnpm tauri build` 앱에서 MediaRecorder 로 5초를 녹음하고 `audio/mp4` 가 지원되는지 본다.
3. **core 옮기기·새 schema**: 옮긴 모듈의 테스트를 같이 옮겨 통과시킨다.
4. **timeline core**: ops·history·from-script·to-render·transcript 와 단위 테스트.
5. **Remotion `U3Short`**: to-render 결과로 그린다. smoke fixture 를 만들고 smoke 를 verify 에 넣는다.
6. **엔진 sidecar**: 서버·토큰·store·작업 큐, codex·jev·짤 순위·프레임·렌더 라우트. 그다음 separate·whisper·models 라우트.
7. **UI**: Home → Input → Script → Studio(타임라인·속성·라이브러리·미리보기) → Recorder → ExportDialog → Settings. 화면은 아티팩트와 SEED 검토 반영을 따른다.
8. **패키징**: build-engine·build-whisper·fetch-resources 를 `pnpm tauri build` 앞에 묶는다. Jev 키가 비면 빌드가 실패해야 한다.
9. **마감 확인**: 증명 절의 수동 항목을 실행하고 결과를 `docs/spikes/` 옆 `docs/manual-check.md` 에 적는다.

## 리스크
- **가장 위험한 단계는 2-S1(Remotion 을 sidecar 로 묶기)이다.** 실패하면 렌더 경로 전체가 바뀐다. 그래서 다른 구현보다 먼저 둔다.
- MRX 품질이 모자라면 음성 분리의 쓸모가 줄어든다. 대안 Mel-Band RoFormer(464 MB)는 별도 받기 옵션으로 둔다.
- whisper 단어 시각이 어긋나면 자막이 말과 맞지 않는다. 대체 방식은 문장 시각을 글자 수로 나누는 것이다.
- `@xzdarcy/react-timeline-editor` 가 영상 트랙의 이어 붙이기를 직접 지원하지 않으면, 앱이 드래그가 끝난 뒤 ops 로 다시 정렬한다.
- 212 MB 라이브러리를 git 에 넣지 않으므로, 빌드 머신에 uUu `data/` 가 있어야 한다.
- 택하지 않은 대안:
  - Rust 로 엔진 다시 짜기: uUu Node 코드를 다시 쓸 수 없다.
  - Remotion Editor Starter: 데스크톱 배포 허용이 문서에 없다.
  - Demucs: 가중치가 연구용 라이선스다.
  - Python sidecar: 앱에 Python 런타임이 생긴다.
  - 라이브러리 git LFS: 지금은 빌드 머신이 하나다.

## 증명
- **검증 명령**: `pnpm verify` 가 종료 코드 0 이고 마지막 줄에 `✓ verify passed` 를 낸다. 내용은 typecheck(app·engine·ui), vitest, `cargo check --manifest-path src-tauri/Cargo.toml`, smoke 다.
- **smoke**: fixture 프로젝트를 엔진 렌더로 mp4 로 만들고 ffprobe 로 아래를 확인한다. 결과 경로는 `out/smoke/`다.
  - 1080×1920, 30fps
  - 길이가 Timeline 합계 ±1프레임
  - 오디오 스트림이 있고 무음이 아님
  - 자른 클립 경계 프레임이 원본의 해당 시각과 일치
- **단위 테스트**:
  - 자르기·트림·지우기 뒤 영상 트랙 이어 붙이기, 실행 취소 100개 상한
  - 대본 → Timeline, Timeline → 렌더 입력
  - 받아 적은 시각을 자른 클립·순서 바꾼 클립으로 옮기기, 클립 밖 단어 버리기, 겹치는 자막 바꾸기
  - codex 출력 zod 거부, Jev 실패 시 규칙 점수
  - 토큰 없는 요청 거부
- **`pnpm test:models`**(수동): 실제 whisper 로 `ko-5s.wav` 를 받아 적어 글자가 비지 않는지 본다. MRX 출력 두 파일의 길이가 입력과 같은지 본다.
- **수동 확인**(`docs/manual-check.md` 에 결과와 스크린샷 경로를 적는다):
  - `pnpm tauri build` 로 만든 .dmg 를 설치한다. Node·Python 이 없는 계정에서 실행한다.
  - codex 로그인 상태 감지와 대본 생성을 확인한다. 로그아웃 상태에서는 버튼이 막히는지 본다.
  - Jev 판정과 bge-m3·whisper 받기 진행률을 확인한다.
  - 마이크 녹음을 확인한다(서명 빌드).
  - 음성 분리 60초 처리 시간과 받아 적기 정확도를 잰다.
  - mp4 를 내보내 iPhone 에서 재생한다.
- 실행하지 못한 항목은 통과로 적지 않는다.

## 롤백
- 새 레포라 데이터 마이그레이션이 없다. 단계마다 커밋하고, 문제가 생기면 그 단계의 커밋을 되돌린다.
- 스파이크가 no-go 면 그 뒤 단계를 시작하지 않는다. spec 변경을 새 변경으로 올린다.
- 사용자 데이터(`~/Library/Application Support/U3/`)는 앱을 지워도 남는다. 지우는 것은 사용자가 한다.
