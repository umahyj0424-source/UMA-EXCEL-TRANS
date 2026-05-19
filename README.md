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


## 오프라인 번들

이 패키지는 `assets/vendor/` 아래에 로컬 실행용 파일을 포함합니다. 따라서 인터넷이 끊긴 환경에서도 `index.html`을 직접 열어 기본 계산/그래프가 동작하도록 구성되어 있습니다.

포함 파일:

- `assets/vendor/hyperformula.full.min.js`: HyperFormula 호환 로컬 수식 계산 어댑터
- `assets/vendor/chart.umd.min.js`: Chart.js 호환 경량 canvas 라인차트 렌더러

주의: 이 오프라인 번들은 CDN 의존성을 제거하기 위한 호환 번들입니다. 원본 공식 HyperFormula/Chart.js 파일로 교체하려면 같은 파일명으로 `assets/vendor/`에 덮어쓰면 됩니다.
