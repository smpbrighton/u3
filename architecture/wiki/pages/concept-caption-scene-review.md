# 자막과 장면 검토

## 요약
자막 클립은 레이어 스타일에 더해 색·크기·단어 색·등장 효과를 가질 수 있다. 장면 검토 순수 함수는 장면 번호로 자막·짤·효과음을 찾고 타임라인을 변경한다. 화면 구현은 043 B5에 남아 있다 `architecture/changes/045-caption-scene-review/spec.md` `architecture/changes/045-caption-scene-review/plan.md` `src/core/schema.ts` `src/core/timeline/scene-review.ts` `git:a28b63c:`

## 내용
- `TextClip.style`은 선택적인 `color`, `sizeScale` 0.5–2, `animation` none·pop·rise·shake, `highlightColor`를 저장한다. 렌더는 레이어와 클립 스타일을 합치고 자동 맞춤 뒤 크기 배율을 적용한다. 기본 단어 색은 `#FFB020`이며 효과는 0.3초 동안 진행한다. `src/core/schema.ts` `src/core/timeline/to-render.ts` `src/remotion/caption-measure.ts` `src/remotion/U3Short.tsx` `git:5fefeca:`
- `*단어*`는 강조 구간이고 `\*`는 글자 별표다. 빈 쌍과 짝이 없는 별표는 글자로 남는다. `plainCaptionText`는 강조 표기를 해석한 글을 반환하며, 측정과 렌더도 이 표기를 해석한다. 생성 대본과 받아 적기 결과의 글자 별표는 저장할 때 이스케이프한다. `src/core/captions.ts` `src/core/transcript.ts` `src/engine/routes/script.ts` `src/remotion/caption-measure.ts` `src/remotion/U3Short.tsx` `git:11c2ba7:` `git:2f8bd51:`
- 자막 글 소비 경로는 TTS, 대본 추천 입력, 번역과 제목 생성, 영상 파생 캐러셀 기획과 Jev 대상, 짤 순위 요청에 `plainCaptionText`를 적용한다. TTS 라우트는 이미 정리된 글을 다시 별표 표기로 해석하지 않는다. `src/core/tts-clips.ts` `src/engine/routes/tts.ts` `src/engine/routes/script.ts` `src/engine/routes/captions.ts` `src/engine/routes/carousels.ts` `src/engine/routes/memes.ts` `git:2f8bd51:` `git:a2d83c4:`
- 자동 생성 자막·짤·효과음은 0부터 시작하는 선택 필드 `sceneIndex`를 가진다. 기존 형식의 정해진 클립 ID에서 번호를 복원한다. 자막과 오버레이를 나누면 왼쪽 조각만 장면 연결을 유지한다. `src/core/schema.ts` `src/core/timeline/from-script.ts` `src/core/timeline/ops.ts` `git:11c2ba7:` `git:a28b63c:` `git:a2d83c4:`
- `sceneClips`는 장면별 클립을 모으고 자막 시작을 우선하며 자막이 없으면 짤·효과음 시작을 쓴다. 모두 없으면 시각은 null이다. 짤·효과음 교체, 제거, 재삽입 함수는 새 타임라인을 반환한다. 짤 중복은 프로젝트 전체에서 검사한다. 짤 후보 순위 API는 `excludeIds`를 후보에서 제외한다. `src/core/timeline/scene-review.ts` `src/engine/routes/memes.ts` `git:a28b63c:` `git:2f8bd51:`
- `setCaptionRange`는 같은 행의 인접 자막과 영상 끝을 경계로 구간을 제한한다. `splitCaptionClip`은 자막을 나누고 `addCaptionClip`은 빈 구간에 최대 3초짜리 자막을 추가하며 0.3초 미만이면 추가하지 않는다. `src/core/timeline/ops.ts` `tests/core/caption-ops.test.ts` `git:a28b63c:`
- 변경의 테스트 코드에는 자막 표기·장면 함수·렌더·서버 소비 경로와 오버레이 분할·TTS 별표 회귀 사례가 있다. 테스트 실행 출력과 `pnpm verify` 통과 기록은 코드에서 못 찾음. `tests/core/captions-runs.test.ts` `tests/core/scene-review.test.ts` `tests/remotion/caption-runs.test.tsx` `tests/server/caption-plain.test.ts` `tests/server/tts.test.ts` `architecture/changes/045-caption-scene-review/plan.md` `git:9b4fdc6:`
- Tauri WebKit 미리보기의 등장 효과, 기존 자막과 강조 자막의 수동 캡처, 실제 TTS 모델 실행은 미검증이다. 캡처 경로와 실행 증거는 코드에서 못 찾음. 자막 편집기와 장면 검토 UI 및 UI 테스트는 043 B5에 남아 있다. `architecture/changes/045-caption-scene-review/plan.md` `architecture/changes/045-caption-scene-review/spec.md` `architecture/changes/045-caption-scene-review/review.md`
- 관련 결정은 [0028](../../decisions/0028-caption-clip-style.md)과 [0029](../../decisions/0029-scene-review.md)에 있다. `architecture/decisions/0028-caption-clip-style.md` `architecture/decisions/0029-scene-review.md`

## 관계
- [타임라인 편집](concept-timeline-editing.md)
- [로컬 TTS](concept-local-tts.md)
- [캐러셀 생성](concept-carousel.md)

## 출처
- `architecture/changes/045-caption-scene-review/spec.md`
- `architecture/changes/045-caption-scene-review/plan.md`
- `architecture/changes/045-caption-scene-review/review.md`
- `src/core/captions.ts`
- `src/core/schema.ts`
- `src/core/timeline/scene-review.ts`
- `src/core/timeline/ops.ts`
- `src/core/timeline/from-script.ts`
- `src/core/timeline/to-render.ts`
- `src/engine/routes/memes.ts`
- `src/engine/routes/tts.ts`
- `src/engine/routes/carousels.ts`
- `src/remotion/U3Short.tsx`
- `git:a2d83c4:`
