'use strict';

// workbook-data.js는 window.UMA_XLSX_DATA 형태로 생성되어 있으므로 Worker 전역에서 window를 self로 매핑한다.
self.window = self;

let DATA = null;
let hf = null;
let sheetIds = {};
let writeCache = new Map();
let initialized = false;
let initializing = false;

function sendStatus(progress, text, active=true){ postMessage({type:'status', progress, text, active}); }
function sendError(err, requestId=null){ postMessage({type:'error', requestId, message: String(err && (err.stack || err.message) || err)}); }
function colToIdx(col){let n=0;for(const ch of col){n=n*26+(ch.charCodeAt(0)-64)}return n-1}
function addr(sheet, a1){const m=/^([A-Z]+)(\d+)$/.exec(a1);return {sheet:sheetIds[sheet], col:colToIdx(m[1]), row:Number(m[2])-1}}
function get(sheet, a1){try{return hf.getCellValue(addr(sheet,a1))}catch(e){return null}}
function normalizeCellValue(val){ return (val==='' || val===undefined) ? null : val; }
function cellCacheKey(sheet, a1){ return `${sheet}!${a1}`; }
function valueCacheKey(val){ return val === null ? 'null' : `${typeof val}:${String(val)}`; }
function set(sheet, a1, val){
  const normalized = normalizeCellValue(val);
  const key = cellCacheKey(sheet,a1);
  const vkey = valueCacheKey(normalized);
  if(writeCache.get(key) === vkey) return;
  hf.setCellContents(addr(sheet,a1), [[normalized]]);
  writeCache.set(key, vkey);
}
function withFormulaBatch(fn){
  if(typeof hf.batch === 'function') return hf.batch(fn);
  if(typeof hf.suspendEvaluation === 'function' && typeof hf.resumeEvaluation === 'function'){
    hf.suspendEvaluation();
    try { return fn(); } finally { hf.resumeEvaluation(); }
  }
  return fn();
}
function num(v){const n=Number(v);return Number.isFinite(n)?n:0}
function setNumOrBlank(a1,v){set('main',a1,(v===''||v==null||Number.isNaN(Number(v)))?null:Number(v))}

function init(){
  if(initialized || initializing) return;
  initializing = true;
  try{
    sendStatus(10, 'HyperFormula CDN 로딩 중…');
    if(!self.HyperFormula) importScripts('https://cdn.jsdelivr.net/npm/hyperformula@2.7.1/dist/hyperformula.full.min.js');
    sendStatus(24, '원본 엑셀 수식 데이터 로딩 중…');
    importScripts('workbook-data.js');
    DATA = self.UMA_XLSX_DATA;
    sendStatus(42, '수식 엔진 생성 중…');
    hf = HyperFormula.buildFromSheets(DATA.workbook.sheets, { licenseKey:'gpl-v3', useArrayArithmetic:true, useColumnIndex:true, nullYear:30 });
    for(const name of DATA.workbook.sheetNames){ sheetIds[name]=hf.getSheetId(name); }
    initialized = true;
    initializing = false;
    sendStatus(100, '수식 엔진 준비 완료', false);
    postMessage({type:'ready', formulaCount: DATA.workbook.formulaCount});
  }catch(e){ initializing=false; sendError(e); }
}

function syncInputsToWorkbook(state){
  const inputs = state.inputs || {};
  const course = state.course || {};
  set('main','D9',num(inputs.stat_speed)); set('main','G9',num(inputs.green_speed));
  set('main','D11',num(inputs.stat_stamina)); set('main','G11',num(inputs.green_stamina));
  set('main','D13',num(inputs.stat_power)); set('main','G13',num(inputs.green_power));
  set('main','D15',num(inputs.stat_guts)); set('main','G15',num(inputs.green_guts));
  set('main','D17',num(inputs.stat_wisdom)); set('main','G17',num(inputs.green_wisdom));
  set('main','M9',inputs.apt_distance||'S'); set('main','M11',inputs.apt_surface||'A'); set('main','M13',inputs.mood||'絶好調'); set('main','M15',inputs.style||'先行'); set('main','M17',inputs.courseBonus||'最大');
  set('main','B23',course.venueJ||'東京'); set('main','G23',course.distanceJ||'芝2400m'); set('main','M23',inputs.trackCondition||'良');
  for(let r=29;r<=77;r++){ for(const col of ['Q','R','S','V','Z','AB','AD','AF','AH','AJ','AM','AO']) set('main',col+r,null); }
  (state.skills||[]).slice(0,49).forEach((s,i)=>{
    const r=29+i;
    set('main','Q'+r,!!s.enabled); set('main','R'+r,!!s.premise); set('main','S'+r,s.kindJ||'通常'); set('main','V'+r,s.nameJ||s.nameKR||'');
    setNumOrBlank('Z'+r,s.target); setNumOrBlank('AB'+r,s.accel); setNumOrBlank('AD'+r,s.instant); setNumOrBlank('AF'+r,s.stretch); setNumOrBlank('AH'+r,s.duration);
    set('main','AJ'+r,s.triggerJ||''); setNumOrBlank('AM'+r,s.value); set('main','AO'+r,s.optionJ||'');
  });
}

function buildResult(){
  const labels=[], skill=[], noskill=[];
  for(let r=2;r<=126;r++){
    const x=get('sim1','Y'+r); const y1=get('sim1','X'+r); const y0=get('sim2','X'+r);
    if(typeof x==='number' && x>=0 && x<9999){labels.push(Number(x.toFixed(3))); skill.push(typeof y1==='number'?y1:null); noskill.push(typeof y0==='number'?y0:null);}
  }
  const skillPositions=[];
  for(let i=0;i<49;i++){
    const pos=get('sim1','K'+(3+i));
    skillPositions.push(typeof pos === 'number' ? pos : null);
  }
  return {
    results: {
      actualTime:get('main','B29'), noskillTime:get('main','E29'), timeDiff:get('main','H29'), bodyDiff:get('main','J29'), meterDiff:get('main','N29'),
      eff_speed:get('db','AL3'), eff_stamina:get('db','AL4'), eff_power:get('db','AL5'), eff_guts:get('db','AL6'), eff_wisdom:get('db','AL7')
    },
    chart: {labels, skill, noskill},
    skillPositions
  };
}

function run(requestId, state){
  if(!initialized){ sendError('수식 엔진이 아직 준비되지 않았습니다.', requestId); return; }
  const t0 = performance.now();
  try{
    sendStatus(18, '입력값을 수식 시트에 반영 중…');
    withFormulaBatch(()=>syncInputsToWorkbook(state));
    sendStatus(76, '계산 결과를 읽는 중…');
    const result = buildResult();
    sendStatus(94, '그래프 데이터를 전송 중…');
    postMessage({type:'result', requestId, result, ms: performance.now()-t0, formulaCount: DATA.workbook.formulaCount});
  }catch(e){ sendError(e, requestId); }
}

self.onmessage = (event)=>{
  const msg = event.data || {};
  if(msg.type === 'init') init();
  else if(msg.type === 'run') run(msg.requestId, msg.state || {});
};
