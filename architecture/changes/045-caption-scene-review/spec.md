# Spec: caption-scene-review
Source: intent.md (accepted). Status: accepted.
<!-- Status: draft | accepted. 제품 책임자가 바꾼다. accepted 커밋 뒤 /smp:critic으로 대조한다. -->

## 열린 질문에 대한 답
1. 위치: 스튜디오 왼쪽 패널의 탭이다. 지금 탭 「미디어」「짤」「효과음」「음성」 앞에 「장면」「자막」을 둔다. 별도 모드를 만들지 않는다. 이유: 043 스튜디오 배치를 지키고, 미리보기·타임라인·실행 취소를 그대로 쓴다.
2. 등장 효과: 없음·튀어나옴(pop)·떠오름(rise)·흔들림(shake) 넷. 길이는 0.3초 고정.
3. 단어 강조: 글 안 표기 `*단어*` 다. 미리보기·렌더에서 단어 색으로 그린다. 자막 글을 글로 소비하는 모든 경로에는 별표를 뺀 글(`plainCaptionText`)을 준다: TTS, 2 대본 AI 추천 입력, 영상 파생 캐러셀 기획 입력과 Jev 대상(044 와 같은 라우트, 뒤에 병합되는 쪽이 적용), 타이틀 「제목 다시 만들기」, 서브 자막 번역 입력(결과 서브 자막에도 별표 없음), 짤 후보 검색어. 받아 적기는 소리가 입력이라 해당 없음. codex 대본·받아 적기 결과 글의 `*` 는 `\*` 로 이스케이프해 저장한다. 이유: 선택 영역 저장은 글을 고칠 때마다 어긋난다.
4. 짤 후보: 5개(Jev 순위, Jev 없으면 검색 순위). 「더 보기」는 짤 탭으로 보낸다.
5. 효과음 교체: 같은 분류를 먼저 보이고 「전체」 토글로 넓힌다. 각 항목에 미리 듣기.
6. 2 대본 완료 직후: 스튜디오를 열 때 「장면」 탭이 선택된 상태로 연다. 그 뒤로는 마지막에 쓴 탭을 기억한다.
7. 자막 더하기·나누기: 자막 편집기에 「자막 더하기」와 「여기서 나누기」(재생 헤드 위치)를 둔다. 더하기 길이는 min(3초, 다음 자막 시작까지, 영상 끝까지)이고 0.3초 미만이면 비활성. 나누기는 새 순수 함수 `splitCaptionClip` 으로 한다(지금 C·S 는 영상 트랙만 나눈다).

## 요구사항
1. 「자막」 탭(자막 편집기): 레이어 선택, 자막 목록(번호·시각·메인 글 한 줄, 재정의가 있으면 점 표시). 항목을 누르면 그 자막을 고르고 재생 헤드를 시작으로 옮긴다. 「이전」「다음」 버튼. 단축키 ↑·↓ 는 자막 목록에 포커스가 있을 때만 듣는다. 입력 칸 안에서는 단축키가 없다. 미리보기의 방향키 1% 이동은 입력 칸에 포커스가 있으면 듣지 않는다(043 B5 에 전달).
2. 자막 편집기 편집 칸: 메인 글, 서브 글(여러 줄), 아래 구간 슬라이더(시작·끝 두 손잡이, 앞·뒤 클립 경계와 영상 끝을 넘지 않는다, 늘리기 가능), 「구간 반복」 토글(켜면 그 구간만 되풀이 재생). 재정의: 글자 색, 크기 50–200%(자동 맞춤 결과 크기에 곱하고 최소 20px), 등장 효과(없음·튀어나옴·떠오름·흔들림), 단어 색(기본 `#FFB020`). 굵게는 두지 않는다(앱에 든 폰트 굵기가 하나뿐이다). 「레이어 스타일로 되돌리기」.
3. 글 안 `*단어*` 는 단어 색으로 그린다. 별표는 렌더·미리보기에서 보이지 않고, 답 3 의 모든 소비 경로에서 뺀다. 자막 측정(`measureCaption`)도 별표 뺀 글로 한다. 저장된 자막에 별표 쌍이 있으면 업데이트 뒤 단어 색으로 그려진다(받아들인다).
4. 「장면」 탭(장면 검토): `script.json` 의 장면마다 한 줄 — 번호·시각·자막 글·짤 썸네일(앞·뒤 최대 둘, 앞/뒤는 클립 id 의 `meme-before|after`, 이유는 대본 `reaction`, null 이면 「보충 짤」)·효과음(분류·제목). 시각은 그 장면 자막 클립(메인·서브)의 시작이고, 없으면 짤·효과음 클립 시작, 모두 없으면 「—」. 짤이 없으면 「짤 없음」, 효과음이 없으면 「효과음 없음」. 항목을 누르면 재생 헤드가 그 시각으로 간다.
5. 짤 바꾸기: 썸네일을 누르면 후보 5개(썸네일·마우스 올리면 재생)와 「빼기」. 후보는 자동 생성과 같은 `POST /api/projects/:id/memes/rank`(자막·reaction)로 구하고, 프로젝트의 다른 클립이 쓰는 짤은 뺀다(0013). 고르면 파일·길이가 바뀐다. 길이는 min(짤 길이, 2초, 장면 길이)이고 앞 짤은 장면 시작에 시작을, 뒤 짤은 장면 끝에 끝을 맞춘다(0016, `from-script.ts` 규칙 재사용). 화면 위치·크기는 유지. 짤이 없던 장면은 「넣기」로 1위 후보를 뒤 짤로 넣는다(장면 끝에 끝을 맞춤, 겹치지 않는 가장 아래 트랙).
6. 효과음 바꾸기: 제목을 누르면 같은 분류 목록(미리 듣기)과 「전체」 토글, 「끄기」. 고르면 파일이 바뀌고 시작은 유지, 길이는 min(1.5초, 파일 길이, 영상 끝까지). 없던 장면은 「넣기」로 「전체」 목록에서 고른 소리를 장면 시각에 넣는다(분류가 없는 장면도 같다).
7. 자동 생성 클립(메인·서브 자막·겹친 짤·효과음)은 `sceneIndex` 를 가진다. 저장된 프로젝트는 읽을 때 클립 id 패턴 `scene-N-*` 로 `sceneIndex` 를 채운다. 장면 검토는 `sceneIndex` 로 클립을 찾고, 없으면 「없음」이다. 손으로 넣은 클립은 `sceneIndex` 가 없다. 나누기로 생긴 뒤 조각은 `sceneIndex` 를 잃는다.
8. 모든 바꾸기는 타임라인 한 번의 변경이고 실행 취소 한 번으로 돌아온다.
9. 저장된 project.json: 재정의·`sceneIndex` 가 없는 클립은 지금과 같이 읽고 그린다.
10. 2 대본 생성 완료에서 스튜디오를 열 때만 `initialTab: "scenes"` 를 넘긴다. 그 밖의 진입은 기억한 탭(`u3.studioTab`)이다.
11. 043 산출물(043 워크트리에서 게이트 2 재개 때 한다): pages.md 5.3 에 「장면」「자막」 탭을 더하고 043 spec 화면·상태 목록을 같이 고치며, 아티팩트 스튜디오 페이지에 자막 편집기(기본·재정의·구간 반복)·장면 검토(기본·짤 후보·효과음 목록·없음) 보드를 더한다. 용어: 자막 쪽은 「단어 색」, 캐러셀 Jev 쪽은 「강조」로 구분한다.

### 구현 분담
- 이 변경(045 브랜치): 스키마·`plainCaptionText`·`from-script` 장면 번호·`scene-review.ts`·`splitCaptionClip`·`setCaptionRange`·렌더(재정의·효과·단어 색)·엔진 테스트. UI 는 SEED 위에 만들지 않는다.
- 043 단계 B5: 스튜디오 개편(트랙 머리 겹침 테스트, 재칠, 인스펙터 전 상태, 대화상자)은 043 에 그대로 남는다. 045 는 B5 에 「자막」「장면」 탭 두 화면을 더한다. 043 은 044·045 병합 뒤 구현을 시작한다(장부 `depends_on`).

## 설계
### 데이터(`src/core/schema.ts`)
- `TextClip` 에 `style?: { color?, sizeScale?(0.5–2), animation?: "none"|"pop"|"rise"|"shake", highlightColor? }`, `sceneIndex?: number`. `Timeline` preprocess 가 id 패턴 `scene-N-*` 로 `sceneIndex` 를 채운다.
- `OverlayClip`(짤)·`AudioClip`(효과음)에 `sceneIndex?: number`.
- `src/core/captions.ts` 에 `plainCaptionText(text)`(별표 제거, `\*` 는 글자)와 `captionRuns(text)`(강조 구간 분해), `escapeCaptionStars(text)` 순수 함수. 답 3 의 소비 경로가 `plainCaptionText` 를 거친다(`tts-clips.ts`, `routes/script.ts` 대본 입력, `routes/carousels.ts` 파생 기획·Jev 대상, `routes/projects` 제목, `routes/captions.ts` 번역, 짤 후보 검색). codex 대본·whisper 결과는 `escapeCaptionStars` 를 거친다.
- `src/core/timeline/from-script.ts`: 장면에서 만든 자막·짤·효과음 클립에 `sceneIndex` 를 적는다.
- 새 순수 함수 `src/core/timeline/scene-review.ts`: `sceneClips(timeline, script)` → 장면별 {captions, memes(앞·뒤 최대 둘), sfx, sec}, `replaceSceneMeme`, `removeSceneMeme`, `insertSceneMeme`, `replaceSceneSfx`, `removeSceneSfx`, `insertSceneSfx`, `usedMemeIds(timeline)`. 짤 길이·정렬은 `from-script.ts` 의 함수를 빼서 같이 쓴다. 모두 `Timeline → Timeline`.
- `src/core/timeline/ops.ts` 에 `setCaptionRange(timeline, clipId, startSec, endSec)`(늘리기 허용, 이웃 경계·영상 끝 clamp)와 `splitCaptionClip` 을 더한다. split 은 뒤 조각의 `sceneIndex` 를 지운다.
### 렌더(`src/remotion/*`, `src/core/timeline/to-render.ts`)
- 자막 그리기에서 레이어 스타일 위에 클립 `style` 을 덮는다. `measureCaption` 은 별표 뺀 글로 맞춘 뒤 `sizeScale` 을 곱한다(최소 20px). `captionRuns` 로 강조 구간을 `<span>` 으로 그린다. 등장 효과는 클립 시작 0.3초 동안 `spring`/`interpolate`(pop=scale 0.8→1, rise=translateY 24→0, shake=translateX ±6).
### API
- 짤 후보: 자동 생성과 같은 `POST /api/projects/:id/memes/rank`(자막·reaction, 별표 뺀 글)에 `excludeIds`(프로젝트가 쓰는 짤) 를 더한다. 효과음 목록: `GET /api/library/sfx`.
### 화면(`src/ui/studio/*`)
- `LibraryPanel` 탭에 「장면」「자막」 추가. 탭 기억은 localStorage `u3.studioTab`. 대본 완료 진입은 `initialTab: "scenes"`.
- `CaptionEditor.tsx`(새, 043 B5): 목록 + 편집 칸 + 구간 슬라이더(shadcn Slider 두 손잡이, `setCaptionRange`) + 「자막 더하기」「여기서 나누기」 + 재정의 섹션. 선택은 스튜디오의 선택 상태와 같다(5.1 규칙). 구간 반복은 Preview 의 재생 루프 옵션으로 넘긴다.
- `SceneReview.tsx`(새, 043 B5): 장면 줄 목록, 짤 후보 팝오버, 효과음 목록 팝오버. 변경은 `scene-review.ts` 함수로 만든 Timeline 을 `pushHistory` 로 넣는다.
- 인스펙터 「이 자막」(043 5.7)에도 같은 재정의 섹션을 접힌 묶음으로 둔다.
- 043 pages.md 5 절·아티팩트 보드: 이 절의 화면대로.

## 결정
- [0028](../../decisions/0028-caption-clip-style.md): 자막 클립 재정의와 자막 편집기(0016 보완). 클립은 색·크기 배율·등장 효과·단어 색을 레이어 위에 덮고, `*단어*` 는 강조 표기다. 자막 편집기는 스튜디오 왼쪽 패널 탭이다.
- [0029](../../decisions/0029-scene-review.md): 장면 검토. 자동 생성 클립은 `sceneIndex` 를 가지고, 스튜디오 「장면」 탭에서 장면별 짤·효과음을 후보로 바꾸거나 빼거나 넣는다. 2 대본 완료 뒤 첫 탭이다.

## 우려 사항
- 043 intent 의 제약 「기능·데이터·엔진 API 는 바꾸지 않는다」와 어긋난다. 043 은 보류 중이다(043 design.md). 소유자: 사용자. 추천: 043 plan.md 단계 B 의 B5 를 이 변경의 plan 으로 대체한다고 적는다.
- `*단어*` 표기는 사용자가 별표를 글자로 쓰려 할 때 충돌한다. 소유자: 사용자. 추천: `\*` 는 글자로 둔다. 자막에 별표를 쓰는 일은 드물다.
- 043 은 044·045 병합 뒤 구현을 시작한다. 소유자: 사용자. 추천: 그대로 간다(044 와 같다).
- 손으로 짤 클립을 옮기거나 자르면 `sceneIndex` 는 남는다. 장면 검토가 그 클립을 계속 그 장면으로 본다. 소유자: 엔지니어링. 추천: 나누기(split)에서 뒤 조각의 `sceneIndex` 를 지운다. 옮기기는 유지한다.
- 044 와 같은 043 pages.md·아티팩트를 고친다. 소유자: 세션. 추천: 044 accept 뒤 044·045 의 pages.md 수정을 043 워크트리에서 한 번에 한다.

## 검증 기준
1. `pnpm verify` 통과.
2. `tests/core/captions-runs.test.ts`: `*단어*` 분해·별표 제거, `\*` 유지. TTS 입력 글에 별표 없음.
3. `tests/core/scene-review.test.ts`: `timelineFromScript` 가 `sceneIndex` 를 적는다. `sceneClips` 가 장면별 자막·짤·효과음을 찾고 지운 클립은 없음. `replaceSceneMeme` 가 파일·길이만 바꾸고 위치·크기를 유지. split 뒤 조각의 `sceneIndex` 없음.
4. `tests/core/caption-ops.test.ts`: `setCaptionRange` 가 이웃 경계·영상 끝에서 멈추고 늘리기를 허용한다. `splitCaptionClip` 이 두 조각을 만들고 뒤 조각에 `sceneIndex` 가 없다. 저장된 타임라인의 `scene-N-*` id 가 `sceneIndex` 로 읽힌다. (UI 테스트 `tests/ui/caption-editor.test.tsx` — 다음·이전·슬라이더·재정의 저장 — 는 043 B5 에서 한다.)
5. `tests/core/scene-review.test.ts`(이어서): `replaceSceneMeme` 가 뒤 짤 끝을 장면 끝에 맞추고 길이 2초 상한을 지킨다. `usedMemeIds` 가 다른 장면의 짤을 낸다. `replaceSceneSfx` 길이 1.5초 상한. (UI 테스트 `tests/ui/scene-review.test.tsx` — 후보 선택·⌘Z·끄기 — 는 043 B5 에서 한다.)
6. 렌더 테스트: 재정의(색·크기)와 강조 구간이 프레임 PNG 에 보인다(기존 자막 렌더 테스트 방식).
7. `tests/server/caption-plain.test.ts`: 파생 캐러셀 기획·제목·번역·짤 후보 요청에 별표가 들어가지 않는다.
8. 043 워크트리 커밋: pages.md 5 절·043 spec 화면 목록·아티팩트 보드(043 게이트 2 재개 때).
