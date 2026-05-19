# 우마무스메 스킬 시뮬레이터 KR - Worker 성능 패치판

GitHub Pages 배포용 정적 사이트입니다.

## 이번 버전의 변경점

- `workbook-data.js` 4MB 원본 수식 데이터는 메인 화면에서 직접 로드하지 않고 Web Worker에서만 로드합니다.
- HyperFormula 수식 계산도 Web Worker에서 실행해, 계산 중 화면/입력 UI가 멈추는 현상을 줄였습니다.
- 입력값 변경 때마다 자동 재계산하지 않고, `시뮬레이션 실행` 버튼을 눌렀을 때만 계산합니다.
- 실행 상태와 진행률 바를 추가했습니다.
- CDN 방식은 유지했습니다. 오프라인 vendor 라이브러리는 포함하지 않았습니다.

## 파일 구성

```text
index.html
assets/
  app.js
  formula-worker.js
  style.css
  ui-data.js
  workbook-data.js
README.md
formula_build_report.json
```

## 배포

ZIP을 풀어 GitHub 저장소 루트에 업로드한 뒤 GitHub Pages를 켜면 됩니다.

## 주의

계산 자체는 여전히 원본 XLSX의 대량 수식을 HyperFormula로 계산합니다. Web Worker로 UI 렉은 크게 줄였지만, 계산 완료 시간은 사용자 기기 성능에 따라 달라질 수 있습니다.
