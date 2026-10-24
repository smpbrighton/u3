# 0004 라이브러리: 앱에 포함, 임베딩 모델은 처음 실행 때 받음

Status: accepted
Source: changes/001-desktop-studio/spec.md

## 맥락
짤은 약 2,200개(212 MB), 효과음은 82개(4.7 MB)다. 짤 검색 임베딩 모델 bge-m3(fp32)은 2.1 GB 다.

## 결정
- 짤·효과음 파일과 사이드카, 짤 임베딩 색인을 앱 리소스에 넣는다.
- bge-m3 는 앱에 넣지 않는다. 처음 실행 때 `~/Library/Application Support/U3/cache/models/` 로 받는다.
- 모델을 받기 전에는 규칙 점수로 짤 순위를 정한다.

## 결과
설치 파일이 2 GB 커지지 않는다. 처음 실행 직후의 짤 순위는 규칙 점수다.
