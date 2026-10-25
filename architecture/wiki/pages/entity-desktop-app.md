# U3 데스크톱 앱

## 요약
U3는 macOS Apple Silicon 대상 Tauri 2 앱이며 React UI와 Node sidecar 엔진으로 동작한다. 엔진은 `127.0.0.1` 임의 포트에서 일회용 토큰과 허용 Origin을 확인한다. `architecture/changes/001-desktop-studio/spec.md` `src-tauri/src/main.rs` `src/engine/main.ts` `src/engine/app.ts` `git:1cfc7e35c4af2fa3d58d6a017a83d21556c39740:`

## 내용
- 설치 앱에서 codex 호출, Jev 판정, 음성 분리, 받아 적기, 내보내기를 수동 확인했다. 미실행·부분 항목도 남아 있다. `docs/manual-check.md` `git:1cfc7e35c4af2fa3d58d6a017a83d21556c39740:`
- 앱은 codex CLI가 없거나 로그인하지 않은 상태를 표시하며, 대본 생성 전에 로그인 상태를 검사한다. codex 모델과 추론 강도는 설정에서 선택하고 기본값은 `gpt-6-luna`·`medium`이다. `src/engine/pipeline/codex-path.ts` `src/engine/pipeline/codex.ts` `src/ui/screens/Settings.tsx` `architecture/decisions/`
- 사용자 프로젝트·미디어·모델 캐시는 로컬 저장소를 사용한다. 앱은 Remotion으로 1080×1920·30fps MP4를 내보낸다. `src/engine/store.ts` `src/engine/pipeline/render.ts` `architecture/changes/001-desktop-studio/spec.md`
- 수동 확인은 macOS 27.0.1, Apple M4에서 수행했다. Node가 없는 PATH에서 번들 엔진을 실행했지만, 별도 계정·Mac 확인은 미실행이다. 실제 로그아웃 상태의 버튼 차단은 미실행이다. `docs/manual-check.md` `git:1cfc7e35c4af2fa3d58d6a017a83d21556c39740:`
- Whisper 모델 다운로드 진행률, 서명 빌드에서의 마이크 녹음, iPhone 재생은 미실행이다. 사용한 미디어는 실제 숏폼 원본이 아닌 대체 클립이다. `docs/manual-check.md`
- 설치 앱은 1.07 GiB, DMG는 530 MiB로 확인됐다. 계획의 수백 MB 기대보다 크다. `docs/manual-check.md` `architecture/changes/001-desktop-studio/spec.md`

## 관계
- [엔진 종료](entity-engine-shutdown.md)
- [타임라인 편집](concept-timeline-editing.md)
- [홈 카드와 내보내기 경고](concept-home-export.md)
- [로컬 모델과 리소스](concept-local-models.md)

## 출처
- `architecture/changes/001-desktop-studio/spec.md`
- `src-tauri/src/main.rs`
- `src/engine/main.ts`
- `src/engine/app.ts`
- `src/engine/store.ts`
- `src/engine/pipeline/render.ts`
- `src/engine/pipeline/codex-path.ts`
- `src/engine/pipeline/codex.ts`
- `src/ui/screens/Settings.tsx`
- `docs/manual-check.md`
- `5433d5da93e23b9b15e6a5c2cf0ef86be88a9e37`
- `1cfc7e35c4af2fa3d58d6a017a83d21556c39740`
