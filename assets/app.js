'use strict';

const DATA = window.UMA_UI_DATA;
const $ = (id)=>document.getElementById(id);
const qsa = (sel)=>Array.from(document.querySelectorAll(sel));

let chart = null;
let skillRowCount = 0;
let formulaWorker = null;
let workerReady = false;
let currentRequestId = 0;
let running = false;
let dirty = false;
let lastWorkerMs = 0;
let lastResult = null;

function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function tr(s){return DATA.translations[s]||s||''}
function fmt(v, digits=3){if(v==null||v===''||typeof v==='object'||Number.isNaN(v))return '-'; if(typeof v==='number')return v.toFixed(digits); return String(v)}
function option(list, selected){return list.map(x=>`<option value="${esc(x.ja)}" ${x.ja===selected?'selected':''}>${esc(x.kr)}${x.kr!==x.ja?' · '+esc(x.ja):''}</option>`).join('')}

function setProgress(percent, text, active=false){
  const fill = $('progressFill');
  const label = $('progressText');
  const box = $('runStatus');
  if(fill){
    fill.style.width = `${Math.max(0, Math.min(100, Number(percent)||0))}%`;
    fill.classList.toggle('indeterminate', !!active && percent < 100);
  }
  if(label) label.textContent = text || '';
  if(box) box.classList.toggle('active', !!active);
}
function setFormulaStatus(html){ $('formulaStatus').innerHTML = html; }
function setRunning(on){
  running = on;
  $('runBtn').disabled = on || !workerReady;
  $('runBtn').textContent = on ? '계산 중…' : (dirty ? '시뮬레이션 실행 *' : '시뮬레이션 실행');
  document.body.classList.toggle('is-running', on);
}
function markDirty(reason='입력 변경됨 · 시뮬레이션 실행을 눌러 반영하세요'){
  if(running) return;
  dirty = true;
  $('runBtn').textContent = '시뮬레이션 실행 *';
  setProgress(0, reason, false);
  setFormulaStatus(`<span class="status-warn">대기 중</span> · ${esc(reason)}`);
}

function fillSelects(){
  $('apt_distance').innerHTML=option(DATA.lists.apt,'S');
  $('apt_surface').innerHTML=option(DATA.lists.apt,'A');
  $('mood').innerHTML=option(DATA.lists.mood,'絶好調');
  $('style').innerHTML=option(DATA.lists.style,'先行');
  $('trackCondition').innerHTML=option(DATA.lists.track,'良');
  const byVenue={}; DATA.courses.forEach(c=>{(byVenue[c.venueJ] ||= []).push(c)});
  $('venue').innerHTML=Object.keys(byVenue).map(v=>`<option value="${esc(v)}">${esc(tr(v))}</option>`).join('');
  $('venue').value='東京'; updateCourseOptions();
  $('skillList').innerHTML=DATA.skills.map(s=>`<option value="${esc(s.kr)}" data-ja="${esc(s.ja)}">${esc(s.label)}</option>`).join('');
}
function updateCourseOptions(preferredId){
  const v=$('venue').value;
  const old = preferredId || $('course').value;
  const list=DATA.courses.filter(c=>c.venueJ===v);
  $('course').innerHTML=list.map(c=>`<option value="${esc(c.id)}">${esc(c.distance)} · ${esc(c.distanceType)} · ${esc(c.surface)} · ${esc(c.turn)}</option>`).join('');
  if(list.some(c=>c.id===old)) $('course').value=old;
  else {
    const tokyo=list.find(c=>c.distanceJ==='芝2400m');
    $('course').value=(tokyo||list[0]||{}).id || '';
  }
  renderCourseInfo();
}
function currentCourse(){return DATA.courses.find(c=>c.id===$('course').value) || DATA.courses[0]}
function renderCourseInfo(){
  const c=currentCourse(); if(!c) return;
  $('courseTitle').textContent=`${c.venue}/${c.distance} (${c.distanceType})/${c.turn}`;
  $('courseMeta').textContent=`${c.surface} · ${c.total}m · 코스보정 ${c.courseBonus1||'-'} ${c.courseBonus2||''}`;
  const segTable=(arr,withK=false)=>arr.length?arr.map((s,i)=>`<tr><td>${i+1}</td><td>${s[0]}m ~ ${s[1]}m</td>${withK?`<td>${s[2]}</td>`:''}</tr>`).join(''):'<tr><td colspan="3">-</td></tr>';
  $('cornerRows').innerHTML=segTable(c.corners);
  $('straightRows').innerHTML=segTable(c.straights);
  $('uphillRows').innerHTML=segTable(c.uphills,true);
  $('downhillRows').innerHTML=segTable(c.downhills,true);
}

function addSkillRow(s={}){
  skillRowCount++;
  const trEl=document.createElement('tr');
  trEl.innerHTML=`<td>${skillRowCount}</td><td><input type="checkbox" data-k="enabled" ${s.enabled?'checked':''}></td><td><input type="checkbox" data-k="premise" ${s.premise?'checked':''}></td><td><select data-k="kindJ">${option(DATA.lists.kind,s.kindJ||'通常')}</select></td><td class="name"><input data-k="nameKR" list="skillList" value="${esc(s.nameKR||tr(s.nameJ)||'')}" placeholder="스킬명"></td><td><input data-k="target" type="number" step="0.001" value="${s.target??''}"></td><td><input data-k="accel" type="number" step="0.001" value="${s.accel??''}"></td><td><input data-k="instant" type="number" step="0.001" value="${s.instant??''}"></td><td><input data-k="stretch" type="number" step="0.001" value="${s.stretch??''}"></td><td><input data-k="duration" type="number" step="0.1" value="${s.duration??''}"></td><td><select data-k="triggerJ">${option(DATA.lists.trigger,s.triggerJ||'')}</select></td><td><input data-k="value" type="number" step="0.1" value="${s.value??''}"></td><td><select data-k="optionJ">${option(DATA.lists.option,s.optionJ||'')}</select></td><td class="small result">-</td>`;
  $('skillRows').appendChild(trEl);
  return trEl;
}
function fillSkillJa(tr){
  const input = tr.querySelector('[data-k=nameKR]');
  if(!input) return;
  const name=input.value.trim();
  const found=DATA.skills.find(s=>s.kr===name||s.ja===name||s.label===name);
  tr.dataset.nameJ=found?found.ja:name;
}
function readSkills(){
  return qsa('#skillRows tr').map(tr=>{
    fillSkillJa(tr);
    const g=k=>tr.querySelector(`[data-k=${k}]`);
    return {enabled:g('enabled').checked,premise:g('premise').checked,kindJ:g('kindJ').value,nameKR:g('nameKR').value.trim(),nameJ:tr.dataset.nameJ||g('nameKR').value.trim(),target:g('target').value,accel:g('accel').value,instant:g('instant').value,stretch:g('stretch').value,duration:g('duration').value,triggerJ:g('triggerJ').value,value:g('value').value,optionJ:g('optionJ').value};
  }).filter(s=>s.nameKR||s.target||s.accel||s.instant||s.stretch||s.duration);
}
function loadDefaults(){ $('skillRows').innerHTML=''; skillRowCount=0; DATA.defaultSkills.forEach(addSkillRow); for(let i=DATA.defaultSkills.length;i<12;i++) addSkillRow({kindJ:'通常'}); }
function clearSkills(){ $('skillRows').innerHTML=''; skillRowCount=0; for(let i=0;i<12;i++) addSkillRow({kindJ:'通常'}); }

function collectState(){
  return {
    inputs: Object.fromEntries(qsa('[data-save]').map(el=>[el.id,el.value])),
    course: currentCourse(),
    skills: readSkills().slice(0,49)
  };
}

function createWorker(){
  setProgress(4, '계산 워커 시작 중…', true);
  setFormulaStatus(`<span class="status-warn">초기화 중</span> · 수식 계산을 별도 Worker로 분리하는 중`);
  formulaWorker = new Worker('assets/formula-worker.js');
  formulaWorker.onmessage = (event)=>{
    const msg = event.data || {};
    if(msg.type === 'status'){
      setProgress(msg.progress ?? 0, msg.text || '처리 중…', msg.active !== false);
      if(msg.text) setFormulaStatus(`<span class="status-warn">처리 중</span> · ${esc(msg.text)}`);
      return;
    }
    if(msg.type === 'ready'){
      workerReady = true;
      setRunning(false);
      setProgress(0, '준비 완료 · 실행 버튼을 누르면 계산합니다', false);
      setFormulaStatus(`<span class="status-ok">수식 엔진 준비 완료</span> · Worker 분리 · formulas ${Number(msg.formulaCount||DATA.formulaInfo.formulaCount).toLocaleString('ko-KR')}개`);
      run();
      return;
    }
    if(msg.type === 'result'){
      if(msg.requestId !== currentRequestId) return;
      lastWorkerMs = msg.ms || 0;
      lastResult = msg.result;
      dirty = false;
      applyResult(msg.result, msg.ms, msg.formulaCount);
      setProgress(100, `완료 · ${Math.round(msg.ms || 0)}ms`, false);
      setRunning(false);
      return;
    }
    if(msg.type === 'error'){
      console.error('Worker error', msg);
      setRunning(false);
      setProgress(0, '계산 오류', false);
      setFormulaStatus(`<span class="status-bad">계산 오류</span> ${esc(msg.message||'알 수 없는 오류')}`);
    }
  };
  formulaWorker.onerror = (event)=>{
    console.error(event);
    workerReady = false;
    setRunning(false);
    setProgress(0, '워커 로드 실패', false);
    setFormulaStatus(`<span class="status-bad">워커 로드 실패</span> ${esc(event.message||'assets/formula-worker.js 확인 필요')}`);
  };
  formulaWorker.postMessage({type:'init'});
}

function run(){
  if(!workerReady){
    setProgress(8, '수식 엔진 준비 중… 잠시 후 자동 실행됩니다', true);
    return;
  }
  if(running) return;
  currentRequestId++;
  setRunning(true);
  setProgress(8, '입력값 수집 중…', true);
  const state = collectState();
  setProgress(12, '계산 요청 전송 중…', true);
  formulaWorker.postMessage({type:'run', requestId:currentRequestId, state});
}

function applyResult(result, ms, formulaCount){
  const r = result.results || {};
  $('actualTime').textContent=fmt(r.actualTime,3);
  $('noskillTime').textContent=fmt(r.noskillTime,3);
  $('timeDiff').textContent=fmt(r.timeDiff,3);
  $('bodyDiff').textContent=fmt(r.bodyDiff,3);
  $('meterDiff').textContent=fmt(r.meterDiff,3);
  $('eff_speed').textContent=fmt(r.eff_speed,0);
  $('eff_stamina').textContent=fmt(r.eff_stamina,0);
  $('eff_power').textContent=fmt(r.eff_power,0);
  $('eff_guts').textContent=fmt(r.eff_guts,0);
  $('eff_wisdom').textContent=fmt(r.eff_wisdom,0);
  setFormulaStatus(`<span class="status-ok">수식 엔진 ON</span> · Worker 분리 계산 · formulas ${Number(formulaCount||DATA.formulaInfo.formulaCount).toLocaleString('ko-KR')}개 · 최근 ${Math.round(ms||0)}ms`);
  renderCourseInfo();
  renderChart(result.chart || {labels:[],skill:[],noskill:[]});
  updateSkillPreviewValues(result.skillPositions || []);
}

function renderChart(chartData){
  const ctx=$('chart').getContext('2d');
  const data={labels:chartData.labels||[],datasets:[{label:'스킬 없음',data:chartData.noskill||[],borderColor:'#ef4444',backgroundColor:'transparent',pointRadius:0,borderWidth:2,tension:0},{label:'스킬 있음',data:chartData.skill||[],borderColor:'#4f74ff',backgroundColor:'transparent',pointRadius:0,borderWidth:2,tension:0}]};
  if(chart){chart.data=data; chart.update('none'); return;}
  chart=new Chart(ctx,{type:'line',data,options:{responsive:true,maintainAspectRatio:false,animation:false,normalized:true,interaction:{mode:'index',intersect:false},plugins:{legend:{position:'top'},tooltip:{callbacks:{title:items=>`시간 ${items[0].label}s`,label:i=>`${i.dataset.label}: ${Number(i.parsed.y).toFixed(3)} m/s`}}},scales:{x:{title:{display:true,text:'경과시간[s]'},ticks:{maxTicksLimit:12}},y:{title:{display:true,text:'주행속도[m/s]'},min:14}}}});
}
function updateSkillPreviewValues(positions){
  qsa('#skillRows tr').forEach((tr,i)=>{
    const pos=positions[i];
    const cell=tr.querySelector('.result');
    if(cell) cell.textContent=typeof pos==='number'?`${pos.toFixed(1)}m`:'';
  });
}

function saveJSON(){
  const state={inputs:Object.fromEntries(qsa('[data-save]').map(el=>[el.id,el.value])), skills:readSkills()};
  const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='uma-simulator-settings.json'; a.click(); URL.revokeObjectURL(a.href);
}
function loadJSON(file){
  const reader=new FileReader();
  reader.onload=()=>{
    const st=JSON.parse(reader.result);
    for(const [id,val] of Object.entries(st.inputs||{})){if($(id)) $(id).value=val}
    updateCourseOptions(st.inputs?.course);
    $('skillRows').innerHTML=''; skillRowCount=0;
    (st.skills||[]).forEach(addSkillRow);
    if(!st.skills || !st.skills.length) clearSkills();
    markDirty('JSON 불러오기 완료 · 실행 버튼을 눌러 계산하세요');
  };
  reader.readAsText(file);
}

function bindEvents(){
  document.addEventListener('input', e=>{
    const el=e.target;
    if(!el.matches('input,select') || el.id==='loadJson') return;
    if(el.dataset.k==='nameKR') fillSkillJa(el.closest('tr'));
    markDirty();
  });
  document.addEventListener('change', e=>{
    const el=e.target;
    if(!el.matches('input,select') || el.id==='loadJson') return;
    if(el.id==='venue') updateCourseOptions();
    if(el.id==='course') renderCourseInfo();
    if(el.dataset.k==='nameKR') fillSkillJa(el.closest('tr'));
    markDirty();
  });
  $('runBtn').onclick=run;
  $('addSkill').onclick=()=>{addSkillRow({kindJ:'通常'}); markDirty('스킬 행 추가됨 · 실행 버튼을 눌러 계산하세요');};
  $('clearSkills').onclick=()=>{clearSkills(); markDirty('스킬 초기화됨 · 실행 버튼을 눌러 계산하세요');};
  $('loadDefault').onclick=()=>{loadDefaults(); markDirty('기본 예시 로드됨 · 실행 버튼을 눌러 계산하세요');};
  $('saveJson').onclick=saveJSON;
  $('loadJson').addEventListener('change',e=>{if(e.target.files[0])loadJSON(e.target.files[0])});
  document.addEventListener('keydown', e=>{
    if((e.ctrlKey || e.metaKey) && e.key === 'Enter') run();
  });
}

function boot(){
  try{
    fillSelects();
    loadDefaults();
    bindEvents();
    renderCourseInfo();
    $('runBtn').disabled = true;
    createWorker();
  }catch(e){
    console.error(e);
    setProgress(0, '초기화 실패', false);
    setFormulaStatus(`<span class="status-bad">초기화 실패</span> ${esc(e.message||e)}`);
  }
}

document.addEventListener('DOMContentLoaded', boot);
