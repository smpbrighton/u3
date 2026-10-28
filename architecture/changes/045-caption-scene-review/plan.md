# Plan: caption-scene-review (from spec.md)

plan mode 산출물. 승인 후 커밋한다. 구현이 계획에서 벗어나면 같은 커밋에서 이 파일을 고친다. PR 리뷰는 diff 를 이 파일과 대조한다.

## 검토 목록
사람이 결정할 항목만 둔다. 항목마다 추천·이유·근거.
1. **043 착수 순서(critic I1):** 045 는 core·engine·render 만 만들고 「자막」「장면」 탭 화면은 043 B5 가 shadcn 으로 만든다. 043 은 044·045 병합 뒤 시작한다. **추천:** 그렇게 한다. **이유:** 044 와 같다. **근거:** `spec.md` 「구현 분담」, `review.md` I1.
2. **저장된 자막의 별표 쌍(critic n7 일부 채택):** 이미 저장된 자막에 `*…*` 가 있으면 업데이트 뒤 단어 색으로 그려진다. **추천:** 받아들인다. **이유:** 사용자 프로젝트에 별표 자막이 있을 가능성이 극히 낮고, codex·whisper 의 새 결과는 이스케이프한다. **근거:** `review.md` n7.
3. **spec 답 3 의 「2 대본 AI 추천 입력」:** 코드를 확인한 결과 대본 프롬프트에 타임라인 자막 글이 들어가는 경로가 없다(받아 적기 전사만 들어간다, `src/engine/pipeline/codex.ts:225-228`). 그래서 `plainCaptionText` 적용 대상에서 뺀다. **추천:** 그렇게 한다. 적용 대상은 TTS·파생 캐러셀·제목·번역·짤 후보 다섯 곳이다. **근거:** `src/engine/routes/script.ts:125-131`.
4. **구현 작업자:** 044 와 같이 Orca codex 워커(`--dangerously-bypass-approvals-and-sandbox`, 이 워크트리). 044 워커와 동시에 돈다. 두 변경은 `routes/carousels.ts` 한 곳이 겹치고(044 요구사항 14·045 답 3), 뒤에 병합되는 쪽이 rebase 뒤 적용한다. **추천:** 그렇게 한다.
5. **짤 후보 API:** `POST /api/projects/:id/memes/rank` 에 `excludeIds` 를 더한다(새 엔드포인트 없음). **추천:** 그렇게 한다. **이유:** 자동 생성과 같은 순위 경로(critic n5).

## 바꿀 파일
### 데이터·순수 함수(core)
- `src/core/schema.ts`: `TextClip` 에 `style?: { color?, sizeScale?(0.5–2), animation?: "none"|"pop"|"rise"|"shake", highlightColor? }`·`sceneIndex?`; `OverlayClip` 세 멤버와 `AudioClip` 에 `sceneIndex?`(zod 와 93–97·155–164 행의 수기 타입 둘 다). `Timeline` transform 에서 id 패턴 `^scene-(\d+)-(caption|sub-caption|meme-(before|after)|sfx)$` 로 `sceneIndex` 가 없는 클립에 채운다. `CAPTION_HIGHLIGHT_DEFAULT = "#FFB020"`.
- `src/core/captions.ts`: `plainCaptionText(text)`(`*…*` → 안쪽 글, `\*` → `*`), `captionRuns(text): {text, highlight}[]`, `escapeCaptionStars(text)`(`*` → `\*`). 기존 `findEmphasis` 와 충돌하지 않게 별도 함수.
- `src/core/timeline/from-script.ts`: 자막·서브·짤·효과음 클립에 `sceneIndex: index`. 짤 길이·시작 계산(57–67)을 export 함수 `memeClipPlacement({sceneStart, sceneDuration, memeDuration, position})` 로 뺀다. 효과음 길이 규칙(`SCENE_SFX_MAX_SEC`)은 `src/core/sfx.ts` 그대로 쓴다.
- `src/core/timeline/scene-review.ts` (new): `sceneClips(timeline, script) → SceneRow[]`(`{index, sec|null, captions, memes: {clip, position}[], sfx}`; 시각은 자막 → 짤·효과음 → null), `usedMemeIds(timeline, exceptClipId?)`, `replaceSceneMeme(timeline, script, sceneIndex, clipId, meme: MemeMeta)`(memeId·durationSec·startSec 를 `memeClipPlacement` 로 다시 계산, x·y·width·opacity 유지), `removeSceneMeme`, `insertSceneMeme(…, meme)`(뒤 짤, `placeOverlayInLowestLayer`), `replaceSceneSfx(timeline, sceneIndex, clipId, sfx: SfxMeta, videoEnd)`(file·inEndSec=min(1.5, duration, videoEnd−start)), `removeSceneSfx`, `insertSceneSfx`. 장면 구간은 `script.scenes` 와 자막 클립에서 구한다(자막이 없으면 짤·효과음 시작과 장면 글자 수 기준 길이).
- `src/core/timeline/ops.ts`: `setCaptionRange(timeline, clipId, startSec, endSec)`(같은 줄 이웃 클립 경계·0·`videoDuration` 으로 clamp, 늘리기 허용, 최소 0.1초), `splitCaptionClip(timeline, clipId, atSec, ids?)`(뒤 조각 `sceneIndex` 삭제, `style` 은 복사), `addCaptionClip(timeline, layerId, row, startSec, maxSec=3)`(길이 min(3, 다음 자막까지, 영상 끝까지), 0.3초 미만이면 null).
- `src/core/tts-clips.ts` `ttsText`: `plainCaptionText` 를 먼저 거친다.
### 엔진
- `src/engine/routes/memes.ts`: `MemeRankRequest` 에 `excludeIds?: string[]`, 순위 결과에서 뺀다. `caption`·`query` 는 `plainCaptionText` 적용.
- `src/engine/routes/captions.ts`: 번역 입력(22)과 제목 입력(46)에 `plainCaptionText`. 번역 결과 서브 자막은 `escapeCaptionStars` 없이 그대로(별표를 내지 않도록 프롬프트에 한 줄).
- `src/engine/routes/carousels.ts`(93–103): `captionText`·`material.scenes[].caption`·Jev 대상에 `plainCaptionText`. 044 가 이 구간을 바꾸므로 뒤에 병합되는 쪽이 적용한다(044 plan 순서 7).
- `src/engine/routes/script.ts`(153 저장 전)와 `src/core/transcript.ts`(`captionsFromTranscript` 글): `escapeCaptionStars`.
### 렌더
- `src/core/timeline/to-render.ts`(165–169): `RenderCaption` 에 `clipStyle?`·`animation?`·`clipStartSec`. 레이어 스타일 위에 클립 `style` 을 합친 `effectiveCaptionStyle(layer.style, clip.style)` 순수 함수(색·크기 배율(mainSize·subSize 에 곱) → 측정 뒤 최소 20px 는 `caption-measure.ts` 에서).
- `src/remotion/caption-measure.ts`: `measureCaption(text, style, row, sizeScale=1)` — `plainCaptionText` 로 측정, 결과 fontSize×sizeScale, 최소 20.
- `src/remotion/U3Short.tsx` `SceneCaption`(107–137): 줄마다 `captionRuns` 로 `<span style={{color: highlightColor}}>`; 등장 효과는 클립 시작 0.3초 `interpolate`/`spring`(pop scale 0.8→1, rise translateY 24→0, shake translateX ±6 감쇠). 미리보기와 렌더가 같은 컴포넌트다.
### 테스트
- `tests/core/captions-runs.test.ts` (new): `captionRuns`·`plainCaptionText`·`escapeCaptionStars`(`\*` 유지, 짝 없는 별표는 글자), `ttsText` 에 별표 없음.
- `tests/core/scene-review.test.ts` (new): `timelineFromScript` 가 `sceneIndex` 를 적음, `Timeline.parse` 가 `scene-N-*` id 로 채움, `sceneClips` 장면별 찾기·지운 클립 「없음」·앞뒤 둘, `replaceSceneMeme` 뒤 짤 끝 맞춤·2초 상한·x/y/width 유지, `usedMemeIds` 가 다른 장면 짤만, `insertSceneMeme` 가 가장 아래 겹치지 않는 트랙, `replaceSceneSfx` 1.5초·영상 끝 상한, 실행 취소는 `history` 로 한 스냅숏.
- `tests/core/caption-ops.test.ts` (new): `setCaptionRange` clamp·늘리기, `splitCaptionClip` 뒤 조각 `sceneIndex` 없음·`style` 복사, `addCaptionClip` 길이 규칙·0.3초 미만 null.
- `tests/core/to-render.test.ts`: `effectiveCaptionStyle` 합성(색·배율·단어 색 기본값). `tests/remotion/caption-runs.test.tsx` (new): `renderToStaticMarkup` 으로 `SceneCaption` 의 `<span>` 색과 별표 없음.
- `tests/server/meme-rank.test.ts`: `excludeIds` 로 빠지는 것, 별표 제거. `tests/server/caption-plain.test.ts` (new): 번역·제목 요청의 codex 프롬프트에 별표 없음(fake runner 로 프롬프트 캡처).
- `tests/server/script-*.test.ts`·`tests/core/transcript.test.ts`: 저장된 글의 별표가 `\*` 로.
### 문서
- `architecture/changes/045-caption-scene-review/plan.md`: 이 파일.
- 043 pages.md·spec 화면 목록·아티팩트 보드는 043 워크트리에서(요구사항 11). UI 테스트(caption-editor·scene-review)는 043 B5.

## 순서
묶음마다 테스트 먼저 → 구현 → 그 묶음의 테스트 통과 → 커밋. `pnpm verify` 전체 통과는 D 끝에서 확인한다. 명령 앞에 AGENTS.md 의 X31 캐시 환경변수.
1. **A 표기·스키마:** `captions-runs.test.ts` → `captions.ts`·`schema.ts`(style·sceneIndex·transform)·`tts-clips.ts`.
2. **B 장면·자막 함수:** `scene-review.test.ts`·`caption-ops.test.ts` → `from-script.ts`(sceneIndex·`memeClipPlacement`)·`scene-review.ts`·`ops.ts`.
3. **C 엔진 경로:** `meme-rank.test.ts`·`caption-plain.test.ts`·transcript/script 테스트 → `memes.ts`·`captions.ts`·`script.ts`·`transcript.ts`. `carousels.ts` 는 044 병합 순서에 따라(검토 1·4).
4. **D 렌더:** `to-render.test.ts`·`caption-runs.test.tsx` → `to-render.ts`·`caption-measure.ts`·`U3Short.tsx`. `pnpm verify`.
5. **E 확인:** `pnpm dev` 로 기존 프로젝트 「새 영상」을 열어 자막이 지금과 같이 보이는지(재정의 없음) 캡처 한 장, `*단어*` 를 넣은 자막 클립 하나를 project.json 에 써서 미리보기 캡처 한 장(수동, 경로 기록).
6. **F 마감:** `worktree.sh finish caption-scene-review`, `/smp:wiki ingest`.
7. 044 가 먼저 병합돼 있으면 rebase 뒤 `carousels.ts` 의 `plainCaptionText` 적용(044 요구사항 14)을 이 변경에서 한다.

## 리스크
- **가장 위험한 단계는 B 다.** 장면 구간(시작·길이)을 자막 클립에서 구하는데, 자막을 옮기거나 지운 뒤에는 장면 경계가 흐려진다. `sceneClips` 의 시각 규칙(자막 → 짤·효과음 → null)을 테스트로 잠그고, 구간을 모르면 바꾸기는 길이만 바꾸고 시작을 유지한다.
- 미리보기(Tauri WebKit)의 등장 효과는 Remotion Player 가 같은 컴포넌트로 돌리므로 렌더와 같다. 성능은 `useCurrentFrame` 기반 계산이라 추가 비용이 작다.
- 044 와 `routes/carousels.ts` 가 겹친다. 뒤에 병합되는 쪽이 적용한다(순서 7).
- 택하지 않은 대안: (1) 강조를 선택 영역(offset)으로 저장 — 글 수정마다 어긋난다. (2) 장면-클립 연결을 별도 맵으로 project.json 에 저장 — id 패턴으로 충분하고 저장 형식이 늘지 않는다. (3) 새 `memes/candidates` 엔드포인트 — 기존 rank 재사용이 자동 생성과 순위가 같다.

## 증명
1. `pnpm verify` 종료 코드 0, 마지막 줄 `✓ verify passed`(D 끝과 병합 전).
2. 새 테스트 파일 다섯(captions-runs·scene-review·caption-ops·caption-runs.tsx·caption-plain)과 고친 테스트가 통과한다. 실패 출력은 보고에 그대로 적는다.
3. `grep -rn "clip.text\|\.text)" src/engine/routes src/core/tts-clips.ts` 로 자막 글 소비 경로 다섯 곳이 `plainCaptionText` 를 거치는지 목록으로 적는다.
4. 5 단계 수동 캡처 두 장의 경로.
5. 미검증 항목은 완료 보고에 그대로 적는다.

## 롤백
- 코드는 커밋 단위로 되돌린다. 데이터: `style`·`sceneIndex` 는 선택 필드라 0.2.2 가 읽을 때 무시되고 저장하면 사라진다(동작 회귀 없음). `\*` 로 이스케이프된 자막은 0.2.2 에서 별표가 그대로 보인다. 되돌릴 때 `\*` → `*` 치환이 필요하면 `scripts/caption-unescape.ts` 를 그때 만든다(이 변경에 넣지 않는다).
