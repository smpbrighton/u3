# 0015 캐러셀 이미지: codex 내장 image_gen, 글자는 위에 얹음, 옵션은 설정

Status: superseded-by 0019
Source: changes/030-carousel-images/spec.md

## 맥락
캐러셀은 장마다 이미지가 필요하다. U3 의 원격 AI 는 codex 와 Jev 만 쓴다(0009). 사용자는 이미지를 동시에 여러 장 만들고, 장마다 다시 만들고, 텍스트를 고치고, 이미지 생성 옵션을 설정에서 고르기를 원한다.

## 결정
- 이미지는 사용자 codex 로그인(ChatGPT 구독)의 내장 image_gen 도구(GPT Image 2.5)로 만든다. `codex exec` 를 격리한 작업 폴더에서 부른다. API 키 방식은 쓰지 않는다.
- 설정에서 이미지 모델(Flare·Sunburst), 퀄리티(low·medium·high·auto), 비율(4:5·1:1), 동시 실행 수(1~10, 기본 3)를 고른다. `settings.json` 에 저장한다.
- 이미지는 글자 없는 배경으로 만든다. 제목·본문은 앱이 Pretendard 로 위에 얹는다. 미리보기와 받기는 같은 Remotion 컴포넌트로 합성한다.
- 기획(장마다 제목·본문·이미지 지시문)과 주제 다듬기는 대본과 같은 codex 모델·effort 설정을 쓴다.

## 결과
텍스트를 고쳐도 이미지를 다시 만들지 않는다. image_gen 은 codex 의 공개 인터페이스가 아니어서 codex 업데이트로 깨질 수 있다. 앱은 결과 파일을 검사하고 실패 이유를 장마다 보인다. 동시 생성은 구독 메시지 한도를 쓴다.
