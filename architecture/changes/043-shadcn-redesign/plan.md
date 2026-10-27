# Plan: shadcn-redesign (from spec.md)

## 검토 목록
사람이 결정할 항목만 둔다. 항목마다 추천, 이유, 근거를 적는다.
1. **037·041 먼저 닫기(spec 우려 6, critic I1):** 0.2.2 앱에서 타이틀 바 내용(037)과 Jev 키 입력(041) 카드를 확인해 두 변경을 닫은 뒤 043 의 설정 구현(B2)을 시작한다. **추천:** 그렇게 한다. **이유:** 같은 카드를 다시 만들기 전에 지금 동작이 맞는지 확정해야 회귀를 구별한다. Jev 카드의 안내 문구는 043 화면 글 규칙이 대체한다. **근거:** `review.md` I1.
2. **최소 macOS 15(spec 우려 7·요구사항 14):** macOS 13·14 에서는 설치되지 않는다. **추천:** 올린다. **이유:** 040 TTS 도우미가 이미 macOS 15 를 요구하고, Tailwind v4 는 Safari 16.4 이상이 필요하다. **근거:** `native/u3-tts/Package.swift` `platforms: [.macOS("15.0")]`.
3. **042 넘침 회귀 테스트를 만들지 않음(critic n13 일부 채택):** jsdom 은 레이아웃 폭을 계산하지 못한다. 캡처 비교로 대신 확인한다. **추천:** 그대로 둔다. **이유:** 브라우저 레이아웃 테스트 도구를 새로 들이는 일이 이 확인보다 크다.
4. **구현 확인 방식(spec 검증 기준 5):** 화면 묶음마다 멈추지 않고, 묶음마다 다크·라이트 캡처를 남긴 뒤 마지막에 「디자인 ↔ 구현」 비교 페이지 하나로 한 번에 확인받는다. **추천:** 그렇게 한다. **이유:** 사용자가 실제로 써 보며 검증하겠다고 했고, 멈추는 곳은 사용자 게이트 두 곳(명세서·디자인)과 마지막 비교로 충분하다.
5. **구현 작업자:** 단계 B(앱 코드)는 Orca 의 codex 워커(`--dangerously-bypass-approvals-and-sandbox`, 이 변경의 워크트리)에게 묶음 단위로 맡기고 감독자(이 세션)가 묶음마다 diff·검증을 확인한다. 단계 A(명세서·아티팩트)는 이 세션이 직접 한다. **추천:** 그렇게 한다. **이유:** 039·040 에서 같은 방식으로 진행했고, 디자인 판단은 감독자가 쥐는 편이 일관된다.

## 바꿀 파일
### 단계 A — 문서와 디자인(앱 코드 변경 없음)
- `architecture/changes/043-shadcn-redesign/pages.md` (new): 페이지별 기능 명세서(spec 요구사항 11, 「기능 명세서」 절).
- 디자인 아티팩트(새 Artifact 하나, Design 타입. 안 되면 테마 전환이 있는 HTML 페이지): 표지·원칙(화면 글 규칙) → 토큰 → 부품 → 화면 보드(목록 순서, 보드마다 핵심 명세, 다크·라이트) → 대응표.
- `architecture/changes/043-shadcn-redesign/design.md` (new): 아티팩트 URL, 대응표 사본, 확정한 토큰 값.

### 단계 B — 구현
- 기반: `package.json`(tailwindcss v4, `@tailwindcss/vite`, Radix·shadcn 의존성, `sonner`), `vite.config.ts`, `components.json`(new), `src/ui/theme.css`(new, 토큰·`@layer seed, legacy` 순서), `src/ui/main.tsx`(CSS 순서), `src/ui/components/ui/*`(new, shadcn 부품 — lucide → Hugeicons, 500·600 → 400·700), `src/ui/components/u3/*`(new: PropertyRow, PropertySection, Toolbar, TrackHeader, EmptyState, StepNav), `src/ui/theme-state.ts`(new: localStorage `u3.uiTheme`, `system` 추적, 창 배경색), `src-tauri/capabilities/default.json`(`core:window:allow-set-background-color`), `src-tauri/tauri.conf.json`(`minimumSystemVersion: "15.0"`).
- 화면: `src/ui/App.tsx`, `src/ui/UpdateControls.tsx`, `src/ui/ExportDialog.tsx`, `src/ui/screens/{Home,Input,Script,Studio,Carousels,Settings}.tsx`, `src/ui/screens/carousel/*`, `src/ui/settings/*`, `src/ui/studio/{Inspector,LibraryPanel,Preview,PreviewEditLayer,Recorder,Timeline,CaptionLayerEditor}.tsx` — 명세서와 디자인대로 다시 만든다.
- 삭제: `seed-design/`, `seed-design.json`, `src/ui/studio/SeedControls.tsx`, `styles.css` 의 SEED 의존 규칙, `@seed-design/*` 의존성.
- 테스트: `tests/ui/theme-state.test.ts`(new), 트랙 머리 겹침 실패 테스트(new), SEED 문자열을 단언하던 `tests/ui/studio-toolbar.test.ts`·`tests/ui/update-components.test.tsx`·`tests/ui/timeline-layout.test.ts` 등은 같은 동작을 새 부품 기준으로 단언하게 고친다.
- 결정·위키: `decisions/0025-ui-shadcn.md` 는 이미 있다. 위키는 라운드 마감 ingest 로 반영한다.

## 순서
### 단계 A
1. 현재 기능을 코드(`src/ui/` 전체)와 캡처 아티팩트(https://claude.ai/artifact/Ci7ioBeQeMfPy1R6sijYjn)에서 뽑아 `pages.md` 를 쓴다. 묶음: 공통, 영상 목록, 1 미디어, 2 대본, 스튜디오, 캐러셀, 설정. 항목: 하는 일 한 줄, 대상, 대상별 핵심 동작, 상태, 들어오고 나가는 화면, 바꾼 동선과 이유 한 줄. 화면·상태 목록(spec)의 모든 항목이 어느 절에 있는지 표로 확인한다. 커밋한다.
2. **사용자 게이트 1:** `pages.md` 를 보고 동선을 확정받는다. 정지한다. 받은 수정은 반영해 커밋한다.
3. Design 타입으로 아티팩트를 만들고 보드 수·테마 전환이 되는지 먼저 확인한다. 안 되면 HTML 페이지로 바꾸고 `design.md` 에 적는다.
4. 토큰(색 두 테마·주황 대비 4.5:1 확인·글자·간격·행 높이·모서리)과 부품 보드를 만든다.
5. 화면 보드를 명세서 순서로 만든다. 보드마다 핵심 명세를 붙이고 화면 글 규칙(요구사항 12)을 지킨다. 실제 데이터(현재 프로젝트·캐러셀 이름)를 쓴다.
6. 대응표 보드를 채워 빈 칸이 0 인지 확인한다. `design.md` 를 커밋한다.
7. **사용자 게이트 2:** 아티팩트를 승인받는다. 정지한다. 승인 전에는 앱 코드를 바꾸지 않는다.
### 단계 B(묶음마다: 테스트 먼저 → 구현 → `pnpm verify` → 다크·라이트 캡처 → 커밋)
8. B0 기반: Tailwind·shadcn·토큰·CSS layer·테마 상태·창 배경색·최소 macOS. 테마 테스트 먼저.
9. B1 공통 셸: 사이드바·업데이트 표시·토스트·배너·확인 대화상자·엔진 연결 실패.
10. B2 설정(검토 목록 1 이후): 테마 구역 포함 모든 카드.
11. B3 캐러셀: 목록·대화상자·단독·영상 편집.
12. B4 영상 목록·1 미디어·2 대본.
13. B5 스튜디오: 트랙 머리 겹침 실패 테스트 먼저 커밋 → 머리줄·라이브러리·미리보기·툴바·타임라인 재칠·인스펙터 전 상태·대화상자.
14. B6 SEED 제거: 래퍼·의존성·잔존 grep 0.
15. `pnpm verify`, `pnpm package`, 패키징한 앱 캡처로 「디자인 ↔ 구현」 비교 페이지(아티팩트)를 만든다. 사용자 확인을 받는다.
16. 병합·push, 위키 ingest, `release.sh` 로 릴리스.

## 리스크
- **가장 위험한 단계는 B5 스튜디오다.** 인스펙터·타임라인·미리보기 편집 레이어가 상태가 많고 단축키·끌기 동작이 얽혀 있다. 동선 변경(자막 클립 선택 → 그 자막 글 바로 고치기)이 실행 취소 기록과 선택 상태를 건드린다. 기존 동작 테스트를 유지하고, 동선을 바꾼 곳은 테스트를 먼저 더한다.
- CSS 공존 기간에 layer 순서를 틀리면 옮긴 화면과 남은 화면이 서로 깨진다. B0 에서 layer 순서를 테스트할 캡처 하나를 남긴다.
- Remotion Player 에 preflight 가 들어가면 미리보기와 렌더가 달라진다. 미리보기 영역을 preflight 밖에 두고 B3·B5 캡처로 비교한다.
- Design 타입이 40개 이상 보드나 테마 전환을 받지 못할 수 있다(spec 우려 3). 3단계에서 먼저 확인한다.
- 택하지 않은 대안: SEED 유지하고 CSS 만 덮기(모바일 부품 구조가 남음), shadcn 부품을 일반 CSS 로 옮기기(갱신 추종 어려움), 라이트 하나만(사용자 지시와 어긋남), 화면 묶음마다 별도 변경(같은 기반을 여러 번 rebase).

## 증명
1. 단계 A: `pages.md` 의 대응 표에서 spec 화면·상태 목록 누락 0. 아티팩트 대응표 빈 칸 0. 사용자 게이트 1·2 의 답을 `design.md` 에 인용.
2. `pnpm verify` 종료 코드 0, 마지막 줄 `✓ verify passed`(묶음마다, 그리고 병합 전).
3. `grep -rn "seed-design\|karrotmarket" src index.html package.json tests` 0줄, `seed-design.json`·`seed-design/` 없음.
4. 테마 테스트: 세 선택지 저장·복원, `<html>` class 전환, `system` 추적.
5. 트랙 머리 겹침 테스트가 수정 전 실패·수정 후 통과(출력 기록).
6. 묶음마다 다크·라이트 캡처 경로 기록. 마지막 비교 페이지에 042 넘침 없음과 미리보기·렌더 일치 포함.
7. 패키징한 앱에서 네트워크를 끄고 Pretendard 로 보이는지 캡처.
8. 미검증 항목은 완료 보고에 그대로 적는다.

## 롤백
- 데이터·엔진 API 변경이 없다. 테마 선택은 웹뷰 localStorage 에만 있다.
- 묶음 커밋 단위로 되돌릴 수 있다. 병합 뒤 문제가 크면 병합 커밋 전체를 되돌리고 0.2.x 로 다시 릴리스한다. 결정 0025 는 새 결정으로 대체해 SEED 로 돌린다.
- 최소 macOS 15 는 되돌리면 macOS 13·14 설치가 다시 열린다(TTS 는 여전히 15 필요).
