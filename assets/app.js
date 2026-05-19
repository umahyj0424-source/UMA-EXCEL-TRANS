
'use strict';
const DATA = window.UMA_XLSX_DATA;
const $ = (id)=>document.getElementById(id);
const qsa = (sel)=>Array.from(document.querySelectorAll(sel));
let hf=null, sheetIds={}, chart=null, skillRowCount=0, lastError=null;
function tr(s){return DATA.translations[s]||s||''}
function option(list, selected){return list.map(x=>`<option value="${esc(x.ja)}" ${x.ja===selected?'selected':''}>${esc(x.kr)}${x.kr!==x.ja?' · '+esc(x.ja):''}</option>`).join('')}
function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function colToIdx(col){let n=0;for(const ch of col){n=n*26+(ch.charCodeAt(0)-64)}return n-1}
function addr(sheet, a1){const m=/^([A-Z]+)(\d+)$/.exec(a1);return {sheet:sheetIds[sheet], col:colToIdx(m[1]), row:Number(m[2])-1}}
function get(sheet, a1){try{return hf.getCellValue(addr(sheet,a1))}catch(e){return null}}
function set(sheet, a1, val){try{hf.setCellContents(addr(sheet,a1), [[val===''?null:val]])}catch(e){lastError=e;console.error('set failed',sheet,a1,val,e)}}
function fmt(v, digits=3){if(v==null||v===''||typeof v==='object')return '-'; if(typeof v==='number')return v.toFixed(digits); return String(v)}
function initHF(){
  if(!window.HyperFormula) throw new Error('HyperFormula CDN을 불러오지 못했습니다. 인터넷 연결 또는 CDN 차단을 확인하세요.');
  hf = HyperFormula.buildFromSheets(DATA.workbook.sheets, { licenseKey:'gpl-v3', useArrayArithmetic:true, useColumnIndex:true, nullYear:30 });
  for(const name of DATA.workbook.sheetNames){ sheetIds[name]=hf.getSheetId(name); }
}
function fillSelects(){
  $('apt_distance').innerHTML=option(DATA.lists.apt,'S'); $('apt_surface').innerHTML=option(DATA.lists.apt,'A'); $('mood').innerHTML=option(DATA.lists.mood,'絶好調'); $('style').innerHTML=option(DATA.lists.style,'先行'); $('trackCondition').innerHTML=option(DATA.lists.track,'良');
  const byVenue={}; DATA.courses.forEach(c=>{(byVenue[c.venueJ] ||= []).push(c)});
  $('venue').innerHTML=Object.keys(byVenue).map(v=>`<option value="${esc(v)}">${esc(tr(v))}</option>`).join('');
  $('venue').value='東京'; updateCourseOptions();
  $('skillList').innerHTML=DATA.skills.map(s=>`<option value="${esc(s.kr)}" data-ja="${esc(s.ja)}">${esc(s.label)}</option>`).join('');
}
function updateCourseOptions(){const v=$('venue').value; const list=DATA.courses.filter(c=>c.venueJ===v); $('course').innerHTML=list.map(c=>`<option value="${esc(c.id)}">${esc(c.distance)} · ${esc(c.distanceType)} · ${esc(c.surface)} · ${esc(c.turn)}</option>`).join(''); const tokyo=list.find(c=>c.distanceJ==='芝2400m'); if(tokyo) $('course').value=tokyo.id;}
function currentCourse(){return DATA.courses.find(c=>c.id===$('course').value) || DATA.courses[0]}
function syncInputsToWorkbook(){
  set('main','D9',num($('stat_speed').value)); set('main','G9',num($('green_speed').value));
  set('main','D11',num($('stat_stamina').value)); set('main','G11',num($('green_stamina').value));
  set('main','D13',num($('stat_power').value)); set('main','G13',num($('green_power').value));
  set('main','D15',num($('stat_guts').value)); set('main','G15',num($('green_guts').value));
  set('main','D17',num($('stat_wisdom').value)); set('main','G17',num($('green_wisdom').value));
  set('main','M9',$('apt_distance').value); set('main','M11',$('apt_surface').value); set('main','M13',$('mood').value); set('main','M15',$('style').value); set('main','M17',$('courseBonus').value);
  const c=currentCourse(); set('main','B23',c.venueJ); set('main','G23',c.distanceJ); set('main','M23',$('trackCondition').value);
  // reset skill rows 29:77
  for(let r=29;r<=77;r++){ for(const col of ['Q','R','S','V','Z','AB','AD','AF','AH','AJ','AM','AO']) set('main',col+r,null); }
  readSkills().slice(0,49).forEach((s,i)=>{const r=29+i; set('main','Q'+r,!!s.enabled); set('main','R'+r,!!s.premise); set('main','S'+r,s.kindJ||'通常'); set('main','V'+r,s.nameJ||s.nameKR||''); setNumOrBlank('Z'+r,s.target); setNumOrBlank('AB'+r,s.accel); setNumOrBlank('AD'+r,s.instant); setNumOrBlank('AF'+r,s.stretch); setNumOrBlank('AH'+r,s.duration); set('main','AJ'+r,s.triggerJ||''); setNumOrBlank('AM'+r,s.value); set('main','AO'+r,s.optionJ||''); });
}
function setNumOrBlank(a1,v){set('main',a1,(v===''||v==null||Number.isNaN(Number(v)))?null:Number(v))}
function num(v){const n=Number(v);return Number.isFinite(n)?n:0}
function renderResults(){
  $('actualTime').textContent=fmt(get('main','B29'),3); $('noskillTime').textContent=fmt(get('main','E29'),3); $('timeDiff').textContent=fmt(get('main','H29'),3); $('bodyDiff').textContent=fmt(get('main','J29'),3); $('meterDiff').textContent=fmt(get('main','N29'),3);
  for(const [id,cell] of [['eff_speed','AL3'],['eff_stamina','AL4'],['eff_power','AL5'],['eff_guts','AL6'],['eff_wisdom','AL7']]) $(id).textContent=fmt(get('db',cell),0);
  $('formulaStatus').innerHTML=`<span class="status-ok">수식 엔진 ON</span> · ${DATA.meta.formulaMode} · formulas ${DATA.workbook.formulaCount.toLocaleString('ko-KR')}개`;
  renderCourseInfo(); renderChart(); updateSkillPreviewValues();
}
function renderCourseInfo(){const c=currentCourse(); $('courseTitle').textContent=`${c.venue}/${c.distance} (${c.distanceType})/${c.turn}`; $('courseMeta').textContent=`${c.surface} · ${c.total}m · 코스보정 ${c.courseBonus1||'-'} ${c.courseBonus2||''}`; const segTable=(arr,withK=false)=>arr.length?arr.map((s,i)=>`<tr><td>${i+1}</td><td>${s[0]}m ~ ${s[1]}m</td>${withK?`<td>${s[2]}</td>`:''}</tr>`).join(''):'<tr><td colspan="3">-</td></tr>'; $('cornerRows').innerHTML=segTable(c.corners); $('straightRows').innerHTML=segTable(c.straights); $('uphillRows').innerHTML=segTable(c.uphills,true); $('downhillRows').innerHTML=segTable(c.downhills,true);}
function renderChart(){
  const labels=[], skill=[], noskill=[];
  for(let r=2;r<=126;r++){ const x=get('sim1','Y'+r); const y1=get('sim1','X'+r); const y0=get('sim2','X'+r); if(typeof x==='number' && x>=0 && x<9999){labels.push(Number(x.toFixed(3))); skill.push(typeof y1==='number'?y1:null); noskill.push(typeof y0==='number'?y0:null);} }
  const ctx=$('chart').getContext('2d');
  const data={labels,datasets:[{label:'스킬 없음',data:noskill,borderColor:'#ef4444',backgroundColor:'transparent',pointRadius:0,borderWidth:2,tension:0},{label:'스킬 있음',data:skill,borderColor:'#4f74ff',backgroundColor:'transparent',pointRadius:0,borderWidth:2,tension:0}]};
  if(chart){chart.data=data; chart.update('none'); return;}
  chart=new Chart(ctx,{type:'line',data,options:{responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:'index',intersect:false},plugins:{legend:{position:'top'},tooltip:{callbacks:{title:items=>`시간 ${items[0].label}s`,label:i=>`${i.dataset.label}: ${Number(i.parsed.y).toFixed(3)} m/s`}}},scales:{x:{title:{display:true,text:'경과시간[s]'},ticks:{maxTicksLimit:12}},y:{title:{display:true,text:'주행속도[m/s]'},min:14}}}});
}
function addSkillRow(s={}){skillRowCount++; const trEl=document.createElement('tr'); trEl.innerHTML=`<td>${skillRowCount}</td><td><input type="checkbox" data-k="enabled" ${s.enabled?'checked':''}></td><td><input type="checkbox" data-k="premise" ${s.premise?'checked':''}></td><td><select data-k="kindJ">${option(DATA.lists.kind,s.kindJ||'通常')}</select></td><td class="name"><input data-k="nameKR" list="skillList" value="${esc(s.nameKR||tr(s.nameJ)||'')}" placeholder="스킬명"></td><td><input data-k="target" type="number" step="0.001" value="${s.target??''}"></td><td><input data-k="accel" type="number" step="0.001" value="${s.accel??''}"></td><td><input data-k="instant" type="number" step="0.001" value="${s.instant??''}"></td><td><input data-k="stretch" type="number" step="0.001" value="${s.stretch??''}"></td><td><input data-k="duration" type="number" step="0.1" value="${s.duration??''}"></td><td><select data-k="triggerJ">${option(DATA.lists.trigger,s.triggerJ||'')}</select></td><td><input data-k="value" type="number" step="0.1" value="${s.value??''}"></td><td><select data-k="optionJ">${option(DATA.lists.option,s.optionJ||'')}</select></td><td class="small result">-</td>`; $('skillRows').appendChild(trEl); trEl.addEventListener('change',e=>{if(e.target.dataset.k==='nameKR') fillSkillJa(trEl);}); return trEl;}
function fillSkillJa(tr){const name=tr.querySelector('[data-k=nameKR]').value.trim(); const found=DATA.skills.find(s=>s.kr===name||s.ja===name||s.label===name); tr.dataset.nameJ=found?found.ja:name;}
function readSkills(){return qsa('#skillRows tr').map(tr=>{fillSkillJa(tr); const g=k=>tr.querySelector(`[data-k=${k}]`); return {enabled:g('enabled').checked,premise:g('premise').checked,kindJ:g('kindJ').value,nameKR:g('nameKR').value.trim(),nameJ:tr.dataset.nameJ||g('nameKR').value.trim(),target:g('target').value,accel:g('accel').value,instant:g('instant').value,stretch:g('stretch').value,duration:g('duration').value,triggerJ:g('triggerJ').value,value:g('value').value,optionJ:g('optionJ').value};}).filter(s=>s.nameKR||s.target||s.accel||s.instant||s.stretch||s.duration);}
function loadDefaults(){ $('skillRows').innerHTML=''; skillRowCount=0; DATA.defaultSkills.forEach(addSkillRow); for(let i=DATA.defaultSkills.length;i<12;i++) addSkillRow({kindJ:'通常'}); }
function clearSkills(){ $('skillRows').innerHTML=''; skillRowCount=0; for(let i=0;i<12;i++) addSkillRow({kindJ:'通常'}); }
function updateSkillPreviewValues(){qsa('#skillRows tr').forEach((tr,i)=>{const r=3+i; const pos=get('sim1','K'+r); const cell=tr.querySelector('.result'); if(cell) cell.textContent=typeof pos==='number'?`${pos.toFixed(1)}m`:'';});}
function run(){try{lastError=null; syncInputsToWorkbook(); renderResults();}catch(e){lastError=e; console.error(e); $('formulaStatus').innerHTML=`<span class="status-bad">계산 오류</span> ${esc(e.message||e)}`;}}
function saveJSON(){const state={inputs:Object.fromEntries(qsa('[data-save]').map(el=>[el.id,el.value])), skills:readSkills()}; const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='uma-simulator-settings.json'; a.click(); URL.revokeObjectURL(a.href)}
function loadJSON(file){const reader=new FileReader(); reader.onload=()=>{const st=JSON.parse(reader.result); for(const [id,val] of Object.entries(st.inputs||{})){if($(id)) $(id).value=val} updateCourseOptions(); $('skillRows').innerHTML=''; skillRowCount=0; (st.skills||[]).forEach(addSkillRow); run();}; reader.readAsText(file)}
function boot(){try{initHF(); fillSelects(); loadDefaults(); qsa('input,select').forEach(el=>el.addEventListener('change',()=>{if(el.id==='venue')updateCourseOptions(); run();})); $('runBtn').onclick=run; $('addSkill').onclick=()=>addSkillRow({kindJ:'通常'}); $('clearSkills').onclick=()=>{clearSkills();run()}; $('loadDefault').onclick=()=>{loadDefaults();run()}; $('saveJson').onclick=saveJSON; $('loadJson').addEventListener('change',e=>{if(e.target.files[0])loadJSON(e.target.files[0])}); run();}catch(e){console.error(e); $('formulaStatus').innerHTML=`<span class="status-bad">초기화 실패</span> ${esc(e.message||e)}`;}}
document.addEventListener('DOMContentLoaded', boot);
