# 타임라인 편집

## 요약
U3 타임라인은 영상·자막·음성·효과음 트랙을 저장하고, 편집 뒤 영상 트랙은 빈 구간 없이 이어진다. 이력 스택으로 실행 취소·다시 실행을 처리하며, Remotion 미리보기와 렌더는 공통 변환을 쓴다. `architecture/changes/001-desktop-studio/spec.md` `src/core/schema.ts` `src/core/timeline/ops.ts` `src/core/timeline/history.ts` `src/core/timeline/to-render.ts` `src/remotion/U3Short.tsx` `git:4557ccd2910bfaf467b56e0622fcf303df8c2bd9:`

## 내용
- 대본 장면을 타임라인 클립으로 변환하고, 사진·영상 입력, 자르기, 트림, 재배치, 삭제를 지원한다. `src/core/timeline/from-script.ts` `src/core/timeline/ops.ts` `src/ui/studio/Timeline.tsx`
- 스튜디오에는 미리보기와 다중 트랙 타임라인이 있고, 속성 패널에서 선택 클립을 수정한다. `src/ui/screens/Studio.tsx` `src/ui/studio/Preview.tsx` `src/ui/studio/Inspector.tsx`
- Whisper 단어 시각은 입력 구간과 맞는 영상 클립에 대해 클립 시작 시각 기준으로 옮긴다. 클립 바깥 단어는 제외한다. `src/core/transcript.ts` `git:8d2187a927057d38b01beb87297299f089c70ea8:`
- 내보내기는 1080×1920·30fps MP4를 만들며, 수동 확인에서 H.264·AAC 파일과 영상 프레임을 확인했다. `src/engine/pipeline/render.ts` `docs/manual-check.md` `git:1cfc7e35c4af2fa3d58d6a017a83d21556c39740:`
- iPhone 재생은 미실행이다. `docs/manual-check.md`

## 관계
- [U3 데스크톱 앱](entity-desktop-app.md)
- [로컬 모델과 리소스](concept-local-models.md)

## 출처
- `architecture/changes/001-desktop-studio/spec.md`
- `src/core/schema.ts`
- `src/core/timeline/ops.ts`
- `src/core/timeline/history.ts`
- `src/core/timeline/from-script.ts`
- `src/core/timeline/to-render.ts`
- `src/core/transcript.ts`
- `src/remotion/U3Short.tsx`
- `src/ui/screens/Studio.tsx`
- `src/ui/studio/Timeline.tsx`
- `src/ui/studio/Preview.tsx`
- `src/ui/studio/Inspector.tsx`
- `src/engine/pipeline/render.ts`
- `docs/manual-check.md`
- `4557ccd2910bfaf467b56e0622fcf303df8c2bd9`
- `8d2187a927057d38b01beb87297299f089c70ea8`
- `1cfc7e35c4af2fa3d58d6a017a83d21556c39740`
