# 타임라인 편집

## 요약
U3 타임라인은 영상·자막·음성·효과음 트랙을 저장하고, 편집 뒤 영상 트랙은 빈 구간 없이 이어진다. 이력 스택으로 실행 취소·다시 실행을 처리하며, Remotion 미리보기와 렌더는 공통 변환을 쓴다. `architecture/changes/001-desktop-studio/spec.md` `src/core/schema.ts` `src/core/timeline/ops.ts` `src/core/timeline/history.ts` `src/core/timeline/to-render.ts` `src/remotion/U3Short.tsx` `git:4557ccd2910bfaf467b56e0622fcf303df8c2bd9:`

## 내용
- 프로젝트를 다시 열면 영상 타임라인이 있으면 스튜디오, 입력 항목이 있으면 대본 화면, 그 밖에는 입력 화면을 연다. `src/ui/project-screen.ts` `src/ui/App.tsx` `git:61ae59987fab888744662f34224af5ee6e14b5f1`
- 대본 장면을 타임라인 클립으로 변환한다. reaction 없는 장면은 짤 배치를 끄고, 짤 후보가 없으면 누락 수를 세며, 앞·뒤 둘 다 요청한 장면은 1·2순위 짤을 사용한다. `src/core/script-memes.ts` `src/core/timeline/from-script.ts` `git:747a28de98afdac041f8a90433b9aaf253c0f1bf`
- 대본 변환 시 분류별 효과음 후보를 프로젝트 ID와 장면 번호로 선택해 자막 시작 시각에 놓고 길이를 최대 1.5초로 제한한다. 라이브러리 후보가 없으면 효과음 클립을 만들지 않는다. `src/core/timeline/from-script.ts` `src/core/sfx.ts` `git:957989b8c737be23e8ed837968a7817710d59cfc`
- 효과음 파일은 `u3-library:` 상대 경로 참조로 저장한다. 저장된 프로젝트의 과거 localhost 미디어 URL은 유효한 라이브러리 경로일 때 새 참조로 바뀌며, 렌더는 짤 ID를 라이브러리 메타데이터에서 파일로 해석한다. `src/core/library-reference.ts` `src/engine/store.ts` `src/engine/pipeline/render.ts` `git:08cb37dad59205fa6b68d26db4670a832b4cd9ed`
- 입력의 표시 이름은 저장된 원본 이름을 우선하고, 기존 데이터에는 파일 이름을 사용한다. 영상 썸네일은 최초 요청 시 JPEG로 추출해 재사용한다. `src/core/input.ts` `src/engine/pipeline/frames.ts` `src/engine/routes/frames.ts` `git:8e54a7b7f51fed20a65490fa8db55244620e0e8d`
- 미디어·효과음·타임라인 동작 라벨은 원본 파일 이름과 효과음 제목을 표시한다. 제목 연결이 없으면 `효과음`을 표시한다. `src/ui/studio/timeline-adapter.ts` `src/ui/studio/LibraryPanel.tsx` `git:61ae59987fab888744662f34224af5ee6e14b5f1`
- 스튜디오에는 미리보기와 다중 트랙 타임라인이 있고, 속성 패널에서 선택 클립을 수정한다. `src/ui/screens/Studio.tsx` `src/ui/studio/Preview.tsx` `src/ui/studio/Inspector.tsx`
- Whisper 단어 시각은 입력 구간과 맞는 영상 클립에 대해 클립 시작 시각 기준으로 옮긴다. 클립 바깥 단어는 제외한다. `src/core/transcript.ts` `git:8d2187a927057d38b01beb87297299f089c70ea8:`
- 내보내기는 1080×1920·30fps MP4를 만들며, 수동 확인에서 H.264·AAC 파일과 영상 프레임을 확인했다. `src/engine/pipeline/render.ts` `docs/manual-check.md` `git:1cfc7e35c4af2fa3d58d6a017a83d21556c39740:`
- 화면 시험에서 미디어 추가, 대본 생성, 짤·효과음 배치, 프로젝트 재열기, 스튜디오 라벨, 재실행 뒤 MP4 렌더를 통과했다. 별도 iPhone 재생은 미실행이며, 같은 이름의 내보내기 파일 덮어쓰기와 무음 원본의 「원본 소리」 트랙 표시가 관찰됐다. 첫 효과음 구간은 0.0 dB였고 클리핑 여부는 미검증이다. `docs/manual-check.md` `git:46249f4838041581cbbda7c1c72d75d98c09a6f0`
- 대본의 입력 번호·영상 구간·reaction 값은 입력 수와 영상 길이, 허용 감정 목록으로 검증한다. 이미지 프레임 순서 안내와 영상 구간 초 단위 안내를 Codex 입력에 포함한다. `src/engine/pipeline/script-validation.ts` `src/engine/routes/script.ts` `git:9a587d2b3e128689fbe16c6e536729a7a5b62d64`
- 대본 생성 진행·취소와 대본 화면 단계 흐름은 UI에 구현되어 있다. `src/ui/screens/Script.tsx` `src/ui/screens/script-workflow.ts` `git:f229745979ee11764b877301b48b98f9d2f1beab`

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
