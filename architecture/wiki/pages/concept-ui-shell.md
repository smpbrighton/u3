# 화면 셸과 설정

## 요약
화면 셸은 사이드바, 업데이트 표시와 알림을 제공한다. 설정에서 테마와 각 기능의 값을 바꾼다. `src/ui/App.tsx` `src/ui/screens/Settings.tsx` `git:5b21f4b:`

## 내용
- 화면은 shadcn 부품과 앱 공통 부품을 사용한다. UI 결정은 [0025](../../decisions/0025-ui-shadcn.md)를 참조한다. `src/ui/components/ui/button.tsx` `src/ui/components/u3/Sidebar.tsx` `git:13a60c5:`
- 테마는 dark·light·system을 지원한다. 선택은 `u3.uiTheme`에 저장하고 system은 운영체제 변경을 따라간다. Tauri에서는 창 배경도 갱신한다. `src/ui/theme-state.ts` `src/ui/settings/ThemeSettings.tsx` `git:f65db44:`
- 설정 저장은 직렬화하며 저장 실패가 남으면 재시작 전 flush가 실패한다. `src/ui/settings/settings-save.ts` `src/ui/screens/Settings.tsx` `git:955a33f:`
- 사용자 비교 승인과 패키징 통과는 변경 기록에 있다. 별도 패키징 실행 출력은 코드에서 못 찾음. `architecture/changes/043-shadcn-redesign/design.md` `architecture/changes/043-shadcn-redesign/plan.md` `git:ba75727:`
- 캡처 경로에는 브라우저에서 찍은 다크·라이트 이미지가 있다. 패키징 앱에서 네트워크 차단 후 Pretendard 확인은 미실행이다. 묶음별 verify 출력, 트랙 머리 테스트의 수정 전후 출력, 미리보기와 렌더 일치의 별도 실행 증거는 코드에서 못 찾음. `architecture/changes/043-shadcn-redesign/plan.md` `tests/ui/timeline-track-header-fit.test.ts` `git:172b795:`

- 이미지 생성 설정에서 주제·영상 캐러셀 기획 프롬프트를 각각 편집하고 포커스를 벗어나면 저장한다. 기본값 복원과 글자 수 표시를 제공하며 각 입력은 최대 20,000자다. `src/ui/screens/Settings.tsx` `src/core/carousel-prompt.ts` `git:be31984:`
- `GET/PUT /api/system/carousel-prompts`는 두 프롬프트와 기본값 여부를 반환한다. PUT은 전달된 항목만 갱신하며 빈 값이나 기본값은 저장 키를 삭제한다. `src/engine/routes/system.ts` `git:19649af:`
- 대본·말투·성격·주제 캐러셀·영상 캐러셀의 다섯 입력란은 마지막 입력 1초 뒤 저장한다. blur와 화면 해제에도 남은 변경을 저장하며 늦은 응답이 새 입력을 덮지 않도록 한다. `src/ui/screens/Settings.tsx` `tests/ui/settings-autosave.test.tsx` `git:9456024:`
- 말투·성격은 기본값 복원과 새 기본값 표시를 지원한다. 056 검증 기록은 UI 테스트 44개 통과를 보고하지만 설치본 UI는 미검증이다. `src/engine/routes/system.ts` `architecture/changes/056-voice-default-prompts/validation.md` `git:9456024:`

## 관계
- [원격 기본 프롬프트](concept-remote-prompts.md)
- [Codex 호환성](concept-codex-compat.md)
- [U3 데스크톱 앱](entity-desktop-app.md)
- [타임라인 편집](concept-timeline-editing.md)
- [캐러셀 생성](concept-carousel.md)

## 출처
- `architecture/changes/043-shadcn-redesign/spec.md`
- `architecture/changes/043-shadcn-redesign/plan.md`
- `architecture/changes/043-shadcn-redesign/design.md`
- `src/ui/theme-state.ts`
- `src/ui/settings/settings-save.ts`
- `src/ui/App.tsx`
- `git:13a60c5:`
- `architecture/changes/054-carousel-prompts/plan.md`
- `src/engine/routes/system.ts`
- `src/ui/screens/Settings.tsx`
