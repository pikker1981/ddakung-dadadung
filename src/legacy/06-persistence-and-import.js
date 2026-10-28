/* ================= 자동 저장 =================
   경쟁 앱(Drum Notes)이 "30~40마디에서 느려지고 튕기며 작업이 날아간다"로 리뷰에서
   맞고 있다. 우리는 아예 저장을 안 하고 있었으니 같은 사고가 더 쉽게 난다.

   성격을 분명히 할 것 — 이건 **백업이 아니라 사고 방지**다.
   같은 기기·같은 브라우저에서 새로 고침·탭 닫힘·앱 전환을 견디는 것까지다.
   브라우저 데이터를 지우면 사라지고, iOS는 한동안 안 쓰면 저장소를 스스로 비운다.
   그래서 "파일로 저장하라"는 안내를 없애지 말 것. 문구를 바꿀 때도 이 성격을 유지한다.

   ================= 곡 라이브러리 (2026-08-13) =================
   초안이 **하나뿐**이던 걸 여러 곡으로. 아이패드 Studio를 열기 전 1순위였다 —
   폰에서 한두 곡 만질 땐 안 보였는데, 긴 곡을 만드는 화면에서 슬롯이 하나면
   "다른 곡 열었더니 아까 것이 없다"가 반드시 난다.

   저장 모양:
     maidrum.lib      {v:1, cur:<id>, songs:[{id,title,at,bars}]}   ← 색인
     maidrum.s.<id>   {v:2, title, bpm, measures, at, app}          ← 곡 본문

   **본문은 파일 저장과 같은 모양을 유지한다.** normalizeMeasures·looksLikeScore를
   그대로 쓸 수 있고, 포맷이 올라가도 고칠 곳이 한 군데다.
   색인을 따로 두는 이유는 목록을 그릴 때 **본문을 전부 파싱하지 않기 위해서**다.
   400마디짜리가 몇 개 있으면 목록 여는 데만 수백 ms가 든다. */
const LIB_KEY   = 'maidrum.lib';
const SONG_PRE  = 'maidrum.s.';
const DRAFT_KEY = 'maidrum.draft';      // 옛 단일 초안. 이관에만 쓴다
const SONG_MAX  = 60;                   // localStorage 5MB 기준 넉넉한 상한
/* 라이브러리 상태 (PC 스튜디오, 2026-10-20) — 즐겨찾기와 마지막으로 연 시각. 곡 본문과 색인은 건드리지 않는다.
   **책갈피는 여기 없다** — 마디 자체에 붙는다(`m.bm`). 마디를 옮기고 지워도 따라다니고,
   파일로 저장하면 같이 나간다. 여기는 기기마다 달라도 되는 것만 둔다.
   쓰는 곳은 `SHELF_ON`(PC 스튜디오)뿐이다. 다른 에디션은 읽지도 쓰지도 않는다. */
const SHELF_KEY = 'maidrum.shelf';      // {v:1, fav:{<id>:1}, open:{<id>:ms}}
let shelfSt = {v:1, fav:{}, open:{}};
/* 연습 기록장 · 일기장 (2026-10-21) — 곡과 같이 백업·미러 대상이다(잃으면 되살릴 길이 없는 글이다) */
const PLOG_KEY = 'maidrum.plog', DIARY_KEY = 'maidrum.diary';

let lib = {v:1, cur:'', songs:[]};
let _draftTimer = null, _draftLast = '';
let _quotaWarned = false;
let _libBusy = false;                   // 곡을 지우는 중 — saveDraft가 곡을 새로 만들면 안 된다

function lsGet(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
function lsSet(k,v){
  try{ localStorage.setItem(k,v); }catch(e){ return false; }
  if(IS_NATIVE && isMirrorKey(k)) mirrorPut(k, v);
  return true;
}
function lsDel(k){
  try{ localStorage.removeItem(k); }catch(e){}
  if(IS_NATIVE && isMirrorKey(k)) mirrorDel(k);
}

/* ── 네이티브 저장 미러 ─────────────────────────────────────
   iOS는 저장공간이 모자라면 **웹뷰의 localStorage를 스스로 비운다.** 웹에서는
   "파일로 저장하라"는 안내가 그 몫을 했지만, 앱에서 작업물이 사라지면 그건 1성
   리뷰다 — 경쟁 앱이 정확히 그것으로 맞고 있다(이 구역 맨 위 주석).

   **곡 색인과 곡 본문만** 앱 저장소에 한 벌 더 쓴다. 설정값(종이색·스틱·메트로놈)은
   잃어도 다시 고르면 되니 미러하지 않는다 — 대상을 넓히면 쓰기 비용만 늘고 얻는 게 없다.

   왜 localStorage를 그대로 두고 미러만 붙였나: `Filesystem`은 비동기인데 이 앱의
   읽기는 전부 동기다. 읽기를 다 비동기로 바꾸는 건 저장 로직을 통째로 다시 쓰는
   일이고, 이 코드에서 사고가 제일 잦았던 자리다. 그래서 **런타임의 진실은 계속
   localStorage가 갖고**, 앱 저장소는 부팅 때만 읽는 백업으로 둔다.

   남는 위험: 곡을 지운 직후 앱이 죽으면 미러 삭제가 못 돌아 다음 부팅에 그 곡이
   되살아날 수 있다. 전부 잃는 것보다 훨씬 나은 실패라 이대로 둔다. */
const MIRROR_DIR = 'mirror';
function capFs(){
  const P = window.Capacitor && window.Capacitor.Plugins;
  return (P && P.Filesystem) || null;
}
/* 이름 주의: 아래쪽에 `let mirrored`(악보 좌우 반전)가 이미 있다. 같은 이름을 쓰면
   최상위 선언이 겹쳐 **스크립트 전체가 SyntaxError로 안 뜬다** — 실제로 겪었다. */
function isMirrorKey(k){ return k === LIB_KEY || k === SHELF_KEY || k === PLOG_KEY || k === DIARY_KEY || k.indexOf(SONG_PRE) === 0; }
function mirrorPath(k){ return MIRROR_DIR + '/' + k + '.json'; }
/* 한 줄로 세운다 — 같은 키에 두 번 쓰는 게 겹치면 반쪽 파일이 남는다 */
let _mirrorQ = Promise.resolve();
function mirrorPut(k, v){
  const fs = capFs(); if(!fs) return;
  _mirrorQ = _mirrorQ.then(()=> fs.writeFile({
    path: mirrorPath(k), data: v, directory: 'DATA', encoding: 'utf8', recursive: true,
  })).catch(()=>{});          // 실패해도 조용히 — 진실은 localStorage가 갖고 있다
}
function mirrorDel(k){
  const fs = capFs(); if(!fs) return;
  _mirrorQ = _mirrorQ.then(()=> fs.deleteFile({
    path: mirrorPath(k), directory: 'DATA',
  })).catch(()=>{});
}

/* 부팅 때 한 번. **살아 있는 키는 손대지 않는다** — 미러는 어디까지나 백업이고,
   localStorage에 있는 값이 항상 더 새롭다. 일부만 비워진 경우(색인은 살고 본문만
   날아간 경우)도 키 단위로 보기 때문에 그대로 메워진다. */
async function nativeRestore(){
  const fs = capFs(); if(!fs) return 0;
  let names = [];
  try{
    const r = await fs.readdir({path: MIRROR_DIR, directory: 'DATA'});
    names = (r.files || []).map(f => (typeof f === 'string' ? f : f.name));
  }catch(e){ return 0; }     // 폴더가 없다 = 미러한 적이 없다
  let back = 0;
  for(const name of names){
    if(!/\.json$/.test(name)) continue;
    const k = name.replace(/\.json$/, '');
    if(!isMirrorKey(k)) continue;
    if(lsGet(k) !== null) continue;
    try{
      const r = await fs.readFile({path: MIRROR_DIR + '/' + name,
                                   directory: 'DATA', encoding: 'utf8'});
      if(typeof r.data === 'string' && r.data){
        localStorage.setItem(k, r.data);     // lsSet을 쓰면 방금 읽은 걸 되쓴다
        back++;
      }
    }catch(e){}
  }
  return back;
}

/* 시간과 카운터를 섞는다. 같은 ms에 두 번 만들어도 안 겹치게 */
let _idSeq = 0;
function newId(){ return Date.now().toString(36) + '-' + (_idSeq++).toString(36); }
function songKey(id){ return SONG_PRE + id; }

function libSave(){
  if(!STORAGE_OK) return false;
  return lsSet(LIB_KEY, JSON.stringify(lib));
}

/* 색인이 깨져도 앱은 떠야 한다. 모르는 값은 조용히 접는다 */
function libLoad(){
  if(!STORAGE_OK) return;
  let d = null;
  try{ d = JSON.parse(lsGet(LIB_KEY) || 'null'); }catch(e){ d = null; }
  if(!d || !Array.isArray(d.songs)){ lib = {v:1, cur:'', songs:[]}; return; }
  lib = {
    v: 1,
    cur: typeof d.cur === 'string' ? d.cur : '',
    songs: d.songs.filter(s => s && typeof s.id === 'string').map(s => ({
      id: s.id,
      title: typeof s.title === 'string' ? s.title : '',
      at: (+s.at) || 0,
      bars: (s.bars|0) || 1,
    })),
  };
  // 본문이 없어진 항목은 목록에서 뺀다 (브라우저가 일부만 비운 경우)
  lib.songs = lib.songs.filter(s => lsGet(songKey(s.id)) !== null);
  if(!lib.songs.some(s => s.id === lib.cur)) lib.cur = lib.songs.length ? lib.songs[0].id : '';
}

/* 옛 `maidrum.draft` 하나를 첫 곡으로 옮긴다.
   **본문 쓰기가 성공한 걸 읽어서 확인한 뒤에만** 옛 키를 지운다.
   순서를 바꾸면 용량이 꽉 찬 기기에서 작업이 통째로 날아간다. */
function libMigrate(){
  if(!STORAGE_OK) return;
  if(lib.songs.length) return;
  const raw = lsGet(DRAFT_KEY);
  if(!raw) return;
  let d = null;
  try{ d = JSON.parse(raw); }catch(e){ lsDel(DRAFT_KEY); return; }
  if(!looksLikeScore(d)){ lsDel(DRAFT_KEY); return; }
  const id = newId();
  if(!lsSet(songKey(id), raw)) return;            // 자리가 없으면 옛 키를 그대로 둔다
  if(lsGet(songKey(id)) !== raw) return;          // 읽어서 확인
  lib.songs = [{id, title: (typeof d.title === 'string' ? d.title : ''),
                at: (+d.at) || Date.now(), bars: d.measures.length}];
  lib.cur = id;
  libSave();
  lsDel(DRAFT_KEY);
}

/* 파일 저장과 **같은 모양**으로 담는다. 그래야 normalizeMeasures·looksLikeScore를
   그대로 쓸 수 있고, 나중에 포맷이 올라가도 한 곳만 고치면 된다. */
function draftPayload(){
  const te = document.getElementById('titleInput');
  return JSON.stringify({
    /* v3 = 곡 정보(meta)가 붙은 판. **v2도 그대로 읽는다** — 없으면 빈 값이다.
       비어 있으면 아예 안 싣는다: 옛 곡의 저장 문자열이 안 달라진다 */
    v: 3, title: (te ? te.value : ''), bpm, measures,
    ...(metaEmpty(songMeta) ? {} : {meta: songMeta}),
    ...(scoreStyle === 'classic' ? {} : {style: scoreStyle}),
    ...(headSize === 'normal' ? {} : {hsize: headSize}),
    ...(showTempo ? {tempo: true} : {}),
    at: Date.now(), app: APP_VER,
  });
}

/* 현재 곡에 쓴다. 색인의 제목·마디 수·시각도 같이 고친다 —
   목록이 본문을 안 읽고도 맞는 값을 보여줘야 하니까. */
function saveDraft(){
  if(!STORAGE_OK) return false;
  // Confirmed deletion deliberately suppresses saving the deleted document.
  if(_libBusy && !lib.cur) return true;
  let s;
  try{ s = draftPayload(); }catch(e){ return false; }
  if(s === _draftLast && lib.cur) return true;
  const fresh = !lib.cur, id = lib.cur || newId();
  // Stage metadata; a quota failure must not change the current song identity.
  const staged = JSON.parse(JSON.stringify(lib));
  if(fresh){ staged.songs.unshift({id,title:'',at:Date.now(),bars:measures.length}); staged.cur = id; }
  const meta = staged.songs.find(x=>x.id === id);
  if(meta){
    const te = document.getElementById('titleInput');
    meta.title = te ? te.value : ''; meta.bars = measures.length; meta.at = Date.now();
  }
  if(!lsSet(songKey(id), s)){
    // 용량 초과. **편집을 막지는 않는다** — 대신 한 번은 알려 준다.
    // 조용히 포기하면 사용자는 저장되고 있다고 믿은 채로 작업을 잃는다
    if(!_quotaWarned){
      _quotaWarned = true;
      toast('저장 공간이 찼습니다. <b>곡 목록</b>에서 안 쓰는 곡을 지우거나 파일로 내보내 주세요.');
    }
    return false;
  }
  if(!lsSet(LIB_KEY, JSON.stringify(staged))){
    if(fresh) lsDel(songKey(id));
    return false;
  }
  lib = staged; _draftLast = s;
  if(fresh){ track('song'); shelfTouch(id); }
  return true;
}

/* 타이핑·연타 중에 매번 쓰면 폰에서 렉이 된다. 한 덩어리로 묶어 뒤에 한 번만 쓴다.
   저장 자체는 몇 ms지만 400마디짜리는 문자열이 100KB를 넘는다. */
function autosaveSoon(){
  if(!STORAGE_OK) return;
  clearTimeout(_draftTimer);
  _draftTimer = setTimeout(saveDraft, 700);
}

/* 탭을 닫거나 홈으로 나갈 때 마지막 한 번. iOS는 `beforeunload`를 안 주는 경우가 많아
   `visibilitychange`(hidden)가 실질적인 마지막 기회다. */
document.addEventListener('visibilitychange', ()=>{
  if(document.visibilityState === 'hidden'){ clearTimeout(_draftTimer); saveDraft(); }
});
window.addEventListener('pagehide', ()=>{ clearTimeout(_draftTimer); saveDraft(); });

/* 현재 곡을 지운다(색인에서도). 곡 전환·삭제가 아니라 **손상된 본문**을 버릴 때 쓴다 */
function clearDraft(){
  if(!STORAGE_OK) return;
  if(lib.cur){
    lsDel(songKey(lib.cur));
    lib.songs = lib.songs.filter(s => s.id !== lib.cur);
    lib.cur = lib.songs.length ? lib.songs[0].id : '';
    libSave();
  }
  _draftLast = '';
}

/* 복구는 조용히 한다 — 자동 저장의 기본 동작이 그렇고, 사용자는 자기 악보를 보면
   무슨 일이 일어났는지 바로 안다. 다만 **되돌아갈 길**을 같이 준다(토스트의 "곡 목록"). */
function restoreDraft(){
  if(!STORAGE_OK) return false;
  if(!lib.cur) return false;
  const raw = lsGet(songKey(lib.cur));
  if(!raw) return false;
  let d;
  try{ d = JSON.parse(raw); }catch(e){ clearDraft(); return false; }
  if(!looksLikeScore(d)){ clearDraft(); return false; }
  try{
    measures = normalizeMeasures(d.measures); syncRosterToNotes();
    const te = document.getElementById('titleInput');
    if(te && typeof d.title === 'string') te.value = d.title;
    songMeta = metaClean(d.meta);              // v2 초안엔 없다 — 그러면 빈 값이다
    headSize = d.hsize || 'normal';
    showTempo = !!d.tempo;
    if(typeof syncMetaUI === 'function') syncMetaUI();
    setScoreStyle(d.style || 'classic', true);
    if(d.bpm){
      bpm = d.bpm;
      const br = document.getElementById('bpmRange');
      if(br) br.value = bpm;
      const bv = document.getElementById('bpmVal');
      if(bv) bv.textContent = bpm;
    }
    selMeasure = 0; selEnd = 0; cursorB = 0; cursorK = 0;
    _draftLast = raw;
    return true;
  }catch(e){ return false; }
}

/* ── 곡을 오가는 동작 ──────────────────────
   **모든 전환은 flushSong()으로 시작한다.** 자동 저장은 700ms 뒤에 쓰는데,
   그 사이에 곡을 갈아 끼우면 방금 친 것이 **다음 곡에 저장된다.**
   실수하기 딱 좋은 자리라 함수를 따로 뺐다. */
function flushSong(){
  clearTimeout(_draftTimer);
  const ok = saveDraft();
  if(!ok) storageTransitionWarning();
  return ok;
}

function storageTransitionWarning(){
  appAlert(LANG === 'en'
    ? 'Your current changes could not be saved. The song has not been switched. Use Save → .ddakung.json file to back up your work, then free browser storage and try again.'
    : '현재 변경 내용을 저장하지 못해 곡을 전환하지 않았습니다. 저장 → .ddakung.json 파일로 먼저 백업한 뒤 브라우저 저장 공간을 확보하고 다시 시도하세요.');
}

/* 화면을 비운다. 곡을 새로 만들 때와 열 때가 공유한다 */
function blankDoc(){
  if(playing) stopPlay();
  measures = [emptyMeasure()];
  selMeasure = 0; selEnd = 0; cursorB = 0; cursorK = 0;
  const te = document.getElementById('titleInput');
  if(te) te.value = '';
  songMeta = metaClean(null);                  // 곡 정보도 새 곡을 따라간다
  headSize = 'normal';
  showTempo = false;
  if(typeof syncMetaUI === 'function') syncMetaUI();
  setScoreStyle('classic', true);
  if(loopRange){ loopRange = null; if(typeof refreshRangeBtn === 'function') refreshRangeBtn(); }
}

/* 새 곡. **묻지 않는다** — 라이브러리가 생긴 뒤로는 아무것도 안 지우기 때문이다.
   예전 `새 악보`는 지금 것을 덮어써서 확인을 받아야 했다. 이제는 옆에 하나 더 만든다. */
function newSong(){
  if(!STORAGE_OK){ storageTransitionWarning(); return false; }
  if(lib.songs.length >= SONG_MAX){
    toast(`곡은 ${SONG_MAX}개까지 둘 수 있습니다. 안 쓰는 곡을 지워 주세요.`);
    return false;
  }
  if(!flushSong()) return false;
  const previousLib = JSON.parse(JSON.stringify(lib));
  const id = newId();
  lib.songs.unshift({id, title:'', at:Date.now(), bars:1});
  lib.cur = id;
  if(!libSave()){ lib = previousLib; storageTransitionWarning(); return false; }
  shelfTouch(id);
  _draftLast = '';
  blankDoc();
  refreshAll(); commit();          // commit이 자동 저장까지 끌고 간다 → 본문이 생긴다
  _cur = snapshot(); histPast.length = 0; histFuture.length = 0; refreshUndoBtns();
  renderLib();
  closeLib();                      // 새 곡을 만들었으면 바로 쓰고 싶지 목록을 더 볼 일이 없다
  return true;
}

function openSong(id){
  if(id === lib.cur){ closeLib(); return; }
  const raw = lsGet(songKey(id));
  if(!raw){ toast('그 곡을 찾지 못했습니다.'); libLoad(); renderLib(); return; }
  let d;
  try{ d = prepareScoreDocument(JSON.parse(raw)); }catch(e){ toast('그 곡이 손상됐습니다.'); return false; }
  if(!looksLikeScore(d)){ toast('그 곡이 손상됐습니다.'); return; }
  if(!flushSong()) return false;
  const previousId = lib.cur;
  lib.cur = id;
  if(!libSave()){ lib.cur = previousId; storageTransitionWarning(); return false; }
  shelfTouch(id);
  if(playing) stopPlay();
  measures = d.measures; syncRosterToNotes();
  const te = document.getElementById('titleInput');
  if(te) te.value = typeof d.title === 'string' ? d.title : '';
  songMeta = metaClean(d.meta);
  headSize = d.hsize || 'normal';
  showTempo = !!d.tempo;
  if(typeof syncMetaUI === 'function') syncMetaUI();
  setScoreStyle(d.style || 'classic', true);
  if(d.bpm){
    bpm = d.bpm;
    const br = document.getElementById('bpmRange'); if(br) br.value = bpm;
    const bv = document.getElementById('bpmVal');   if(bv) bv.textContent = bpm;
  }
  selMeasure = 0; selEnd = 0; cursorB = 0; cursorK = 0;
  if(loopRange){ loopRange = null; if(typeof refreshRangeBtn === 'function') refreshRangeBtn(); }
  _draftLast = raw;
  refreshAll();
  // 되돌리기 기록도 곡을 따라간다. **안 지우면 다른 곡으로 되돌아간다** —
  // 스냅샷에는 곡 구분이 없어서 이전 곡의 마디가 그대로 들어온다
  _cur = snapshot(); histPast.length = 0; histFuture.length = 0; refreshUndoBtns();
  scrollScoreTo(0, true);
  closeLib();
}

function dupSong(id){
  if(lib.songs.length >= SONG_MAX){
    toast(`곡은 ${SONG_MAX}개까지 둘 수 있습니다.`); return;
  }
  if(id === lib.cur && !flushSong()) return;
  const raw = lsGet(songKey(id));
  if(!raw) return;
  const src = lib.songs.find(s => s.id === id) || {title:'', bars:1};
  const nid = newId();
  let d; try{ d = JSON.parse(raw); }catch(e){ return; }
  d.title = t('{name} 사본').replace('{name}', src.title || t('무제'));
  d.at = Date.now();
  const s2 = JSON.stringify(d);
  if(!lsSet(songKey(nid), s2)){ toast('저장 공간이 부족해 복제하지 못했습니다.'); return; }
  const i = lib.songs.findIndex(s => s.id === id);
  lib.songs.splice(i < 0 ? 0 : i, 0, {id:nid, title:d.title, at:d.at, bars:src.bars});
  libSave();
  renderLib();
}

/* 지운 곡이 지금 곡이면 다음 곡으로 옮겨 탄다. 남은 곡이 없으면 빈 곡을 하나 만든다 —
   **화면이 무주공산이 되는 상태를 만들지 않는다.** */
function delSong(id, sure){
  const s = lib.songs.find(x => x.id === id);
  if(!s) return;
  const name = s.title || '무제';
  if(!sure){
    appAsk(t('"{name}"을(를) 지울까요?\n되돌릴 수 없습니다.').replace('{name}', name), '삭제')
      .then(ok=>{ if(ok) delSong(id, true); });
    return;
  }
  _libBusy = true;
  try{
    clearTimeout(_draftTimer);          // 지운 곡에 대고 쓰지 않도록
    lsDel(songKey(id));
    shelfForget(id);
    lib.songs = lib.songs.filter(x => x.id !== id);
    if(lib.cur === id){
      lib.cur = ''; _draftLast = '';
      libSave();
      if(lib.songs.length){ openSong(lib.songs[0].id); }
      else { newSong(); }
    } else {
      libSave();
    }
  } finally {
    _libBusy = false;                   // 어떤 경로로 나가도 반드시 푼다
  }
  renderLib();
}

/* ── 곡 목록 시트 ────────────────────────── */
const libPop = document.getElementById('libPop');
function closeLib(){ libPop.classList.remove('is-open'); }
function openLib(){
  if(SHELF_ON){ openShelf(); return; }      // PC 스튜디오는 목록 대신 라이브러리 (2026-10-20)
  track('library'); if(!flushSong()) return; libLoad(); renderLib(); libPop.classList.add('is-open');
}

/* ★ 매개변수를 `t`라고 두면 **번역 함수 `t()`를 가린다** — 안에서 t('방금')을 부르면
   숫자를 함수로 부르게 되어 터진다. 2026-08-22 영어화에서 실제로 밟았다.
   `t`는 이제 전역 이름이다. **지역 변수로 `t`를 쓰지 말 것.** */
function agoText(tm){
  if(!tm) return '';
  const s = Math.max(0, (Date.now() - tm) / 1000);
  if(s < 60) return t('방금');
  if(s < 3600) return Math.floor(s/60) + t('분 전');
  if(s < 86400) return Math.floor(s/3600) + t('시간 전');
  if(s < 86400*7) return Math.floor(s/86400) + t('일 전');
  const d = new Date(tm);
  return LANG === 'en'
    ? d.toLocaleDateString('en-US', {month:'short', day:'numeric'})
    : `${d.getMonth()+1}월 ${d.getDate()}일`;
}

function renderLib(){
  // 라이브러리가 열려 있으면 같이 고친다 — 복제·삭제·붙여넣기 불러오기가 이 함수를 부른다
  if(SHELF_ON && shelfIsOpen()) renderShelf();
  const list = document.getElementById('libList');
  const note = document.getElementById('libNote');
  if(!list) return;
  list.innerHTML = '';
  if(!STORAGE_OK){
    note.textContent = t('이 브라우저는 저장이 막혀 있어 곡을 보관할 수 없습니다. 파일로 저장해 주세요.');
    return;
  }
  note.textContent = t('{n}곡 · 자동 저장은 이 브라우저 안에만 있습니다. 중요한 곡은 파일로도 저장하세요.')
                       .replace('{n}', lib.songs.length);
  // 최근에 고친 순서. 방금 만진 곡이 위로 온다
  const rows = lib.songs.slice().sort((a,b)=> (b.at||0) - (a.at||0));
  rows.forEach(s=>{
    const row = document.createElement('div');
    row.className = 'libitem' + (s.id === lib.cur ? ' cur' : '');
    const open = document.createElement('button');
    open.className = 'libopen';
    open.innerHTML = `<b>${escapeHtml(s.title || t('무제'))}</b>`
                   + `<span>${t('{n}마디').replace('{n}', s.bars|0)} · ${agoText(s.at)}`
                   + `${s.id === lib.cur ? ' · ' + t('지금') : ''}</span>`;
    open.onclick = ()=> openSong(s.id);
    const dup = document.createElement('button');
    dup.className = 'libact'; dup.textContent = t('복제');
    dup.onclick = ()=> dupSong(s.id);
    const del = document.createElement('button');
    del.className = 'libact danger'; del.textContent = t('삭제');
    del.onclick = ()=> delSong(s.id);
    row.append(open, dup, del);
    list.appendChild(row);
  });
}
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => (
    {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

document.getElementById('libBtn').onclick = openLib;
document.getElementById('libNew').onclick = newSong;
document.getElementById('libClose').onclick = closeLib;
libPop.addEventListener('click', e=>{ if(e.target === libPop) closeLib(); });
document.addEventListener('keydown', e=>{
  if(e.key === 'Escape' && libPop.classList.contains('is-open')) closeLib();
});

/* ── 곡 옮기기 (2026-10-11, 카톡 클레임) ─────────────────────────
   **브라우저마다 localStorage가 따로다.** 카톡 링크로 들어와 카톡 웹뷰에서 곡을 만든 사람이
   "다른 브라우저로 열기"를 하면 빈 목록이 뜨고, 그 사람에겐 "리셋됐다"로 보인다.
   카톡 웹뷰는 파일 다운로드도 막혀 있어서 `.ddakung.json` 저장으로는 못 꺼낸다.
   그래서 **글자로** 옮긴다 — 클립보드는 웹뷰에서도 된다.

   모양: 사람이 읽는 첫 줄 + `MAIDRUM-BACKUP:` + JSON {v:1, at, songs:[{body}]}.
   `body`는 `maidrum.s.<id>`의 **문자열 그대로**다(포맷 변환 없음 → 곡이 안 바뀐다).
   불러올 때는 새 id로 넣고, **본문이 똑같은 곡은 건너뛴다**(두 번 붙여도 안 겹친다).
   `.ddakung.json` 하나를 통째로 붙여 넣어도 곡 하나로 받는다. */
const BACKUP_TAG = 'DDAKUNG-BACKUP:';
const BACKUP_TAGS = [BACKUP_TAG, 'MAIDRUM-BACKUP:'];
function backupText(){
  if(!flushSong()) return null;
  libLoad();
  const songs = [];
  lib.songs.slice().sort((a,b)=> (b.at||0) - (a.at||0)).forEach(s=>{
    const body = lsGet(songKey(s.id));
    if(body) songs.push({body});
  });
  const jr = (typeof journalBackup === 'function' && SHELF_ON) ? journalBackup() : null;   // 연습 기록장·일기장 (2026-10-21)
  if(!songs.length && !jr) return '';
  const head = LANG === 'en'
    ? `따쿵따다둥 backup (${songs.length} songs) - open this workspace > Songs > Import from paste`
    : `따쿵따다둥 악보 백업 (${songs.length}곡) - 이 작업 공간 > 곡 목록 > 붙여넣기로 불러오기`;
  return head + '\n' + BACKUP_TAG + JSON.stringify({v:1, at:Date.now(), songs, ...(jr || {})});
}
/* 동기 경로(execCommand)를 먼저 — 사용자 제스처가 살아 있는 동안 해야 웹뷰에서 통한다 */
function copyPlain(str){
  let ok = false;
  try{
    const ta = document.createElement('textarea');
    ta.value = str; ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;';
    document.body.appendChild(ta);
    ta.focus(); ta.select(); ta.setSelectionRange(0, str.length);
    ok = document.execCommand('copy');
    ta.remove();
  }catch(e){ ok = false; }
  if(ok) return Promise.resolve(true);
  try{
    if(navigator.clipboard && navigator.clipboard.writeText)
      return navigator.clipboard.writeText(str).then(()=>true, ()=>false);
  }catch(e){}
  return Promise.resolve(false);
}
const movePop = document.getElementById('movePop');
function moveShow(mode){
  const isCopy = mode === 'copy';
  movePop.dataset.mode = mode;
  document.getElementById('moveTitle').textContent = t(isCopy ? '전체 백업 복사' : '붙여넣기로 불러오기');
  document.getElementById('moveGo').style.display   = isCopy ? 'none' : '';
  document.getElementById('moveCopy').style.display = isCopy ? '' : 'none';
  const clipOk = !!(navigator.clipboard && navigator.clipboard.readText);
  document.getElementById('moveClip').style.display = (!isCopy && clipOk) ? '' : 'none';
  const ta = document.getElementById('moveText');
  ta.readOnly = isCopy;
  ta.placeholder = isCopy ? '' : (LANG === 'en' ? 'Press and hold here, then Paste' : '여기를 길게 눌러 붙여넣기');
  movePop.classList.add('is-open');
}
function moveMsg(html, ok){
  const p = document.getElementById('moveMsg');
  p.innerHTML = html; p.classList.toggle('ok', !!ok);
}
function backupCopy(){
  track('backup-copy');
  const str = backupText();
  if(str === null) return;
  if(!str){ toast('옮길 곡이 없습니다.'); return; }
  const n = (str.match(/"body":/g) || []).length;
  copyPlain(str).then(ok=>{
    moveShow('copy');
    const ta = document.getElementById('moveText');
    ta.value = str;
    if(ok){
      moveMsg(LANG === 'en'
        ? `<b>Copied ${n} songs.</b><br>Open this workspace address on the other browser or device → <b>Songs → Import from paste</b>.`
        : `<b>${n}곡을 복사했습니다.</b><br>다른 브라우저나 기기에서 이 작업 공간 주소를 열고 <b>곡 목록 → 붙여넣기로 불러오기</b>를 누르세요.`, true);
    } else {
      moveMsg(LANG === 'en'
        ? `Automatic copy was blocked. Press and hold the box below → <b>Select all → Copy</b>.`
        : `자동 복사가 막혔습니다. 아래 칸을 길게 눌러 <b>전체 선택 → 복사</b>해 주세요.`);
      try{ ta.focus(); ta.select(); }catch(e){}
    }
  });
}
function parseBackup(text){
  text = String(text || '');
  const tag = BACKUP_TAGS.find(tag => text.includes(tag)) || BACKUP_TAG;
  const i = text.indexOf(tag);
  try{
    if(i >= 0){
      const d = JSON.parse(text.slice(i + tag.length).trim());
      return (d && Array.isArray(d.songs)) ? d.songs.map(s => s && s.body) : [];
    }
    const d = JSON.parse(text.trim());                 // .ddakung.json 하나를 붙여 넣은 경우
    return looksLikeScore(d) ? [JSON.stringify(d)] : [];
  }catch(e){ return []; }
}
function importBackup(text){
  if(String(text || '').length > 8 * 1024 * 1024) return {ok:false,invalid:1};
  const bodies = parseBackup(text);
  if(!bodies.length) return {ok:false};
  if(!STORAGE_OK) return {ok:false};
  const prepared = prepareBackupBodies(bodies, prepareScoreDocument);
  if(!prepared.entries.length) return {ok:false,invalid:prepared.invalid};
  // A wholly invalid backup must not even flush/alter the current library.
  if(!flushSong()) return {ok:false,storageFailed:true};
  libLoad();
  const have = new Set(lib.songs.map(s => lsGet(songKey(s.id))));
  for(const entry of prepareBackupBodies([...have], prepareScoreDocument).entries) have.add(entry.body);
  let added = 0, dup = 0, full = false, storageFailed = false;
  for(const {body,doc:d} of prepared.entries){
    if(have.has(body)){ dup++; continue; }
    if(lib.songs.length >= SONG_MAX){ full = true; break; }
    const id = newId();
    if(!lsSet(songKey(id), body)){ full = true; storageFailed = true; break; }
    const staged = JSON.parse(JSON.stringify(lib));
    staged.songs.push({id, title: typeof d.title === 'string' ? d.title : '',
                    at: (+d.at) || Date.now(), bars: d.measures.length || 1});
    if(!lsSet(LIB_KEY, JSON.stringify(staged))){
      // Only this import's new body can be orphaned; never remove existing data.
      lsDel(songKey(id)); full = true; storageFailed = true; break;
    }
    lib = staged;
    have.add(body);
    added++;
  }
  return {ok:added > 0 || dup > 0, added, dup, full,storageFailed,invalid:prepared.invalid};
}
function moveImport(){
  const ta = document.getElementById('moveText');
  if(!ta.value.trim()){ moveMsg(t('먼저 아래 칸에 붙여 넣어 주세요.')); return; }
  const r = importBackup(ta.value);
  /* 연습 기록장·일기장도 같이 합친다 (2026-10-21). 곡이 하나도 없는 백업도 받는다 */
  const jn = (typeof journalImport === 'function' && SHELF_ON) ? journalImport(ta.value) : 0;
  if(jn){ if(SHELF_ON && shelfIsOpen()) renderShelf(); }
  if(!r.ok && jn){ moveMsg(t('연습 기록·일기 {n}개를 합쳤습니다.').replace('{n}', jn), true); ta.value = ''; return; }
  if(!r.ok){
    moveMsg(r.storageFailed || r.full
      ? (LANG === 'en' ? 'Storage is full or unavailable. The pasted backup has been kept. Save current work to a .ddakung.json file and free storage before retrying.' : '저장 공간이 부족하거나 저장할 수 없습니다. 붙여넣은 백업은 그대로 두었습니다. 현재 작업을 .ddakung.json 파일로 백업하고 저장 공간을 확보한 뒤 다시 시도하세요.')
      : r.invalid
      ? (LANG === 'en' ? `${r.invalid} invalid songs were rejected. No songs were imported.` : `손상되거나 지원하지 않는 곡 ${r.invalid}개를 거부했습니다. 곡은 불러오지 않았습니다.`)
      : t('붙여 넣은 글자에서 곡을 찾지 못했습니다. 백업 복사한 글자를 통째로 붙여 넣어 주세요.')); return;
  }
  track('backup-import');
  renderLib();
  let msg = (!r.added && r.dup)
    ? (LANG === 'en' ? `<b>All ${r.dup} songs are already here.</b>` : `<b>${r.dup}곡 모두 이미 들어 있습니다.</b>`)
    : LANG === 'en'
    ? `<b>Imported ${r.added} songs.</b>` + (r.dup ? ` (${r.dup} already here — skipped)` : '')
    : `<b>${r.added}곡을 불러왔습니다.</b>` + (r.dup ? ` (이미 있던 ${r.dup}곡은 건너뜀)` : '');
  if(r.full) msg += '<br>' + t('저장 공간이 부족해 일부만 불러왔습니다.');
  if(r.invalid) msg += '<br>' + (LANG === 'en' ? `${r.invalid} invalid songs were skipped.` : `손상되거나 지원하지 않는 곡 ${r.invalid}개는 건너뛰었습니다.`);
  moveMsg(msg, r.added > 0);
  if(r.added && !r.full && !r.invalid){ ta.value = ''; }
}
function backupPasteOpen(){
  document.getElementById('moveText').value = '';
  moveMsg(LANG === 'en'
    ? `In the old browser, tap <b>Copy backup of all</b>, then paste it below.`
    : `원래 쓰던 곳(카톡 등)에서 <b>전체 백업 복사</b>를 누른 뒤, 아래 칸에 붙여 넣고 <b>불러오기</b>를 누르세요.`);
  moveShow('paste');
}
document.getElementById('libCopyAll').onclick = backupCopy;
document.getElementById('libPasteIn').onclick = backupPasteOpen;
document.getElementById('moveGo').onclick = moveImport;
document.getElementById('moveClose').onclick = ()=> movePop.classList.remove('is-open');
document.getElementById('moveCopy').onclick = ()=>{
  const ta = document.getElementById('moveText');
  copyPlain(ta.value).then(ok=>{ if(!ok){ try{ ta.focus(); ta.select(); }catch(e){} } else toast('백업 복사됨'); });
};
document.getElementById('moveClip').onclick = ()=>{
  const ta = document.getElementById('moveText');
  try{
    navigator.clipboard.readText().then(txt=>{
      ta.value = txt || '';
      if(txt && BACKUP_TAGS.some(tag => txt.includes(tag))) moveImport();
    }, ()=> moveMsg(t('클립보드를 읽지 못했습니다. 아래 칸을 길게 눌러 붙여넣기 해 주세요.')));
  }catch(e){ moveMsg(t('클립보드를 읽지 못했습니다. 아래 칸을 길게 눌러 붙여넣기 해 주세요.')); }
};
movePop.addEventListener('click', e=>{ if(e.target === movePop) movePop.classList.remove('is-open'); });
if(!STORAGE_OK){ const m = document.getElementById('libMove'); if(m) m.style.display = 'none'; }

/* 카톡 인앱 브라우저 안내 — 웹에서만. 닫으면 이번 방문 동안은 안 뜬다 */
(function(){
  const bar = document.getElementById('kakaoBar');
  if(!bar || IS_NATIVE || !/KAKAOTALK/i.test(navigator.userAgent || '')) return;
  let off = false;
  try{ off = sessionStorage.getItem('maidrum.kakaobar') === '1'; }catch(e){}
  if(off) return;
  bar.classList.add('on');
  track('kakao-inapp');
  document.getElementById('kakaoCopy').onclick = backupCopy;
  document.getElementById('kakaoOpen').onclick = ()=>{
    track('kakao-open-external');
    flushSong();
    location.href = 'kakaotalk://web/openExternal?url=' + encodeURIComponent(location.href);
  };
  document.getElementById('kakaoX').onclick = ()=>{
    bar.classList.remove('on');
    try{ sessionStorage.setItem('maidrum.kakaobar', '1'); }catch(e){}
  };
})();

/* 복구했을 때만 뜬다. 매번 뜨면 안내가 아니라 소음이다. */
/* 문구는 **여기서** 옮긴다 (2026-08-22). 부르는 곳이 스물다섯인데 거기마다 `t()`를
   씌우면 하나를 빠뜨리고, 빠뜨린 건 영어 화면에 한국어 토스트로 나타난다.
   길목이 하나면 그럴 일이 없다. 사전에 없는 문구는 그대로 지나간다. */
/* ── 앱 자체 확인창 (1.8, 크래시 후속) ──
   WKWebView의 confirm()/alert()는 UIAlertController로 뜨는데, 창이 떠 있는 채로 앱 창이
   닫히면(앱 전환기에서 밀어 끄기·스테이지 매니저) 응답 없이 사라지고 WebKit이
   "completion handler가 불리지 않았다"며 NSException으로 앱을 죽인다(1.5에서 6건).
   그래서 묻는 일은 전부 이 창으로 한다. **비동기다** — 부르는 쪽은 Promise로 답을 받는다.
   검사는 `window.__askAuto = true|false`로 창 없이 답할 수 있다(`__askCount`가 센다) */
let _askRes = null;
function appAsk(msg, okLabel){
  window.__askCount = (window.__askCount || 0) + 1;
  if(typeof window.__askAuto === 'boolean') return Promise.resolve(window.__askAuto);
  const pop = document.getElementById('askPop');
  if(!pop) return Promise.resolve(false);
  if(_askRes) _askRes(false);                       // 앞 질문이 남아 있으면 취소로 닫는다
  document.getElementById('askMsg').textContent = t(msg);
  const no = document.getElementById('askNo'), yes = document.getElementById('askYes');
  yes.textContent = t(okLabel || '확인');
  no.style.display = (okLabel === null) ? 'none' : '';   // 알림이면 버튼 하나 (.btn이 [hidden]을 이긴다)
  if(okLabel === null) yes.textContent = t('확인');
  pop.classList.add('is-open');
  setTimeout(()=> yes.focus(), 0);
  return new Promise(res=>{ _askRes = res; });
}
function appAlert(msg){ return appAsk(msg, null); }
function _askDone(v){
  const pop = document.getElementById('askPop');
  if(pop) pop.classList.remove('is-open');
  const r = _askRes; _askRes = null;
  if(r) r(v);
}
(function(){
  const pop = document.getElementById('askPop'); if(!pop) return;
  document.getElementById('askYes').onclick = ()=> _askDone(true);
  document.getElementById('askNo').onclick = ()=> _askDone(false);
  pop.addEventListener('click', e=>{ if(e.target === pop) _askDone(false); });
  document.addEventListener('keydown', e=>{
    if(!pop.classList.contains('is-open')) return;
    if(e.key === 'Escape'){ e.stopPropagation(); _askDone(false); }
    else if(e.key === 'Enter'){ e.preventDefault(); _askDone(true); }
  }, true);
})();

function toast(html, actionLabel, onAction){
  const el = document.getElementById('toast');
  if(!el) return;
  html = t(html); actionLabel = t(actionLabel);
  el.innerHTML = '';
  const span = document.createElement('span');
  span.innerHTML = html;
  el.appendChild(span);
  if(actionLabel){
    const b = document.createElement('button');
    b.className = 'btn sm';
    b.textContent = actionLabel;
    b.onclick = ()=>{ el.classList.remove('is-open'); onAction && onAction(); };
    el.appendChild(b);
  }
  el.classList.add('is-open');
  clearTimeout(toast._t);
  toast._t = setTimeout(()=> el.classList.remove('is-open'), 9000);
}

/* 저장 팝업 안의 버튼이다(상단바 `저장`은 팝업만 연다).
   **여전히 동기라서 사용자 제스처가 살아 있다** — 팝업 안에서 눌러도 탭은 탭이라
   iOS 공유 시트가 정상으로 뜬다. 여기서 async를 끼우면 그 순간 막힌다. */
document.getElementById('saveFileBtn').onclick = ()=>{
  const blob = new Blob([JSON.stringify({v:3, title:titleEl.value, bpm, measures,
    ...(metaEmpty(songMeta) ? {} : {meta: songMeta}),
    ...(scoreStyle === 'classic' ? {} : {style: scoreStyle}),
    ...(headSize === 'normal' ? {} : {hsize: headSize}),
    ...(showTempo ? {tempo: true} : {})})], {type:'application/json'});
  saveFile(blob, safeName() + '.ddakung.json');
};
document.getElementById('loadBtn').onclick = ()=> document.getElementById('fileInput').click();
/* v1(불리언) · v2(16칸 고정) · v3(성부별 div)를 모두 받는다.

   **v2 → v3는 음표 배열을 손대지 않는다.** div가 전부 4면 sum = 16이라
   기존 16칸이 그대로 맞는다. 필드 두 개를 붙일 뿐이고 손실이 없다.
   모르는 값이 들어와도 앱이 이상해지지 않게 범위로 접는다 — 남의 파일을 열어도 안전하게. */
/* v4(2026-08-19)에서 **박 수가 마디마다 다를 수 있게** 됐다. 그래서 이 함수는
   더 이상 4박을 가정하지 않고 `m`(ts·grp가 이미 세워진 마디)에서 박 수를 읽는다.
   그 박이 받을 수 없는 분할(6/8 박에 16분)은 조용히 기본값으로 접는다. */
function normDiv(src, m){
  const nb = beatCount(m);
  const out = Array.from({length:nb}, (_,b)=>{
    const d = defaultDivFor(m, b);
    return {h:d, f:d};
  });
  if(!Array.isArray(src)) return out;
  for(let b=0; b<nb; b++){
    const d = src[b];
    if(!d || typeof d !== 'object') continue;
    const ok = divsFor(m, b);
    if(ok.includes(d.h|0)) out[b].h = d.h|0;
    if(ok.includes(d.f|0)) out[b].f = d.f|0;
  }
  return out;
}
function normalizeMeasures(src){
  return src.map((mm, mIdx)=>{
    /* **박자표를 먼저 읽는다.** 안 읽으면 6/8로 저장한 곡을 다시 열었을 때
       4/4로 되돌아가고 칸 수가 어긋나 음표가 통째로 밀린다 (v3까지의 버그) */
    /* 박자표가 없는 옛 파일(v1~v3)은 4/4다. **여기서 SONG_TS를 쓰면 안 된다** —
       6/8 곡을 열어 둔 채 옛 4/4 파일을 불러오면 통째로 6/8로 읽힌다 */
    const m = emptyMeasure(mm && mm.div, (mm && mm.ts) || [4,4], (mm && mm.grp) || null);
    if(!mm || typeof mm !== 'object') return m;
    CATALOG.forEach(i=>{                       // **보이는 것이 아니라 전부** 읽는다
      const row = mm[i.id];
      if(!Array.isArray(row)) return;
      const len = voiceLen(m, i.voice);
      for(let s=0; s<len; s++){
        const v = row[s];
        const n = (v === true) ? ART.NORM : (v|0);
        /* 모르는 표기 값은 **1(보통 음표)로 접는다 — 0(없음)이 아니다.**
           나중에 플램·드래그가 코드 5, 6으로 들어오면, 그 악보를 지금
           깔린 앱에서 열었을 때 0으로 접으면 **음표가 통째로 사라진다.**
           1로 접으면 "표시만 빠진 보통 음표"로 남는다 — 자리도 소리도 맞다.
           음수·NaN 같은 진짜 쓰레기만 0으로 보낸다. */
        /* 범위 안이어도 **악기가 안 받는 표기는 접는다**(`artFor`) — 하이햇에 5(크로스 스틱)가
           적힌 파일이 들어와도 데이터에 남지 않는다. 그리기·소리는 원래 허용표를 보므로
           결과는 예전과 같고, 데이터만 깨끗해진다. */
        m[i.id][s] = (n >= 0 && n <= ART_MAX) ? artFor(i.id, n)
                                              : (n > ART_MAX ? ART.NORM : ART.OFF);
      }
    });
    if(mm.vel && typeof mm.vel==='object'){
      m.vel={};
      for(const i of CATALOG){
        const row=mm.vel[i.id]; if(!Array.isArray(row)) continue;
        m.vel[i.id]=Array.from({length:voiceLen(m,i.voice)},(_,k)=>Number.isInteger(row[k])?row[k]:0);
      }
      pruneVelocity(m);
    }
    /* 악보 요소 — **범위를 벗어난 값은 조용히 버린다.**
       남의 파일이나 다음 버전이 만든 파일을 열어도 앱이 이상해지지 않게 */
    if(typeof mm.sec === 'string' && mm.sec.trim()) m.sec = mm.sec.trim().slice(0, 20);
    if(typeof mm.text === 'string' && mm.text.trim()) m.text = mm.text.trim().slice(0, 120);
    /* 책갈피 (PC 스튜디오, 2026-10-20) — **있다/없다가 값이다.** 빈 문자열도 책갈피다(이름 없는 것).
       악보에는 안 찍힌다(화면의 붉은 리본만). 옛 버전은 이 키를 몰라 조용히 버린다 */
    if(typeof mm.bm === 'string') m.bm = mm.bm.trim().slice(0, 30);
    /* 악보 보기 메모 (2026-10-20) — 마디 상대 좌표. 획 400점·마디당 80개·글 200자. 옛 버전은 키째 버린다 */
    if(Array.isArray(mm.memo)){
      const out = [];
      const nm = (v, lo, hi)=> Math.max(lo, Math.min(hi, (isFinite(+v) ? +v : 0)));
      for(const it of mm.memo.slice(0, 80)){
        if(!it || typeof it !== 'object') continue;
        const c = /^(red|blue|green|ink|yel|lime|pink|sky)$/.test(it.c) ? it.c : 'red';
        if(it.k === 't'){
          if(typeof it.t === 'string' && it.t.trim())
            out.push({k:'t', x:nm(it.x, -4, 5), y:nm(it.y, -60, 60), t:it.t.slice(0, 200), c});
        } else if((it.k === 'p' || it.k === 'h') && Array.isArray(it.p)){
          const p = it.p.slice(0, 400).filter(q => Array.isArray(q) && q.length >= 2)
                        .map(q => [nm(q[0], -4, 5), nm(q[1], -60, 60)]);
          if(p.length) out.push({k:it.k, p, c, w: it.w === 2 ? 2 : 1});
        }
      }
      if(out.length) m.memo = out;
    }
    if(mm.end === 1 || mm.end === 2) m.end = mm.end;
    // 마디선 종류(1.2)가 여기 빠져 있어 저장→열기에서 겹세로줄·마침줄이 사라졌다 (2026-09-12 발견)
    if(mm.bar === 'double' || mm.bar === 'final') m.bar = mm.bar;
    if(mm.rpt === 1 || mm.rpt === true) m.rpt = 1;   // 한 마디 반복 기호 % (2026-09-12)
    // 셈여림·헤어핀 (1.8) — 모르는 값은 버린다. 박은 그 마디 박 수 안에서만
    if(DYN_OK.includes(mm.dyn)){
      m.dyn = mm.dyn;
      const b = mm.dynB|0; if(b > 0 && b < beatCount(m)) m.dynB = b;
    }
    if(HP_OK.includes(mm.hp)){
      m.hp = mm.hp;
      const b = mm.hpB|0; if(b > 0 && b < beatCount(m)) m.hpB = b;
      if(mm.hpS === 1 || mm.hpS === true) m.hpS = 1;   // 여기서 새 헤어핀 (1.9)
    }
    // 마디별 새 줄 (2026-09-12) — 1~8만 받는다
    if((mm.ln|0) >= 1 && (mm.ln|0) <= 8) m.ln = mm.ln|0;
    if(typeof mm.nav === 'string' && NAV_OK.includes(mm.nav)) m.nav = mm.nav;
    if(mm.rep && typeof mm.rep === 'object'){
      const r = {};
      if(mm.rep.a) r.a = true;
      if(mm.rep.b) r.b = true;
      // 반복 횟수는 2~8. 1이면 도돌이가 아니고, 큰 값은 오타일 가능성이 높다
      const t = mm.rep.times|0;
      if(t >= 2 && t <= 8) r.times = t;
      if(r.a || r.b) m.rep = r;
    }
    /* 앞꾸밈음 (2026-08-17). **악기별** 손 성부 칸: 0(없음)·1(플램)·2(드래그).
       CATALOG로 돈다 — 숨긴 악기의 꾸밈음이 저장·열기로 사라지면 안 된다(로스터 교훈).
       옛 버전은 이 키를 몰라 조용히 버린다 — 음표도 액센트도 그대로 남는다. */
    if(mm.orn && typeof mm.orn === 'object'){
      const len = voiceLen(m, 'hand');
      const o = {};
      CATALOG.filter(i => i.voice === 'hand').forEach(i=>{
        const row = mm.orn[i.id];
        if(!Array.isArray(row)) return;
        const out = new Array(len).fill(0);
        let any = false;
        for(let s=0; s<len; s++){
          const v = row[s]|0;
          if(v === 1 || v === 2 || v === 3){ out[s] = v; any = true; }   // 3 = 러프 (2026-10-02)
        }
        if(any) o[i.id] = out;
      });
      if(Object.keys(o).length) m.orn = o;
    }
    /* 꾸밈 악기 (2026-10-02). orn과 같은 모양, 값은 손 악기 id. 꾸밈음이 있는 칸만 살린다 */
    if(m.orn && mm.ornIns && typeof mm.ornIns === 'object'){
      const len = voiceLen(m, 'hand');
      const g = {};
      CATALOG.filter(i => i.voice === 'hand').forEach(i=>{
        const row = mm.ornIns[i.id], o = m.orn[i.id];
        if(!Array.isArray(row) || !o) return;
        const out = new Array(len).fill(0);
        let any = false;
        for(let s=0; s<len; s++){
          const v = row[s];
          if(o[s] && typeof v === 'string' && v !== i.id &&
             CATALOG.some(c => c.id === v && c.voice === 'hand')){ out[s] = v; any = true; }
        }
        if(any) g[i.id] = out;
      });
      if(Object.keys(g).length) m.ornIns = g;
    }
    /* 손 순서 R·L (2026-08-17). 손 성부 칸별 0(없음)·1(R)·2(L).
       길이는 이 마디의 손 성부 길이에 맞춰 자르고, 전부 0이면 키를 안 만든다.
       옛 버전은 이 키를 몰라서 조용히 버린다 — 음표는 그대로다. */
    if(Array.isArray(mm.stick)){
      const len = voiceLen(m, 'hand');
      const st = new Array(len).fill(0);
      let any = false;
      for(let s=0; s<len; s++){
        const v = mm.stick[s]|0;
        if(v === 1 || v === 2){ st[s] = v; any = true; }
      }
      if(any) m.stick = st;
    }
    /* 붙임줄 (2026-08-24). 악기별 0·1. **음이 있는 칸 + 앞에 이을 온셋이 있는 칸**만
       남긴다 — 첫 온셋에 걸린 값이나 빈 칸의 값은 데이터가 아니라 쓰레기다.
       CATALOG로 돈다(숨긴 악기의 붙임줄이 저장·열기로 사라지면 안 된다). */
    if(mm.tie && typeof mm.tie === 'object'){
      const o = {};
      CATALOG.forEach(i=>{
        const row = mm.tie[i.id];
        if(!Array.isArray(row)) return;
        const len = voiceLen(m, i.voice), arr = m[i.id];
        const out = new Array(len).fill(0);
        /* 마디 첫 음의 붙임줄은 **앞 마디에 그 악기 음이 있을 때만** 받는다 (2026-09-12 마디 사이 붙임줄).
           옛 파일에는 그런 값이 없으므로 결과가 같다 */
        const pm = mIdx > 0 ? src[mIdx - 1] : null;
        let any = false;
        let seen = !!(pm && Array.isArray(pm[i.id]) && pm[i.id].some(v => v === true || (v|0)));
        for(let s=0; s<len; s++){
          const has = !!(arr[s]|0);
          if(has && seen && (row[s]|0) === 1){ out[s] = 1; any = true; }
          if(has) seen = true;
        }
        if(any) o[i.id] = out;
      });
      if(Object.keys(o).length) m.tie = o;
    }
    /* 펜슬 메모 (2026-08-17). 획은 마디에 묶인다 —
       x는 마디 폭의 비율(fx), y는 오선 칸 단위(fy, top 기준 LG배).
       상한: 마디당 40획·획당 240점. 범위 밖 좌표는 잘라내고, 점이 2개 미만이면 버린다 */
    if(Array.isArray(mm.ink)){
      const out = [];
      for(const s of mm.ink.slice(0, 40)){
        if(!s || !Array.isArray(s.p)) continue;
        const p = [];
        for(const q of s.p.slice(0, 240)){
          if(!Array.isArray(q)) continue;
          const x = +q[0], y = +q[1];
          if(!isFinite(x) || !isFinite(y)) continue;
          p.push([Math.round(Math.max(-0.2, Math.min(1.2, x)) * 1000) / 1000,
                  Math.round(Math.max(-6,   Math.min(10,  y)) * 100)  / 100]);
        }
        if(p.length >= 2)
          out.push({p, c: INK_COLORS[s.c] ? s.c : 'red', w: (s.w === 2) ? 2 : 1});
      }
      if(out.length) m.ink = out;
    }
    return m;
  });
}

/* 우리 악보 파일인지 본다.
   JSON이긴 한데 우리 파일이 아닌 걸 골랐을 때 **아무 말 없이 넘어가면 안 된다** —
   사용자는 "열었는데 왜 그대로지?" 하게 된다. (`.ddakung.json`이 확장자가 `.json`이라
   iOS 공유 시트에서 엉뚱한 앱으로도 갈 수 있어서 더 헷갈리기 쉽다) */
function looksLikeScore(d){
  if(!d || typeof d !== 'object') return false;
  if(!Array.isArray(d.measures) || !d.measures.length) return false;
  const m = d.measures[0];
  if(!m || typeof m !== 'object') return false;
  return CATALOG.some(i => Array.isArray(m[i.id]));  // 악기 행이 하나라도 있어야 한다
}

// Shared external boundary for file opening and every pasted backup body.
// No UI, current-song, roster or storage mutations occur during preparation.
function prepareScoreDocument(d){
  const imported = validateScoreImport(d, CATALOG.map(i=>i.id), {minBpm:+bpmRange.min, maxBpm:+bpmRange.max});
  return {...d, ...imported, v:3,title:typeof d.title === 'string' ? d.title : '',
    at:typeof d.at === 'number' && Number.isFinite(d.at) ? d.at : 0,
    app:typeof d.app === 'string' ? d.app : '',
    measures:normalizeMeasures(d.measures), meta:metaClean(d.meta),tempo:!!d.tempo};
}

document.getElementById('fileInput').onchange = e=>{
  const f = e.target.files[0]; if(!f) return;
  if(f.size > 8 * 1024 * 1024){ appAlert('파일이 너무 큽니다. 8MB 이하의 악보 파일을 골라 주세요.'); e.target.value = ''; return; }
  const r = new FileReader();
  // iCloud Drive에 있고 아직 안 내려받은 파일은 읽기가 실패한다. 아이패드에서 흔한 경우
  r.onerror = ()=> appAlert('파일을 읽지 못했습니다.\niCloud에 있는 파일이면 먼저 내려받은 뒤 다시 시도해 주세요.');
  r.onload = ()=>{
    let d;
    try{ d = JSON.parse(r.result); }
    catch(err){ appAlert('읽을 수 있는 파일이 아닙니다.\n악보 파일(.ddakung.json)이 맞는지 확인해 주세요.'); return; }
    if(!looksLikeScore(d)){
      appAlert('따쿵따다둥에서 저장한 악보 파일이 아닙니다.\n"저장"으로 만든 .ddakung.json 파일을 골라 주세요.');
      return;
    }
    try{
      // Validate/normalize completely before touching the current song or library.
      const imported = prepareScoreDocument(d);
      if(STORAGE_OK && lib.songs.length >= SONG_MAX){
        appAlert(`곡은 ${SONG_MAX}개까지 둘 수 있습니다. 새 파일을 열기 전에 곡 목록을 정리해 주세요.`); return;
      }
      if(playing) stopPlay();
      // 라이브러리가 생긴 뒤로 **파일 열기는 새 곡으로 들어온다.**
      // 예전처럼 지금 곡을 덮어쓰면, 남의 파일을 열어 보다가 내 작업을 잃는다
      if(!newSong()) return;
      measures = imported.measures; syncRosterToNotes(); selMeasure = 0; selEnd = 0; cursorB = 0; cursorK = 0;
      titleEl.value = (typeof d.title === 'string' && d.title) ? d.title
                    : f.name.replace(/\.(?:mai|ddakung)\.json$/i, '').replace(/\.json$/i, '');
      songMeta = imported.meta;
      headSize = imported.hsize;
      showTempo = !!d.tempo;
      if(typeof syncMetaUI === 'function') syncMetaUI();
      setScoreStyle(imported.style, true);
      bpm = imported.bpm; bpmRange.value = bpm; document.getElementById('bpmVal').textContent = bpm;
      refreshAll(); commit();
      _cur = snapshot(); histPast.length = 0; histFuture.length = 0; refreshUndoBtns();
    }catch(err){ appAlert('악보를 여는 중 문제가 생겼습니다. 파일이 손상됐을 수 있습니다.'); }
  };
  r.readAsText(f);
  e.target.value = '';
};


/* 스텝 커서. 리얼드럼(2026-08-14 제거)의 유물이지만 selectMeasure·addMeasure 등
   여남은 곳이 cursorB/cursorK를 되돌려 놓고 있어 **값만** 남겨 둔다.
   화면에는 안 나오고(updateEditCursor가 감추기만 한다) 스텝 점도 없다.
   나중에 스텝 입력을 다시 만들면 여기부터 살리면 된다. */
let cursorB = 0, cursorK = 0;
function cursorDiv(){ return divCells(divOf(measures[selMeasure], cursorB, 'hand')); }
function clampCursor(){
  const m = measures[selMeasure];
  cursorB = Math.max(0, Math.min(cursorB|0, beatCount(m)-1));
  cursorK = Math.max(0, Math.min(cursorK|0, divCells(divOf(m, cursorB, 'hand'))-1));
}
function cursorIdx(voice){
  const m = measures[selMeasure];
  if(voice === 'hand') return idxAt(m, 'hand', cursorB, cursorK);
  const dh = divCells(divOf(m, cursorB, 'hand')), df = divCells(divOf(m, cursorB, 'foot'));
  const k = Math.min(df-1, Math.round(cursorK / dh * df));
  return idxAt(m, 'foot', cursorB, k);
}
function cursorPos(){ return cursorB + cellFrac(divOf(measures[selMeasure], cursorB, 'hand'), cursorK); }

function advanceStep(){
  cursorK++;
  if(cursorK >= cursorDiv()){
    cursorK = 0; cursorB++;
    if(cursorB >= beatCount(measures[selMeasure])){
      cursorB = 0;
      if(selMeasure === measures.length-1) measures.push(emptyMeasure()); // 자동 마디 추가
      selMeasure++;
      refreshChips(); buildGrid(); renderScore();
    }
  }
  refreshStepDots(); updateEditCursor();
}
function prevStep(){
  cursorK--;
  if(cursorK < 0){
    cursorB--;
    if(cursorB < 0){
      if(selMeasure > 0){ selMeasure--; refreshChips(); buildGrid(); }
      cursorB = beatCount(measures[selMeasure]) - 1;
    }
    cursorK = divCells(divOf(measures[selMeasure], cursorB, 'hand')) - 1;
  }
  refreshStepDots(); updateEditCursor();
}
function refreshStepDots(){
  const box = document.getElementById('stepDots');
  if(!box) return;
  clampCursor();
  const m = measures[selMeasure];
  box.innerHTML = '';
  for(let b=0; b<beatCount(m); b++){
    const dh = divCells(divOf(m, b, 'hand'));
    for(let k=0; k<dh; k++){
      const d = document.createElement('div');
      d.className = 'sdot' + (k===0 ? ' b0' : '') + (b===cursorB && k===cursorK ? ' cur' : '');
      const hasHand = INSTR.some(i=>i.voice==='hand' && m[i.id][idxAt(m,'hand',b,k)]);
      const df = divCells(divOf(m, b, 'foot'));
      const fk = Math.min(df-1, Math.round(k / dh * df));
      const hasFoot = (Math.round(fk / df * dh) === k) &&
        INSTR.some(i=>i.voice==='foot' && m[i.id][idxAt(m,'foot',b,fk)]);
      if(hasHand || hasFoot) d.classList.add('has');
      d.onclick = ()=>{ cursorB = b; cursorK = k; refreshStepDots(); updateEditCursor(); };
      box.appendChild(d);
    }
  }
  const info = document.getElementById('stepInfo');
  if(info) info.textContent = `${selMeasure+1}마디 · ${cursorB+1}박 ${cursorK+1}/${cursorDiv()}`;
}
/* 점선 편집 커서는 리얼드럼 스텝 입력 전용이었다 (2026-08-14에 리얼드럼을 뺐다).
   함수는 남겨 둔다 - 부르는 곳이 여남은 군데라 지우면 손댈 곳만 늘고,
   하는 일은 "커서를 감춘다" 하나뿐이라 값이 없다 */
function syncCurOverlay(src){
  src = src || document.getElementById('scoreSvg');
  const wrap = document.getElementById('scoreWrap'); if(!src || !wrap) return null;
  let ov = document.getElementById('curSvg');
  if(!ov){
    ov = document.createElementNS(SVG_NS, 'svg'); ov.id = 'curSvg';
    ov.setAttribute('aria-hidden', 'true');
    ov.appendChild(el('line',{id:'cursor',x1:-10,y1:0,x2:-10,y2:0,stroke:'#7B4BE0','stroke-width':2.5,'stroke-linecap':'round',opacity:0}));
    wrap.appendChild(ov);
  }
  const vb = src.getAttribute('viewBox'); if(vb) ov.setAttribute('viewBox', vb);
  /* SVG 요소에는 offsetLeft/offsetTop이 없다(크로미움 undefined) — 상자 좌표에서 카드 안 자리를 낸다.
     카드가 스크롤돼 있어도 맞게 scrollTop을 더한다(겹 SVG도 카드 안에서 같이 스크롤된다) */
  const rs = src.getBoundingClientRect(), rw = wrap.getBoundingClientRect();
  ov.style.left = (rs.left - rw.left - wrap.clientLeft + wrap.scrollLeft) + 'px';
  ov.style.top  = (rs.top  - rw.top  - wrap.clientTop  + wrap.scrollTop)  + 'px';
  ov.style.width = rs.width + 'px'; ov.style.height = rs.height + 'px';
  return ov;
}
function updateEditCursor(){
  const cur = document.getElementById('cursor');
  if(cur) cur.setAttribute('opacity', 0);
}

