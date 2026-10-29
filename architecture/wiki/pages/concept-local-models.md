# 로컬 모델과 리소스

## 요약
bge-m3 모델이 없거나 임베딩·Jev 판정이 실패하면 짤 순위를 규칙 점수로 대체한다. Whisper 모델은 사용자가 받기를 선택한 뒤 받아 적기와 AI 추천 대본에 쓴다. `src/engine/pipeline/meme-embed.ts` `src/engine/pipeline/meme-rank.ts` `src/engine/pipeline/models.ts` `src/engine/pipeline/whisper.ts` `architecture/changes/001-desktop-studio/spec.md` `git:1143aae6690230730f63f25062d237cb612a7dfb:`

## 내용
- 설정 화면에서 bge-m3와 Whisper 모델의 받기 상태 및 작업 진행률·취소를 제공한다. 앱 시작 시 bge-m3가 준비되지 않았으면 다운로드 작업을 시작한다. `src/ui/screens/Settings.tsx` `src/engine/main.ts` `src/engine/pipeline/models.ts`
- 짤 임베딩은 동적 로드하며, 데이터 루트의 `cache/models/`를 모델 캐시로 사용한다. 임베딩 색인은 `cache/meme-embed/`에 저장한다. `src/engine/pipeline/meme-embed.ts`
- Whisper 단위 테스트는 커밋된 CLI 출력 fixture를 사용한다. 실제 모델 속도·정확도는 별도 `pnpm test:models` 검증이며 `pnpm verify`와 분리된다. `architecture/changes/001-desktop-studio/spec.md`
- 설치 앱 수동 확인에서 bge-m3 2.1 GB 다운로드, 60초 음성 분리 23.4초, 60초 받아 적기 2.5초 및 CER 4.42%를 기록했다. 이 측정은 대체 미디어를 사용했고 실제 숏폼 원본은 아니다. `docs/manual-check.md` `git:1cfc7e35c4af2fa3d58d6a017a83d21556c39740:`
- Whisper 모델 받기 진행률, 서명 빌드에서의 마이크 녹음은 미실행으로 남아 있다. `docs/manual-check.md`

- MRX WAV 쓰기는 출력 파일 스트림의 완료와 오류를 기다린다. native 시험은 입력·분리된 목소리·배경 WAV의 전체 길이와 RIFF/data 길이를 검사한다. 사용자 제공 사실에 따르면 Windows CI run 40821431526의 native 시험 9개가 통과했다. `src/engine/pipeline/separate.ts` `tests/windows/native.test.ts` `architecture/changes/049-windows-build/ci-verification.md` `git:4ae6621:`
- Whisper 취소 메시지는 진단 stderr를 포함하지 않는다. 일반 실패 메시지는 stderr 일부를 포함하며 `U3_WINDOWS_NATIVE=1`에서만 CLI 진단을 출력한다. 사용자 제공 사실에 따르면 이 취소 문구 변경의 Windows 재검증은 확인되지 않았고 Mac `pnpm verify`만 통과했다. `src/engine/pipeline/whisper.ts` `git:bdec109:`
- Windows native 시험은 Whisper 모델 다운로드와 SHA-256 확인, 변환·CLI·JSON 단계를 기록하고 한국어 결과를 검사한다. 실기기 성능과 정확도는 미검증이다. `tests/windows/native.test.ts` `architecture/changes/049-windows-build/checklist.md` `git:2ca4c8f:`

- TTS 모델의 다운로드와 생성 검증 상태는 [로컬 TTS](concept-local-tts.md)에 정리한다. `src/engine/pipeline/models.ts` `architecture/changes/040-qwen-tts/spec.md`

## 관계
- [로컬 TTS](concept-local-tts.md)
- [Windows 빌드와 검증](concept-windows-build.md)
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
