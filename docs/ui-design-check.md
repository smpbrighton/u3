# W11 화면설계 대조 기록

화면설계 원본은 `/Volumes/X31/workspace/smp_workspace/u3-design/canvas.json`과 각 보드의 `.dc.html`이다. 공통 구현은 SEED 토큰과 컴포넌트를 사용한다. 캡처는 브라우저 탭의 1440×900 콘텐츠 영역만 저장했다. `out/manual/`은 gitignore 대상이다.

## 화면별 대조

### 1 홈 · 영상 목록

| 항목 | 화면설계 값 | 구현 | 맞춤 여부 |
|---|---|---|---|
| 바탕 | 흰색, 사이드바 #F7F8FA | 흰 페이지와 SEED 회색 사이드바 | 맞음 |
| 카드 | 영상 세로 썸네일 9:16, 둥근 모서리, 미디어가 없으면 #2B2F36 바탕과 길이 배지 | 첫 main 클립의 입력을 표시하고, 영상은 첫 프레임 썸네일을 9:16 `object-fit: cover`로 채움 | 맞음 |
| 주 버튼 | 주황색 `새 영상` | SEED brandSolid `새 영상` | 맞음 |
| 보조 버튼 | 44px 테두리 메뉴, 주황 아닌 보조 동작 | 44px `…` 테두리 버튼, 메뉴에 이름 바꾸기·삭제 | 맞음 |
| 헤더 | `영상`, 24px/700 | `영상`, 24px/700 | 맞음 |
| 아이콘 | Hugeicons stroke rounded | Hugeicons `MoreHorizontalIcon` | 맞음 |
| 층 순서 | 메뉴·삭제 확인 덮개가 카드 위 | 메뉴 z-index 40, AlertDialog z-index 50 | 맞음 |
| 캡처 | `out/manual/w11-1.png`, `out/manual/w17-home.png` | 저장 프로젝트의 영상 첫 프레임과 길이 배지를 앱 창에서 확인 | 맞음 |

### 2 새 영상 · 미디어 넣기

| 항목 | 화면설계 값 | 구현 | 맞춤 여부 |
|---|---|---|---|
| 바탕 | 흰색 | 흰색 | 맞음 |
| 카드 | 단일 점선 첨부 버튼과 미디어 목록 | 영역 전체가 하나의 첨부 버튼, 테두리 미디어 행 | 맞음 |
| 주 버튼 | 주황색 `다음` | SEED brandSolid `다음: 대본` | 맞음 |
| 보조 버튼 | 첨부 영역, 미디어 제거·정렬 조작 | 첨부 영역 전체가 선택 버튼, 미디어 행의 정렬·빼기 버튼 | 맞음 |
| 헤더 | 뒤로 아이콘 → 이름 입력 → 단계 표시, 한 줄 | 라벨 없는 입력, aria-label, 3단계 표시 | 맞음 |
| 아이콘 | Hugeicons stroke rounded | Hugeicons 뒤로·위/아래 아이콘 | 맞음 |
| 층 순서 | 고정 헤더가 본문을 가리지 않고, 하단 동작 바가 본문 위 | 본문 여백으로 헤더 영역을 확보하고 하단 동작 바를 고정 | 맞음 |
| 캡처 | `out/manual/w11-2.png` | 영상·사진 2개를 넣은 입력 화면 | 맞음 |

### 3 대본 방식 고르기

| 항목 | 화면설계 값 | 구현 | 맞춤 여부 |
|---|---|---|---|
| 바탕 | 흰색 | 흰색 | 맞음 |
| 카드 | 대본 방식 선택 카드와 프레임 카드 | 선택 카드와 프레임 그룹 | 맞음 |
| 주 버튼 | 화면당 하나, 주황색 `대본 만들기` | SEED brandSolid `대본 만들기` | 맞음 |
| 보조 버튼 | 테두리·중립 버튼 | SEED neutralWeak 계열 | 맞음 |
| 헤더 | 64px 한 줄, 44px 테두리 없는 뒤로 아이콘, 프로젝트 이름과 단계 | 입력 화면과 같은 한 줄 헤더, 화면 제목 제거 | 맞음 |
| 본문 | 최대 너비 1040px, 가운데 정렬 | `script-main` 최대 너비 1040px | 맞음 |
| 상태 | 대본 생성 중 진행·취소, 실패 이유 표시 | 진행률·취소 버튼, Snackbar와 화면 경고 | 맞음 |
| 아이콘 | 화면설계의 선 아이콘 | 뒤로 아이콘과 선택 카드 아이콘 | 맞음 |
| 층 순서 | 겹치는 UI 없음 | 겹치는 UI 없음 | 맞음 |
| 캡처 | `out/manual/w12-script.png`, `out/manual/w12-script-progress.png` | 프레임과 한 줄 헤더, Codex 진행·취소 | 맞음 |

### 4-1 스튜디오 · 짤 고르기

| 항목 | 화면설계 값 | 구현 | 맞춤 여부 |
|---|---|---|---|
| 바탕 | 흰색, 1440×900 작업 화면 | 흰색 전체 화면 Studio | 맞음 |
| 카드 | 좌측 짤 라이브러리, 중앙 미리보기, 우측 속성·하단 타임라인 | 짤 탭, 선택한 짤 속성, 미리보기와 타임라인 | 맞음 |
| 주 버튼 | 헤더의 주황 `내보내기` | Studio 헤더의 SEED brandSolid 내보내기 | 맞음 |
| 보조 버튼 | 실행 취소·다시 실행은 테두리와 아이콘·문구, 막힌 상태는 disabled | SEED neutralOutline 버튼에 Hugeicons와 문구, SEED disabled 상태 | 맞음 |
| 헤더 | 뒤로 44px 테두리 없는 아이콘 버튼 → 프로젝트 이름 → 저장 → 내보내기 | aria-label이 있는 44px 테두리 없는 버튼과 Studio 헤더 | 맞음 |
| 아이콘 | Hugeicons stroke rounded | 뒤로·실행 취소·다시 실행에 Hugeicons | 맞음 |
| 층 순서 | 메뉴·대화상자가 작업 화면 위 | export backdrop z-index 20 | 맞음 |
| 캡처 | `out/manual/w11-4-1.png` | 짤 라이브러리에서 짤 클립을 선택한 Studio 화면 | 맞음 |

### 4-2 스튜디오 · 클립 자르기

| 항목 | 화면설계 값 | 구현 | 맞춤 여부 |
|---|---|---|---|
| 바탕 | 흰색 Studio 작업 화면 | 흰색 Studio 전체 화면 | 맞음 |
| 카드 | 4-1과 같은 편집기 배치, S 입력 뒤 잘린 클립 상태 | 분할된 타임라인 클립과 Studio 패널 | 일부: 키 입력 순간은 캡처에 남지 않고 분할 결과만 확인 |
| 주 버튼 | 헤더의 주황 `내보내기` | SEED brandSolid | 맞음 |
| 보조 버튼 | 중립/테두리 편집 도구 | 중립 도구, 일부 기본 테두리 | 일부: 도구별 디자인 대조 미완료 |
| 헤더 | 프로젝트 이름·단계 한 줄 | 같은 Studio 헤더 | 맞음 |
| 아이콘 | Hugeicons stroke rounded | Hugeicons 사용 | 맞음 |
| 층 순서 | 메뉴·대화상자가 최상위 | 대화상자 z-index 지정 | 맞음 |
| 캡처 | `out/manual/w11-4-2.png` | S 입력 뒤 분할된 타임라인 화면 | 맞음 |

### 4-3 스튜디오 · 미디어 끌어 넣기

| 항목 | 화면설계 값 | 구현 | 맞춤 여부 |
|---|---|---|---|
| 바탕 | 흰색 Studio 작업 화면 | 흰색 Studio 전체 화면 | 맞음 |
| 카드 | 4-1과 같은 편집기 배치, 미디어 클립을 넣은 상태 | 타임라인에 미디어 클립을 넣은 Studio 화면 | 일부: 드래그 중 대신 넣은 직후를 캡처 |
| 주 버튼 | 헤더의 주황 `내보내기` | SEED brandSolid | 맞음 |
| 보조 버튼 | 중립/테두리 편집 도구 | 중립 도구, 일부 기본 테두리 | 일부: 도구별 디자인 대조 미완료 |
| 헤더 | 프로젝트 이름·단계 한 줄 | 같은 Studio 헤더 | 맞음 |
| 아이콘 | Hugeicons stroke rounded | Hugeicons 사용 | 맞음 |
| 층 순서 | 드롭 안내가 콘텐츠 위 | 드래그 중 오버레이 없음 | 일부: 넣은 직후 화면이라 드롭 안내의 층 순서는 확인하지 못함 |
| 캡처 | `out/manual/w11-4-3.png` | 타임라인에 미디어를 넣은 직후 | 맞음 |

### 4-4 스튜디오 · 음성 녹음

| 항목 | 화면설계 값 | 구현 | 맞춤 여부 |
|---|---|---|---|
| 바탕 | 흰색 Studio 작업 화면 | 흰색 Studio 전체 화면 | 맞음 |
| 카드 | 녹음 제어·음성 목록 카드 | Studio 음성 탭의 녹음 제어와 녹음 목록 | 맞음 |
| 주 버튼 | 헤더의 주황 `내보내기` | SEED brandSolid | 맞음 |
| 보조 버튼 | 테두리 녹음·불러오기 동작 | 녹음 패널 컨트롤 | 일부: 녹음 버튼은 원형 빨간 버튼 |
| 헤더 | 프로젝트 이름·단계 한 줄 | 같은 Studio 헤더 | 맞음 |
| 아이콘 | Hugeicons stroke rounded | Hugeicons 사용 | 맞음 |
| 층 순서 | 작업 요소 겹침 없음 | 작업 요소 겹침 없음 | 맞음 |
| 캡처 | `out/manual/w11-4-4.png` | 음성 탭과 녹음 제어 화면 | 맞음 |

### 4-5 스튜디오 · 음성 분리 중

| 항목 | 화면설계 값 | 구현 | 맞춤 여부 |
|---|---|---|---|
| 바탕 | 흰색 Studio 작업 화면 | 흰색 Studio 전체 화면 | 맞음 |
| 카드 | 음성 분리 진행 표시 | MRX 모델 처리 중 메시지와 SEED ProgressCircle, 취소 동작 | 맞음 |
| 주 버튼 | 헤더의 주황 `내보내기` | SEED brandSolid | 맞음 |
| 보조 버튼 | 중립 취소 동작 | SEED neutralWeak 취소 | 맞음 |
| 헤더 | 프로젝트 이름·단계 한 줄 | 같은 Studio 헤더 | 맞음 |
| 아이콘 | Hugeicons stroke rounded | Hugeicons와 SEED ProgressCircle | 맞음 |
| 층 순서 | 진행 상태가 가림 요소 위 | 진행 상태는 속성 패널 안에 표시 | 맞음 |
| 캡처 | `out/manual/w11-4-5.png` | 60초 음성·음악 영상에서 MRX 분리 진행 상태 | 맞음 |

### 4-6 스튜디오 · 음성 분리 완료

| 항목 | 화면설계 값 | 구현 | 맞춤 여부 |
|---|---|---|---|
| 바탕 | 흰색 Studio 작업 화면 | 흰색 Studio 전체 화면 | 맞음 |
| 카드 | 분리한 음성·배경 트랙과 분리 완료 제어 | 분리 완료 상태, 음성·배경 트랙과 되돌리기 제어 | 맞음 |
| 주 버튼 | 헤더의 주황 `내보내기` | SEED brandSolid | 맞음 |
| 보조 버튼 | 중립 트랙 조작 버튼 | 중립 편집 도구 | 일부: 개별 트랙 버튼 대조 미완료 |
| 헤더 | 프로젝트 이름·단계 한 줄 | 같은 Studio 헤더 | 맞음 |
| 아이콘 | Hugeicons stroke rounded | Hugeicons 사용 | 맞음 |
| 층 순서 | 겹치는 UI 없음 | 겹치는 UI 없음 | 맞음 |
| 캡처 | `out/manual/w11-4-6.png` | 분리 완료 상태의 Studio 화면 | 맞음 |

### 4-7 스튜디오 · 말소리로 자막 만들기

| 항목 | 화면설계 값 | 구현 | 맞춤 여부 |
|---|---|---|---|
| 바탕 | 흰색 Studio 작업 화면 | 흰색 Studio 전체 화면 | 맞음 |
| 카드 | 받아쓰기 설정·진행·자막 카드 | 기본 Studio 화면과 기존 자막 교체 확인창 | 일부: 받아쓰기 작업의 설정·진행 카드는 재현하지 못함 |
| 주 버튼 | 헤더의 주황 `내보내기` | SEED brandSolid | 맞음 |
| 보조 버튼 | 중립 받아쓰기 동작 | 자막 만들기 및 교체 확인의 중립 동작 | 맞음 |
| 헤더 | 프로젝트 이름·단계 한 줄 | 같은 Studio 헤더 | 맞음 |
| 아이콘 | Hugeicons stroke rounded | Hugeicons와 진행 컴포넌트 | 맞음 |
| 층 순서 | 진행 상태가 가림 요소 위 | 확인창은 덮개 위, 기본 화면에는 진행 표시 없음 | 맞음 |
| 캡처 | `out/manual/w11-4-7.png`, `out/manual/w11-4-7-confirm.png` | 기본 Studio 화면과 기존 자막 교체 확인창 | 일부: Whisper 실행 화면은 캡처하지 못함 |

### 4-8 스튜디오 · 짤·효과음 라이브러리와 확대

| 항목 | 화면설계 값 | 구현 | 맞춤 여부 |
|---|---|---|---|
| 짤 격자 | 검색 아래 3열 격자, 선택 표시 | 검색·첫 로드마다 24개를 받고 목록 끝에서 24개씩 추가, 선택된 짤은 속성 패널에 표시 | 맞음 |
| 미디어 로드 | 보이는 격자 항목만 로드 | 화면에 들어온 video만 src를 설정하고 metadata를 읽음. 포인터가 올라온 한 항목만 muted loop 재생하고 나가면 0초에서 정지 | 맞음 |
| 타임라인 행 | 트랙마다 같은 높이로 정렬된 간결한 행 | 28px 행, 24px 클립 막대, 42px 눈금으로 좌우 행 경계를 맞춤 | 맞음 |
| 영상 트랙 | 영상 1은 빈틈 없이 재생하고, 영상 2 이상은 그 위에 겹쳐 재생 | 상위 클립이 있을 때만 영상 2 이상 행을 보이고, 행을 영상 1 바로 위부터 번호 순으로 배치. 상위 층은 아래 층 위에 렌더 | 미리보기는 WebKit에서 원본 미디어 재생 오류가 나 검증하지 못함. 엔진 렌더와 타임라인 행은 확인 |
| 효과음 | 검색 가능한 효과음 목록 | 효과음 탭에만 목록을 요청하고 검색 입력 뒤 250ms debounce 적용 | 맞음 |
| 확대 | 1~10 범위의 timeline 확대 | 두 range에 0.1 step과 소수 표시를 적용하고 Cmd+휠·핀치 이벤트를 연결 | 맞음 |
| 캡처 | `out/manual/w18-meme.png`, `out/manual/w18-sfx.png`, `out/manual/w18-zoom.png` | Tauri dev 앱의 짤·효과음 탭과 확대 상태를 창 단위로 캡처 | 일부: 트랙패드 핀치는 실기기에서 확인하지 못함 |
| 영상 트랙 캡처 | `out/manual/w19-studio.png`, `out/manual/w19-timeline.png` | 영상 2 행과 Inspector를 Tauri 창 단위로 캡처. 미리보기는 WebKit 미디어 재생 오류로 검은 화면 | 일부: 행과 Inspector 확인, 미리보기 미확인 |
| 클립 자르기·묶기·전환 | C는 포인터 시각에서 자르고, S는 재생 헤드에서 자른다. Shift 클릭은 같은 트랙 범위를 선택한다. M은 이웃 클립을 묶고 Shift+M은 묶음을 푼다. Inspector에서 시작·끝 효과와 방향·길이를 고른다 | 타임라인에 C·S·M 단축키 안내, 그룹 클립 외곽선, 디졸브 끝 표시와 Inspector 전환 선택기를 둠. 전환은 Remotion `interpolate` 기반 계산과 CSS `opacity`, `transform`, `clip-path`로 그림 | 일부: smoke의 경계 디졸브 렌더와 프레임은 확인. Tauri dev에서 미리보기는 `@remotion/media`가 입력 컨테이너를 재생하지 못해 검은 화면으로 남음. C·묶기·Inspector 캡처는 미확인 |
| 영상 트랙 끌기 | 끌기 시작 때 원래 행 위치를 유지하고, 놓은 y 좌표의 영상 행으로 이동 | 기존 행을 밀지 않는 `새 영상 트랙` 행을 영상 1 위에 고정. 포인터 놓기·취소 이벤트에서 끌기 상태를 정리 | 순수 행 판정 테스트 통과. Tauri dev에서 실제 영상 1↔2 끌기와 캡처는 미확인 |

### 5 mp4 내보내기

| 항목 | 화면설계 값 | 구현 | 맞춤 여부 |
|---|---|---|---|
| 바탕 | 어두운 반투명 덮개, 흰 대화상자 | 흰색 SEED 대화상자와 덮개 | 맞음 |
| 카드 | 480px 내보내기 대화상자, 경로 아래 주황 경고 상자 | export-dialog 480px 상한, 기존 mp4가 있으면 `#FFF4E5` / `#FFD8A8` / `#6B3300` 경고 표시 | 맞음 |
| 주 버튼 | 설계상 취소만 표시, 내보내기 주 동작 | SEED brandSolid 내보내기 | 다름: 실제 내보내기 동작에 주 버튼을 둠 |
| 보조 버튼 | 테두리 경로 변경·취소 | neutralWeak 경로 변경·취소 | 맞음 |
| 헤더 | `mp4 내보내기` 제목 | `mp4 내보내기` | 맞음 |
| 아이콘 | Hugeicons / SEED ProgressCircle | SEED ProgressCircle | 맞음 |
| 층 순서 | 덮개 아래 화면보다 위 | export backdrop z-index 20 | 맞음 |
| 캡처 | `out/manual/w11-5.png`, `out/manual/w17-export-warning.png` | `out/manual` 안의 같은 이름 mp4가 있을 때 경고와 사용 가능한 내보내기 버튼 확인 | 맞음 |

### 6 설정 · codex 상태와 모델

| 항목 | 화면설계 값 | 구현 | 맞춤 여부 |
|---|---|---|---|
| 바탕 | 흰색, 회색 사이드바 | 흰 페이지, SEED 회색 사이드바 | 맞음 |
| 카드 | codex·Jev·모델 테두리 카드 | section-card 구성 | 맞음 |
| 주 버튼 | 화면당 하나, SEED brand | `다시 확인`을 neutralWeak로 표시 | 다름: 원본에 주 버튼이 없고 상태 확인은 보조 동작 |
| 보조 버튼 | 테두리 선택·경로 지정 버튼 | neutralWeak 버튼, 직접 지정은 설치 미탐지 때만 표시 | 맞음 |
| 헤더 | `설정`, 24px/700 | `설정`, 24px/700 | 맞음 |
| 아이콘 | Hugeicons stroke rounded | Hugeicons 화살표·체크 | 맞음 |
| 층 순서 | 펼친 선택기가 카드 위 | SEED Select 포지셔너 사용 | 맞음 |
| 캡처 | `out/manual/w11-6.png`, `out/manual/w11-6-model-open.png`, `out/manual/w11-6-effort-open.png`, `out/manual/w11-6-not-logged-in.png`, `out/manual/w11-6-not-installed.png` | 기본 상태, 모델·추론 강도 펼침, 로그인 필요, 설치 필요 상태 | 맞음 |

### 7-1 영상 메뉴 열기

| 항목 | 화면설계 값 | 구현 | 맞춤 여부 |
|---|---|---|---|
| 바탕 | 홈의 흰색 페이지 | 흰색 페이지 | 맞음 |
| 카드 | 영상 썸네일 카드 | 프로젝트 카드 | 맞음 |
| 주 버튼 | 홈의 주황 `새 영상` | SEED brandSolid | 맞음 |
| 보조 버튼 | 44px 테두리 `…`, 이름 바꾸기·삭제 메뉴 | 44px 버튼과 role=menu 항목 | 맞음 |
| 헤더 | `영상` 제목 | `영상`, 24px/700 | 맞음 |
| 아이콘 | Hugeicons stroke rounded | Hugeicons `MoreHorizontalIcon` | 맞음 |
| 층 순서 | 메뉴는 카드 내용 위 | z-index 40 | 맞음 |
| 캡처 | `out/manual/w11-7-1.png` | 영상 메뉴 열린 화면 | 맞음 |

### 7-2 영상 삭제 확인

| 항목 | 화면설계 값 | 구현 | 맞춤 여부 |
|---|---|---|---|
| 바탕 | 홈 위 48% 검정 덮개 | SEED AlertDialog 덮개 | 맞음 |
| 카드 | 400px 흰 alertdialog | 400px 흰 SEED AlertDialog | 맞음 |
| 주 버튼 | 삭제, 빨강 | SEED criticalSolid 삭제 버튼 | 맞음 |
| 보조 버튼 | 테두리 취소 | SEED neutralWeak 취소 | 맞음 |
| 헤더 | 삭제 항목 이름을 제목에 표시 | 선택한 프로젝트 이름을 제목에 표시 | 맞음 |
| 아이콘 | Hugeicons stroke rounded | 대화상자에 아이콘 없음 | 맞음: 원본에도 아이콘 없음 |
| 층 순서 | 대화상자가 카드·아이콘 위 | z-index 50, 메뉴보다 위 | 맞음 |
| 캡처 | `out/manual/w11-7-2.png` | 삭제 확인, 항목 삭제 설명 확인 | 맞음 |

### 7-3 캐러셀 · 준비 중

| 항목 | 화면설계 값 | 구현 | 맞춤 여부 |
|---|---|---|---|
| 바탕 | 흰색, 사이드바 회색 | 흰 페이지, SEED 회색 사이드바 | 맞음 |
| 카드 | 빈 상태 테두리 카드, 최소 높이 480px | 480px 이상 빈 상태 카드 | 맞음 |
| 주 버튼 | 주황 주 버튼 없음 | 테두리 `영상으로 가기` | 맞음: 원본의 유일 동작도 보조 테두리 버튼 |
| 보조 버튼 | 테두리 `영상으로 가기` | 테두리 `영상으로 가기` | 맞음 |
| 헤더 | `캐러셀`, 24px/700 | `캐러셀`, 24px/700 | 맞음 |
| 아이콘 | Hugeicons stroke rounded | Hugeicons CarouselHorizontalIcon | 맞음 |
| 층 순서 | 덮개 요소 없음 | 덮개 요소 없음 | 맞음 |
| 캡처 | `out/manual/w11-7-3.png` | 빈 상태 카드 확인 | 맞음 |

## 캡처 현황

`out/manual/`에 브라우저 뷰포트 1440×900 캡처를 저장했다. W12는 `w12-input.png`, `w12-script.png`, `w12-script-progress.png`, `w12-studio.png`에 남겼다. `/Users/smp/Desktop/화면 기록 2026-10-24 오후 11.14.18.mov`에서 Codex 대본을 실제 생성하고 스튜디오 진입을 확인했다. 수동 데이터는 `U3_DATA_DIR=out/manual/store`에 저장했다.

## W26 SEED Design 재설계

W26에서 화면 입력과 선택 컨트롤을 SEED Design 컴포넌트로 교체했다. `index.html`은 `data-seed`와 `data-seed-color-mode="light-only"`, `color-scheme=light`를 선언한다. 내부 SEED 클래스 덮어쓰기와 유효하지 않은 basement 토큰을 제거했다. 화면별 세부 변경은 `architecture/changes/026-seed-redesign/plan.md`와 커밋 기록에 있다.

- 홈: Side Navigation, Badge, ActionButton, Menu, AlertDialog, Dialog, TextField를 사용한다.
- 입력: TextField와 ActionButton을 사용한다. OS 파일 선택기는 Tauri API를 유지한다.
- 대본: Select Box와 TextField를 사용한다.
- 설정: SEED Select를 사용한다.
- Studio: Tabs, TextField, Slider, Switch, RadioGroup, Select, ToggleButton, Dialog, Snackbar를 사용한다.
- 숫자 입력은 `TextFieldInput`과 `inputMode="decimal"`을 사용한다. 값은 문자열로 받아 숫자로 파싱한다.
- 유일하게 raw `<input>`으로 남긴 항목은 Recorder의 숨김 파일 선택기다. Tauri OS 파일 가져오기를 연결하는 입력이다.
- 타임라인의 영상·오디오 클립 색과 드롭 위치 안내 색은 데이터 구분 용도다. 역할 토큰으로 대응할 수 없어 데이터 색을 유지한다.
- 화면 캡처는 앱 창 단위로 `out/manual/w26-*.png`에 저장한다. 조작할 수 없는 화면은 실행 후 기록한다.

### W26 실행 결과

`pnpm tauri dev`를 지정한 `out/manual/store`와 앱 라이브러리 경로로 실행했다. 앱 창 캡처는 `out/manual/w26-home.png`에 저장했다. 이 세션에는 네이티브 앱 입력을 조작할 수 있는 도구가 없고 `smp:computer` 사용도 금지되어 있어 입력·대본·설정·Studio·내보내기 화면은 열지 못했다. 따라서 해당 화면은 캡처하지 않았다.

`pnpm dlx @seed-design/cli@latest compat`는 종료 코드 0으로 끝났다. 출력은 “모든 스니펫이 현재 @seed-design/react, @seed-design/css와 호환돼요.”였다. UI 타입 검사와 단축키 테스트도 통과했다.
