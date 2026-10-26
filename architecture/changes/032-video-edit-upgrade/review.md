# Review: video-edit-upgrade
Author: claude-opus-5-5[1m] (opencodex 경유). Status: accepted. Round: 1.

## 대조한 것
- 변경 문서: `architecture/changes/032-video-edit-upgrade/intent.md`, `architecture/changes/032-video-edit-upgrade/spec.md`
- 지침: `AGENTS.md`
- 결정(이 워크트리): `architecture/decisions/0001-tauri-node-sidecar.md`, `0003-core-scope.md`, `0004-bundled-library-lazy-model.md`, `0007-whisper-stt.md`, `0008-voice-record-separate-cpu.md`, `0009-codex-model-select-jev.md`, `0013-generation-merge-clips-memes.md`, `0016-caption-layers-opacity-brand.md`. 대체된 0002·0005·0006·0010·0011·0012 는 대체 관계와 0012 → 0016 의 차이만 확인했다.
- 결정(다른 워크트리): `u3-030-carousel-images/architecture/decisions/0014-core-scope-carousel.md`, `0015-carousel-codex-image-gen.md`, `u3-033-carousel-from-video/architecture/decisions/0017-scope-carousel-two-modes.md`
- 위키: `architecture/wiki/index.md`, `pages/concept-timeline-editing.md`, `pages/entity-desktop-app.md`, `pages/concept-home-export.md`, `pages/concept-local-models.md`, `pages/entity-engine-shutdown.md`, `log.md`
- 다른 변경: `ledger.sh show` 의 결과는 001(done, `/Volumes/X31/workspace/smp_workspace/u3`), 030(plan, `u3-030-carousel-images`), 031(done, worktree 없음), 033(critic, `u3-033-carousel-from-video`)이다. 030 의 `intent.md`·`spec.md`·`review.md`, 033 의 `intent.md`·`spec.md` 를 읽었다. 030·033 에는 `plan.md` 가 없다. 031 은 main 의 `architecture/changes/031-script-prompt-setting/plan.md` 를 읽었다.
- 코드: `src/core/schema.ts`, `src/core/geometry.ts`, `src/core/safezone.ts`, `src/core/layout.ts`, `src/core/captions.ts`, `src/core/measure.ts`, `src/core/measure-node.ts`, `src/core/fonts.ts`, `src/core/transcript.ts`, `src/core/script-prompt.ts`, `src/core/sfx.ts`, `src/core/timeline/to-render.ts`, `src/core/timeline/ops.ts`, `src/core/timeline/video-track-edits.ts`, `src/core/timeline/video-groups.ts`, `src/core/timeline/from-script.ts`, `src/core/timeline/sfx-lanes.ts`, `src/remotion/U3Short.tsx`, `src/remotion/fonts.ts`, `src/engine/pipeline/codex.ts`, `src/engine/pipeline/codex-schema.ts`, `src/engine/pipeline/library.ts`, `src/engine/main.ts`(미디어 서버 루트), `src/engine/routes/transcribe.ts`, `src/ui/studio/Timeline.tsx`, `src/ui/studio/Inspector.tsx`, `src/ui/screens/Studio.tsx`, `src/ui/screens/Script.tsx`, `assets/fonts/`
- 라이브러리: `/Volumes/X31/workspace/smp_workspace/u3/src-tauri/resources/library/sfx/notify/*.json`
- 외부 확인: G마켓 산스 라이선스는 웹 검색 결과에서 공식 페이지(corp.gmarket.com/fonts)가 SIL OFL 로 배포한다고 적은 것을 확인했다. 티몬체는 spec 의 우려 사항에 이미 있어 다시 확인하지 않았다.

## 발견

### Important
1. **요구사항 10 이 0016 보다 미리보기 크기 조절 범위를 좁힌다.** 0016 은 「영상 2 이상의 클립은 … 위치·크기는 Inspector 슬라이더와 미리보기 끌기로 바꾼다」고 정한다. 이 문장은 짤·영상·사진 모두에 적용된다. spec 요구사항 10 은 「짤·워터마크는 모서리를 끌면 폭이 바뀐다」고만 쓴다. 그래서 영상 2 이상의 영상·사진 클립은 미리보기에서 옮길 수만 있고 크기를 바꿀 수 없다. 스키마에서 세 종류는 같은 `width` 를 가진다. spec 대로 구현하면 accepted 결정과 다른 동작이 된다. 근거: `architecture/decisions/0016-caption-layers-opacity-brand.md` 결정 「영상 2 이상의 클립은 작은 창으로 보인다」, `spec.md` 요구사항 10, `src/core/schema.ts` `OverlayBase`.
2. **030 과 같은 코드를 따로 바꾼다. 병합 순서도 정하지 않았다.** 지금 codex 실행기는 `CodexScript` 스키마에 묶여 있다(`codex.ts` 의 `compileCodexSchema(z.toJSONSchema(CodexScript))` 와 `CodexScript.safeParse`). 032 는 번역(`captions/translate`)과 제목 다시 만들기(`/title`)에서 다른 출력 스키마로 codex 를 부른다. 그런데 spec 은 실행기를 어떻게 바꾸는지 쓰지 않는다. 030 spec 은 같은 실행기를 「출력 스키마를 인자로 받게 일반화」한다고 정했다. 두 변경이 같은 함수를 따로 일반화하면 병합에서 충돌하고 두 방식이 남을 수 있다. 같은 겹침이 세 곳 더 있다. 미디어 서버 루트(030 `carousels`, 032 `brand`), `settings.json` 키와 설정 화면 카드(030 「이미지 생성」, 032 「브랜드」·「자동 알림음」), `/api/system/*` 경로다. 033 은 「030·032 병합 뒤」에 구현한다고 쓰지만, 030 과 032 사이의 순서는 어느 문서에도 없다. 근거: `spec.md` 설계 「API」·「미디어」, `src/engine/pipeline/codex.ts`, `src/engine/main.ts` `startMediaServer`, `/Volumes/X31/workspace/smp_workspace/u3-030-carousel-images/architecture/changes/030-carousel-images/spec.md` 설계 「기획·다듬기」·「합성」·「API」, `/Volumes/X31/workspace/smp_workspace/u3-033-carousel-from-video/architecture/changes/033-carousel-from-video/intent.md` 제약.
3. **033 이 기대하는 「POV 레이어」를 032 의 데이터가 구별하지 못한다.** 033 요구사항 2 는 codex 가 「타이틀·자막·POV 레이어 글」을 바탕으로 장의 글을 쓰게 한다. 032 의 `CaptionLayer { id, x, y, opacity?, style, main, sub }` 에는 이름이나 종류가 없다. 032 는 POV 를 「자막바를 끈 레이어」로만 정의한다(요구사항 9). 그래서 033 은 `style.bar === false` 로 추측하거나 032 의 스키마를 다시 바꿔야 한다. 사용자도 타임라인에서 레이어를 번호로만 구별한다. 033 은 미리보기 상자 끌기에 「032 의 편집 층 방식」을 다시 쓴다. 032 는 편집 층을 `Preview.tsx` 안에서 Remotion Player 에 맞춰 설계하고, 다른 화면에서 다시 쓰는 경계를 정하지 않았다. 근거: `spec.md` 설계 「데이터」 `CaptionLayer`·「화면」 미리보기, 요구사항 9, `/Volumes/X31/workspace/smp_workspace/u3-033-carousel-from-video/architecture/changes/033-carousel-from-video/spec.md` 요구사항 2, 설계 「화면」.
4. **결정 사이의 참조가 진행 중인 변경과 어긋난다.** 030 의 0014 와 033 의 0017 은 「앱은 대본을 다중 트랙 타임라인으로 바꾸고 … (0012)」라고 쓴다. 032 는 0012 를 0016 으로 대체한다. 세 변경이 병합되면 accepted 결정 0017 이 대체된 0012 를 가리킨다. 032 intent 는 「0014(TTS 없음)는 유지한다」고 쓴다. 이 워크트리에는 0014 가 없고 범위 결정은 0003 이다. 0014 는 030 브랜치에만 있고 033 의 0017 이 0014 를 대체한다. 근거: `intent.md` 영향 범위, `architecture/decisions/0003-core-scope.md`, `/Volumes/X31/workspace/smp_workspace/u3-030-carousel-images/architecture/decisions/0014-core-scope-carousel.md`, `/Volumes/X31/workspace/smp_workspace/u3-033-carousel-from-video/architecture/decisions/0017-scope-carousel-two-modes.md`.

### nit
1. **spec 의 세이프존이 코드의 세이프존과 다르다.** 요구사항 2 는 세이프존을 「위 200px, 아래 1480px, 좌우 60px 바깥」으로 쓴다. 코드는 상자의 아래 끝이 1024px(`RIGHT_RAIL_TOP`)보다 아래이면 좌우 여백을 160px(`railMargin`)로 쓴다. 숏폼 오른쪽 버튼 영역 때문이다. spec 대로 그리면 미리보기의 음영·선과 세이프존 스냅이 기존 검사(`insideSafeZone`)와 다른 경계를 쓴다. 근거: `spec.md` 요구사항 2·10, `src/core/geometry.ts` `SAFE_ZONE`·`sideMarginFor`, `src/core/safezone.ts`.
2. **기본 자막 위치가 같은 변경이 보이는 세이프존을 벗어난다. 기준점도 정하지 않았다.** 기본 위치는 y 1450/1920 이다. 지금 한 줄 자막 상자(높이 약 105px, 가운데 1450)의 아래 끝은 약 1502px 이어서 이미 아래 경계 1480px 을 넘는다. 메인과 서브가 각각 최대 2줄로 접히면 상자는 4줄이 되고 아래 끝은 약 1590px 이다. `y` 가 상자의 가운데·위·아래 중 어디인지 spec 에 없다. 가운데이면 서브 줄이 생기고 없어질 때마다 메인 줄이 위아래로 움직인다. 「줄」이라는 말이 두 뜻으로 쓰인다. 하나는 메인·서브 행이고, 다른 하나는 `fitCaptionText`·0007 의 「2줄 이내」 줄바꿈이다. 근거: `spec.md` 설계 「데이터」 기본 위치, 「렌더」, `src/core/layout.ts` `CAPTION_CENTER_Y`·`CAPTION_MAX_LINES`·`fitCaptionText`, `architecture/decisions/0007-whisper-stt.md`.
3. **「트랙 이동은 객체를 펼쳐 복사한다」는 설명이 코드와 다르다.** 영상 1 ↔ 영상 2 이상 이동은 객체를 펼치지 않는다. 필드를 새로 골라 만들고 `groupId`·전환만 옮긴다. 그래서 `opacity` 를 더해도 이 두 이동에서 값이 사라진다. 요구사항 4 의 「트랙 사이로 옮겨도 투명도가 남는다」를 지키려면 이 함수들을 고쳐야 한다. 근거: `spec.md` 설계 「데이터」, 요구사항 4, `src/core/timeline/video-track-edits.ts` `videoClipToOverlay`·`moveOverlayClipToVideo1`.
4. **자동 알림음 길이에 상한이 없어 내보낸 영상이 길어진다.** 장면 효과음은 1.5초(`SCENE_SFX_MAX_SEC`)로 자른다. 자동 알림음은 길이 규칙이 없다. 렌더 길이는 오디오 끝까지 포함한다. 영상 길이가 시작 시각(3.0초) 이상이지만 「시작 시각 + 소리 길이」보다 짧으면, 내보낸 mp4 끝에 검은 화면이 붙는다. notify 분류의 「iPhone Notification」은 4.625초다. 근거: `spec.md` 요구사항 14, 설계 「자동 알림음」, `src/core/sfx.ts`, `src/core/timeline/to-render.ts` `durationInFrames`, `.../library/sfx/notify/sfx-mum363gm-790505.json`.
5. **받아 적기가 자막을 넣을 레이어를 정하지 않았다.** 지금 받아 적기는 `timeline.captions` 전체에서 시각이 겹치는 자막을 바꾼다. spec 은 레이어가 여러 개일 때 어느 레이어의 메인 줄에 넣는지, 다른 레이어의 겹치는 클립도 바꾸는지 쓰지 않는다. 요구사항 13 의 「받아 적기 자막 레이어」를 구별할 표시도 데이터에 없다. 「서브 자막 만들기」가 이미 있는 서브 클립을 덮어쓰는지, 빈 시각만 채우는지도 정하지 않았다. 근거: `spec.md` 요구사항 13, 설계 「API」 `captions/translate`, `src/core/transcript.ts` `captionsFromTranscript`, `src/engine/routes/transcribe.ts` `transcribe/apply`.
6. **브랜드 값이 없는 영상에서 워터마크·타이틀 바가 보이는지 정하지 않았다.** 설정의 `titleBar` 는 필수 값이고, 영상별 `brand` 는 없을 수 있다. `brand` 가 없을 때 `enabled` 의 기본값이 없다. 기본이 켜짐이면 이전 프로젝트는 다음 내보내기에서 빈 제목의 타이틀 바를 얻는다. 제목 글이 빈 타이틀 바를 그리는지도 정하지 않았다. 지금 `timelineToRender` 는 Timeline 하나만 받는다. 0016 대로 미리보기와 내보내기가 같은 변환을 쓰려면, 설정의 브랜드 값을 넘기는 방법이 변환 입력에 있어야 한다. 근거: `spec.md` 요구사항 12·16, 설계 「데이터」 `Timeline.brand`·`settings.json`, `architecture/decisions/0016-caption-layers-opacity-brand.md` 결과, `src/core/timeline/to-render.ts`.
7. **영상별 투명도의 범위가 문서마다 다르다.** 설계의 `Timeline.brand` 는 워터마크와 타이틀 바에 영상별 `opacity` 를 둔다. 요구사항 12 와 0016 의 영상별 값 목록에는 투명도가 없다. 타이틀 바의 `opacity` 가 바 전체(배경과 글자)에 곱해지는지, 설정의 `bgOpacity` 를 대신하는지도 정하지 않았다. 근거: `spec.md` 요구사항 3·12, 설계 「데이터」, `architecture/decisions/0016-caption-layers-opacity-brand.md`.
8. **번역과 제목 다시 만들기의 codex 실행 조건이 없다.** 두 호출의 모델·effort, 입력(대본 장면 글만인지, 프레임도 넣는지), 031 의 대본 기본 지시문을 넣는지를 정하지 않았다. 030 은 같은 경우에 「대본 설정의 모델·effort, 대본 프롬프트는 넣지 않음」으로 정했다. 근거: `spec.md` 요구사항 13·15, 설계 「API」, `/Volumes/X31/workspace/smp_workspace/u3/architecture/changes/031-script-prompt-setting/plan.md`, `/Volumes/X31/workspace/smp_workspace/u3-030-carousel-images/architecture/changes/030-carousel-images/spec.md` 설계 「기획·다듬기」.
9. **폰트 굵기와 측정 키가 정해지지 않았다.** `CaptionStyle` 에 굵기가 없다. spec 은 G마켓 산스 Medium·Bold 두 파일을 넣지만 자막이 어느 쪽을 쓰는지 정하지 않았다. 지금 측정기는 `role`(`body`·`display`)과 굵기로 폰트를 찾는다. 새 폰트 세 가지를 구별할 키가 필요하다. 타이틀 바 `font` 의 선택지도 쓰지 않았다. 근거: `spec.md` 설계 「데이터」 `CaptionStyle`·`settings.json`, 「폰트」, `src/core/fonts.ts`, `src/core/measure.ts` `createMeasurer`.
10. **「스냅」 switch 하나가 두 동작을 맡는다.** 지금 「스냅」은 타임라인의 시각 격자 스냅(`gridSnap`, `dragLine`)이다. 요구사항 10 은 같은 switch 를 미리보기의 세이프존 경계 스냅 조건으로도 쓴다. 사용자는 타임라인 시각 스냅을 끄지 않고 미리보기 위치 스냅만 끌 수 없다. 근거: `spec.md` 요구사항 10, `src/ui/studio/Timeline.tsx` 「스냅」 `StudioSwitch`.
11. **서브 글 언어가 「기본 영어」인데 바꾸는 곳이 없다.** 열린 질문 답은 「서브 글(기본 영어)」이라고 쓰고, 요구사항 13 은 「서브 글(영어)」이라고 쓴다. 언어를 고르는 설정이나 화면은 없다. 근거: `spec.md` 열린 질문에 대한 답, 요구사항 13.
12. **기본 알림음을 고른 이유가 선택 목록 전체에 적용되지 않는다.** spec 은 「카톡」이 실제 서비스 알림음이라 기본값에서 뺀다. 같은 notify 분류에는 「카톡」과 「iPhone Notification」(실제 서비스 알림음), TV 프로그램 효과음 두 개가 그대로 있고 사용자가 고를 수 있다. 「띠링- 소리」도 출처가 myinstants 다. intent 는 「카카오톡·디스코드 접속음 계열」을 원했다. 근거: `spec.md` 열린 질문 답 「자동 알림음의 기본 소리」, `intent.md` 기대 결과 9, `.../library/sfx/notify/*.json`.
13. **타이틀 바가 자막 레이어를 가린다.** 그리는 순서는 자막 레이어 → 타이틀 바다. 사용자가 POV 레이어를 위쪽으로 끌면 타이틀 바 영역에서 글이 가려진다. spec 은 이 경우의 제한이나 안내를 쓰지 않는다. 근거: `spec.md` 설계 「렌더」 그리는 순서, 요구사항 9·10, `architecture/decisions/0016-caption-layers-opacity-brand.md`.

## 처리
| # | 발견 | 판단 |
|---|---|---|
| I1 | 미리보기 크기 조절 범위가 0016 보다 좁음 | 채택 |
| I2 | 030 과 같은 코드를 따로 바꿈, 병합 순서 없음 | 채택 |
| I3 | POV 레이어 구별 불가, 편집 층 재사용 경계 없음 | 채택 |
| I4 | 결정 참조 어긋남(0012·0014) | 채택 |
| n1 | 세이프존 경계가 코드와 다름 | 채택 |
| n2 | 기본 자막 위치가 세이프존 밖, 기준점 없음 | 채택 |
| n3 | 트랙 이동이 투명도를 잃음 | 채택 |
| n4 | 자동 알림음 길이 상한 없음 | 채택 |
| n5 | 받아 적기 대상 레이어 미정 | 채택 |
| n6 | 브랜드 기본 보임 규칙 없음 | 채택 |
| n7 | 영상별 투명도 범위 불일치 | 채택 |
| n8 | 번역·제목 codex 조건 없음 | 채택 |
| n9 | 폰트 굵기·측정 키 미정 | 채택 |
| n10 | 「스냅」 하나가 두 동작 | 채택 |
| n11 | 서브 언어를 고를 곳이 없음 | 기각 |
| n12 | 알림음 목록 전체의 권리 | 일부 채택 |
| n13 | 타이틀 바가 자막을 가림 | 채택 |

I1 채택 — 영상 2 이상의 모든 클립과 워터마크를 미리보기에서 크기 조절한다.
I2 채택 — codex 실행기 일반화를 공통 단위로 먼저 병합하고, 032 → 030 → 033 순으로 병합한다.
I3 채택 — CaptionLayer 에 name 을 두고, 편집 층을 Remotion 과 무관한 컴포넌트로 만든다. 033 은 모든 레이어의 메인 행을 쓴다(033 review I5).
I4 채택 — 0017 은 0016 을 가리키게 고쳤다(033). intent 의 0014 언급은 0003 을 뜻한다고 spec 우려 사항에 적었다.
n1 채택 — geometry.ts 의 경계(오른쪽 버튼 영역 160px 포함)를 그대로 그린다.
n2 채택 — y 는 상자 아래 끝, 기본 1480. 「행」과 「줄」을 나눠 쓴다.
n3 채택 — 두 이동 함수가 opacity 를 옮기도록 고친다.
n4 채택 — 장면 효과음과 같이 1.5초·0.3초 줄임, 짧은 영상에는 넣지 않는다.
n5 채택 — 첫 레이어 메인 행, 겹치는 클립만. 번역은 서브 행을 새로 만든다.
n6 채택 — 파일이 있으면 워터마크, 글이 있으면 타이틀 바. timelineToRender 가 브랜드 값을 함께 받는다.
n7 채택 — 영상별 투명도를 둘 다 허용하고 곱하는 범위를 정했다.
n8 채택 — 대본 설정 모델·effort, 프레임 없음, 031 프롬프트 없음.
n9 채택 — 폰트마다 굵기 하나, font 값을 측정 키로 쓴다.
n10 채택 — 세이프존 스냅은 「세이프존」 switch 가 맡는다.
n11 기각 — 사용자 요구는 한글 메인·영어 서브다. 언어 설정은 일을 늘리고 요구에 없다. 「기본」 표현을 지웠다.
n12 일부 채택 — 기본값만 정하고 목록은 그대로 둔다. 라이브러리 권리 점검은 범위보다 커서 우려 사항으로 올렸다.
n13 채택 — 타이틀 바가 보이면 자막 레이어를 바 영역으로 옮길 수 없다.
