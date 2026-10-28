# 로컬 TTS

## 요약
스튜디오는 자막을 로컬 TTS 음성으로 만들고 목소리 트랙에 배치한다. 엔진은 Swift 도우미와 로컬 모델을 사용한다. `architecture/changes/040-qwen-tts/spec.md` `src/engine/routes/tts.ts` `src/ui/screens/Studio.tsx` `native/u3-tts/Sources/U3TTS/U3TTS.swift` `git:910cddc:`

## 내용
- 첫 자막 레이어의 메인 자막을 입력으로 사용하며, 이모지와 줄바꿈을 제거한다. 결과는 자막 시작 시각에 배치하고 같은 자막의 이전 TTS 음성만 교체한다. 녹음은 보존한다. 자막보다 긴 음성에는 겹침 경고를 보인다. `src/core/tts-clips.ts` `src/core/script-style.ts` `src/ui/screens/Studio.tsx` `src/ui/studio/Timeline.tsx` `tests/core/tts-clips.test.ts`
- 설정에서 화자와 말투 지시를 저장한다. 인스펙터에서 클립 하나를 다시 생성할 수 있다. `src/ui/screens/Settings.tsx` `src/ui/studio/Inspector.tsx` `src/engine/routes/system.ts`
- 모델이 준비되지 않으면 생성 전에 다운로드한다. 엔진은 임시 폴더에서 생성한 파일을 전체 성공 뒤 교체하며 실패·취소 시 임시 파일을 정리한다. TTS는 내보내기 및 음성 분리와 heavy-media 작업을 공유한다. `src/engine/routes/tts.ts` `src/engine/routes/render.ts` `src/engine/routes/separate.ts` `src/engine/jobs.ts`
- Swift 도우미는 MLX로 모델을 실행한다. 빌드는 도우미와 Metal 리소스를 앱에 포함하고 tokenizer를 리소스로 제공한다. 관련 결정은 [0022](../../decisions/0022-scope-add-tts.md), [0023](../../decisions/0023-qwen-tts-local.md)에 있다. `native/u3-tts/Sources/U3TTS/U3TTS.swift` `scripts/build-tts.sh` `scripts/fetch-resources.ts` `src-tauri/tauri.bundle.conf.json`
- S1에서 1.7B 8bit와 캐시 한도 256MB로 6장면을 19.30초에 생성했고 peak memory footprint는 6.433 GiB였다. 실제 출력 음성은 42.88초였다. 사용자 청취 판정은 통과했으나 성조가 아주 자연스럽지는 않다는 의견이 기록됐다. 각 조건을 한 번 측정했으므로 일반적인 속도 우위나 최적 한도를 확정하지 않았다. `docs/spikes/qwen-tts.md` `architecture/changes/040-qwen-tts/plan.md` `git:fb5e5c0:`
- 구현 검증 기록은 `pnpm verify` 통과와 `.app`·`.dmg` 패키징 성공을 보고한다. 패키지 도우미와 실제 모델을 사용한 API smoke 결과는 7.36초 WAV다. 패키징 로그는 공증을 건너뛰었다고 표시한다. `architecture/changes/040-qwen-tts/plan.md` `git:910cddc:`
- 패키지 GUI에서 생성·트랙 배치·미리보기 청취의 실행 증거는 코드에서 못 찾음. 새 사용자 환경의 실제 전체 모델 다운로드와 네트워크 차단 상태의 합성도 미검증이다. S1에서 다른 앱과 함께 쓸 때의 실제 여유 메모리는 미측정이다. 서명·공증 검증 증거는 코드에서 못 찾음. `architecture/changes/040-qwen-tts/plan.md` `docs/spikes/qwen-tts.md`

## 관계
- [자막과 장면 검토](concept-caption-scene-review.md)
- [타임라인 편집](concept-timeline-editing.md)
- [로컬 모델과 리소스](concept-local-models.md)
- [U3 데스크톱 앱](entity-desktop-app.md)

## 출처
- `architecture/changes/040-qwen-tts/spec.md`
- `architecture/changes/040-qwen-tts/plan.md`
- `docs/spikes/qwen-tts.md`
- `src/core/tts-clips.ts`
- `src/engine/routes/tts.ts`
- `src/engine/pipeline/tts.ts`
- `src/ui/screens/Studio.tsx`
- `native/u3-tts/Sources/U3TTS/U3TTS.swift`
- `scripts/build-tts.sh`
- `910cddc`
- `fb5e5c0`
