# 로컬 모델과 리소스

## 요약
bge-m3 모델이 없거나 임베딩·Jev 판정이 실패하면 짤 순위를 규칙 점수로 대체한다. Whisper 모델은 사용자가 받기를 선택한 뒤 받아 적기와 AI 추천 대본에 쓴다. `src/engine/pipeline/meme-embed.ts` `src/engine/pipeline/meme-rank.ts` `src/engine/pipeline/models.ts` `src/engine/pipeline/whisper.ts` `architecture/changes/001-desktop-studio/spec.md` `git:1143aae6690230730f63f25062d237cb612a7dfb:`

## 내용
- 설정 화면에서 bge-m3와 Whisper 모델의 받기 상태 및 작업 진행률·취소를 제공한다. 앱 시작 시 bge-m3가 준비되지 않았으면 다운로드 작업을 시작한다. `src/ui/screens/Settings.tsx` `src/engine/main.ts` `src/engine/pipeline/models.ts`
- 짤 임베딩은 동적 로드하며, 데이터 루트의 `cache/models/`를 모델 캐시로 사용한다. 임베딩 색인은 `cache/meme-embed/`에 저장한다. `src/engine/pipeline/meme-embed.ts`
- Whisper 단위 테스트는 커밋된 CLI 출력 fixture를 사용한다. 실제 모델 속도·정확도는 별도 `pnpm test:models` 검증이며 `pnpm verify`와 분리된다. `architecture/changes/001-desktop-studio/spec.md`
- 설치 앱 수동 확인에서 bge-m3 2.1 GB 다운로드, 60초 음성 분리 23.4초, 60초 받아 적기 2.5초 및 CER 4.42%를 기록했다. 이 측정은 대체 미디어를 사용했고 실제 숏폼 원본은 아니다. `docs/manual-check.md` `git:1cfc7e35c4af2fa3d58d6a017a83d21556c39740:`
- Whisper 모델 받기 진행률, 서명 빌드에서의 마이크 녹음은 미실행으로 남아 있다. `docs/manual-check.md`

## 관계
- [U3 데스크톱 앱](entity-desktop-app.md)
- [엔진 종료](entity-engine-shutdown.md)
- [캐러셀 생성](concept-carousel.md)

## 출처
- `architecture/changes/001-desktop-studio/spec.md`
- `src/engine/main.ts`
- `src/engine/pipeline/models.ts`
- `src/engine/pipeline/meme-embed.ts`
- `src/engine/pipeline/meme-rank.ts`
- `src/engine/pipeline/whisper.ts`
- `src/ui/screens/Settings.tsx`
- `docs/manual-check.md`
- `1143aae6690230730f63f25062d237cb612a7dfb`
- `1cfc7e35c4af2fa3d58d6a017a83d21556c39740`
