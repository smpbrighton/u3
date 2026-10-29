# 0034 기본 프롬프트 원격 갱신

Status: superseded-by 0035
Source: changes/055-remote-prompts/spec.md

## 맥락
대본·캐러셀 기획의 기본 프롬프트는 앱 코드에 있어 고칠 때마다 앱 릴리스가 필요했다. 사용자가 고친 프롬프트는 settings.json 에 남는다.

## 결정
- 기본 프롬프트 세 개(대본, 캐러셀 「주제로」·「영상으로」)를 GitHub `smpbrighton/u3` 의 고정 태그 `prompts` prerelease 자산 `prompts-schema-<N>.json` 에 둔다. 앱은 자기 `PROMPT_SCHEMA` 번호의 파일만 읽는다. 이 자산은 버전 Release 가 아니므로 교체해서 갱신한다.
- 정본은 앱 코드의 상수와 `PROMPT_REVISION` 이다. 앱은 원격 캐시와 앱에 든 기본값 가운데 revision 이 큰 쪽을 쓴다.
- 설치본 엔진은 시작 때와 6시간마다 받아 검증하고, revision 이 클 때만 캐시를 바꾼다. 개발 실행은 받지 않고 캐시도 쓰지 않는다.
- 설정 키가 없는 프롬프트는 현재 기본값을 따른다. 고친 프롬프트는 바꾸지 않고, 그 프롬프트의 기본값이 바뀌면 표시만 한다.
- 서명은 하지 않는다. HTTPS 와 내용 검증만 한다.
- `scripts/publish-prompts.sh` 가 깨끗한 main 의 기본값을 올린다. 앱 릴리스와 분리한다.

## 결과
프롬프트만 바꿀 때 앱 릴리스가 필요 없다. 원격 갱신은 릴리스 노트 없이 생성 결과를 바꾼다. 원본 본문은 앱 코드의 상수이고 git 이력에 남는다.
