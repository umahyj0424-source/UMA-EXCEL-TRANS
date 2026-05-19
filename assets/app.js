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


const SKILL_AUTOFILL_VERSION = 'mashinfix1';
const KNOWN_GOLD_SKILLS = new Set([
  '全身全霊','ハヤテ一文字','弧線のプロフェッサー','曲線のソムリエ','一陣の風','スプリントターボ','乗り換え上手','昇り龍','迫る影','電光石火','豪脚','鍔迫り合い','ノンストップガール','先手必勝','脱出術','アンストッパブル','キラーチューン','強攻策','円弧のマエストロ','好転一息','食いしん坊','クールダウン','リラックス','潜伏態勢','眠れる獅子','慧眼','独占力','魅惑のささやき','逃亡者','コンセントレーション','盤石の構え','トップランナー','先陣の心得','怪物','優位形成','機先の勝負','王手','起死回生','大胆不敵','切り開く者','神速'
]);
const KNOWN_UNIQUE_SKILLS = new Set([
  '勝利の鼓動','アングリング×スキーミング','レッツ・アナボリック！','紅焔ギア/LP1211-M','彼方、その先へ…','ヴィクトリーショット！','シューティングスター','プランチャ☆ガナドール','究極テイオーステップ','汝、皇帝の神威を見よ','先頭の景色は譲らない…！','アモアイ固有／中盤','アモアイ固有／終盤'
]);
const EXACT_SKILL_PRESETS = {
  'アモアイ固有／中盤': {kindJ:'固有Lv.5', target:'', accel:'', instant:0.65, stretch:'', duration:3, triggerJ:'コーナー最速', value:'', optionJ:'中盤のみ'},
  'アモアイ固有／終盤': {kindJ:'固有Lv.5', target:'', accel:'', instant:'', stretch:0.4, duration:2, triggerJ:'走行距離[m]', value:100, optionJ:'基準:最終盤開始'},
  '아모아이 고유/중반': {kindJ:'固有Lv.5', target:'', accel:'', instant:0.65, stretch:'', duration:3, triggerJ:'コーナー最速', value:'', optionJ:'中盤のみ'},
  '아모아이 고유/종반': {kindJ:'固有Lv.5', target:'', accel:'', instant:'', stretch:0.4, duration:2, triggerJ:'走行距離[m]', value:100, optionJ:'基準:最終盤開始'},
  'ウマ好み': {kindJ:'通常', target:0.15, accel:'', instant:'', stretch:'', duration:3, triggerJ:'経過時間[s]', value:5, optionJ:'基準:スタート'},
  '우마무스메 애호가': {kindJ:'通常', target:0.15, accel:'', instant:'', stretch:'', duration:3, triggerJ:'経過時間[s]', value:5, optionJ:'基準:スタート'},
  'いいとこ入った！': {kindJ:'通常', target:0.15, accel:'', instant:'', stretch:'', duration:3, triggerJ:'走行距離[m]', value:0, optionJ:'基準:中盤開始'},
  '좋은 데에 들어왔어!': {kindJ:'通常', target:0.15, accel:'', instant:'', stretch:'', duration:3, triggerJ:'走行距離[m]', value:0, optionJ:'基準:中盤開始'},
  '尻尾上がり': {kindJ:'通常', target:0.15, accel:'', instant:'', stretch:'', duration:3, triggerJ:'中盤のみ', value:'', optionJ:'最速'},
  '꼬리 올리기': {kindJ:'通常', target:0.15, accel:'', instant:'', stretch:'', duration:3, triggerJ:'中盤のみ', value:'', optionJ:'最速'},
  '遊びはおしまいっ！': {kindJ:'通常', target:0.15, accel:'', instant:'', stretch:'', duration:3, triggerJ:'走行距離[m]', value:0, optionJ:'基準:中盤開始'},
  '장난은 끝이야!': {kindJ:'通常', target:0.15, accel:'', instant:'', stretch:'', duration:3, triggerJ:'走行距離[m]', value:0, optionJ:'基準:中盤開始'},
  'スリップストリーム': {kindJ:'通常', target:0.15, accel:'', instant:'', stretch:'', duration:3, triggerJ:'走行距離[m]', value:0, optionJ:'基準:中盤開始'},
  '슬립 스트림': {kindJ:'通常', target:0.15, accel:'', instant:'', stretch:'', duration:3, triggerJ:'走行距離[m]', value:0, optionJ:'基準:中盤開始'},
  '直線加速': {kindJ:'通常', target:'', accel:0.2, instant:'', stretch:'', duration:3, triggerJ:'直線最速', value:'', optionJ:'条件なし'},
  '직선 가속': {kindJ:'通常', target:'', accel:0.2, instant:'', stretch:'', duration:3, triggerJ:'直線最速', value:'', optionJ:'条件なし'},
  'コーナー加速○': {kindJ:'通常', target:'', accel:0.2, instant:'', stretch:'', duration:3, triggerJ:'コーナー最速', value:'', optionJ:'条件なし'},
  '코너 가속○': {kindJ:'通常', target:'', accel:0.2, instant:'', stretch:'', duration:3, triggerJ:'コーナー最速', value:'', optionJ:'条件なし'},
  '直線巧者': {kindJ:'通常', target:0.15, accel:'', instant:'', stretch:'', duration:3, triggerJ:'直線最速', value:'', optionJ:'条件なし'},
  '직선 달인': {kindJ:'通常', target:0.15, accel:'', instant:'', stretch:'', duration:3, triggerJ:'直線最速', value:'', optionJ:'条件なし'},
  'ハヤテ一文字': {kindJ:'レア/進化', target:0.35, accel:'', instant:'', stretch:'', duration:3, triggerJ:'直線最速', value:'', optionJ:'条件なし'},
  '한줄기 질풍': {kindJ:'レア/進化', target:0.35, accel:'', instant:'', stretch:'', duration:3, triggerJ:'直線最速', value:'', optionJ:'条件なし'},
  'コーナー巧者○': {kindJ:'通常', target:0.15, accel:'', instant:'', stretch:'', duration:3, triggerJ:'コーナー最速', value:'', optionJ:'条件なし'},
  '코너 달인○': {kindJ:'通常', target:0.15, accel:'', instant:'', stretch:'', duration:3, triggerJ:'コーナー最速', value:'', optionJ:'条件なし'},
  '弧線のプロフェッサー': {kindJ:'レア/進化', target:0.35, accel:'', instant:'', stretch:'', duration:3, triggerJ:'コーナー最速', value:'', optionJ:'条件なし'},
  '호선의 프로페서': {kindJ:'レア/進化', target:0.35, accel:'', instant:'', stretch:'', duration:3, triggerJ:'コーナー最速', value:'', optionJ:'条件なし'},
  '末脚': {kindJ:'通常', target:0.15, accel:'', instant:'', stretch:'', duration:2.4, triggerJ:'終盤のみ', value:'', optionJ:'最速'},
  '뒷심': {kindJ:'通常', target:0.15, accel:'', instant:'', stretch:'', duration:2.4, triggerJ:'終盤のみ', value:'', optionJ:'最速'},
  '全身全霊': {kindJ:'レア/進化', target:0.35, accel:'', instant:'', stretch:'', duration:2.4, triggerJ:'終盤のみ', value:'', optionJ:'最速'},
  '전심전력': {kindJ:'レア/進化', target:0.35, accel:'', instant:'', stretch:'', duration:2.4, triggerJ:'終盤のみ', value:'', optionJ:'最速'},
  '直線一気': {kindJ:'通常', target:'', accel:0.2, instant:'', stretch:'', duration:0.9, triggerJ:'終盤直線', value:'', optionJ:'最速'},
  '직선 주파': {kindJ:'通常', target:'', accel:0.2, instant:'', stretch:'', duration:0.9, triggerJ:'終盤直線', value:'', optionJ:'最速'},
  '迫る影': {kindJ:'レア/進化', target:'', accel:0.4, instant:'', stretch:'', duration:0.9, triggerJ:'終盤直線', value:'', optionJ:'最速'},
  '육박하는 그림자': {kindJ:'レア/進化', target:'', accel:0.4, instant:'', stretch:'', duration:0.9, triggerJ:'終盤直線', value:'', optionJ:'最速'},
  '垂れウマ回避': {kindJ:'通常', target:'', accel:0.2, instant:'', stretch:'', duration:3, triggerJ:'終盤のみ', value:'', optionJ:'最速'},
  '뒤처지기 방지': {kindJ:'通常', target:'', accel:0.2, instant:'', stretch:'', duration:3, triggerJ:'終盤のみ', value:'', optionJ:'最速'},
  'ノンストップガール': {kindJ:'レア/進化', target:'', accel:0.4, instant:'', stretch:'', duration:3, triggerJ:'終盤のみ', value:'', optionJ:'最速'},
  '논스톱 걸': {kindJ:'レア/進化', target:'', accel:0.4, instant:'', stretch:'', duration:3, triggerJ:'終盤のみ', value:'', optionJ:'最速'},
  '登山家': {kindJ:'通常', target:'', accel:0.2, instant:'', stretch:'', duration:3, triggerJ:'上り坂最速', value:'', optionJ:'条件なし'},
  '등산가': {kindJ:'通常', target:'', accel:0.2, instant:'', stretch:'', duration:3, triggerJ:'上り坂最速', value:'', optionJ:'条件なし'},
  '直滑降': {kindJ:'通常', target:'', accel:0.2, instant:'', stretch:'', duration:3, triggerJ:'下り坂最速', value:'', optionJ:'条件なし'},
  '직활강': {kindJ:'通常', target:'', accel:0.2, instant:'', stretch:'', duration:3, triggerJ:'下り坂最速', value:'', optionJ:'条件なし'},
  '地固め': {kindJ:'通常', target:'', accel:0.2, instant:'', stretch:'', duration:3, triggerJ:'スタート時', value:0, optionJ:'条件なし'},
  '터다지기': {kindJ:'通常', target:'', accel:0.2, instant:'', stretch:'', duration:3, triggerJ:'スタート時', value:0, optionJ:'条件なし'},
  '先駆け': {kindJ:'通常', target:'', accel:0.2, instant:'', stretch:'', duration:1.2, triggerJ:'スタート時', value:0, optionJ:'条件なし'},
  '앞장서기': {kindJ:'通常', target:'', accel:0.2, instant:'', stretch:'', duration:1.2, triggerJ:'スタート時', value:0, optionJ:'条件なし'},
  '先手必勝': {kindJ:'レア/進化', target:'', accel:0.4, instant:'', stretch:'', duration:1.2, triggerJ:'スタート時', value:0, optionJ:'条件なし'},
  '선수 필승': {kindJ:'レア/進化', target:'', accel:0.4, instant:'', stretch:'', duration:1.2, triggerJ:'スタート時', value:0, optionJ:'条件なし'},
  '好転一息': {kindJ:'レア/進化', target:'', accel:'', instant:'', stretch:'', duration:'', triggerJ:'走行距離[m]', value:0, optionJ:'基準:中盤開始'},
  '호전일식': {kindJ:'レア/進化', target:'', accel:'', instant:'', stretch:'', duration:'', triggerJ:'走行距離[m]', value:0, optionJ:'基準:中盤開始'},
  '円弧のマエストロ': {kindJ:'レア/進化', target:'', accel:'', instant:'', stretch:'', duration:'', triggerJ:'コーナー最速', value:'', optionJ:'条件なし'},
  '원호의 마에스트로': {kindJ:'レア/進化', target:'', accel:'', instant:'', stretch:'', duration:'', triggerJ:'コーナー最速', value:'', optionJ:'条件なし'}
};
function normSkillText(s){ return String(s??'').trim().replace(/[\s・･_/／()（）\[\]【】]/g,'').toLowerCase(); }
function findSkillEntry(name){
  const raw = String(name??'').trim();
  if(!raw) return null;
  if(!DATA._skillLookup){
    const map = new Map();
    for(const s of DATA.skills||[]){
      for(const key of [s.kr, s.ja, s.label, `${s.kr} (${s.ja})`, `${s.kr}（${s.ja}）`]){
        if(key) map.set(normSkillText(key), s);
      }
    }
    DATA._skillLookup = map;
  }
  return DATA._skillLookup.get(normSkillText(raw)) || null;
}
function fullSkillText(name){
  const hit = findSkillEntry(name);
  return [name, hit?.ja, hit?.kr].filter(Boolean).join(' ');
}
function isGoldSkill(ja, text){ return KNOWN_GOLD_SKILLS.has(ja) || /(レア|進化|金|プロフェッサー|マエストロ|全身全霊|一文字|電光石火|迫る影|ノンストップ|先手必勝|乗り換え上手|鍔迫り合い|曲線のソムリエ|スプリントターボ|昇り龍|豪脚|強攻策|アンストッパブル|キラーチューン|神速|王手|怪物)/.test(text); }
function isUniqueSkill(ja, text){ return KNOWN_UNIQUE_SKILLS.has(ja) || /(固有|勝利の鼓動|アングリング|アナボリック|紅焔ギア|彼方、その先へ|ヴィクトリーショット|シューティングスター|皇帝の神威|先頭の景色)/.test(text); }
function isPassiveLike(text){ return /(○|◎|×)$/.test(text) || /(右回り|左回り|春ウマ娘|夏ウマ娘|秋ウマ娘|冬ウマ娘|良バ場|道悪|雨の日|雪の日|曇りの日|晴れの日|レース場|根幹距離|非根幹距離|内枠|外枠|交流重賞|ナイター|伏兵|一匹狼)/.test(text); }
function genericSkillPreset(name){
  const hit = findSkillEntry(name);
  const ja = hit?.ja || String(name??'').trim();
  const kr = hit?.kr || '';
  const text = `${ja} ${kr} ${name}`;
  if(EXACT_SKILL_PRESETS[ja]) return {...EXACT_SKILL_PRESETS[ja]};
  if(EXACT_SKILL_PRESETS[kr]) return {...EXACT_SKILL_PRESETS[kr]};
  if(EXACT_SKILL_PRESETS[String(name??'').trim()]) return {...EXACT_SKILL_PRESETS[String(name??'').trim()]};

  const gold = isGoldSkill(ja, text);
  const unique = isUniqueSkill(ja, text);
  const p = {kindJ: unique ? '固有Lv.5' : (gold ? 'レア/進化' : '通常'), target:'', accel:'', instant:'', stretch:'', duration:3, triggerJ:'コーナー最速', value:'', optionJ:'条件なし'};

  if(isPassiveLike(text)){
    return {...p, target:'', accel:'', instant:'', stretch:'', duration:'', triggerJ:'走行距離[m]', value:'', optionJ:'条件なし'};
  }
  if(/(回復|マエストロ|好転|食いしん坊|クールダウン|リラックス|栄養補給|深呼吸|別腹|補給|힐|회복|먹보|호전|릴랙스|영양)/.test(text)){
    return {...p, kindJ: gold ? 'レア/進化' : p.kindJ, target:'', accel:'', instant:'', stretch:'', duration:'', triggerJ:/コーナー|曲線|원호|코너/.test(text)?'コーナー最速':'走行距離[m]', value:0, optionJ:/コーナー|曲線|원호|코너/.test(text)?'条件なし':'基準:中盤開始'};
  }
  if(/(ためらい|けん制|牽制|焦り|駆け引き|束縛|独占力|ささやき|目くらまし|かく乱|デバフ|주저|견제|긴장|속삭임|교란|독점력)/.test(text)){
    return {...p, kindJ: gold ? 'レア/進化' : '通常', target: gold ? -0.25 : -0.15, duration:3, triggerJ:/終盤|후반|종반/.test(text)?'終盤のみ':'中盤のみ', optionJ:'最速'};
  }
  const accelLike = /(加速|直滑降|登山家|ソムリエ|一陣の風|乗り換え|差し切り|真っ向勝負|鍔迫り合い|直線一気|迫る影|電光石火|地固め|先手必勝|先駆け|スプリントギア|スプリントターボ|プランX|ノンストップ|垂れウマ|豪脚|昇り龍|起死回生|王手|抜群の切れ味|抜群の豪脚|가속|직활강|등산|소믈리에|환승|정면 승부|뒤처지기|전광석화)/.test(text);
  if(accelLike){
    p.accel = gold ? 0.4 : 0.2;
    if(/(直線一気|迫る影|電光石火|抜群の切れ味|직선 주파|육박하는 그림자|전광석화|추입력)/.test(text)){ p.triggerJ='終盤直線'; p.optionJ='最速'; p.duration=0.9; }
    else if(/(地固め|先手必勝|先駆け|集中力|コンセントレーション|스타트|터다지기|선수 필승|앞장서기|집중력|컨센트레이션)/.test(text)){ p.triggerJ='スタート時'; p.optionJ='条件なし'; p.value=0; p.duration=1.2; }
    else if(/(上り|登山|오르막|등산)/.test(text)){ p.triggerJ='上り坂最速'; }
    else if(/(下り|下校|直滑降|내리막|하교|직활강)/.test(text)){ p.triggerJ='下り坂最速'; }
    else if(/(直線|一陣|스프린트|직선)/.test(text)){ p.triggerJ='直線最速'; }
    else if(/(コーナー|曲線|ソムリエ|코너|곡선|소믈리에)/.test(text)){ p.triggerJ='コーナー最速'; }
    else { p.triggerJ='終盤のみ'; p.optionJ='最速'; }
    return p;
  }
  if(/(現在速度|即時|接続|鼓動|アモアイ|고동|즉시)/.test(text)){
    p.instant = unique ? 0.25 : (gold ? 0.35 : 0.15);
    p.triggerJ = /(終盤|종반|最終|최종)/.test(text) ? '終盤のみ' : '中盤のみ';
    p.optionJ = '最速';
    return p;
  }

  p.target = unique ? 0.25 : (gold ? 0.35 : 0.15);
  if(/(直線|직선)/.test(text)) p.triggerJ='直線最速';
  else if(/(コーナー|曲線|弧線|円弧|호선|원호|코너|곡선)/.test(text)) p.triggerJ='コーナー最速';
  else if(/(中盤|尻尾|ペースアップ|テンポアップ|킬러 튠|중반|꼬리|페이스|템포)/.test(text)){ p.triggerJ='中盤のみ'; p.optionJ='最速'; }
  else if(/(終盤|末脚|全身全霊|最終|뒷심|전심전력|종반|최종)/.test(text)){ p.triggerJ='終盤のみ'; p.optionJ='最速'; }
  else if(/(序盤|スタート|초반|스타트)/.test(text)){ p.triggerJ='序盤のみ'; p.optionJ='最速'; }
  else p.triggerJ='コーナー最速';
  return p;
}
function setSelectIfValid(el, val){ if(!el || val == null) return; if(Array.from(el.options).some(o=>o.value===String(val))) el.value = String(val); }
function setInputValue(tr, key, val){ const el = tr.querySelector(`[data-k=${key}]`); if(el) el.value = (val==null ? '' : val); }
function applySkillPresetToRow(tr, force=false){
  const input = tr?.querySelector('[data-k=nameKR]');
  if(!input) return false;
  const raw = input.value.trim();
  if(!raw) return false;
  const hit = findSkillEntry(raw);
  const isExact = !!hit || !!EXACT_SKILL_PRESETS[raw];
  if(!force && !isExact) return false;
  const preset = genericSkillPreset(raw);
  if(!preset) return false;
  fillSkillJa(tr);
  setSelectIfValid(tr.querySelector('[data-k=kindJ]'), preset.kindJ);
  setInputValue(tr,'target',preset.target);
  setInputValue(tr,'accel',preset.accel);
  setInputValue(tr,'instant',preset.instant);
  setInputValue(tr,'stretch',preset.stretch);
  setInputValue(tr,'duration',preset.duration);
  setSelectIfValid(tr.querySelector('[data-k=triggerJ]'), preset.triggerJ);
  setInputValue(tr,'value',preset.value);
  setSelectIfValid(tr.querySelector('[data-k=optionJ]'), preset.optionJ);
  tr.dataset.autofilled = '1';
  const result = tr.querySelector('.result');
  if(result) result.textContent = '자동입력';
  return true;
}
function autoFillAllSkills(){
  let count = 0;
  qsa('#skillRows tr').forEach(tr=>{ if(applySkillPresetToRow(tr,true)) count++; });
  markDirty(`${count}개 스킬 자동입력 완료 · 시뮬레이션 실행을 눌러 계산하세요`);
}

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
  const found=findSkillEntry(name);
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
  formulaWorker = new Worker('assets/formula-worker.js?v=mashinfix1');
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
  setFormulaStatus(`<span class="status-ok">수식 엔진 ON</span> · Worker 분리 계산 · formulas ${Number(formulaCount||DATA.formulaInfo.formulaCount).toLocaleString('ko-KR')}개 · 최근 ${Math.round(ms||0)}ms · 그래프 ${result.chartSource==='fallback'?'보정':'수식'} ${result.chartPointCount||0}점 · 마신차 ${result.resultSource==='fallback'?'보정':'수식'}`);
  renderCourseInfo();
  renderChart(result.chart || {labels:[],skill:[],noskill:[]});
  updateSkillPreviewValues(result.skillPositions || []);
}

function renderChart(chartData){
  const ctx=$('chart').getContext('2d');
  const labels=(chartData.labels||[]).map(v=>Number.isFinite(Number(v))?Number(v):v);
  const norm=arr=>(arr||[]).map(v=>Number.isFinite(Number(v))?Number(v):null);
  const data={labels,datasets:[{label:'스킬 없음',data:norm(chartData.noskill),borderColor:'#ef4444',backgroundColor:'transparent',pointRadius:0,borderWidth:2,tension:0},{label:'스킬 있음',data:norm(chartData.skill),borderColor:'#4f74ff',backgroundColor:'transparent',pointRadius:0,borderWidth:2,tension:0}]};
  const options={responsive:true,maintainAspectRatio:false,animation:false,normalized:true,spanGaps:true,interaction:{mode:'index',intersect:false},plugins:{legend:{position:'top'},tooltip:{callbacks:{title:items=>`시간 ${items[0].label}s`,label:i=>`${i.dataset.label}: ${Number(i.parsed.y).toFixed(3)} m/s`}}},scales:{x:{title:{display:true,text:'경과시간[s]'},ticks:{maxTicksLimit:12}},y:{title:{display:true,text:'주행속도[m/s]'},suggestedMin:0}}};
  if(chart){chart.data=data; chart.options=options; chart.update('none'); return;}
  chart=new Chart(ctx,{type:'line',data,options});
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
    if(el.dataset.k==='nameKR'){
      const tr = el.closest('tr');
      fillSkillJa(tr);
      applySkillPresetToRow(tr, false);
    }
    markDirty();
  });
  document.addEventListener('change', e=>{
    const el=e.target;
    if(!el.matches('input,select') || el.id==='loadJson') return;
    if(el.id==='venue') updateCourseOptions();
    if(el.id==='course') renderCourseInfo();
    if(el.dataset.k==='nameKR'){
      const tr = el.closest('tr');
      fillSkillJa(tr);
      applySkillPresetToRow(tr, true);
    }
    markDirty();
  });
  $('runBtn').onclick=run;
  $('addSkill').onclick=()=>{addSkillRow({kindJ:'通常'}); markDirty('스킬 행 추가됨 · 실행 버튼을 눌러 계산하세요');};
  $('clearSkills').onclick=()=>{clearSkills(); markDirty('스킬 초기화됨 · 실행 버튼을 눌러 계산하세요');};
  $('loadDefault').onclick=()=>{loadDefaults(); markDirty('기본 예시 로드됨 · 실행 버튼을 눌러 계산하세요');};
  const autoBtn = $('autoFillSkills');
  if(autoBtn) autoBtn.onclick=autoFillAllSkills;
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
