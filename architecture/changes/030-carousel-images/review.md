# Review: carousel-images
Author: claude-opus-5-5[1m] (opencodex 경유). Status: draft. Round: 1.

## 대조한 것
- 변경 문서: `architecture/changes/030-carousel-images/intent.md`, `architecture/changes/030-carousel-images/spec.md`
- 지침과 제품 문서: `AGENTS.md`, `architecture/INTENT.md`
- 유효 결정: `architecture/decisions/0001-tauri-node-sidecar.md`, `0004-bundled-library-lazy-model.md`, `0007-whisper-stt.md`, `0008-voice-record-separate-cpu.md`, `0009-codex-model-select-jev.md`, `0012-overlay-memes-sfx-lanes.md`, `0013-generation-merge-clips-memes.md`, `0014-core-scope-carousel.md`, `0015-carousel-codex-image-gen.md`. 대체된 0002·0003·0005·0006·0010·0011 은 대체 관계만 확인했다.
- 위키: `architecture/wiki/index.md`, `architecture/wiki/SCHEMA.md`, `pages/entity-desktop-app.md`, `pages/entity-engine-shutdown.md`, `pages/concept-local-models.md`, `pages/concept-timeline-editing.md`, `pages/concept-home-export.md`
- 다른 변경: `ledger.sh show` 의 결과는 001(done, `/Volumes/X31/workspace/smp_workspace/u3`), 030(이 변경), 031(done, worktree 없음)이다. 진행 중인 다른 변경은 없다. done 인 031 은 main 에 병합되어 있으므로 `/Volumes/X31/workspace/smp_workspace/u3/architecture/changes/031-script-prompt-setting/plan.md` 와 main 의 diff(`e547551..93fd59f`)를 읽었다.
- 코드: `src/engine/pipeline/codex.ts`, `src/engine/jobs.ts`, `src/engine/main.ts`, `src/engine/store.ts`, `src/engine/pipeline/media-server.ts`, `src/engine/routes/media.ts`, `src/engine/pipeline/render.ts`, `src/engine/pipeline/usage.ts`, `src/engine/routes/system.ts`(main), `src/remotion/Root.tsx`, `src/remotion/fonts.ts`, `src/ui/App.tsx`, `src/ui/screens/Home.tsx`, `src-tauri/capabilities/`, `package.json`, `scripts/build-engine.ts`
- 참고 래퍼: `/Volumes/X31/workspace/smp_workspace/smp-plugins/plugins/smp/skills/gpt-image/SKILL.md`, `.../gpt-image/bin/gpt-image`. 로컬 `codex exec --help`(codex-cli 0.164.0)와 `codex features list` 도 확인했다.

## 발견

### Important
없음. spec 은 0001·0009·0014·0015 와 위키 페이지의 서술에 어긋나지 않는다. 진행 중인 다른 변경이 없으므로 충돌도 없다.

### nit
1. **UI 의 전체 저장과 작업 결과 저장이 서로 덮어쓴다.** spec 의 API 는 `PUT /api/carousels/:id` 로 캐러셀 전체를 저장한다. 같은 시각에 이미지 작업은 장의 `image`·`status` 를 같은 `carousel.json` 에 쓴다. 요구사항 6 은 다시 만드는 동안 다른 장을 편집하게 한다. 그래서 UI 가 이전 상태로 PUT 하면 끝난 작업의 이미지 버전과 상태가 되돌아간다. 프로젝트 저장소는 키 잠금과 원자적 쓰기만 하고 버전 검사가 없다(마지막 쓰기가 이긴다). 「프로젝트 저장소와 같은 방식」으로는 이 경합을 막지 못한다. 장 단위 텍스트 수정 API 를 두거나, PUT 이 `image`·`status`·`error` 를 받지 않게 하는 규칙이 필요하다. 근거: `spec.md` 설계 「데이터」·「API」, 요구사항 6·7, `src/engine/store.ts` `saveProject`.
2. **동시 생성에서 결과 되찾기가 다른 장의 이미지를 가져갈 수 있다.** spec 은 결과 PNG 가 없으면 /smp:gpt-image 래퍼와 같은 방식으로 `generated_images` 에서 찾는다고 쓴다. 래퍼는 session id 를 읽지 못하면 `generated_images/` 전체에서 시작 뒤에 생긴 가장 최근 PNG 를 고른다. 동시 실행 수가 2 이상이면 이 경로는 다른 장의 그림을 고른다. 래퍼는 사람이 읽는 로그에서 `session id:` 줄을 읽는다. U3 실행기는 `--json` 을 쓰므로 그 줄이 없고, 이벤트에서 세션 id 를 읽어야 한다. U3 실행기는 `--ephemeral` 도 쓴다. 로컬 help 는 이 옵션을 "Run without persisting session files to disk" 로 설명한다. 이 옵션에서 `generated_images` 가 남는지는 확인하지 못했다. 세션 id 가 없으면 실패로 처리하는 규칙이 필요하다. 근거: `spec.md` 설계 「이미지 생성」, `smp-plugins/plugins/smp/skills/gpt-image/bin/gpt-image` 되찾기 부분, `src/engine/pipeline/codex.ts` `codexCliArgs`.
3. **엔진 큐 하나로는 설정한 동시 실행 수를 지키지 못한다.** `JobRegistry` 는 엔진 전체에 `PQueue` 하나(concurrency 2)를 둔다. 대본·렌더·음성 분리·받아 적기·모델 받기가 이 큐를 같이 쓴다. 이미지 작업을 이 큐에 넣으면 설정 값 3(기본)이 2로 줄고, 1~5분 걸리는 이미지 작업이 렌더와 대본 작업을 막는다. 큐의 concurrency 를 설정 값으로 바꾸면 렌더·음성 분리도 최대 10개가 동시에 돈다. spec 의 「엔진 큐(동시 수 = 설정 값)」는 이미지 전용 큐인지 밝히지 않는다. 근거: `spec.md` 설계 「이미지 생성」, 요구사항 5, `src/engine/jobs.ts` `JobRegistry` 생성자, `src/engine/main.ts` `new Jobs()`.
4. **이미지 작업의 codex 실행 조건이 정해지지 않았다.** 지금 실행기는 `--sandbox read-only`, `--disable shell_tool`, `--disable image_generation`, `--ephemeral` 을 고정으로 넣는다. 래퍼는 `-s workspace-write` 와 셸 명령(cp·mv)으로 결과를 저장한다. 그래서 이미지 작업은 다른 인자 묶음이 필요하다. spec 은 샌드박스 모드와 셸 허용 여부를 쓰지 않는다. 이미지 작업의 codex 에이전트 모델·effort 도 정하지 않는다. 0015 는 기획·다듬기만 대본 설정을 쓴다고 정한다. 또 `runScript` 는 `CodexScript` 스키마에 묶여 있다. 기획·다듬기가 「같은 실행기」를 쓰려면 스키마를 인자로 받게 바꿔야 한다. 근거: `spec.md` 설계 「이미지 생성」·「기획·다듬기」, `decisions/0015-carousel-codex-image-gen.md`, `src/engine/pipeline/codex.ts`.
5. **앱을 다시 열면 「생성 중」 상태가 남는다.** 작업은 메모리에만 있다. `Slide.status` 는 `carousel.json` 에 저장된다. 생성 중에 앱을 닫으면 다시 열 때 그 장은 끝나지 않는 「대기」·「생성 중」으로 보인다. 요구사항 10 은 편집 상태가 남는다고만 쓴다. 읽을 때 활성 작업이 없는 장을 실패로 바꾸는 규칙이 필요하다. 생성 중인 캐러셀의 삭제도 정하지 않았다. 프로젝트는 `hasActiveForProject` 로 이 경우를 다룬다. 근거: `spec.md` 요구사항 10, 설계 「데이터」, `src/engine/jobs.ts` 머리 주석.
6. **sharp 는 새 네이티브 의존성이다.** `package.json` 에 sharp 가 없다. 패키징은 `scripts/build-engine.ts` 의 `runtimePackages` 목록만 sidecar 에 넣고, 네이티브 모듈마다 `checkDylibs` 로 외부 dylib 를 검사한다. spec 은 이 두 곳의 변경을 적지 않는다. 엔진에는 Remotion compositor 의 ffmpeg 가 이미 있으므로 자르기는 ffmpeg 로도 할 수 있다. 근거: `spec.md` 설계 「이미지 생성」, `package.json`, `scripts/build-engine.ts` `installProductionDependencies`.
7. **요청할 이미지 크기가 정해지지 않았다.** /smp:gpt-image 는 크기를 16 의 배수로 제한한다. 1080×1350 과 1080×1080 은 16 의 배수가 아니다. spec 은 프롬프트에 「크기」를 넣는다고만 쓴다. 비율별로 요청할 크기(예: 1024×1280, 1024×1024)와, 결과를 자른 뒤 1080 폭으로 맞추는 단계를 정해야 한다. 근거: `spec.md` 열린 질문 「비율」, 설계 「이미지 생성」, `smp-plugins/plugins/smp/skills/gpt-image/SKILL.md` 「호출」의 size.
8. **기본 동시 수 3 은 결정에 고정되어 있다.** spec 은 「최종 값은 실제 시험으로 다음 단계에서 정한다」고 쓴다. 0015 는 accepted 상태로 「기본 3」을 정한다. 시험 결과로 기본값이 바뀌면 0015 를 대체하는 결정이 필요하다. spec 의 이 문장과 0015 중 하나를 맞춰야 한다. 근거: `spec.md` 열린 질문 「동시 실행 수」, `decisions/0015-carousel-codex-image-gen.md`.
9. **이 worktree 는 031 병합 전 커밋에서 갈라졌다.** main 은 031 에서 `Settings.tsx`, `routes/system.ts`, `routes/script.ts` 를 바꾸었다. 이 변경도 같은 파일을 바꾼다. 031 은 사용자가 고친 대본 기본 지시문을 `settings.scriptPrompt` 에 저장하고 대본 요청에 넣는다. spec 의 「대본 생성과 같은 codex 실행기」가 이 지시문을 기획·다듬기에도 넣는지 정하지 않았다. 이미지 옵션의 설정 API 경로도 API 목록에 없다. 031 은 `/api/system/<이름>` 형식을 쓴다. 근거: `/Volumes/X31/workspace/smp_workspace/u3/architecture/changes/031-script-prompt-setting/plan.md`, main 의 `src/engine/routes/system.ts`, `spec.md` 요구사항 8, 설계 「API」.
10. **캐러셀 이미지를 내보낼 미디어 경로가 없다.** 미디어 서버의 루트는 `projects` 와 `library` 둘이다. UI 미리보기와 `renderStill` 은 URL 로 이미지를 읽는다. 그래서 `carousels` 루트를 더하거나 `GET /api/carousels/:id/files/*` 가 다른 방식으로 파일을 내주어야 한다. spec 은 이 경로의 방식을 쓰지 않는다. Remotion 번들에 `CarouselSlide` Composition 을 등록하는 단계도 적지 않았다. 근거: `src/engine/main.ts` `startMediaServer`, `src/engine/routes/media.ts`, `src/remotion/Root.tsx`, `spec.md` 설계 「합성」·「API」.
11. **intent 의 쓰기 제약과 codex 동작이 맞지 않는다.** intent 는 「실제 사용자 데이터 폴더 밖에 쓰지 않는다」고 쓴다. codex 는 `$CODEX_HOME/generated_images/<session id>/` 에 그림을 남긴다. 로컬에는 이 폴더가 456개 있다. 실행기의 작업 폴더도 `tmpdir()` 에 있다. 이 제약이 앱 자신의 쓰기만 뜻하는지 정하지 않았다. 장마다 남는 `generated_images` 를 지울지도 정하지 않았다. 다시 만들 때 생기는 이전 버전 이미지(`images/<slideId>-<version>.png`)의 정리도 정하지 않았다. 근거: `intent.md` 제약, `spec.md` 설계 「데이터」·「이미지 생성」, `~/.codex/generated_images/`.
12. **받기 폴더와 파일 이름 규칙이 덜 정해졌다.** 캐러셀 이름에 `/`·`:` 가 있거나 이름이 비면 폴더 이름을 어떻게 만드는지 정하지 않았다. 미완료 장을 빼고 받을 때 번호가 원래 장 번호를 따르는지(01, 03), 다시 매기는지(01, 02)도 정하지 않았다. 근거: `spec.md` 열린 질문 「받기 형식」, 요구사항 9.
13. **0009 와 0015 의 관계가 문서에 없다.** intent 는 「0009 에 codex 이미지 생성 쓰임이 더해진다」고 쓴다. spec 의 결정 절과 0015 는 0009 를 가리키지 않고, 0009 도 바뀌지 않았다. 0009 의 「대본 생성은 codex CLI 로 한다」와 「이 결정은 원격 AI 호출의 범위다」를 읽는 사람은 이미지 생성이 0015 에 있다는 것을 알 수 없다. 근거: `intent.md` 영향 범위, `spec.md` 결정, `decisions/0009-codex-model-select-jev.md`, `decisions/0015-carousel-codex-image-gen.md`.

## 처리
| # | 발견 | 판단 |
|---|---|---|
| 1 | 화면 전체 저장이 이미지 결과를 덮어씀 | 채택 |
| 2 | 동시 생성에서 다른 장의 그림을 되찾음 | 채택 |
| 3 | 엔진 큐 하나로 동시 수를 못 지킴 | 채택 |
| 4 | 이미지 작업의 codex 실행 조건 미정 | 채택 |
| 5 | 다시 열면 「생성 중」이 남음 | 채택 |
| 6 | sharp 는 새 네이티브 의존성 | 채택 |
| 7 | 요청 이미지 크기 미정 | 채택 |
| 8 | 기본 동시 수 문장이 0015 와 어긋남 | 채택 |
| 9 | 031 병합 전 분기, 대본 프롬프트·설정 API 미정 | 채택 |
| 10 | 캐러셀 이미지의 미디어 경로·Composition 등록 없음 | 채택 |
| 11 | intent 쓰기 제약과 generated_images 불일치 | 일부 채택 |
| 12 | 받기 폴더·번호 규칙 미정 | 채택 |
| 13 | 0009 와 0015 의 관계 | 일부 채택 |

1 채택 — 엔진만 image·status·error 를 쓰고 화면 저장은 그 필드를 받지 않는다. 장 단위 PATCH 를 둔다.
2 채택 — `--json` 이벤트의 session id 로만 찾고, 없으면 실패로 처리한다. `--ephemeral` 동작은 첫 단위에서 확인한다.
3 채택 — 이미지 전용 큐를 두고 기존 큐는 바꾸지 않는다.
4 채택 — 이미지 작업 인자 묶음(작업 폴더 쓰기, 셸, 이미지 생성)과 모델·effort(대본 설정)를 정했다. 실행기는 스키마를 인자로 받게 일반화한다.
5 채택 — 읽을 때 활성 작업이 없는 장을 실패로 바꾸고, 생성 중 삭제를 거부한다.
6 채택 — sharp 대신 엔진에 이미 있는 ffmpeg 로 자른다. 새 네이티브 의존성과 패키징 변경을 피한다.
7 채택 — 4:5 는 1024×1280, 1:1 은 1024×1024 로 요청하고 1080 폭으로 맞춘다.
8 채택 — spec 을 0015 의 기본 3 에 맞췄다.
9 채택 — 구현 전에 main 에 rebase 한다. 기획·다듬기에는 대본 프롬프트를 넣지 않는다. 설정 API 는 `/api/system/image-options`.
10 채택 — 미디어 서버에 carousels 루트를 더하고 Root.tsx 에 등록한다.
11 일부 채택 — 제약은 앱 자신의 쓰기로 밝히고 이전 버전 이미지는 지운다. codex 의 generated_images 는 사용자 codex 데이터라 지우지 않는다.
12 채택 — 이름 정리 규칙과 01 부터 다시 매기기를 정했다.
13 일부 채택 — spec 결정 절에 0009 관계를 한 줄 더했다. 0015 맥락은 이미 0009 를 가리킨다. accepted 결정 0009 는 고치지 않는다.
