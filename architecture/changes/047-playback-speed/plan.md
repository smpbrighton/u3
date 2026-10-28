# Plan: playback-speed (from spec.md)

구현은 codex 워커, diff 대조는 세션. 워크트리는 0.3.1(`2cb7f1f`)에서 갈라졌으므로 구현 전에 main 을 rebase 한다. 병합 순서: 048 → 047 → 049.

## 검토 목록
1. **영상 1 단축 때 끝을 넘는 오버레이를 거절하지 않고 앞당긴다·자른다**(critic I2 반영, spec Q3). 추천: 채택. 이유: 자동 생성 프로젝트는 뒤 짤이 장면 끝에 붙어 있어 거절하면 주 동선이 막힌다. 근거 `spec.md` (a).
2. **자막 편집기·장면 검토 상한을 영상 끝에서 프로젝트 끝으로 넓힌다**(critic I1). 추천: 채택. 이유: 가속 뒤 영상 끝 밖 자막을 고칠 수 없게 된다. 사용자는 자막을 영상 끝 뒤(검은 화면)까지 끌 수 있게 된다. 근거 `spec.md` Q3.
3. **경고 문구 「다음 음성과 겹쳐요」→「자막보다 음성이 길어요」**(critic n4). 추천: 채택. 이유: 경고의 실제 판정이 자막 길이 초과다. 근거 `spec.md` (b).
4. **캐시 메타데이터를 Timeline 이 아니라 Project 의 `audioCache` 에 둔다**(세션 설계 선택). 추천: 채택. 이유: 캐시 생성이 실행 취소 이력에 들어가지 않고(요구사항 8), 실행 취소로 옛 배속에 돌아가도 옛 캐시가 남아 즉시 재생된다. spec 의 「클립의 선택 메타데이터」를 이 형태로 구체화한다.
5. **계획 밖 발견: stem-voice·stem-bg 레이어가 분리한 WAV 가 아니라 원본 영상 소리를 재생한다**(`U3Short.tsx:226-227`, `preview-sources.ts:20-21`). 이 변경은 고치지 않고 세 레이어 모두 같은 원본 소리 캐시를 쓴다. 별도 변경으로 올린다.
6. **결정 파일**: 0031 `playback-speed`(D1–D5 요약, 0016·0023 보완). INTENT.md 편집 모델 줄에 「클립 배속 → 0031」 추가.

## Context
사용자는 영상 클립과 음성(TTS·녹음) 클립의 재생 속도를 0.5–2.0 배로 바꾸고 싶다. 지금 schema 에는 `speed` 가 없고 모든 길이 계산이 원본 1초 = 타임라인 1초다(`ops.ts`, `to-render.ts`, `timeline-adapter.ts`, `overlay-layers.ts`, `video-track-edits.ts`, `video-groups.ts`, `carousel-frame.ts`). 영상은 Remotion `playbackRate` 로, 음성은 ffmpeg `atempo` 후처리 WAV 로 배속한다(spec D2·D3). heavy-media 에는 대기열이 없고 `requireHeavyMediaIdle` 이 409 만 던진다(`routes/tts.ts:13`).

## 바꿀 파일
**core**
- `src/core/schema.ts`: `Speed = z.number().finite().min(0.5).max(2)` 선택 필드를 `VideoClipProperties`·`OverlayProperties`·`AudioClip` 에. superRefine: 사진·짤(`durationSec` 형)과 sfx lane 클립의 `speed` 가 1 이 아니면 거절. 전환 검증은 배속 반영 길이로. `Project`·`ProjectRecord` 에 `audioCache?: Record<string, { file: string; durationSec: number; version: string }>`(키 `"<sourceId>:<speed>"`, sourceId 는 inputId 또는 음성 `file`). 수동 타입에도 추가.
- `src/core/timeline/speed.ts` (new): `clipSpeed(clip)`, `playLength(inStart, inEnd, speed)`, `sourceAt(clip, timelineOffset)`(`inStartSec + offset*speed`), `timelineOffsetOf(clip, sourceSec)`, `cacheKey(sourceId, speed)`, `audioClipLength(clip, cache?)`(캐시가 있으면 `min((inEnd-inStart)/speed, cache.durationSec - inStart/speed)`).
- `src/core/timeline/ops.ts`: `clipDuration`·`overlayDuration` 이 `speed` 로 나눔. `projectDuration(timeline)`(영상·자막·음성 끝 최댓값) 추가. `setCaptionRange`·`addCaptionClip` 상한을 `projectDuration` 으로. split·trim·move(overlay·video·audio)의 원본 좌표 변환을 `sourceAt` 로. `setVideoClipSpeed(timeline, clipId, speed)`: speed 설정 → 전환 clamp(절반 초과 축소, 0.1 미만이면 삭제) → 영상 1 이면 새 `videoDuration` 을 넘는 오버레이를 앞당김/자름. `setOverlayClipSpeed`(자기 끝이 영상 끝을 넘으면 끝 자름), `setAudioClipSpeed`. 0프레임 거절은 기존 `frame` 반올림 규칙으로.
- `src/core/timeline/overlay-layers.ts`·`video-track-edits.ts`·`video-groups.ts`·`carousel-frame.ts`: 자체 길이·오프셋 계산을 `speed.ts`·`ops.ts` 함수로 교체. `videoToOverlay`·`overlayToVideo` 가 `speed` 를 복사.
- `src/core/timeline/scene-review.ts`: `sceneRange` 상한을 `projectDuration` 으로.
- `src/core/timeline/to-render.ts`: `RenderVideoSequence`·`RenderOverlay` 에 `playbackRate`, `RenderTransition` 에 `fromPlaybackRate`·`toPlaybackRate`(= 0.5 × 각 클립 speed, 시작·끝 전환은 1 × speed). `sourceShift` 가 speed 를 곱함. `timelineToRender(timeline, brand?, audioCache?)`: 오디오 레이어(source·stem-voice·stem-bg·voice·sfx)는 speed 가 1 이면 지금처럼, 아니면 `audioCache[key]` 가 있을 때만 캐시 파일(`sourceStartFrame = frame(inStart/speed)`, 길이 `audioClipLength`)로 만들고 없으면 레이어를 만들지 않는다(무음). durationInFrames 는 바뀐 길이 함수로.
- `src/remotion/U3Short.tsx`·`types.ts`: `VideoLayer`·`OverlayLayer` 의 `<Video playbackRate>`, `TransitionLayer` 가 from/to 별 rate.
- `src/core/tts-clips.ts`: `applyTtsResults` 가 기존 클립의 `speed` 를 보존하고 결과의 `file` 을 그대로 씀. `ttsOverflow(timeline, audioCache?)` 가 `audioClipLength`. `TtsResult` 에 `file` 추가.
- `src/core/transcript.ts`: `wordsForAudioClip`·`captionsFromTranscript` 가 `(word - inStartSec)/speed`.

**engine**
- `src/engine/pipeline/audio-speed.ts` (new): `audioVersion(file)`(size·mtimeMs 의 sha256 앞 16자), `prepareSpeedAudio({ projectDir, sourceAbs, sourceId, speed, signal })` → `cache/audio/<sourceId-safe>-<speed>-<version>.wav`. 이미 있고 version 같으면 재사용. 없으면 `cache/audio/.tmp-<rand>.wav` 에 `runFfmpeg(["-y","-i",src,"-vn","-filter:a",`atempo=${speed}`,"-c:a","pcm_s16le",tmp], signal)` → `ffprobe` 길이 검사(`|dur - orig/speed| ≤ 1/30` 아니면 실패·tmp 삭제) → rename. 반환 `{ key, file(상대), durationSec, version }`. `pruneAudioCache(projectDir, project)`: `cache/audio/*` 와 `voice/tts-*` 중 timeline·audioCache 가 참조하지 않는 파일 삭제.
- `src/engine/routes/tts.ts`: `startHeavyMedia(context, spec, signal?)` 헬퍼 — `store.lock("heavy-media-start")` 안에서 `findActive("heavy-media")` 가 없을 때까지 250ms 폴링 뒤 `jobs.start`. 기존 라우트는 그대로 409 유지, 준비 라우트만 이 헬퍼로 줄을 선다. TTS `publish` 를 `voice/tts-<captionId>-<Date.now()>.wav` 불변 이름으로(옛 고정 이름은 읽기만). 합성 뒤 같은 job 안에서 대상 클립 `speed≠1` 이면 `prepareSpeedAudio` 까지 하고 응답에 `file`·`durationSec`·`cache` 를 넣는다.
- `src/engine/routes/audio.ts` (new): `POST /api/projects/:id/audio/prepare` body `{ sourceId, speed }`(zod, speed 0.5–2). sourceId 가 inputs 의 id 면 그 파일, 아니면 timeline 음성 클립의 `file` 과 일치해야 함(절대 경로 거부). `startHeavyMedia` 로 job(kind `audio-speed`) 시작, 결과 `{ key, file, durationSec, version }`. 기존 jobs 조회 API 로 진행·취소. `routes/index` 에 등록.
- `src/engine/routes/projects.ts`: `GET /api/projects/:id` 에서 `pruneAudioCache` 실행(읽기 뒤, 오류는 무시·로그). PUT 이 `audioCache` 를 받아 저장.
- `src/engine/routes/render.ts`·`pipeline/render.ts`: 렌더 job 안에서 `speed≠1` 클립의 캐시를 `prepareSpeedAudio` 로 보장(version 불일치면 다시 만듦) → 갱신된 `audioCache` 를 `timelineToRender` 에 넘기고 `asUrl`. 렌더 결과에 갱신된 audioCache 포함해 프로젝트 저장.
- `src/engine/routes/transcribe.ts`: `fakeTimeline` 에 `speed` 전달. 입력은 원본(1배속)임을 주석으로 명시.
- `src/engine/pipeline/media-server.ts`: `cache/audio` 가 프로젝트 root 아래라 추가 작업 없음(확인만).

**ui**
- `src/ui/studio/Inspector.tsx`: 영상 클립(:217)·겹친 영상(:200)·음성 클립(:233) 섹션에 `<PropertyRow label="배속" value="×"><StudioTextInput inputMode="decimal" …/></PropertyRow>`. 로컬 초안, Enter/blur 확정, Escape 되돌림, 0.5–2.0·0.05 단위 밖이면 행 아래 오류 한 줄. 처리 중이면 `jobLine` 패턴으로 상태·취소, 입력 잠금. 사진·짤·효과음·원본 소리 선택에는 행 없음(원본 소리는 읽기 전용 표시). 경고 문구 :239 를 「자막보다 음성이 길어요」로. 새 props `onSpeed(clipId, track, speed)`·`speedJob`.
- `src/ui/screens/Studio.tsx`: `setSpeed`: 영상·오버레이 → `edit(setVideoClipSpeed|setOverlayClipSpeed)` 즉시, 입력에 소리가 있으면(`inputs[].metadata.hasAudio`, 없으면 `summarizeVideo` 결과 필드 확인) `POST audio/prepare` → 성공 시 `onProject({...project, audioCache})`(이력 없음). 음성 → prepare 먼저, 성공 시 `edit(setAudioClipSpeed)` + audioCache 한 번에. 응답 시점에 선택·배속·프로젝트가 바뀌었으면 버림. 실패는 스낵바. `generateTts` 가 응답의 `cache` 를 audioCache 에 합침.
- `src/ui/studio/Preview.tsx`·`preview-sources.ts`: `timelineToRender(…, project.audioCache)`, 캐시 파일 URL 준비(`mediaUrl`), `hasAllRenderSources` 가 캐시 파일 포함.
- `src/ui/studio/Timeline.tsx`(:194, :286, :298-299)·`timeline-adapter.ts`(:71, :100-101)·`CaptionEditor.tsx`(:32,35 → `projectDuration`)·`SceneReview.tsx:31`·`Studio.tsx:79,306,402`: 길이·상한 함수 교체, 경고 문구 변경.

**docs**: `architecture/decisions/0031-playback-speed.md`, `INTENT.md`.

**tests**(spec 검증 기준 번호)
- `tests/core/schema.test.ts`(2): speed 없음=1, 0.5·2 저장·재열기, 0.49·2.01·0·-1·NaN 거절, 사진·짤·sfx speed 거절, audioCache 왕복, 기존 fixture 불변.
- `tests/core/timeline-speed.test.ts` (new)(3·4): `[2,6]` 구간 0.5·1·1.25·2 길이, 2배속 타임라인 1초 나누기 → 원본 4초, 트림·이동·트랙 이동 뒤 원본 합, 영상 1 재배치, 오버레이 앞당김·자르기(fixture 의 마지막 뒤 짤), 자막·독립 클립 시각 유지, `setCaptionRange`·`addCaptionClip`·`sceneRange` 프로젝트 끝 상한, 0프레임 거절, 전환 축소·삭제.
- `tests/core/to-render.test.ts`(5): playbackRate 전파, 전환 from/to rate, sourceShift, 캐시 있는/없는 오디오 레이어, 1배속 회귀 fixture.
- `tests/core/transcript.test.ts`: 배속 단어 변환.
- `tests/core/tts-clips.test.ts`(8): speed 보존, 캐시 길이로 overflow.
- `tests/engine/audio-speed.test.ts` (new)(6): 440Hz 2초 WAV 생성 → 0.5·1.25·2 길이 오차 ≤ 1/30, 주파수 ±1%(FFT 또는 ffmpeg `astats`/영교차 계산), version 불일치 재생성, 실패 시 tmp 삭제·원본 보존. 번들 ffmpeg 없으면 skip 표시.
- `tests/server/audio-prepare.test.ts` (new)(7): TTS 0회, 다른 배속 두 캐시, 같은 경로 내용 변경 → 새 version, 중복 요청 직렬화, 취소, heavy-media 가 바쁠 때 대기 뒤 실행, 프로젝트 열기 때 미참조 파일 삭제·참조 보존, 절대 경로·범위 밖 거절.
- `tests/server/tts.test.ts`: 불변 파일명, speed 클립의 후처리까지 한 job.
- `tests/ui/studio-inspector.test.tsx`(9): 배속 행 유무, 값 표시, 오류, 처리 중 상태. `tests/ui/preview-sources.test.ts`: 캐시 소스.
- `tests/engine/render-media.test.ts`(10): 2배속 영상 fixture 의 길이·마지막 프레임, 캐시 WAV 사용.
- (12) `tests/core/schema-compat.test.ts` (new): 0.3.2 의 `Timeline` 정의 사본으로 새 fixture 파싱 → speed 소실 문서화.

## 순서
1. rebase main, install. 2. schema + speed.ts + 테스트(2). 3. ops·overlay-layers·video-track-edits·video-groups·carousel-frame·scene-review + 테스트(3·4) — 실패 먼저. 4. to-render·U3Short + 테스트(5). 5. tts-clips·transcript + 테스트. 6. audio-speed.ts + 엔진 테스트(6). 7. 라우트(prepare·tts 불변 이름·projects prune·render) + 서버 테스트(7). 8. UI(Inspector·Studio·Preview·Timeline·adapter·CaptionEditor) + UI 테스트. 9. 결정 0031·INTENT. 10. `pnpm verify`, `pnpm package`, 설치본에서 Q5 청취(11)·배속 동작 확인 → finish.
각 단계 끝에 커밋(`047: <한 줄>`).

## 리스크
- 가장 위험한 단계는 3 이다. 길이 계산이 흩어져 있어 한 곳이라도 빠지면 자르기·트림이 어긋난다. 방어: `grep -n "inEndSec - clip.inStartSec\|inEndSec - inStartSec"` 가 `speed.ts` 밖에서 0 줄. 택하지 않은 대안: ffmpeg setpts 로 새 영상 파일(저장 공간·대기 시간, spec (a) B).
- 4: 전환 레이어의 0.5 계수와 클립 speed 의 곱. 1배속 fixture 출력 불변으로 회귀 확인.
- 원본 영상 소리 캐시는 영상 전체를 처리하므로 긴 영상(10분)은 수 초 걸린다. 준비 중 무음 재생으로 막지 않는다.
- Remotion `<Video playbackRate>` 가 4.0.529 에서 WebKit 미리보기와 렌더 모두 지원하는지는 10 단계가 확인한다.

## 증명
1. 각 단계 실패→통과 출력, `✓ verify passed`.
2. `tests/engine/audio-speed.test.ts` 의 길이·주파수 수치(번들 ffmpeg 실행).
3. 설치본: 2배속 영상 클립 미리보기와 mp4 길이 일치(±1프레임), TTS 1.0·1.25·1.5·2.0 청취 판정(사용자, Q5). 미실행이면 적는다.

## 롤백
커밋 되돌리기. 새 프로젝트 파일의 `speed`·`audioCache` 는 구버전이 무시한다(spec Q6). `cache/audio/` 는 삭제해도 된다.
