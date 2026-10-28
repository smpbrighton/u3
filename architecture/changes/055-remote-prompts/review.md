# Review: remote-prompts
Author: claude-opus-5-5. Status: draft. Round: 1.

## 대조한 것
- 변경 문서: `architecture/changes/055-remote-prompts/intent.md`, `architecture/changes/055-remote-prompts/spec.md`
- 지침: `AGENTS.md`, `architecture/INTENT.md`
- 결정(main): `architecture/decisions/0021-auto-update.md`, `0025-ui-shadcn.md`, `0026-scope-carousel-review-texts.md`, `0027-carousel-text-objects.md`, `0034-remote-default-prompts.md`(draft, 이 변경의 결정). 그 밖의 결정은 목록과 INTENT.md 요약으로 프롬프트·네트워크·릴리스와 관련이 없음을 확인했다.
- 위키: `architecture/wiki/index.md`, `pages/concept-updates.md`, `pages/concept-ui-shell.md`, `pages/concept-carousel.md`, `pages/concept-timeline-editing.md`, `pages/entity-desktop-app.md`, `pages/entity-engine-shutdown.md`
- 진행 중인 다른 변경: 장부(`ledger.sh show`)에서 done 이 아닌 변경은 049-windows-build(impl) 하나다. 워크트리가 정리되어 브랜치 `049-windows-build` 에서 `spec.md`, `decisions/0032-windows-build.md`, `decisions/0033-release-flow.md`, `scripts/release.sh`, `.github/workflows/windows-build.yml`, `src/engine/{main,store,shutdown}.ts`, `src/engine/routes/system.ts`, `src/ui/screens/Settings.tsx` 의 diff 를 읽었다.
- 코드: `src/core/script-prompt.ts`, `src/core/carousel-prompt.ts`, `src/engine/routes/system.ts`, `src/engine/routes/script.ts`, `src/engine/routes/carousels.ts`, `src/engine/main.ts`, `src/engine/store.ts`, `src/engine/jev-key.ts`, `src/ui/screens/Settings.tsx`, `src-tauri/src/main.rs`, `scripts/dev.ts`, `scripts/release.sh`, `gh release upload --help`

## 발견

### Important

1. **049 의 릴리스 절차(0033)와 충돌한다.** spec 은 `release.sh` 가 빌드 전에 `publish-prompts.sh` 를 실행하고, 이 스크립트가 `gh release upload prompts --clobber` 로 자산을 바꾼다고 정한다. 049 에서 accepted 된 0033 은 `release.sh` 를 draft 만 만드는 절차로 바꾼다. 0033 에서는 Windows job 과 publish job 이 모두 성공해야 latest 로 공개하고, 실패하면 이전 latest 를 유지한다. spec 대로 하면 기본 프롬프트는 빌드 전에 모든 설치본에 공개된다. 그 뒤 Mac 빌드·공증이나 Windows job 이 실패해도 프롬프트는 이미 바뀌어 있다. 0033 이 막으려는 부분 공개가 프롬프트에서 생긴다. 0033 은 「공개 Release 의 자산을 교체하지 않는다」고도 정한다. `prompts` prerelease 는 공개 상태이고 `--clobber` 는 그 자산을 교체한다. 0033 은 같은 목적의 리소스 archive 를 번호별 `resources-<정수>` prerelease 로 두어 교체하지 않는다. spec 우려 사항 3 은 이 충돌을 「한 줄만 더하고 rebase 한다」로 적어 의미 충돌을 다루지 않는다. 공개 시점(빌드 전, draft 뒤, publish job 안)과 `--mac-only` 경로에서의 동작을 spec 이 정해야 한다.
   근거: `architecture/changes/055-remote-prompts/spec.md`(요구사항 7, 설계 「릴리스」, 우려 사항 3), `git show 049-windows-build:architecture/decisions/0033-release-flow.md`, `git show 049-windows-build:architecture/changes/049-windows-build/spec.md`(36·99행), `git show 049-windows-build:scripts/release.sh`(208–221행)

### nit

1. **설정 화면이 받은 기본값이 낡으면, 고치지 않은 사용자가 옛 기본값을 「고친 프롬프트」로 저장한다.** 지금 설정 화면은 프롬프트 입력에서 포커스가 벗어날 때마다 값이 바뀌지 않아도 PUT 을 보낸다. 서버는 받은 본문이 현재 기본값과 다를 때 키를 저장한다. 시작 때 받기는 기다리지 않으므로(최대 10초), 화면이 연 뒤에 기본값이 바뀌는 경우가 있다. 6시간 주기 갱신에서도 같다. 그때 입력을 눌렀다 떼거나 「기본값으로」를 누르면 화면이 든 옛 기본값이 저장 키가 된다. 그 사용자는 경고 없이 원격 기본값을 더 따르지 않는다. 이것은 요구사항 1·3 과 어긋난다. 또 설계는 「기본값으로」의 본문을 응답의 `defaultPrompt` 로 한다고 쓰고, 검증 기준은 「기본값으로」를 빈 본문으로 쓴다. 두 문장이 서로 다르다. 빈 본문으로 정하거나, PUT 에 기준 revision 을 함께 보내 서버가 판정하게 해야 한다.
   근거: `src/ui/screens/Settings.tsx`(211–216·228–234·339·378–379행), `src/engine/routes/system.ts`(236–264행), `spec.md`(요구사항 3, 설계 「화면」, 검증 기준 「서버」)

2. **원격 파일이 사라지면 revision 이 처음부터 다시 시작해 갱신이 멈춘다.** `gh release upload --clobber` 는 기존 자산을 먼저 지우고 올린다. 올리기가 실패하면 원래 자산은 없어진다(`gh release upload --help`). 그 뒤 `publish-prompts.sh` 는 「원격 값 + 1」을 계산할 원격 파일이 없다. 태그를 지우고 다시 만든 경우도 같다. revision 이 1 로 다시 시작하면, 더 큰 revision 을 캐시한 설치본은 「revision 이 클 때만 바꾼다」 규칙 때문에 새 본문을 받지 않는다. spec 은 원격 파일이 없을 때의 revision 규칙을 정하지 않는다.
   근거: `spec.md`(설계 「데이터」 캐시, 「릴리스」), `gh release upload --help`

3. **개발 실행과 설치본이 같은 데이터 폴더를 쓰므로, 개발 실행의 동작이 설치본에 새어 나간다.** 개발 실행과 설치본은 모두 `U3_DATA_DIR` 없이 `~/Library/Application Support/U3` 를 쓴다. spec 은 `U3_PROMPTS_URL` 이 있으면 개발 실행도 받는다고 하지만, 그때 공용 캐시에 쓰는지 정하지 않는다. 쓰면 시험 revision 이 설치본의 캐시가 되고, 그 revision 이 운영 값보다 크면 설치본은 운영 갱신을 받지 않는다. 개발 실행에서 프롬프트를 저장하면 기준 revision 이 0(앱에 든 기본값)으로 남고, 설치본은 이 값을 보고 「새 기본값이 있어요」를 낸다. 개발 실행의 판정 방법도 spec 에 없다. 기존 관례는 `U3_RESOURCE_DIR` 이 없으면 개발 실행이다. 「개발 실행도」라는 표현은 설치본도 `U3_PROMPTS_URL` 을 따른다고 읽힌다. 위키는 설치본이 환경 변수의 Jev 키를 무시하게 고친 경위를 기록한다(launchd 환경 문제). 0034 draft 는 「개발 실행은 받지 않는다」만 적어 spec 의 `U3_PROMPTS_URL` 예외와 다르다.
   근거: `src/engine/store.ts`(38행), `scripts/dev.ts`(11행), `src-tauri/src/main.rs`(40–52행), `src/engine/jev-key.ts`(54–55행), `architecture/wiki/pages/entity-desktop-app.md`(15–16행), `architecture/decisions/0034-remote-default-prompts.md`, `spec.md`(열린 질문 답 「개발 실행」)

4. **revision 이 파일 전체에 하나라서 「새 기본값이 있어요」가 바뀌지 않은 프롬프트에도 뜬다.** 캐러셀 「영상으로」 본문만 바꿔 올려도 revision 이 오르고, 대본 프롬프트를 고친 사용자에게도 표시가 뜬다. 요구사항 4 는 그 프롬프트의 기본값이 새로 있을 때를 말한다. 프롬프트별 revision 이나 기준 본문의 hash 를 비교해야 한다. 이 기능 전에 프롬프트를 고친 사용자는 `*BaseRevision` 키가 없다. 이때의 `newerDefault` 판정도 spec 에 없다.
   근거: `spec.md`(설계 「데이터」 설정 키, 요구사항 4)

5. **포커스만 옮겨도 「새 기본값이 있어요」가 사라지고, 사용자는 새 기본값을 본문을 잃지 않고 볼 수 없다.** spec 은 저장할 때 그때의 기본값 revision 을 기준으로 둔다. 설정 화면은 포커스가 벗어날 때마다 저장하므로 입력을 한 번 누르면 표시가 지워진다. 표시를 본 사용자가 새 기본값을 확인하는 방법은 「기본값으로」뿐이고, 그러면 고친 본문이 사라진다.
   근거: `src/ui/screens/Settings.tsx`(211–216·339행), `spec.md`(설계 「데이터」·「화면」)

6. **설치본 검증이 운영 자산을 쓴다.** 검증 기준은 `prompts` 자산에 시험 revision 을 올린 뒤 설치본을 다시 시작하라고 한다. 그 자산은 모든 사용자의 기본값이다. 시험 본문이 6시간 안에 모든 설치본에 퍼진다. 시험용 별도 태그나 주소를 써야 하지만, 설치본이 `U3_PROMPTS_URL` 을 따르는지가 nit 3 처럼 정해지지 않았다.
   근거: `spec.md`(검증 기준 「설치본」)

7. **캐시는 항상 앱에 든 기본값보다 앞선다.** 앱에 든 기본값은 revision 0 이다. 새 앱 버전이 새 상수를 담아도, 그 버전으로 업데이트한 뒤 받기에 실패하면 이전 캐시 본문을 쓴다. 릴리스 때 publish 가 실패하거나 건너뛰어진 경우도 같다.
   근거: `spec.md`(설계 「데이터」, 「엔진」 `effectiveDefaults()`)

8. **기대 결과의 판정과 시작 때 받기가 맞지 않는다.** intent 는 다시 시작하면 설정과 생성의 프롬프트가 새 본문이라고 판정한다. spec 은 시작 때 받기를 기다리지 않고 최대 10초 걸린다. 다시 시작한 직후 연 설정 화면과 첫 생성은 이전 본문을 쓴다. spec 은 받는 주기가 0021 과 같다고 쓰지만, 0021 은 시작 30초 뒤·6시간마다·창이 앞으로 올 때(10분 간격)다.
   근거: `intent.md`(기대 결과 판정), `spec.md`(열린 질문 답 「받는 시점」, 설계 「엔진」), `architecture/decisions/0021-auto-update.md`

9. **`release.sh` 의 실행 조건이 요구사항과 설계에서 다르다.** 요구사항 7 은 원격 기본값이 앱에 든 기본값과 다를 때만 실행한다고 쓴다. 설계는 빌드 전에 항상 실행하고 스크립트가 같으면 아무것도 하지 않는다고 쓴다. `publish-prompts.sh` 가 실패할 때 `release.sh` 를 멈추는지도 정하지 않았다.
   근거: `spec.md`(요구사항 7, 설계 「릴리스」)

10. **API 목록에 `PUT /api/system/script-prompt` 가 없다.** 지금 프롬프트 API 는 네 개다(대본 GET·PUT, 캐러셀 GET·PUT). intent 는 「세 개」라고 쓰고 spec 은 대본 PUT 을 빠뜨린다. 설정 화면은 대본 PUT 응답의 `prompt` 로 화면 값을 바꾸므로, 이 응답도 `defaultPrompt`·`newerDefault` 와 기준 revision 저장이 필요하다.
    근거: `src/engine/routes/system.ts`(236–245행), `src/ui/screens/Settings.tsx`(213–214행), `intent.md`(영향 범위), `spec.md`(설계 「엔진」 API)

11. **파일 크기 상한과 본문 길이 상한이 맞지 않는다.** 본문 하나는 20000자까지이고 한글은 UTF-8 로 3바이트다. 세 본문이 상한에 가까우면 180KB 에 JSON 이스케이프가 더해져 200KB 를 넘을 수 있다. 그러면 본문마다 유효한 파일을 앱이 거부한다. 지금 기본 본문은 수천 자이므로 당장은 문제가 없다.
    근거: `spec.md`(설계 「데이터」), `src/core/script-prompt.ts`(1행), `src/core/carousel-prompt.ts`(1행)

12. **`publish-prompts.sh` 가 만드는 파일의 위치가 없다.** AGENTS.md 는 결과물·임시 파일을 X31 에 두라고 정한다. spec 은 생성 파일 위치와 `TMPDIR` 사용을 적지 않는다.
    근거: `AGENTS.md`(컨벤션), `spec.md`(설계 「릴리스」)

## 처리

| # | 발견 | 판단 |
|---|------|------|
| I1 | 프롬프트 공개가 0033 릴리스 절차와 충돌 | 채택 |
| n1 | 낡은 기본값이 blur 저장으로 고친 값이 됨 | 채택 |
| n2 | `--clobber` 실패 뒤 revision 재시작 | 채택 |
| n3 | 개발 실행과 설치본의 캐시 공유 | 채택 |
| n4 | 파일 단위 revision 으로 잘못된 「새 기본값」 표시 | 채택 |
| n5 | 표시가 blur 로 사라짐, 본문을 잃지 않고 새 기본값을 볼 수 없음 | 일부 채택 |
| n6 | 설치본 검증이 운영 자산에 시험 본문을 올림 | 채택 |
| n7 | 캐시가 새 앱의 기본값보다 앞섬 | 채택 |
| n8 | 시작 때 받기와 기대 결과 판정 불일치, 0021 주기 서술 오류 | 채택 |
| n9 | `release.sh` 실행 조건 불일치 | 채택 |
| n10 | 대본 PUT 누락 | 채택 |
| n11 | 200KB 상한과 본문 상한 불일치 | 채택 |
| n12 | publish 산출물 위치 | 채택 |

- I1 채택 — `release.sh` 에서 프롬프트 공개를 뺐다. 앱에 든 기본값이 `PROMPT_REVISION` 을 가지므로 앱 릴리스는 원격 공개와 무관하다. `prompts` 는 버전 Release 가 아니라 갱신용 고정 주소라고 0034 에 명시했다(우려 사항 3).
- n1 채택 — 「기본값으로」는 빈 본문을 보내고, blur 는 본문이 바뀐 때만 저장한다(요구사항 8).
- n2 채택 — revision 을 원격이 아니라 코드의 `PROMPT_REVISION` 에서 가져온다.
- n3 채택 — 개발 실행 판정을 `U3_RESOURCE_DIR` 없음으로 정하고, 개발 실행은 캐시를 읽거나 쓰지 않으며 `U3_PROMPTS_URL` 결과는 메모리에만 둔다. 설치본은 `U3_PROMPTS_URL` 을 무시한다.
- n4 채택 — 기준을 revision 대신 프롬프트별 본문 hash 로 바꿨다. base hash 가 없으면 표시하지 않는다.
- n5 일부 채택 — blur 는 바뀐 때만 저장하므로 표시가 사라지지 않는다. 고친 본문을 잃지 않고 새 기본값을 보는 비교 화면은 넣지 않는다. 늘어나는 화면 작업이 이 변경의 이득보다 크다(우려 사항 5).
- n6 채택 — 설치본 검증은 현재 기본값(revision 1)을 올려 캐시 생성을 확인한다. 본문 변경 전파는 개발 실행과 `U3_PROMPTS_URL` 로 시험한다.
- n7 채택 — 현재 기본값은 캐시와 앱에 든 기본값 중 revision 이 큰 쪽이다.
- n8 채택 — 시작 직후 조회·생성은 진행 중인 첫 받기를 최대 3초 기다린다. 0021 과 같다는 서술을 지웠다.
- n9 채택 — I1 처리로 `release.sh` 가 스크립트를 실행하지 않는다.
- n10 채택 — API 에 대본 PUT 을 넣었다.
- n11 채택 — 응답 상한을 512KB 로 올렸다.
- n12 채택 — 산출물은 `$TMPDIR`(X31)에 만든다.
