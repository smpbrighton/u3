# 클립 배속

## 요약
영상과 음성 클립은 원본 구간을 유지하며 재생 속도를 저장한다. 미리보기와 렌더는 배속된 영상과 준비된 오디오 캐시를 사용한다. `src/core/schema.ts` `src/core/timeline/to-render.ts` `src/engine/pipeline/audio-speed.ts` `git:f15e7ca:` `git:4fbad45:`

## 내용
- 속도는 0.5–2.0 범위이며 값이 없으면 1이다. 사진·짤·효과음의 1배속이 아닌 값은 검증에서 거절한다. `src/core/schema.ts` `src/core/timeline/speed.ts` `git:f15e7ca:`
- 재생 길이는 원본 구간 길이를 배속으로 나눈 값이다. 자르기와 받아 적은 단어 시각 변환은 원본 좌표와 타임라인 좌표를 배속으로 변환한다. `src/core/timeline/speed.ts` `src/core/timeline/ops.ts` `src/core/transcript.ts` `git:1bf9b84:` `git:3fd2fe3:`
- 영상 1의 길이 변경은 뒤 영상의 위치와 전환을 조정한다. 자막과 독립 음성의 위치는 유지하고 프로젝트 끝을 자막 편집 상한으로 사용한다. `src/core/timeline/ops.ts` `src/core/timeline/scene-review.ts` `src/ui/studio/CaptionEditor.tsx` `git:1bf9b84:`
- 음성 준비 API는 프로젝트 원본과 배속을 받아 ffmpeg atempo로 원본 전체를 WAV 캐시에 처리한다. 캐시는 원본 버전과 배속을 구분하고 길이를 측정한다. 처리 실패나 취소는 임시 파일을 정리한다. `src/engine/routes/audio.ts` `src/engine/pipeline/audio-speed.ts` `git:76cd8f0:` `git:a594950:`
- Inspector의 음성 배속 변경은 준비 완료 뒤 반영한다. 원본이 교체된 응답은 버리고 재생 전에 캐시 버전을 다시 확인한다. `src/ui/studio/Inspector.tsx` `src/ui/screens/Studio.tsx` `git:2e12f3b:` `git:60016dd:`
- TTS 재생성은 클립 배속을 유지하며 길이 경고는 재생 길이를 사용한다. 0.3.2 schema로 다시 저장하면 배속이 손실되는 호환성 시험이 있다. `src/core/tts-clips.ts` `tests/core/schema-compat.test.ts` `git:3fd2fe3:` `git:35965cb:`
- 계획은 자동 길이·피치 시험과 설치본 미리보기·MP4 비교 및 사용자 청취를 요구한다. 시험 코드는 있으나 실행 출력, `pnpm verify` 통과, 패키징, 설치본 비교와 사용자 청취 판정은 코드에서 못 찾음. 음절 씹힘 감소는 미검증이다. Windows ffmpeg 검증도 실행 증거를 찾지 못했다. `architecture/changes/047-playback-speed/spec.md` `architecture/changes/047-playback-speed/plan.md` `tests/engine/audio-speed.test.ts` `tests/engine/render-media.test.ts` `git:92f362c:`
- 분리한 목소리·배경 레이어가 분리 WAV 대신 원본 영상 소리를 재생한다는 계획의 발견은 이 변경에서 해결하지 않은 항목이다. `architecture/changes/047-playback-speed/plan.md` `src/ui/studio/preview-sources.ts` `src/remotion/U3Short.tsx` `git:4fbad45:`
- 결정 링크: [0031 playback-speed](../../decisions/0031-playback-speed.md). `git:eedb2c0:`

## 관계
- [타임라인 편집](concept-timeline-editing.md)
- [로컬 TTS](concept-local-tts.md)
- [자막과 장면 검토](concept-caption-scene-review.md)

## 출처
- `architecture/changes/047-playback-speed/spec.md`
- `architecture/changes/047-playback-speed/plan.md`
- `architecture/changes/047-playback-speed/review.md`
- `src/core/schema.ts`
- `src/core/timeline/speed.ts`
- `src/core/timeline/ops.ts`
- `src/core/timeline/to-render.ts`
- `src/engine/pipeline/audio-speed.ts`
- `src/engine/routes/audio.ts`
- `src/ui/screens/Studio.tsx`
- `tests/engine/audio-speed.test.ts`
- `92f362c`
