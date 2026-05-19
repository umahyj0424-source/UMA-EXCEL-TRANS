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
    importScripts('workbook-data.js?v=mashinfix1');
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


function validChartPointCount(chart){
  if(!chart) return 0;
  let n = 0;
  const len = Math.max(chart.labels?.length||0, chart.skill?.length||0, chart.noskill?.length||0);
  for(let i=0;i<len;i++){
    const x = Number(chart.labels?.[i]);
    const y1 = Number(chart.skill?.[i]);
    const y0 = Number(chart.noskill?.[i]);
    if(Number.isFinite(x) && (Number.isFinite(y1) || Number.isFinite(y0))) n++;
  }
  return n;
}
function numOr(v, fallback=0){ const n=Number(v); return Number.isFinite(n)?n:fallback; }
const APT_FALLBACK = {'S':1.05,'A':1,'B':0.9,'C':0.8,'D':0.6,'E':0.4,'F':0.2,'G':0.1};
const MOOD_FALLBACK = {'絶好調':1.04,'好調':1.02,'普通':1,'不調':0.98,'絶不調':0.96};
const TRACK_FALLBACK = {'良':{speed:0,power:0},'稍重':{speed:0,power:-50},'重':{speed:0,power:-50},'不良':{speed:-50,power:-50}};
const STYLE_FALLBACK = {
  '大逃げ':{early:1.01, mid:0.975, final:0.985, accel:0.94},
  '逃げ':{early:1.00, mid:0.98, final:0.995, accel:0.95},
  '先行':{early:0.98, mid:0.99, final:1.00, accel:1.00},
  '差し':{early:0.96, mid:1.00, final:1.012, accel:1.03},
  '追込':{early:0.94, mid:1.005, final:1.018, accel:1.04}
};
function phaseBoundsFallback(course){ const L=numOr(course.total, 1200); return {early:[0,L/6], middle:[L/6,L*2/3], late:[L*2/3,L*5/6], last:[L*5/6,L], end:L}; }
function phaseNameFallback(d, course){ const p=phaseBoundsFallback(course); if(d<p.early[1]) return 'early'; if(d<p.middle[1]) return 'middle'; if(d<p.late[1]) return 'late'; return 'last'; }
function phaseRangeForOptionFallback(opt, course){
  const p=phaseBoundsFallback(course), L=numOr(course.total,1200);
  if(opt==='前半のみ') return [0,L/2]; if(opt==='後半のみ') return [L/2,L];
  if(opt==='序盤のみ') return p.early; if(opt==='中盤のみ') return p.middle; if(opt==='終盤のみ') return p.late; if(opt==='最終盤のみ') return p.last;
  return [0,L];
}
function baseOffsetFallback(opt, course){
  const p=phaseBoundsFallback(course), L=numOr(course.total,1200);
  return {'基準:スタート':0,'基準:中盤開始':p.early[1],'基準:終盤開始':p.middle[1],'基準:最終盤開始':p.late[1],'基準:ゴール地点':L}[opt] ?? 0;
}
function findFirstSegmentFallback(segs, opt, course, minPos=0){
  let range=phaseRangeForOptionFallback(opt, course);
  if(opt==='以降の上り坂'||opt==='以降の下り坂'||opt==='以降の直線'||opt==='以降のコーナー'||opt==='以降の最終コーナー'||opt==='指定地点で発動') range=[minPos, numOr(course.total,1200)];
  const candidates=(segs||[]).map(s=>[Math.max(numOr(s[0]), range[0]), Math.min(numOr(s[1]), range[1]), s]).filter(x=>x[1]>x[0]).sort((a,b)=>a[0]-b[0]);
  return candidates.length ? candidates[0][0] : null;
}
function lastSegmentStartFallback(segs){ return segs && segs.length ? numOr(segs[segs.length-1][0]) : null; }
function slopeAtFallback(d, course){
  for(const s of course.uphills||[]) if(d>=numOr(s[0]) && d<numOr(s[1])) return numOr(s[2],1);
  for(const s of course.downhills||[]) if(d>=numOr(s[0]) && d<numOr(s[1])) return -numOr(s[2],1);
  return 0;
}
function effectiveStatsFallback(state){
  const inputs=state.inputs||{}; const mood=MOOD_FALLBACK[inputs.mood]||1; const tr=TRACK_FALLBACK[inputs.trackCondition]||TRACK_FALLBACK['良'];
  const st={
    speed:numOr(inputs.stat_speed)+numOr(inputs.green_speed)+tr.speed,
    stamina:numOr(inputs.stat_stamina)+numOr(inputs.green_stamina),
    power:numOr(inputs.stat_power)+numOr(inputs.green_power)+tr.power,
    guts:numOr(inputs.stat_guts)+numOr(inputs.green_guts),
    wisdom:numOr(inputs.stat_wisdom)+numOr(inputs.green_wisdom)
  };
  for(const k of Object.keys(st)) st[k]=Math.max(1, Math.round(st[k]*mood));
  const course=state.course||{}; const bonus=inputs.courseBonus||'最大';
  const targets = bonus==='最大' ? [course.courseBonus1J, course.courseBonus2J].filter(Boolean) : [bonus];
  const map={'スピード':'speed','スタミナ':'stamina','パワー':'power','根性':'guts','賢さ':'wisdom'};
  for(const b of targets) if(map[b]) st[map[b]]=Math.round(st[map[b]]*1.04);
  return st;
}
function baseParamsFallback(state){
  const course=state.course||{}; const inputs=state.inputs||{}; const L=numOr(course.total,1200); const st=effectiveStatsFallback(state);
  const distApt=APT_FALLBACK[inputs.apt_distance]||1; const surfApt=APT_FALLBACK[inputs.apt_surface]||1; const style=STYLE_FALLBACK[inputs.style]||STYLE_FALLBACK['先行'];
  const baseSpeed=18.4 + Math.sqrt(Math.max(st.speed,1))/32 + (L>=2500 ? -0.25 : L<=1400 ? 0.20 : 0);
  const baseAccel=0.0006*Math.sqrt(500*Math.max(st.power,1))*surfApt*style.accel;
  const staminaRatio=Math.min(1.08, Math.max(0.78, st.stamina/(L*0.45+450)));
  const gutsBonus=Math.min(0.25, Math.sqrt(st.guts)/170);
  const wisdomStability=Math.min(0.08, Math.sqrt(st.wisdom)/600);
  return {st, baseAccel, targets:{
    early:baseSpeed*0.978*distApt*style.early,
    middle:baseSpeed*0.991*distApt*style.mid,
    late:baseSpeed*(1.235+gutsBonus)*distApt*style.final*Math.min(1,staminaRatio),
    last:baseSpeed*(1.265+gutsBonus+wisdomStability)*distApt*style.final*Math.min(1,staminaRatio)
  }};
}
function triggerPointFallback(skill, course){
  const L=numOr(course.total,1200); const v=numOr(skill.value,0); const p=phaseBoundsFallback(course); const tr=skill.triggerJ||''; const opt=skill.optionJ||'条件なし';
  if(tr==='スタート時') return {type:'distance', at:0};
  if(tr==='経過時間[s]') return {type:'time', at:v};
  if(tr==='走行距離[m]') return {type:'distance', at:Math.max(0, Math.min(L, baseOffsetFallback(opt,course)+v))};
  if(tr==='残り距離[m]') return {type:'distance', at:Math.max(0, Math.min(L, L-v))};
  if(tr==='地点[%]指定') return {type:'distance', at:Math.max(0, Math.min(L, L*v/100))};
  if(tr==='序盤のみ') return {type:'distance', at:p.early[0]};
  if(tr==='中盤のみ') return {type:'distance', at:p.middle[0]};
  if(tr==='終盤のみ') return {type:'distance', at:p.late[0]};
  if(tr==='最終盤のみ') return {type:'distance', at:p.last[0]};
  if(tr==='後半') return {type:'distance', at:L/2};
  if(tr==='コーナー最速') return {type:'distance', at:findFirstSegmentFallback(course.corners, opt, course, v)};
  if(tr==='直線最速') return {type:'distance', at:findFirstSegmentFallback(course.straights, opt, course, v)};
  if(tr==='上り坂最速') return {type:'distance', at:findFirstSegmentFallback(course.uphills, opt, course, v)};
  if(tr==='下り坂最速') return {type:'distance', at:findFirstSegmentFallback(course.downhills, opt, course, v)};
  if(tr==='終盤コーナー') return {type:'distance', at:findFirstSegmentFallback(course.corners, '条件なし', course, p.middle[1])};
  if(tr==='最終コーナー'||tr==='最終第3コーナー') return {type:'distance', at:lastSegmentStartFallback(course.corners)};
  if(tr==='終盤直線') return {type:'distance', at:findFirstSegmentFallback(course.straights, '条件なし', course, p.middle[1])};
  if(tr==='最終直線') return {type:'distance', at:lastSegmentStartFallback(course.straights)};
  return {type:'distance', at:null};
}
function prepareSkillsFallback(state){
  const course=state.course||{};
  return (state.skills||[]).filter(s=>s.enabled||s.premise).map((s,idx)=>{
    const tp=triggerPointFallback(s, course); const dur=Math.max(0, numOr(s.duration,3)*numOr(course.total,1200)/1000);
    return {...s, idx, target:numOr(s.target), accel:numOr(s.accel), instant:numOr(s.instant), stretch:numOr(s.stretch), duration:numOr(s.duration,3), triggerType:tp.type, triggerAt:tp.at, actualDuration:dur, activated:false, startTime:null, endTime:null};
  }).filter(s=>Number.isFinite(s.triggerAt));
}
function simulateFallback(state, withSkills){
  const course=state.course||{}; const params=baseParamsFallback(state); const inputs=state.inputs||{}; const L=numOr(course.total,1200);
  const dt=0.04; let t=0,d=0,v=3.0,guard=0; const points=[]; const events=[]; const skills=withSkills?prepareSkillsFallback(state):[];
  while(d<L && t<360 && guard<20000){
    guard++;
    const phase=phaseNameFallback(d, course); let target=params.targets[phase]||params.targets.middle; let accel=params.baseAccel*(phase==='early'?1.0:(phase==='middle'?1.02:1.04));
    const slope=slopeAtFallback(d, course); if(slope>0) target-=0.12*slope; if(slope<0) target+=0.05*Math.abs(slope);
    for(const s of skills){
      if(!s.activated && ((s.triggerType==='time' && t>=s.triggerAt) || (s.triggerType==='distance' && d>=s.triggerAt))){
        s.activated=true; s.startTime=t; s.endTime=t+s.actualDuration; events.push({name:s.nameKR||s.nameJ||'', time:t, distance:d}); if(s.instant) v+=s.instant;
      }
      if(s.activated && t<=s.endTime){ target+=(s.target||0)+(s.stretch||0)*0.15; accel+=(s.accel||0); }
    }
    const diff=target-v; if(diff>0) v+=Math.min(diff, accel*dt); else v+=Math.max(diff, -1.2*dt); v=Math.max(3.0,v);
    d+=v*dt; t+=dt;
    if(points.length===0 || t-points[points.length-1].t>=0.18 || d>=L) points.push({t,d:Math.min(d,L),v});
  }
  return {time:t, points, events};
}
function interpFallback(points, t){
  if(!points || !points.length) return null; if(t<=points[0].t) return points[0].v;
  for(let i=1;i<points.length;i++){ const a=points[i-1], b=points[i]; if(t<=b.t){ const k=(t-a.t)/(b.t-a.t||1); return a.v+(b.v-a.v)*k; }}
  return points[points.length-1].v;
}
function buildFallbackChart(state){
  const no=simulateFallback(state,false), yes=simulateFallback(state,true); const labels=[], skill=[], noskill=[];
  const maxT=Math.max(no.time, yes.time); const step=Math.max(0.18, maxT/240);
  for(let t=0;t<=maxT+1e-6;t+=step){ labels.push(Number(t.toFixed(2))); skill.push(Number(interpFallback(yes.points,t).toFixed(4))); noskill.push(Number(interpFallback(no.points,t).toFixed(4))); }
  if(labels[labels.length-1] < maxT){ labels.push(Number(maxT.toFixed(2))); skill.push(Number(interpFallback(yes.points,maxT).toFixed(4))); noskill.push(Number(interpFallback(no.points,maxT).toFixed(4))); }
  return {labels, skill, noskill, source:'fallback', fallbackTimes:{skill:yes.time, noskill:no.time}};
}
function buildFormulaChart(){
  const labels=[], skill=[], noskill=[];
  for(let r=2;r<=200;r++){
    const x=get('sim1','Y'+r); const y1=get('sim1','X'+r); const y0=get('sim2','X'+r);
    if(typeof x==='number' && x>=0 && x<9999){labels.push(Number(x.toFixed(3))); skill.push(typeof y1==='number'?y1:null); noskill.push(typeof y0==='number'?y0:null);}
  }
  return {labels, skill, noskill, source:'formula'};
}
function finiteNumberFromValue(v){
  if(typeof v === 'number' && Number.isFinite(v)) return v;
  if(typeof v === 'string'){
    const m = v.replace(/,/g,'').match(/-?\d+(?:\.\d+)?/);
    if(m){ const n = Number(m[0]); if(Number.isFinite(n)) return n; }
  }
  return null;
}
function isErrorLike(v){
  return v == null || v === '' || typeof v === 'object' || (typeof v === 'number' && !Number.isFinite(v));
}
function secondsDisplay(v, digits=3){
  if(typeof v === 'string' && /s\s*$/.test(v) && finiteNumberFromValue(v) !== null) return v;
  const n = finiteNumberFromValue(v);
  return n === null ? null : `${n.toFixed(digits)}s`;
}
function metersDisplay(v, digits=2){
  if(typeof v === 'string' && /m\s*$/.test(v) && finiteNumberFromValue(v) !== null) return v;
  const n = finiteNumberFromValue(v);
  return n === null ? null : `${n.toFixed(digits)}m`;
}
function plainNumberDisplay(v, digits=3){
  const n = finiteNumberFromValue(v);
  return n === null ? null : Number(n.toFixed(digits));
}
function buildFallbackSummary(state){
  const no = simulateFallback(state, false);
  const yes = simulateFallback(state, true);
  const timeDiff = Math.max(0, no.time - yes.time);
  const lastYes = yes.points && yes.points.length ? yes.points[yes.points.length - 1].v : null;
  const lastNo = no.points && no.points.length ? no.points[no.points.length - 1].v : null;
  const endSpeed = Number.isFinite(lastYes) ? lastYes : (Number.isFinite(lastNo) ? lastNo : 20);
  const meterDiff = timeDiff * endSpeed;
  const bodyDiff = meterDiff / 2.5;
  return {
    actualTime: `${yes.time.toFixed(3)}s`,
    noskillTime: `${no.time.toFixed(3)}s`,
    timeDiff: `${timeDiff.toFixed(3)}s`,
    bodyDiff: Number(bodyDiff.toFixed(3)),
    meterDiff: `${meterDiff.toFixed(2)}m`
  };
}
function firstDisplay(converters, fallback, ...refs){
  for(const [sheet, a1] of refs){
    const v = get(sheet, a1);
    for(const conv of converters){
      const d = conv(v);
      if(d !== null && d !== undefined && d !== '') return d;
    }
  }
  return fallback;
}
function buildResult(state={}){
  let chart = buildFormulaChart();
  let chartSource = 'formula';
  if(validChartPointCount(chart) < 8){ chart = buildFallbackChart(state); chartSource = 'fallback'; }
  const skillPositions=[];
  for(let i=0;i<49;i++){
    const pos=get('sim1','K'+(3+i));
    skillPositions.push(typeof pos === 'number' ? pos : null);
  }
  const fallbackSummary = buildFallbackSummary(state);
  const results = {
    actualTime: firstDisplay([secondsDisplay], fallbackSummary.actualTime, ['main','B29'], ['db','AL10']),
    noskillTime: firstDisplay([secondsDisplay], fallbackSummary.noskillTime, ['main','E29'], ['db','AL11']),
    timeDiff: firstDisplay([secondsDisplay], fallbackSummary.timeDiff, ['main','H29'], ['db','AL12']),
    bodyDiff: firstDisplay([v=>plainNumberDisplay(v,3)], fallbackSummary.bodyDiff, ['main','J29'], ['db','AL13']),
    meterDiff: firstDisplay([metersDisplay], fallbackSummary.meterDiff, ['main','N29'], ['db','AL14']),
    eff_speed: firstDisplay([v=>plainNumberDisplay(v,0)], null, ['db','AL3']),
    eff_stamina: firstDisplay([v=>plainNumberDisplay(v,0)], null, ['db','AL4']),
    eff_power: firstDisplay([v=>plainNumberDisplay(v,0)], null, ['db','AL5']),
    eff_guts: firstDisplay([v=>plainNumberDisplay(v,0)], null, ['db','AL6']),
    eff_wisdom: firstDisplay([v=>plainNumberDisplay(v,0)], null, ['db','AL7'])
  };
  const formulaMashinOk = !isErrorLike(get('main','B29')) && !isErrorLike(get('main','E29')) && !isErrorLike(get('main','H29')) && !isErrorLike(get('main','J29')) && !isErrorLike(get('main','N29'));
  return {
    results,
    resultSource: formulaMashinOk ? 'formula' : 'fallback',
    chart,
    chartSource,
    chartPointCount: validChartPointCount(chart),
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
    const result = buildResult(state);
    sendStatus(94, '그래프 데이터를 전송 중…');
    postMessage({type:'result', requestId, result, ms: performance.now()-t0, formulaCount: DATA.workbook.formulaCount});
  }catch(e){ sendError(e, requestId); }
}

self.onmessage = (event)=>{
  const msg = event.data || {};
  if(msg.type === 'init') init();
  else if(msg.type === 'run') run(msg.requestId, msg.state || {});
};
