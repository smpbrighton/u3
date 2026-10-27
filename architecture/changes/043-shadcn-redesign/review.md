# Review: shadcn-redesign
Author: claude-opus-5-5[1m] (opencodex 경유). Status: accepted. Round: 1.

## 대조한 것
- 변경: `architecture/changes/043-shadcn-redesign/intent.md`, `spec.md`
- 지침: `AGENTS.md`, `architecture/INTENT.md`, `~/.claude/CLAUDE.md`(흐름·검증 절)
- 유효 결정: `architecture/decisions/0004`, `0007`, `0008`, `0013`, `0016`, `0019`, `0020`, `0021`, `0022`, `0023`, `0024`, `0025`. 대체된 결정 `0001`도 0025와 비교하려고 읽었다.
- 위키: `architecture/wiki/index.md`, `pages/entity-desktop-app.md`, `concept-timeline-editing.md`, `concept-carousel.md`, `concept-updates.md`, `concept-home-export.md`, `concept-local-tts.md`, `concept-local-models.md`
- 진행 중인 변경: `ledger.sh show` 를 기준으로 확인했다. 장부의 worktree 중 디스크에 있는 것은 `u3`(main)와 이 변경의 worktree 둘이다. `u3-039`, `u3-040`, `u3-042` 경로는 없다. 완료되지 않은 변경은 037(impl)과 041(impl)이다. 두 변경의 `plan.md` 는 main worktree(`/Volumes/X31/workspace/smp_workspace/u3/architecture/changes/`)에서 읽었다.
- 코드: `package.json`, `index.html`, `seed-design.json`, `seed-design/ui/`, `src/ui/main.tsx`, `src/ui/styles.css`, `src/ui/App.tsx`, `src/ui/api.ts`, `src/ui/screens/Settings.tsx`, `src/ui/studio/Inspector.tsx`, `src/ui/studio/Timeline.tsx`, `src/remotion/U3Short.tsx`, `src/remotion/CarouselSlide.tsx`, `src/core/fonts.ts`, `assets/fonts/`, `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json`, `src-tauri/gen/schemas/acl-manifests.json`(main), `src-tauri/src/main.rs`, `tests/ui/`
- 외부 확인: `@seed-design/css` 의 `all.css`·`all.layered.css`(main 의 node_modules), shadcn 레지스트리 `apps/v4/registry/new-york-v4/ui/sonner.tsx`, `npm view @tailwindcss/vite`(4.3.3, peer `vite ^5.2.0 || ^6 || ^7 || ^8`), tailwindcss.com/docs/compatibility(Safari 16.4 이상)

## 발견

### Important
1. 진행 중인 변경 037·041 의 확인 대상과 043 이 겹친다. 장부에서 037 brand-title-content 와 041 jev-key-setting 은 stage 가 impl 이다. 두 변경의 next 는 설정 화면의 사용자 확인이다. 037 은 워터마크·타이틀 바 카드를 확인하고, 041 은 Jev 키 입력·저장·지우기를 확인한다. 043 은 같은 설정 카드를 다시 만들고, 구현 순서 3 에서 설정을 첫 화면 묶음으로 둔다. 041 plan 의 검토 목록 5 는 Jev 카드의 「1열 배치(W63) 유지」와 키가 없을 때 입력 아래 안내 문구를 정했다. 043 요구사항 3(「라벨 왼쪽, 컨트롤·값 오른쪽」 한 줄, 같은 뜻의 글 줄이기)은 그 배치와 안내 문구를 바꾼다. spec 우려 4 는 "다른 UI 변경은 이 변경 뒤로 미룬다"고만 적고, 이미 열린 두 변경을 어떻게 닫을지 정하지 않는다. 확인 중 결함이 나오면 SEED 코드에서 고친 내용이 043 설정 묶음과 충돌한다. 043 이 먼저 병합되면 두 변경의 확인 대상 화면이 사라진다. 근거: `ledger.sh show` 의 037·041 행, `/Volumes/X31/workspace/smp_workspace/u3/architecture/changes/041-jev-key-setting/plan.md`(검토 목록 5), `/Volumes/X31/workspace/smp_workspace/u3/architecture/changes/037-brand-title-content/plan.md`(순서 6), `decisions/0020-title-bar-content.md`(카드마다 미리보기와 저장), `decisions/0024-jev-key-setting.md`, `src/ui/screens/Settings.tsx:313-413`.

### nit
1. 공존 기간에 SEED·기존 CSS 가 Tailwind 유틸리티를 이긴다. `src/ui/main.tsx:1` 은 `@seed-design/css/all.css` 를 불러온다. 이 파일에는 `@layer` 가 0건이다. `src/ui/styles.css:9-15` 도 layer 없이 `* { box-sizing }`, `button, input, textarea { font: inherit; }`, `input…, textarea, select { color: var(--seed-color-fg-neutral) }` 같은 요소 선택자를 둔다. Tailwind v4 유틸리티는 `@layer utilities` 안에 있으므로, layer 없는 선언이 선택자 우선순위와 상관없이 이긴다. 그래서 SEED 를 지우는 마지막 단계(구현 순서 4) 전까지 옮긴 화면의 shadcn Input·Textarea·Select 에서 글자 크기·색 유틸리티가 적용되지 않는다. spec 은 `styles.css` 를 "옮기는 만큼 줄이고 마지막에 지운다"고만 적는다. 1단계에서 SEED 를 `all.layered.css` 로 바꾸거나 `styles.css` 를 낮은 layer 로 감싸는 순서를 정해야 한다. 근거: `src/ui/main.tsx:1`, `src/ui/styles.css:1-15`, `@seed-design/css/all.css`(layer 0건)·`all.layered.css`(layer 2건), spec 「설계 > 기술」·「구현 순서」.
2. 기존 테스트가 SEED 소스 문자열을 단언한다. `tests/ui/studio-toolbar.test.ts` 는 `styles.css` 에 `--seed-color-fg-neutral` 이 있는지, `Studio.tsx` 에 `<StudioSlider label="재생 헤드"`, `studio-edit-toolbar`, `studio-playback-controls` 가 있는지 검사한다. `tests/ui/update-components.test.tsx:8` 은 `../../seed-design/ui/action-button` 을 mock 한다. `tests/ui/timeline-layout.test.ts` 는 `TRACK_ROW_HEIGHT` 를 28 로 고정한다. spec 은 `styles.css`·`SeedControls.tsx`·`seed-design/` 를 지우고 트랙 머리를 다시 만든다. 그러면 이 테스트가 실패한다. intent 제약 "기존 테스트의 동작 단언은 유지한다"는 소스 문자열 단언을 어떻게 다룰지 정하지 않는다. 어떤 단언을 동작 단언(두 테마의 입력 글자 색, 툴바의 재생 중복 없음)으로 바꿀지 plan 에서 정해야 한다. 근거: 위 테스트 파일들, intent 「제약」, spec 요구사항 7.
3. 주황 유지와 WCAG AA 가 서로 맞지 않는다. 지금 라이트 테마의 주황(`--seed-color-palette-carrot-600: #f60`) 위 흰 글자의 대비는 2.94:1 이다(WCAG 상대 휘도 식으로 계산했다). 다크 테마 값 `#e65200` 위 흰 글자도 3.77:1 이다. 요구사항 10 은 모든 글자에 4.5:1 이상을 요구한다. 「열린 질문에 대한 답」 4 는 주요 버튼(내보내기·만들기·모두 받기)에 주황을 쓴다. spec 은 `--primary-foreground` 를 정하지 않는다. 같은 주황 위 검은 글자는 7.15:1 이다. 주요 버튼의 글자 색 또는 주황 값을 spec 에서 정해야 한다. 근거: spec 「열린 질문에 대한 답」 4, 요구사항 5·10, `@seed-design/css/all.css:600`·`:820`.
4. 「화면·상태 목록」에 지금 있는 화면·상태가 빠졌다. 검증 기준 1 은 이 목록만 대조하므로, 빠진 항목은 아티팩트에서도 빠진다. 빠진 것:
   - 인스펙터: 원본 소리·분리한 소리(음성 분리 진행, 분리 되돌리기, 받아 적기 대상 선택), 영상 2 이상 클립 속성(위치·크기 슬라이더와 묶음 요약, 결정 0016), 자막 클립 속성(자막 글 편집), 자막 레이어 투명도, 워터마크 속성, 인스펙터 오류 배너.
   - 대화상자: whisper 모델 받기 확인, 기존 자막 교체 확인.
   - 타임라인: TTS 생성 진행·취소.
   - 공통: 엔진 연결 실패 배너.
   - 설정: 워터마크·타이틀 바 카드의 미리보기와 타이틀 이미지 올리기(결정 0020), 카드별 저장 상태, codex 상태 표시(설치·로그인), Jev 상태(확인 중·키 없음·연결됨)와 지우기(결정 0024), TTS·내보내기·음성 분리가 동시에 돌지 않을 때 막힌 상태(결정 0023).

   근거: `src/ui/studio/Inspector.tsx:88-335,408-416`, `src/ui/studio/Timeline.tsx:258`, `src/ui/App.tsx:137`, `src/ui/screens/Settings.tsx:332-413`.
5. 「부품 대응」 표에 지금 쓰는 SEED 부품 일부가 없다. 빠진 것은 SideNavigation(`App.tsx`), AttachmentField(`Recorder.tsx`, `LibraryPanel.tsx`), ChipTabs(`Input.tsx`, `Script.tsx`), SelectBox(`Script.tsx`), RadioGroup(`Inspector.tsx`), ToggleButton(`Timeline.tsx`), `@seed-design/react` 의 `Icon`(`Home.tsx`, `Studio.tsx`, `Carousels.tsx`, `Timeline.tsx`)이다. 요구사항 2 의 부품 보드에도 라디오·파일 첨부·칩 탭이 없다. 근거: `grep -rhoE "seed-design/ui/[a-z-]+" src` 결과, spec 「부품 대응」, 요구사항 2.
6. 요구사항 3 은 설정 카드의 모든 입력을 한 줄 32px 이하로 정하지만, 여러 줄 입력은 한 줄에 들어가지 않는다. 대본 프롬프트·말투·성격, 음성 말투 지시, 자막 글(`StudioTextarea rows={4}`), 캐러셀 본문·이미지 지시문, 타이틀 이미지 올리기, 브랜드 미리보기가 그렇다. spec 에는 예외 규칙이 없다. 근거: spec 요구사항 3, `src/ui/screens/Settings.tsx:437-468`, `src/ui/studio/Inspector.tsx:265`.
7. 테마 저장 위치가 intent 제약과 어긋난다. intent 제약은 "기능·데이터·엔진 API 는 바꾸지 않는다"이다. spec 은 `uiTheme` 를 엔진 설정 파일에 둔다. 지금 엔진은 설정을 항목별 route 로만 읽고 쓴다(`/api/system/codex-settings` 등). 그래서 새 route 가 필요하다. "첫 화면이 그려지기 전에 값을 읽는다"를 지키려면 `createRoot` 를 엔진 HTTP 응답 뒤로 미뤄야 한다. 엔진 연결이 실패할 때(`App.tsx:137`) 쓸 기본 테마도 spec 에 없다. 테마 설정을 이 제약의 예외로 적고, 실패할 때의 기본값을 정해야 한다. 근거: intent 「제약」, spec 「설계 > 기술」 셋째 항목, `src/engine/routes/system.ts:217-244`, `src/ui/main.tsx`, `src/ui/api.ts`.
8. shadcn 의 Sonner 부품은 `next-themes` 의 `useTheme` 로 테마를 정한다. 기본값은 `"system"` 이다. spec 의 테마 기준은 엔진 `uiTheme` 와 `<html>` 의 `dark` class 다. 부품을 그대로 가져오면 `uiTheme=dark` 이고 macOS 가 라이트일 때 토스트만 라이트로 보인다. 앱 테마 상태를 Toaster 의 `theme` 에 넘긴다고 spec 에 적어야 한다. 근거: shadcn `apps/v4/registry/new-york-v4/ui/sonner.tsx`, spec 「부품 대응」 Snackbar 행.
9. 창 배경색 맞추기에 필요한 권한을 spec 이 다루지 않는다. `capabilities/default.json` 의 `core:default` 에 들어 있는 `core:window:default` 에는 `allow-set-background-color` 와 `allow-set-theme` 가 없다(`gen/schemas/acl-manifests.json` 으로 확인했다). `tauri.conf.json` 의 창에는 `backgroundColor` 가 없다. 그래서 CSS 가 적용되기 전 첫 프레임은 기본 배경색이다. 권한을 추가할지, Rust 쪽에서 맞출지 정해야 한다. 결정 0021 은 웹뷰 권한을 좁게 두는 방침이다. 추정(확인 못 함): 창의 네이티브 테마를 강제하면 웹뷰의 `prefers-color-scheme` 이 강제한 값을 따른다. 그러면 「시스템 설정 따르기」로 바꿀 때 창 테마를 다시 풀어야 한다. 근거: `src-tauri/capabilities/default.json`, `src-tauri/tauri.conf.json`, spec 「설계 > 기술」, `decisions/0021-auto-update.md`.
10. 앱에 든 Pretendard 는 Regular(400)와 Bold(700) 두 굵기뿐이고, `styles.css` 는 `font-synthesis: none` 이다. shadcn 부품은 `font-medium`(500)과 `font-semibold`(600)를 쓴다. 그러면 500 은 400 으로, 600 은 700 으로 그려진다. 아티팩트가 다른 굵기로 그려지면 검증 기준 5 의 나란히 비교에서 어긋난다. 지금 UI 글꼴은 Pretendard 가 아니라 SEED 의 `-apple-system` 계열이다. 그래서 요구사항 8 은 UI 글꼴도 바꾼다. 굵기 파일을 더 넣을지, 디자인을 두 굵기로 제한할지 정해야 한다. 근거: `assets/fonts/`, `src/core/fonts.ts:11-12`, `src/ui/styles.css:4-5`, spec 요구사항 8, 「설계 > 기술」 밀도 항목.
11. 사람 승인 지점이 흐름 규칙보다 많고 위치가 모호하다. 「열린 질문에 대한 답」 6 과 검증 기준 2 는 아티팩트 승인을 "plan 의 게이트"라고 부른다. 그러나 아티팩트를 plan 승인 전에 만드는지, plan 안의 중간 정지인지 정하지 않았다. 검증 기준 5 는 화면 묶음마다 사용자 승인을 받으므로, 정지가 네 번 이상 늘어난다. 전역 지침은 plan 승인 뒤의 정지를 검증 명령과 파괴적 변경으로 한정한다. 이 변경의 예외로 명시해야 한다. 근거: spec 「열린 질문에 대한 답」 6, 「검증 기준」 2·5, `~/.claude/CLAUDE.md` 「흐름」.
12. SEED 잔존 판정의 범위가 좁다. 검증 기준 4 는 `src` 와 `package.json` 만 grep 한다. 그래서 다음 잔존을 잡지 못한다.
    - `index.html:2` 의 `data-seed data-seed-color-mode="light-only"` 와 `index.html:9` 의 `var(--seed-font-family)`
    - `seed-design.json`
    - `seed-design/ui` 만 쓰는 `@karrotmarket/react-monochrome-icon` 의존성
    - `tests/ui/update-components.test.tsx` 의 mock 경로

    근거: 위 파일들, spec 요구사항 7, 검증 기준 4.
13. 042 의 넘침 수정은 CSS 로만 지켜진다. 위키는 캐러셀 인스펙터가 grid 열과 segmented control 의 최소 폭을 제한한다고 기록한다(`src/ui/styles.css`, `git:2432e77`). 이 동작을 지키는 테스트는 없다. `styles.css` 를 지우면 같은 넘침이 다시 날 수 있다. 근거: `architecture/wiki/pages/concept-carousel.md`, spec 「설계 > 기술」.
14. 우려 5 는 「음성 만들기」 겹침 결함을 트랙 머리를 다시 만들며 고친다고 적는다. 전역 지침은 버그를 고칠 때 실패하는 테스트를 먼저 커밋하라고 정한다. spec 은 이 결함의 테스트를 정하지 않는다. 근거: spec 우려 사항 5, `~/.claude/CLAUDE.md` 「검증」.
15. Tailwind preflight 가 Remotion Player 안에도 적용된다. 엔진의 렌더 번들에는 적용되지 않는다. 적용되는 규칙은 `img, video { display: block; max-width: 100%; height: auto }` 와 제목·문단 기본값 초기화다. 결정 0016·0019 는 미리보기와 결과물이 같은 Remotion 구성을 쓴다고 정한다. 지금 `U3Short.tsx`·`CarouselSlide.tsx` 는 크기·여백 대부분을 inline style 로 준다. 그래서 실제로 달라지는 곳은 확인하지 못했다. 미리보기와 렌더 결과를 같은 프레임에서 비교하는 확인을 검증 기준에 넣을지 정해야 한다. 근거: `src/remotion/U3Short.tsx:36-186`, `src/remotion/CarouselSlide.tsx:20-40`, `decisions/0016-caption-layers-opacity-brand.md`, `decisions/0019-carousel-image-aspects.md`.
16. 결정 0025 의 「결과」에 0001 에서 옮긴 문장이 남아 있다. 그 문장은 "Remotion 을 sidecar 로 묶는 방법은 plan 첫 단계에서 검증한다"이다. 0025 의 Source 는 043 이므로, 이 문장은 043 plan 의 첫 단계 작업처럼 읽힌다. 이 검증은 001 에서 끝났다. 근거: `decisions/0025-ui-shadcn.md`, `decisions/0001-tauri-node-sidecar.md`.
17. Tailwind v4 는 Safari 16.4 이상을 대상으로 한다. `tauri.conf.json` 에는 `minimumSystemVersion` 이 없다. spec 은 intent 제약 「웹뷰는 macOS WebKit」에 대해 최소 WebKit 버전을 정하지 않는다. 지금 CSS 도 `color-mix`(Safari 16.2 이상)를 쓴다. 그래서 늘어나는 요구는 작다. 근거: tailwindcss.com/docs/compatibility, `src-tauri/tauri.conf.json`, `src/ui/styles.css:41`.

## 처리
| # | 발견 | 판단 |
|---|------|------|
| I1 | 037·041 의 설정 화면 확인과 겹침 | 채택 |
| n1 | 공존 기간에 SEED·기존 CSS 가 Tailwind 를 이김 | 채택 |
| n2 | 테스트가 SEED 소스 문자열을 단언 | 채택 |
| n3 | 주황 유지와 WCAG AA 충돌 | 채택 |
| n4 | 화면·상태 목록 누락 | 채택 |
| n5 | 부품 대응표 누락 | 채택 |
| n6 | 여러 줄 입력과 32px 한 줄 규칙 충돌 | 채택 |
| n7 | 테마 저장 위치와 엔진 API 제약 충돌 | 채택 |
| n8 | Sonner 의 next-themes 의존 | 채택 |
| n9 | 창 배경색 권한 없음 | 채택 |
| n10 | Pretendard 400·700 만 있음 | 채택 |
| n11 | 승인 지점이 모호함 | 채택 |
| n12 | SEED 잔존 grep 범위가 좁음 | 채택 |
| n13 | 042 넘침 수정에 테스트 없음 | 일부 채택 |
| n14 | 겹침 결함의 실패 테스트 없음 | 채택 |
| n15 | preflight 가 Remotion Player 에 적용 | 채택 |
| n16 | 0025 결과에 옛 문장 | 채택 |
| n17 | 최소 WebKit 버전 미정 | 채택 |

- I1 채택: 우려 6 으로 올렸다. 037·041 을 0.2.2 에서 확인해 닫은 뒤 설정 구현을 시작하고, Jev 카드 안내 문구는 화면 글 규칙(요구사항 12)이 대체한다.
- n1 채택: 설계에 `@layer seed, legacy` 를 Tailwind layer 앞에 두는 규칙을 넣었다.
- n2 채택: 검증 기준 7 에 동작 단언을 새 부품 기준으로 고친다고 넣었다.
- n3 채택: 요구사항 5 에 주황 바탕 글자 4.5:1 조건을 넣었다.
- n4 채택: 화면·상태 목록에 인스펙터 상태, 대화상자, TTS 진행, 연결 실패 배너, 설정 상태들을 더했다.
- n5 채택: 부품 대응표에 7종을 더했다.
- n6 채택: 요구사항 3 을 한 줄 입력에만 적용하고 여러 줄 입력은 폭 전체로 정했다.
- n7 채택: 테마 저장을 웹뷰 localStorage 로 바꿨다. 엔진 API 를 바꾸지 않는다.
- n8 채택: Sonner 에 앱 테마 상태를 넘기고 next-themes 를 쓰지 않는다.
- n9 채택: `core:window:allow-set-background-color` 를 설계에 넣었다.
- n10 채택: 요구사항 13 으로 400·700 만 쓰게 했다.
- n11 채택: 열린 질문 6 의 답에 사용자 요구 게이트 두 곳(기능 명세서 검토, 디자인 승인)을 plan 순서로 명시했다.
- n12 채택: 검증 기준 4 의 grep 범위를 넓혔다.
- n13 일부 채택: CSS 레이아웃 단위 테스트는 jsdom 에서 폭을 계산하지 못해 만들지 않는다. 대신 검증 기준 5 의 캡처 비교에 넘침 없음을 넣었다.
- n14 채택: 검증 기준 6 에 실패 테스트를 먼저 커밋한다고 넣었다.
- n15 채택: preflight 를 앱 셸에만 적용하고 미리보기·렌더 일치를 캡처로 확인한다.
- n16 채택: 0025 결과에서 문장을 지웠다.
- n17 채택: 요구사항 14 로 최소 macOS 15 를 정하고 우려 7 로 올렸다.
- 같은 커밋에 사용자 지시 두 가지(페이지별 기능 명세서, 설명 글 금지)를 intent 기대 결과와 spec 요구사항 11·12 에 반영했다.
