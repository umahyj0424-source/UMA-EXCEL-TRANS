# Uma Skill Simulator KR Formula Build

우마무스메 스킬 시뮬레이터 ver.5.0 XLSX를 기반으로 만든 GitHub Pages 배포용 정적 사이트입니다.

## 구성

- `index.html`: 앱 진입점
- `assets/workbook-data.js`: 원본 XLSX에서 추출한 셀 값/수식 데이터
- `assets/app.js`: 입력값을 `main` 시트 셀에 반영하고 HyperFormula로 재계산하는 UI 로직
- `assets/style.css`: 엑셀 시트 느낌의 UI 스타일

## 계산 방식

- 원본 파일: `ウマ娘スキルシミュレーターver.5.0.xlsx`
- 번역표: `tempermonkey_uma.txt`
- 추출 시각: `2026-05-19T15:07:57.070121+00:00`
- 코스 수: 138개
- 번역 스킬명: 1458개
- 원본 수식 수: 24,851개

기존 간이 계산 엔진 대신, XLSX의 주요 워크북 수식을 브라우저에 적재하고 HyperFormula에서 재계산합니다. Excel 365 동적 배열 표시식 일부는 GitHub Pages 정적 환경에서도 동작하도록 일반 INDEX/SMALL 수식으로 변환했습니다.

## GitHub Pages 배포

1. 이 ZIP을 압축 해제합니다.
2. 저장소 루트에 `index.html`과 `assets/`를 업로드합니다.
3. GitHub 저장소 Settings → Pages에서 배포 브랜치와 루트 폴더를 선택합니다.
4. 배포 URL로 접속합니다.

## 주의

`index.html`은 CDN으로 HyperFormula와 Chart.js를 불러옵니다. 완전 오프라인 배포가 필요하면 해당 라이브러리 파일을 `assets/vendor/`에 직접 넣고 `index.html`의 `<script>` 경로를 바꿔 주세요.


## v5.0-fast 성능 패치

- HyperFormula 입력 반영을 `batch`/`suspendEvaluation`으로 묶어, 셀을 하나 바꿀 때마다 전체 수식이 반복 재계산되는 문제를 줄였습니다.
- 같은 값은 다시 `setCellContents` 하지 않도록 쓰기 캐시를 추가했습니다.
- 자동 계산은 180ms debounce로 처리하고, 새로 추가한 스킬 행도 동일한 이벤트 위임 방식으로 처리합니다.
- 화면 상단 상태 표시줄에 최근 계산 시간을 표시합니다.

렉이 계속 크면 다음 단계는 `sim1/sim2` 계산을 Web Worker로 분리하거나, 원본 엑셀 전체 수식을 브라우저에 올리는 방식 대신 필요한 계산식만 JS로 포팅하는 방식입니다.
