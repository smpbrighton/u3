# Review: playback-speed
Author: claude-opus-5-5[1m]. Status: draft. Round: 1.

## 대조한 것
- 변경 문서: `architecture/changes/047-playback-speed/intent.md`, `architecture/changes/047-playback-speed/spec.md`
- 지침: `AGENTS.md`, `architecture/INTENT.md`
- 유효 결정(accepted): `architecture/decisions/0004`, `0007`, `0008`, `0013`, `0016`, `0020`, `0021`, `0023`, `0024`, `0025`, `0026`, `0027`, `0028`, `0029`. 대체된 결정은 Status 만 확인했다.
- 위키: `architecture/wiki/index.md`, `pages/concept-timeline-editing.md`, `pages/concept-local-tts.md`, `pages/concept-caption-scene-review.md`, `pages/concept-ui-shell.md`, `pages/concept-compositor-dylib.md`. main(`f4fcf7a`)의 `concept-timeline-editing.md` 추가분(051)도 읽었다.
- 진행 중인 다른 변경(ledger 의 stage 가 done 이 아닌 것): `u3-048-shortcut-settings/architecture/changes/048-shortcut-settings/{intent,spec}.md`, `u3-049-windows-build/architecture/changes/049-windows-build/{intent,spec}.md`. 두 변경 모두 plan.md 가 아직 없다.
- main 에 먼저 병합된 변경: `050-jev-key-order/plan.md`, `051-studio-shortcuts/plan.md`, 그리고 `git diff 2cb7f1f main` 의 `src/ui/studio/Timeline.tsx`·`src/ui/studio/shortcuts.ts`.
- 화면 글 규칙: `architecture/changes/043-shadcn-redesign/pages.md` 0절.
- 코드: `src/core/schema.ts`, `src/core/timeline/ops.ts`, `src/core/timeline/to-render.ts`, `src/core/timeline/history.ts`, `src/core/timeline/scene-review.ts`, `src/core/timeline/from-script.ts`, `src/core/tts-clips.ts`, `src/core/transcript.ts`, `src/remotion/U3Short.tsx`, `src/ui/studio/Inspector.tsx`, `src/ui/studio/Timeline.tsx`, `src-tauri/src/main.rs`, `package.json`.
- 실행 확인: 레포의 `@remotion/media@4.0.529` 에서 `preservePitch` 는 `fallbackHtml5AudioProps` 안에만 있다. 이것은 spec 의 C안 판단과 맞는다. 포장 ffmpeg(`@remotion/compositor-darwin-arm64@4.0.529/ffmpeg`)에는 `atrim`·`asetpts`·`atempo`·`pcm_s16le`·`wav` 가 있다. Windows compositor 의 ffmpeg 는 확인하지 못했다.

## 발견

### Important

1. **영상 1 을 가속하면 자막과 장면이 영상 끝 밖에 남는다. 그 상태를 기존 편집 함수가 처리하지 못한다.**
   - 어긋나는 것: spec 은 Q3·요구사항 4·D4 에서 자막과 독립 클립의 시각을 유지하고 오버레이만 거절한다. 위키는 「`setCaptionRange`는 같은 행의 인접 자막과 영상 끝을 경계로 구간을 제한한다」고 적는다.
   - 코드 근거: `setCaptionRange` 의 상한은 `videoDuration` 이다. 영상 끝 뒤에서 시작하는 자막은 `upper - lower < 0.1` 이 되어 아무것도 바뀌지 않는다. 그래서 「자막」 탭의 구간 슬라이더가 그 자막을 고치지 못한다(0028). `addCaptionClip` 도 영상 끝 뒤에서는 null 을 반환한다.
   - 0029 영향: 「장면」 탭의 `sceneRange` 는 `videoDuration - row.sec` 로 길이를 자른다. 영상 끝 뒤의 장면은 길이가 0 이하가 된다. 그 장면에서는 짤 바꾸기·넣기가 장면 기준 배치를 하지 못한다.
   - 빠진 결정: spec 은 영상 끝 뒤 자막·음성·효과음의 편집 규칙을 정하지 않는다. 이 구간에 검은 화면 위 자막이 렌더되는지도 정하지 않는다(`to-render.ts` 의 `durationInFrames` 는 자막·오디오 끝까지 늘어난다).
   - 근거: `architecture/wiki/pages/concept-caption-scene-review.md`, `architecture/decisions/0028-caption-clip-style.md`, `architecture/decisions/0029-scene-review.md`, `src/core/timeline/ops.ts`(`setCaptionRange`, `addCaptionClip`), `src/core/timeline/scene-review.ts`(`sceneRange`), `src/core/timeline/to-render.ts`, `spec.md` 요구사항 4·(a)·D4.

2. **자동 생성 프로젝트에서 영상 1 가속은 대부분 거절된다.**
   - 어긋나는 것: spec (a) 는 「영상 1 배속으로 본 영상이 짧아져 기존 오버레이가 영상 1 끝을 넘으면 변경을 거절하고 트림을 안내한다」고 정한다.
   - 결정과 코드: 0016 과 0013 은 뒤 짤을 장면 끝에 맞춘다. 0013 은 원본 영상마다 짤을 하나 이상 넣는다. `memeClipPlacement` 의 뒤 짤은 `sceneStart + sceneDuration - durationSec` 에서 시작한다. 마지막 장면에 뒤 짤이 있으면 그 끝은 영상 1 의 끝과 같다. 그 상태에서 영상 1 의 클립 하나를 1배속보다 빠르게 하면 영상 1 의 길이가 줄어든다. 그래서 거절 조건이 걸린다.
   - 영향: 0029 는 자동 생성 결과 검토를 주 동선으로 정한다. 그 동선에서 영상 가속은 먼저 짤을 손으로 옮기거나 잘라야 한다. 기대 결과 「사용자는 영상 클립 … 배속을 지정한다」가 주 동선에서 거절로 끝난다. spec 은 이 상호작용을 다루지 않는다.
   - 근거: `architecture/decisions/0013-generation-merge-clips-memes.md`, `architecture/decisions/0016-caption-layers-opacity-brand.md`, `architecture/decisions/0029-scene-review.md`, `src/core/timeline/from-script.ts`(`memeClipPlacement`), `src/core/timeline/ops.ts`(`moveOverlayClip`·`trimOverlayClip` 의 `videoDuration` 상한), `spec.md` (a).

3. **049-windows-build 와 플랫폼 범위가 맞지 않는다.**
   - 049 의 내용: Windows 에서도 「같은 편집 모델·결과물 형식을 쓴다」고 정한다. Windows 의 ffmpeg 는 `@remotion/compositor-win32-x64-msvc` 의 `ffmpeg.exe` 이다. 미리보기 웹뷰는 WebView2 이다. TTS API 는 `unsupported-platform` 으로 거절한다.
   - 047 의 내용: 047 은 그 편집 모델에 클립 배속과 ffmpeg `atempo` 후처리를 넣는다. 그러나 검증 기준 6·10·11 은 Mac 포장 ffmpeg 와 「Tauri WebKit 미리보기」만 대상으로 한다. 047 이 엔진에 새로 두는 음성 준비 API 가 TTS 라우트와 분리되는지도 정하지 않는다. 분리하지 않으면 Windows 에서 녹음·불러온 음성의 배속까지 049 의 TTS 거절에 막힌다.
   - 경로 규칙: 049 는 새 media 경로에 `/` 정규화와 `path.win32` 루트 이탈 검사를 요구한다. 047 의 캐시 경로 설계는 이 규칙을 언급하지 않는다.
   - 공통 문제: 두 spec 모두 상대 변경을 언급하지 않는다. 늦게 병합하는 쪽이 다른 플랫폼의 검증을 맡아야 하는데, 어느 쪽이 맡는지 정해져 있지 않다.
   - 근거: `/Volumes/X31/workspace/smp_workspace/u3-049-windows-build/architecture/changes/049-windows-build/spec.md`(엔진과 리소스 조립 표, 플랫폼별 기능 표, 경로·프로세스·인증, 검증 기준), `spec.md` (b)·검증 기준 6·10·11, `src-tauri/src/main.rs`(`FFMPEG_BIN`).

### nit

1. **영상의 원본 소리 준비를 비동기로 할 때의 동작이 정해지지 않았다.**
   - spec 의 두 규칙: (d) 는 영상 배속과 전환 축소를 Timeline 변경 하나로 즉시 확정한다. (b) 는 원본 소리·stems 도 ffmpeg 준비 경로로 만든다.
   - 충돌: 요구사항 7 은 「성공 전에는 이전 배속과 파일을 유지」라고 한다. 요구사항 9 는 「캐시가 준비되지 않았을 때 1배속 음성을 새 배속인 것처럼 재생하지 않는다」고 한다. (c) 는 처리 중 상태를 음성 클립에만 정한다. 그래서 소리가 있는 영상의 배속을 바꿀 때 다음이 정해지지 않았다.
     - 확정 시점: 영상 배속은 즉시 확정하는가, 소리 준비가 끝난 뒤 확정하는가?
     - 준비 중 재생: 준비가 끝나기 전에 미리보기는 무음인가, 재생을 막는가?
     - 잠금 충돌: TTS·음성 분리가 heavy-media 를 잠근 동안 캐시 준비는 어떻게 되는가?
   - 반복 처리: 캐시 키에 원본 구간이 들어가므로, 배속 클립을 자르거나 트림할 때마다 새 ffmpeg 작업이 생긴다. 하지만 자르기·트림은 동기 Timeline 연산이다(0016). 원본 전체를 한 번 처리하고 오프셋만 바꾸는 안을 비교하지 않았다.
   - 근거: `spec.md` 요구사항 7·9, (b) 원본 소리 항목·캐시 키 항목, (c), (d), `src/core/timeline/to-render.ts`(영상 1 원본 소리·stems 레이어).

2. **안내 문구 규칙이 spec 안에서 서로 다르다.**
   - 서로 다른 부분: 열린 질문 답 3 은 「안내 문구는 두지 않는다(화면 글 규칙)」고 한다. 요구사항 4 는 「영상 길이가 바뀌어요. 자막과 다른 클립의 시각을 확인해 주세요.」라는 안내를 정한다. (a) 의 자막 후보 ① 도 「기존 시각 유지와 안내」다. (c) 는 원본 소리 선택 시 「해당 영상 선택을 안내한다」고 한다.
   - 규칙: 043 pages.md 0절은 입력 옆 설명문과 도움말 문장을 지운다. 남기는 것은 라벨·값·상태·오류 한 줄이다. 048 도 같은 규칙을 제약으로 둔다.
   - 남은 조건문: 요구사항 4 의 「권고안 Q3을 채택하면」과 D4 의 「자동 자막 보정이 필요하면 승인 때 이 항목을 바꿔야 한다」는 승인 전 조건문이다.
   - 근거: `spec.md` 열린 질문 답 3·요구사항 4·(a)·(c)·D4, `architecture/changes/043-shadcn-redesign/pages.md` 0절, `/Volumes/X31/workspace/smp_workspace/u3-048-shortcut-settings/architecture/changes/048-shortcut-settings/intent.md` 제약.

3. **TTS 생성과 배속 후처리의 순서, 그리고 전체 생성에서 배속을 유지하는지가 정해지지 않았다.**
   - 현재 코드: `applyTtsResults` 는 클립을 `inStartSec: 0, inEndSec: durationSec` 로 새로 만든다. 그래서 `speed` 를 잃는다.
   - spec 의 범위: Q4 는 「다시 만들기」만 배속을 유지한다고 정한다. 모든 자막의 음성을 다시 만들 때 클립별 배속을 유지하는지는 정하지 않았다.
   - 정하지 않은 순서: TTS 가 끝난 뒤 후처리를 같은 heavy-media 작업에서 하는지, 다른 작업에서 하는지 정하지 않았다. 두 작업 사이에 클립을 어떤 길이로 넣는지도 정하지 않았다. 요구사항 9 의 「1배속 음성을 새 배속인 것처럼 재생하지 않는다」를 이 사이에 어떻게 지키는지도 정하지 않았다.
   - 근거: `src/core/tts-clips.ts`(`applyTtsResults`), `spec.md` 열린 질문 답 4·(b) heavy-media 항목, `architecture/decisions/0023-qwen-tts-local.md`(「클립은 생성이 끝난 뒤 UI 가 넣는다」).

4. **경고 문구를 Inspector 에서만 바꾼다.**
   - 어긋나는 것: spec 은 「Inspector 안내도 「자막보다 음성이 길어요」로 맞춘다」고 한다. 그러나 타임라인의 같은 경고는 `title`·`aria-label` 에 「다음 음성과 겹쳐요」를 쓴다. Inspector 만 바꾸면 같은 경고에 문구가 두 개 생긴다.
   - 범위: 이 문구 변경은 intent 의 기대 결과에 없는 사용자 노출 변경이다.
   - 근거: `spec.md` (b) `ttsOverflow` 항목, `src/ui/studio/Inspector.tsx:239`, `src/ui/studio/Timeline.tsx:294-295`.

5. **후처리 파일을 정리하는 시점이 없다.**
   - spec 의 규칙: 「프로젝트 삭제 전에는 이력에서 참조하는 파일을 정리하지 않는다」고 하고, TTS 의 이전 원본도 지우지 않는다.
   - 코드: 실행 취소 이력은 메모리에만 있다. `history.ts` 에는 저장 경로가 없다.
   - 결과: 프로젝트를 다시 열면 이력이 비고, 이력만 참조하던 WAV 는 어디에서도 참조하지 않는다. 그래도 프로젝트를 지우기 전까지 남는다. C6 은 저장 공간 증가를 다루지만, 다시 열 때 정리할지는 정하지 않는다.
   - 근거: `spec.md` (b) 임시 파일 항목·TTS 재생성 항목·(d)·C6, `src/core/timeline/history.ts`.

6. **문서 머리와 기준 버전이 현재 상태와 다르다.**
   - Source 줄: `Source: intent.md (draft, 같은 턴의 초안)` 이다. 그러나 intent 는 accepted 로 커밋되었다(`7103011`).
   - 기준 버전: 검증 기준 12 는 「0.3.1 schema」를 기준으로 한다. main 은 0.3.2(`f4fcf7a`)를 릴리스했다. 0.3.2 는 schema 를 바꾸지 않았으므로 결과는 같다. 그래도 Q6 의 「0.3.x」와 표기를 맞춰야 한다.
   - 병합 순서: 워크트리는 0.3.1(`2cb7f1f`)에서 갈라졌다. spec 이 대상으로 삼는 `src/ui/studio/Timeline.tsx` 는 051 이 main 에서 바꿨다(`onPointerDown`·`onClickAction` 의 포커스 해제). 구현 전에 main 을 rebase 해야 한다.
   - 근거: `spec.md` 2행·검증 기준 12, `git log 2cb7f1f..main`.

## 처리

| # | 발견 | 판단 |
|---|------|------|
| I1 | 영상 1 가속 뒤 영상 끝 밖 자막·장면을 편집 함수가 처리하지 못함 | 채택 |
| I2 | 자동 생성 프로젝트에서 영상 1 가속이 뒤 짤 때문에 거절됨 | 채택 |
| I3 | 049 와 플랫폼 범위 불일치(준비 API·경로·Windows ffmpeg 검증) | 채택 |
| n1 | 소리 있는 영상의 비동기 준비 동작 미정·구간별 재처리 | 채택 |
| n2 | 안내 문구 규칙이 spec 안에서 다름 | 채택 |
| n3 | 전체 TTS 생성의 배속 유지·후처리 순서 미정 | 채택 |
| n4 | 경고 문구를 Inspector 만 바꿈 | 채택 |
| n5 | 후처리 파일 정리 시점 없음 | 채택 |
| n6 | Source 줄·기준 버전·rebase | 채택 |

- I1 채택 — Q3·요구사항 4·D4: 자막 편집기·장면 검토의 구간 상한을 영상 끝에서 프로젝트 끝(영상·자막·음성 끝의 최댓값)으로 바꾼다. 영상 끝 뒤 자막은 검은 화면 위에 렌더된다(현재 `timelineToRender` 규칙). 검증 기준 4 에 `setCaptionRange`·`addCaptionClip`·`sceneRange` 시험 추가.
- I2 채택 — 거절 대신 조정: 새 영상 1 끝을 넘는 오버레이는 시작을 앞당겨 끝을 맞추고, 영상 1 전체보다 길면 끝을 자른다. 같은 Timeline 변경 하나. Q3·(a)·D4·검증 4 반영. 사용자에게 보이는 동작이라 plan 검토 목록에 올린다.
- I3 채택 — 준비 API 를 TTS 와 별개 라우트 `POST /api/projects/:id/audio/prepare` 로 정하고, 결과 경로는 `/` 로 정규화한 프로젝트 상대 경로다. Windows ffmpeg `atempo` 시험은 뒤에 병합하는 쪽의 plan 에 둔다(검증 13).
- n1 채택 — 원본 파일 전체를 배속마다 한 번 처리하고 클립 구간을 캐시 좌표(`/speed`)로 바꾼다. 자르기·트림은 재처리하지 않는다. 캐시 키에서 원본 구간을 뺀다. 소리 있는 영상의 배속은 즉시 확정하고, 준비 전 미리보기는 그 레이어를 무음으로 재생하며 처리 중 상태를 보인다. 내보내기는 작업 안에서 준비 뒤 렌더한다.
- n2 채택 — 요구사항 4·(a) ①·(c) 의 안내 문구를 지운다. 조건문(「권고안 Q3을 채택하면」, D4 의 승인 조건)을 지운다.
- n3 채택 — Q4 를 전체 생성까지 넓힌다. TTS 라우트가 합성 뒤 같은 heavy-media 작업에서 후처리까지 하고 최종 경로·길이를 돌려준다. 클립은 둘 다 끝난 뒤 넣는다.
- n4 채택 — 타임라인 `title`·`aria-label` 도 「자막보다 음성이 길어요」로 맞춘다. 문구 변경은 plan 검토 목록에 올린다.
- n5 채택 — 프로젝트를 열 때 현재 Timeline 이 참조하지 않는 캐시·세대 파일을 지운다. 세션 중에는 지우지 않는다. 검증 7 반영.
- n6 채택 — Source 줄 수정, 검증 12 를 0.3.2 로, rebase 조건을 검증 13 에 적는다.
