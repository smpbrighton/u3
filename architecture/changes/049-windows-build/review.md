# Review: windows-build
Author: claude-opus-5-5. Status: draft. Round: 1.

## 대조한 것
- 변경: `architecture/changes/049-windows-build/intent.md`, `architecture/changes/049-windows-build/spec.md`
- 지침: `AGENTS.md`, `architecture/INTENT.md`
- 유효 결정: `architecture/decisions/0004-bundled-library-lazy-model.md`, `0007-whisper-stt.md`, `0008-voice-record-separate-cpu.md`, `0013-generation-merge-clips-memes.md`, `0016-caption-layers-opacity-brand.md`, `0020-title-bar-content.md`, `0021-auto-update.md`, `0023-qwen-tts-local.md`, `0024-jev-key-setting.md`, `0025-ui-shadcn.md`, `0026-scope-carousel-review-texts.md`, `0027-carousel-text-objects.md`, `0028-caption-clip-style.md`, `0029-scene-review.md`. 대체된 `0001-tauri-node-sidecar.md` 는 intent 가 가리켜서 읽었다.
- 위키(main 기준): `architecture/wiki/index.md`, `pages/entity-desktop-app.md`, `pages/entity-engine-shutdown.md`, `pages/concept-compositor-dylib.md`, `pages/concept-updates.md`, `pages/concept-local-models.md`, `pages/concept-local-tts.md`, `pages/concept-ui-shell.md`
- 진행 중인 다른 변경(ledger `critic`): `u3-047-playback-speed/architecture/changes/047-playback-speed/{intent,spec}.md`, `u3-048-shortcut-settings/architecture/changes/048-shortcut-settings/{intent,spec}.md`. 두 변경 모두 plan.md 는 아직 없다.
- main 병합분: 워크트리 분기점 `2cb7f1f` 에 046 이 이미 들어 있다. 분기 뒤 main 에 들어온 것은 050(`src/engine/jev-key.ts` 인자 순서)·051(`src/ui/studio/shortcuts.ts`·`Timeline.tsx`)과 0.3.2 버전 반영이다.
- 코드(main 기준): `scripts/release.sh`, `scripts/package.sh`, `scripts/verify.sh`, `scripts/build-engine.ts`, `scripts/build-whisper.sh`, `scripts/fetch-resources.ts`, `scripts/fix-dylib-paths.sh`, `scripts/sign-nested.sh`, `scripts/check-engine-key.sh`, `src-tauri/tauri.conf.json`, `src-tauri/tauri.bundle.conf.json`, `src-tauri/tauri.release.conf.json`, `src-tauri/capabilities/default.json`, `src-tauri/src/main.rs`, `src-tauri/src/updater.rs`, `src/engine/store.ts`, `src/engine/http.ts`, `src/engine/main.ts`, `src/engine/shutdown.ts`, `src/engine/jev-key.ts`, `src/engine/pipeline/codex-path.ts`, `src/engine/pipeline/codex.ts`, `src/engine/pipeline/codex-image.ts`, `src/ui/studio/shortcuts.ts`, `pnpm-lock.yaml`, `src-tauri/icons/`. `.github/workflows/` 는 아직 없다.
- 외부 확인: Tauri NSIS 템플릿 `crates/tauri-bundler/src/bundle/windows/nsis/installer.nsi`(dev 브랜치)의 기본 설치 경로·제거 동작.

## 발견

### Important

1. **048 shortcut-settings 와 충돌한다. 048 대로 병합되면 Windows 에서 실행 취소·다시 실행 기본 단축키가 동작하지 않는다.**
   - 현재 판정은 `metaKey || ctrlKey` 를 명령키로 본다. 그래서 지금은 Windows 의 Ctrl+Z·Ctrl+Shift+Z·Ctrl+M 이 동작한다(`src/ui/studio/shortcuts.ts`).
   - 048 spec 은 「Ctrl 조합은 macOS 에서 쓰지 않으므로 뺀다」고 정하고, 기본값을 `Meta+…` 정규 문자열 하나로 저장한다. 예약 조합 목록도 ⌘Q·⌘W·⌘H·⌘⇧3 처럼 macOS 조합뿐이다(`u3-048-shortcut-settings/architecture/changes/048-shortcut-settings/spec.md` 답 2·답 4, 설계 `src/core/studio-shortcuts.ts`). 048 intent 의 영향 범위도 「macOS Apple Silicon 사용자」로 한정한다.
   - 049 spec 의 「플랫폼별 기능과 화면」 표와 검증 기준에는 단축키 항목이 없다. Windows 에서 Meta 는 Win 키다. Windows 11 의 Win+Z 는 OS 가 창 맞춤 레이아웃에 쓴다(추정, 이번 대조에서 확인하지 못했다). 이 경우 웹뷰는 그 입력을 받지 못한다.
   - 049 spec 이 플랫폼별 명령키(Mac ⌘, Windows Ctrl)와 Windows 예약 조합(Alt+F4·Ctrl+Alt+Del·Win 조합)을 정하고, 048 과 병합 순서를 맞춰야 한다.
   - 근거: `src/ui/studio/shortcuts.ts`, `u3-048-shortcut-settings/architecture/changes/048-shortcut-settings/intent.md`, `u3-048-shortcut-settings/architecture/changes/048-shortcut-settings/spec.md`, `architecture/changes/049-windows-build/spec.md` 「플랫폼별 기능과 화면」.

2. **0021 의 릴리스 조항과 AGENTS.md 의 릴리스 커맨드가 바뀌는데, spec 은 Mac 쪽을 「유지」로만 적었다.**
   - 0021 은 「`scripts/release.sh <버전>` 이 버전 반영·검증·빌드·서명·공증·업데이트 파일·dmg·태그·GitHub Release 를 한 번에 한다」고 정한다. AGENTS.md 도 같은 커맨드의 정상 출력을 `✓ release published: v<버전>` 으로 적는다. 현재 `release.sh` 는 `gh release create … --latest` 로 바로 공개한다.
   - spec 은 `release.sh` 가 darwin 전용 manifest 로 latest 를 공개하지 않게 하고, GitHub Actions 의 publish 단계가 최종 공개를 맡게 한다(「릴리스·서명·설치 안내」, 「빌드와 CI」 마지막 항목). 그런데 「결정」 절은 0021 에 대해 「Mac 의 Developer ID·공증·Keychain updater 키를 유지한다」와 Windows 예외만 적는다. Mac 릴리스의 한 번에 공개 조항을 바꾼다는 내용은 없다.
   - 그 결과 Mac 사용자의 업데이트 공개가 Windows CI 성공에 묶인다(요구사항 7). 이것은 0021 의 Mac 릴리스 동작을 바꾼다. 046 같은 Mac 전용 긴급 수정도 Windows job 이 실패하면 공개되지 않는다. spec 은 이 경우의 예외 경로를 정하지 않았다.
   - 대체 결정에 0021 의 릴리스 조항 변경을 적어야 한다. AGENTS.md 의 릴리스 커맨드·정상 출력도 같은 변경으로 고쳐야 한다.
   - 근거: `architecture/decisions/0021-auto-update.md` 결정 마지막 항목, `AGENTS.md` 커맨드 절, `scripts/release.sh` 마지막 두 줄, `architecture/wiki/pages/concept-updates.md` 요약, `architecture/changes/049-windows-build/spec.md` 요구사항 7·「결정」.

### nit

1. **Windows 데이터 root 가 NSIS 기본 설치 폴더와 같다. 요구사항 5 와 모순된다.**
   - spec 은 데이터 root 를 `%LOCALAPPDATA%\U3` 로 정한다(「경로·프로세스·인증」).
   - Tauri NSIS 템플릿의 `currentUser` 기본 설치 경로는 `$LOCALAPPDATA\${PRODUCTNAME}` 다. 제품 이름이 `U3` 이므로 설치 폴더도 `%LOCALAPPDATA%\U3` 가 된다(`installer.nsi` `.onInit`).
   - 요구사항 5 는 「데이터와 모델은 설치 폴더 밖의 사용자 데이터 경로에 둔다」고 정한다. 이 설계는 그 요구와 맞지 않는다.
   - 제거 프로그램은 설치 목록의 파일만 지우고 `RMDir "$INSTDIR"` 를 재귀 없이 실행한다. 그래서 프로젝트가 바로 지워지지는 않는다. 그래도 설치 리소스와 사용자 데이터가 한 폴더에 섞인다. 사용자가 설치 경로를 바꾸거나 이후 제거 방식이 바뀌면 이 보호도 깨진다.
   - 설치 경로나 데이터 경로 가운데 하나를 다른 이름으로 바꿔야 한다. 예: Tauri `app_local_data_dir` 인 `%LOCALAPPDATA%\ai.brightongroup.u3`. 단, 이 경로는 제거 프로그램의 「앱 데이터 삭제」 체크박스가 지운다.
   - 근거: `architecture/changes/049-windows-build/spec.md` 요구사항 5·「경로·프로세스·인증」, `src-tauri/tauri.conf.json` `productName`, Tauri `installer.nsi`.

2. **CI 리소스 archive 를 둘 Release 가 정해지지 않았다. 별도 Release 로 올리면 0021 의 업데이트 주소를 깨뜨릴 수 있다.**
   - spec 은 archive 를 「GitHub Release 자산 `u3-resources-<버전>.tar.zst`」로 둔다. 그런데 어느 Release 에 둘지, `<버전>` 이 앱 버전인지 리소스 버전인지를 정하지 않는다.
   - 같은 레포에 리소스 전용 Release 를 정식(비 draft·비 prerelease)으로 만들 수 있다. 그 Release 가 가장 최근이면 GitHub 의 `releases/latest` 가 그것을 가리킨다. 그러면 모든 설치본의 `releases/latest/download/latest.json` 확인이 실패한다.
   - 레포가 public 이므로 그 asset 은 누구나 받는다. 재배포 권리 확인(spec 이 열린 질문으로 남김)이 끝나기 전에 업로드하면 안 된다.
   - 근거: `architecture/changes/049-windows-build/spec.md` 답 4, `architecture/decisions/0021-auto-update.md` 첫 항목, `src-tauri/tauri.conf.json` `plugins.updater.endpoints`.

3. **Windows 패키징 경로에 0024 의 키 검사가 명시되지 않았다.**
   - 0024 는 「패키징과 릴리스는 엔진 번들에 키 대입이나 `.env` 의 키 값이 있으면 실패한다」고 정한다. 현재는 `package.sh`·`release.sh`·`build-engine.ts` 가 `check-engine-key.sh` 를 부른다.
   - spec 의 Windows CI·패키징 설계와 검증 기준은 DPAPI 시험만 적는다. 새 workflow 에서 엔진 번들과 설치 결과물의 키 검사를 하는지는 적지 않았다.
   - 근거: `architecture/decisions/0024-jev-key-setting.md`, `scripts/package.sh`, `scripts/build-engine.ts`, `architecture/changes/049-windows-build/spec.md` 「빌드와 CI」·「검증 기준」.

4. **Windows 의 엔진 종료와 자식 프로세스 정리 방법이 정해지지 않았다.**
   - 위키는 엔진이 정리 뒤 `process.kill(process.pid, "SIGTERM")` 으로 끝나 ONNX Runtime 소멸자 abort 를 피한다고 기록한다. Windows 에는 SIGTERM 전달이 없다. Node 의 이 호출은 Windows 에서 즉시 강제 종료로 동작한다. Windows 에서 ONNX abort 를 피하는지도 확인되지 않았다.
   - Rust 는 5초가 지나면 `child.kill()` 을 부른다. Windows 에서 이 호출은 Node 프로세스만 끝낸다. ffmpeg·compositor·Chrome·whisper-cli 자식은 남을 수 있다(Job Object 등 묶음 종료 수단이 spec 에 없다). 남은 프로세스는 `$INSTDIR\resources` 의 실행 파일을 잠근다. 그러면 업데이트 설치가 실패한다.
   - spec 은 「남은 프로세스·파일 잠금을 검사한다」는 검증만 두고, 정리하는 방법은 정하지 않았다.
   - 근거: `architecture/wiki/pages/entity-engine-shutdown.md`, `src/engine/shutdown.ts`, `src-tauri/src/main.rs` `RunEvent::Exit`, `architecture/changes/049-windows-build/spec.md` 「경로·프로세스·인증」.

5. **Mac 로컬 릴리스와 Actions publish 의 순서·조건이 정해지지 않았다.**
   - spec 은 「플랫폼별 job 은 draft Release 에 asset 과 fragment 를 올린다」, 「두 플랫폼의 성공을 모으는 단일 publish 단계」라고 쓴다. 그러나 Mac 은 GitHub job 이 아니라 로컬 `release.sh` 다. Actions publish 가 Mac 업로드 완료를 무엇으로 알고 언제 실행되는지가 없다.
   - 현재 `release.sh` 는 버전을 반영한 커밋 전의 작업 트리로 빌드한다. 그 뒤 커밋하고, 태그를 만들고, push 한다. 「동일 commit 확인」을 Mac 산출물에 어떻게 적용하는지가 정해지지 않았다.
   - Windows job 이 실패하면 태그 `v<버전>` 은 이미 push 된 상태다. `release.sh` 는 기존 태그를 거부한다. 같은 버전을 다시 시도하는 절차가 없다.
   - 근거: `scripts/release.sh`, `architecture/changes/049-windows-build/spec.md` 「빌드와 CI」·「릴리스·서명·설치 안내」.

6. **앱 종료로 업데이트를 설치할 때 새 앱을 다시 시작하는지 정하지 않았다.**
   - spec 은 「설치 프로그램이 새 앱을 시작하게 하며」라고 쓴다. 「다시 시작」과 「앱 종료」를 구분하지 않는다.
   - Mac 은 0021 대로 종료 때 번들만 바꾸고 앱을 다시 열지 않는다(`updater.rs` `install_on_exit`). Windows 에서 종료 경로도 새 앱을 띄우면, 사용자가 종료한 앱이 다시 열린다.
   - 근거: `architecture/decisions/0021-auto-update.md`, `src-tauri/src/updater.rs`, `architecture/changes/049-windows-build/spec.md` 「릴리스·서명·설치 안내」 `updater.rs` 항목.

7. **Windows 의 codex 실행 조건은 실행 파일 탐색만 다룬다.**
   - 엔진은 `codex exec --sandbox read-only`(대본)과 `--sandbox workspace-write --enable image_generation`(캐러셀 이미지)을 부른다.
   - native Windows codex 에서 두 sandbox 모드와 image_generation 이 같은 결과를 내는지는 이번 대조에서 확인하지 못했다(추정: sandbox 지원 수준이 macOS 와 다를 수 있다).
   - spec 은 「AI 제공자·모델 선택… 바꾸지 않는다」고만 쓴다. sandbox 가 없거나 다르게 동작할 때의 처리를 정하지 않았다.
   - 근거: `src/engine/pipeline/codex.ts`, `src/engine/pipeline/codex-image.ts`, `architecture/changes/049-windows-build/spec.md` 요구사항 2·「경로·프로세스·인증」 codex 항목.

8. **리소스 archive 에 폰트를 넣는 것은 레포 파일과 중복된다.**
   - 다섯 폰트 파일은 `assets/fonts/` 로 커밋돼 있다. `fetch-resources.ts` 는 이 폴더를 그대로 복사한다.
   - spec 은 archive 구성에 「폰트」를 넣는다(답 4, 「엔진과 리소스 조립」). 원본이 두 곳이 되면 Mac 과 Windows 의 폰트가 서로 달라질 수 있다.
   - archive 에 꼭 넣어야 하는 것은 X31 에서 읽는 폰트 라이선스 고지(`OFL-*.txt`)다.
   - 근거: `git ls-files assets/fonts`, `scripts/fetch-resources.ts`.

9. **`.tar.zst` 를 `windows-latest` 에서 푸는 도구를 정하지 않았다.**
   - Windows 기본 `tar` 와 Git Bash `tar` 가 zstd 를 지원하는지는 이번 대조에서 확인하지 못했다.
   - 근거: `architecture/changes/049-windows-build/spec.md` 답 4.

10. **대체 결정의 기준 문구가 현재 코드와 다르다.**
    - 0025 는 「엔진은 Node sidecar(`bundle.externalBin`)다」라고 적는다. 그러나 현재 Node 는 `resources/node` 로 들어가고 `main.rs` 가 직접 실행한다. `externalBin` 에는 `whisper-cli`·`u3-tts` 만 있다.
    - spec 은 「Node sidecar 구조를 유지한다」고 쓰고, 표에서는 `resources/node.exe` 를 쓴다. 0025 를 대체하는 결정에 실제 배치를 적어야 한다.
    - 근거: `architecture/decisions/0025-ui-shadcn.md`, `src-tauri/tauri.bundle.conf.json`, `src-tauri/src/main.rs` `bundled_engine_command`, `architecture/wiki/pages/entity-desktop-app.md`.

11. **문서 헤더와 범위 문구가 사실과 다르다.**
    - spec 헤더는 `Source: intent.md (draft, 같은 턴의 초안)` 이다. intent 는 accepted 로 커밋돼 있다.
    - intent 영향 범위는 「0025와 그 선행 결정 0001의 macOS 전용 범위를 바꾼다」고 쓴다. 0001 은 이미 `superseded-by 0025` 이므로 바꿀 대상이 아니다. spec 「결정」 절은 0025 만 대체한다.
    - 근거: `architecture/changes/049-windows-build/spec.md` 2행, `architecture/changes/049-windows-build/intent.md` 영향 범위, `architecture/decisions/0001-tauri-node-sidecar.md`.

047 playback-speed 와는 충돌을 찾지 못했다. 047 은 번들 ffmpeg 의 `atempo` 후처리를 더한다. 047 이 먼저 병합되면 049 의 Windows ffmpeg 검증 범위에 그 필터 실행이 들어가야 한다. 이것은 순서 조건이고 모순은 아니다.

## 처리

| # | 발견 | 판단 |
|---|------|------|
| I1 | 048 과 충돌: Windows 에서 Ctrl+Z 미동작 | 채택 |
| I2 | 0021·AGENTS.md 릴리스 조항 변경이 결정 절에 없음 | 채택 |
| n1 | 데이터 root 가 NSIS 기본 설치 폴더와 같음 | 채택 |
| n2 | 리소스 archive 를 둘 Release 미정·latest 오염 | 채택 |
| n3 | Windows 패키징에 0024 키 검사 없음 | 채택 |
| n4 | Windows 엔진·자식 프로세스 정리 방법 없음 | 채택 |
| n5 | Mac 로컬 릴리스와 Actions 순서·재시도 미정 | 채택 |
| n6 | 종료 경로 업데이트 뒤 재시작 여부 미정 | 채택 |
| n7 | Windows codex sandbox·image_generation 미확인 | 채택 |
| n8 | 폰트 중복 | 채택 |
| n9 | `.tar.zst` 해제 도구 미정 | 채택 |
| n10 | 0025 문구가 실제 배치와 다름 | 채택 |
| n11 | 헤더·0001 범위 문구 | 채택(intent 는 수정하지 않음) |

- I1 채택 — 048 spec 을 플랫폼 공통 명령키 `Mod`(macOS ⌘·Windows Ctrl)와 플랫폼별 예약 목록으로 고쳤다(048 review 처리). 이 spec 의 플랫폼 표에 단축키 행을 더해 048 을 가리킨다. 병합 순서 제약은 없다.
- I2 채택 — 결정 절에 0021 릴리스 조항 변경(draft 업로드 → Actions publish)과 AGENTS.md 커맨드·정상 출력 수정을 적었다. 요구사항 7 에 예외 `release.sh --mac-only`(darwin 만 든 manifest 로 바로 공개)를 두었다. 사용자에게 보이는 릴리스 절차 변경이라 plan 검토 목록에 올린다.
- n1 채택 — 데이터 root 를 `%LOCALAPPDATA%\ai.brightongroup.u3`(식별자 기준)로 바꿨다. 제거 프로그램의 「앱 데이터 삭제」 체크박스(기본 해제)만 이 폴더를 지운다.
- n2 채택 — archive 는 태그 `resources-<리소스 버전>` 의 prerelease Release 에 둔다. prerelease 는 `releases/latest` 에 잡히지 않는다. 권리 확인 전에는 올리지 않는다.
- n3 채택 — 패키징 job 이 `check-engine-key.sh` 를 Git Bash 로 실행한다. 결정 절 0024 보완에 적었다.
- n4 채택 — Rust 가 `KILL_ON_JOB_CLOSE` Job Object 로 Node 와 자식을 묶는다. 엔진 정상 종료는 Windows 에서 `process.exit(0)`. ONNX abort 여부는 CI 종료 시험이 확인한다.
- n5 채택 — 순서를 「빌드와 CI」에 적었다: 버전 커밋 push → 빌드·서명 → draft Release(`--target <sha>`)에 Mac 자산·fragment → 태그 push → Windows job → publish job. 재시도는 `workflow_dispatch -f tag=`.
- n6 채택 — 「다시 시작」은 설치 뒤 새 앱 실행, 「앱 종료」는 실행 없음. 설치 인자는 plan 이 Tauri 소스로 확인한다.
- n7 채택 — 플랫폼 표에 codex 행을 더했다. 같은 명령을 쓰고 실기기 검증 항목에서 두 sandbox 모드·image_generation 을 확인한다. sandbox 를 끄는 대체 플래그는 쓰지 않는다.
- n8 채택 — 폰트 파일은 레포 `assets/fonts/` 만 쓰고 archive 에는 고지만 넣는다.
- n9 채택 — `.tar.gz` 로 바꾸고 Windows 내장 `tar`(bsdtar)로 푼다.
- n10 채택 — 새 결정은 실제 배치(`resources/node`, `externalBin` 은 whisper-cli·u3-tts)를 적는다.
- n11 채택 — Source 줄 수정. intent 의 0001 언급은 accepted 문서라 두고, 결정 절에 「바꾸는 결정은 0025 하나」를 적었다.
