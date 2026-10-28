/* ================= 컨트롤 ================= */
const bpmRange = document.getElementById('bpmRange');
bpmRange.oninput = e=>{
  bpm = +e.target.value;
  document.getElementById('bpmVal').textContent = bpm;
  autosaveSoon();   // BPM은 실행 취소 스냅샷에 없어서 commit을 안 탄다
};

/* ‹ › — **1씩** 움직인다 (2026-08-21 사용자 요청).
   원래는 5의 배수에 붙여 5씩 뛰었다. 슬라이더로 대략 맞춘 뒤 ‹ ›로 다듬는 쓰임인데,
   5씩이면 **다듬을 수가 없었다** — 원하는 값이 138이면 손이 닿는 길이 없다.
   큰 폭 이동은 슬라이더가 이미 맡고 있으므로 ‹ ›는 미세 조정으로 성격을 나눈다.
   137 → › 138 → › 139,  137 → ‹ 136. */
function stepBpm(dir){
  const lo = +bpmRange.min, hi = +bpmRange.max;
  let v = bpm + (dir > 0 ? 1 : -1);
  v = Math.max(lo, Math.min(hi, v));
  if(v === bpm) return;
  bpm = v;
  bpmRange.value = v;
  document.getElementById('bpmVal').textContent = v;
  autosaveSoon();
}
document.getElementById('bpmDn').onclick = ()=> stepBpm(-1);
document.getElementById('bpmUp').onclick = ()=> stepBpm(+1);

/* ── 탭 템포 (1.9, 2026-10-08 사용자 요청) ──────────────
   BPM 숫자를 박에 맞춰 두드리면 그 간격으로 템포를 정한다. 키보드는 T.
   - 두 번째 탭부터 바뀐다. 최근 간격 **넷까지** 평균 — 하나만 보면 손이 흔들린 만큼 숫자가 튄다
   - 2초 쉬면 새로 센다. 간격이 지금 평균과 **두 배 이상 다르면**(박을 놓쳤거나 반박을 쳤다) 거기서 새로 센다
   - BPM의 기준 음표는 박자표를 따른다(6/8이면 점4분) — 박을 두드리면 그 박이 곧 BPM이라 따로 셈할 것이 없다
   - 재생 중에도 된다. 슬라이더와 같은 길(`bpm` + `autosaveSoon`)이라 tick이 다음 박부터 새 템포를 쓴다
   - `pointerdown`에서 잰다 — `click`은 손을 뗄 때라 누르는 순간보다 수십 ms 늦고, 그 늦음이 탭마다 다르다 */
const TAP_RESET_MS = 2000;
let _taps = [], _tapIdle = 0, _tapHinted = false;
function tapTempo(now){
  const el = document.getElementById('bpmTap');
  const last = _taps[_taps.length - 1];
  if(last != null && now - last > TAP_RESET_MS) _taps = [];
  if(_taps.length >= 2){
    const ivs = _taps.slice(1).map((x, i)=> x - _taps[i]);
    const avg = ivs.reduce((a, b)=> a + b, 0) / ivs.length;
    const iv = now - _taps[_taps.length - 1];
    if(iv > avg * 2 || iv < avg / 2) _taps = [];         // 이 탭부터 새로 — 놓친 박 하나로 숫자가 반 토막 나지 않게
  }
  _taps.push(now);
  if(_taps.length > 5) _taps.shift();                    // 간격 넷
  if(el){
    el.classList.add('tapping');
    clearTimeout(_tapIdle);
    _tapIdle = setTimeout(()=>{ el.classList.remove('tapping'); _taps = []; }, TAP_RESET_MS);
  }
  if(_taps.length < 2){
    if(!_tapHinted){ _tapHinted = true; toast(t('박에 맞춰 계속 두드리세요')); }
    return;
  }
  const ivs = _taps.slice(1).map((x, i)=> x - _taps[i]);
  const avg = ivs.reduce((a, b)=> a + b, 0) / ivs.length;
  const lo = +bpmRange.min, hi = +bpmRange.max;
  const v = Math.max(lo, Math.min(hi, Math.round(60000 / avg)));
  if(v === bpm) return;
  bpm = v;
  bpmRange.value = v;
  document.getElementById('bpmVal').textContent = v;
  autosaveSoon();
}
(function initTapTempo(){
  const el = document.getElementById('bpmTap');
  if(!el) return;
  el.addEventListener('pointerdown', e=>{
    if(e.button > 0) return;                              // 오른쪽 클릭은 아니다
    tapTempo(performance.now());
  });
  el.addEventListener('keydown', e=>{
    if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); tapTempo(performance.now()); }
  });
  document.addEventListener('keydown', e=>{
    if(e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    if((e.key === 't' || e.key === 'T') && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && !e.target.isContentEditable)
      tapTempo(performance.now());
  });
})();

function refreshAll(){
  /* 숨긴 악기에 음표가 생기는 길이 여럿이다 — 프리셋, 마디 붙여넣기, 리얼드럼 녹음, 파일 열기.
     **안 보이는데 소리는 나는** 상태가 제일 나쁘다. 여기서 한 번에 막는다.
     로스터에 숨긴 게 없으면 첫 줄에서 바로 빠져나오므로 평소엔 공짜다. */
  if(syncRosterToNotes()) buildGrid();
  refreshChips(); refreshGrid(); renderScore(); refreshStepDots();
  if(typeof syncTotalM === 'function') syncTotalM();
  if(typeof refreshEditBtns === 'function') refreshEditBtns();
  scrollScoreTo(selMeasure, true);
}
/* 요청 7 "원하는 마디 뒤에 마디 추가".
   예전엔 무조건 맨 끝에 붙었다. 이제 **선택한 마디 바로 뒤**에 꽂는다 —
   마지막 마디를 고른 상태면 결과가 예전과 같으므로 익숙한 동작을 안 깬다. */
document.getElementById('addM').onclick = ()=>{
  measures.splice(selMeasure+1, 0, emptyMeasure());
  selMeasure++; selEnd = selMeasure; cursorB = 0; cursorK = 0;
  refreshAll(); commit();
};

/* 총 마디 수를 한 번에 정한다.
   보통 24마디·32마디 곡이라 하나씩 늘리는 건 느리다. 스테퍼(▲▼)는 4마디씩 움직이고
   직접 타이핑하면 1마디 단위로도 맞출 수 있다(step 속성은 스테퍼만 묶는다).
   줄일 때는 **뒤에서** 자른다 — 곡은 앞에서부터 쓰므로 뒤가 덜 아깝다.
   음표가 든 마디를 자를 때만 한 번 묻고, 되돌리기 한 단계로 묶는다. */
const totalMEl = document.getElementById('totalM');
// 숨긴 악기에 든 음표도 '음표가 있다'로 센다 — 안 물어보고 지우면 안 된다
function measureHasNotes(m){ return CATALOG.some(i => m[i.id].some(v=>v)); }
function setTotalMeasures(n, sure){
  n = Math.max(1, Math.min(400, Math.round(n||0)));
  const cur = measures.length;
  if(n === cur){ syncTotalM(); return; }
  if(n < cur){
    const losing = measures.slice(n).filter(measureHasNotes).length;
    // 묻는 창은 비동기다 — 답을 받으면 sure로 다시 들어온다 (1.8, confirm 교체)
    if(losing && !sure){
      syncTotalM();
      appAsk(t('뒤쪽 {n}마디를 지웁니다. 그중 {k}마디에 음표가 있습니다.\n계속할까요? (되돌리기 가능)')
             .replace('{n}', cur-n).replace('{k}', losing), '삭제')
        .then(ok=>{ if(ok) setTotalMeasures(n, true); });
      return;
    }
    measures.length = n;
    if(selMeasure >= n){ selMeasure = n-1; cursorB = 0; cursorK = 0; }
  } else {
    for(let i=cur;i<n;i++) measures.push(emptyMeasure());
  }
  refreshAll(); syncTotalM(); commit();
}
function syncTotalM(){ if(totalMEl) totalMEl.value = measures.length; }
totalMEl.addEventListener('change', e=> setTotalMeasures(+e.target.value));

/* −/＋는 **4의 배수로 스냅**한다.
   `step="4"`는 현재 값에서 4씩 더해서 1 → 5 → 9가 된다. 원하는 건 1 → 4 → 8이다.
   게다가 **iOS Safari는 숫자 입력의 ▲▼를 아예 안 그린다** — 아이패드에서는
   네이티브 스테퍼가 존재하지도 않았다. 그래서 버튼을 직접 만든다.
   직접 타이핑은 그대로 1마디 단위. */
function stepTotal(dir){
  const n = measures.length;
  if(dir < 0 && n <= 4) return;                        // 4 아래로는 직접 입력으로만
  const next = dir > 0 ? (Math.floor(n/4)+1)*4
                       : Math.max(4, (Math.ceil(n/4)-1)*4);
  setTotalMeasures(next);
}
document.getElementById('totalPlus').onclick  = ()=> stepTotal(+1);
document.getElementById('totalMinus').onclick = ()=> stepTotal(-1);

/* ---- 복사 / 붙여넣기 ----
   "1번 마디를 5번 마디에 복제"가 안 됐다. 바로 옆에만 복제되던 걸
   **범위를 복사해 원하는 자리에 붙여넣는** 방식으로 바꾼다.
   붙여넣기는 선택 범위의 **시작 마디부터** 덮어쓰고, 모자라면 마디를 늘린다. */
let clipM = null;
function refreshEditBtns(){
  const c = document.getElementById('copyM'), p = document.getElementById('pasteM');
  const ins = document.getElementById('insM');
  const n = selCount();
  if(c) c.textContent = n > 1 ? t('복사 {n}마디').replace('{n}', n) : t('복사');
  if(p){
    p.disabled = !clipM;
    p.textContent = clipM && clipM.length > 1
      ? t('붙여넣기 {n}마디').replace('{n}', clipM.length) : t('붙여넣기');
  }
  if(ins){
    ins.disabled = !clipM;
    ins.textContent = clipM && clipM.length > 1
      ? t('끼워넣기 {n}마디').replace('{n}', clipM.length) : t('끼워넣기');
  }
}
document.getElementById('copyM').onclick = ()=>{
  clipM = JSON.parse(JSON.stringify(measures.slice(selA(), selB()+1)));
  clipM.forEach(m => { delete m.bm; delete m.memo; });   // 복사는 책갈피·메모를 안 데려간다 — 잘라내기(옮기기)만 데려간다
  refreshEditBtns();
};
document.getElementById('pasteM').onclick = ()=>{
  if(!clipM) return;
  const at = selA();
  for(let k=0; k<clipM.length; k++){
    const mi = at + k;
    while(measures.length <= mi) measures.push(emptyMeasure());   // 모자라면 늘린다
    measures[mi] = JSON.parse(JSON.stringify(clipM[k]));
  }
  selMeasure = at; selEnd = Math.min(at + clipM.length - 1, measures.length-1);
  cursorB = 0; cursorK = 0;
  refreshAll(); refreshEditBtns(); commit();
};
document.querySelectorAll('.quickm').forEach(b=>{
  b.onclick = ()=> setTotalMeasures(+b.dataset.n);
});
/* ── 선택 범위는 편집 **전부**에 걸린다 (2026-08-27) ──
   복사·붙여넣기만 범위(selA~selB)를 알고 복제·비우기·삭제는 `selMeasure` 한 마디만
   먹었다. 4마디를 골라 놓고 삭제를 눌러도 **한 마디만 지워진다** — 고른 것과
   지워지는 것이 달랐다. 칩 줄이 네 칸을 하얗게 켜 두고 있으니 더 어긋나 보인다.
   여기서 셋을 다 범위로 옮긴다. 한 마디만 고르면 결과가 예전과 똑같아서
   익숙한 동작은 안 깨진다. */
const MAX_M = 400;                      // setTotalMeasures의 상한과 같은 값
function tooManyM(add){
  if(measures.length + add <= MAX_M) return false;
  toast(t('마디는 400개까지입니다.'));
  return true;
}
document.getElementById('dupM').onclick = ()=>{
  const a = selA(), b = selB(), n = b - a + 1;
  if(tooManyM(n)) return;
  measures.splice(b+1, 0, ...JSON.parse(JSON.stringify(measures.slice(a, b+1))).map(m => { delete m.bm; delete m.memo; return m; }));
  selMeasure = b+1; selEnd = b+n; cursorB = 0; cursorK = 0;
  refreshAll(); commit();
};
document.getElementById('clrM').onclick = ()=>{
  for(let i=selA(); i<=selB(); i++) measures[i] = emptyMeasure();
  refreshAll(); commit();
};
/* 지우는 규칙은 한 곳에만 둔다 — 삭제와 잘라내기가 같이 쓴다.
   여러 마디를 한 번에 없앨 때만 묻는다. 한 마디는 예전처럼 묻지 않는다
   (되돌리기가 있고, 물으면 낱개 편집이 느려진다).
   묻는 창은 비동기라(1.8) 물어야 하면 답을 기다렸다 다시 들어온다 — 취소하면 onCancel.
   바로 지웠으면 true, 물으러 갔으면 false. */
function deleteSel(ask, onCancel, sure){
  const a = selA(), n = selCount();
  if(ask && n > 1 && !sure){
    const losing = measures.slice(a, a+n).filter(measureHasNotes).length;
    if(losing){
      appAsk(t('{n}마디를 지웁니다. 그중 {k}마디에 음표가 있습니다.\n계속할까요? (되돌리기 가능)')
             .replace('{n}', n).replace('{k}', losing), '삭제')
        .then(ok=>{ if(ok) deleteSel(ask, onCancel, true); else if(onCancel) onCancel(); });
      return false;
    }
  }
  if(n >= measures.length){ measures = [emptyMeasure()]; selMeasure = selEnd = 0; }
  else {
    measures.splice(a, n);
    selMeasure = selEnd = Math.max(0, Math.min(a, measures.length-1));
  }
  cursorB = 0; cursorK = 0;
  refreshAll(); commit();
  return true;
}
document.getElementById('delM').onclick = ()=> deleteSel(true);
/* 잘라내기 — 복사 + 삭제를 한 번에. 취소하면 **클립보드도 원래대로 돌린다**
   (반쯤 잘린 상태로 남으면 다음 붙여넣기가 엉뚱한 걸 뱉는다). */
document.getElementById('cutM').onclick = ()=>{
  const prev = clipM;
  clipM = JSON.parse(JSON.stringify(measures.slice(selA(), selB()+1)));
  deleteSel(true, ()=>{ clipM = prev; refreshEditBtns(); });
  refreshEditBtns();
};
/* 끼워넣기 — 붙여넣기는 **덮어쓴다**. 중간에 네 마디를 새로 넣을 길이 없어서
   뒤쪽을 통째로 복사해 밀어내야 했다. 여기서는 고른 마디 **앞에** 밀어 넣는다. */
document.getElementById('insM').onclick = ()=>{
  if(!clipM || tooManyM(clipM.length)) return;
  const at = selA();
  measures.splice(at, 0, ...JSON.parse(JSON.stringify(clipM)));
  selMeasure = at; selEnd = at + clipM.length - 1;
  cursorB = 0; cursorK = 0;
  refreshAll(); commit();
};

/* 실행 취소 UI */
document.getElementById('undoBtn').onclick = undo;
document.getElementById('redoBtn').onclick = redo;
document.addEventListener('keydown', e=>{
  if(!(e.metaKey || e.ctrlKey)) return;
  const k = e.key.toLowerCase();
  if(k === 'z'){ e.preventDefault(); e.shiftKey ? redo() : undo(); }
  else if(k === 'y'){ e.preventDefault(); redo(); }
});

/* 상태 표시줄 가림막은 스크롤했을 때만 켠다. 맨 위에서는 블룸을 가리면 안 된다.
   passive + rAF — 스크롤마다 클래스를 만지면 iOS에서 스크롤이 끈적해진다. */
(function initSafeTop(){
  let ticking = false;
  function read(){
    ticking = false;
    document.body.classList.toggle('is-scrolled', window.scrollY > 4);
  }
  addEventListener('scroll', ()=>{
    if(ticking) return;
    ticking = true;
    requestAnimationFrame(read);
  }, {passive:true});
  read();
})();

/* ── 실수로 확대되는 것 막기 (2026-08-14) ─────────────
   CSS의 `touch-action:manipulation`이 **두 번 탭 확대**를 막는다.
   남은 건 **핀치**인데, iOS 사파리는 `user-scalable=no`를 무시하므로
   사파리 전용 `gesturestart`를 막아야 한다.

   **다만 화면 전체를 막지 않는다.** 확대를 통째로 없애면 눈이 불편한 사람이
   악보를 키워 볼 길이 사라진다(WCAG 1.4.4). 그래서 손이 오가는 구역 —
   입력 격자와 아래 독 — 에서만 막고, **악보 카드와 팝업은 열어 둔다.**
   악보는 확대해서 볼 이유가 실제로 있는 곳이다.

   두 손가락이 격자 위에 얹히는 건 대개 "스크롤하려다"인데, 그때 브라우저가
   핀치로 읽으면 화면이 통째로 튄다 — 그게 이번 제보의 내용이다. */
(function initZoomGuard(){
  const inGrid = t => !!(t && t.closest && t.closest('.gridWrap, .dock'));
  ['gesturestart','gesturechange','gestureend'].forEach(type=>{
    document.addEventListener(type, e=>{
      if(inGrid(e.target)) e.preventDefault();
    }, {passive:false});
  });
  /* 두 손가락이 격자 위에서 벌어지는 것도 같이 막는다 —
     `gesture*`는 사파리에만 있어서 다른 브라우저에는 이쪽이 필요하다.
     한 손가락(스크롤·칸 찍기)은 절대 건드리지 않는다. */
  document.addEventListener('touchmove', e=>{
    if(e.touches && e.touches.length > 1 && inGrid(e.target)) e.preventDefault();
  }, {passive:false});
})();

/* 표기(아티큘레이션) 팔레트 + 손 순서(R·L) · 앞꾸밈음(플램·드래그) 모드.
   R·L과 꾸밈음은 표기 값이 아니라 **모드**다 — 켜져 있는 동안 탭이 그것을 적는다.
   표기 칩을 고르면 모드가 풀리고, 모드끼리도 서로 배타적이다.
   흰 칩은 늘 하나라 "지금 탭이 뭘 하는지"가 한눈에 보인다. */
let selHitIns = '';
function selectCymbalHit(id){
  if(!['crash','ride','splash','china','fx'].includes(id))return;
  selArt=ART.NORM;selStick=0;selOrn=0;selTie=0;selHitIns=id;
  if(rosterOff.delete(id)){
    rebuildRoster();rosterSave();buildGrid();refreshGrid();refreshStepDots();renderScore();
  }
  syncArtRow();
  const cell=gridEl.querySelector(`.cell[data-measure="${selMeasure}"][data-ins="${id}"]`);
  if(cell){cell.focus({preventScroll:true});cell.scrollIntoView({block:'nearest',inline:'nearest'});}
  previewSound(id,ART.NORM);
}
function syncArtRow(){
  const mode = selStick || selOrn || selTie;
  document.querySelectorAll('#artRow button').forEach(x=>{
    const st = +x.dataset.stick || 0, on = +x.dataset.orn || 0, ti = +x.dataset.tie || 0;
    const selected = x.dataset.hitIns ? (!mode&&selArt===ART.NORM&&selHitIns===x.dataset.hitIns) :
      st ? st === selStick :
      on ? on === selOrn   :
      ti ? selTie === 1    :
      (!mode && !selHitIns && +x.dataset.art === selArt);
    x.classList.toggle('sel',selected);x.setAttribute('aria-pressed',String(selected));
  });
  gridEl.querySelectorAll('.rowlabel').forEach(row=>row.classList.toggle('target-row',!!selHitIns&&row.querySelector('.rowbrush')?.dataset.ins===selHitIns));
  const hint=document.getElementById('hitTargetHint');
  if(hint){hint.hidden=!selHitIns;hint.textContent=selHitIns?(LANG==='ko'?`${byId[selHitIns].name} 행의 칸을 눌러 일반 타격을 입력하세요.`:`Select a cell in the ${byId[selHitIns].name} row to enter a normal hit.`):'';}
  syncOrnInsRow();
}
/* 꾸밈 악기 줄 (2026-10-02). 꾸밈음 모드일 때만 펴진다. 칩은 "같은 악기" + 손 악기들 —
   로스터·언어가 바뀌면 이름이 달라지므로 서명(sig)이 다를 때만 다시 만든다 */
function syncOrnInsRow(){
  const row = document.getElementById('ornInsRow');
  if(!row) return;
  row.classList.toggle('on', !!selOrn);
  if(!selOrn) return;
  const want = [{id:'', name:t('같은 악기')}].concat(HAND_INS.map(i => ({id:i.id, name:i.name})));
  const sig = want.map(w => w.id + ':' + w.name).join('|');
  if(row.dataset.sig !== sig){
    row.dataset.sig = sig;
    row.querySelectorAll('button').forEach(b => b.remove());
    want.forEach(w => {
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.gins = w.id; b.textContent = w.name;
      b.setAttribute('data-no-i18n', '');            // 이미 고른 언어의 이름이다
      b.onclick = () => { selOrnIns = w.id; syncOrnInsRow(); };
      row.appendChild(b);
    });
  }
  if(selOrnIns && !HAND_INS.some(i => i.id === selOrnIns)) selOrnIns = '';
  row.querySelectorAll('button').forEach(b => b.classList.toggle('sel', (b.dataset.gins || '') === selOrnIns));
}
document.querySelectorAll('#artRow button').forEach(b=>{
  b.onclick = ()=>{
    if(b.dataset.hitIns){selectCymbalHit(b.dataset.hitIns);return;}
    selHitIns='';
    if(b.dataset.tie){
      selTie = selTie ? 0 : 1;                  // 같은 걸 또 누르면 모드 해제
      selStick = 0; selOrn = 0;
    } else if(b.dataset.stick){
      const v = +b.dataset.stick;
      selStick = (selStick === v) ? 0 : v;      // 같은 걸 또 누르면 모드 해제
      selOrn = 0; selTie = 0;
    } else if(b.dataset.orn){
      const v = +b.dataset.orn;
      selOrn = (selOrn === v) ? 0 : v;
      selStick = 0; selTie = 0;
    } else {
      selArt = +b.dataset.art;
      selStick = 0; selOrn = 0; selTie = 0;
    }
    syncArtRow();
  };
});
['pointerdown','focusin'].forEach(type=>gridEl.addEventListener(type,event=>{
  const cell=event.target.closest?.('.cell');
  if(selHitIns&&cell&&cell.dataset.ins!==selHitIns){selHitIns='';syncArtRow();}
},true));

/* 프리셋 */
const PRESETS = {
  rock8(){ const m = emptyMeasure();
    [0,2,4,6,8,10,12,14].forEach(s=>m.hihat[s]=1);
    m.kick[0]=m.kick[10]=1; m.snare[4]=m.snare[12]=1; return m; },
  groove16(){ const m = emptyMeasure();
    for(let s=0;s<16;s++) m.hihat[s]=1;
    m.kick[0]=m.kick[6]=m.kick[10]=1; m.snare[4]=m.snare[12]=1; return m; },
  fill(){ const m = emptyMeasure();
    [0,1,2,3].forEach(s=>m.snare[s]=1);
    [4,5,6,7].forEach(s=>m.tom1[s]=1);
    [8,9,10,11].forEach(s=>m.tom2[s]=1);
    [12,13,14].forEach(s=>m.ftom[s]=1);
    m.crash[15]=1; m.kick[15]=1; return m; },
};
/* 처음 여는 사람이 보는 4마디 (2026-08-18).
   전에는 시범용으로 8비트 **한 마디**만 깔았다. 그것만 보면 이 앱이 무엇까지
   하는지 알 수가 없다 — 고스트도 액센트도 필인도 없는 화면이라, 심사관도
   처음 온 드러머도 재생을 눌러 볼 이유를 못 찾는다.
   그래서 **그루브 3마디 + 필인 1마디**로 늘렸다. 표기를 자랑하려고 흩뿌리지 않고
   실제로 그 자리에 쓰이는 것만 넣었다 — 3마디 끝의 고스트, 필인의 R·L과 플램.
   저장된 작업이 있으면 이건 아예 안 깔린다(맨 아래 `_restored` 분기). */
/* 예제 곡에는 **이름이 있어야 한다** (2026-08-21).
   제목 칸이 비어 있으면 처음 연 사람은 "만들다 만 화면"을 본다 — 심사관도 마찬가지다.
   한 줄로 "이건 예제다"를 말해 주는 값이라 곡 내용만큼이나 값을 한다. */
const DEMO_TITLE = '8비트 그루브 — 예제';
function demoSong(){
  const A = {N:1, G:2, ACC:3, OPEN:4};
  const g = () => { const m = emptyMeasure();
    [0,2,4,6,8,10,12,14].forEach(s=>m.hihat[s]=A.N);
    m.snare[4]=m.snare[12]=A.N; m.kick[0]=m.kick[6]=m.kick[10]=A.N; return m; };
  const m1 = g(), m2 = g(), m3 = g();
  m2.snare[10] = A.G;                       // 2마디 — 고스트 하나
  m3.hihat[14] = A.OPEN; m3.snare[7] = A.G; // 3마디 — 오픈 하이햇으로 넘어간다
  const m4 = emptyMeasure();                // 4마디 — 16분 필인
  [0,1,2,3].forEach(s=>m4.snare[s]=A.N);
  [4,5].forEach(s=>m4.tom1[s]=A.N);
  [6,7].forEach(s=>m4.tom2[s]=A.N);
  [8,9,10,11].forEach(s=>m4.ftom[s]=A.N);
  [12,13].forEach(s=>m4.snare[s]=A.N);
  m4.ftom[14] = A.N; m4.crash[15] = A.N; m4.kick[0] = m4.kick[8] = m4.kick[15] = A.N;
  m4.stick = new Array(voiceLen(m4,'hand')).fill(0);
  [0,2,4,6,8,10,12,14].forEach(s=>m4.stick[s]=1);   // R
  [1,3,5,7,9,11,13].forEach(s=>m4.stick[s]=2);      // L
  m4.orn = {snare: new Array(voiceLen(m4,'hand')).fill(0)};
  m4.orn.snare[12] = 1;                              // 플램
  return [m1, m2, m3, m4];
}

document.getElementById('presetSel').onchange = e=>{
  const k = e.target.value; if(!k) return;
  measures[selMeasure] = PRESETS[k]();
  e.target.value='';
  refreshGrid(); renderScore(); refreshStepDots(); commit();
};

/* ── 플랫폼 판정 — **파일 앞쪽에 있어야 한다** ────────────
   아래 `initFeedback`과 `initIntro`가 `IS_NATIVE`를 본다. const는 선언 전에
   읽으면 던지므로(TDZ) 원래 자리(악보 계산 뒤)에 두면 부팅이 통째로 죽는다.
   2026-08-19에 실제로 냈던 오류다 — 옮기면서 이 주석을 남긴다. */
/* iPadOS 13+는 자신을 Mac이라고 말한다("Macintosh" UA). 터치 포인트로 갈라낸다 —
   진짜 맥은 maxTouchPoints가 0이다.
   navigator.platform은 폐기 예정이라 UA로 본다(테스트에서도 덮어쓰기 쉽다). */
const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
            || (/Mac/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

/* 네이티브 껍데기(Capacitor) 안에서 도는지. 웹과 갈리는 분기는 **이 상수 하나만** 본다.
   `Capacitor.isNativePlatform()`은 웹에도 있지만 false를 준다.
   앱에서는 프로토콜이 `capacitor:`라 `ANALYTICS_ON`(https 판정)이 저절로 꺼진다 —
   즉 앱은 네트워크 요청이 0이고, 앱스토어 개인정보 설문의 "수집 없음"이 참이 된다. */
const IS_NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform
                     && window.Capacitor.isNativePlatform());
/* 아이패드 앱을 맥(Apple Silicon)에서 돌리는 중인가 (2026-10-12). iOS 플랫폼인데 터치가 없다 —
   진짜 아이패드는 트랙패드를 붙여도 화면 터치가 남아 any-pointer:coarse가 참이다.
   쓰는 곳은 CSS `html.is-mac` 하나(맥 스크롤 막대가 팔레트를 덮는 문제) */
const IS_MAC_APP = IS_NATIVE && !!(window.Capacitor.getPlatform && window.Capacitor.getPlatform() === 'ios')
  && (navigator.maxTouchPoints === 0 || !(window.matchMedia && matchMedia('(any-pointer: coarse)').matches));
if(IS_MAC_APP) document.documentElement.classList.add('is-mac');

/* 안드로이드 네이티브인지. **PDF 경로가 여기서 갈린다.**
   iOS는 `WKWebView.createPDF`로 rect를 한 쪽씩 떠서 붙이지만(아래 pdfBtn),
   안드로이드 WebView에는 그런 API가 없다. 대신 시스템 인쇄 프레임워크
   (`createPrintDocumentAdapter`)가 **웹 인쇄와 같은 파이프라인**을 쓴다 —
   `@media print`가 그대로 먹고 글자도 벡터로 남는다.
   그래서 안드로이드는 `pdf-out`을 **붙이지 않는다**. 붙이면 `.pdf-pt`의
   595px 페이지 박스가 A4 종이 위에서 6.2인치로 줄어든다.

   프로토콜로는 못 가른다 — Capacitor의 안드로이드 기본 스킴이 `https`다.
   getPlatform()을 먼저 보고, 없으면 UA로 떨어진다. */
const IS_ANDROID = IS_NATIVE && (
  (window.Capacitor.getPlatform && window.Capacitor.getPlatform() === 'android')
  || /Android/i.test(navigator.userAgent));

/* 안드로이드 태블릿에는 Apple Pencil이 없다. **기능은 그대로 돈다** —
   펜 분기는 `pointerType === 'pen'`만 보고, 삼성 S펜과 USI 스타일러스가
   같은 값을 준다. 갈아 끼우는 건 **이름뿐**이다.

   왜 한글 이름을 안 쓰는가: 화면 문구는 한국어 원문이 곧 영어 사전의 열쇠다
   (`t()`). 여기에 '스타일러스'를 넣으면 영어 화면에 한글이 남는다
   (`verify-i18n.js`가 못 박는 자리). 'Apple Pencil'이 그랬듯 이 칸은
   제품 이름 자리라 영어 한 단어로 두는 게 두 언어에서 다 맞다. */
const PEN_BRAND = IS_ANDROID ? 'Stylus' : 'Apple Pencil';

/* 펜 라벨 갈아 끼우기 — **반드시 `PEN_BRAND` 정의 뒤에 있어야 한다.**
   원래 이 블록이 3900행대(펜 입력 감지 옆)에 있었는데, 그 자리는 `IS_ANDROID`
   정의(이 아래)보다 **위**라 부팅 때 TDZ로 던졌고 **앱이 통째로 백지가 됐다**
   (2026-08-27 실측: `Cannot access 'IS_ANDROID' before initialization`,
   그리드 0칸 · 악보 0개). `STORAGE_OK`·`IS_NATIVE`에 이은 **세 번째** 같은 사고다.

   같은 자리의 토스트(`.replace(…, PEN_BRAND)`)는 `setTimeout` 안이라 나중에 돌아
   무사했다 — **즉시 도는 최상위 코드만** 이 규칙에 걸린다.

   `penRow`는 hidden일 뿐 DOM에는 처음부터 있으므로 여기서 한 번만 갈면 된다. */
if(IS_ANDROID){
  const _pb = document.getElementById('penBrandLbl');
  if(_pb) _pb.textContent = PEN_BRAND;
}

/* ---- 베타 피드백 ----
   마케터 자문: **게시판을 직접 만들지 말 것.** 1인 개발이 스팸·운영·개인정보를
   통째로 떠안게 되고, 글이 세 개뿐인 공개 게시판은 "죽은 앱"으로 보인다.
   그래서 두 갈래로 나눈다 — 버그·요청은 구글폼(비공개), 대화는 카카오 오픈채팅.

   ▼▼▼ 주소 두 줄만 채우면 버튼이 나타납니다. 비워 두면 그 버튼은 숨습니다 ▼▼▼
   (죽은 링크가 배포되지 않게 일부러 이렇게 했다) */
const FEEDBACK = {
  // `?usp=publish-editor`는 편집기에서 복사할 때 붙는 꼬리표라 뗐다.
  // 남겨 두면 프리필을 붙일 때 usp 파라미터가 두 번 들어간다
  form: '',
  // 화면 정보를 자동으로 채울 항목 id. 구글폼 ⋮ → "미리 채워진 링크 가져오기"에서
  // 건의 문항에 아무 글자나 넣고 링크를 복사하면 entry.숫자가 보인다.
  // 비워 두면 대신 클립보드에 복사해서 붙여넣게 한다
  formEntry: '',
  kakao: '',
};
/* 시작 안내를 "이 버전에서 한 번"만 띄우는 열쇠로도 쓴다.
   그러니 내용이 바뀐 배포에서는 이 날짜를 올려야 기존 사용자도 안내를 다시 본다 */
/* 같은 날 두 번째 배포라 뒤에 b를 붙였다 — 이 값이 바뀌어야 시작 안내가 다시 뜬다
   (날짜만 쓰면 오전에 받은 사람은 새 기능 안내를 못 본다) */
const APP_VER = '2026-10-19';   // 2.1 — 카피 탭·드럼 볼륨·악보 크기·크래쉬 ⊗·메트로놈 손질

/* ================= 익명 사용 통계 =================
   2026-08-13. 60~70명이 쓰는데 **무엇을 쓰는지 볼 방법이 없어서** 붙였다.

   **원칙 — 이 줄을 넘지 않는다.**
   악보 내용, 곡 제목, 저장한 것, 무엇 하나 보내지 않는다.
   보내는 건 **"이 기능이 한 번 쓰였다"는 이름 하나뿐**이고, 한 번 켠 동안 이름당 한 번만 간다.
   그래서 "몇 명이 재생까지 갔나"는 알 수 있어도 "누가 무엇을 썼는지"는 우리도 모른다.
   개인정보처리방침(privacy.html)에 이대로 적어 뒀다. 여기를 고치면 그 문서도 같이 고칠 것.

   **Vercel Web Analytics를 쓴다.** 처음엔 Umami를 붙였다가 갈아탔다 —
   Pro 요금제에서는 커스텀 이벤트가 되고, 보관 기간이 12개월이며,
   무엇보다 **제3자가 하나도 안 늘어난다**(Vercel은 이미 호스팅으로 방침에 적혀 있다).
   쿠키를 쓰지 않고 개인을 식별하지 않는 것도 같다.
   Hobby로 내려가면 커스텀 이벤트가 막히니, 그때는 이 구역만 Umami로 되돌리면 된다.

   `va()`는 스크립트가 늦게 떠도 호출을 큐에 쌓는다(vaq) — 그래서 우리 쪽 대기열이 필요 없다.
   스크립트는 **Vercel에 올라간 https 주소에서만** 붙인다. 로컬 파일과 검사에서는 아예 안 붙어
   실서비스 숫자에 섞이지 않는다. */
// Personal workspace: no analytics client, queue, script or network event.
function track(_name) {}

/* 저장소를 아예 못 쓰는 환경(사파리 사생활 보호)에서는 "자동 저장됩니다"라고
   말하면 거짓말이 된다. 자동 저장 본체는 한참 아래(「자동 저장」 구역)에 있지만,
   **시작 안내가 이 값을 읽어 문구를 갈아 끼우므로 여기서 먼저 정한다.**
   아래로 내리면 안내 IIFE가 먼저 돌아 TDZ 오류로 앱이 통째로 안 뜬다 — 실제로 겪었다. */
const STORAGE_OK = (function(){
  try{
    const k = 'maidrum.probe';
    localStorage.setItem(k, '1'); localStorage.removeItem(k);
    return true;
  }catch(e){ return false; }
})();

/* 버그 재현에 필요한 것만 짧게. 개인정보는 담지 않는다 */
function envNote(){
  const w = window.innerWidth, h = window.innerHeight;
  const ed = document.body.classList.contains('edition-ipad') ? '2단'
           : document.body.classList.contains('edition-pad')  ? 'Studio' : 'LITE';
  return `따쿵따다둥 ${APP_VER} / ${w}×${h} ${w>h?'가로':'세로'} / ${ed} / ${measures.length}마디 / ${navigator.userAgent}`;
}

(function initFeedback(){
  const box  = document.getElementById('feedback');
  const bForm = document.getElementById('fbForm');
  const aChat = document.getElementById('fbChat');
  if(FEEDBACK.kakao){ aChat.href = FEEDBACK.kakao; aChat.hidden = false; }

  /* 앱에서는 "베타" 딱지를 뗀다 — 심사 지침 2.2. 의견 창구는 그대로 둔다,
     그건 베타의 표시가 아니라 지원 경로다 */
  const beta = document.getElementById('fbBeta');
  if(beta && IS_NATIVE) beta.remove();
  // 앱 안에서 앱스토어 링크는 무의미하다 — 뗀다. 웹에서는 눌린 횟수를 센다
  const store = document.getElementById('fbStore');
  if(store){ if(IS_NATIVE) store.remove(); else store.addEventListener('click', ()=> track('store-foot')); }
  const play = document.getElementById('fbPlay');
  if(play){ if(IS_NATIVE) play.remove(); else play.addEventListener('click', ()=> track('play-foot')); }

  /* 안내는 **누른 순간에** 띄운다.
     평소에 "기기 정보를 복사해 두니 붙여넣어 주세요"라고 적어 두면
     아직 아무것도 안 한 사람에게는 무슨 말인지 모를 소리다.
     복사가 실제로 됐을 때만 붙여넣으라고 말한다 — 클립보드는 막힐 수 있다. */
  const tip = box.querySelector('.tip');
  const REST = tip ? tip.innerHTML : '';
  let tipTimer = null;
  function say(html){
    if(!tip) return;
    tip.innerHTML = html;
    clearTimeout(tipTimer);
    tipTimer = setTimeout(()=>{ tip.innerHTML = REST; }, 25000);
  }

  if(FEEDBACK.form){
    bForm.hidden = false;
    bForm.onclick = ()=>{
      const note = envNote();
      let url = FEEDBACK.form;
      if(FEEDBACK.formEntry){
        // 폼 항목 id를 알려 주면 자동으로 채워 넣는다. 이때는 안내가 필요 없다
        url += (url.includes('?') ? '&' : '?') +
               'usp=pp_url&' + encodeURIComponent(FEEDBACK.formEntry) + '=' + encodeURIComponent(note);
      } else if(navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(note)
          .then(()=> say('지금 쓰시는 <b>기기와 화면 크기</b>를 복사해 뒀어요.<br>'
                       + '폼 안에 <b>길게 눌러 붙여넣기</b> 하시면 어디서 생긴 일인지 알 수 있어 큰 도움이 됩니다.'))
          .catch(()=> say('어떤 기기(아이폰·아이패드 등)에서 생긴 일인지 폼에 같이 적어 주시면 큰 도움이 됩니다.'));
      } else {
        say('어떤 기기(아이폰·아이패드 등)에서 생긴 일인지 폼에 같이 적어 주시면 큰 도움이 됩니다.');
      }
      window.open(url, '_blank', 'noopener');
    };
  }
  // 피드백 주소가 비면 그 버튼만 숨는다 — 죽은 링크를 내보내지 않는다.
  // 줄 자체는 항상 남긴다. 이제 여기에 '정보'(라이선스 고지)가 같이 있고,
  // 그건 조건 없이 늘 닿을 수 있어야 하기 때문이다
  box.hidden = false;
})();

/* ---- 설정 / 내보내기 팝업 ----
   상단바를 네 개로 유지하려고 만든 서랍 둘. 여기 든 것은 **전부 표시 설정**이고
   곡 데이터는 아무것도 안 건드린다 — `commit()`도 자동 저장도 안 탄다.

   **`pointerup`에서 여는 팝업이 아니라 `click`으로 연다.** 상단바 버튼이라
   markPop이 밟았던 "열자마자 배경 클릭으로 닫힘" 함정이 없다. */
(function initSettings(){
  const wire = (btnId, popId, closeId)=>{
    const pop = document.getElementById(popId);
    const close = ()=> pop.classList.remove('is-open');
    document.getElementById(btnId).onclick = ()=> pop.classList.add('is-open');
    document.getElementById(closeId).onclick = close;
    pop.addEventListener('click', e=>{ if(e.target === pop) close(); });
    document.addEventListener('keydown', e=>{
      if(e.key === 'Escape' && pop.classList.contains('is-open')) close();
    });
    return { pop, close };
  };
  const setP = wire('setBtn', 'setPop', 'setClose');
  const expP = wire('saveBtn', 'savePop', 'expClose');

  /* 고르면 **바로 다시 그린다.** 팝업을 닫아야 보이면 뭘 고른 건지 모른다.
     `renderScore()` 하나로 충분하다 — 레이아웃 계산이 전부 거기서 다시 돈다. */
  const seg = (boxId, get, set)=>{
    const box = document.getElementById(boxId);
    const sync = ()=> box.querySelectorAll('button').forEach(x=>
      x.classList.toggle('sel', x.dataset[get.key] === String(get())));
    sync();
    box.addEventListener('click', e=>{
      const t = e.target.closest('button'); if(!t) return;
      set(t.dataset[get.key]); sync(); renderScore();
    });
  };
  /* 언어는 `seg`를 안 쓴다 — `renderScore()`만으로는 모자라고 화면 글자를 통째로
     갈아 끼워야 한다(`setLang`). 고른 표시는 `refreshLangUI`가 맡는다 */
  const langBox = document.getElementById('langScope');
  if(langBox) langBox.addEventListener('click', e=>{
    const b = e.target.closest('button'); if(!b) return;
    setLang(b.dataset.lang);
  });

  const gBarnum = ()=> SHOW_BARNUM ? 'on' : 'off'; gBarnum.key = 'barnum';
  seg('barnumScope', gBarnum, v=>{
    SHOW_BARNUM = (v === 'on');
    try{ localStorage.setItem(BARNUM_KEY, v); }catch(e){}
  });
  const gMrest = ()=> SHOW_MREST ? 'on' : 'off'; gMrest.key = 'mrest';
  seg('mrestScope', gMrest, v=>{
    SHOW_MREST = (v === 'on');
    try{ localStorage.setItem(MREST_KEY, v); }catch(e){}
  });

  const gStem = ()=> MERGE_STEMS ? 'merge' : 'split'; gStem.key = 'stems';
  seg('stemScope', gStem, v=>{
    MERGE_STEMS = (v === 'merge');
    try{ localStorage.setItem(STEMS_KEY, MERGE_STEMS ? 'merge' : 'split'); }catch(e){}
  });
  const gCrash = ()=> CRASH_RING ? 'ring' : 'x'; gCrash.key = 'crash';
  seg('crashScope', gCrash, v=>{
    CRASH_RING = (v === 'ring');
    try{ localStorage.setItem(CRASH_KEY, CRASH_RING ? 'ring' : 'x'); }catch(e){}
  });
  /* 메트로놈 소리는 **눌러 보면 바로 들려야** 한다 — 재생을 시작해야 알 수 있으면
     뭘 고른 건지 모른 채 팝업을 닫게 된다. 고른 즉시 그 소리로 한 박 들려준다. */
  const gMet = ()=> MET_VOICE ? 'voice' : 'click'; gMet.key = 'met';
  seg('metScope', gMet, v=>{
    MET_VOICE = (v === 'voice');
    try{ localStorage.setItem(MET_KEY, MET_VOICE ? 'voice' : 'click'); }catch(e){}
    if(!playing){ const c = ac(); c.resume(); metClick(c.currentTime + 0.06, 0); }   // VOICE_LEAD보다 넉넉히
  });
  /* 드럼 사운드도 같은 이유로 고르면 바로 들려준다. 일렉트로는 디코드가 끝난 뒤에 —
     안 기다리면 아직 버퍼가 없어 신스가 나와 "안 바뀌었나?"가 된다 */
  document.getElementById('kitGroup').hidden = !Object.keys(KIT_ELECTRO).length;   // 데이터가 든 사본(앱)에서만 보인다
  const gKit = ()=> KIT; gKit.key = 'kit';
  seg('kitScope', gKit, v=>{
    if(v !== 'acoustic' && v !== 'electro') return;
    KIT = v;
    try{ localStorage.setItem(KIT_KEY, v); }catch(e){}
    const c = ac(); c.resume();                       // 제스처 안에서 미리 깨운다
    applyKit().then(()=>{ if(KIT === v && !playing) previewSound('snare'); });
  });
  const gPaper = ()=> PAPER; gPaper.key = 'paper';
  seg('paperScope', gPaper, v=>{
    if(!PAPERS[v]) return;
    PAPER = v; applyPaper();
    try{ localStorage.setItem(PAPER_KEY, v); }catch(e){}
  });
  const gZoom = ()=> SCORE_ZOOM; gZoom.key = 'zoom';
  seg('zoomScope', gZoom, v=>{
    v = +v; if(!ZOOMS.includes(v)) return;
    SCORE_ZOOM = v;
    try{ localStorage.setItem(ZOOM_KEY, String(v)); }catch(e){}
  });
  const gText = ()=> TEXT_SIZE; gText.key = 'textsize';
  seg('textScope', gText, v=>{
    if(!TEXT_SIZES[v]) return;
    TEXT_SIZE = v;
    try{ localStorage.setItem(TEXT_KEY, v); }catch(e){}
  });
  const gGap = ()=> LINE_GAP_K; gGap.key = 'linegap';
  seg('gapScope', gGap, v=>{
    if(LINE_GAPS[v] === undefined) return;
    LINE_GAP_K = v;
    try{ localStorage.setItem(LINEGAP_KEY, v); }catch(e){}
  });
  const gSec = ()=> SEC_BREAK ? 'on' : 'off'; gSec.key = 'secbreak';
  seg('secScope', gSec, v=>{
    SEC_BREAK = (v === 'on');
    try{ localStorage.setItem(SECBREAK_KEY, v); }catch(e){}
  });
  const gSext = ()=> SEXT_SPLIT ? 'split' : 'joined'; gSext.key = 'sext';
  seg('sextScope', gSext, v=>{
    SEXT_SPLIT = (v !== 'joined');
    try{ localStorage.setItem(SEXT_KEY, SEXT_SPLIT ? 'split' : 'joined'); }catch(e){}
  });
  const gMulti = ()=> MULTI_REST ? 'on' : 'off'; gMulti.key = 'multirest';
  seg('multirestScope', gMulti, v=>{
    MULTI_REST = (v === 'on');
    try{ localStorage.setItem(MULTIREST_KEY, v); }catch(e){}
  });
  const gStick = ()=> STICK_POS; gStick.key = 'stickpos';
  seg('stickScope', gStick, v=>{
    STICK_POS = (v === 'below') ? 'below' : 'above';
    try{ localStorage.setItem(STICK_KEY, STICK_POS); }catch(e){}
  });

  /* 펜 항목은 `seg`를 안 쓴다 — 보임 여부까지 같이 맞춰야 해서 `syncPenUI`가 겸한다 */
  document.getElementById('penScope').addEventListener('click', e=>{
    const t = e.target.closest('button'); if(!t) return;
    setPenOnly(t.dataset.penonly === '1');
  });
  syncPenUI();

  /* ---- 악기 로스터 ----
     보임 / 이름 / 순서를 한 목록에서 고친다. 고칠 때마다 바로 반영한다 —
     "적용" 버튼을 두면 뭘 눌렀는지와 화면이 어긋나는 시간이 생긴다. */
  wire('setIns', 'insPop', 'insClose');
  const listEl = document.getElementById('insList');
  const sumEl  = document.getElementById('insSummary');
  function insSummary(){
    const n = CATALOG.length - rosterOff.size;
    sumEl.textContent = rosterOff.size
      ? t('{n}개가 보입니다 — 숨김: ').replace('{n}', n)
        + [...rosterOff].map(id=>insName(CAT_BY_ID[id])).join(', ')
      : t('{n}개 모두 보입니다.').replace('{n}', CATALOG.length);
  }
  /* 로스터가 바뀌면 **입력판을 통째로 다시 만든다.** 줄이 늘거나 줄거나 순서가 바뀌므로
     칸만 갱신하는 `refreshGrid()`로는 모자란다. 악보도 다시 그린다(숨긴 악기가 빠져야 한다). */
  function insApply(){
    rebuildRoster(); rosterSave();
    buildGrid(); refreshGrid(); refreshStepDots(); renderScore(); insSummary();
  }
  function insDraw(){
    listEl.innerHTML = '';
    rosterOrder.forEach((id, ri)=>{
      const c = CAT_BY_ID[id], on = !rosterOff.has(id);
      const row = document.createElement('div');
      row.className = 'insitem ' + (on ? 'on' : 'off');

      const sh = document.createElement('button');
      sh.className = 'insshow'; sh.textContent = on ? '✓' : '';
      sh.title = t(on ? '{ins} 숨기기' : '{ins} 보이기').replace('{ins}', insName(c));
      sh.setAttribute('aria-label', sh.title);
      sh.setAttribute('aria-pressed', on ? 'true' : 'false');
      sh.onclick = ()=>{
        if(on){
          // 마지막 하나는 못 끈다. 입력판이 텅 비면 아무것도 못 찍는다
          if(rosterOff.size >= CATALOG.length - 1){ toast('악기를 하나는 남겨 두세요.'); return; }
          if(measures.some(m => (m[id]||[]).some(v=>v)))
            toast(t('{ins}에 음표가 있습니다 — 숨겨도 지워지지 않습니다.').replace('{ins}', insName(c)));
          rosterOff.add(id);
        } else rosterOff.delete(id);
        insApply(); insDraw();
      };

      /* 윗줄에 **기본 이름**, 아랫줄 입력칸에 **바꿀 이름**.
         입력칸이 비면 기본 이름을 그대로 쓴다(placeholder가 그 사실을 보여 준다) —
         "되돌리기" 버튼을 따로 둘 필요가 없다. 비우는 게 곧 되돌리기다. */
      const main = document.createElement('div');
      main.className = 'insmain';
      const base = document.createElement('span');
      base.className = 'insbase';
      const nm = document.createElement('input');
      nm.className = 'insname'; nm.type = 'text'; nm.maxLength = 12;
      nm.placeholder = insName(c);
      nm.value = rosterNames[id] || '';
      nm.setAttribute('aria-label', t('{ins} 이름 바꾸기').replace('{ins}', insName(c)));
      const paint = ()=>{
        const has = !!rosterNames[id];
        base.textContent = has ? `${insName(c)}  →` : insName(c);
        base.title = has ? t('기본 이름: {ins}').replace('{ins}', insName(c)) : '';
        row.classList.toggle('renamed', has);
      };
      const rename = ()=>{
        const v = nm.value.trim().slice(0, 12);
        // 비우거나 기본 이름을 그대로 넣으면 **덮어쓴 걸 지운다**
        if(!v || v === c.name) delete rosterNames[id]; else rosterNames[id] = v;
        nm.value = rosterNames[id] || '';
        paint(); insApply();
      };
      nm.onchange = rename;
      nm.onblur = rename;
      nm.onkeydown = e=>{ if(e.key === 'Enter') nm.blur(); };
      paint();
      /* 악기별 볼륨 (2.1) — 이름칸 아래 한 줄. 0이면 그 악기만 소리가 꺼진다(음표는 그대로) */
      const vr = document.createElement('div');
      vr.className = 'insvol';
      const vs = document.createElement('input');
      vs.type = 'range'; vs.min = 0; vs.max = insVolumeMax(id); vs.step = 5; vs.value = insVolOf(id);
      vs.setAttribute('aria-label', t('{ins} 볼륨').replace('{ins}', insName(c)));
      const vv = document.createElement('b');
      vv.setAttribute('data-no-i18n', '');
      const vpaint = ()=>{ const v = insVolOf(id); vv.textContent = v === 0 ? t('끔') : String(v); row.classList.toggle('muted', v === 0); };
      vs.oninput = ()=>{ setInsVol(id, vs.value); vpaint(); };
      vs.onchange = ()=>{ try{ previewSound(id); }catch(e){} };   // 놓을 때 한 번 들려준다
      vpaint();
      vr.append(vs, vv);
      main.append(base, nm, vr);

      const mv = (dir, label, dis)=>{
        const b = document.createElement('button');
        b.className = 'insmv'; b.textContent = label; b.disabled = dis;
        /* 초점을 되돌릴 때 이 title로 버튼을 다시 찾는다 — 문구가 언어를 타므로
           **두 곳이 같은 식으로** 만들어져야 한다. 한 곳만 고치면 초점이 사라진다 */
        const mvTitle = t(dir < 0 ? '{ins} 위로' : '{ins} 아래로').replace('{ins}', insName(c));
        b.title = mvTitle;
        b.setAttribute('aria-label', b.title);
        b.onclick = ()=>{
          const j = ri + dir;
          rosterOrder.splice(j, 0, rosterOrder.splice(ri, 1)[0]);
          insApply(); insDraw();
          // 옮긴 줄의 같은 버튼으로 초점을 되돌린다 — 연달아 누르려면 필요하다
          const nb = listEl.children[j] && listEl.children[j].querySelector(
            `.insmv[title="${mvTitle.replace(/"/g, '&quot;')}"]`);
          if(nb && !nb.disabled) nb.focus();
        };
        return b;
      };
      row.append(sh, main, mv(-1, '▲', ri === 0), mv(+1, '▼', ri === rosterOrder.length - 1));
      listEl.appendChild(row);
    });
  }
  // 설정 위에 겹쳐 띄우지 않는다. 팝업 두 장이 포개지면 바깥을 눌러 닫을 때 뭐가 닫히는지 모른다
  document.getElementById('setIns').addEventListener('click', ()=>{ setP.close(); insDraw(); });
  document.getElementById('insReset').onclick = ()=>{
    rosterOff = new Set(DEFAULT_OFF); rosterOrder = CAT_ORDER.slice(); rosterNames = {};
    CATALOG.forEach(c=> setInsVol(c.id, 100));   // 악기별 볼륨도 기본(100)으로
    insApply(); insDraw();
  };
  insSummary();

  // 정보는 설정 안에서 연다 — 라이선스 고지는 계속 화면에 있어야 한다(OFL)
  document.getElementById('setInfo').onclick = ()=>{
    setP.close(); document.getElementById('infoPop').classList.add('is-open');
  };
  /* 새 소식 — 시작 안내를 설정에서 연다 (2026-09-07). 웹은 바로 실행되고
     안내가 저절로 뜨지 않으므로 여기가 유일한 문이다.
     내용 채우기(버전·문구·피드백 버튼)는 initIntro가 부팅 때 해 둔다. */
  document.getElementById('setIntro').onclick = ()=>{
    setP.close(); document.getElementById('introPop').classList.add('is-open');
  };
  // 무언가를 내보내면 팝업을 닫는다. 시트가 뜨는데 그 뒤에 팝업이 남아 있으면 지저분하다
  ['pngBtn','pdfBtn','saveFileBtn'].forEach(id=>
    document.getElementById(id).addEventListener('click', ()=> expP.close()));
})();

/* ---- 정보 / 라이선스 ----
   OFL은 저작권 고지 유지를 요구한다. 코드 주석은 배포물에서 안 보이므로 화면에 둔다. */
(function initInfo(){
  const pop = document.getElementById('infoPop');
  document.getElementById('infoVer').textContent = APP_VER;

  const bFb = document.getElementById('infoFb');
  const aChat = document.getElementById('infoChat');
  if(FEEDBACK.form){
    bFb.hidden = false;
    bFb.onclick = ()=> window.open(FEEDBACK.form, '_blank', 'noopener');
  }
  if(FEEDBACK.kakao){ aChat.href = FEEDBACK.kakao; aChat.hidden = false; }

  const close = ()=> pop.classList.remove('is-open');
  document.getElementById('infoBtn').onclick = ()=> pop.classList.add('is-open');
  document.getElementById('infoClose').onclick = close;
  pop.addEventListener('click', e=>{ if(e.target === pop) close(); });
  document.addEventListener('keydown', e=>{
    if(e.key === 'Escape' && pop.classList.contains('is-open')) close();
  });
})();

/* ---- 시작 안내 ----
   2026-09-07: 웹에서는 저절로 띄우지 않는다. 인스타그램 등에서 온 첫 방문자가
   관문 없이 바로 써 보는 게 더 중요해서, 안내는 설정 → 새 소식으로 옮겼다.
   앱(구매판)만 버전이 오르면 업데이트 소식을 한 번 띄운다(산 사람에게는
   바뀐 점을 말해 줘야 한다). 내용 채우기와 버튼 연결은 **늘** 해 둔다 —
   설정에서 언제든 열리기 때문이다. localStorage는 사파리 사생활 보호
   모드에서 던진다. 통째로 감싸되 실패하면 앱에서는 매번 띄운다. */
(function initIntro(){
  const pop = document.getElementById('introPop');
  const KEY = 'maidrum.intro';
  let seen = null;
  try{ seen = localStorage.getItem(KEY); }catch(e){}

  document.getElementById('introVer').textContent = APP_VER;

  /* ── 앱에서는 "베타"라는 말을 쓰지 않는다 (2026-08-19) ──────
     두 가지 이유가 있고 둘 다 무겁다.

     하나, **앱스토어 심사 지침 2.2가 베타·데모·시험판을 리젝한다.**
     시험판은 TestFlight로 내라는 것이 애플의 규칙이고, 시작 화면에
     "베타"라고 적혀 있으면 그대로 걸린다.

     둘, **₩19,000을 낸 사람에게 할 말이 아니다.** "기능이 미리 알려 드리지 못한 채
     없어질 수 있습니다", "먼저 써 보시는 소수의 분들께" — 무료 배포에서는
     정직한 문장이지만 유료 앱에서는 변명으로 읽힌다.

     웹(maidrum.com)은 계속 무료로 개발 중이라 베타 문구를 그대로 둔다.
     `IS_NATIVE` 하나로 갈린다 — 파일은 여전히 하나다. */
  /* 2026-08-23: 이건 이제 **그물**이다. 앱에 들어가는 사본은 `build-app.sh`가
     빌드 시점에 이미 베타를 걷어낸다(8-32장). 그래서 여기서는 **아직 안 걷힌
     경우에만** 손을 댄다 — 안 그러면 영어 UI에서 `data-i18n-html`이 넣어 둔
     영문을 이 한국어 문장이 도로 덮어써 버린다.
     변수 이름이 `t`가 아닌 이유: 전역 `t`가 번역 함수다 (8-31장의 그 함정). */
  if(IS_NATIVE){
    const ti = document.getElementById('introTitle');
    // 정규식을 \u로 쓴 이유: build-app.sh가 "주석 밖에 그 글자가 남았는가"로
    // 검사한다. 여기 그대로 쓰면 화면에 안 나오는데도 검사가 걸린다
    if(ti && /\uBCA0\uD0C0/.test(ti.textContent)) ti.textContent = '따쿵따다둥';
    const b = document.getElementById('introBeta');
    if(b) b.remove();
    const e = document.getElementById('introEarly');
    if(e && /먼저 써 보시는/.test(e.textContent))
      e.innerHTML = '구입해 주셔서 고맙습니다. 불편한 점이든 있으면 좋겠는 '
        + '기능이든 알려 주시면 다음 업데이트에 반영하겠습니다.';
  }

  /* 저장소를 못 쓰는 환경에서 "자동 저장됩니다"라고 하면 거짓말이 된다.
     사파리 사생활 보호 창이 그렇다 — 그때는 원래 문구로 되돌린다 */
  if(!STORAGE_OK){
    const w = document.getElementById('introSave');
    if(w) w.innerHTML = '<b>이 창에서는 악보가 자동 저장되지 않습니다.</b><br>'
      + '사생활 보호 모드처럼 저장이 막힌 환경이에요. 새로 고치면 사라지니 '
      + '<b>저장</b>으로 파일을 내려받아 두세요.';
  }

  // 피드백 주소는 한 곳(FEEDBACK)에서만 읽는다. 비어 있으면 그 버튼은 안 나온다
  const bFb = document.getElementById('introFb');
  const aChat = document.getElementById('introChat');
  if(FEEDBACK.form){
    bFb.hidden = false;
    bFb.onclick = ()=> window.open(FEEDBACK.form, '_blank', 'noopener');
  }
  if(FEEDBACK.kakao){ aChat.href = FEEDBACK.kakao; aChat.hidden = false; }

  function close(){
    pop.classList.remove('is-open');
    try{ localStorage.setItem(KEY, APP_VER); }catch(e){}
  }
  document.getElementById('introStart').onclick = close;
  // 바깥을 눌러도 닫힌다. 안내는 관문이 아니라 알림이다
  pop.addEventListener('click', e=>{ if(e.target === pop) close(); });
  document.addEventListener('keydown', e=>{
    if(e.key === 'Escape' && pop.classList.contains('is-open')) close();
  });

  // 자동 표시는 앱에서 버전이 올랐을 때뿐. 웹은 설정 → 새 소식으로 연다 (2026-09-07)
  if(IS_NATIVE && seen !== APP_VER) pop.classList.add('is-open');
})();

/* ---- 패턴 브러시 ----
   드러머 요청 6번. 원문: **"하이햇 패턴은 늘 일정하니 경우의 수 16개를 골라 미리 깔면 좋겠다."**
   한 박은 16분 4칸이므로 켜짐/꺼짐 조합이 2^4 = **16가지**다.

   순서는 이진수 순이 아니라 **실제로 자주 쓰는 순**이다 — 8비트·16비트·4분이 앞에 온다.
   이진수 순으로 두면 0000, 0001처럼 거의 안 쓰는 게 앞자리를 차지한다. */
const BRUSH_PATTERNS = [
  '1010','1111','1000','1110','1011','1101','0111','1100',
  '1001','0110','0101','0011','0100','0010','0001','0000',
];
const BRUSH_LABEL = {'1010':'8분', '1111':'16분', '1000':'4분', '0000':'비움'};
let brushScopeMode = 'all';
let brushInstr = 'hihat';

function applyBrush(pat){
  track('brush');
  const id = brushInstr;
  let from, to;
  if(brushScopeMode === 'one'){ from = selMeasure; to = selMeasure + 1; }
  else if(brushScopeMode === 'sel'){ from = selA(); to = selB() + 1; }
  else { from = 0; to = measures.length; }
  /* 대상 악기만 덮어쓴다. 다른 악기는 건드리지 않는다.
     패턴은 한 박 4칸짜리라 **4분할(과 2분할) 박에만** 얹을 수 있다.
     셋잇단 박에 억지로 얹으면 리듬이 통째로 바뀌므로 그냥 건너뛰고 몇 개를 건드리지
     못했는지 알려 준다 — 조용히 지나가면 "왜 안 깔렸지"가 된다. */
  const voice = byId[id].voice;
  let skipped = 0;
  for(let mi = from; mi < to; mi++){
    const m = measures[mi], arr = m[id];
    for(let b = 0; b < beatCount(m); b++){
      const d = divOf(m, b, voice), off = beatOffset(m, voice, b);
      if(d === 4){
        for(let k=0;k<4;k++) arr[off+k] = pat[k] === '1' ? ART.NORM : ART.OFF;
      } else if(d === 2){
        for(let k=0;k<2;k++) arr[off+k] = pat[k*2] === '1' ? ART.NORM : ART.OFF;
      } else skipped++;
    }
  }
  refreshGrid(); renderScore(); refreshStepDots();
  commit();                     // 한 번의 되돌리기로 통째로 복구된다
  if(skipped) toast(`셋잇단으로 나눈 <b>${skipped}개 박</b>은 그대로 두었습니다.`);
}

/* 팝업으로 뺀 이유: 도구 줄에 악기 선택 + 범위 + 칩 16개를 늘어놓으면 자리를 많이 먹는다.
   **악기 행의 아이콘에서 열면 대상 악기가 위치로 정해져** 선택 UI 자체가 사라진다. */
const brushPop = document.getElementById('brushPop');
function openBrush(insId){
  brushInstr = insId;
  document.getElementById('brushTitle').textContent = (byId[insId] || {}).name || insId;
  const sb = document.querySelector('#brushScope button[data-scope="sel"]');
  if(sb) sb.textContent = selCount() > 1 ? t('선택 {n}마디').replace('{n}', selCount()) : t('선택 구간');
  brushPop.classList.add('is-open');
}
function closeBrush(){ brushPop.classList.remove('is-open'); }
document.getElementById('brushClose').onclick = closeBrush;
brushPop.addEventListener('click', e=>{ if(e.target === brushPop) closeBrush(); });

(function buildBrushes(){
  const box = document.getElementById('brushes');
  BRUSH_PATTERNS.forEach(pat=>{
    const b = document.createElement('button');
    b.className = 'bchip'; b.dataset.p = pat;
    b.title = pat === '0000' ? t('비우기')
      : t('{list}번째 16분').replace('{list}',
          pat.split('').map((c,i)=>c==='1'?(i+1):'').filter(Boolean).join('·'));
    b.setAttribute('aria-label', BRUSH_LABEL[pat] || b.title);
    for(const c of pat){
      const i = document.createElement('i');
      if(c === '1') i.className = 'on';
      b.appendChild(i);
    }
    // 터치에는 hover가 없어 title이 안 보인다. 자주 쓰는 넷은 이름을 붙여 준다
    if(BRUSH_LABEL[pat]){
      const s = document.createElement('span');
      s.textContent = BRUSH_LABEL[pat];
      b.appendChild(s);
    }
    b.onclick = ()=>{ applyBrush(pat); closeBrush(); };
    box.appendChild(b);
  });
  document.querySelectorAll('#brushScope button').forEach(b=>{
    b.onclick = ()=>{
      brushScopeMode = b.dataset.scope;
      document.querySelectorAll('#brushScope button').forEach(x=>x.classList.toggle('sel', x === b));
    };
  });
})();

/* 행 아이콘은 buildGrid()가 매번 다시 만드니 그리드에 위임으로 건다 */
gridEl.addEventListener('click', e=>{
  const b = e.target.closest && e.target.closest('.rowbrush');
  if(b) openBrush(b.dataset.ins);
});

/* ---- 구간 반복 ----
   연습 모드에도 구간 반복이 있지만 그건 연습 패널 쪽이고 패드 전용이다.
   여기 것은 **그냥 재생**에 걸리는 구간이라 독의 반복 버튼 옆에 둔다. */
let loopRange = null;                 // null이면 전체. {a,b}는 0-based 포함 구간
/* MAIN_MEASURE_REPEAT_BEGIN: share the existing sequencer range, never copy notes. */
function measureRepeatState(){
  return {start:loopRange?clampM(loopRange.a):null,end:loopRange?clampM(loopRange.b):null,enabled:!!loopRange&&looping,playing:playing||PLAY_PENDING,pending:PLAY_PENDING,total:measures.length,current:selMeasure,selectedStart:selA(),selectedEnd:selB()};
}
function syncMeasureRepeat(){
  const button=document.getElementById('loopBtn');
  if(button){button.classList.toggle('on',looping);button.setAttribute('aria-pressed',String(looping));}
  refreshRangeBtn();
}
async function playMeasureRepeat(a,b){
  if(!Number.isInteger(a)||!Number.isInteger(b)||a<0||b<0||a>=measures.length||b>=measures.length)return false;
  if(playing||PLAY_PENDING)stopPlay();
  loopRange={a:Math.min(a,b),b:Math.max(a,b)};looping=true;syncMeasureRepeat();
  await startPlay();return playing;
}
function stopMeasureRepeat(clear=false){
  if(playing||PLAY_PENDING)stopPlay();
  if(clear){loopRange=null;looping=false;}
  syncMeasureRepeat();
}
/* MAIN_MEASURE_REPEAT_END */
const rangePop = document.getElementById('rangePop');
const loopAEl = document.getElementById('loopA'), loopBEl = document.getElementById('loopB');
function refreshRangeBtn(){
  window.dispatchEvent(new Event('ddakung-repeat-change'));
  const btn = document.getElementById('rangeBtn');
  if(!btn) return;
  const on = !!loopRange;
  btn.classList.toggle('on', on);
  btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  btn.textContent = on ? `${loopRange.a+1}–${loopRange.b+1}` : '구간';
}
function openRange(){
  const a = loopRange ? loopRange.a : selA(), b = loopRange ? loopRange.b : selB();
  loopAEl.value = a+1; loopBEl.value = b+1;
  rangePop.classList.add('is-open');
}
function closeRange(){ rangePop.classList.remove('is-open'); }
document.getElementById('rangeBtn').onclick = openRange;
document.getElementById('rangeClose').onclick = closeRange;
rangePop.addEventListener('click', e=>{ if(e.target === rangePop) closeRange(); });
document.getElementById('loopFromSel').onclick = ()=>{ loopAEl.value = selA()+1; loopBEl.value = selB()+1; };
document.getElementById('loopApply').onclick = ()=>{
  let a = clampM((+loopAEl.value|0) - 1), b = clampM((+loopBEl.value|0) - 1);
  if(b < a){ const t = a; a = b; b = t; }          // 거꾸로 넣어도 받아 준다
  loopRange = {a, b};
  refreshRangeBtn(); closeRange();
  if(playing){ stopPlay(); startPlay(); }          // 재생 중이면 바로 새 구간으로
};
document.getElementById('loopOff').onclick = ()=>{
  loopRange = null; refreshRangeBtn(); closeRange();
  if(playing){ stopPlay(); startPlay(); }
};

/* ---- 출력 ----
   화면은 폭에 맞춰 줄바꿈하지만 출력은 "줄당 마디 수"를 고정한다.
   드러머가 읽는 종이 악보의 기본은 4마디/줄. */
function perLineOut(){ return +(document.getElementById('perLineSel').value) || 4; }
/* 한 장에 몇 단이 들어가는가 — **높이를 재서** 답한다 (2026-09-02).
   예전에는 `LINES_PER_PAGE = 10`이라는 고정값이었다. "A4 세로 인쇄 영역 269mm를
   SYS_H 150px(≈24.7mm)로 나누면 11단, 제목 자리를 빼고 10"이라는 어림이었는데,
   그 어림은 **4마디/줄에서만** 맞았다. 12/8은 마디가 1.5배 넓어 한 줄에 세 마디만
   들어가고, 그런 악보에서는 어림이 실제 높이와 어긋난다.

   지금은 `printBudgetPx`(설계 폭에서 나온 세로 픽셀)에서 머리 여백을 빼고
   단 높이로 나눈다. 4마디/줄 악보에서는 예전 값과 **똑같이 10이 나온다** —
   그러라고 265mm로 잡았다(`verify-pagebreak.js` 2번이 이걸 못 박는다).

   `markLevels`를 **악보 전체**로 한 번 돌려 단 간격과 위 여백을 잰다. 전체 기준이라
   페이지별 값보다 크거나 같다 — 즉 넘칠 일은 없다.
   (`markLevels`는 MARK_Y를 다시 채우지만 이어지는 `paint`가 어차피 다시 채운다) */
function linesPerPage(perLine){
  const need = markLevels(measures);
  const sysH = SYS_H + (MARK_Y.extra || 0) + lineGap();
  const pad0 = TOP_PAD + Math.max(0, Math.ceil(-need) - 35);
  const p = perLine || perLineOut();
  return Math.max(1, Math.floor((printBudgetPx(p) - pad0) / sysH));
}



/* ================= 판매 방식 — 유료 앱 (2026-08-19 결정) =================
   **앱을 산 사람은 전부 쓴다.** 잠기는 기능이 하나도 없다.

   하루 전까지는 무료 배포 + 연습기(스피드 트레이너·구간 반복) 인앱 구매로
   짜여 있었다. 유료 앱으로 바꾼 이유는 구조가 단순해지기 때문이다 —
   결제 플러그인도, 구매 복원 경로도, 3.1.1 리젝 위험도 통째로 사라진다.

   대신 아래 배선은 **지우지 않는다.** 리뷰가 쌓이기 전 선불 ₩19,000이
   안 팔릴 수 있고, 그때 되돌아갈 자리가 필요하다. `PAID_APP`만 false로 놓으면
   잠금·시트·복원·가격 표시가 전부 그대로 살아난다. 지워 놓고 다시 짜는 것보다
   상수 하나를 남기는 편이 싸다.

   되돌릴 때 같이 볼 것: `store/STORE-COPY.md`(무료 범위 문단), `verify-paid.js`. */
const PAID_APP = true;

const PRO_ID  = 'com.maidrum.studio.pro';
const PRO_KEY = 'maidrum.pro';
let PRO = PAID_APP || !IS_NATIVE;   // 유료 앱이면 늘 열림. 웹도 늘 열림

/* 결제 자체는 네이티브 플러그인이 한다. 여기서는 **있으면 쓰고 없으면 조용히 물러난다** —
   플러그인을 바꿔 끼워도 고칠 곳은 이 객체 하나다. 아직 안 붙인 상태에서도
   앱이 떠야 하므로 어느 함수도 던지지 않는다. */
const IAP = {
  ready: false,
  plugin(){ return window.CdvPurchase || null; },
  async init(){
    const P = this.plugin();
    if(!P) return false;
    try{
      const store = P.store;
      store.register([{id: PRO_ID, type: P.ProductType.NON_CONSUMABLE, platform: P.Platform.APPLE_APPSTORE}]);
      store.when().approved(t => t.verify()).verified(r => { proSet(true); r.finish(); });
      await store.initialize([P.Platform.APPLE_APPSTORE]);
      this.ready = true;
      return true;
    }catch(e){ return false; }
  },
  owned(){
    const P = this.plugin();
    if(!P || !this.ready) return false;
    try{ return !!P.store.owned(PRO_ID); }catch(e){ return false; }
  },
  price(){
    const P = this.plugin();
    if(!P || !this.ready) return '';
    try{
      const o = P.store.get(PRO_ID);
      const off = o && o.getOffer && o.getOffer();
      return (off && off.pricingPhases && off.pricingPhases[0] && off.pricingPhases[0].price) || '';
    }catch(e){ return ''; }
  },
  async buy(){
    const P = this.plugin();
    if(!P || !this.ready) throw new Error('store');
    const o = P.store.get(PRO_ID), off = o && o.getOffer && o.getOffer();
    if(!off) throw new Error('offer');
    await P.store.order(off);
  },
  async restore(){
    const P = this.plugin();
    if(!P || !this.ready) throw new Error('store');
    await P.store.restorePurchases();
  },
};

/* 구매 상태를 기기에 적어 둔다. **이건 캐시지 증거가 아니다** — 진실은 늘 StoreKit이
   갖고 있고, 앱을 다시 열 때 `proSync`가 덮어쓴다. 캐시를 두는 이유는 하나,
   비행기 모드에서 앱을 열었을 때 산 사람의 기능이 잠겨 보이면 안 되기 때문이다. */
function proSet(on){
  PRO = !!on || !IS_NATIVE || PAID_APP;
  try{ localStorage.setItem(PRO_KEY, on ? '1' : '0'); }catch(e){}
  applyPro();
}
async function proSync(){
  /* 유료 앱에서는 스토어에 말을 걸 일이 없다. 플러그인을 아예 안 붙였을 수도 있고,
     붙었더라도 등록된 상품이 없어 초기화가 헛돌 뿐이다 — 여기서 끝낸다 */
  if(PAID_APP || !IS_NATIVE){ PRO = true; applyPro(); return; }
  try{ if(localStorage.getItem(PRO_KEY) === '1') PRO = true; }catch(e){}
  applyPro();
  const ok = await IAP.init();
  if(ok) proSet(IAP.owned());
}

/* 잠긴 자리에 자물쇠를 붙이고 설정 줄을 갱신한다. 화면을 다시 그릴 때마다 불러도 싸다 */
function applyPro(){
  document.body.classList.toggle('is-pro', !!PRO);
  document.body.classList.toggle('pro-locked', IS_NATIVE && !PRO);
  const s = document.getElementById('proSummary');
  if(s) s.textContent = !IS_NATIVE ? '웹에서는 모든 기능이 열려 있습니다.'
       : PRO ? '연습기가 열려 있습니다.' : '스피드 트레이너와 구간 반복이 잠겨 있습니다.';
  /* 유료 앱에서는 이 줄이 통째로 없어야 한다. 살 것이 없는데 "구매 복원" 버튼이
     보이면 사용자는 자기가 뭘 덜 샀나 의심한다 */
  const row = document.getElementById('proRow');
  if(row) row.hidden = !IS_NATIVE || PAID_APP;
}

/* 잠긴 기능을 눌렀을 때. **막고 끝내지 않고 무엇이 열리는지 보여 준다.**
   반환값이 true면 잠긴 것이고, 부른 쪽은 하던 일을 멈춘다 */
function proGate(what){
  if(PRO) return false;
  openProPop(what);
  return true;
}

/* 파일 하나를 사용자에게 넘긴다.
   **앵커는 문서에 붙여야 한다** — 떠 있는 앵커의 click()을 Safari는 무시한다.
   iOS에서는 공유 시트가 훨씬 확실하다(사진/파일 앱으로 바로 간다).
   단 navigator.share는 사용자 제스처 안에서만 되므로, 비동기로 만든 파일은
   이 함수를 **버튼 클릭 핸들러에서 직접** 불러야 한다. */
async function saveFile(blob, filename){
  /* 앱(2026-08-23): **네이티브 공유 시트를 먼저 쓴다** (MaiPdf.shareFile).
     navigator.share는 사용자 제스처 안에서만 허용되는데, 영상처럼 만드는 데
     수십 초 걸리는 파일은 그 제스처가 이미 죽어 있다 — 그러면 조용히 거부되고
     앵커 폴백으로 떨어지는데 iOS는 blob:capacitor://를 못 연다.
     PDF가 이미 다니는 네이티브 길(UIActivityViewController)은 웹 제스처와
     무관하다. 옛 빌드(shareFile이 없는)에서는 아래 경로로 그대로 떨어진다. */
  if(IS_NATIVE){
    try{
      const P = window.Capacitor && window.Capacitor.Plugins;
      if(P && P.MaiPdf && P.MaiPdf.shareFile){
        const b64 = await new Promise((res, rej)=>{
          const r = new FileReader();
          r.onload = ()=> res(String(r.result).split(',')[1] || '');
          r.onerror = ()=> rej(new Error('읽기 실패'));
          r.readAsDataURL(blob);
        });
        await P.MaiPdf.shareFile({data: b64, filename});
        return;
      }
    }catch(e){ /* 네이티브가 거부하면 아래 웹 경로로 계속 간다 */ }
  }
  if(IS_IOS && navigator.canShare){
    try{
      const file = new File([blob], filename, {type: blob.type});
      if(navigator.canShare({files:[file]})){ await navigator.share({files:[file]}); return; }
    }catch(e){ if(e && e.name === 'AbortError') return; }   // 사용자가 닫은 것
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 60000);
}

/* ── 브랜드 로고 (2026-08-18, 정식 로고 `maidrumlogo_2ea.svg`에서 분리) —
   흰 판(어두운 배경)·먹 판(밝은 배경). **PNG가 아니라 SVG다** — 절반 크기에
   아이패드·인쇄에서 무르지 않는다. 원본은 한 파일에 두 판이 세로로 들어 있어
   viewBox로 잘라 나눴다(path 수술 없음).
   상단바와 인증샷이 같은 base64를 쓴다 — HTML에 또 박으면 이 25KB가 두 번 실린다 */
const LOGO_W = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgOCAzNjUgODQiIHdpZHRoPSIzNjUiIGhlaWdodD0iODQiIHJvbGU9ImltZyIgYXJpYS1sYWJlbD0i65Sw7L+165Sw64uk65GlIj48dGl0bGU+65Sw7L+165Sw64uk65GlPC90aXRsZT48cGF0aCBmaWxsPSIjRkZGRkZGIiBkPSJNNjAuNTM5IDUwLjM0NEw2MC41MzkgODQuNjkxTDUxLjY4IDg0LjY5MUw1MS42OCAxNi44NzVMNjAuNTM5IDE2Ljg3NUw2MC41MzkgNDIuOTI2TDcwLjEzNyA0Mi45MjZMNzAuMTM3IDUwLjM0NFpNNDkuNjc2IDY1Ljg0OEM0Ni4zMjQgNjYuNjkxIDM5LjIyMyA2Ny4xMTMgMjguMzcxIDY3LjExM0wyOC4zNzEgMjIuNzExTDQ2LjU4MiAyMi43MTFMNDYuNTgyIDMwLjA1OUwzNy4wOSAzMC4wNTlMMzcuMDkgNTkuODAxQzQxLjE5MSA1OS44MDEgNDUuMDQ3IDU5LjM5MSA0OC42NTYgNTguNTdaTTI2LjY0OCA2NS40NjFDMjIuMTQ4IDY2LjUxNiAxNS41NTEgNjcuMDQzIDYuODU1IDY3LjA0M0w2Ljg1NSAyMi43MTFMMjUuMTM3IDIyLjcxMUwyNS4xMzcgMzAuMDU5TDE1LjYwOSAzMC4wNTlMMTUuNjA5IDU5LjczQzE5LjEyNSA1OS43MyAyMi4zNzEgNTkuMjUgMjUuMzQ4IDU4LjI4OVpNMTAzLjYwNiA1Ny45NzNMMTAzLjYwNiA1Mi4yNDJMNzYuNTM1IDUyLjI0Mkw3Ni41MzUgNDQuODI0TDEyMC43MjcgNDQuODI0QzEyMC44MiA0My43OTMgMTIwLjk3MyA0MS4zMiAxMjEuMTg0IDM3LjQwNkw4NC45MDIgMzkuMTI5TDgyLjkzNCAzMS45MjJMMTIxLjM5NSAzMC42MjFMMTIxLjQ2NSAyNS43MzRMODUuOTU3IDI1LjczNEw4NS45NTcgMTguMzg3TDEzMC4yNTQgMTguMzg3QzEzMC4yNTQgMzAuNDEgMTI5Ljk2MSAzOS4yMjMgMTI5LjM3NSA0NC44MjRMMTM5LjQ2NSA0NC44MjRMMTM5LjQ2NSA1Mi4yNDJMMTEyLjM5NSA1Mi4yNDJMMTEyLjM5NSA1Ny45NzNDMTE4LjQ2NSA1OC40NDEgMTIzLjA4OCA1OS44MDcgMTI2LjI2NCA2Mi4wNjhDMTI5LjQzOSA2NC4zMyAxMzEuMDI3IDY3LjI2NiAxMzEuMDI3IDcwLjg3NUMxMzEuMDI3IDc0Ljk3NyAxMjkuMDUzIDc4LjE4OCAxMjUuMTA0IDgwLjUwOEMxMjEuMTU0IDgyLjgyOCAxMTUuNDUzIDgzLjk4OCAxMDggODMuOTg4QzEwMC41NDcgODMuOTg4IDk0Ljg0NiA4Mi44MjggOTAuODk2IDgwLjUwOEM4Ni45NDcgNzguMTg4IDg0Ljk3MyA3NC45NzcgODQuOTczIDcwLjg3NUM4NC45NzMgNjcuMTk1IDg2LjU2NiA2NC4yNDIgODkuNzU0IDYyLjAxNkM5Mi45NDEgNTkuNzg5IDk3LjU1OSA1OC40NDEgMTAzLjYwNiA1Ny45NzNaTTEwOCA2NS4xMDlDOTguNjQ4IDY1LjEwOSA5My45NzMgNjcuMDMxIDkzLjk3MyA3MC44NzVDOTMuOTczIDcyLjY4IDk1LjE1NiA3NC4xMTUgOTcuNTIzIDc1LjE4MkM5OS44OTEgNzYuMjQ4IDEwMy4zODMgNzYuNzgxIDEwOCA3Ni43ODFDMTEyLjYxNyA3Ni43ODEgMTE2LjEwOSA3Ni4yNDggMTE4LjQ3NyA3NS4xODJDMTIwLjg0NCA3NC4xMTUgMTIyLjAyNyA3Mi42OCAxMjIuMDI3IDcwLjg3NUMxMjIuMDI3IDY3LjAzMSAxMTcuMzUyIDY1LjEwOSAxMDggNjUuMTA5WiIvPjxwYXRoIGZpbGw9IiNGRkZGRkYiIGQ9Ik0yMDUuNTM5IDUwLjM0NEwyMDUuNTM5IDg0LjY5MUwxOTYuNjggODQuNjkxTDE5Ni42OCAxNi44NzVMMjA1LjUzOSAxNi44NzVMMjA1LjUzOSA0Mi45MjZMMjE1LjEzNyA0Mi45MjZMMjE1LjEzNyA1MC4zNDRaTTE5NC42NzYgNjUuODQ4QzE5MS4zMjQgNjYuNjkxIDE4NC4yMjMgNjcuMTEzIDE3My4zNzEgNjcuMTEzTDE3My4zNzEgMjIuNzExTDE5MS41ODIgMjIuNzExTDE5MS41ODIgMzAuMDU5TDE4Mi4wOSAzMC4wNTlMMTgyLjA5IDU5LjgwMUMxODYuMTkxIDU5LjgwMSAxOTAuMDQ3IDU5LjM5MSAxOTMuNjU2IDU4LjU3Wk0xNzEuNjQ4IDY1LjQ2MUMxNjcuMTQ4IDY2LjUxNiAxNjAuNTUxIDY3LjA0MyAxNTEuODU2IDY3LjA0M0wxNTEuODU2IDIyLjcxMUwxNzAuMTM3IDIyLjcxMUwxNzAuMTM3IDMwLjA1OUwxNjAuNjA5IDMwLjA1OUwxNjAuNjA5IDU5LjczQzE2NC4xMjUgNTkuNzMgMTY3LjM3MSA1OS4yNSAxNzAuMzQ4IDU4LjI4OVpNMjc1LjQ2NSA0OS45OTJMMjc1LjQ2NSA4NC42OTFMMjY2LjY3NiA4NC42OTFMMjY2LjY3NiAxNi44NzVMMjc1LjQ2NSAxNi44NzVMMjc1LjQ2NSA0Mi41NzRMMjg2Ljc4NSA0Mi41NzRMMjg2Ljc4NSA0OS45OTJaTTI2MS42NDggNjQuODk4QzI1Ni4zOTggNjUuNjI1IDI0Ny41ODYgNjUuOTg4IDIzNS4yMTEgNjUuOTg4TDIyNC45ODEgNjUuOTg4TDIyNC45ODEgMjIuNjQxTDI1Ny4zMjQgMjIuNjQxTDI1Ny4zMjQgMzAuMDU5TDIzMy43NyAzMC4wNTlMMjMzLjc3IDU4LjY0MUwyMzcuMTggNTguNjQxQzI0OC4xMjUgNTguNjQxIDI1Ni4wMTIgNTguMzAxIDI2MC44NCA1Ny42MjFaTTMwMy4wMjcgNDEuNDE0TDMwMy4wMjcgMTguNTI3TDM0Ny4xMTMgMTguNTI3TDM0Ny4xMTMgMjUuOTQ1TDMxMS45NTcgMjUuOTQ1TDMxMS45NTcgMzMuOTk2TDM0Ny44MTYgMzMuOTk2TDM0Ny44MTYgNDEuNDE0Wk0zMjAuNjA2IDU5LjI3M0wzMjAuNjA2IDUzLjk2NUwyOTMuNTM1IDUzLjk2NUwyOTMuNTM1IDQ2LjQ3N0wzNTYuNDY1IDQ2LjQ3N0wzNTYuNDY1IDUzLjk2NUwzMjkuMzk1IDUzLjk2NUwzMjkuMzk1IDU5LjI3M0MzMzUuMTYgNTkuNzE5IDMzOS41OSA2MS4wMzEgMzQyLjY4NCA2My4yMTFDMzQ1Ljc3NyA2NS4zOTEgMzQ3LjMyNCA2OC4yODUgMzQ3LjMyNCA3MS44OTVDMzQ3LjMyNCA3NS45NDkgMzQ1LjQyNiA3OS4wOTYgMzQxLjYyOSA4MS4zMzRDMzM3LjgzMiA4My41NzIgMzMyLjI4OSA4NC42OTEgMzI1IDg0LjY5MUMzMTcuNzExIDg0LjY5MSAzMTIuMTY4IDgzLjU3MiAzMDguMzcxIDgxLjMzNEMzMDQuNTc0IDc5LjA5NiAzMDIuNjc2IDc1Ljk0OSAzMDIuNjc2IDcxLjg5NUMzMDIuNjc2IDY4LjI4NSAzMDQuMjIzIDY1LjM5MSAzMDcuMzE2IDYzLjIxMUMzMTAuNDEgNjEuMDMxIDMxNC44NCA1OS43MTkgMzIwLjYwNiA1OS4yNzNaTTMyNSA2Ni40MUMzMTYuMTE3IDY2LjQxIDMxMS42NzYgNjguMjM4IDMxMS42NzYgNzEuODk1QzMxMS42NzYgNzUuNjIxIDMxNi4xMTcgNzcuNDg0IDMyNSA3Ny40ODRDMzMzLjg4MyA3Ny40ODQgMzM4LjMyNCA3NS42MjEgMzM4LjMyNCA3MS44OTVDMzM4LjMyNCA2OC4yMzggMzMzLjg4MyA2Ni40MSAzMjUgNjYuNDFaIi8+PC9zdmc+';
const LOGO_K = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgOCAzNjUgODQiIHdpZHRoPSIzNjUiIGhlaWdodD0iODQiIHJvbGU9ImltZyIgYXJpYS1sYWJlbD0i65Sw7L+165Sw64uk65GlIj48dGl0bGU+65Sw7L+165Sw64uk65GlPC90aXRsZT48cGF0aCBmaWxsPSIjMTQxMjFBIiBkPSJNNjAuNTM5IDUwLjM0NEw2MC41MzkgODQuNjkxTDUxLjY4IDg0LjY5MUw1MS42OCAxNi44NzVMNjAuNTM5IDE2Ljg3NUw2MC41MzkgNDIuOTI2TDcwLjEzNyA0Mi45MjZMNzAuMTM3IDUwLjM0NFpNNDkuNjc2IDY1Ljg0OEM0Ni4zMjQgNjYuNjkxIDM5LjIyMyA2Ny4xMTMgMjguMzcxIDY3LjExM0wyOC4zNzEgMjIuNzExTDQ2LjU4MiAyMi43MTFMNDYuNTgyIDMwLjA1OUwzNy4wOSAzMC4wNTlMMzcuMDkgNTkuODAxQzQxLjE5MSA1OS44MDEgNDUuMDQ3IDU5LjM5MSA0OC42NTYgNTguNTdaTTI2LjY0OCA2NS40NjFDMjIuMTQ4IDY2LjUxNiAxNS41NTEgNjcuMDQzIDYuODU1IDY3LjA0M0w2Ljg1NSAyMi43MTFMMjUuMTM3IDIyLjcxMUwyNS4xMzcgMzAuMDU5TDE1LjYwOSAzMC4wNTlMMTUuNjA5IDU5LjczQzE5LjEyNSA1OS43MyAyMi4zNzEgNTkuMjUgMjUuMzQ4IDU4LjI4OVpNMTAzLjYwNiA1Ny45NzNMMTAzLjYwNiA1Mi4yNDJMNzYuNTM1IDUyLjI0Mkw3Ni41MzUgNDQuODI0TDEyMC43MjcgNDQuODI0QzEyMC44MiA0My43OTMgMTIwLjk3MyA0MS4zMiAxMjEuMTg0IDM3LjQwNkw4NC45MDIgMzkuMTI5TDgyLjkzNCAzMS45MjJMMTIxLjM5NSAzMC42MjFMMTIxLjQ2NSAyNS43MzRMODUuOTU3IDI1LjczNEw4NS45NTcgMTguMzg3TDEzMC4yNTQgMTguMzg3QzEzMC4yNTQgMzAuNDEgMTI5Ljk2MSAzOS4yMjMgMTI5LjM3NSA0NC44MjRMMTM5LjQ2NSA0NC44MjRMMTM5LjQ2NSA1Mi4yNDJMMTEyLjM5NSA1Mi4yNDJMMTEyLjM5NSA1Ny45NzNDMTE4LjQ2NSA1OC40NDEgMTIzLjA4OCA1OS44MDcgMTI2LjI2NCA2Mi4wNjhDMTI5LjQzOSA2NC4zMyAxMzEuMDI3IDY3LjI2NiAxMzEuMDI3IDcwLjg3NUMxMzEuMDI3IDc0Ljk3NyAxMjkuMDUzIDc4LjE4OCAxMjUuMTA0IDgwLjUwOEMxMjEuMTU0IDgyLjgyOCAxMTUuNDUzIDgzLjk4OCAxMDggODMuOTg4QzEwMC41NDcgODMuOTg4IDk0Ljg0NiA4Mi44MjggOTAuODk2IDgwLjUwOEM4Ni45NDcgNzguMTg4IDg0Ljk3MyA3NC45NzcgODQuOTczIDcwLjg3NUM4NC45NzMgNjcuMTk1IDg2LjU2NiA2NC4yNDIgODkuNzU0IDYyLjAxNkM5Mi45NDEgNTkuNzg5IDk3LjU1OSA1OC40NDEgMTAzLjYwNiA1Ny45NzNaTTEwOCA2NS4xMDlDOTguNjQ4IDY1LjEwOSA5My45NzMgNjcuMDMxIDkzLjk3MyA3MC44NzVDOTMuOTczIDcyLjY4IDk1LjE1NiA3NC4xMTUgOTcuNTIzIDc1LjE4MkM5OS44OTEgNzYuMjQ4IDEwMy4zODMgNzYuNzgxIDEwOCA3Ni43ODFDMTEyLjYxNyA3Ni43ODEgMTE2LjEwOSA3Ni4yNDggMTE4LjQ3NyA3NS4xODJDMTIwLjg0NCA3NC4xMTUgMTIyLjAyNyA3Mi42OCAxMjIuMDI3IDcwLjg3NUMxMjIuMDI3IDY3LjAzMSAxMTcuMzUyIDY1LjEwOSAxMDggNjUuMTA5WiIvPjxwYXRoIGZpbGw9IiMxNDEyMUEiIGQ9Ik0yMDUuNTM5IDUwLjM0NEwyMDUuNTM5IDg0LjY5MUwxOTYuNjggODQuNjkxTDE5Ni42OCAxNi44NzVMMjA1LjUzOSAxNi44NzVMMjA1LjUzOSA0Mi45MjZMMjE1LjEzNyA0Mi45MjZMMjE1LjEzNyA1MC4zNDRaTTE5NC42NzYgNjUuODQ4QzE5MS4zMjQgNjYuNjkxIDE4NC4yMjMgNjcuMTEzIDE3My4zNzEgNjcuMTEzTDE3My4zNzEgMjIuNzExTDE5MS41ODIgMjIuNzExTDE5MS41ODIgMzAuMDU5TDE4Mi4wOSAzMC4wNTlMMTgyLjA5IDU5LjgwMUMxODYuMTkxIDU5LjgwMSAxOTAuMDQ3IDU5LjM5MSAxOTMuNjU2IDU4LjU3Wk0xNzEuNjQ4IDY1LjQ2MUMxNjcuMTQ4IDY2LjUxNiAxNjAuNTUxIDY3LjA0MyAxNTEuODU2IDY3LjA0M0wxNTEuODU2IDIyLjcxMUwxNzAuMTM3IDIyLjcxMUwxNzAuMTM3IDMwLjA1OUwxNjAuNjA5IDMwLjA1OUwxNjAuNjA5IDU5LjczQzE2NC4xMjUgNTkuNzMgMTY3LjM3MSA1OS4yNSAxNzAuMzQ4IDU4LjI4OVpNMjc1LjQ2NSA0OS45OTJMMjc1LjQ2NSA4NC42OTFMMjY2LjY3NiA4NC42OTFMMjY2LjY3NiAxNi44NzVMMjc1LjQ2NSAxNi44NzVMMjc1LjQ2NSA0Mi41NzRMMjg2Ljc4NSA0Mi41NzRMMjg2Ljc4NSA0OS45OTJaTTI2MS42NDggNjQuODk4QzI1Ni4zOTggNjUuNjI1IDI0Ny41ODYgNjUuOTg4IDIzNS4yMTEgNjUuOTg4TDIyNC45ODEgNjUuOTg4TDIyNC45ODEgMjIuNjQxTDI1Ny4zMjQgMjIuNjQxTDI1Ny4zMjQgMzAuMDU5TDIzMy43NyAzMC4wNTlMMjMzLjc3IDU4LjY0MUwyMzcuMTggNTguNjQxQzI0OC4xMjUgNTguNjQxIDI1Ni4wMTIgNTguMzAxIDI2MC44NCA1Ny42MjFaTTMwMy4wMjcgNDEuNDE0TDMwMy4wMjcgMTguNTI3TDM0Ny4xMTMgMTguNTI3TDM0Ny4xMTMgMjUuOTQ1TDMxMS45NTcgMjUuOTQ1TDMxMS45NTcgMzMuOTk2TDM0Ny44MTYgMzMuOTk2TDM0Ny44MTYgNDEuNDE0Wk0zMjAuNjA2IDU5LjI3M0wzMjAuNjA2IDUzLjk2NUwyOTMuNTM1IDUzLjk2NUwyOTMuNTM1IDQ2LjQ3N0wzNTYuNDY1IDQ2LjQ3N0wzNTYuNDY1IDUzLjk2NUwzMjkuMzk1IDUzLjk2NUwzMjkuMzk1IDU5LjI3M0MzMzUuMTYgNTkuNzE5IDMzOS41OSA2MS4wMzEgMzQyLjY4NCA2My4yMTFDMzQ1Ljc3NyA2NS4zOTEgMzQ3LjMyNCA2OC4yODUgMzQ3LjMyNCA3MS44OTVDMzQ3LjMyNCA3NS45NDkgMzQ1LjQyNiA3OS4wOTYgMzQxLjYyOSA4MS4zMzRDMzM3LjgzMiA4My41NzIgMzMyLjI4OSA4NC42OTEgMzI1IDg0LjY5MUMzMTcuNzExIDg0LjY5MSAzMTIuMTY4IDgzLjU3MiAzMDguMzcxIDgxLjMzNEMzMDQuNTc0IDc5LjA5NiAzMDIuNjc2IDc1Ljk0OSAzMDIuNjc2IDcxLjg5NUMzMDIuNjc2IDY4LjI4NSAzMDQuMjIzIDY1LjM5MSAzMDcuMzE2IDYzLjIxMUMzMTAuNDEgNjEuMDMxIDMxNC44NCA1OS43MTkgMzIwLjYwNiA1OS4yNzNaTTMyNSA2Ni40MUMzMTYuMTE3IDY2LjQxIDMxMS42NzYgNjguMjM4IDMxMS42NzYgNzEuODk1QzMxMS42NzYgNzUuNjIxIDMxNi4xMTcgNzcuNDg0IDMyNSA3Ny40ODRDMzMzLjg4MyA3Ny40ODQgMzM4LjMyNCA3NS42MjEgMzM4LjMyNCA3MS44OTVDMzM4LjMyNCA2OC4yMzggMzMzLjg4MyA2Ni40MSAzMjUgNjYuNDFaIi8+PC9zdmc+';
/* 다크판 — 라임 M + 연보라 ai. 상단바는 늘 어두우니 여기 쓴다 (2026-08-18).
   배경 rect는 뺐다 — 로고 자체 검정판(#0b0b0e)과 앱 배경(#0C0C10)이 미세하게 달라
   판이 사각으로 도드라진다. 투명으로 두면 상단바 색이 그대로 배경이 된다 */
const LOGO_D = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgOCAzNjUgODQiIHdpZHRoPSIzNjUiIGhlaWdodD0iODQiIHJvbGU9ImltZyIgYXJpYS1sYWJlbD0i65Sw7L+165Sw64uk65GlIj48dGl0bGU+65Sw7L+165Sw64uk65GlPC90aXRsZT48cGF0aCBmaWxsPSIjQzlGMjREIiBkPSJNNjAuNTM5IDUwLjM0NEw2MC41MzkgODQuNjkxTDUxLjY4IDg0LjY5MUw1MS42OCAxNi44NzVMNjAuNTM5IDE2Ljg3NUw2MC41MzkgNDIuOTI2TDcwLjEzNyA0Mi45MjZMNzAuMTM3IDUwLjM0NFpNNDkuNjc2IDY1Ljg0OEM0Ni4zMjQgNjYuNjkxIDM5LjIyMyA2Ny4xMTMgMjguMzcxIDY3LjExM0wyOC4zNzEgMjIuNzExTDQ2LjU4MiAyMi43MTFMNDYuNTgyIDMwLjA1OUwzNy4wOSAzMC4wNTlMMzcuMDkgNTkuODAxQzQxLjE5MSA1OS44MDEgNDUuMDQ3IDU5LjM5MSA0OC42NTYgNTguNTdaTTI2LjY0OCA2NS40NjFDMjIuMTQ4IDY2LjUxNiAxNS41NTEgNjcuMDQzIDYuODU1IDY3LjA0M0w2Ljg1NSAyMi43MTFMMjUuMTM3IDIyLjcxMUwyNS4xMzcgMzAuMDU5TDE1LjYwOSAzMC4wNTlMMTUuNjA5IDU5LjczQzE5LjEyNSA1OS43MyAyMi4zNzEgNTkuMjUgMjUuMzQ4IDU4LjI4OVpNMTAzLjYwNiA1Ny45NzNMMTAzLjYwNiA1Mi4yNDJMNzYuNTM1IDUyLjI0Mkw3Ni41MzUgNDQuODI0TDEyMC43MjcgNDQuODI0QzEyMC44MiA0My43OTMgMTIwLjk3MyA0MS4zMiAxMjEuMTg0IDM3LjQwNkw4NC45MDIgMzkuMTI5TDgyLjkzNCAzMS45MjJMMTIxLjM5NSAzMC42MjFMMTIxLjQ2NSAyNS43MzRMODUuOTU3IDI1LjczNEw4NS45NTcgMTguMzg3TDEzMC4yNTQgMTguMzg3QzEzMC4yNTQgMzAuNDEgMTI5Ljk2MSAzOS4yMjMgMTI5LjM3NSA0NC44MjRMMTM5LjQ2NSA0NC44MjRMMTM5LjQ2NSA1Mi4yNDJMMTEyLjM5NSA1Mi4yNDJMMTEyLjM5NSA1Ny45NzNDMTE4LjQ2NSA1OC40NDEgMTIzLjA4OCA1OS44MDcgMTI2LjI2NCA2Mi4wNjhDMTI5LjQzOSA2NC4zMyAxMzEuMDI3IDY3LjI2NiAxMzEuMDI3IDcwLjg3NUMxMzEuMDI3IDc0Ljk3NyAxMjkuMDUzIDc4LjE4OCAxMjUuMTA0IDgwLjUwOEMxMjEuMTU0IDgyLjgyOCAxMTUuNDUzIDgzLjk4OCAxMDggODMuOTg4QzEwMC41NDcgODMuOTg4IDk0Ljg0NiA4Mi44MjggOTAuODk2IDgwLjUwOEM4Ni45NDcgNzguMTg4IDg0Ljk3MyA3NC45NzcgODQuOTczIDcwLjg3NUM4NC45NzMgNjcuMTk1IDg2LjU2NiA2NC4yNDIgODkuNzU0IDYyLjAxNkM5Mi45NDEgNTkuNzg5IDk3LjU1OSA1OC40NDEgMTAzLjYwNiA1Ny45NzNaTTEwOCA2NS4xMDlDOTguNjQ4IDY1LjEwOSA5My45NzMgNjcuMDMxIDkzLjk3MyA3MC44NzVDOTMuOTczIDcyLjY4IDk1LjE1NiA3NC4xMTUgOTcuNTIzIDc1LjE4MkM5OS44OTEgNzYuMjQ4IDEwMy4zODMgNzYuNzgxIDEwOCA3Ni43ODFDMTEyLjYxNyA3Ni43ODEgMTE2LjEwOSA3Ni4yNDggMTE4LjQ3NyA3NS4xODJDMTIwLjg0NCA3NC4xMTUgMTIyLjAyNyA3Mi42OCAxMjIuMDI3IDcwLjg3NUMxMjIuMDI3IDY3LjAzMSAxMTcuMzUyIDY1LjEwOSAxMDggNjUuMTA5WiIvPjxwYXRoIGZpbGw9IiNDN0E4RkYiIGQ9Ik0yMDUuNTM5IDUwLjM0NEwyMDUuNTM5IDg0LjY5MUwxOTYuNjggODQuNjkxTDE5Ni42OCAxNi44NzVMMjA1LjUzOSAxNi44NzVMMjA1LjUzOSA0Mi45MjZMMjE1LjEzNyA0Mi45MjZMMjE1LjEzNyA1MC4zNDRaTTE5NC42NzYgNjUuODQ4QzE5MS4zMjQgNjYuNjkxIDE4NC4yMjMgNjcuMTEzIDE3My4zNzEgNjcuMTEzTDE3My4zNzEgMjIuNzExTDE5MS41ODIgMjIuNzExTDE5MS41ODIgMzAuMDU5TDE4Mi4wOSAzMC4wNTlMMTgyLjA5IDU5LjgwMUMxODYuMTkxIDU5LjgwMSAxOTAuMDQ3IDU5LjM5MSAxOTMuNjU2IDU4LjU3Wk0xNzEuNjQ4IDY1LjQ2MUMxNjcuMTQ4IDY2LjUxNiAxNjAuNTUxIDY3LjA0MyAxNTEuODU2IDY3LjA0M0wxNTEuODU2IDIyLjcxMUwxNzAuMTM3IDIyLjcxMUwxNzAuMTM3IDMwLjA1OUwxNjAuNjA5IDMwLjA1OUwxNjAuNjA5IDU5LjczQzE2NC4xMjUgNTkuNzMgMTY3LjM3MSA1OS4yNSAxNzAuMzQ4IDU4LjI4OVpNMjc1LjQ2NSA0OS45OTJMMjc1LjQ2NSA4NC42OTFMMjY2LjY3NiA4NC42OTFMMjY2LjY3NiAxNi44NzVMMjc1LjQ2NSAxNi44NzVMMjc1LjQ2NSA0Mi41NzRMMjg2Ljc4NSA0Mi41NzRMMjg2Ljc4NSA0OS45OTJaTTI2MS42NDggNjQuODk4QzI1Ni4zOTggNjUuNjI1IDI0Ny41ODYgNjUuOTg4IDIzNS4yMTEgNjUuOTg4TDIyNC45ODEgNjUuOTg4TDIyNC45ODEgMjIuNjQxTDI1Ny4zMjQgMjIuNjQxTDI1Ny4zMjQgMzAuMDU5TDIzMy43NyAzMC4wNTlMMjMzLjc3IDU4LjY0MUwyMzcuMTggNTguNjQxQzI0OC4xMjUgNTguNjQxIDI1Ni4wMTIgNTguMzAxIDI2MC44NCA1Ny42MjFaTTMwMy4wMjcgNDEuNDE0TDMwMy4wMjcgMTguNTI3TDM0Ny4xMTMgMTguNTI3TDM0Ny4xMTMgMjUuOTQ1TDMxMS45NTcgMjUuOTQ1TDMxMS45NTcgMzMuOTk2TDM0Ny44MTYgMzMuOTk2TDM0Ny44MTYgNDEuNDE0Wk0zMjAuNjA2IDU5LjI3M0wzMjAuNjA2IDUzLjk2NUwyOTMuNTM1IDUzLjk2NUwyOTMuNTM1IDQ2LjQ3N0wzNTYuNDY1IDQ2LjQ3N0wzNTYuNDY1IDUzLjk2NUwzMjkuMzk1IDUzLjk2NUwzMjkuMzk1IDU5LjI3M0MzMzUuMTYgNTkuNzE5IDMzOS41OSA2MS4wMzEgMzQyLjY4NCA2My4yMTFDMzQ1Ljc3NyA2NS4zOTEgMzQ3LjMyNCA2OC4yODUgMzQ3LjMyNCA3MS44OTVDMzQ3LjMyNCA3NS45NDkgMzQ1LjQyNiA3OS4wOTYgMzQxLjYyOSA4MS4zMzRDMzM3LjgzMiA4My41NzIgMzMyLjI4OSA4NC42OTEgMzI1IDg0LjY5MUMzMTcuNzExIDg0LjY5MSAzMTIuMTY4IDgzLjU3MiAzMDguMzcxIDgxLjMzNEMzMDQuNTc0IDc5LjA5NiAzMDIuNjc2IDc1Ljk0OSAzMDIuNjc2IDcxLjg5NUMzMDIuNjc2IDY4LjI4NSAzMDQuMjIzIDY1LjM5MSAzMDcuMzE2IDYzLjIxMUMzMTAuNDEgNjEuMDMxIDMxNC44NCA1OS43MTkgMzIwLjYwNiA1OS4yNzNaTTMyNSA2Ni40MUMzMTYuMTE3IDY2LjQxIDMxMS42NzYgNjguMjM4IDMxMS42NzYgNzEuODk1QzMxMS42NzYgNzUuNjIxIDMxNi4xMTcgNzcuNDg0IDMyNSA3Ny40ODRDMzMzLjg4MyA3Ny40ODQgMzM4LjMyNCA3NS42MjEgMzM4LjMyNCA3MS44OTVDMzM4LjMyNCA2OC4yMzggMzMzLjg4MyA2Ni40MSAzMjUgNjYuNDFaIi8+PC9zdmc+';
document.getElementById('brandLogo').src = LOGO_D;

/* ================= 연습 기록 보기 (2026-08-17) =================
   최근 14일 막대 + 연속 일수 + 7·30일 합계. **캔버스를 안 쓴다** — 막대 열네 개는
   div가 더 또렷하고, 종이색·글꼴을 따로 챙길 일도 없다.
   **설정 서랍에서 연다** — 연습 탭은 패드 전용이라 폰 사용자가 못 닿는다(인증샷도 그랬다). */
const HIST_BARS = 14;
function histDraw(){
  const days = histDays(HIST_BARS);
  const max = Math.max(60000, ...days.map(d => d.ms));    // 최소 1분을 꼭대기로 — 하루만 있어도 막대가 보인다
  const box = document.getElementById('hBars');
  if(box){
    box.innerHTML = '';
    days.forEach((d, i)=>{
      const bar = document.createElement('i');
      const h = Math.max(2, Math.round(d.ms / max * 74));
      bar.style.height = h + 'px';
      if(d.ms >= 1000) bar.className = (i === days.length-1) ? 'today' : 'on';
      bar.title = d.d + ' — ' + (d.ms >= 1000 ? fmtDur(d.ms) : t('없음'));
      box.appendChild(bar);
    });
  }
  const st = histStreak();
  const set = (id, v)=>{ const e = document.getElementById(id); if(e) e.textContent = v; };
  set('hStreak', st);
  const today = statsToday();
  set('hStreakNote', today.ms >= 1000 ? t('오늘') + ' ' + fmtDur(today.ms) : t('오늘은 아직'));
  const w = histSum(7), m30 = histSum(30);
  set('hWeek', fmtLong(w.ms)); set('hMonth', fmtLong(m30.ms));
  set('hNotes', w.n.toLocaleString());
  const first = days[0];
  set('hFrom', first ? first.d.slice(5).replace('-', '/') : '');
  // 설정 서랍의 한 줄 요약도 같이
  const sum = document.getElementById('histSummary');
  if(sum){
    sum.innerHTML = w.ms < 1000 ? t('아직 기록이 없습니다.')
      : t('최근 7일') + ' <b>' + fmtLong(w.ms) + '</b> · '
        + (st ? '<b>' + st + t('일 연속') + '</b>' : t('연속 끊김'));
  }
}
(function initHistPop(){
  const pop = document.getElementById('histPop');
  if(!pop) return;
  const close = ()=> pop.classList.remove('is-open');
  window.openHistPop = ()=>{ histDraw(); pop.classList.add('is-open'); track('hist'); };
  ['histBtn','setHist'].forEach(id=>{
    const b = document.getElementById(id);
    if(b) b.onclick = ()=> openHistPop();
  });
  document.getElementById('histClose').onclick = close;
  document.getElementById('histCert').onclick = ()=>{
    close();
    const c = document.getElementById('certBtn');
    if(c) c.onclick();                 // 인증샷은 한 곳에서만 만든다
  };
  pop.addEventListener('click', e=>{ if(e.target === pop) close(); });
  document.addEventListener('keydown', e=>{
    if(e.key === 'Escape' && pop.classList.contains('is-open')) close();
  });
})();

/* ── 연습기(Pro) 시트 ─────────────────────────────
   잠긴 기능을 눌렀을 때 뜨고, 설정에서도 열린다. 구매 버튼은 플러그인이 없으면
   **눌러도 아무 일이 없는 대신** 이유를 말한다 — 조용히 죽는 버튼이 제일 나쁘다. */
(function initProPop(){
  const pop = document.getElementById('proPop');
  if(!pop) return;
  const close = ()=> pop.classList.remove('is-open');
  const note = document.getElementById('proNote');
  const say = (t)=>{ if(note) note.innerHTML = t; };

  window.openProPop = (what)=>{
    const why = document.getElementById('proWhy');
    /* 받침에 따라 은/는을 고른다 — "스피드 트레이너은"은 읽는 순간 티가 난다 */
    const josa = (w)=>{ const c = w.charCodeAt(w.length-1);
      return (c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28) ? '은' : '는'; };
    if(why) why.textContent = what
      ? what + josa(what) + ' 연습기에 들어 있습니다. 한 번 사면 계속 쓰실 수 있습니다 — 구독이 아닙니다.'
      : '한 번 사면 계속 쓰실 수 있습니다. 구독이 아닙니다.';
    const el = document.getElementById('proPrice');
    if(el) el.textContent = IAP.price() || '';
    say('기기를 바꾸셨다면 <b>구매 복원</b>을 누르세요. 같은 Apple 계정이면 다시 결제하지 않습니다.');
    pop.classList.add('is-open');
    track('pro-open');
  };

  document.getElementById('proClose').onclick = close;
  document.getElementById('proBuy').onclick = async ()=>{
    if(!IS_NATIVE){ say('웹에서는 결제가 없습니다 — 모든 기능이 이미 열려 있습니다.'); return; }
    try{ say('스토어를 여는 중…'); await IAP.buy(); }
    catch(e){ say('지금은 스토어에 닿지 못했습니다. 잠시 뒤 다시 시도해 주세요.'); }
  };
  const restore = async ()=>{
    if(!IS_NATIVE){ say('웹에서는 복원할 것이 없습니다.'); return; }
    try{
      say('구매 내역을 확인하는 중…');
      await IAP.restore();
      proSet(IAP.owned());
      if(PRO){ say('복원했습니다. 연습기가 열렸습니다.'); toast('구매를 복원했습니다.'); close(); }
      else say('이 Apple 계정으로 구매한 내역이 없습니다.');
    }catch(e){ say('지금은 스토어에 닿지 못했습니다. 잠시 뒤 다시 시도해 주세요.'); }
  };
  document.getElementById('proRestore').onclick = restore;
  const sr = document.getElementById('setRestore'); if(sr) sr.onclick = restore;
  const sp = document.getElementById('setPro');     if(sp) sp.onclick = ()=> openProPop();

  pop.addEventListener('click', e=>{ if(e.target === pop) close(); });
  document.addEventListener('keydown', e=>{
    if(e.key === 'Escape' && pop.classList.contains('is-open')) close();
  });
})();

/* ================= 연습 인증샷 (2026-08-17) =================
   러닝앱 기록 공유처럼, 오늘 기록(연습 기록 구역)을 사진 위에 얹은 9:16 그림을
   만든다. 사진이 없으면 지금 곡의 악보를 배경으로 한 카드로 만든다.
   전부 캔버스 로컬 작업이다 — 사진도 기록도 기기 밖으로 안 나간다. */
(function initCert(){
  const pop = document.getElementById('certPop');
  const cv  = document.getElementById('certCanvas');
  if(!pop || !cv) return;
  const W = 1080, H = 1920;
  const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans KR',sans-serif";
  let photo = null;
  // 로고 세 판 — 사진 위엔 흰 판(무슨 색이 깔릴지 모른다), 반전 종이엔 다크판(라임),
  // 밝은 종이엔 기본 판
  const logoW = new Image(); logoW.src = LOGO_W;
  const logoK = new Image(); logoK.src = LOGO_K;
  const logoD = new Image(); logoD.src = LOGO_D;

  function statLines(){
    const st = statsToday();
    const avg = st.ms > 0 ? Math.round(st.bpmMs / st.ms) : 0;
    const d = new Date();
    return {
      time: fmtDur(st.ms),
      avg: avg || '--', max: st.max || '--', min: st.min || '--',
      notes: st.notes.toLocaleString(),
      date: d.getFullYear() + '.' + (d.getMonth()+1) + '.' + d.getDate(),
    };
  }

  /* 악보 카드 배경 — 지금 곡을 2마디/줄로 굽는다. paint가 GEO를 만지므로 복구 필수 */
  async function scoreImage(){
    const sv = document.createElementNS(SVG_NS, 'svg');
    document.body.appendChild(sv);
    paint(sv, {availW: 1e6, perLine: 2, from: 0, to: Math.min(measures.length, 8), noZoom: true});
    const w = +sv.getAttribute('width'), h = +sv.getAttribute('height');
    const data = new XMLSerializer().serializeToString(sv);
    sv.remove(); renderScore();
    const img = new Image();
    const url = URL.createObjectURL(new Blob([data], {type:'image/svg+xml'}));
    await new Promise((res, rej)=>{ img.onload = res; img.onerror = ()=>rej(new Error('score bake')); img.src = url; });
    URL.revokeObjectURL(url);
    return {img, w, h};
  }

  async function build(){
    statFlush();                         // 재생 중이면 지금까지를 정산해 숫자를 맞춘다
    // 인증샷 폰트·로고를 먼저 깨운다 — 안 기다리면 첫 그림이 시스템 글꼴·글자 폴백으로 나간다
    try{ await Promise.all([
      document.fonts.load("100px MaiBig"),
      document.fonts.load("100px MaiThin"),
      document.fonts.load("100px MaiKr"),
      logoW.decode(), logoK.decode(), logoD.decode(),
    ]); }catch(e){}
    const s = statLines();
    const g = cv.getContext('2d');
    g.clearRect(0, 0, W, H);
    const onPhoto = !!photo;
    let ink = '#FFFFFF', dim = 'rgba(255,255,255,.75)';

    if(onPhoto){
      const pw = photo.width, ph = photo.height;
      const sc = Math.max(W/pw, H/ph);
      g.drawImage(photo, (W - pw*sc)/2, (H - ph*sc)/2, pw*sc, ph*sc);
      // 글자 자리에 어둔 그러데이션 — 어떤 사진 위에서도 흰 글자가 산다
      let gr = g.createLinearGradient(0, 0, 0, H*0.5);
      gr.addColorStop(0, 'rgba(0,0,0,.58)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, W, H*0.5);
      gr = g.createLinearGradient(0, H*0.72, 0, H);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.62)');
      g.fillStyle = gr; g.fillRect(0, H*0.72, W, H*0.28);
    } else {
      const p = PAPERS[PAPER] || PAPERS.white;
      ink = p.ink; dim = p.ink + 'B4';                 // 8자리 hex — 70% 불투명
      g.fillStyle = p.paper; g.fillRect(0, 0, W, H);
      try{
        const sb = await scoreImage();
        const iw = W - 140, ih = sb.h * iw / sb.w;
        const maxH = H * 0.30, top = 1050;       // 기록 줄(라벨 y≈1002) 아래에서 시작한다
        g.save();
        g.beginPath(); g.rect(70, top, iw, Math.min(ih, maxH)); g.clip();
        g.drawImage(sb.img, 70, top, iw, ih);
        g.restore();
        if(ih > maxH){                                  // 잘린 자리는 종이색으로 스르르
          const gr = g.createLinearGradient(0, top + maxH - 170, 0, top + maxH);
          gr.addColorStop(0, p.paper + '00'); gr.addColorStop(1, p.paper);
          g.fillStyle = gr; g.fillRect(70, top + maxH - 170, iw, 170);
        }
      }catch(e){}                                       // 악보를 못 구우면 기록만으로 간다
    }

    if(onPhoto){ g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 14; }
    const M = 84;
    /* 서체가 이 디자인의 전부다 (드러머 선택) —
       큰 숫자만 Josefin Sans **Bold Italic**으로 기울여 힘을 주고,
       나머지 숫자·라틴은 Josefin Sans **Thin**, 한글 라벨은 에스코어드림 Thin.
       굵기 대비(Bold Italic ↔ Thin)가 인스타에서 사는 대비다. */
    const BIG  = "'MaiBig','Josefin Sans','Avenir Next'," + FONT;
    const THIN = "'MaiThin','Josefin Sans','Avenir Next'," + FONT;
    const KR   = "'MaiKr','S-CoreDream-1Thin','S-Core Dream'," + FONT;
    const sp = (px)=>{ if('letterSpacing' in g) g.letterSpacing = px + 'px'; };
    // 큰 숫자 — 총 연습 시간. 폭에 맞춰 줄인다 (1:07:32처럼 길어질 수 있다)
    g.fillStyle = ink; g.textBaseline = 'alphabetic'; g.textAlign = 'left';
    let big = 290;
    g.font = '400 ' + big + 'px ' + BIG;
    const bw2 = g.measureText(s.time).width;
    if(bw2 > W - M*2) big = Math.floor(big * (W - M*2) / bw2);
    g.font = '400 ' + big + 'px ' + BIG;
    g.fillText(s.time, M - 10, 440);
    g.fillStyle = dim; g.font = '200 31px ' + KR; sp(9);
    g.fillText('총 연습 시간', M, 522); sp(0);
    // 이번 주 · 연속 일수 — 하루치보다 이게 자랑거리다 (연습 기록 1단계)
    const wk = histSum(7), stk = histStreak();
    if(wk.ms >= 60000 || stk > 1){
      g.fillStyle = dim; g.font = '200 27px ' + KR; sp(5);
      g.fillText('최근 7일 ' + fmtLong(wk.ms) + (stk > 1 ? '   ·   ' + stk + '일 연속' : ''), M, 600);
      sp(0);
    }
    // 기록 줄 — 값은 Thin 숫자를 크게, 라벨은 얇은 한글을 작게
    const row = (y, cells)=>{
      cells.forEach(([v, lab, wide], i)=>{
        const x = M + i*330;
        g.fillStyle = ink; g.font = '400 ' + (wide ? 82 : 104) + 'px ' + THIN; sp(1);
        g.fillText(String(v), x, y); sp(0);
        g.fillStyle = dim; g.font = '200 27px ' + KR; sp(6);
        g.fillText(lab, x + 2, y + 54); sp(0);
      });
    };
    row(770,  [[s.avg, '평균 BPM'], [s.max, '최고 BPM'], [s.min, '최저 BPM']]);
    row(970,  [[s.notes, '음표'], [s.date, '날짜', true]]);
    // 브랜드 — 인증샷이 곧 홍보다. 로고 이미지, 못 읽었으면 글자로 폴백
    g.textAlign = 'center';
    const logo = onPhoto ? logoW : (PAPER === 'invert' ? logoD : logoK);
    if(logo.complete && logo.naturalWidth){
      const lw = 250, lh = logo.naturalHeight * lw / logo.naturalWidth;
      g.drawImage(logo, (W - lw)/2, H - 140 - lh, lw, lh);
    } else {
      g.fillStyle = ink; g.font = '400 58px ' + THIN; sp(14);
      g.fillText('따쿵따다둥', W/2, H - 142); sp(0);
    }
    g.fillStyle = dim; g.font = '400 27px ' + THIN; sp(10);
    g.fillText('드럼 악보 · 연습', W/2, H - 88); sp(0);
    g.textAlign = 'left'; g.shadowBlur = 0;
  }

  const close = ()=> pop.classList.remove('is-open');
  document.getElementById('certBtn').onclick = ()=>{
    photo = null;
    build();
    pop.classList.add('is-open');
    track('cert');
  };
  document.getElementById('certClose').onclick = close;
  pop.addEventListener('click', e=>{ if(e.target === pop) close(); });
  document.addEventListener('keydown', e=>{
    if(e.key === 'Escape' && pop.classList.contains('is-open')) close();
  });
  document.getElementById('certPhoto').onclick = ()=> document.getElementById('certFile').click();
  document.getElementById('certFile').onchange = async e=>{
    const f = e.target.files[0]; e.target.value = '';
    if(!f) return;
    try{ photo = await createImageBitmap(f, {imageOrientation:'from-image'}); }
    catch(err){
      // 구형 사파리 — createImageBitmap이 없거나 옵션을 모른다
      photo = await new Promise((res, rej)=>{
        const im = new Image();
        im.onload = ()=>res(im); im.onerror = rej;
        im.src = URL.createObjectURL(f);
      }).catch(()=>null);
    }
    if(photo) build();
  };
  document.getElementById('certSave').onclick = ()=>{
    cv.toBlob(async b=>{
      if(!b){ toast('그림을 만들지 못했습니다.'); return; }
      await saveFile(b, '연습인증-' + statsDayStr() + '.png');
    }, 'image/png');
  };
  certSumRefresh();
  todayRefresh();
  histDraw();          // 설정 서랍의 한 줄 요약을 부팅 때 한 번 채운다
})();

/* 악보 전체를 PNG 한 장으로.
   iOS 캔버스는 한 변 4096px / 넓이 약 16.7M px에서 막힌다. 넘으면 toBlob이
   조용히 null이나 빈 그림을 준다 — "저장이 안 된다"의 주범이다.
   그래서 배율을 3에서 시작해 한계 안으로 깎는다. */
const PNG_MAX_DIM = 4096, PNG_MAX_AREA = 16.7e6;
function pngScale(w, h){
  // 1 미만이 나오면 원본 크기로도 캔버스 한계를 못 맞춘다는 뜻. 호출부가 거른다
  return Math.min(3, PNG_MAX_DIM/w, PNG_MAX_DIM/h, Math.sqrt(PNG_MAX_AREA/(w*h)));
}

let pngBlob = null;
const pngSheet = document.getElementById('pngSheet');
const pngImgEl = document.getElementById('pngImg');
function closePngSheet(){
  pngSheet.classList.remove('is-open');
  if(pngImgEl.src.startsWith('blob:')) URL.revokeObjectURL(pngImgEl.src);
  pngImgEl.removeAttribute('src'); pngBlob = null;
}
document.getElementById('pngClose').onclick = closePngSheet;
document.getElementById('pngSave').onclick = async ()=>{      // 새 제스처 → share 가능
  if(pngBlob) await saveFile(pngBlob, safeName() + '.png');
  closePngSheet();
};

function makePng(cb){
  const page = exportPages(perLineOut(), 9999)[0];   // PNG는 한 장에 전부
  const w = +page.getAttribute('width'), h = +page.getAttribute('height');
  const data = new XMLSerializer().serializeToString(page);
  const scale = pngScale(w, h);
  if(scale < 1){
    // 담을 방법이 없다. 조용히 빈 그림을 주느니 이유를 말한다
    appAlert('악보가 길어서 PNG 한 장에 담기지 않습니다 (4마디/줄 기준 약 100마디까지).\n' +
          'PDF로 저장하면 여러 쪽으로 나뉘어 나갑니다.');
    return;
  }
  const img = new Image();
  img.onload = ()=>{
    const cv = document.createElement('canvas');
    // 올림하면 한계를 1px 넘길 수 있다. 반드시 내림
    cv.width = Math.floor(w*scale); cv.height = Math.floor(h*scale);
    const cx = cv.getContext('2d');
    // 배경은 **고른 종이색**을 따른다 — 이미지라 배경이 필요하고, 공유용이다
    cx.fillStyle = (PAPERS[PAPER] || PAPERS.white).paper; cx.fillRect(0,0,cv.width,cv.height);
    cx.setTransform(scale,0,0,scale,0,0); cx.drawImage(img,0,0);
    // toDataURL은 긴 악보에서 수 MB짜리 URL이 되어 iOS가 그냥 무시한다. toBlob을 쓴다
    cv.toBlob(b=>{
      if(!b){ appAlert('악보가 너무 길어 PNG로 담기지 않습니다. PDF로 저장해 주세요.'); return; }
      cb(b);
    }, 'image/png');
  };
  img.onerror = ()=> appAlert('악보 이미지를 만들지 못했습니다. PDF로 저장해 주세요.');
  img.src = 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(data);
}

document.getElementById('pngBtn').onclick = ()=>{
  track('png');
  makePng(b=>{
    pngBlob = b;
    if(IS_IOS){
      // 비동기로 만들어진 파일이라 여기서는 share를 못 부른다(제스처가 끊겼다).
      // 미리보기를 띄우고, 저장 버튼의 새 제스처로 넘긴다
      pngImgEl.src = URL.createObjectURL(b);
      pngSheet.classList.add('is-open');
    } else {
      saveFile(b, safeName() + '.png');
    }
  });
};

/* PDF 출력.
   **웹**: 브라우저 인쇄를 쓴다. 라이브러리 없이 벡터 품질이 나오고
   iOS·macOS 모두 인쇄 대화상자에서 "PDF로 저장"이 된다.
   **앱**: `window.print()`가 WKWebView에서 무동작이라 네이티브가 페이지를 하나씩
   `createPDF`로 떠서 PDFKit으로 붙이고 공유 시트를 띄운다(`native/ios/MaiPdfPlugin.swift`).
   공유 시트를 **네이티브가 직접** 띄우는 이유: PDF 생성이 비동기라 그 사이 사용자
   제스처가 풀려 `navigator.share`가 거부된다 — `saveFile`의 주석과 같은 함정이다.
   페이지를 쌓는 부분은 두 경로가 **같은 코드**를 쓴다. 갈리는 건 마지막 한 걸음뿐. */
const printArea = document.getElementById('printArea');

/* #printArea에 페이지별 SVG를 쌓고 페이지 수를 준다.
   **인쇄는 항상 흰 종이·검은 잉크.** 종이는 이미 하얗고 배경을 칠하면 잉크만 버린다.
   무엇보다 반전으로 두고 뽑으면 흰 잉크가 흰 종이에 찍혀 **아무것도 안 나온다.**
   `exportPages`가 끝에서 `renderScore()`로 화면을 되돌리므로, 색도 그 전에 되돌린다 —
   GEO를 되돌리는 것과 같은 이유고 같은 자리다. **순서를 바꾸지 말 것.** */
function buildPrintPages(){
  printArea.innerHTML = '';
  const keepPaper = PAPER;
  PAPER = 'white'; applyPaper();
  exportPages(perLineOut(), linesPerPage(perLineOut())).forEach(s=>{
    const d = document.createElement('div');
    d.className = 'page';
    d.appendChild(s);
    printArea.appendChild(d);
  });
  PAPER = keepPaper; applyPaper(); renderScore();
  return printArea.querySelectorAll('.page').length;
}

function clearPrintPages(){
  printArea.innerHTML = '';
  document.documentElement.classList.remove('pdf-out');
  document.body.classList.remove('pdf-out', 'pdf-pt');
}

document.getElementById('pdfBtn').onclick = async ()=>{
  track('pdf');
  if(!buildPrintPages()) return;
  await outputPrintPages();
};
/* #printArea에 채운 페이지를 내보낸다 — 웹은 브라우저 인쇄, 앱은 네이티브 PDF.
   2.1에서 떼어 냈다: 라이브러리의 악보 보기(메모째 인쇄, rdPrint)도 앱에서는 이 길을 타야 한다 —
   WKWebView에서 window.print()는 아무 일도 안 한다(8-x PDF 네이티브) */
async function outputPrintPages(){
  if(!IS_NATIVE){ window.print(); return; }   // 정리는 afterprint가 한다

  const MaiPdf = window.Capacitor.Plugins && window.Capacitor.Plugins.MaiPdf;
  /* 2026-08-23: 여기서 하루를 썼다. 실기기에서 이 알림만 뜨고 **왜 안 되는지
     알 길이 없었다** — 네이티브 등록 문제라 웹 쪽 검사로는 절대 안 잡힌다.
     그래서 실패할 때 **지금 등록된 플러그인 목록을 같이 보여 준다.**
     `Filesystem, Browser`만 있고 `MaiPdf`가 없으면 등록이 안 된 것이고,
     목록 자체가 비어 있으면 브리지가 아예 안 붙은 것이다. 두 원인이 갈린다. */
  if(!MaiPdf){
    let have = '';
    try{ have = Object.keys((window.Capacitor && window.Capacitor.Plugins) || {}).join(', '); }catch(e){}
    appAlert('PDF 기능을 불러오지 못했습니다.\n\n등록된 플러그인: ' + (have || '(없음)'));
    clearPrintPages(); return;
  }

  /* 안드로이드: 시스템 인쇄로 넘긴다.
     `pdf-out`을 **붙이지 않는다** — 안드로이드 인쇄는 `@media print`를 쓰는데
     두 규칙이 겹치면 `.pdf-pt`의 595px 페이지 박스(px=pt 가정)가 A4 종이 위에서
     6.2인치짜리로 줄어든다. 정리(clearPrintPages)는 **네이티브가 끝난 뒤에** 한다 —
     인쇄 어댑터가 비동기로 렌더하므로 먼저 지우면 빈 종이가 나온다.
     그래서 네이티브 쪽 print()는 인쇄 작업이 끝날 때 resolve한다. */
  if(IS_ANDROID){
    if(!MaiPdf.print){
      appAlert('PDF 기능을 불러오지 못했습니다.'); clearPrintPages(); return;
    }
    _nativePrinting = true;                          // afterprint가 인쇄 도중에 페이지를 비우지 못하게 (아래 주석)
    try{
      await MaiPdf.print({filename: safeName()});   // 인쇄 작업 이름 = 저장될 파일 이름
    }catch(e){
      if(!/cancel/i.test(String((e && e.message) || e))) appAlert('PDF를 만들지 못했습니다.');
    }finally{
      _nativePrinting = false;
      clearPrintPages();
    }
    return;
  }

  /* 캡처하는 동안만 화면을 종이로 바꾼다. createPDF는 **화면에 렌더된 것**을 뜨므로
     이 클래스를 미리 붙여야 하고, 네이티브가 끝날 때까지 떼면 안 된다. */
  document.documentElement.classList.add('pdf-out');
  document.body.classList.add('pdf-out', 'pdf-pt');
  window.scrollTo(0, 0);
  // 레이아웃이 앉기 전에 재면 rect가 어긋난다. 두 프레임 기다린다.
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));

  const pages = [...printArea.querySelectorAll('.page')].map(el=>{
    const r = el.getBoundingClientRect();
    return {x: r.left + window.scrollX, y: r.top + window.scrollY,
            w: r.width, h: r.height};
  });

  /* 2026-10-12 (맥 제보): 예전엔 네이티브가 캡처 → 공유 창까지 한 번에 하고 끝날 때 resolve했다.
     그래서 공유 창이 떠 있는 내내 **뒤 화면이 출력용 흰 종이**로 남아 있었다 — 맥에서는 창이 넓어
     악보 한 줄만 덩그러니 보이고 돌아갈 단추도 없는 것처럼 보였다.
     이제 `returnData`로 PDF만 받아 오고(캡처 끝 = 화면 복구), 저장은 `shareFile`이 따로 띄운다.
     옛 네이티브는 returnData를 몰라 예전처럼 직접 띄운다 — 그때는 r.data가 없어 shareFile을 안 부른다 */
  let r = null;
  try{
    r = await MaiPdf.export({pages, filename: safeName() + '.pdf', returnData: true});
  }catch(e){
    if(!/cancel/i.test(String((e && e.message) || e))) appAlert('PDF를 만들지 못했습니다.');
  }finally{
    clearPrintPages();
  }
  if(r && r.data && MaiPdf.shareFile){
    try{ await MaiPdf.shareFile({data: r.data, filename: safeName() + '.pdf'}); }
    catch(e){ if(!/cancel/i.test(String((e && e.message) || e))) appAlert('PDF를 저장하지 못했습니다.'); }
  }
}
/* ★ 2026-10-19 갤럭시 탭 S10+ 제보 "PDF를 저장하면 백지".
   안드로이드 WebView는 `createPrintDocumentAdapter`가 **렌더할 때마다(미리보기·최종 저장)**
   beforeprint/afterprint를 쏜다. 미리보기 렌더 뒤 afterprint가 여기서 #printArea를 비워서,
   사용자가 「PDF로 저장」을 눌러 다시 렌더할 때는 빈 문서가 찍혔다.
   그래서 네이티브 인쇄가 끝나기 전(onFinish → promise)에는 afterprint로 안 비운다 —
   정리는 pdfBtn의 finally가 한다. 웹(window.print)은 예전 그대로 afterprint가 정리한다.
   **`var`다** — pdfBtn 핸들러가 이 줄보다 위에 있다(호출은 나중이라 const여도 되지만, 위쪽 코드가
   부팅 중에 읽어도 안전하게) */
var _nativePrinting = false;
window.addEventListener('afterprint', ()=>{ if(!_nativePrinting) clearPrintPages(); });

