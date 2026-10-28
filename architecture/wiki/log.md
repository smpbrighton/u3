# log

## [2026-10-25] ingest | W17 홈 썸네일과 내보내기 경고
- `pages/concept-home-export.md`
- `pages/entity-desktop-app.md`
- `index.md`
- `architecture/changes/` 문서는 범위에 포함된 커밋에서 변경되지 않았다.
- 내보내기 경고 표시와 홈 썸네일은 수동 확인했다. 경고 뒤 실제 덮어쓰기 실행은 미검증이다. `docs/manual-check.md` `git:b3a4d65`

## [2026-10-25] ingest | desktop-studio 구현 및 설치 앱 수동 확인
- `pages/entity-desktop-app.md`
- `pages/entity-engine-shutdown.md`
- `pages/concept-local-models.md`
- `pages/concept-timeline-editing.md`
- `index.md`

## [2026-10-25] ingest | W12–W16 대본·라이브러리·스튜디오 흐름 보정
- `pages/concept-timeline-editing.md`
- `index.md`
- `architecture/changes/` 문서는 범위에 포함된 커밋에서 변경되지 않았다.
- 검증 기록: 화면 시험에서 미디어·대본·짤·효과음·재열기·라벨·MP4 내보내기를 통과했다. iPhone 재생은 미실행이며, 덮어쓰기·무음 원본 트랙 표시 관찰은 미해결, 효과음 클리핑은 미검증이다. `docs/manual-check.md` `git:46249f4838041581cbbda7c1c72d75d98c09a6f0`

## [2026-10-27] ingest | W18–W69 편집·캐러셀·업데이트·Jev 키
- `pages/concept-timeline-editing.md`
- `pages/concept-carousel.md`
- `pages/concept-updates.md`
- `pages/concept-local-models.md`
- `pages/entity-desktop-app.md`
- `pages/entity-engine-shutdown.md`
- `index.md`
- 작업자 모델 설정 변경 `bfe5091`과 테스트 선행·서식·계획·결정 기록만 포함하는 커밋은 별도 반영할 페이지가 없다. 나머지 구현은 관련 기능별 페이지에 묶었다.
- 실제 릴리스·공증·설치, Jev 키 화면 저장·삭제 및 실제 Keychain 시험은 해당 변경의 검증에서 미실행 또는 미검증이다. `git:20d60d0` `git:19fcc96`

## [2026-10-27] ingest | release 0.2.0 및 W70 설치본 Jev 키
- `pages/concept-updates.md`
- `pages/entity-desktop-app.md`
- `index.md`
- 범위의 커밋에 `architecture/changes/` 문서 변경은 없다. `git:0782e6a` `git:6f4b047` `git:8e6e624`
- 0.2.0 릴리스와 W70 테스트·수정은 관련 페이지에 반영했다. 수정된 설치본의 실제 Keychain·설정 화면 검증과 수정 포함 릴리스는 확인하지 못했다. `git:6f4b047` `git:8e6e624`

## [2026-10-27] ingest | 039 script-voice · 042 carousel-image-view · 0.2.1
- `pages/concept-timeline-editing.md`
- `pages/concept-carousel.md`
- `pages/concept-updates.md`
- `index.md`
- 계획 및 테스트 선행 커밋 `e0ecd51`, `fc4196e`, `589f0bb`, `2c9da33`, `37205a1`과 테스트 컨텍스트 수정 `2e1f1a0`은 구현과 함께 반영했으며 별도 페이지는 없다.
- 039·042 계획의 실행 출력과 수동 검증 증거는 코드에서 못 찾음. 미검증 항목을 기능 페이지에 남겼다. `architecture/changes/039-script-voice/plan.md` `architecture/changes/042-carousel-image-view/plan.md`

## [2026-10-27] ingest | 040 qwen-tts
- `pages/concept-local-tts.md`
- `pages/concept-local-models.md`
- `pages/concept-timeline-editing.md`
- `index.md`
- 설계 승인·review·계획 승인 커밋 `ec00382`, `40c5a94`, `0891658`과 테스트 선행 커밋 `d401836`은 별도 페이지 없이 구현 및 검증 상태에 반영했다.
- 스파이크 커밋 `ede8fe7`, `55d1486`, `fb5e5c0`, 계획 반영 커밋 `6839136`, 구현 커밋 `910cddc`를 TTS 페이지에 반영했다.

## [2026-10-28] ingest | 044 carousel-workflow 및 release 0.2.2
- `pages/concept-carousel.md`
- `pages/concept-updates.md`
- `index.md`
- 설계 승인 `480b5ec`, review `1e53186`, 계획 승인 `51bb105`은 구현과 함께 반영했으며 별도 페이지는 없다. `git:480b5ec:` `git:1e53186:` `git:51bb105:`
- 데이터·저장소·라우트·합성 커밋과 버전 변경을 관련 페이지에 반영했다. `git:34fd789:` `git:e205fb4:` `git:a351ab2:` `git:8e5d3c3:` `git:18f3e6a:`

## [2026-10-28] ingest | 045 caption-scene-review
- `pages/concept-caption-scene-review.md`
- `pages/concept-timeline-editing.md`
- `pages/concept-local-tts.md`
- `pages/concept-carousel.md`
- `index.md`
- 설계 승인 `e4dddee`, review `3b08a83`, 계획 승인 `2e62c87`, 실패 테스트 선행 `9b4fdc6`은 구현과 함께 반영했으며 별도 페이지가 없다.

## [2026-10-28] ingest | 043 shadcn-redesign
- `pages/concept-ui-shell.md`
- `pages/entity-desktop-app.md`
- `pages/concept-timeline-editing.md`
- `pages/concept-carousel.md`
- `pages/concept-caption-scene-review.md`
- `index.md`
- 설계·디자인·승인·실패 테스트 선행 커밋은 구현과 검증 상태에 합쳐 반영했으며 별도 페이지가 없다. `git:ea4ff9b:` `git:e2efc7d:` `git:9145478:` `git:2ccda7f:`
- 패키징 앱의 네트워크 차단 폰트 확인은 미실행이다. 검증 실행 출력과 미리보기·렌더 비교의 별도 증거는 코드에서 못 찾음. `architecture/changes/043-shadcn-redesign/plan.md`
