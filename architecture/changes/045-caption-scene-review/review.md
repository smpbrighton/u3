# Review: caption-scene-review
Author: claude-opus-5-5. Status: accepted. Round: 1.

## 대조한 것
- 이 변경: `architecture/changes/045-caption-scene-review/intent.md`, `spec.md`. 앞선 라운드 review 는 없다(템플릿 상태였다).
- 지침: `AGENTS.md`, `architecture/INTENT.md`.
- 유효 결정: `architecture/decisions/0001`, `0004`, `0007`, `0008`, `0013`, `0016`, `0019`, `0020`, `0021`, `0022`, `0023`, `0024`, `0028`, `0029`. 대체된 결정(0002·0003·0005·0006·0009–0012·0014·0015·0017·0018)은 Status 만 확인했다.
- 위키: `architecture/wiki/index.md`, `pages/concept-timeline-editing.md`, `pages/concept-local-tts.md`, `pages/entity-desktop-app.md`.
- 진행 중인 변경(`ledger.sh show`):
  - 043 shadcn-redesign(`/Volumes/X31/workspace/smp_workspace/u3-043-shadcn-redesign`): `intent.md`, `spec.md`, `plan.md`, `design.md`, `pages.md` 5 절, `review.md`, `decisions/0025-ui-shadcn.md` 의 존재.
  - 044 carousel-workflow(`/Volumes/X31/workspace/smp_workspace/u3-044-carousel-workflow`): `intent.md`, `spec.md`, `decisions/0026`·`0027` 의 존재.
  - 001 의 worktree 는 main(`/Volumes/X31/workspace/smp_workspace/u3`)이다. 039·040·042 의 worktree 경로는 디스크에 없다. 네 변경은 모두 stage done 이다.
  - 결정 번호 0025(043)·0026–0027(044)·0028–0029(045)는 서로 겹치지 않는다.
- 코드: `src/core/schema.ts`, `src/core/timeline/from-script.ts`, `src/core/timeline/ops.ts`, `src/core/timeline/to-render.ts`, `src/core/script-memes.ts`, `src/core/tts-clips.ts`, `src/core/fonts.ts`, `src/core/sfx.ts`, `src/remotion/caption-measure.ts`, `src/remotion/U3Short.tsx`, `src/engine/routes/script.ts`, `src/engine/routes/library.ts`, `src/engine/routes/memes.ts`, `src/engine/routes/captions.ts`, `src/engine/routes/carousels.ts`, `src/ui/screens/Script.tsx`, `src/ui/screens/Studio.tsx`, `src/ui/studio/{LibraryPanel,Preview,PreviewEditLayer,Timeline,Inspector}.tsx`, `src/ui/studio/shortcuts.ts`, `src/ui/studio/replace-meme-clip.ts`.

## 발견

### Important

1. **043 B5 대체와 043 B0 의존이 spec 에 없다.** intent 는 "043 단계 B 의 B5 묶음은 이 변경의 plan 으로 대체한다"고 쓴다. 043 plan 의 B5 는 스튜디오 전체 개편이다. B5 에는 트랙 머리 겹침 실패 테스트, 머리줄·라이브러리·미리보기·툴바·타임라인 재칠, 인스펙터 전 상태, 대화상자가 들어 있다. 045 spec 의 요구사항과 검증 기준에는 이 항목이 하나도 없다. 그래서 045 plan 이 B5 를 대체하면 스튜디오 개편과 0.2.2 「음성 만들기」 겹침 수정(043 spec 우려 5·검증 기준 6)이 어느 변경에도 남지 않는다. 또 spec 은 "shadcn Slider 두 손잡이"를 쓴다. main 과 이 worktree 에는 shadcn·Tailwind·`src/ui/components/` 가 없다. 그 기반은 043 B0 이고, 043 브랜치는 병합되지 않았다. 결정 0025(UI shadcn)도 043 브랜치에만 있다. 장부의 045 DEPENDS_ON 은 `-` 다. 044 도 같은 방식으로 B3 를 대체하므로, B0·B1 을 누가 언제 먼저 병합하는지 정해지지 않았다.
   근거: `intent.md` 영향 범위 「043」, `spec.md` 설계 「화면」, `u3-043-shadcn-redesign/architecture/changes/043-shadcn-redesign/plan.md` 순서 8·13, `design.md` 「보류」, `043 spec.md` 우려 5·검증 기준 6, `ledger.sh show` 의 045 행, `ls src/ui/components`(없음), `package.json`(tailwind·radix 0건).

2. **짤 바꾸기는 위치를 유지하고, 이것이 0016 의 뒤 짤 정렬·길이 규칙과 어긋난다.** 0016 은 "자동 짤은 장면 본 화면의 시작(앞 짤) 또는 끝(뒤 짤)에 맞춘다"고 정한다. 코드에서 뒤 짤의 시작은 `cursor + mainDuration - durationSec` 이다. 즉 뒤 짤은 장면 끝에서 끝난다. 길이는 `min(짤 길이, 2초, 장면 길이)` 이다. spec 요구사항 5 는 "파일·길이가 바뀐다(위치·크기 유지)"라고만 쓴다. 시작 시각을 유지하는지, 2초 상한을 쓰는지는 적지 않았다. 시작 시각을 유지하고 길이만 바꾸면 결과는 두 가지다. 새 짤이 더 길면 뒤 짤이 다음 장면으로 넘친다. 더 짧으면 장면 끝에 맞지 않는다. 「넣기」의 "1위 후보를 장면 끝에 넣는다"도 장면 끝에서 시작하는지, 끝에서 끝나는지 정하지 않았다. 지금 코드는 끝에서 끝나는 쪽이다.
   근거: `decisions/0016-caption-layers-opacity-brand.md` 결정 6번째 항목, `src/core/timeline/from-script.ts:63-64`, `spec.md` 요구사항 5, `decisions/0029-scene-review.md` 결정 2.

3. **짤 후보와 「넣기」가 프로젝트 안의 짤 중복을 막지 않는다(0013).** 0013 은 "한 프로젝트에서 같은 짤을 두 번 쓰지 않는다"고 정한다. 자동 생성 코드는 `usedIds` 로 이미 쓴 짤을 후보에서 뺀다. spec 은 후보 5개를 `POST /api/library/memes/search` + `judge` 결과로 보인다. 그 API 는 프로젝트에서 쓴 짤을 빼지 않는다. spec 은 다른 장면에서 이미 쓴 짤을 후보에서 빼는지 적지 않았다. 「넣기」의 1위 후보에도 같은 문제가 있다. 0029 는 0013 을 대체하지 않는다. 위키도 "자동 생성은 입력별 짤 보충과 중복 제거를 처리한다"고 쓴다.
   근거: `decisions/0013-generation-merge-clips-memes.md` 결정 4, `src/core/script-memes.ts:29,42`, `src/engine/routes/library.ts:44-56`, `spec.md` 요구사항 5·API, `wiki/pages/concept-timeline-editing.md`.

4. **`*단어*` 를 빼는 곳의 목록이 실제 자막 글 소비처와 맞지 않는다. 그중 하나는 044 가 고치는 경로다.** spec 은 TTS·받아 적기·대본 입력에서만 별표를 뺀다. 받아 적기(whisper)는 소리를 입력으로 받는다. 자막 글을 입력으로 받는 경로가 없다. 반대로 아래 경로는 자막 글을 그대로 codex·검색에 넘기는데, spec 목록에 없다.
   - 영상 파생 캐러셀: `POST /api/projects/:id/carousel` 이 `captionLayersOf(...).main` 의 글을 codex 기획 자료로 넣는다. 044 는 이 라우트를 「기획만 하고 `stage: "review"`」로 다시 쓴다. 두 변경이 같은 라우트의 같은 입력을 건드린다.
   - 타이틀 「제목 다시 만들기」: 인스펙터가 타임라인 자막 글을 `/api/projects/:id/title` 로 보낸다.
   - 「서브 자막 만들기」(번역): `/api/projects/:id/captions/translate` 가 메인 자막 글을 codex 에 넘긴다. 결과 서브 자막에 별표가 남는지, 사라지는지 정하지 않았다.
   - 장면 검토의 짤 후보 검색 `q`: 장면 자막을 쓰면 별표가 검색어와 Jev 상태에 들어간다.
   근거: `spec.md` 열린 질문 답 3·요구사항 3·설계 「데이터」, `src/engine/routes/carousels.ts:93,98-103`, `src/ui/studio/Inspector.tsx:321-326`, `src/engine/routes/captions.ts:21,46`, `u3-044-carousel-workflow/architecture/changes/044-carousel-workflow/spec.md` 설계 「API」 두 번째 항목.

5. **자막 나누기를 "타임라인(C·S)으로 한다"는 답은 지금 동작과 043 명세에 맞지 않는다.** 나누기 단축키는 영상 1 클립과 겹친 영상 클립만 찾는다(`splitVideoClip`·`splitOverlayClip`). 자막 클립을 나누는 함수는 없다. 043 pages.md 5.6 도 "나누기(C=포인터 위치, S=재생 헤드, 영상 트랙만)"라고 적는다. spec 열린 질문 7 의 답은 이 전제로 자막 편집기에서 나누기를 뺐다. 그래서 그대로 구현하면 자막을 나눌 길이 어디에도 없다.
   근거: `spec.md` 열린 질문 답 7, `src/ui/studio/Timeline.tsx:175-205`, `src/core/timeline/ops.ts:50,79`, `043 pages.md:149`.

6. **자막 편집기의 ↑·↓·⌥↑·⌥↓ 가 미리보기 방향키 이동과 겹친다.** 043 pages.md 5.4 는 미리보기에서 고른 객체(자막 포함)를 "방향키 1% 이동"으로 옮긴다. 지금 `PreviewEditLayer` 는 window keydown 에서 방향키를 받는다. 이 처리기는 입력 칸 포커스와 ⌥ 를 검사하지 않는다. 043 5.1·5.4 가 미리보기 자막 선택과 타임라인 자막 선택을 하나로 만든다. 그 상태에서 자막을 고르고 ↑ 를 누르면 두 동작이 함께 일어난다. 하나는 「이전 자막」이고, 다른 하나는 자막 레이어 1% 위로 이동이다. 또 macOS 여러 줄 입력에서 ⌥↑·⌥↓ 는 문단 시작·끝 이동이다. spec 은 이 단축키를 입력 중 자막 넘기기로 가져간다.
   근거: `spec.md` 요구사항 1, `043 pages.md:136` 과 5.1, `src/ui/studio/PreviewEditLayer.tsx:63-82`.

### nit

1. **저장된 프로젝트에서 장면 검토가 모든 장면을 「없음」으로 보이고, 「넣기」가 같은 장면에 짤·효과음을 하나 더 만든다.** 요구사항 9 에 따르면 `sceneIndex` 가 없는 클립은 지금 모양으로 남는다. 요구사항 7 에 따르면 장면 검토는 `sceneIndex` 로만 클립을 찾는다. 그러나 지금의 자동 생성 클립 id 에는 이미 장면 번호가 있다(`scene-N-caption`, `scene-N-sub-caption`, `scene-N-meme-before|after`, `scene-N-sfx`). intent 의 "장면 ↔ 클립을 잇는 키가 없다"는 이 id 를 빼고 쓴 문장이다. 읽을 때 id 로 `sceneIndex` 를 채우는지, 저장된 프로젝트는 비워 두는지 정하지 않았다.
   근거: `spec.md` 요구사항 7·9, `intent.md` 「지금 코드에서 확인한 것」 4, `src/core/timeline/from-script.ts:65,90-91,99`.

2. **장면 검토가 읽는 대본은 project.json 에 없고, 타임라인을 만든 대본과도 다르다.** 대본은 프로젝트 폴더의 `script.json` 에 있다. 0029 결과는 "project.json 의 대본(`script`)"이라고 쓴다. 엔진은 codex 원본 대본을 `script.json` 에 쓴다. UI 는 그 뒤에 `resolveScriptMemes`·`chooseMissingInputMemes` 로 `memeBefore`·`memeAfter` 를 바꾼다. 보충 짤 장면은 `memeAfter: true` 가 된다. UI 는 바뀐 대본을 저장하지 않는다. 그래서 `script.json` 으로 그린 「앞/뒤 표시」와 「이유 `reaction`」은 타임라인 짤과 맞지 않을 수 있다. 보충 짤 장면은 `reaction` 이 null 일 수 있다.
   근거: `decisions/0029-scene-review.md` 결과, `src/engine/routes/script.ts:153`, `src/ui/screens/Script.tsx:113-157`, `src/core/script-memes.ts:56-58`.

3. **한 장면에 짤이 둘인 경우를 다루지 않는다.** 대본이 앞·뒤를 모두 고르면 자동 생성은 짤 두 개를 만든다(`alternateMemes`). spec 의 `sceneClips` 는 장면마다 `meme` 하나를 돌려준다. 요구사항 4 도 짤 썸네일 하나만 보인다.
   근거: `src/core/script-memes.ts:94-103`, `src/core/timeline/from-script.ts:58-61`, `spec.md` 설계 「데이터」 `sceneClips`.

4. **구간 슬라이더를 `trimCaptionClip` 과 같다고 검증하면, 클립을 늘리는 동작이 막힌다.** `trimCaptionClip` 은 늘리는 트림에 오류를 낸다("클립을 늘리는 트림은 지원하지 않습니다"). 요구사항 2 는 앞·뒤 클립 경계까지 늘리는 것을 허용한다. 검증 기준 4 의 "같은 결과"는 그 요구사항과 어긋난다.
   근거: `src/core/timeline/ops.ts:156-164`, `spec.md` 요구사항 2·검증 기준 4.

5. **장면 검토의 후보 순위가 자동 생성 순위와 다르다.** 자동 생성은 `POST /api/projects/:id/memes/rank` 에 `caption`·`reaction` 을 넘긴다. spec 은 `search` + `judge` 에 자막만 넘긴다. 그래서 「넣기」의 1위 후보는 자동 생성이 같은 장면에 골랐을 짤과 다를 수 있다. 줄에 보이는 「이유 `reaction`」은 후보 순위에 쓰이지 않는다.
   근거: `src/ui/screens/Script.tsx:101-108`, `src/engine/routes/memes.ts:16-31`, `spec.md` API.

6. **「굵게」 재정의는 앱에 든 폰트로 표현되지 않는다.** 자막 굵기는 지금 Pretendard·G마켓 산스가 700, 티몬체가 400 으로 고정이다(`captionWeight`). 앱에는 G마켓 산스 700, 티몬체 400 파일만 있다. 그래서 기본 자막은 이미 굵고, 「굵게」를 켜도 바뀌지 않는다. 티몬체에서는 브라우저가 가짜 굵게를 합성한다. 이 합성은 WebKit 미리보기와 Chromium 렌더에서 다를 수 있다. 이 차이는 확인하지 않았다(추정).
   근거: `src/remotion/caption-measure.ts:7`, `src/core/fonts.ts:10-16`, `spec.md` 요구사항 2.

7. **저장된 자막에 별표 쌍이 있으면 업데이트 뒤 다르게 그려진다.** 요구사항 9 는 저장된 클립을 "지금과 같이 그린다"고 쓴다. 그러나 `*…*` 가 든 글은 재정의가 없어도 강조색으로 바뀌고 별표가 사라진다. 대본 프롬프트와 말투 검사에는 별표 규칙이 없다. 그래서 codex 가 별표를 내면 자동 생성 자막도 의도하지 않게 강조된다.
   근거: `spec.md` 요구사항 3·9, `src/core/script-style.ts`, `src/core/script-prompt.ts`(별표 규칙 0건).

8. **효과음 바꾸기·넣기의 길이와 분류 규칙이 없다.** 자동 효과음은 자막 시작에 놓이고 길이는 `min(1.5초, 파일 길이)` 이다. 요구사항 6 은 "파일이 바뀐다"고만 쓴다. 그래서 `inEndSec` 를 새 파일 길이와 1.5초 상한으로 다시 정하는지 알 수 없다. 렌더 길이는 소리 클립의 끝도 포함한다. 그래서 마지막 장면에서 상한 없이 바꾸면 영상 전체가 길어진다. 효과음이 없던 장면의 「넣기」는 어느 분류에서 무엇을 고르는지 정하지 않았다. 대본 `sfxCategory` 가 null 이고 짤 감정으로도 분류가 나오지 않는 장면이 그 경우다.
   근거: `src/core/timeline/from-script.ts:92-106`, `src/core/sfx.ts:4`, `src/core/timeline/to-render.ts:279-283`, `spec.md` 요구사항 6.

9. **「자막 더하기」(3초)가 요구사항 2 의 경계 규칙을 넘을 수 있다.** 재생 헤드 뒤 3초 안에 다음 자막이 있으면 두 자막이 겹친다. 영상 끝이 3초 안에 있으면 자막이 영상 끝을 넘는다. 렌더 길이는 자막 끝도 포함하므로 영상 전체가 길어진다.
   근거: `spec.md` 열린 질문 답 7·요구사항 2, `src/core/timeline/to-render.ts:279-283`.

10. **장면 시각의 출처가 없다.** 요구사항 4 의 「시각」과 "재생 헤드가 장면 시작으로 간다"에 필요한 장면 시작 시각을 무엇으로 정하는지 쓰지 않았다. `script.json` 의 `startSec` 는 원본 입력 기준 시각이다. 타임라인 기준이 아니다. 자막 클립이 지워졌거나 옮겨진 장면에서는 자막 클립 시작도 쓸 수 없다.
    근거: `src/core/schema.ts:232-235`, `spec.md` 요구사항 4·7.

11. **크기 배율과 자막 자동 맞춤의 관계가 없다.** `measureCaption` 은 레이어 크기에서 시작해 최소 20px 까지 줄여 두 줄 폭에 맞춘다. 배율을 맞춤 전 크기에 곱하면 긴 자막에서는 200% 가 효과 없이 줄어든다. 측정에는 별표를 뺀 글과 재정의한 굵기를 써야 한다. spec 은 둘 다 적지 않았다.
    근거: `src/remotion/caption-measure.ts:12-28`, `spec.md` 설계 「렌더」.

12. **「2 대본 완료 직후」를 스튜디오가 어떻게 아는지 없다.** 스튜디오는 네 곳에서 열린다. 대본 생성 완료, 1 미디어·2 대본 단계 이동, 영상 목록에서 다시 열기가 그곳이다. 탭 기억(`u3.studioTab`)은 모든 프로젝트가 같이 쓰는 값이다. 대본 생성 완료일 때만 「장면」을 여는 신호가 설계에 없다.
    근거: `src/ui/App.tsx:116-118`, `src/ui/screens/Script.tsx:168,217`, `spec.md` 열린 질문 답 6·설계 「화면」.

13. **0029 의 문장 두 곳이 맞지 않는다.** 하나는 "「장면」 탭을 열고 연다"의 중복 표현이다. 다른 하나는 "넣기는 0013 규칙(장면 끝, 겹치지 않는 가장 아래 트랙)"이다. 0013 에는 그 규칙이 없다. 그 규칙은 0016(겹치지 않는 가장 아래 트랙, 뒤 짤은 장면 끝)과 0013 의 보충 규칙(적합도가 가장 높은 장면 끝)에 나뉘어 있다.
    근거: `decisions/0029-scene-review.md` 결정 2·4, `decisions/0013-generation-merge-clips-memes.md`, `decisions/0016-caption-layers-opacity-brand.md`.

14. **정하지 않은 값이 둘 있다.** 하나는 강조색(`highlightColor`)의 기본값이다. 재정의가 없는 클립의 `*단어*` 가 어느 색으로 그려지는지 정하지 않았다. 다른 하나는 서브 자막의 `sceneIndex` 다. 요구사항 7 의 "자막"이 `scene-N-sub-caption` 을 포함하는지 정하지 않았다.
    근거: `spec.md` 요구사항 3·7, 설계 「데이터」.

15. **「강조」가 앱 안에서 두 뜻으로 쓰인다.** 스튜디오에서 「강조색」은 자막 단어 강조다. 캐러셀에서 「강조」는 Jev 상자 강조다(043 pages.md 6.3, 044 인스펙터 「강조」 섹션). 같은 아티팩트와 pages.md 안에서 한 단어가 두 대상을 부른다.
    근거: `spec.md` 요구사항 2, `043 pages.md` 6.3, `044 spec.md` 설계 「화면」.

## 처리

| # | 발견 | 판단 |
|---|---|---|
| I1 | B5 대체 범위·B0 의존 미정 | 채택 |
| I2 | 짤 바꾸기 위치 유지가 0016 과 어긋남 | 채택 |
| I3 | 짤 중복 금지(0013) 미반영 | 채택 |
| I4 | 별표 제거 경로 목록 불일치 | 채택 |
| I5 | 자막 나누기 길 없음 | 채택 |
| I6 | 방향키 충돌 | 채택 |
| n1 | 저장 프로젝트 sceneIndex 없음 | 채택 |
| n2 | 대본 출처·앞/뒤 값 불일치 | 채택 |
| n3 | 한 장면 짤 둘 | 채택 |
| n4 | trimCaptionClip 늘리기 불가 | 채택 |
| n5 | 후보 순위 경로 다름 | 채택 |
| n6 | 「굵게」 표현 불가 | 채택 |
| n7 | 저장 자막 별표 쌍·codex 별표 | 일부 채택 |
| n8 | 효과음 길이·분류 규칙 없음 | 채택 |
| n9 | 자막 더하기 경계 | 채택 |
| n10 | 장면 시각 출처 없음 | 채택 |
| n11 | 배율과 자동 맞춤 | 채택 |
| n12 | 대본 완료 진입 신호 없음 | 채택 |
| n13 | 0029 문장 오류 | 채택 |
| n14 | 단어 색 기본값·서브 자막 sceneIndex | 채택 |
| n15 | 「강조」 두 뜻 | 채택 |

I1 채택 — spec 「구현 분담」: 045 는 core·engine·render 만, B5 의 스튜디오 개편은 043 에 그대로 남고 045 는 「자막」「장면」 탭 두 화면을 B5 에 더한다. 043 은 044·045 병합 뒤 시작(장부 depends_on).
I2 채택 — 요구사항 5: `from-script` 의 길이·정렬 규칙 재사용(앞 짤 시작 맞춤, 뒤 짤 끝 맞춤, 2초 상한). 0029 에도 적었다.
I3 채택 — `usedMemeIds` 와 rank 의 `excludeIds`.
I4 채택 — 답 3 의 소비 경로 목록을 코드대로 고쳤다. 받아 적기 삭제, 파생 캐러셀·제목·번역·짤 검색 추가. 044 요구사항 14 와 같은 규칙.
I5 채택 — `splitCaptionClip` 과 「여기서 나누기」.
I6 채택 — ↑·↓ 는 목록 포커스일 때만, 입력 중 단축키 없음, 미리보기 방향키는 입력 포커스 때 무시.
n1 채택 — preprocess 가 id 패턴으로 채운다.
n2 채택 — `script.json`, 앞/뒤는 클립 id, reaction null 은 「보충 짤」.
n3 채택 — 앞·뒤 최대 둘.
n4 채택 — `setCaptionRange` 새 함수.
n5 채택 — rank 경로 재사용.
n6 채택 — 「굵게」 삭제.
n7 일부 채택 — codex·whisper 결과의 별표는 이스케이프해 저장한다. 이미 저장된 자막의 별표 쌍은 강조로 그려지는 것을 받아들인다(수가 극히 적다).
n8 채택 — 길이 min(1.5초, 파일, 영상 끝), 넣기는 「전체」 목록.
n9 채택 — 길이 min(3초, 다음 자막, 영상 끝), 0.3초 미만 비활성.
n10 채택 — 자막 → 짤·효과음 → 「—」 순.
n11 채택 — 맞춤 결과에 배율, 최소 20px, 별표 뺀 글로 측정.
n12 채택 — `initialTab`.
n13 채택 — 0029 문장 고침.
n14 채택 — 단어 색 기본 `#FFB020`, 서브 자막도 `sceneIndex`.
n15 채택 — 자막은 「단어 색」, 캐러셀은 「강조」.

plan 검토 목록 후보: I1(043 착수 순서), n7(저장 자막 별표 쌍).

