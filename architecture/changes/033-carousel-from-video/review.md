# Review: carousel-from-video
Author: claude-opus-5-5[1m] (opencodex 경유). Status: accepted. Round: 1.

## 대조한 것
- 변경 문서: `architecture/changes/033-carousel-from-video/intent.md`, `architecture/changes/033-carousel-from-video/spec.md`
- 지침과 제품 문서: `AGENTS.md`, `architecture/INTENT.md`
- 유효 결정: `architecture/decisions/0001-tauri-node-sidecar.md`, `0004-bundled-library-lazy-model.md`, `0007-whisper-stt.md`, `0008-voice-record-separate-cpu.md`, `0009-codex-model-select-jev.md`, `0012-overlay-memes-sfx-lanes.md`, `0013-generation-merge-clips-memes.md`, `0015-carousel-codex-image-gen.md`, `0017-scope-carousel-two-modes.md`. 대체된 0002·0003·0005·0006·0010·0011·0014 는 대체 관계와 0014→0017 의 문구 차이만 확인했다.
- 위키: `architecture/wiki/index.md`, `architecture/wiki/SCHEMA.md`, `pages/entity-desktop-app.md`, `pages/entity-engine-shutdown.md`, `pages/concept-local-models.md`, `pages/concept-timeline-editing.md`, `pages/concept-home-export.md`. main(`93fd59f`)의 위키 index 와 decisions 는 이 워크트리와 같다.
- 다른 변경: `ledger.sh show` 의 진행 중 변경은 030(plan)과 032(critic)이다. 001·031 은 done 이다.
  - 030: `/Volumes/X31/workspace/smp_workspace/u3-030-carousel-images/architecture/changes/030-carousel-images/{intent,spec,review}.md`. plan.md 는 아직 없다.
  - 032: `/Volumes/X31/workspace/smp_workspace/u3-032-video-edit-upgrade/architecture/changes/032-video-edit-upgrade/{intent,spec}.md`, 같은 워크트리의 `architecture/decisions/0016-caption-layers-opacity-brand.md`. plan.md 는 아직 없고 review.md 는 템플릿 상태다.
- 코드: `src/core/jev-api.ts`, `src/engine/pipeline/jev.ts`, `src/engine/routes/system.ts`, `src/engine/main.ts`, `src/core/schema.ts`(Timeline·Project·VideoClip·ScriptScene), `src/core/timeline/ops.ts`, `src/core/timeline/video-pointer.ts`, `src/remotion/U3Short.tsx`, `src/engine/pipeline/frames.ts`, `src/engine/routes/script.ts`, `src/engine/store.ts`(`deleteProject`), `src/ui/screens/Home.tsx`, `src/ui/screens/Studio.tsx`
- 참고: spec 이 Box 형식의 출처로 든 smp:computer 의 `/Volumes/X31/workspace/smp_workspace/smp-plugins/plugins/smp/skills/computer/bin/computer`(`BOX_MODEL`, `ask_jev`, `ask_box`). TypeSafe 공식 문서는 열지 않았다.

## 발견

### Important
1. **Box 질문은 0009 가 고정한 Jev 버전에서 돌지 않는다.** 0009 는 Jev 를 `jev-1.13.0` 으로 고정한다. U3 의 `JEV_MODEL` 도 `jev-1.13.0` 이고, 짤 판정 임계값이 이 버전의 답에 맞춰져 있다고 주석에 적혀 있다. spec 이 형식의 출처로 든 smp:computer 는 「이미지(Box) 질문은 1.14 이상만 받는다」고 적고 `BOX_MODEL = 'jev-1.14.0'` 을 따로 쓴다. 그래서 spec 대로 구현하면 두 결과 중 하나가 생긴다. 하나는 Box 요청이 1.13.0 에서 거부되는 것이다. 다른 하나는 구현자가 전역 버전을 올려 짤 판정 확률과 임계값이 바뀌는 것이다. spec 과 0017 은 Box 전용 버전을 정하지 않고, 0009 와의 관계도 적지 않는다. 설정 화면이 보이는 `jev: { model: "jev-1.13.0" }` 값도 함께 정해야 한다. 1.14 조건은 smp:computer 소스에서만 확인했고 TypeSafe 공식 문서로는 확인하지 않았다. 근거: `decisions/0009-codex-model-select-jev.md`, `src/engine/pipeline/jev.ts` `JEV_MODEL`, `src/engine/routes/system.ts`, `smp-plugins/plugins/smp/skills/computer/bin/computer` 78~79행, `spec.md` 설계 「대상 찾기」.
2. **장 배경 구조가 030 의 「엔진만 쓰는 필드」 규칙과 상태 규칙을 깬다.** 030 은 경합을 막으려고 `Slide.image`·`status`·`error` 를 엔진만 쓰게 하고, 화면 저장은 이 셋을 받지 않게 했다(030 review 1 채택). 033 은 `image` 를 `background.generated.image` 로 옮기고, `frame.file`·`highlight.box`·`highlight.image` 를 더한다. 이 값들은 프레임 다시 뽑기 작업, Jev 상자 찾기, AI 윤곽 작업, 사용자의 상자 끌기·자르기 슬라이더가 함께 쓴다. spec 은 어느 필드를 엔진만 쓰는지, 작업 결과와 화면 저장을 어떻게 병합하는지 정하지 않는다. 그대로 구현하면 030 이 막은 덮어쓰기가 파생 장에서 다시 생긴다. 030 의 `status`(대기·생성 중·완료·실패)도 이미지 생성 상태다. 프레임 장에서 이 값이 무엇을 뜻하는지, 다시 열 때 「실패」로 바꾸는 규칙과 「완료된 장만 받기」가 프레임 장에 어떻게 적용되는지 정해지지 않았다. 근거: `u3-030-carousel-images/.../030-carousel-images/spec.md` 설계 「데이터」·「작업 상태 복구」·요구사항 9, `.../030-carousel-images/review.md` 처리 1·5, `spec.md` 설계 「데이터」·「API」, 요구사항 4·5.
3. **AI 윤곽을 030 의 생성 경로로 돌리면 프레임의 글자가 지워진다.** 030 의 생성 프롬프트는 「글자 없음」을 넣고 `-i` 참고 이미지를 쓰지 않는다. 0015 는 「이미지는 글자 없는 배경으로 만든다」고 정하고, 이 문장은 단독 방식으로 한정되어 있지 않다. 033 은 그 경로에 `-i` 만 더한다고 쓴다. 그대로 쓰면 codex 가 상품 상표 글자를 지우거나 바꾸라는 지시를 함께 받는다. spec 의 우려 사항(상품 글자가 달라짐)을 더 키운다. AI 윤곽 작업의 프롬프트에서 「글자 없음」을 빼고 「원본 유지」를 넣는 규칙과, 0015 의 이 문장이 단독 방식에만 해당한다는 범위가 필요하다. 0017 은 0015 를 대체하지 않는다. 근거: `decisions/0015-carousel-codex-image-gen.md` 결정 3, `.../030-carousel-images/spec.md` 설계 「이미지 생성」, `spec.md` 열린 질문 답 「윤곽 강조」, 우려 사항 1, intent 영향 범위 「0015 는 단독 방식에 그대로 쓴다」.
4. **0017 이 단독 캐러셀의 장별 이미지 다시 만들기를 범위에서 뺀다.** 0014 는 「장마다 이미지 재생성과 텍스트 수정이 있다」고 정했다. 0014 를 대체하는 0017 은 「장마다 텍스트 수정이 있다」만 남긴다. 030 의 요구사항 6(장마다 「다시 만들기」)과 033 의 요구사항 4(030 의 다시 만들기를 쓴다)는 이 기능에 기대지만, 병합 뒤의 유효 결정에는 이 기능이 없다. 근거: `decisions/0014-core-scope-carousel.md`, `decisions/0017-scope-carousel-two-modes.md` 결정 7, `.../030-carousel-images/spec.md` 요구사항 6.
5. **032 의 데이터에는 「POV 레이어」가 없다.** 033 은 파생 글의 재료로 「타이틀·자막·POV 레이어 글」을 쓴다. 032 의 `CaptionLayer` 에는 종류 값이 없고, 「자막바를 끈 레이어가 POV 문구로 쓰인다」고만 정한다. 그래서 엔진은 POV 를 `style.bar === false` 로 추정하거나 모든 레이어를 같은 자막으로 넘겨야 한다. 032 의 레이어는 메인·서브 두 줄(기본 서브는 영어)을 가진다. 033 은 어느 줄을 넣는지 정하지 않는다. 타이틀은 032 의 `Timeline.brand.titleBar.text` 이고 비어 있을 수 있다. 근거: `u3-032-video-edit-upgrade/.../032-video-edit-upgrade/spec.md` 요구사항 7·9·13·15, 설계 「데이터」, `spec.md` 요구사항 2, 설계 「기획」.
6. **0017 이 032 가 대체하는 0012 를 가리킨다.** 0017 은 「사용자는 타임라인에서 편집한다(0012)」를 0014 에서 그대로 옮겼다. 032 는 0012 를 0016 으로 대체한다. 두 변경이 병합되면 유효 결정 0017 이 대체된 결정을 가리킨다. 032 와 033 중 늦게 병합하는 쪽이 이 참조를 0016 으로 바꾸는 순서를 정해야 한다. 근거: `decisions/0017-scope-carousel-two-modes.md` 결정 3, `u3-032-video-edit-upgrade/architecture/decisions/0016-caption-layers-opacity-brand.md` `Supersedes: 0012`.

### nit
1. **프레임을 TypeSafe 로 보내는 근거가 맞지 않는다.** intent 는 「프레임 한 장을 원격 AI 에 보내는 것은 대본 생성(프레임을 codex 에 보냄)과 같은 범위」라고 쓴다. spec 우려 사항 2 도 같은 이유를 든다. 그러나 대본 생성은 프레임을 codex(OpenAI)에만 보낸다. U3 의 Jev 요청은 지금 글(`state` 문자열·객체)만 보낸다. 그래서 Box 는 사람 얼굴이 담긴 프레임을 새 수신자(TypeSafe)에게 보내는 첫 경로다. smp:computer 는 이미지 요청에 `TypeSafe-Danger-Zone-Images: true` 헤더를 붙인다. 이 헤더의 뜻과 이미지 보관 조건은 확인하지 못했다. 근거: `intent.md` 제약 2, `spec.md` 우려 사항 2, `src/core/jev-api.ts` `JevRequest`, `src/engine/pipeline/jev.ts`, `smp-plugins/plugins/smp/skills/computer/bin/computer` `ask_jev`.
2. **codex 는 프레임을 보지 않고 강조 대상과 시각을 고른다.** spec 은 기획에 프레임 이미지를 넣지 않는다. 그런데 codex 는 장마다 「손에 든 상품과 손」 같은 대상 문장을 낸다. 화면에 무엇이 보이는지 모르는 codex 가 낸 대상은 그 프레임에 없을 수 있다. 그러면 Box 가 낮은 confidence 로 빈 상자를 내고 사용자가 직접 그려야 한다. 시각의 기준도 섞여 있다. `script.json` 의 장면 시각은 입력 기준(`inputIndex`, `startSec`)이고, 자막 클립 시각은 타임라인 기준이다. 사용자가 타임라인을 고친 뒤에는 `script.json` 이 타임라인과 맞지 않는다. spec 은 codex 가 내는 「영상 시각」의 기준과, 장면을 타임라인 시각으로 옮겨 넣는지를 정하지 않는다. 근거: `spec.md` 설계 「기획」, 요구사항 2, `src/core/schema.ts` `ScriptScene`, `src/engine/routes/script.ts`(`script.json`).
3. **「스냅숏」과 「프레임 다시 뽑기」가 맞지 않는다.** spec 은 캐러셀을 만들 때의 스냅숏으로 두고 영상을 고쳐도 바뀌지 않는다고 쓴다. 그러나 `POST .../frame { sec, cropY }` 는 저장된 타임라인 시각 `sec` 를 지금 프로젝트의 타임라인으로 다시 해석한다. 사용자가 영상을 고친 뒤에는 같은 `sec` 가 다른 클립·장면을 가리킨다. 원본 프로젝트를 지우면(요구사항 7) 다시 뽑기와 시각 슬라이더는 쓸 수 없다. `deleteProject` 는 프로젝트 폴더 전체(입력 원본 포함)를 지운다. 장에 `inputId`·입력 시각을 함께 저장하는지, 프로젝트가 없을 때 슬라이더를 끄는지 정해야 한다. 근거: `spec.md` 열린 질문 답 「원본 영상과의 관계」, 요구사항 5·7, 설계 「API」, `src/engine/store.ts` `deleteProject`.
4. **자르기 저장 방식과 상자 좌표 기준이 정해지지 않았다.** spec 은 프레임을 비율에 맞게 잘라 저장한다고 쓴다. 그러면 자르기 위치 슬라이더를 움직일 때마다 원본에서 다시 뽑아야 하고, 원본 프로젝트가 없으면 바꿀 수 없다. Box 상자가 자른 그림 기준인지 원본 프레임 기준인지도 정하지 않았다. 기준이 잘린 그림이면 `cropY` 를 바꿀 때 상자가 어긋난다. 가로 영상은 1080 폭으로 뽑으면 높이가 1350 보다 작아 세로 자르기만으로는 4:5 를 채우지 못한다. `frames.ts` 는 가로 입력을 이미 다룬다. 영상 1 은 `objectFit="cover"` 로 그려지므로 원본 프레임은 영상에서 보이던 화면과 범위가 다르다. 근거: `spec.md` 요구사항 3, 설계 「프레임」, `src/engine/pipeline/frames.ts` `extractFrames`, `src/remotion/U3Short.tsx` 18행.
5. **「기존 변환」이 코드에 없고 영상 1 의 짤 클립을 다루지 않는다.** spec 은 타임라인 시각을 영상 1 클립과 입력 시각으로 바꾸는 `src/core/timeline` 의 기존 변환을 쓴다고 쓴다. 코드에는 클립 시작 시각(`videoStartTimes`)과 클립 찾기(`findVideoClipAtTime`)만 있고, 입력 시각으로 바꾸는 함수는 없다. 0012·0016 은 영상 1 에 짤(`kind: "meme"`)이 있는 기존 project.json 을 그대로 읽는다고 정한다. spec 은 영상·사진 두 경우만 다루고, 그 시각이 짤 클립이나 전환 구간에 걸리는 경우를 정하지 않는다. 근거: `spec.md` 설계 「프레임」, `src/core/timeline/ops.ts` `videoStartTimes`, `src/core/timeline/video-pointer.ts`, `src/core/schema.ts` `VideoClip`, `decisions/0012-overlay-memes-sfx-lanes.md` 결과.
6. **AI 윤곽 결과의 수명과 생성 옵션이 정해지지 않았다.** 프레임을 다시 뽑거나 `cropY` 를 바꾸면 spec 은 상자만 다시 찾는다. 이전 프레임으로 만든 `highlight.image` 를 지우는지, 강조 형태를 바꿀 때 남기는지는 정하지 않았다. AI 윤곽에 설정의 이미지 모델·퀄리티를 쓰는지, 030 의 「가운데 자르기 뒤 1080 폭」 처리를 거치는지도 정하지 않았다. 가운데 자르기를 거치면 사용자가 고른 `cropY` 위치와 결과 범위가 달라진다. 근거: `spec.md` 요구사항 4·5, 설계 「합성」, `.../030-carousel-images/spec.md` 설계 「이미지 생성」.
7. **파생 캐러셀에는 030 의 필수 필드가 없다.** 030 의 `Carousel` 은 `topic`·`style` 을, `Slide` 는 `imagePrompt` 를 가진다. spec 은 030 형식을 새 형식으로 읽는 규칙만 쓰고, 파생 캐러셀에서 이 필드를 비우는지 선택 필드로 바꾸는지 정하지 않는다. 근거: `.../030-carousel-images/spec.md` 설계 「데이터」, `spec.md` 설계 「데이터」.
8. **API 와 경로 표기가 설계와 맞지 않는다.** `POST .../highlight` 본문은 `{ style, target, box? }` 이지만 화면은 색·두께도 고친다. spec 은 Box 를 `src/core/jev-api.ts` 에 더한다고 쓴다. 이 파일은 타입만 가진다. 요청은 `src/engine/pipeline/jev.ts` 가 JSON 으로만 보낸다. smp:computer 의 이미지 요청은 multipart 본문과 `assets` 목록을 쓴다. 근거: `spec.md` 설계 「대상 찾기」·「API」·「화면」, `src/core/jev-api.ts`, `src/engine/pipeline/jev.ts`, `smp-plugins/plugins/smp/skills/computer/bin/computer` `ask_jev`.
9. **검증 기준에 상자 끌기와 Jev 없는 경로가 없다.** 032 는 미리보기 끌기를 vitest 로 시험할 수 없다고 적고, 좌표 변환만 순수 함수로 시험한다. 033 의 실제 확인에는 상자 끌기, Jev 를 쓸 수 없을 때 상자 직접 그리기(요구사항 8), 프레임 다시 뽑기가 없다. 근거: `spec.md` 검증 기준, 요구사항 4·5·8, `.../032-video-edit-upgrade/spec.md` 우려 사항 4.
10. **스튜디오에는 Menu 가 없다.** 요구사항 1 은 「스튜디오와 홈 카드 Menu」에 「캐러셀 만들기」를 둔다고 쓴다. Menu 는 홈 카드에만 있다. 스튜디오에서 이 항목을 둘 위치가 정해지지 않았다. 근거: `spec.md` 요구사항 1, `src/ui/screens/Home.tsx` 152행, `src/ui/screens/Studio.tsx`.

## 처리
| # | 발견 | 판단 |
|---|---|---|
| I1 | Box 는 jev-1.14 인데 0009 는 1.13 고정 | 채택 |
| I2 | 배경 필드가 030 의 쓰기 규칙을 깸 | 채택 |
| I3 | AI 윤곽이 「글자 없음」으로 상품 글자를 지움 | 채택 |
| I4 | 0017 이 단독 장 다시 만들기를 뺌 | 채택 |
| I5 | 032 에 POV 레이어 종류가 없음 | 채택 |
| I6 | 0017 이 대체된 0012 를 가리킴 | 채택 |
| n1 | TypeSafe 로 이미지를 보내는 것은 새 경로 | 채택 |
| n2 | codex 가 프레임 없이 시각을 냄, 시각 기준 섞임 | 채택 |
| n3 | 스냅숏과 다시 뽑기의 충돌 | 채택 |
| n4 | 자른 프레임 저장, 상자 좌표 기준 | 채택 |
| n5 | 「기존 변환」이 없음, 영상 1 의 짤 | 채택 |
| n6 | AI 윤곽 결과 수명·옵션 | 채택 |
| n7 | 파생에 030 필수 필드 없음 | 채택 |
| n8 | highlight API 색·두께, Jev multipart | 채택 |
| n9 | 검증 기준 누락 | 채택 |
| n10 | 스튜디오에 Menu 없음 | 채택 |

I1 채택 — 0018 이 0009 를 대체한다. 짤 적합도는 1.13, Box 는 1.14 고정이다.
I2 채택 — 엔진 전용 필드와 장 단위 PATCH 를 정하고, status 를 배경 작업 하나의 상태로 정했다.
I3 채택 — AI 윤곽 지시문은 원본 글자를 지키고 「글자 없음」을 넣지 않는다. 0015 의 규칙은 단독 생성 그림에만 쓴다.
I4 채택 — 0017 에 단독 장 다시 만들기를 되살렸다.
I5 채택 — POV 종류 대신 모든 자막 레이어의 메인 줄을 재료로 쓴다.
I6 채택 — 0017 이 0016 을 가리키게 고쳤다.
n1 채택 — 우려 사항을 고치고, 설정의 Jev 끄기로 막을 수 있게 했다.
n2 채택 — codex 는 대본 장면 번호를 내고 엔진이 타임라인 시각으로 바꾼다.
n3 채택 — 다시 뽑기는 지금 타임라인에서 뽑고, 원본이 없으면 버튼을 끈다.
n4 채택 — 1080×1920 프레임을 자르지 않고 저장하고 합성 때 cropY 로 자른다. 상자는 그 프레임 기준 정규화 값이다.
n5 채택 — 영상 1 만 남긴 renderStill 로 뽑고, 짤 클립이면 가까운 본 화면으로 옮긴다. 변환 함수는 새로 만든다.
n6 채택 — 버전 파일, 설정의 이미지 옵션, 프레임이 바뀌면 버린다.
n7 채택 — 세 필드를 topic 출처일 때만 필수로 바꾼다.
n8 채택 — API 본문에 색·두께를 넣고 엔진의 multipart Jev 요청을 둔다.
n9 채택 — 검증 기준에 넷을 더했다.
n10 채택 — 스튜디오는 머리 줄 버튼으로 둔다.
