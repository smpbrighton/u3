# Spec: desktop-studio
Source: intent.md (accepted). Status: accepted.
<!-- Status: draft | accepted. 제품 책임자가 바꾼다. accepted 커밋 뒤 /smp:critic으로 대조한다. -->

## 열린 질문에 대한 답
1. mp4 내보내기: 범위에 넣는다. 자동 업로드가 없으므로 내보내기가 없으면 결과물을 쓸 수 없다. 형식은 1080×1920·30fps mp4 한 가지다.
2. 원본 소리: 원본 소리 트랙으로 남는다. 다른 오디오 트랙과 같이 트랙 볼륨과 음소거가 있다. 음성 분리를 하면 원본 소리 트랙이 목소리·배경 두 트랙으로 바뀐다. 짤 소리, 추가 음성, 효과음은 그 위에 섞는다.
3. 입력: 프로젝트 하나에 영상과 사진을 섞어 여러 개(최대 20개)를 받는다. 사용자가 순서를 정한다. 스튜디오에서도 미디어를 더 넣는다.
4. AI 가 보는 프레임: 영상마다 처음부터 끝까지 같은 간격으로 10장을 뽑는다. 사진은 한 장씩 그대로 쓴다. codex 에 붙이는 이미지는 프로젝트 전체에서 최대 40장이다. 넘으면 영상마다 뽑는 장수를 같은 비율로 줄인다(영상당 최소 3장).
5. 대본 줄과 본 화면: AI 가 줄마다 입력 항목 번호를 내고, 영상이면 구간(시작·끝 초)도 낸다. 앱은 이 결과를 타임라인 클립으로 바꾼다. 사용자는 타임라인에서 고친다. 직접 쓰기 방식에서도 AI 가 같은 형식으로 낸다.
6. Jev 키: 개발자가 등록한 키(uUu `.env` 의 `TYPESAFE_API_KEY`)를 그대로 쓴다. 빌드할 때 U3 `.env` 에서 읽어 sidecar 에 넣는다. 키는 커밋하지 않는다. 사용자는 키를 넣지 않는다(우려 사항 6).
7. 지원 OS: macOS Apple Silicon 만 지원한다. 서명·공증 범위는 다음 단계로 넘김(우려 사항 2).
8. bge-m3: 앱에 넣지 않는다. 앱을 처음 열 때 받는다. 짤 색인(벡터 파일, 약 9 MB)은 앱에 넣는다. 모델을 받기 전에는 규칙 점수로 짤 순위를 정한다.
9. 라이브러리 화면: 별도 화면은 만들지 않는다. 스튜디오 왼쪽 패널의 미디어·짤·효과음·음성 탭에서 고르고 검색한다.

## 요구사항
1. 사용자가 macOS 설치 파일(.dmg)로 U3 를 설치하고, Node·pnpm·Python 설치 없이 실행한다.
2. 앱이 시작할 때 codex CLI 의 설치 여부와 로그인 상태(`codex login status`)를 확인한다. 둘 중 하나가 없으면 대본 생성 버튼을 막고 이유를 보인다.
3. 사용자가 새 프로젝트에 영상과 사진을 섞어 1~20개 넣고 순서를 정한다. 앱은 원본을 프로젝트 폴더에 복사한다.
4. 사용자가 대본 방식 두 가지 중 하나를 고른다.
   - 직접 쓰기: 사용자가 쓴 간략한 대본을 codex(`gpt-6-luna`)가 장면 단위 대본으로 만든다.
   - AI 추천: codex(`gpt-6-luna`)가 프레임·사진을 보고 장면 단위 대본을 만든다.
5. 대본이 정해지면 앱이 장면마다 짤 후보를 순위대로 고르고 1순위를 넣는다. 순위는 bge-m3 검색 후보를 Jev 적합도로 판정해 정한다. bge-m3 를 받기 전이거나 Jev 호출이 실패하면 규칙 점수로 정한다.
6. 앱이 대본을 타임라인으로 바꾼다. 장면마다 본 화면 클립과 짤 클립을 정해진 앞·뒤 순서로 영상 트랙에 놓고, 자막 클립과 효과음 클립을 같은 시각에 놓는다.
7. 스튜디오는 위에 9:16 미리보기를, 아래에 다중 트랙 타임라인을 보인다. 트랙은 자막·영상·원본 소리(분리 뒤에는 목소리·배경)·음성·효과음이다. 재생 헤드를 옮기면 미리보기가 그 시각을 보인다.
8. 사용자가 타임라인에서 아래를 한다.
   - 미디어 탭의 영상·사진을 영상 트랙에 끌어 넣는다.
   - 재생 헤드에서 클립을 자른다(단축키 S).
   - 클립 양끝을 끌어 트림한다.
   - 클립을 끌어 순서를 바꾼다.
   - 클립을 지운다.
   - 실행 취소·다시 실행을 한다.
   - 시간축을 확대·축소하고 스냅을 켜고 끈다.
9. 사용자가 클립을 고르면 오른쪽 속성 패널에서 고친다.
   - 영상 클립: 원본 시작·끝, 자막
   - 짤 클립: 다른 짤로 바꾸기(짤 탭의 후보·검색), 길이 0.5~4초, 본 화면 앞·뒤
   - 오디오 트랙·클립: 볼륨
   - 효과음 클립: 다른 효과음으로 바꾸기(효과음 탭)
10. 사용자가 음성 탭에서 마이크로 녹음한다. 녹음은 재생 헤드 자리부터 음성 트랙에 클립으로 들어간다. 녹음하는 동안 원본 소리는 재생하지 않는다. 사용자는 오디오 파일(m4a·mp3·wav)을 불러와 음성 트랙에 놓을 수도 있다.
11. 사용자가 원본 소리 클립에서 「음성 분리」를 누르면 앱이 그 영상의 소리를 목소리와 배경으로 나눈다. 진행률을 보이고 취소할 수 있다. 끝나면 원본 소리 트랙이 목소리·배경 두 트랙으로 바뀌고, 트랙마다 볼륨을 고친다. 「분리 되돌리기」로 원본 소리 트랙으로 돌아간다.
12. 사용자가 저장하면 프로젝트가 로컬 파일로 남는다. 앱을 다시 열면 프로젝트 목록에서 이어서 고친다.
13. 사용자가 내보내기를 누르면 앱이 타임라인 그대로 1080×1920·30fps mp4 를 만들어 사용자가 고른 폴더에 저장한다. 사용자는 진행률을 보고 취소한다.
14. 앱은 음성 합성(TTS), 업로드, 채널, 허브, 캐러셀, Claude CLI 기능을 갖지 않는다.

## 설계
화면 배치는 화면설계 아티팩트(https://claude.ai/artifact/KhEuMmtnQYHehoLgCfhAst)로 정한다. 화면은 홈·미디어 넣기·대본 방식·스튜디오(상황 6개: 짤 고르기·자르기·끌어 넣기·녹음·분리 중·분리 완료)·내보내기·설정이다. 이 절은 데이터·런타임·연동만 정한다. 아티팩트를 사용자가 확인하기 전에는 화면을 구현하지 않는다.

### 런타임
- 셸: Tauri 2. 창과 설치 파일, 파일 선택 대화상자, sidecar 실행을 맡는다.
- UI: React + Vite. 디자인 시스템은 SEED 를 쓴다. 미리보기는 `@remotion/player` 를 쓴다.
- 타임라인: `@xzdarcy/react-timeline-editor`(MIT)를 쓴다. 이 라이브러리가 트랙·이동·트림·스냅·확대를 맡는다. 자르기와 실행 취소는 앱이 만든다.
- 엔진: Node sidecar(Tauri `bundle.externalBin`). uUu 의 Hono 서버 구조를 옮겨 127.0.0.1 의 임의 포트에 묶는다. Tauri 가 시작할 때 sidecar 를 띄우고 포트와 일회용 토큰을 UI 에 넘긴다. UI 는 모든 요청에 토큰을 붙인다.
- 렌더: `@remotion/renderer`. sidecar 가 부른다. 헤드리스 Chrome 과 ffmpeg 는 Remotion 이 쓰는 것을 앱에 넣는다.
- 녹음: 웹뷰의 `getUserMedia` + `MediaRecorder` 로 녹음한다. 형식은 `MediaRecorder.isTypeSupported` 로 고르고 `audio/mp4` 를 먼저 쓴다. 파형은 wavesurfer.js v8(BSD-3)로 그린다. 앱 번들에 `NSMicrophoneUsageDescription` 과 entitlement `com.apple.security.device.audio-input` 을 넣는다.
- 음성 분리: sidecar 가 onnxruntime-node 로 MRX 모델(MIT, int8 약 31 MB)을 돌린다. 실행 순서는 CoreML EP, 그다음 CPU 다. MRX 는 대사·음악·효과 셋으로 나누고, 앱은 음악과 효과를 합쳐 「배경」으로 쓴다. 모델은 앱 리소스에 넣는다.
- PATH: macOS 앱은 셸 PATH 를 물려받지 않는다. sidecar 는 로그인 셸(`$SHELL -lc 'command -v codex'`)로 codex 경로를 찾는다. 설정 화면에서 경로를 직접 지정할 수 있다.

### 데이터(파일 기반)
루트는 `~/Library/Application Support/U3/` 다.
- `projects/<id>/project.json`: 입력 목록, 타임라인, 저장 시각
- `projects/<id>/input/`: 복사한 원본
- `projects/<id>/voice/`: 녹음·불러온 오디오
- `projects/<id>/stems/<inputId>.{voice,bg}.wav`: 음성 분리 결과
- `settings.json`: codex 경로
- `cache/models/`: 처음 실행 때 받은 bge-m3
- 앱 리소스(읽기 전용): `library/memes/<감정>/*.mp4`, `library/sfx/<종류>/*` 와 사이드카, `library/meme-embed/`(색인), `models/mrx.int8.onnx`

`project.json` 의 입력과 타임라인:
```ts
Input = { id: string; kind: "video" | "photo"; file: string; durationSec?: number }  // 1~20개
Timeline = {
  video: VideoClip[]      // 영상 트랙. 빈틈 없이 이어 붙는다(자르기·지우기 뒤 뒤쪽 클립이 당겨진다)
  captions: TextClip[]    // 자막 트랙. 시각을 자유롭게 둔다
  voice: AudioClip[]      // 음성 트랙
  sfx: AudioClip[]        // 효과음 트랙
  audio: {                // 트랙 볼륨(0~1.5)과 음소거
    source: Gain; voice: Gain; sfx: Gain
    stems?: Record<inputId, { voice: Gain; bg: Gain }>   // 음성 분리를 한 입력만
  }
}
VideoClip = { id; kind: "main"; inputId; inStartSec; inEndSec }        // 영상. 원본 소리가 따라온다
          | { id; kind: "main"; inputId; durationSec }                 // 사진. 소리 없음
          | { id; kind: "meme"; memeId; durationSec }                  // 짤. 짤 소리가 따라온다
TextClip  = { id; startSec; endSec; text }
AudioClip = { id; startSec; file; inStartSec; inEndSec; gain }
Gain      = { gain: number; muted: boolean }
```
- 자르기는 클립 하나를 재생 헤드에서 원본 구간 둘로 나눈다. 사진·짤 클립은 길이를 둘로 나눈다.
- 원본 소리는 영상 클립에서 나온다. 그래서 원본 소리 트랙은 영상 트랙과 같이 움직이고 따로 끌 수 없다.
- 사진 클립 길이 기본값은 자막 글자 수 ÷ 5.7자/초(uUu `DEFAULT_CHARS_PER_SEC`)이고 최소 1.5초다.
- 짤 길이 기본값은 원본 길이와 2초 중 짧은 쪽이다.
- 실행 취소는 `Timeline` 스냅숏 스택(최대 100개)으로 한다.
- Remotion composition 은 `Timeline` 을 그대로 입력으로 받는다. 미리보기와 렌더가 같은 변환을 쓴다.

### AI 연동
- codex: uUu `src/pipeline/codex.ts` 를 옮긴다. `codex exec -m gpt-6-luna --image <파일> --output-schema` 로 부르고 결과를 zod 로 다시 검증한다. 출력은 장면 목록(자막, 입력 항목 번호, 영상 구간, `reaction`(짤 감정), 짤 앞·뒤, `sfxCategory`)이다. 앱이 이것을 `Timeline` 으로 바꾼다.
- 프레임 추출: ffmpeg 로 영상마다 같은 간격 10장을 긴 변 768px JPEG 로 만든다. 사진도 같은 크기로 줄인다. 프로젝트 전체 최대 40장이다. 프롬프트에는 이미지마다 입력 항목 번호와 시각(초)을 적는다.
- Jev: uUu `src/pipeline/jev.ts`(모델 `jev-1.13.0` 고정)와 짤 순위(`core/meme-rank.ts`, `pipeline/meme-rank.ts`)를 옮긴다. 키는 빌드 시 U3 `.env` 의 `TYPESAFE_API_KEY` 를 sidecar 번들에 넣는다. `.env` 가 없거나 키가 비면 빌드를 실패시킨다.
- 사용량: uUu 사용량 기록을 codex·Jev 두 제공자만 남기고 옮긴다.

### uUu 에서 옮기는 것과 버리는 것
- 옮긴다: `core/` 의 schema 일부·captions·layout·safezone·meme-segment·meme-rank·meme-match·sfx·mix·fonts·measure, `remotion/` 의 `Short` 레이어 일부, `pipeline/` 의 codex·jev·meme-embed·meme-rank·ffmpeg·render·usage.
- 새로 만든다: `Timeline` 모델과 편집 연산(자르기·트림·이동·지우기·실행 취소), `Timeline` → Remotion 변환, 녹음, 음성 분리.
- 버린다: TTS·나레이션, uUu 장면·타임라인 계산(`core/timeline.ts`), 승인 게이트, 훅 사진·공개 모자이크, 제품 컷·이미지 생성·스톡, CTA 꼬리·플랫폼 두 버전, 채널, 허브, 캐러셀, 크롬 확장, Claude CLI, 계정 다중 선택.
- 코드는 히스토리 없이 복사한다. 옮긴 파일 머리 주석의 uUu 결정 번호는 지운다.

## 결정
- 앱 구조: Tauri 2 셸 + React UI + Node sidecar 엔진(127.0.0.1·일회용 토큰), macOS Apple Silicon 만 → [0001](../../decisions/0001-tauri-node-sidecar.md)
- AI: codex CLI(`gpt-6-luna`)와 Jev(개발자 등록 키를 빌드 때 넣음)만, Claude 없음 → [0002](../../decisions/0002-codex-luna-jev-only.md)
- 범위: 입력(영상·사진 섞어 1~20개)·대본·짤·효과음·녹음·음성 분리·mp4 내보내기, TTS·업로드·채널·허브·캐러셀 없음 → [0003](../../decisions/0003-core-scope.md)
- 라이브러리: 짤·효과음과 짤 색인은 앱에 넣고 bge-m3 는 처음 실행 때 받음, 그 전에는 규칙 점수 → [0004](../../decisions/0004-bundled-library-lazy-model.md)
- 편집 모델: 다중 트랙 타임라인(자막·영상·원본 소리·음성·효과음), 영상 트랙은 빈틈 없이 이어 붙음, `@xzdarcy/react-timeline-editor` + 앱이 만든 자르기·실행 취소 → [0005](../../decisions/0005-multitrack-timeline.md)
- 소리: 녹음은 웹뷰 MediaRecorder, 음성 분리는 MRX(MIT)를 onnxruntime-node 로, 결과는 목소리·배경 두 트랙 → [0006](../../decisions/0006-voice-record-separate.md)

## 우려 사항
1. Remotion 을 Node sidecar 로 묶는 방법이 검증되지 않았다. Remotion 은 헤드리스 Chrome 과 자체 compositor 바이너리를 쓰고, Node 단일 실행 파일(SEA)로 묶을 때 동작이 확인되지 않았다. plan 의 첫 단계를 이 스파이크로 둔다. 실패하면 Node 바이너리와 JS 번들을 앱 리소스로 넣는다. 정책 소유자: 엔지니어링.
2. 다른 Mac 에 배포하려면 Apple Developer ID 서명과 공증이 필요하다. 없으면 Gatekeeper 가 앱 실행을 막는다. 개발자 계정과 비용은 사람이 정한다. 추천: 첫 버전은 ad-hoc 서명으로 내부 Mac 에서만 쓰고, 외부 배포 전에 정한다. 정책 소유자: 제품 책임자.
3. 설치 파일 크기가 커진다. 짤 212 MB, 헤드리스 Chrome, Node 런타임, onnxruntime, MRX(31 MB)를 더하면 수백 MB 가 된다. bge-m3(2.1 GB)는 이 크기에 더하지 않으려고 처음 실행 때 받는다. 정책 소유자: 제품 책임자.
4. codex 는 사용자 PC 에 따로 설치하고 로그인해야 한다. 앱은 codex 를 설치하지 않는다. 사용자는 설치 안내를 보고 터미널에서 한 번 로그인한다. 이것은 "터미널 없이" 기대 결과의 예외다. 정책 소유자: 제품 책임자.
5. 영상 구간이 겹치거나 빈다. AI 가 낸 구간이 겹쳐도 그대로 허용하고, 사용자가 고친다. 앱은 구간이 원본 길이를 넘을 때만 막는다. 정책 소유자: 엔지니어링.
6. Jev 키가 설치 파일 안에 들어간다. 앱을 받은 사람은 누구나 sidecar 번들에서 키를 꺼낼 수 있고, 사용 요금은 키 주인에게 청구된다. 추천: 내부 배포 동안은 그대로 쓰고, 외부 배포 전에 키를 서버 뒤로 옮긴다. 이유: 키를 숨길 서버가 지금은 없고, 내부 사용자는 신뢰할 수 있다. 정책 소유자: 제품 책임자.
7. MRX 의 Apple Silicon 처리 시간과 분리 품질에 공개 수치가 없다. 공개된 음악 SNR 은 약 5 dB 이고, 배경에 목소리 잔향이 남을 수 있다. CoreML EP 는 지원하지 않는 노드를 CPU 로 넘긴다. plan 에 실측 스파이크(실제 숏폼 60초 3개, 처리 시간·청취 판정)를 둔다. 품질이 모자라면 Mel-Band RoFormer(MIT, 464 MB)를 따로 받는 고품질 옵션으로 검토한다. Demucs 는 가중치가 연구용이라 쓰지 않는다. 정책 소유자: 엔지니어링.
8. 마이크 권한은 서명한 빌드에서만 제대로 확인된다. `tauri dev` 는 터미널의 마이크 권한을 빌려 써서 문제가 드러나지 않는다. 녹음 확인은 `pnpm tauri build` 결과물로 한다. 정책 소유자: 엔지니어링.
9. 타임라인 라이브러리에 자르기와 트랙 사이 이동이 없다. 자르기는 앱이 만든다. 클립을 다른 트랙으로 옮기는 기능은 이번 범위에 넣지 않는다. 트랙마다 클립 종류가 정해져 있기 때문이다. 정책 소유자: 엔지니어링.

## 검증 기준
- `pnpm verify` 가 종료 코드 0 으로 끝나고 마지막 줄에 `✓ verify passed` 를 낸다. verify 는 typecheck·vitest·`cargo check`(src-tauri)·smoke 를 돈다.
- smoke 는 커밋한 fixture 프로젝트(영상 1개·사진 1개, 짤 앞·뒤 각 1개, 자른 클립 1개, 음성 클립 1개, 효과음 1개)를 sidecar 렌더로 mp4 로 만들고, 길이·해상도·오디오 트랙을 ffprobe 로 확인한다.
- 단위 테스트가 확인하는 것: 대본 → `Timeline` 변환, 자르기·트림·지우기 뒤 영상 트랙 이어 붙이기, 실행 취소, `Timeline` → Remotion 입력 변환, 트랙 볼륨·음소거·분리 트랙 섞기, codex 출력 zod 검증, 짤 순위 규칙 점수 대체.
- 음성 분리 단위 테스트는 짧은 fixture(5초)로 MRX 를 돌려 출력 두 파일의 길이가 입력과 같은지 확인한다.
- `pnpm tauri build` 가 .dmg 를 만든다. 설치한 앱의 실제 codex 호출, Jev 호출, 처음 실행 모델 받기, 마이크 녹음, 음성 분리 속도는 수동 확인 항목으로 plan 에 적는다.
