/* ================= 그리드 에디터 ================= */
const gridEl = document.getElementById('grid');
let painting = false, paintVal = 0, strokeDirty = false;
let paintMeasure = -1;
const EDITOR_COUNT_KEY = 'ddakung.editor-bars.v1';
let editorCount = 1;
try {
  const saved = localStorage.getItem(EDITOR_COUNT_KEY);
  if(/^[1-4]$/.test(saved || '')) editorCount = Number(saved);
} catch(e){}
let editorViewLast = '';
function editorView(){
  const total = measures.length, selected = Math.max(0, Math.min(total - 1, selMeasure));
  const start = Math.floor(selected / editorCount) * editorCount;
  return {count:editorCount, start, end:Math.min(total - 1, start + editorCount - 1), total, selected};
}
function notifyEditorView(){
  const detail = editorView(), key = JSON.stringify(detail);
  if(key === editorViewLast) return;
  editorViewLast = key;
  window.dispatchEvent(new CustomEvent('ddakung-editor-view-change', {detail}));
}
function setEditorCount(count){
  if(!Number.isInteger(count) || count < 1 || count > 4) return false;
  editorCount = count;
  try{ localStorage.setItem(EDITOR_COUNT_KEY, String(count)); }catch(e){}
  refreshGrid();
  return true;
}
function moveEditorPage(direction){
  if(direction !== -1 && direction !== 1) return false;
  const view = editorView(), target = view.start + direction * view.count;
  if(target < 0 || target >= view.total) return false;
  selectMeasure(target);
  return true;
}
function activateEditorMeasure(index){
  if(!Number.isInteger(index) || !measures[index]) return false;
  selectMeasure(index);
  return true;
}

/* 터치 오터치 방지.
   터치·펜은 pointerdown에서 곧바로 쓰지 않고 pend에 담아 두었다가,
   손가락이 TAP_SLOP 이상 움직이면(=스크롤) 버린다. 탭으로 끝났을 때만 커밋한다.
   pointerdown에서 preventDefault를 하지 않아야 스크롤 자체는 그대로 동작한다.
   마우스는 기존처럼 즉시 반응 + 드래그 페인트. */
const TAP_SLOP = 10;
let pend = null;
function nextVal(insId, step){
  const want = artFor(insId, selArt);
  const cur = measures[selMeasure][insId][step]|0;
  /* 고스트와 롤은 **겹쳐 쓴다** (2026-09-12): 고스트 칸에 롤을 누르면 고스트 롤,
     롤 칸에 고스트를 누르면 고스트 롤. 고스트 롤 칸에서 고스트를 다시 누르면 롤만,
     같은 롤을 다시 누르면 고스트만 남는다 — 층을 하나씩 벗기는 셈이다 */
  if(GHOST_ROLL[want] && cur === ART.GHOST) return GHOST_ROLL[want];
  if(want === ART.GHOST && GHOST_ROLL[cur]) return GHOST_ROLL[cur];
  if(ROLL_OF_GHOST[cur]){
    if(want === ART.GHOST) return ROLL_OF_GHOST[cur];
    if(GHOST_ROLL[want] === cur) return ART.GHOST;
  }
  return cur === want ? ART.OFF : want;
}

/* ── 손 순서(R·L) 탭 (2026-08-17) ──
   팔레트에서 R이나 L을 고른 동안은 탭이 음표 대신 **글자**를 적는다.
   글자는 칸(슬롯) 소속이다 — 같은 칸의 하이햇·스네어가 따로 글자를 갖지 않는다.
   발(킥·페달)에는 안 붙는다. 빈 칸을 탭하면 기본 음표를 먼저 만들어 준다 —
   글자만 떠 있는 악보는 없다(그리기도 음표 있는 칸만 그린다). */
/* ── 앞꾸밈음(플램·드래그) 탭 (2026-08-17) ──
   꾸밈음은 **그 악기의 음표**에 붙는다 — 같은 칸의 하이햇과 스네어가 서로 다른
   꾸밈음을 가질 수 있어야 하니까(스네어 플램 + 하이햇 보통이 흔하다).
   그래서 R·L(칸 소속)과 달리 악기별로 담는다. 빈 칸이면 기본 음표부터 만든다. */
function ornTap(insId, s){
  const ins = byId[insId];
  if(!ins || ins.voice !== 'hand') return;           // 발에는 앞꾸밈음이 없다
  const m = measures[selMeasure];
  if(!(m[insId][s]|0)){
    m[insId][s] = ART.NORM;                          // 이 악기의 음표부터
    previewSound(insId, ART.NORM);
  }
  if(!m.orn) m.orn = {};
  if(!m.orn[insId]) m.orn[insId] = new Array(voiceLen(m, 'hand')).fill(0);
  const gWant = (selOrnIns && selOrnIns !== insId && byId[selOrnIns]) ? selOrnIns : 0;
  const gHave = (m.ornIns && m.ornIns[insId]) ? (m.ornIns[insId][s] || 0) : 0;
  const same = (m.orn[insId][s] === selOrn) && (gHave === gWant);
  m.orn[insId][s] = same ? 0 : selOrn;   // 같은 걸(꾸밈 악기까지) 또 누르면 지움
  if(!m.orn[insId].some(v=>v)) delete m.orn[insId];
  if(!Object.keys(m.orn).length) delete m.orn;
  setOrnIns(m, insId, s, same ? 0 : gWant);
  refreshGrid(); renderScore(); refreshStepDots();
  commit();
  track('orn');
}

function stickTap(insId, s){
  const ins = byId[insId];
  if(!ins || ins.voice !== 'hand') return;           // 발에는 안 붙는다
  const m = measures[selMeasure];
  if(!HAND_INS.some(i => (m[i.id]||[])[s])){
    m[insId][s] = ART.NORM;                          // 빈 칸이면 기본 음표부터
    previewSound(insId, ART.NORM);
  }
  if(!m.stick) m.stick = new Array(voiceLen(m, 'hand')).fill(0);
  m.stick[s] = (m.stick[s] === selStick) ? 0 : selStick;   // 같은 글자를 또 누르면 지움
  if(!m.stick.some(v=>v)) delete m.stick;
  refreshGrid(); renderScore(); refreshStepDots();
  commit();
  track('stick');
}

/* ── 붙임줄 탭 (2026-08-24) ──
   팔레트에서 붙임줄을 고른 동안은 탭이 그 음을 **같은 악기의 바로 앞 온셋**과 잇는다.
   R·L(칸 소속)과 달리 **악기 소속**이다 — 붙임줄은 같은 음끼리만 잇는 것이라
   하이햇과 스네어가 한 칸에 있어도 각자 따로 이어야 한다. 발(킥)에도 건다.
   마디 안에서만 잇는다 — 마디를 넘는 붙임줄은 줄바꿈·재생·복사가 전부 커지므로 보류. */
function tieTap(insId, s){
  const ins = byId[insId];
  if(!ins) return;
  const m = measures[selMeasure];
  if(!(m[insId][s]|0)){
    m[insId][s] = ART.NORM;                          // 빈 칸이면 기본 음표부터
    previewSound(insId, ART.NORM);
  }
  // 이을 앞 온셋이 있어야 한다 — 마디 첫 음이면 걸 곳이 없다
  let prev = -1;
  for(let j=s-1; j>=0; j--) if(m[insId][j]|0){ prev = j; break; }
  /* 마디 첫 음이면 **앞 마디의 마지막 음**에 건다 (2026-09-12) — 첫 마디거나 앞 마디에
     그 악기 음이 없을 때만 막는다 */
  if(prev < 0 && selMeasure > 0 && (measures[selMeasure-1][insId] || []).some(v => v|0)) prev = 0;
  if(prev < 0){
    toast('마디의 첫 음에는 붙임줄을 걸 수 없습니다 — 앞에 이을 음이 없습니다.');
    refreshGrid(); renderScore(); refreshStepDots(); commit();
    return;
  }
  if(!m.tie) m.tie = {};
  if(!m.tie[insId]) m.tie[insId] = new Array(voiceLen(m, ins.voice)).fill(0);
  m.tie[insId][s] = m.tie[insId][s] ? 0 : 1;         // 또 누르면 해제
  if(!m.tie[insId].some(v=>v)) delete m.tie[insId];
  if(m.tie && !Object.keys(m.tie).length) delete m.tie;
  refreshGrid(); renderScore(); refreshStepDots();
  commit();
  track('tie');
}

/* 악보에서 마디를 직접 눌러 편집 대상을 바꾼다 (패드 전용).
   드러머가 아이패드를 왼쪽에 두고 치면서 왼손으로 악보를 짚는 사용 방식이다.
   마디 칩으로도 되지만, 악보를 보고 있는데 눈을 아래로 내리는 게 느리다. */
/* 2026-08-12: 폰에서도 켠다.
   원래는 패드 전용이었다 — "폰은 한두 마디 제작 용"이라는 판단이었는데,
   베타를 폰 전용으로 내보내면서 드러머들이 폰에서 곡을 만들고 있다.
   같은 요구가 "마디 터치 이동" / "현재 마디 표시"로 따로 올라왔다.
   자리를 안 먹는 기능이라(악보 위에서 끝난다) 폰에서 막을 이유가 없다. */
function tapMeasures(){ return true; }

/* 선택은 **범위**다. selMeasure가 기준점, selEnd가 끌고 간 끝.
   한 마디만 고르면 둘이 같다. 복사·붙여넣기·패턴 깔기·구간 반복이 모두 이 범위를 쓴다. */
let selEnd = 0;
function selA(){ return Math.min(selMeasure, selEnd); }
function selB(){ return Math.max(selMeasure, selEnd); }
function selCount(){ return selB() - selA() + 1; }

function selectMeasure(i, keepAnchor){
  if(i < 0 || i >= measures.length) return;
  if(keepAnchor){
    if(i === selEnd) return;
    selEnd = i;
  } else {
    if(i === selMeasure && selEnd === selMeasure) return;
    selMeasure = i; selEnd = i; cursorB = 0; cursorK = 0;
  }
  refreshChips(); refreshGrid(); refreshStepDots();
  renderScore();          // 하이라이트를 옮기려면 다시 그려야 한다
  updateEditCursor(); refreshEditBtns();
}

/* 그리드 셀과 같은 탭 가드. 손가락이 TAP_SLOP 넘게 움직이면 스크롤로 보고 버린다.
   pointerdown에서 preventDefault를 하면 악보 카드 스크롤이 죽으므로 하지 않는다. */
let scorePend = null;
let _lastTap = {mi:-1, t:0};        // 더블탭 판정 (아래 pointerup)
/* 그 마디 하나만 재생한다. 반복이 켜져 있으면 그 마디를 계속 돈다 —
   "여기만 돌려 보고 싶다"가 이 동작의 쓸모라 구간 반복과 같은 결이다. */
function playOneMeasure(mi){
  if(mi == null || mi < 0 || mi >= measures.length) return;
  if(playing) stopPlay();
  selectMeasure(mi);
  track('play-one');
  startPlay({one: mi});
  toast((mi + 1) + '마디만 재생합니다.');
}
(function(){
  const s = document.getElementById('scoreSvg');
  const miOf = el2 => {
    const v = el2 && el2.getAttribute ? el2.getAttribute('data-mi') : null;
    return v == null ? null : +v;
  };
  const miAt = (x,y)=> miOf(document.elementFromPoint(x,y));

  s.addEventListener('pointerdown', e=>{
    const mi = miOf(e.target);
    if(mi == null || !tapMeasures()) return;
    /* **이미 골라 둔 마디를 다시 누르면 악보 표시를 연다.**
       `already`를 pointerdown에서 잡아 둬야 한다 — 마우스는 아래에서 바로 선택해 버려서
       pointerup 때 보면 처음 누른 마디도 "이미 골라져 있음"이 된다. */
    const already = (mi === selMeasure && selEnd === selMeasure);
    scorePend = {mi, x:e.clientX, y:e.clientY, drag:false, already};
    if(e.pointerType !== 'touch') selectMeasure(mi);   // 마우스·펜은 즉시 반응
  });

  /* 세로로 끌면 스크롤, 가로로 끌면 범위 선택.
     터치에서 이 둘을 안 가르면 악보를 넘기다가 엉뚱한 구간이 잡힌다. */
  window.addEventListener('pointermove', e=>{
    if(!scorePend) return;
    const dx = e.clientX - scorePend.x, dy = e.clientY - scorePend.y;
    if(!scorePend.drag){
      if(Math.abs(dy) > TAP_SLOP && Math.abs(dy) > Math.abs(dx)){ scorePend = null; return; }
      if(Math.abs(dx) > TAP_SLOP){
        scorePend.drag = true;
        selectMeasure(scorePend.mi);                   // 기준점을 먼저 확정
      }
    }
    if(scorePend.drag){
      const mi = miAt(e.clientX, e.clientY);
      if(mi != null) selectMeasure(mi, true);          // 기준점은 두고 끝만 옮긴다
    }
  }, {passive:true});

  window.addEventListener('pointerup', ()=>{
    /* ── 더블탭 = 그 마디만 재생 (2026-08-17, 보류했던 항목) ──
       **시간으로 가른다.** 폰·세로에서는 "이미 고른 마디를 다시 탭 = 악보 표시 팝업"이라
       두 번째 탭이 겹친다. 빠르게 두 번(320ms 안)이면 재생, 천천히 두 번이면 팝업이다 —
       더블클릭과 두 번의 클릭을 가르는 일반적인 규칙 그대로다.
       드래그(구간 선택)로 끝난 탭은 더블로 안 본다. */
    if(scorePend && !scorePend.drag){
      const now = Date.now();
      if(scorePend.mi === _lastTap.mi && now - _lastTap.t < 320){
        _lastTap = {mi:-1, t:0};
        playOneMeasure(scorePend.mi);
        scorePend = null;
        return;
      }
      _lastTap = {mi: scorePend.mi, t: now};
    }
    /* 레일 모드(2단 악보 탭)에서는 팝업을 안 연다 — 탭은 선택이고,
       열려 있는 도구 패널이 그 마디를 따라온다. 여러 마디에 연달아
       기호를 넣을 때 팝업을 열고 닫는 왕복이 없어지는 게 이 개편의 요점이다. */
    if(scorePend && typeof railModeActive === 'function' && railModeActive()){
      if(!scorePend.drag) selectMeasure(scorePend.mi);
      railFollow(selMeasure);
      scorePend = null;
      return;
    }
    if(scorePend && !scorePend.drag){
      const pop = scorePend.already && typeof openMarkPop === 'function'
                  && typeof markPopOK === 'function' && markPopOK();
      if(pop) openMarkPop(scorePend.mi);
      else selectMeasure(scorePend.mi);
    }
    scorePend = null;
  });
  window.addEventListener('pointercancel', ()=>{ scorePend = null; });
})();

/* ================= 펜슬 메모 입력 (2026-08-17) =================
   펜(과 마우스)은 그리고, **손가락은 스크롤한다.** 펜 모드에서는 touch-action을
   꺼야 펜슬이 스크롤 대신 선을 남기므로, 손가락 스크롤은 여기서 직접 옮긴다.
   capture 단계에서 잡아야 scoreSvg의 마디 탭 핸들러보다 먼저 삼킬 수 있다.
   획은 화면 SVG 좌표로 그리다가, 뗄 때 마디 상대 좌표(fx=폭 비율, fy=LG 단위)로
   바꿔 measures[mi].ink에 담는다 — 그래서 어느 배치로 다시 그려도 마디를 따라간다. */
(function initPenDraw(){
  const wrap = document.getElementById('scoreWrap');
  if(!wrap) return;
  let stroke = null;      // {mi, id, pts:[[x,y] SVG 단위], node}
  let pan = null;         // {id, y, top} — 펜 모드의 손가락 스크롤
  const toSvg = (cx, cy)=>{
    const ctm = svg.getScreenCTM();
    if(!ctm) return null;
    const p = new DOMPoint(cx, cy).matrixTransform(ctm.inverse());
    return [p.x, p.y];
  };
  /* slotXCache로 마디를 찾는다 — 탭 사각형과 달리 획은 오선 위아래 여백까지 받는다 */
  const miAtSvg = (x, y)=>{
    for(let i = 0; i < slotXCache.length; i++){
      const L = slotXCache[i]; if(!L || !L.w) continue;
      if(y < L.top - 6*LG || y > L.top + 10*LG) continue;
      if(x >= L.x0 && x < L.x0 + L.w) return i;
    }
    return -1;
  };
  /* 지우개 — 누른 자리에서 9px 안에 점이 있는 첫 획을 지운다 */
  function eraseAt(x, y){
    const R = 9;
    for(let i = 0; i < measures.length; i++){
      const m = measures[i], L = slotXCache[i];
      if(!m.ink || !L || !L.w) continue;
      for(let k = 0; k < m.ink.length; k++){
        for(const q of m.ink[k].p){
          const px = L.x0 + q[0]*L.w, py = L.top + q[1]*LG;
          if((px-x)*(px-x) + (py-y)*(py-y) <= R*R){
            m.ink.splice(k, 1);
            if(!m.ink.length) delete m.ink;
            renderScore(); commit();
            return;
          }
        }
      }
    }
  }
  /* ★ iPadOS 사파리의 **Scribble이 펜슬 입력을 가로챈다** (2026-08-21 실기기 제보,
     WebKit 217430). 우리 코드가 아니라 시스템 기능이라 `pointerdown`이 아예 안 온다 —
     "펜을 골랐는데 전혀 안 그어진다"가 정확히 그 증상이고, 헤드리스에서는
     합성 이벤트라 재현이 안 된다(그래서 `verify-pen.js`는 계속 통과했다).
     막는 방법은 하나뿐이다 — **비수동 touch 리스너에서 preventDefault.**
     펜 모드일 때만 건다. 손가락 스크롤은 아래 `pan`이 대신 옮기므로 잃는 게 없다. */
  const eatTouch = e=>{ if(typeof penActive === 'function' && penActive()) e.preventDefault(); };
  wrap.addEventListener('touchstart', eatTouch, {passive:false, capture:true});
  wrap.addEventListener('touchmove',  eatTouch, {passive:false, capture:true});

  wrap.addEventListener('pointerdown', e=>{
    if(typeof penActive !== 'function' || !penActive()) return;
    if(e.pointerType === 'touch'){
      if(!pan) pan = {id: e.pointerId, y: e.clientY, top: wrap.scrollTop};
      e.stopPropagation();               // 마디 선택으로 새지 않게
      return;
    }
    const p = toSvg(e.clientX, e.clientY);
    if(!p) return;
    e.preventDefault(); e.stopPropagation();
    if(penErase){ eraseAt(p[0], p[1]); return; }
    const mi = miAtSvg(p[0], p[1]);
    if(mi < 0) return;
    const node = el('path', {fill:'none', stroke: inkColor(penColor),
      'stroke-width': penWidth === 2 ? 2.6 : 1.4, 'stroke-linecap':'round',
      'stroke-linejoin':'round', opacity: 0.92,
      d: 'M' + p[0].toFixed(1) + ' ' + p[1].toFixed(1)});
    svg.appendChild(node);
    stroke = {mi, id: e.pointerId, pts: [p], node};
  }, {capture:true});
  window.addEventListener('pointermove', e=>{
    if(pan && e.pointerId === pan.id){
      wrap.scrollTop = pan.top - (e.clientY - pan.y);
      return;
    }
    if(!stroke || e.pointerId !== stroke.id) return;
    const p = toSvg(e.clientX, e.clientY);
    if(!p) return;
    const l = stroke.pts[stroke.pts.length - 1];
    if(Math.hypot(p[0]-l[0], p[1]-l[1]) < 1.2) return;   // 점 솎기
    if(stroke.pts.length >= 240) return;                 // normalize 상한과 같다
    stroke.pts.push(p);
    stroke.node.setAttribute('d',
      stroke.node.getAttribute('d') + 'L' + p[0].toFixed(1) + ' ' + p[1].toFixed(1));
  }, {capture:true});
  function finish(e){
    if(pan && e.pointerId === pan.id) pan = null;
    if(!stroke || e.pointerId !== stroke.id) return;
    const st = stroke; stroke = null;
    st.node.remove();                    // 미리보기는 걷고, 정식 렌더가 다시 그린다
    const L = slotXCache[st.mi];
    if(!L || !L.w) return;
    // 점 하나(탭)도 짧은 점 획으로 남긴다 — 스타카토 점 같은 용도
    if(st.pts.length < 2) st.pts.push([st.pts[0][0] + 0.8, st.pts[0][1]]);
    const m = measures[st.mi];
    if(m.ink && m.ink.length >= 40){
      toast('한 마디에 담을 수 있는 획(40개)이 가득 찼습니다.');
      renderScore(); return;
    }
    if(!m.ink) m.ink = [];
    m.ink.push({
      p: st.pts.map(q => [
        Math.round(Math.max(-0.2, Math.min(1.2, (q[0]-L.x0)/L.w)) * 1000) / 1000,
        Math.round(Math.max(-6,   Math.min(10,  (q[1]-L.top)/LG)) * 100)  / 100]),
      c: penColor, w: penWidth});
    renderScore(); commit();
    if(typeof track === 'function') track('pen-stroke');
  }
  window.addEventListener('pointerup', finish, {capture:true});
  /* 취소는 **버리지 말고 거둔다** (2026-08-21). 사파리는 그리는 도중에도
     제스처를 가져가며 `pointercancel`을 던진다. 그때 획을 지우면 사용자에게는
     "긋다가 사라졌다"로 보인다 — 이미 점이 둘 이상이면 그건 획이다. */
  window.addEventListener('pointercancel', e=>{
    if(pan && e.pointerId === pan.id) pan = null;
    if(!stroke || e.pointerId !== stroke.id) return;
    if(stroke.pts.length >= 2){ finish(e); return; }
    stroke.node.remove(); stroke = null;
  }, {capture:true});
})();

let lastScrolledM = -1;
function scrollScoreTo(mi, force){
  if(typeof ensureScorePage==='function')ensureScorePage(mi);
  const wrap = document.getElementById('scoreWrap');
  const L = slotXCache[mi];
  if(!wrap || !L) return;
  if(!force && mi === lastScrolledM) return;
  lastScrolledM = mi;
  const natH = svg.height.baseVal.value || 1;
  const scale = (svg.getBoundingClientRect().height || natH) / natH;
  const top = (L.top - 30) * scale;
  const bottom = (L.top + 4*LG + 30) * scale;
  const view = wrap.clientHeight;
  // 연주 모드에서는 "안 보일 때만" 따라가면 줄이 바뀌는 순간 눈이 튄다.
  // 현재 줄을 화면 위쪽 1/4 자리에 놓아 다음 줄이 항상 미리 보이게 한다.
  // 연습 모드에서는 "안 보일 때만" 따라가면 줄이 바뀌는 순간 눈이 튄다
  if(document.body.classList.contains('is-practice')){
    const want = Math.max(0, top - view*0.22);
    if(Math.abs(want - wrap.scrollTop) > 4) wrap.scrollTo({top:want, behavior:'smooth'});
    return;
  }
  if(top < wrap.scrollTop || bottom > wrap.scrollTop + view){
    wrap.scrollTo({top: Math.max(0, top - 8), behavior:'smooth'});
  }
}

function labelW(){
  if(document.body.classList.contains('edition-ipad')) return 88;   // 2단에서는 라벨을 조인다
  return window.innerWidth >= 700 ? 108 : 84;
}
/* 아이패드 2단에서는 그리드 폭이 창이 아니라 오른쪽 패널 폭으로 정해진다.
   16칸이 다 들어가면 칸을 줄여 가로 스크롤을 없애고, 그래도 모자라면
   26px에서 멈추고 스크롤에 맡긴다 — 분할선을 끌면 사용자가 직접 넓힐 수 있다. */
function cellW(m=measures[selMeasure]){
  if(document.body.classList.contains('crt-workspace')){
    const gw=document.querySelector('.gridWrap');
    const mode=document.getElementById('gridMode');
    let width=gw?.clientWidth || 0;
    if((mode?.clientWidth || width)>=1500 && editorCount>1)width=(width-14)/2;
    if(width>0)return Math.max(26,Math.min(100,Math.floor((width-32-labelW()-gridOverhead(m))/gridUnits(m))));
  }
  /* 2026-08-13: 아이패드 2단만 맞추던 걸 **한 단 패드(세로)까지** 넓혔다.
     1024 세로에서 그리드가 딱 16px 넘쳐서 "좌우로 아주 살짝 슬라이드"됐다(제보).
     맞춰 보면 세로에서는 **가로 스크롤이 아예 없어진다** —
     768에서 31px · 820에서 34px · 1024에서 41px. 26px 바닥에 안 걸린다.
     폰은 그대로 38px 고정 — 어떤 값으로도 16칸이 안 들어가서 맞출 게 없다. */
  if(document.body.classList.contains('edition-pad')){
    const gw = document.querySelector('.gridWrap');
    if(gw && gw.clientWidth > 0){
      /* 폭 = 라벨 + 칸들 + 여백. 예전엔 **16칸으로 박아 놨는데**, 32분(div 8)이 들어오면
         마디가 32칸이라 계산이 통째로 어긋난다(6연음 24칸도 이미 어긋나 있었다).
         이제 이 마디가 실제로 먹는 칸 수와 여백을 재서 나눈다.
         보통 마디(4박·전부 div 4)면 16칸·여백 96으로 **예전 값과 완전히 같다**.
         박 사이를 벌리면(요청 1) `gridOverhead`의 상수도 같이 올려야 한다 —
         안 올렸더니 아이패드 1024에서 문서가 통째로 가로 스크롤됐다 */
      const avail = gw.clientWidth - 28 - labelW() - gridOverhead(m);   // 28 = gridWrap 좌우 패딩
      return Math.max(26, Math.min(42, Math.floor(avail / gridUnits(m))));
    }
    return 30;
  }
  return window.innerWidth >= 700 ? 42 : 38;
}
/* 이 마디가 먹는 "칸 하나" 단위 수. 보통 마디는 16 — 예전 상수와 같다.
   32분 박은 칸이 8개지만 폭은 1.8배라, 칸 크기 기준으로는 4*1.8 = 7.2단위를 먹는다 */
function gridUnits(m){
  const nb = beatCount(m);
  let u = 0;
  for(let b=0; b<nb; b++) u += 4*beatMul(m, b);
  return u || 16;
}
/* 칸이 아닌 것들이 먹는 폭. 박 사이 그리드 간격 4 + 박 오른쪽 패딩 8 = 박당 12,
   거기에 박 안 칸 사이 4px×(칸수-1). 보통 마디면 48 + 48 = 96으로 예전 상수와 같다 */
function gridOverhead(m){
  const nb = beatCount(m);
  let o = 12*nb;
  for(let b=0; b<nb; b++) o += 4*(Math.max(divCells(divOf(m,b,'hand')), divCells(divOf(m,b,'foot'))) - 1);
  return o;
}

/* 그리드는 이제 **박 블록**으로 짠다.
   박 폭은 분할과 무관하게 고정이고, 칸 폭 = 박폭/div로 나뉜다.
   그래서 셋잇단 박은 칸이 눈에 띄게 넓어져 보면 바로 알고, 칸 폭이 그대로
   시간 길이가 되므로 위쪽 악보와 세로로 맞는다.

   행마다 칸 수가 다를 수 있어서(손 3분할 · 발 4분할) 한 장짜리 CSS 그리드로는
   못 짠다. 바깥은 `박 개수`만큼의 그리드, 각 박 안은 `div`개의 서브 그리드로 둔다. */
function beatPx(m){ return cellW(m)*4 + 20; }   // 칸 사이 4px×3 + 박 사이 여백 8px

/* Count actual input slots from one in every beat block. */
function countLabels(beatNo, div, merged){
  // Input boxes count their own subdivision slots, independently of bar/beat
  // numbering. divCells also handles mixed divisions (e.g. 2+3 => five slots).
  return Array.from({length:divCells(div)},(_,i)=>String(i+1));
}
/* 입력판 칸 폭 — 칸 폭이 곧 시간 길이다. 섞은 박은 반박마다 칸 수가 달라 fr로 나눈다
   (2+3이면 3fr 3fr 2fr 2fr 2fr). 보통 박은 예전 그대로 repeat(d, 1fr) */
function divCols(d){
  const P = DIV_MIX[d];
  if(!P) return `repeat(${d}, 1fr)`;
  const L = P[0] * P[1];
  return Array(P[0]).fill((L / P[0]) + 'fr').concat(Array(P[1]).fill((L / P[1]) + 'fr')).join(' ');
}

function buildGrid(){
  gridEl.innerHTML = '';
  const view = editorView();
  for(let mi = view.start; mi <= view.end; mi++){
  const m = measures[mi];
  const card = document.createElement('section');
  card.className = 'measure-editor-card'; card.dataset.measure = mi;
  const heading = document.createElement('button');
  heading.className = 'measure-editor-title'; heading.dataset.measure = mi;
  heading.textContent = '#' + (mi+1);
  heading.onclick = ()=>activateEditorMeasure(mi);
  card.appendChild(heading);
  const scroll = document.createElement('div');
  scroll.className = 'measure-editor-scroll'; card.appendChild(scroll);
  const nb = beatCount(m);
  const bw = beatPx(m);
  const blk = document.createElement('div');
  blk.className = 'gblock'; blk.dataset.measure = mi;
  /* 박 폭은 악보와 **같은 배수**를 쓴다(`beatMul`). 안 맞추면 칸 폭이 시간 길이와
     어긋나서 위 악보와 세로로 안 맞는다 — 그 정렬이 이 그리드의 강점이다.
     덤으로 32분 박이 1.8배가 되면 칸이 `(38*4+20)*1.8/8 = 34px`이라
     보통 칸(38px)과 비슷해서 터치 크기도 살아난다. */
  const cols = [];
  for(let b=0; b<nb; b++) cols.push(Math.round(bw*beatMul(m,b)) + 'px');
  blk.style.gridTemplateColumns = `${labelW()}px ${cols.join(' ')}`;

  // 박 머리 — 누르면 그 박의 나누기를 바꾼다
  const corner = document.createElement('div');
  corner.className = 'gcorner';
  // "이 줄을 누르면 박을 나눈다"를 한 번만 말한다. 박마다 반복하면 시끄럽다
  corner.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"'
    + ' stroke-width="2.6" stroke-linecap="round" aria-hidden="true">'
    + '<path d="M6 4v16M12 4v16M18 4v16"/></svg>' + t('나누기');
  blk.appendChild(corner);
  for(let b=0; b<nb; b++){
    const h = document.createElement('button');
    const dh = divOf(m,b,'hand'), df = divOf(m,b,'foot');
    const odd = (dh !== 4 || df !== 4);
    /* 칸 수는 divCells — 섞어 나누기(23)는 코드가 칸 수가 아니다 */
    h.className = 'beathead' + ((b+1)%2===0 ? ' even' : '') + (odd ? ' split' : '');
    h.dataset.b = b; h.dataset.measure = mi;
    h.title = t('{n}박 나누기 — 손 {h} · 발 {f}')
               .replace('{n}', beatNoOf(m, b)).replace('{h}', divLabel(dh)).replace('{f}', divLabel(df));
    // 세는 말은 **손 분할**을 따른다. 손이 멜로디를 쥐고 있어서 그쪽으로 센다
    h.style.gridTemplateColumns = divCols(dh);
    h.innerHTML = countLabels(beatNoOf(m, b), dh, mergedBeat(m, b))
      .map((t,i)=> `<span class="${i===0?'b1':''}">${t}</span>`).join('');
    blk.appendChild(h);
  }

  INSTR.forEach((ins,ri)=>{
    const lab = document.createElement('div');
    lab.className = 'rowlabel';
    const brushT = t('{ins}에 한 박 패턴 깔기').replace('{ins}', ins.name);
    const brushA = t('{ins}에 패턴 깔기').replace('{ins}', ins.name);
    lab.innerHTML = `<button class="rowbrush" data-ins="${ins.id}" data-measure="${mi}" title="${escapeHtml(brushT)}"`
                  + ` aria-label="${escapeHtml(brushA)}">`
                  + `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"`
                  + ` stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">`
                  + `<path d="M17 3.5 20.5 7 17 10.5"/><path d="M20.5 7H8A4.5 4.5 0 0 0 3.5 11.5v.5"/>`
                  + `<path d="M7 20.5 3.5 17 7 13.5"/><path d="M3.5 17H16a4.5 4.5 0 0 0 4.5-4.5V12"/>`
                  + `</svg></button>`
                  + `<span class="key">${ri+1}</span>${ins.name}`;
    blk.appendChild(lab);
    for(let b=0; b<nb; b++){
      const d = divOf(m, b, ins.voice), off = beatOffset(m, ins.voice, b);
      const gb = document.createElement('div');
      gb.className = 'gbeat' + (b%2===1 ? ' evenbeat' : '');
      gb.style.gridTemplateColumns = divCols(d);
      for(let k=0; k<divCells(d); k++){
        const s = off + k;
        const c = document.createElement('div');
        c.className = 'cell' + (k===0 ? ' beat0' : '') + (b%2===1 ? ' evenbeat' : '');
        c.dataset.ins = ins.id; c.dataset.step = s; c.dataset.v = ins.voice;
        c.dataset.b = b; c.dataset.k = k; c.dataset.measure = mi;
        c.addEventListener('pointerdown', e=>{
          if(e.button !== 0) return;
          if(e.pointerType === 'touch'){
            if(PEN_ONLY) return;          // 펜을 쓰는 중 — 손가락은 넘기기 전용
            // 스크롤일 수도 있다. 확정을 pointerup까지 미룬다
            pend = {id:ins.id, s, mi, x:e.clientX, y:e.clientY};
            return;
          }
          /* 펜·마우스는 즉시. 펜에서 `preventDefault`를 해야 끌 때 화면이 안 밀린다 —
             손가락 경로는 여기 안 오므로 카드 스크롤은 그대로 산다. */
          e.preventDefault();
          activateEditorMeasure(mi);
          paintMeasure = mi;
          if(selOrn){ ornTap(ins.id, s); return; }       // 앞꾸밈음 모드
          if(selStick){ stickTap(ins.id, s); return; }   // R·L 모드 — 드래그 칠 없음
          if(selTie){ tieTap(ins.id, s); return; }       // 붙임줄 모드 — 탭만
          painting = true; strokeDirty = false;
          paintVal = nextVal(ins.id, s);
          if(setCell(ins.id, s, paintVal)) strokeDirty = true;
          if(paintVal) previewSound(ins.id, paintVal,mi,s);
        });
        c.addEventListener('pointerenter', ()=>{
          if(painting && mi === paintMeasure && setCell(ins.id, s, paintVal, mi)) strokeDirty = true;
        });
        gb.appendChild(c);
      }
      blk.appendChild(gb);
    }
  });
  scroll.appendChild(blk); gridEl.appendChild(card);
  }
  gridEl.dataset.sig = gridSig();     // refreshGrid가 구조 일치를 이 값으로 본다
  cacheCells();
  refreshGrid();
  refreshTsBtn();                     // 불러오기·되돌리기까지 여기 한 곳으로 모인다
}
window.addEventListener('pointermove', e=>{
  if(!pend) return;
  if(Math.abs(e.clientX - pend.x) > TAP_SLOP || Math.abs(e.clientY - pend.y) > TAP_SLOP) pend = null;
}, {passive:true});

/* 펜으로 끌어서 칠하기.
   마우스는 `pointerenter`가 하지만 **펜·터치는 그게 안 온다** — 브라우저가 처음 누른
   요소에 포인터를 묶어 두기 때문이다(암묵적 포인터 캡처). 좌표로 직접 찾는다.
   `releasePointerCapture`로 푸는 방법도 있지만, 엔진마다 결과가 갈려서 좌표가 확실하다. */
window.addEventListener('pointermove', e=>{
  if(!painting || e.pointerType === 'mouse') return;
  const el = document.elementFromPoint(e.clientX, e.clientY);
  const c = el && el.closest && el.closest('.cell');
  if(!c || !c.dataset.ins || +c.dataset.measure !== paintMeasure) return;
  if(setCell(c.dataset.ins, +c.dataset.step, paintVal, paintMeasure)) strokeDirty = true;
}, {passive:true});

/* 펜을 처음 보면 설정을 열어 준다. **먼저 켜 두지 않는다** — 손가락 입력이 갑자기
   죽으면 고장으로 읽힌다. 한 번 묻고, 답했든 흘렸든 다시 묻지 않는다. */
window.addEventListener('pointerdown', e=>{
  if(e.pointerType !== 'pen' || PEN_SEEN) return;
  PEN_SEEN = true;
  try{ localStorage.setItem(PEN_SEEN_KEY, '1'); }catch(e2){}
  syncPenUI();
  if(!PEN_ASKED){
    PEN_ASKED = true;
    setTimeout(()=> toast(
      t('Apple Pencil로 입력했습니다. <b>손가락은 넘기기 전용</b>으로 둘까요?')
        .replace(/Apple Pencil/g, PEN_BRAND),
      '그렇게', ()=> setPenOnly(true)), 600);
  }
}, {capture:true});


function setPenOnly(on){
  PEN_ONLY = !!on;
  try{ localStorage.setItem(PEN_ONLY_KEY, PEN_ONLY ? '1' : '0'); }catch(e){}
  syncPenUI();
}
/* 설정 시트의 펜 항목은 **펜을 본 적이 있을 때만** 보인다.
   `initSettings`가 아직 안 돌았을 수 있어 요소가 없어도 조용히 넘어간다. */
function syncPenUI(){
  const row = document.getElementById('penRow');
  if(row) row.hidden = !PEN_SEEN;
  const box = document.getElementById('penScope');
  if(box) box.querySelectorAll('button').forEach(x=>
    x.classList.toggle('sel', x.dataset.penonly === (PEN_ONLY ? '1' : '0')));
}
window.addEventListener('pointerup', ()=>{
  if(painting){ painting = false; if(strokeDirty){ commit(); strokeDirty = false; } }
  if(pend){
    if(!activateEditorMeasure(pend.mi)){ pend = null; return; }
    if(selOrn){ ornTap(pend.id, pend.s); pend = null; return; }
    if(selStick){ stickTap(pend.id, pend.s); pend = null; return; }
    if(selTie){ tieTap(pend.id, pend.s); pend = null; return; }
    const v = nextVal(pend.id, pend.s);
    if(setCell(pend.id, pend.s, v)) commit();
    if(v) previewSound(pend.id, v,pend.mi,pend.s);
    pend = null;
  }
});
window.addEventListener('pointercancel', ()=>{
  pend = null;
  if(painting){ painting = false; if(strokeDirty){ commit(); strokeDirty = false; } }
});

/* ---- 박 나누기 UI ----
   전환은 그 박의 음을 지운다(4칸을 3칸으로 옮길 방법이 없다).
   묻지 않고 바로 바꾸되 **지워진 게 있으면 되돌리기 길을 토스트로 준다** —
   묻는 창을 띄우면 시험 삼아 눌러 보는 것 자체가 부담이 된다. */
const DIV_NAME = {2:'8분', 3:'셋잇단', 4:'16분', 5:'5연음', 6:'16분셋', 7:'7연음', 8:'32분',
                  23:'16분+셋', 32:'셋+16분', 13:'8분+셋', 31:'셋+8분',
                  24:'16분+32분', 42:'32분+16분', 33:'셋+셋'};
/* 두 박을 묶은 박(2박 3연음)의 칸 이름 — 칸 하나가 두 배 길어서 이름이 한 단계씩 밀린다.
   3칸이 이 기능의 용건(4분음표 셋잇단)이다 */
const DIV_NAME_M = {2:'4분', 3:'셋잇단', 4:'8분', 5:'5연음', 6:'8분셋', 7:'7연음', 8:'16분'};
/* ================= 박자표 UI (2026-08-19) =================
   **곡 전체에 한 번에 건다.** 마디마다 다른 박자표는 줄 나누기·폭 계산까지
   건드려야 해서 다음 단계로 미뤘다(데이터는 이미 마디마다 담긴다 — `m.ts`).

   바꾸면 박 수와 칸 수가 달라진다. 새 칸에 옛 음표를 **인덱스 그대로** 옮기고,
   넘치는 자리에 음이 있었으면 그 사실을 말해 준다. 조용히 지우면
   "왜 뒤가 사라졌지"가 되고, 못 바꾸게 막으면 그건 그냥 기능이 없는 것이다. */
const TS_QUICK = [[4,4],[3,4],[2,4],[5,4],[7,4],[6,8],[9,8],[12,8],[5,8],[7,8]];

/* 이 박자표로 가능한 묶음들. 5/8이면 [[2,3],[3,2]] */
function grpChoices(num, den){
  if(den !== 8) return [];
  if(num % 3 === 0) return [];              // 6/8·9/8·12/8은 셋씩이 유일하다
  if(num < 5 || num > 11) return [];
  const out = [];
  const walk = (rest, acc)=>{
    if(rest === 0){ if(acc.includes(3)) out.push(acc.slice()); return; }
    if(rest >= 2) walk(rest-2, acc.concat(2));
    if(rest >= 3) walk(rest-3, acc.concat(3));
  };
  walk(num, []);
  // 묶음이 적은 순 → 사전순. 너무 많으면 앞의 여섯만 (7/8만 해도 여덟 가지다)
  out.sort((a,b)=> a.length - b.length || a.join().localeCompare(b.join()));
  return out.slice(0, 6);
}

let tsPick = [4,4], tsPickGrp = null;
const tsPop = document.getElementById('tsPop');

function tsLabel(m){ const t = tsOf(m); return t[0] + '/' + t[1]; }
/* 버튼 글자를 맞추면서 **곡 전역(SONG_TS)도 같이 맞춘다.**
   불러오기·되돌리기·프리셋 어디로 들어와도 `buildGrid`는 지나가므로
   여기 한 곳만 맞추면 전역이 저절로 따라온다 — 경로마다 챙기면 반드시 하나를 빠뜨린다 */
function refreshTsBtn(){
  const m = measures[0];
  if(!m) return;
  const t = tsOf(m), g = groupsOf(m);
  SONG_TS = t.slice();
  SONG_GRP = (g.join('+') === defaultGroups(t[0], t[1]).join('+')) ? null : g.slice();
  const b = document.getElementById('tsBtn');
  if(b) b.textContent = t[0] + '/' + t[1];
  refreshBpmUnit();
}
/* BPM 옆에 **무엇의 BPM인지** 적는다. 6/8에서 "100"만 있으면 4분음표 100으로 읽힌다 */
function refreshBpmUnit(){
  const el = document.getElementById('bpmUnit');
  if(!el) return;
  const u = tempoUnitQ(measures[0]);
  const alt = Math.abs(u - 1) > 1e-9;
  el.textContent = alt ? (Math.abs(u - 1.5) < 1e-9 ? '♩. BPM' : '♪ BPM') : 'BPM';
  el.classList.toggle('alt', alt);
  el.title = alt
    ? t('이 박자표에서는 {unit} 기준입니다')
        .replace('{unit}', t(Math.abs(u - 1.5) < 1e-9 ? '점4분음표' : '8분음표'))
    : t('4분음표 기준');
}
function renderTsPop(){
  const q = document.getElementById('tsQuick');
  q.innerHTML = '';
  TS_QUICK.forEach(([n,d])=>{
    const b = document.createElement('button');
    b.textContent = n + '/' + d;
    b.className = (n === tsPick[0] && d === tsPick[1]) ? 'sel' : '';
    b.onclick = ()=>{ tsPick = [n,d]; tsPickGrp = null; syncTsInputs(); };
    q.appendChild(b);
  });
  document.getElementById('tsNum').value = tsPick[0];
  document.getElementById('tsDen').value = String(tsPick[1]);

  const choices = grpChoices(tsPick[0], tsPick[1]);
  const row = document.getElementById('tsGrpRow');
  const box = document.getElementById('tsGrp');
  row.hidden = choices.length === 0;
  box.innerHTML = '';
  if(choices.length){
    const cur = (tsPickGrp || defaultGroups(tsPick[0], tsPick[1])).join('+');
    choices.forEach(g=>{
      const b = document.createElement('button');
      b.textContent = g.join('+');
      b.className = (g.join('+') === cur) ? 'sel' : '';
      b.onclick = ()=>{ tsPickGrp = g.slice(); renderTsPop(); };
      box.appendChild(b);
    });
  }

  const g = tsPickGrp || defaultGroups(tsPick[0], tsPick[1]);
  const beats = g.length;
  const unit = tsPick[1] === 8
    ? (g.every(v=>v===3) ? '점4분음표' : (g.every(v=>v===2) ? '4분음표' : '4분·점4분'))
    : '4분음표';
  document.getElementById('tsTip').innerHTML =
    t('한 마디 <b>{n}박</b> · 박의 길이 <b>{unit}</b>')
      .replace('{n}', beats).replace('{unit}', t(unit)) +
    (tsPick[1] === 8 && g.some(v=>v===3)
      ? '<br>' + t('8분음표 셋이 한 박입니다. 메트로놈도 그 단위로 셉니다.') : '');
}
function syncTsInputs(){ renderTsPop(); }
/* 적용 범위 — 'all'(곡 전체, 예전 동작) / 'from'(고른 마디부터 끝까지).
   창을 열 때마다 'all'로 되돌린다: 지난번에 「이 마디부터」로 두고 닫았다는 이유로
   곡 전체를 바꾸려던 사람이 한 마디만 바꾸게 되면 그게 더 나쁜 사고다. */
let tsScope = 'all';
function tsScopeAt(){ return typeof selA === 'function' ? selA() : (selMeasure|0); }
function syncTsScope(){
  const box = document.getElementById('tsScopeRow');
  if(box) box.querySelectorAll('button').forEach(b=>
    b.classList.toggle('sel', b.dataset.tsscope === tsScope));
}
function openTsPop(){
  tsScope = 'all';
  /* 고른 마디의 박자표를 보여 준다 — 곡 중간이 다를 수 있으므로 첫 마디가 아니다 */
  tsPick = tsOf(measures[tsScopeAt()] || measures[0]);
  const cur = groupsOf(measures[tsScopeAt()] || measures[0]);
  tsPickGrp = cur.join('+') === defaultGroups(tsPick[0], tsPick[1]).join('+') ? null : cur;
  renderTsPop(); syncTsScope();
  tsPop.classList.add('is-open');
}
function closeTsPop(){ tsPop.classList.remove('is-open'); }

/* 박자표를 바꾼다. 음표는 **칸 인덱스 그대로** 옮긴다 —
   4/4(16칸)에서 3/4(12칸)로 가면 4박째가 잘리고, 5/4로 가면 5박째가 빈다.
   드러머가 기대하는 동작이 그것이다(앞에서부터 그대로 남는다).

   ── `from` · `to` (2026-09-01 · 09-02) ────────────────
   `from`을 주면 **그 마디부터**, `to`(끝 다음 자리)까지만 바꾼다.
     from만        → 그 마디부터 끝까지 (인쇄 악보의 기본 규칙 —
                     박자표는 한 번 걸리면 다음 박자표가 나올 때까지 간다)
     from, from+1  → **그 마디 하나만**. 뒤 마디는 제 박자표를 그대로 들고 있으므로
                     악보에는 두 마디 모두에 박자표가 찍힌다. 실제 악보가 그렇게 생겼다
   한 마디만 바꾸는 것을 두 번 호출로 적으면 되돌리기가 두 단계가 된다 —
   그래서 범위를 한 번에 받는다.

   **from을 안 주면 곡 전체다** — 옛 호출부(박자표 단추)가 그대로 돈다.
   곡 전체를 바꿀 때만 `SONG_TS`(새 마디의 기본값)를 같이 옮긴다. 중간부터
   바꿨는데 기본값까지 따라가면, 뒤에 마디를 더할 때 앞 박자로 돌아가 버린다. */
function applyTS(num, den, grp, from, to){
  const nts = [Math.max(1, Math.min(TS_NUM_MAX, num|0)),
               TS_DEN_OK.includes(den|0) ? (den|0) : 4];
  const ng = (grp && grp.length) ? grp.slice() : null;
  const whole = (from === undefined || from === null);
  const at = whole ? 0 : Math.max(0, Math.min(measures.length - 1, from|0));
  const end = (to === undefined || to === null)
    ? measures.length : Math.max(at + 1, Math.min(measures.length, to|0));
  let lost = false, conflict = false;
  const next = measures.map((m, mi)=>{
    if(mi < at || mi >= end) return m;          // 범위 밖은 손대지 않는다
    const nm = emptyMeasure(null, nts, ng);
    // Meter changes keep actual onset times, including explicit velocity. Drop only
    // notes that the destination grid cannot represent; never slide them by index.
    CATALOG.forEach(i=>{
      const src=m[i.id]||[],dst=nm[i.id],map=new Map();
      for(let k=0;k<dst.length;k++){
        const l=locOf(nm,i.voice,k),time=beatStartQ(nm,l.b)+cellFrac(l.d,l.k)*beatQ(nm,l.b);
        map.set(Math.round(time*1e8),k);
      }
      for(let k=0;k<src.length;k++){
        if(!src[k]) continue;
        const l=locOf(m,i.voice,k),time=beatStartQ(m,l.b)+cellFrac(l.d,l.k)*beatQ(m,l.b),to=map.get(Math.round(time*1e8));
        if(to===undefined){if(time<measureQ(nm)-1e-8)conflict=true;else lost=true;continue;}
        dst[to]=src[k];
        for(const field of ['orn','ornIns','tie','vel']){
          const value=m[field]?.[i.id]?.[k];if(!value)continue;
          if(!nm[field])nm[field]={};if(!nm[field][i.id])nm[field][i.id]=new Array(dst.length).fill(0);nm[field][i.id][to]=value;
        }
        if(i.voice==='hand'&&m.stick?.[k]){if(!nm.stick)nm.stick=new Array(voiceLen(nm,'hand')).fill(0);nm.stick[to]=m.stick[k];}
      }
    });
    ['sec','text','end','nav','rep','ink','dyn','hp','hpS'].forEach(k=>{if(m[k]!==undefined)nm[k]=m[k];});
    pruneVelocity(nm);
    return nm;
  });
  if(conflict){toast(t('기존 타격 위치를 새 박자표의 입력 칸에 정확히 옮길 수 없습니다. 분할을 맞춘 뒤 다시 시도하세요.'));return false;}
  measures = next;
  if(whole){ SONG_TS = nts.slice(); SONG_GRP = ng; }
  // 커서가 없어진 박을 가리킬 수 있다
  cursorB = Math.min(cursorB, beatCount(measures[selMeasure] || measures[0]) - 1);
  cursorK = 0;
  syncRosterToNotes();
  buildGrid(); renderScore(); refreshStepDots(); refreshTsBtn();
  commit();
  const where = whole ? ''
              : (end === at + 1 ? ` (${at + 1}마디)` : ` (${at + 1}마디부터)`);
  toast(lost ? `박자표를 <b>${nts[0]}/${nts[1]}</b>로 바꿨습니다${where}. 마디에서 넘친 음표는 지워졌습니다.`
             : `박자표를 <b>${nts[0]}/${nts[1]}</b>로 바꿨습니다${where}.`);
}

document.getElementById('tsScopeRow').addEventListener('click', e=>{
  const b = e.target.closest('button'); if(!b) return;
  tsScope = b.dataset.tsscope; syncTsScope();
});
document.getElementById('tsBtn').onclick = openTsPop;
document.getElementById('tsClose').onclick = closeTsPop;
tsPop.addEventListener('click', e=>{ if(e.target === tsPop) closeTsPop(); });
document.getElementById('tsNum').addEventListener('input', ()=>{
  const v = +document.getElementById('tsNum').value;
  if(v >= 1 && v <= TS_NUM_MAX){ tsPick = [v, tsPick[1]]; tsPickGrp = null; renderTsPop(); }
});
document.getElementById('tsDen').addEventListener('change', ()=>{
  tsPick = [tsPick[0], +document.getElementById('tsDen').value];
  tsPickGrp = null; renderTsPop();
});
document.getElementById('tsApply').onclick = ()=>{
  const at = tsScopeAt();
  applyTS(tsPick[0], tsPick[1], tsPickGrp,
          tsScope === 'all' ? undefined : at,
          tsScope === 'only' ? at + 1 : undefined);
  closeTsPop();
};

const divPop = document.getElementById('divPop');
let divBeat = 0;

function renderDivBtns(){
  const m = measures[selMeasure];
  [['divHand','hand'],['divFoot','foot']].forEach(([boxId, voice])=>{
    const box = document.getElementById(boxId);
    box.innerHTML = '';
    const cur = divOf(m, divBeat, voice);
    const names = mergedBeat(m, divBeat) ? DIV_NAME_M : DIV_NAME;
    divsFor(m, divBeat).forEach(d=>{
      /* 섞어 나누기는 줄을 바꿔 따로 모은다 — "한 박을 반으로 갈라 다르게"라는 다른 종류다 */
      if(d === DIV_MIX_UI[0]){
        const sep = document.createElement('span');
        sep.className = 'divsep';
        sep.textContent = t('반박씩 섞기');
        box.appendChild(sep);
      }
      const b = document.createElement('button');
      b.className = (d===cur ? 'sel' : '');
      b.innerHTML = `${divLabel(d)}<span class="sub">${escapeHtml(t(names[d] || ''))}</span>`;
      b.onclick = ()=> applyDiv(divBeat, voice, d, divScopeAll);
      box.appendChild(b);
    });
  });
  /* 2박 묶기 버튼 — 4/4 계열에서만. 지금 박이 묶여 있으면 해제, 옆 박과 묶을 수
     있으면 묶기를 내놓는다. 마지막 박에서 열면 앞 박과 묶는다 */
  const tgt = divMergeTarget();
  const mrow = document.getElementById('divMergeRow');
  mrow.hidden = !tgt;
  if(tgt){
    const mb = document.getElementById('divMerge');
    if(tgt.on){
      const a = beatNoOf(m, tgt.b);
      mb.textContent = t('{a}·{b}박 묶어 2박 3연음').replace('{a}', a).replace('{b}', a+1);
    } else {
      mb.textContent = t('2박 묶기 해제');
    }
  }
  syncDivTitle();
}
/* 어느 박을 묶거나 풀 수 있나. 분모 4에서만 — 6/8의 점4분 박은 이미 겹박이다 */
function divMergeTarget(){
  const m = measures[selMeasure];
  if(tsOf(m)[1] !== 4) return null;
  const g = groupsOf(m);
  if((g[divBeat] || 0) >= 2) return {b: divBeat, on: false};
  if(g[divBeat] === 1 && g[divBeat + 1] === 1) return {b: divBeat, on: true};
  if(divBeat > 0 && g[divBeat - 1] === 1 && g[divBeat] === 1) return {b: divBeat - 1, on: true};
  return null;
}
function applyDiv(b, voice, d, allBeats){
  if(isTuplet(d, measures[selMeasure], b)) track('tuplet');
  const m = measures[selMeasure];
  let lost = false, changed = false;
  const beats = allBeats ? Array.from({length:beatCount(m)}, (_,i)=>i) : [b];
  beats.forEach(bi=>{
    const r = setDiv(m, bi, voice, d);
    if(r){ changed = true; if(r === 'lost') lost = true; }
  });
  if(!changed) return;
  buildGrid(); renderScore(); refreshStepDots(); renderDivBtns();
  commit();
  if(lost) toast('나누기를 바꾸면서 <b>그 박의 음표</b>가 지워졌습니다.', '되돌리기', undo);
}
/* The quick tuplet dialog has a conservative transaction path independent of
   the retained division popup. Inspection and cancelled edits never mutate. */
function tupletContext(){
  const m = measures[selMeasure];
  if(!m) return {measure:selMeasure,beat:0,voices:['hand','foot'],beats:[]};
  return {measure:selMeasure,beat:Math.max(0,Math.min(cursorB,beatCount(m)-1)),voices:['hand','foot'],
    beats:Array.from({length:beatCount(m)},(_,beat)=>({beat,number:beatNoOf(m,beat),quarterLength:beatQ(m,beat),compound:compoundBeat(m,beat),
      divisions:{hand:divOf(m,beat,'hand'),foot:divOf(m,beat,'foot')},
      allowed:divsFor(m,beat).map(division=>({division,label:divLabel(division),name:(mergedBeat(m,beat)?DIV_NAME_M:DIV_NAME)[division] || divLabel(division),isTuplet:isTuplet(division,m,beat)}))}))};
}
function inspectTuplets(options = {}){
  const context = tupletContext(), m = measures[selMeasure];
  const fail = reason=>({ok:false,canApply:false,changed:false,reason,measure:selMeasure,targets:[],safeTargets:[],conflicts:[],targetCount:0});
  if(!m || (options.measure !== undefined && options.measure !== selMeasure)) return fail('stale-context');
  const beat = options.beat === undefined ? context.beat : options.beat;
  const voice = options.voice || 'hand', scope = options.scope || 'beat';
  if(!['hand','foot','both'].includes(voice) || !['beat','measure'].includes(scope) || !Number.isInteger(options.division) || !Number.isInteger(beat) || beat < 0 || beat >= beatCount(m)) return fail('invalid-options');
  const beats = scope === 'measure' ? context.beats.map(b=>b.beat) : [beat];
  const voices = voice === 'both' ? ['hand','foot'] : [voice];
  const targets = beats.flatMap(b=>voices.map(v=>inspectTupletBeat(m,b,v,options.division)));
  const conflicts = targets.filter(t=>t.conflict), safeTargets = targets.filter(t=>!t.conflict && t.changed);
  return {ok:true,canApply:conflicts.length === 0,changed:safeTargets.length > 0,measure:selMeasure,targets,safeTargets,conflicts,targetCount:targets.length};
}
function applyTuplets(options = {}, conflictPolicy = 'cancel'){
  const plan = inspectTuplets(options);
  const result = {...plan,changed:false,applied:false,appliedCount:0,skippedCount:plan.conflicts.length};
  if(!plan.ok) return result;
  if(!['cancel','safe-only'].includes(conflictPolicy)) return {...result,ok:false,reason:'invalid-policy'};
  if(plan.conflicts.length && conflictPolicy === 'cancel') return {...result,changed:false,reason:'conflict'};
  if(!plan.safeTargets.length) return {...result,changed:false};
  const next = JSON.parse(JSON.stringify(measures[selMeasure]));
  // Resolve offsets against the candidate after each edit, so later beats and
  // the other voice retain their exact original time and independent lengths.
  for(const target of plan.safeTargets) preserveTupletBeat(next,target);
  // Playback caches event-array indices. Stop both active and pending playback
  // only once the complete replacement is ready; cancelled/no-op edits keep it.
  stopPlay();
  measures[selMeasure] = next;
  clampCursor();
  buildGrid(); renderScore(); refreshStepDots(); updateEditCursor();
  commit();
  return {...result,applied:true,changed:true,appliedCount:plan.safeTargets.length};
}
window.ddakungTuplets = Object.freeze({context:tupletContext,inspect:inspectTuplets,apply:applyTuplets});
function openDivPop(b){
  divBeat = b;
  renderDivBtns();
  divPop.classList.add('is-open');
}
/* 제목이 범위를 그대로 말해 준다 — "3박 나누기" / "이 마디 나누기" */
function syncDivTitle(){
  const m = measures[selMeasure];
  const n = beatNoOf(m, divBeat);
  document.getElementById('divTitle').textContent =
    divScopeAll ? t('이 마디 나누기')
    : mergedBeat(m, divBeat) ? t('{a}·{b}박 나누기').replace('{a}', n).replace('{b}', n+1)
    : t('{n}박 나누기').replace('{n}', n);
}
document.getElementById('divClose').onclick = ()=> divPop.classList.remove('is-open');
document.getElementById('divMerge').onclick = ()=>{
  const tgt = divMergeTarget(); if(!tgt) return;
  const m = measures[selMeasure];
  const r = setBeatMerge(m, tgt.b, tgt.on);
  if(!r) return;
  if(tgt.on) track('tuplet');
  divBeat = tgt.b;
  buildGrid(); renderScore(); refreshStepDots(); renderDivBtns();
  commit();
  if(r === 'lost') toast('나누기를 바꾸면서 <b>그 박의 음표</b>가 지워졌습니다.', '되돌리기', undo);
};
divPop.addEventListener('click', e=>{ if(e.target === divPop) divPop.classList.remove('is-open'); });

let divScopeAll = false;
document.getElementById('divScope').addEventListener('click', e=>{
  const b = e.target.closest('button'); if(!b) return;
  divScopeAll = (b.dataset.scope === 'all');
  [...e.currentTarget.children].forEach(x=> x.classList.toggle('sel', x === b));
  syncDivTitle();
});
/* 박 머리는 buildGrid가 매번 새로 만드니 그리드에 위임으로 건다 */
gridEl.addEventListener('click', e=>{
  const h = e.target.closest('.beathead');
  if(!h) return;
  activateEditorMeasure(+h.dataset.measure);
  openDivPop(+h.dataset.b);
});

function setCell(insId, step, val, measure = selMeasure){
  if(!measures[measure]?.[insId] || !Number.isInteger(step) || step < 0 || step >= measures[measure][insId].length) return false;
  if((measures[measure][insId][step]|0) === val) return false;
  if(typeof window!=='undefined')window.ddakungAudio?.stopPreview();
  if(val > 0) track('edit');
  const m = measures[measure];
  m[insId][step] = val;
  /* 칸의 마지막 손 음표가 지워지면 R·L 글자도 같이 지운다 —
     글자만 남겨 두면 음을 다시 찍었을 때 유령처럼 되살아난다 */
  if(!val && m.stick && byId[insId].voice === 'hand'
     && !HAND_INS.some(i => (m[i.id]||[])[step])){
    m.stick[step] = 0;
    if(!m.stick.some(v=>v)) delete m.stick;
  }
  /* 앞꾸밈음은 **그 악기 음표**의 것이라 그 음표만 지워져도 같이 지운다 */
  if(!val && m.orn && m.orn[insId]){
    m.orn[insId][step] = 0;
    if(!m.orn[insId].some(v=>v)) delete m.orn[insId];
    if(!Object.keys(m.orn).length) delete m.orn;
  }
  if(!val){ pruneOrnIns(m); pruneVelocity(m); }
  /* 붙임줄도 그 악기 음표의 것이다 — 음이 지워지면 유령이 남지 않게 같이 지운다 */
  if(!val && m.tie && m.tie[insId]){
    m.tie[insId][step] = 0;
    if(!m.tie[insId].some(v=>v)) delete m.tie[insId];
    if(m.tie && !Object.keys(m.tie).length) delete m.tie;
  }
  refreshGrid(); renderScore(); refreshStepDots();
  return true;
}
/* 마디마다 나누기가 다를 수 있으므로 **칸의 개수 자체가 달라진다.**
   마디를 옮길 때마다 buildGrid를 부르도록 호출부를 전부 고치는 건 빠뜨리기 쉬우니
   여기 한 곳에서 구조가 맞는지 보고 안 맞으면 다시 만든다.
   (실제로 selectMeasure가 refreshGrid만 불러서 셋잇단 마디에 4칸짜리 그리드가 남았다) */
function gridSig(){
  const view = editorView();
  return JSON.stringify([view.count, view.start, view.end, measures.slice(view.start, view.end + 1).map(m=>[m.ts,m.grp,m.div,INSTR.map(i=>i.id)])]);
}
function refreshGrid(){
  if(gridEl.dataset.sig !== gridSig()){ buildGrid(); return; }
  gridEl.querySelectorAll('.cell').forEach(c=>{
    const m = measures[+c.dataset.measure];
    const v = m[c.dataset.ins][+c.dataset.step]|0;
    c.classList.toggle('on', v>0);
    c.classList.toggle('art-ghost', isGhost(v));
    c.classList.toggle('art-open', v===ART.OPEN);
    c.classList.toggle('art-xstick', v===ART.XSTICK);
    c.classList.toggle('art-rim', v===ART.RIM);
    c.classList.toggle('art-accent', v===ART.ACCENT);
    // 앞꾸밈음 — 점 하나(플램) / 둘(드래그). 표기와 겹쳐 쓰므로 따로 본다
    const o = ornOf(m, c.dataset.ins, +c.dataset.step);
    c.classList.toggle('orn', o > 0);
    c.classList.toggle('tie', !!tieOf(m, c.dataset.ins, +c.dataset.step));
    c.classList.toggle('orn2', o === 2);
    c.classList.toggle('orn3', o === 3);
  });
  /* 손 순서(R·L) — 박 머리의 세는 말 옆에 글자를 붙인다.
     세는 말이 손 분할을 따르므로(buildGrid) 칸과 글자가 1:1로 맞는다 */
  gridEl.querySelectorAll('.beathead').forEach(h=>{
    const m = measures[+h.dataset.measure];
    const off = beatOffset(m, 'hand', +h.dataset.b);
    [...h.children].forEach((sp, k)=>{
      const v = (m.stick || [])[off + k] | 0;
      let i = sp.querySelector('.stk');
      if(v){
        if(!i){ i = document.createElement('i'); i.className = 'stk'; sp.appendChild(i); }
        i.textContent = v === 1 ? 'R' : 'L';
      } else if(i) i.remove();
    });
  });
  gridEl.querySelectorAll('.measure-editor-card').forEach(card=>{
    const active = +card.dataset.measure === selMeasure;
    card.classList.toggle('is-active', active);
    card.querySelector('.measure-editor-title')?.setAttribute('aria-pressed', String(active));
  });
  notifyEditorView();
}
function refreshChips(){
  const chips = document.getElementById('chips');
  chips.innerHTML='';
  measures.forEach((_,i)=>{
    const d = document.createElement('div');
    d.className='mchip'+(i===selMeasure?' sel':'')+(i>=selA()&&i<=selB()?' inrange':'')
               +(typeof measures[i].bm === 'string' ? ' bm' : '');
    d.textContent = t('{n}마디').replace('{n}', i+1);
    d.onclick = ()=>{ selMeasure=i; selEnd=i; cursorB=0; cursorK=0; refreshChips(); refreshGrid(); refreshStepDots(); renderScore(); updateEditCursor(); scrollScoreTo(i, true); };
    d.ondblclick = ()=> playOneMeasure(i);     // 악보 더블탭과 같은 동작
    d.title = t('{n}마디 — 두 번 누르면 이 마디만 재생 · 길게 눌러 끌면 자리를 옮깁니다')
               .replace('{n}', i+1);
    chips.appendChild(d);
  });
  // 악보에서 마디를 고르면 칩 줄도 따라가야 어디를 고쳤는지 보인다
  const cur = chips.children[selMeasure];
  if(cur && cur.scrollIntoView) cur.scrollIntoView({block:'nearest', inline:'nearest'});
  syncBmBtn();
}

/* ================= 마디 끌어 옮기기 (2026-08-27) ================= */
/* 순서를 바꾸려면 복사 → 붙여넣기 → 삭제, 세 번을 거쳐야 했다.

   **왜 악보가 아니라 칩 줄인가.** 악보 위에는 이미 탭 선택 · 범위 드래그 ·
   더블탭 한 마디 재생 · 펜 메모가 겹쳐 있고, 포인터 캡처로 한 번 데인 자리다
   (project_pencil_grid). 칩 줄은 마디를 고르는 것 말고 하는 일이 없다.

   손가락은 **길게 눌러야** 집힌다 — 칩 줄이 가로로 스크롤되므로 즉시 집으면
   스크롤을 못 한다. 마우스·펜은 바로 집힌다(악보 탭과 같은 규칙, 3491행 부근).

   ⚠ 스크롤을 막는 건 `touch-action`이 아니라 **`touchmove`의 preventDefault**다.
   집히는 시점엔 브라우저가 이미 제스처를 판정한 뒤라 `touch-action`을 그때
   바꿔도 이번 제스처엔 안 먹는다. */

/* from에서 count개를 떼어 to 자리에 꽂는다.
   to는 **떼어 내기 전** 배열 기준의 삽입 위치다(0 ~ measures.length). */
function moveMeasures(from, count, to){
  if(to >= from && to <= from + count) return false;      // 제자리 — 아무것도 안 한다
  const blk = measures.splice(from, count);
  const at = to > from ? to - count : to;                 // 앞을 뺐으면 뒤 자리가 당겨진다
  measures.splice(at, 0, ...blk);
  selMeasure = at; selEnd = at + count - 1;
  cursorB = 0; cursorK = 0;
  refreshAll(); commit();
  return true;
}

(function initChipDrag(){
  const row = document.getElementById('chips');
  if(!row) return;
  const HOLD = 320;          // 손가락이 집는 데 걸리는 시간(ms)
  const SLOP = 8;            // 그 전에 이만큼 움직이면 스크롤로 본다
  const EDGE = 44;           // 줄 끝 이 안쪽이면 저절로 밀린다
  let d = null, raf = 0, moved = false;

  const chipsOf = ()=> [...row.children].filter(e => e.classList.contains('mchip'));

  function targetAt(x){
    const a = chipsOf();
    for(let i=0;i<a.length;i++){
      const r = a[i].getBoundingClientRect();
      if(x < r.left + r.width/2) return i;
    }
    return a.length;
  }
  function putCaret(ti){
    const a = chipsOf();
    if(ti >= a.length) row.appendChild(d.caret);
    else row.insertBefore(d.caret, a[ti]);
    d.ti = ti;
  }
  function autoScroll(x){
    const r = row.getBoundingClientRect();
    const dir = x < r.left + EDGE ? -1 : x > r.right - EDGE ? 1 : 0;
    if(!dir){ if(raf){ cancelAnimationFrame(raf); raf = 0; } return; }
    if(raf) return;
    const step = ()=>{
      row.scrollLeft += dir * 12;
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }
  function stopAuto(){ if(raf){ cancelAnimationFrame(raf); raf = 0; } }

  function pickUp(){
    if(!d || d.held) return;
    if(typeof playing !== 'undefined' && playing && typeof stopPlay === 'function') stopPlay();
    d.held = true;
    /* 고른 범위 **안**을 집었으면 범위가 통째로 따라온다.
       바깥을 집었으면 그 한 마디만 — 고르지도 않은 것을 끌고 가면 안 된다. */
    const inSel = d.from >= selA() && d.from <= selB();
    if(inSel){ d.from = selA(); d.count = selCount(); }
    const a = chipsOf();
    for(let i=d.from; i<d.from+d.count; i++) a[i] && a[i].classList.add('dragging');
    d.el.classList.add('grabbed');
    d.caret = document.createElement('div');
    d.caret.className = 'mcaret';
    row.classList.add('reordering');
    putCaret(d.from);
    try{ d.el.setPointerCapture(d.id); }catch(_){}
  }

  row.addEventListener('pointerdown', e=>{
    const el = e.target.closest && e.target.closest('.mchip');
    if(!el || e.button > 0) return;
    const a = chipsOf(), from = a.indexOf(el);
    if(from < 0) return;
    d = {id:e.pointerId, el, from, count:1, x0:e.clientX, y0:e.clientY,
         held:false, ti:from, timer:0, caret:null, touch:e.pointerType === 'touch'};
    moved = false;
    if(d.touch) d.timer = setTimeout(pickUp, HOLD);
  });

  row.addEventListener('pointermove', e=>{
    if(!d || e.pointerId !== d.id) return;
    if(!d.held){
      if(Math.abs(e.clientX - d.x0) <= SLOP && Math.abs(e.clientY - d.y0) <= SLOP) return;
      /* 손가락이 집히기 **전에** 움직였으면 그건 줄을 스크롤하려는 것이다.
         마우스·펜은 반대다 — 움직여야 집는다. 누르자마자 집으면 그냥 한 번
         누를 때마다 캐럿이 번쩍인다. */
      if(d.touch){ cancel(); return; }
      pickUp();
      return;
    }
    moved = true;
    const ti = targetAt(e.clientX);
    if(ti !== d.ti) putCaret(ti);
    autoScroll(e.clientX);
  });

  /* 이것 하나가 칩 줄 스크롤을 막는다. passive:false가 아니면 안 먹는다 */
  row.addEventListener('touchmove', e=>{ if(d && d.held) e.preventDefault(); }, {passive:false});

  function cleanup(){
    stopAuto();
    if(!d) return;
    clearTimeout(d.timer);
    if(d.caret && d.caret.parentNode) d.caret.remove();
    row.classList.remove('reordering');
    chipsOf().forEach(c => c.classList.remove('dragging','grabbed'));
    try{ d.el.releasePointerCapture(d.id); }catch(_){}
    d = null;
  }
  function cancel(){ cleanup(); }

  row.addEventListener('pointerup', e=>{
    if(!d || e.pointerId !== d.id) return;
    const held = d.held, from = d.from, count = d.count, ti = d.ti;
    cleanup();
    if(!held) return;                       // 그냥 탭이었다 — onclick이 알아서 한다
    if(moved) moveMeasures(from, count, ti);
    else refreshChips();                    // 집기만 하고 놓았다 — 흐림만 걷는다
  });
  row.addEventListener('pointercancel', cancel);
  row.addEventListener('lostpointercapture', ()=>{ if(d && !d.held) cancel(); });

  /* 끌고 나면 뒤따르는 click을 삼킨다 — 안 그러면 놓은 자리가 아니라
     **집었던 칩**이 다시 선택된다. 캡처 단계라 칩의 onclick보다 먼저 온다 */
  row.addEventListener('click', e=>{
    if(moved){ moved = false; e.stopPropagation(); e.preventDefault(); }
  }, true);
})();


// Tool dialogs inherit the bar of the control that opened them.
gridEl.addEventListener('click', e=>{
  const control = e.target.closest?.('.rowbrush, .beathead');
  if(control) activateEditorMeasure(+control.dataset.measure);
}, {capture:true});
