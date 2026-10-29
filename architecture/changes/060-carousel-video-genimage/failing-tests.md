# 060 실패 테스트 기록

구현 전 실행했다. 두 명령 모두 종료 코드 1이다.

```sh
pnpm exec vitest run tests/core/carousel-video-genimage.test.ts tests/core/carousel-prompt.test.ts tests/core/default-prompts.test.ts tests/server/carousel-derived.test.ts tests/server/carousel-video-genimage.test.ts tests/server/carousel-workflow.test.ts tests/ui/carousel-screen.test.tsx
pnpm exec vitest run tests/engine/carousel-store.test.ts
```

출력 요지:

```text
 FAIL  tests/core/carousel-prompt.test.ts > 캐러셀 기획 프롬프트 > 영상 본문 뒤에 요청 장수와 자료 JSON을 붙인다
AssertionError: expected false to be true // Object.is equality
 FAIL  tests/core/carousel-video-genimage.test.ts > 영상 캐러셀 보이는 배경 > 새 장만 AI 모드로 시작하고 모드 없는 저장본은 frame으로 읽는다
AssertionError: expected { kind: 'frame', sec: +0, …(3) } to match object { mode: 'ai', generatedStatus: 'idle' }
 FAIL  tests/core/carousel-video-genimage.test.ts > 영상 캐러셀 보이는 배경 > AI 상태와 생성 파일을 고르고 윤곽은 파일이 있을 때만 덮는다
TypeError: visibleBackground is not a function
 FAIL  tests/core/carousel-video-genimage.test.ts > 영상 캐러셀 보이는 배경 > 참고 이미지 경로와 상품·새 글자·얼굴 규칙을 지시문에 넣는다
TypeError: referencePrompt is not a function
 FAIL  tests/core/default-prompts.test.ts > 기본 프롬프트 파일 > 본문 hash와 bundled revision을 코드의 정본에 맞춘다
AssertionError: expected 2 to be 3 // Object.is equality
 FAIL  tests/server/carousel-derived.test.ts > video derived carousel API > 영상 기획과 재기획은 기본값 또는 저장한 본문 뒤에 장수와 자료를 붙인다: undefined
AssertionError: expected '제공된 영상 자막과 장면 정보를 독자에게 건네는 일관된 편집 글로 …' to contain 'imagePrompt'
 FAIL  tests/server/carousel-derived.test.ts > video derived carousel API > 영상 기획과 재기획은 기본값 또는 저장한 본문 뒤에 장수와 자료를 붙인다: 저장한 영상 기획 지침
AssertionError: expected '저장한 영상 기획 지침\n\n요청 장수: 2\n자료: {"scene…' to contain 'imagePrompt'
 FAIL  tests/server/carousel-derived.test.ts > video derived carousel API > 영상 기획과 재기획은 기본값 또는 저장한 본문 뒤에 장수와 자료를 붙인다: remote
AssertionError: expected '원격 영상 지침\n\n요청 장수: 2\n자료: {"scenes":[…' to contain 'imagePrompt'
 FAIL  tests/server/carousel-video-genimage.test.ts > 060 영상 참고 이미지 생성 > 기획·추가·재기획은 AI로 시작하고 검토 모드 전환은 생성하지 않는다
AssertionError: expected undefined to be '공통 사진' // Object.is equality
 FAIL  tests/server/carousel-video-genimage.test.ts > 060 영상 참고 이미지 생성 > 프레임을 첨부해 생성하고 생성 이미지에서만 상자를 찾으며 빈 지시문을 채운다
AssertionError: expected "vi.fn()" to be called 2 times, but got 0 times
 FAIL  tests/server/carousel-video-genimage.test.ts > 060 영상 참고 이미지 생성 > 원본 모드는 생성하지 않고 AI 전환은 유효한 생성 파일을 재사용한다
AssertionError: expected 200 to be 202 // Object.is equality
 FAIL  tests/server/carousel-video-genimage.test.ts > 060 영상 참고 이미지 생성 > 다시 만들기는 프레임을 유지하고 시각 변경은 새 프레임과 생성 작업을 만든다
AssertionError: expected 404 to be 202 // Object.is equality
 FAIL  tests/server/carousel-video-genimage.test.ts > 060 영상 참고 이미지 생성 > 모드 전환은 수동 상자와 윤곽을 지우고 새 배경에서 상자를 찾는다
AssertionError: expected { style: 'ai-outline', …(4) } to match object { style: 'ai-outline', …(2) }
 FAIL  tests/server/carousel-video-genimage.test.ts > 060 영상 참고 이미지 생성 > 생성 실패는 한 장에 남고 받기는 생성 완료 장만 고르며 원본으로 복구한다
AssertionError: expected { kind: 'frame', sec: 0.5, …(4) } to match object { status: 'done', …(2) }
 FAIL  tests/server/carousel-video-genimage.test.ts > 060 영상 참고 이미지 생성 > 취소와 앱 재시작 복구는 AI 생성 상태를 실패로 바꾼다
 FAIL  tests/ui/carousel-screen.test.tsx > 캐러셀 화면 > AI 모드는 다시 만들기와 모드 선택을 보이고 세로 자르기를 숨긴다
AssertionError: expected '<div data-slot="property-row" class="…' to contain 'AI 이미지'
 FAIL  tests/ui/carousel-screen.test.tsx > 캐러셀 화면 > 영상 검토 화면도 장별 지시문을 고칠 수 있다
AssertionError: expected '<section class="flex h-dvh min-h-0 mi…' to contain 'aria-label="1장 이미지 지시문"'
 FAIL  tests/ui/carousel-screen.test.tsx > 캐러셀 화면 > 완료 표시·미리보기·받기는 생성 이미지 상태를 따른다
AssertionError: expected 'done' to be 'idle' // Object.is equality
 Test Files  6 failed | 1 passed (7)
      Tests  18 failed | 27 passed (45)
 FAIL  tests/engine/carousel-store.test.ts > carousel review storage > preserves the frame, scene and user image when replacing a plan
AssertionError: expected { kind: 'frame', sec: 4, …(3) } to deeply equal { kind: 'frame', sec: 4, …(5) }
 Test Files  1 failed (1)
      Tests  1 failed | 7 passed (8)
```

기존 단언 변경은 spec이 바꾼 동작에 한정했다. 영상 기획의 자료 JSON 뒤 고정 꼬리, revision 3, 재기획의 AI 기본값을 반영했다. 원본 장면의 동기 재추출·취소 시험에는 frame 모드를 명시했다.

## 재사용 경로 추가 확인

생성 실패 후 같은 프레임의 생성 파일로 돌아가는 경로를 추가 시험했다. 구현 수정 전에 종료 코드 1과 다음 출력을 확인했다.

```text
FAIL 다시 만들기가 실패해도 같은 프레임의 생성 파일은 모드 전환으로 재사용한다
AssertionError: expected 202 to be 200
Test Files 1 failed (1)
Tests 1 failed | 9 passed (10)
```

전체 검증에서 기존 `caption-plain.test.ts`의 AI 시각 재추출 단언도 확인했다. spec의 비동기 응답에 맞춰 200을 202로 바꾸고 작업 완료를 기다린다. Jev 대상 글 단언은 유지한다. 기존 시험 데이터에 새 스키마의 `mode: "frame"`과 `generatedStatus: "idle"`을 추가했다. 단언을 삭제하거나 약하게 바꾸지 않았다.
