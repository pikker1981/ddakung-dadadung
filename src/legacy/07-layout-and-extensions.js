/* ================= 연습 모드 ================= */

function setPracticeTab(on){
  document.getElementById('practiceMode').style.display = on ? '' : 'none';
  if(on){
    todayRefresh();
    document.getElementById('rngStart').max = measures.length;
    document.getElementById('rngEnd').max = measures.length;
    if(+document.getElementById('rngEnd').value > measures.length)
      document.getElementById('rngEnd').value = measures.length;
  }
}
/* 패드의 '연습' 모드가 부른다. **켜고 끄는 주체는 모드 하나뿐**이다 —
   2026-08-14에 입력 탭 줄(그리드/리얼드럼)을 통째로 없애면서
   같은 곳으로 가는 두 번째 길이 사라졌다. */
function showPracticePanel(on){
  const pm = document.getElementById('practiceMode');
  if(!pm) return;
  if(on){
    document.getElementById('gridMode').style.display = 'none';
    setPracticeTab(true);
  } else {
    if(pm.style.display === 'none') return;      // 안 켜져 있었으면 건드리지 않는다
    setPracticeTab(false);
    document.getElementById('gridMode').style.display = '';
  }
}
/* 메트로놈 탭 패널 (2026-08-28). showPracticePanel과 같은 규약 — 켜고 끄는 주체는
   모드 하나뿐이다. 끌 때 엔진도 같이 멈춘다 — 다른 탭으로 나가서도 클릭이 계속
   울리면 곡 재생(딴 시계)과 겹친다. 엔진은 스크립트 끝의 metroTab IIFE에 있다. */
function showMetroPanel(on){
  const mm = document.getElementById('metroMode');
  if(!mm) return;
  if(on){
    document.getElementById('gridMode').style.display = 'none';
    mm.style.display = '';
    if(window.metroFit) window.metroFit();          // 패널 높이 실측 (2026-10-14)
  } else {
    if(mm.style.display === 'none') return;      // 안 켜져 있었으면 건드리지 않는다
    mm.style.display = 'none';
    if(window.metroStop) window.metroStop();
    document.getElementById('gridMode').style.display = '';
  }
}
const titleEl = document.getElementById('titleInput');
let titleTimer = null;
titleEl.addEventListener('input', ()=>{
  renderScore();
  clearTimeout(titleTimer);
  titleTimer = setTimeout(commit, 700);   // 타이핑 한 덩어리를 한 번의 실행 취소로
});
function safeName(){
  const t = titleEl.value.trim().replace(/[\\/:*?"<>|]/g,'').slice(0,40);
  return t || '따쿵따다둥-악보';
}

document.getElementById('rngAll').onclick = ()=>{
  document.getElementById('rngStart').value = 1;
  document.getElementById('rngEnd').value = measures.length;
};
document.getElementById('pStart').onclick = ()=>{
  if(playing) stopPlay();
  else { looping = true; document.getElementById('loopBtn').classList.add('on'); startPlay({practice:true}); }
};

/* 2026-08-23: **마이크 온셋 검출과 채점이 여기 있었다. 통째로 걷어냈다.**

   왜: 드럼은 마이크로 잡기 가장 나쁜 악기다. 킥의 저역이 마이크를 포화시키고,
   심벌의 잔향이 다음 타격의 문턱을 덮고, 스피커로 나가는 메트로놈이 그대로 다시
   들어온다. RMS 문턱 하나로 나눈 이 방식은 조용한 연습 패드에서만 맞았고
   **실제 드럼 앞에서는 거의 못 맞혔다**(사용자 판단, 8-38장).

   틀린 채점은 없는 채점보다 나쁘다 — 잘 친 것을 Miss라고 하면 연습을 망친다.
   그래서 감도를 손보는 대신 기능을 뺐다.

   딸려 나간 것: `getUserMedia`, `NSMicrophoneUsageDescription`,
   `expected`/`hits`/`gradeCycle`, 점수 상자, 그리고 심사에서 설명할 거리 하나.
   그 자리에는 **오늘 기록**(인증샷에 들어갈 값)이 들어갔다. */

/* 스피드 트레이너는 체크박스라 **켜려는 순간** 잡아야 한다.
   막고 나서 체크를 되돌리지 않으면 켜진 것처럼 보인 채 아무 일도 안 일어난다 */
(function gateSpeed(){
  const el = document.getElementById('spdOn');
  if(!el) return;
  el.addEventListener('change', ()=>{
    if(el.checked && proGate('스피드 트레이너')) el.checked = false;
  });
})();

/* --- 사이클 종료: 스피드 트레이너 --- */
function onCycleEnd(t){
  loopCount++;
  if(PRO && document.getElementById('spdOn').checked){
    const every = Math.max(1, +document.getElementById('spdEvery').value);
    const step  = Math.max(1, +document.getElementById('spdStep').value);
    const goal  = +document.getElementById('spdGoal').value;
    if(loopCount % every === 0 && bpm < goal){
      bpm = Math.min(goal, bpm + step);
      bpmRange.value = bpm; document.getElementById('bpmVal').textContent = bpm;
      document.getElementById('spdInfo').textContent = `${loopCount}회 · ${bpm} BPM`;
      if(bpm >= goal) document.getElementById('spdInfo').textContent = `목표 ${goal} BPM 도달!`;
    } else {
      document.getElementById('spdInfo').textContent = `${loopCount}회 · ${bpm} BPM`;
    }
  }
}

/* ================= 아이패드 2단 레이아웃 =================
   화면 모드(편집/연주/검토), 분할선 드래그, 좌우 반전, 킷 스케일.
   에디션 분기는 applyEdition() 한 곳에서만 한다 — 다른 데 조건문을 흩뿌리지 말 것. */
const SPLIT_MIN = 34, SPLIT_MAX = 82; // 악보 칼럼 폭 하한/상한 (%)

/* 2026-08-13: 편집·연주·검토 → **편집·악보·연습**으로 재배치했다. 이름만이 아니다.
     편집  그대로 (왼쪽 악보 / 오른쪽 입력)
     악보  옛 '검토' — 인쇄와 같은 배치로 크게. 구간·도돌이·가사를 붙이는 자리
     연습  옛 '연주'의 큰 컨트롤·오토스크롤을 물려받고,
           **입력 패널 세 번째 탭에 숨어 있던 연습 도구**를 여기로 올렸다.
           연습이 "입력 방식" 중 하나였던 게 원래 이상했다
   `is-play`→`is-practice`, `is-review`→`is-score`로 클래스도 같이 갈았다 —
   클래스 이름이 padView와 어긋나면 다음 사람이 반드시 헷갈린다. */
let padView   = 'edit';               // 'edit' | 'score' | 'practice'
let mirrored  = false;                // 악보를 오른쪽에 둘 것인가
let splitPct  = 62;                   // 악보 칼럼 폭 (%)
let splitBeforeSolo = 62;             // 접기 전 폭 기억

function isIpad(){ return document.body.classList.contains('edition-ipad'); }

/* 독의 DOM 위치를 옮긴다.
   폰: body 직속 + position:fixed (화면 아래 떠 있는 바)
   아이패드: main 안 + grid-area:dock (입력 패널 아래)
   CSS만으로는 안 된다 — 그리드 아이템이 되려면 main의 자식이어야 하고,
   독이 화면 바닥을 차지하지 않아야 악보 칼럼이 바닥까지 내려온다. */
function placeDock(){
  const dock = document.querySelector('.dock');
  const mn = document.querySelector('main');
  if(!dock || !mn) return;
  if(isIpad()){
    if(dock.parentNode !== mn) mn.appendChild(dock);
  } else if(dock.parentNode !== document.body){
    document.body.insertBefore(dock, document.getElementById('printArea'));
  }
}


function applySplit(){
  document.body.style.setProperty('--splitW', splitPct.toFixed(2) + '%');
}

/* 카피 탭 보류 (2026-10-19 사용자 결정 — 2.1에서 뺀다). 코드는 그대로 두고 문만 닫는다.
   실기기 확인(앱 안 iframe · limitsNavigationsToAppBoundDomains) 뒤 다시 연다 — 그때 이 줄을 true로,
   mCopy 단추의 display:none을 걷고, 새 소식·WHATS-NEW에 카피 탭 문단을 되살린다.
   `?copytab`은 검사(verify-copy)용 열쇠. var인 이유 — applyPadView가 이 줄보다 먼저 불려도 TDZ가 안 나고,
   그때 값은 undefined라 닫힌 쪽으로 떨어진다. */
var COPY_TAB = /[?&]copytab\b/.test(location.search);
function applyPadView(){
  if(padView === 'copy' && !COPY_TAB) padView = 'edit';
  { const mc = document.getElementById('mCopy'); if(mc) mc.style.display = COPY_TAB ? '' : 'none'; }
  const b = document.body;
  const ip = isIpad();
  /* 2026-08-13: 모드가 **2단 전용이 아니다.** 세로에도 모드바를 냈다
     ("세로로 하면 상단의 편집·악보·연습이 사라져"). `ip`는 2단 배치에만 쓴다. */
  const pad      = b.classList.contains('edition-pad');
  const score    = pad && padView === 'score';
  const practice = pad && padView === 'practice';
  const metro    = pad && padView === 'metro';
  const copy     = pad && padView === 'copy';     // 편집 + 유튜브 (2026-10-16)
  /* **`is-solo`는 이제 악보 모드만이다.** 옛 연주 모드는 입력 패널을 통째로 숨겼지만,
     연습 모드는 오른쪽에 연습 도구를 띄워야 하므로 2단을 유지한다. */
  // 폰·세로로 좁아지면 모드 클래스를 전부 내린다.
  // padView 값은 그대로 두어 가로로 되돌렸을 때 쓰던 모드가 복원되게 한다.
  b.classList.toggle('is-practice', practice);
  b.classList.toggle('is-score',    score);
  b.classList.toggle('is-metro',    metro);
  b.classList.toggle('is-copy',     copy);
  b.classList.toggle('is-solo',     score);
  if(typeof placeRails === 'function') requestAnimationFrame(placeRails);
  // 악보 모드를 떠나면 열려 있던 표시 팝업도 같이 닫는다 (연습 화면 위에 남으면 안 된다)
  if(pad && !score && typeof closeMarkPop === 'function') closeMarkPop();
  ['mEdit','mScore','mPractice','mMetro','mCopy'].forEach((id,i)=>{
    const on = i === ['edit','score','practice','metro','copy'].indexOf(padView);
    const el2 = document.getElementById(id);
    if(el2){ el2.classList.toggle('sel', on); el2.setAttribute('aria-pressed', on ? 'true' : 'false'); }
  });
  /* 줄당 마디 수.
     - 검토 모드(2단): 출력과 같은 고정 배치
     - **한 단 패드(세로): 4마디 고정** — "가로로 4마디가 다 붙은 악보"(2026-08-13 요청).
       `auto`는 폭에서 계산하는데 768 세로(704px)에서는 2마디밖에 안 나온다.
       고정 배치를 쓰면 SVG가 자연 폭(1064px)으로 그려진 뒤 카드 폭에 맞춰 줄어든다.
       **그게 맞다** — 마디폭/오선높이 비(≈7)가 유지돼서 종이 악보와 같은 비율로 읽힌다.
       칸만 좁히면 오선 높이는 그대로라 음표가 서로 붙어 버린다.
     - 그 밖(폰·2단 편집): 폭에서 계산 */
  const sel = document.getElementById('perLineSel');
  const onePane = b.classList.contains('edition-pad') && !ip;
  screenPerLine = score ? Math.max(1, +(sel ? sel.value : 4) || 4)
                : onePane ? 4
                : 'auto';
  // 세로 악보 모드는 사용자가 끌어 정한 높이를 잠깐 무시한다(CSS에서 푼다)
  /* 입력 패널의 내용을 모드에 맞춘다.
     - 악보: 패널 자체가 숨는다
     - 연습: 연습 도구를 띄운다
     - 편집: 그리드로 돌아간다 */
  if(score){
    showPracticePanel(false);
    showMetroPanel(false);
  } else if(practice){
    showMetroPanel(false);
    showPracticePanel(true);
  } else if(metro){
    showPracticePanel(false);
    showMetroPanel(true);
  } else {
    showPracticePanel(false);
    showMetroPanel(false);
  }
  /* 카피는 편집 화면에 플레이어만 얹는다. 다른 모드로 나가면 영상도 멈춘다 —
     안 보이는 플레이어가 소리를 내면 유튜브 약관 위반이다 */
  if(window.copyShow) window.copyShow(copy);
  if(typeof scoreRailsSync === 'function') scoreRailsSync();   // 레일·알약 (아래에서 정의)
  relayout();
}

/* 폭이 바뀌면 악보 줄바꿈과 그리드 칸 폭이 둘 다 달라진다.
   드래그 중에 매 이벤트마다 다시 그리면 버벅이므로 rAF로 한 번만 묶고,
   그리드는 칸 폭이 실제로 달라졌을 때만 다시 만든다(DOM 재생성이 비싸다). */
let _relayoutRaf = 0, _cellWNow = null;
function relayout(){
  if(_relayoutRaf) return;
  _relayoutRaf = requestAnimationFrame(()=>{
    _relayoutRaf = 0;
    renderScore();
    const cw = cellW();
    if(cw !== _cellWNow){ _cellWNow = cw; buildGrid(); refreshGrid(); }
    scrollScoreTo(selMeasure, true);
  });
}

function setPadView(v){ if(v === 'copy' && !COPY_TAB) v = 'edit'; track('view-' + v); padView = v; applyPadView(); }
function toggleMirror(){
  mirrored = !mirrored;
  document.body.classList.toggle('is-mirrored', mirrored);
  const f = document.getElementById('mFlip');
  if(f) f.setAttribute('aria-pressed', mirrored ? 'true' : 'false');
  relayout();
}
/* 접기: 편집 ↔ 악보 전체. 분할선 더블탭에 물려 있다 */
function toggleCollapse(){
  if(padView === 'edit'){ splitBeforeSolo = splitPct; setPadView('score'); }
  else { splitPct = splitBeforeSolo; applySplit(); setPadView('edit'); }
}

document.getElementById('mEdit').onclick     = ()=>setPadView('edit');
document.getElementById('mScore').onclick    = ()=>setPadView('score');
document.getElementById('mPractice').onclick = ()=>setPadView('practice');
document.getElementById('mMetro').onclick    = ()=>setPadView('metro');
document.getElementById('mCopy').onclick     = ()=>setPadView('copy');
document.getElementById('mFlip').onclick   = toggleMirror;

/* ── 분할선 드래그 ─────────────────────────
   포인터를 캡처해서 손가락이 패널 밖으로 나가도 끊기지 않게 한다.
   드래그 중 매 프레임 renderScore()를 부르면 마디가 많을 때 버벅이므로
   relayout()이 rAF로 한 번만 묶는다. */
(function(){
  const sp = document.getElementById('splitter');
  if(!sp) return;
  let dragging = false;
  const pctAt = (clientX)=>{
    const r = document.querySelector('main').getBoundingClientRect();
    const raw = mirrored ? (r.right - clientX) : (clientX - r.left);
    return Math.max(SPLIT_MIN, Math.min(SPLIT_MAX, raw / r.width * 100));
  };
  sp.addEventListener('pointerdown', e=>{
    if(!isIpad()) return;
    dragging = true;
    sp.setPointerCapture(e.pointerId);
    document.body.classList.add('is-splitting');
    e.preventDefault();
  });
  sp.addEventListener('pointermove', e=>{
    if(!dragging) return;
    splitPct = pctAt(e.clientX);
    applySplit();
    relayout();
  });
  const end = e=>{
    if(!dragging) return;
    dragging = false;
    try{ sp.releasePointerCapture(e.pointerId); }catch(_){}
    document.body.classList.remove('is-splitting');
    relayout();
  };
  sp.addEventListener('pointerup', end);
  sp.addEventListener('pointercancel', end);
  sp.addEventListener('dblclick', toggleCollapse);
})();

/* ── 악보 표시 팝업 (2026-08-13) ────────────
   3단계. 지금까지는 콘솔로만 넣을 수 있던 것들을 손으로 붙인다.

   **여는 길은 하나뿐이다** — 악보에서 이미 골라 둔 마디를 한 번 더 누르기.
   버튼을 새로 안 만든 이유는 도구 줄이 폰에서 이미 세 줄이기 때문이고,
   길게 누르기를 안 쓴 이유는 보이지 않아서 아무도 못 찾기 때문이다.
   이 규칙 하나로 **폰·세로·2단이 전부 같은 방식**이 된다.

   고칠 때마다 바로 그리고 `commit()`한다 — 되돌리기 한 단계씩 끊긴다.
   글자만 제목 입력칸과 같은 700ms 묶음이다(한 글자마다 되돌리기가 생기면 못 쓴다). */
const markPop = document.getElementById('markPop');
let markMi = 0, _mkTextTimer = null;

const END_OPTS = [[0,'없음'],[1,'1번'],[2,'2번']];
/* 마디선 종류. 빈 값이 기본(얇은 줄 하나)이고, 기본이면 열쇠를 아예 안 만든다 */
const BAR_OPTS = [['','보통'],['double','겹세로줄'],['final','마침줄']];
const NAV_OPTS = [['','없음'],['segno','세뇨'],['coda','코다'],['tocoda','to Coda'],
                  ['ds','D.S.'],['dc','D.C.'],['fine','Fine']];

function markM(){ return measures[markMi]; }
function markApply(){ renderScore(); syncMarkPop(); commit(); }

/* 칩 글자도 길목에서 옮긴다 — 구간 이름·펜 색·영상 크기가 전부 여기를 지난다 */
function mkChip(label, on, fn){
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'mkbtn' + (on ? ' sel' : '');
  b.textContent = t(label);
  b.onclick = fn;
  return b;
}

function syncMarkPop(){
  const m = markM(); if(!m) return;
  document.getElementById('markWhich').textContent = t('{n}마디').replace('{n}', markMi + 1);

  const sc = document.getElementById('secChips');
  sc.innerHTML = '';
  sc.appendChild(mkChip('없음', !m.sec, ()=>{ delete markM().sec; markApply(); }));
  SECTIONS.forEach(name=>{
    sc.appendChild(mkChip(name, m.sec === name, ()=>{ markM().sec = name; markApply(); }));
  });
  const free = document.getElementById('secFree');
  if(document.activeElement !== free) free.value = (m.sec && !SECTIONS.includes(m.sec)) ? m.sec : '';

  const rep = m.rep || {};
  document.getElementById('repA').classList.toggle('sel', !!rep.a);
  document.getElementById('repB').classList.toggle('sel', !!rep.b);
  const rn = document.getElementById('repN');
  rn.value = rep.times || 2;
  rn.disabled = !rep.b;

  /* 한 마디 반복(%) — 켤 때 마디가 비어 있으면 앞 마디 음표를 복사한다(재생이 맞아야 한다) */
  const rr = document.getElementById('rptRow');
  if(rr){
    rr.innerHTML = '';
    // 칩 하나로 켜고 끈다 — 레일 패널에서는 h5가 숨어 이름이 칩에 있어야 한다
    rr.appendChild(mkChip('% 한 마디 반복', !!m.rpt, ()=>{
      const mm = markM(), pm = measures[markMi - 1];
      if(mm.rpt){ delete mm.rpt; markApply(); return; }
      if(!pm){ toast(t('첫 마디에는 반복 기호를 쓸 수 없습니다 — 앞 마디가 없습니다.')); return; }
      if(!measureHasNotes(mm) && JSON.stringify(pm.div) === JSON.stringify(mm.div) && JSON.stringify(pm.ts) === JSON.stringify(mm.ts)){
        CATALOG.forEach(i => mm[i.id] = pm[i.id].slice());
        if(pm.orn) mm.orn = JSON.parse(JSON.stringify(pm.orn));
        if(pm.vel) mm.vel = JSON.parse(JSON.stringify(pm.vel)); else delete mm.vel;
      }
      mm.rpt = 1; markApply();
    }));
  }
  const er = document.getElementById('endRow');
  er.innerHTML = '';
  END_OPTS.forEach(([v,label])=>{
    er.appendChild(mkChip(label, (m.end || 0) === v, ()=>{
      const mm = markM();
      if(v) mm.end = v; else delete mm.end;
      markApply();
    }));
  });

  /* 마디선 — 이 마디의 **오른쪽 끝** 줄을 고른다. 재생에는 영향이 없다(표기만) */
  const br = document.getElementById('barRow');
  if(br){
    br.innerHTML = '';
    BAR_OPTS.forEach(([v,label])=>{
      br.appendChild(mkChip(label, (m.bar || '') === v, ()=>{
        const mm = markM();
        if(v) mm.bar = v; else delete mm.bar;
        markApply();
      }));
    });
  }

  const nr = document.getElementById('navRow');
  nr.innerHTML = '';
  NAV_OPTS.forEach(([v,label])=>{
    nr.appendChild(mkChip(label, (m.nav || '') === v, ()=>{
      const mm = markM();
      if(v) mm.nav = v; else delete mm.nav;
      markApply();
    }));
  });

  syncDynRows(m);

  const tx = document.getElementById('mkText');
  if(document.activeElement !== tx) tx.value = m.text || '';
}
/* 셈여림·헤어핀 칩 (1.8). 헤어핀은 **골라 둔 범위 전체**에 건다 — 여러 마디에 걸치는 게
   기본인 표시라 마디마다 눌러야 하면 못 쓴다. 범위 밖 마디를 열었으면 그 마디 하나 */
function dynTargets(){
  return (markMi >= selA() && markMi <= selB()) ? Array.from({length: selB() - selA() + 1}, (_, i) => selA() + i)
                                                 : [markMi];
}
function beatChips(row, cur, set, key){
  const m = markM(); row.innerHTML = '';
  const nb = beatCount(m);
  if(nb < 2) return;
  for(let b = 0; b < nb; b++){
    row.appendChild(mkChip(t(key || '{n}박').replace('{n}', beatNoOf(m, b)), (cur|0) === b, ()=> set(b)));
  }
}
function syncDynRows(m){
  const dr = document.getElementById('dynRow'); if(!dr) return;
  dr.innerHTML = '';
  dr.appendChild(mkChip('없음', !m.dyn, ()=>{ const mm = markM(); delete mm.dyn; delete mm.dynB; markApply(); }));
  DYN_OK.forEach(v=>{
    const b = mkChip(v, m.dyn === v, ()=>{ markM().dyn = v; markApply(); });
    b.classList.add('dynchip');
    dr.appendChild(b);
  });
  const dbr = document.getElementById('dynBRow');
  if(m.dyn) beatChips(dbr, m.dynB, b=>{ const mm = markM(); if(b) mm.dynB = b; else delete mm.dynB; markApply(); });
  else dbr.innerHTML = '';
  const hr = document.getElementById('hpRow');
  hr.innerHTML = '';
  [['', '헤어핀 없음'], ['<', '크레센도 <'], ['>', '디크레센도 >']].forEach(([v, label])=>{
    hr.appendChild(mkChip(label, (m.hp || '') === v, ()=>{
      const tg = dynTargets();
      tg.forEach((i, n)=>{
        const mm = measures[i]; if(!mm) return;
        if(!v){ delete mm.hp; delete mm.hpB; delete mm.hpS; return; }
        mm.hp = v;
        /* 1.9 — **여러 마디를 골라 건 헤어핀은 한 덩어리다.** 앞 마디에 같은 기호가 이미 있으면
           첫 마디에 hpS(여기서 새로)를 달아 따로 선다. 범위 안쪽은 잇는다.
           한 마디만 걸 때는 예전처럼 앞에 잇는다 — 한 마디씩 늘려 가는 쓰임이 있다 */
        if(n > 0) delete mm.hpS;
        else if(tg.length > 1 && measures[i - 1] && measures[i - 1].hp === v) mm.hpS = 1;
      });
      markApply();
    }));
  });
  const hbr = document.getElementById('hpBRow');
  hbr.innerHTML = '';
  /* 앞 마디가 같은 기호면 "이어서 / 여기서 새로"를 고른다 (1.9 — 붙어 있는 두 헤어핀).
     시작 박은 **헤어핀 첫 마디**에서만 뜻이 있다 — 이어지는 중이면 안 보인다 */
  const pm = measures[markMi - 1];
  const touching = !!(m.hp && pm && pm.hp === m.hp);
  if(touching){
    hbr.appendChild(mkChip('앞과 이어서', !m.hpS, ()=>{ const mm = markM(); delete mm.hpS; delete mm.hpB; markApply(); }));
    hbr.appendChild(mkChip('여기서 새로', !!m.hpS, ()=>{ markM().hpS = 1; markApply(); }));
  }
  if(m.hp && (!touching || m.hpS)){
    const keep = [...hbr.childNodes];
    beatChips(hbr, m.hpB, b=>{ const mm = markM(); if(b) mm.hpB = b; else delete mm.hpB; markApply(); }, '{n}박부터');
    hbr.prepend(...keep);
  }
}

/* 연 시각을 적어 둔다. **여는 손가락의 `click`이 곧바로 배경을 때린다** —
   팝업은 `pointerup`에서 열리는데, 그 뒤에 오는 `click`의 대상은 이미 화면을 덮은
   팝업 배경이라 "배경을 눌러 닫기"가 즉시 발동했다(실측: 열리자마자 닫혔다).
   여는 순간 잠깐 배경 클릭을 무시하는 게 제일 단순하고 확실하다. */
let _mkOpenedAt = 0;
/* 악보 표시를 열 수 있는 자리인가.
   **패드에서는 「악보」 모드에서만** 연다 (2026-08-14, 사용자 지적) —
   편집·연습에서 마디를 두 번 누르는 건 구간을 다시 고르려는 동작이지
   가사·도돌이를 고치려는 게 아니다. 연습 중에 팝업이 뜨면 특히 방해가 된다.
   폰(LITE)에는 모드 자체가 없으므로 그대로 둔다 — 막으면 기능이 통째로 사라진다. */
function markPopOK(){
  /* **팝업은 폰 전용이다** (2026-08-20). 패드는 가로·세로 모두 레일이 그 자리를 대신한다.
     예전에는 세로 패드에서 팝업이 살아 있었는데, 같은 화면에 도구가 두 벌 있으면
     어느 쪽으로 배웠느냐에 따라 다른 앱이 된다 */
  return !document.body.classList.contains('edition-pad');
}
function openMarkPop(mi){
  if(!markPopOK()) return;
  track('mark');
  if(mi == null || !measures[mi]) return;
  markMi = mi;
  syncMarkPop();
  _mkOpenedAt = Date.now();
  markPop.classList.add('is-open');
}
function closeMarkPop(){
  clearTimeout(_mkTextTimer);
  markPop.classList.remove('is-open');
  commit();                      // 글자 묶음이 아직 안 끝났을 수 있다
}

document.getElementById('repA').onclick = ()=>{
  const m = markM(); const r = m.rep || {};
  if(r.a) delete r.a; else r.a = true;
  if(r.a || r.b) m.rep = r; else delete m.rep;
  markApply();
};
document.getElementById('repB').onclick = ()=>{
  const m = markM(); const r = m.rep || {};
  if(r.b){ delete r.b; delete r.times; } else { r.b = true; }
  if(r.a || r.b) m.rep = r; else delete m.rep;
  markApply();
};
document.getElementById('repN').onchange = e=>{
  const m = markM(); if(!m.rep || !m.rep.b) return;
  const v = Math.max(2, Math.min(8, +e.target.value || 2));
  // 2회는 기본값이라 안 적는다 — 저장 크기와 "×2"가 안 그려지는 관례를 같이 지킨다
  if(v > 2) m.rep.times = v; else delete m.rep.times;
  markApply();
};
document.getElementById('secFree').oninput = e=>{
  const v = e.target.value.trim();
  const m = markM();
  if(v) m.sec = v.slice(0,20); else delete m.sec;
  renderScore();
  clearTimeout(_mkTextTimer); _mkTextTimer = setTimeout(commit, 700);
};
document.getElementById('mkText').oninput = e=>{
  const v = e.target.value.trim();
  const m = markM();
  if(v) m.text = v.slice(0,120); else delete m.text;
  renderScore();
  clearTimeout(_mkTextTimer); _mkTextTimer = setTimeout(commit, 700);
};
document.getElementById('mkClear').onclick = ()=>{
  const m = markM();
  ['sec','rep','end','nav','text','ink','dyn','dynB','hp','hpB','hpS'].forEach(k=> delete m[k]);
  markApply();
};
document.getElementById('mkClose').onclick = closeMarkPop;
markPop.addEventListener('click', e=>{
  if(e.target === markPop && Date.now() - _mkOpenedAt > 350) closeMarkPop();
});
document.addEventListener('keydown', e=>{
  if(e.key === 'Escape' && markPop.classList.contains('is-open')) closeMarkPop();
});

/* ================= 악보 탭 도구 레일 (2026-08-17) =================
   markPop의 그룹(.mkgrp)을 **DOM째로 옮겨 담는다.** 칩을 다시 만들면 팝업과 레일이
   같은 마디를 서로 다르게 보여 주는 순간이 반드시 온다 — 노드가 하나면 그럴 수 없다.
   placeDock()이 독을 폰·패드 사이에서 옮기는 것과 같은 수법이다.
   상태 갱신은 기존 syncMarkPop() 그대로다. 어디에 살든 id가 같으니 그냥 돈다. */
/* 영상 크기 — 레일 초기화(buildVidSizes)가 읽으므로 **레일보다 먼저** 선언해야 한다 */
const VID_SIZES = {
  fhd:    {w:1920, h:1080, name:'가로 Full HD'},
  shorts: {w:1080, h:1920, name:'세로 쇼츠 9:16'},
};
const RAIL_TITLES = {sec:'구간', rep:'도돌이', end:'1·2번 괄호', nav:'기호', dyn:'셈여림', text:'가사 · 메모', pen:'펜 메모'};
/* 제목은 쓸 때 옮긴다 — 표 자체는 한국어로 둔다(열쇠가 곧 한국어라서) */
let railTool = null, railRTool = null;
var perlineSync = function(){};        // 줄마디 패널이 선택 마디를 따라오게 (initScoreRails가 채운다)
/* 펜 상태 — 도구 패널과 그리기 핸들러(initPenDraw)가 같이 본다 */
let penColor = 'red', penWidth = 1, penErase = false;
function penActive(){ return railModeActive() && railTool === 'pen'; }

/* ── 레일 세로 위치 (2026-08-20) ────────────────────
   가로(2단)에서는 악보가 화면 높이를 꽉 채워서 `top:50%`가 정확히 악보 옆이다.
   **세로는 다르다** — 카드가 위쪽에만 있고 아래가 통째로 비어서, 화면 한가운데에
   두면 레일이 악보에서 한참 떨어져 혼자 떠 있다(실제로 그렇게 나왔다).
   그래서 세로에서는 **카드 윗머리에 맞춘다.** 가로는 CSS 그대로 둔다. */
function placeRails(){
  const two  = document.body.classList.contains('edition-ipad');
  const wrap = document.getElementById('scoreWrap');
  const top  = (!two && wrap) ? Math.max(12, wrap.getBoundingClientRect().top + 6) : null;
  document.querySelectorAll('.mkrail, .railpanel').forEach(r=>{
    if(top == null){ r.style.removeProperty('top'); r.style.removeProperty('transform'); }
    else { r.style.top = top + 'px'; r.style.transform = 'none'; }
  });
}
function railModeActive(){
  /* `is-score`는 `applyPadView`에서 **edition-pad일 때만** 켜진다 —
     즉 폰은 여기 안 들어온다. 방향은 더 이상 보지 않는다 (2026-08-20) */
  return document.body.classList.contains('is-score');
}
/* 선택이 바뀌면 열려 있는 도구 패널이 그 마디를 따라온다 */
function railFollow(mi){
  if(!railModeActive()) return;
  markMi = mi;
  syncMarkPop();
  const w = document.getElementById('railWhich');
  if(w) w.textContent = t('{n}마디에 적용').replace('{n}', mi + 1);
  perlineSync();
}

/* `var`이어야 한다 — applyEdition이 부팅 중 이 줄보다 먼저 applyPadView를 부른다.
   const면 TDZ라 typeof 검사조차 던진다. var는 그때 undefined라 가드가 조용히 넘어간다. */
var scoreRailsSync = (function initScoreRails(){
  const railL = document.getElementById('railL');
  if(!railL) return function(){};
  const railR  = document.getElementById('railR');
  const panelL = document.getElementById('railPanel');
  const slotL  = document.getElementById('railSlot');
  const panelR = document.getElementById('railPanelR');

  // 그룹의 원래 자리(팝업 안 순서)를 적어 둔다 — 레일을 떠날 때 그대로 되돌린다
  const home = new Map();
  document.querySelectorAll('#markPop .mkgrp[data-tool]').forEach(g=>{
    home.set(g.dataset.tool, {node:g, parent:g.parentNode, next:g.nextSibling});
  });
  // 펜은 팝업에 없다 — 숨긴 집(#penHome)에서 산다. 옮기고 되돌리는 방식은 같다
  const penGrp = document.getElementById('penGrp');
  if(penGrp) home.set('pen', {node:penGrp, parent:penGrp.parentNode, next:null});
  function restoreGroups(){
    home.forEach(h=>{ if(h.node.parentNode !== h.parent) h.parent.insertBefore(h.node, h.next); });
  }
  function syncBtns(){
    railL.querySelectorAll('.railbtn').forEach(b=> b.classList.toggle('on', b.dataset.tool === railTool));
    railR.querySelectorAll('.railbtn').forEach(b=> b.classList.toggle('on', b.dataset.rtool === railRTool));
  }
  function closeL(){
    railTool = null; penErase = false;
    document.body.classList.remove('is-penmode');
    panelL.classList.remove('is-open'); restoreGroups(); syncBtns();
  }
  /* ── 접기 — 패널만 치우고 도구는 켜 둔다 (2026-08-21) ──────────
     펜에서만 쓴다. 색을 고르는 것은 **그리기 직전의 마지막 동작**이라,
     고르자마자 패널이 비켜나야 바로 그을 수 있다. 그런데 `closeL`로 닫으면
     `railTool`이 null이 되어 **펜까지 꺼진다** — 패널이 곧 모드였기 때문이다.
     그래서 둘을 갈랐다. 레일 버튼은 계속 켜진 채로 남아 "펜이 켜져 있다"를 말한다. */
  function foldL(){ panelL.classList.remove('is-open'); }
  function closeR(){ railRTool = null; panelR.classList.remove('is-open'); syncBtns(); }

  function openTool(tool){
    if(tool === 'info'){
      // 패널이 아니라 곡 정보 창을 연다 — 입력칸·스타일·머리말 글자가 다 있는 집
      closeL(); syncMetaUI();
      document.getElementById('songPop').classList.add('is-open');
      track('rail-info');
      return;
    }
    if(tool === 'clear'){
      // 지우기는 패널이 아니라 즉시 동작 — 되돌리기는 실행 취소가 맡는다
      markMi = selMeasure;
      ['sec','rep','end','nav','text','ink','bar','ln','rpt','dyn','dynB','hp','hpB','hpS'].forEach(k=> delete measures[markMi][k]);
      markApply();
      toast(t('{n}마디 표시를 지웠습니다.').replace('{n}', markMi + 1));
      return;
    }
    /* 같은 도구를 또 누르면 — **접혀 있으면 펼치고, 펼쳐져 있으면 끈다.**
       펜에서 색을 고르면 패널이 접히므로, 그때 다시 펼칠 길이 여기 있어야 한다 */
    if(railTool === tool){
      if(!panelL.classList.contains('is-open')){ panelL.classList.add('is-open'); syncBtns(); }
      else closeL();
      return;
    }
    railTool = tool;
    markMi = selMeasure;
    syncMarkPop();
    const h = home.get(tool);
    /* 이전 도구의 그룹을 먼저 집으로 돌려보낸다. innerHTML=''로 그냥 떼어 놓으면
       문서에서 빠져 있는 동안 syncMarkPop의 getElementById가 null을 잡는다 —
       도구를 갈아탈 때만 터져서 한 도구만 쓰는 검증으로는 안 잡혔던 구멍이다 */
    restoreGroups();
    slotL.innerHTML = '';
    slotL.appendChild(h.node);
    document.getElementById('railTitle').textContent = t(RAIL_TITLES[tool]);
    /* 펜 모드 — 그리기 핸들러(initPenDraw)와 touch-action:none이 이 클래스를 본다 */
    document.body.classList.toggle('is-penmode', tool === 'pen');
    if(tool !== 'pen') penErase = false;
    if(tool === 'pen') penSync();
    railFollow(markMi);
    panelL.classList.add('is-open');
    syncBtns();
    track('rail-' + tool);
  }

  /* ── 펜 패널 — 색·굵기·지우개 ── */
  function penSync(){
    const cr = document.getElementById('penColorRow');
    cr.innerHTML = '';
    /* 색·굵기를 고르면 **패널이 접힌다.** 고르고 나면 할 일은 긋는 것뿐인데
       패널이 악보를 가린 채 남아 있으면 그을 자리가 없다 (2026-08-21 제보).
       펜은 켜진 채다 — 다시 펼치려면 레일의 펜을 한 번 누른다 */
    [['red','빨강'],['blue','파랑'],['ink','먹색']].forEach(([c, name])=>{
      cr.appendChild(mkChip(name, penColor === c && !penErase,
        ()=>{ penColor = c; penErase = false; penSync(); foldL(); }));
    });
    const wr = document.getElementById('penWRow');
    wr.innerHTML = '';
    [[1,'가는 획'],[2,'굵은 획']].forEach(([v, name])=>{
      wr.appendChild(mkChip(name, penWidth === v, ()=>{ penWidth = v; penSync(); foldL(); }));
    });
    document.getElementById('penEraser').classList.toggle('sel', penErase);
  }
  document.getElementById('penEraser').onclick = ()=>{ penErase = !penErase; penSync(); };
  document.getElementById('penClearM').onclick = ()=>{
    const m = measures[selMeasure];
    if(!m.ink){ toast(t('{n}마디에는 펜 메모가 없습니다.').replace('{n}', selMeasure + 1)); return; }
    delete m.ink;
    renderScore(); commit();
    toast(t('{n}마디의 펜 메모를 지웠습니다.').replace('{n}', selMeasure + 1));
  };

  railL.addEventListener('click', e=>{
    const b = e.target.closest('.railbtn'); if(b) openTool(b.dataset.tool);
  });
  // ×는 도구를 통째로 끈다(접기가 아니다). 펜에서 누르면 펜 모드도 같이 풀린다
  const railX = document.getElementById('railClose');
  if(railX) railX.onclick = closeL;

  /* ── 오른쪽 레일: 지면·출력 ── */
  const R_TITLES = {gap:'단 간격', perline:'줄당 마디 수', paper:'악보 배경', mp4:'영상 악보 (MP4)'};   // 쓸 때 t()로 옮긴다
  function openR(rt){
    if(rt === 'pdf'){ closeR(); document.getElementById('pdfBtn').click(); return; }
    if(rt === 'png'){ closeR(); document.getElementById('pngBtn').click(); return; }
    if(railRTool === rt){ closeR(); return; }
    railRTool = rt;
    document.getElementById('railTitleR').textContent = t(R_TITLES[rt]);
    panelR.querySelectorAll('.rsec').forEach(x=> x.classList.toggle('on', x.dataset.rsec === rt));
    if(rt === 'gap') buildGap();
    if(rt === 'perline') buildPerline();
    if(rt === 'paper') buildPaper();
    panelR.classList.add('is-open');
    syncBtns();
    track('rail-' + rt);
  }
  railR.addEventListener('click', e=>{
    const b = e.target.closest('.railbtn'); if(b) openR(b.dataset.rtool);
  });

  function buildPerline(){
    const row = document.getElementById('rlPerline');
    const sel = document.getElementById('perLineSel');
    row.innerHTML = '';
    [...sel.options].forEach(o=>{
      row.appendChild(mkChip(o.textContent.trim(), sel.value === o.value, ()=>{
        sel.value = o.value;
        sel.dispatchEvent(new Event('change'));     // 기존 change 핸들러가 applyPadView를 돈다
        buildPerline();
      }));
    });
    const row2 = document.getElementById('rlSecbreak');
    row2.innerHTML = '';
    document.querySelectorAll('#secScope button').forEach(b=>{
      row2.appendChild(mkChip(b.textContent.trim(), b.classList.contains('sel'), ()=>{
        b.click();                                   // 설정(저장 팝업)의 로직·저장을 그대로 탄다
        buildPerline();
      }));
    });
    const row2b = document.getElementById('rlMrest');
    if(row2b){
      row2b.innerHTML = '';
      document.querySelectorAll('#multirestScope button').forEach(b=>{
        row2b.appendChild(mkChip(b.textContent.trim(), b.classList.contains('sel'), ()=>{
          b.click(); buildPerline();
        }));
      });
    }
    /* 마디별 새 줄 — 선택한 마디(selMeasure)에 m.ln을 붙인다. 곡 데이터라 commit()이 필요하다 */
    const m = measures[selMeasure];
    document.getElementById('rlLnWhich').textContent = t('{n}마디부터 새 줄 · 한 줄에').replace('{n}', selMeasure + 1);
    const row3 = document.getElementById('rlLinebreak');
    row3.innerHTML = '';
    row3.appendChild(mkChip('없음', !(m && m.ln), ()=>{
      const mm = measures[selMeasure]; if(mm && mm.ln){ delete mm.ln; renderScore(); commit(); }
      buildPerline();
    }));
    for(let n=1; n<=8; n++){
      row3.appendChild(mkChip(String(n), !!(m && m.ln === n), ()=>{
        const mm = measures[selMeasure]; if(!mm) return;
        mm.ln = n; renderScore(); commit(); buildPerline();
      }));
    }
  }
  perlineSync = ()=>{ if(railRTool === 'perline') buildPerline(); };
  function buildGap(){
    const row = document.getElementById('rlGap');
    row.innerHTML = '';
    document.querySelectorAll('#gapScope button').forEach(b=>{
      row.appendChild(mkChip(b.textContent.trim(), b.classList.contains('sel'), ()=>{
        b.click();                                   // 설정 팝업의 로직·저장을 그대로 탄다
        buildGap();
      }));
    });
  }
  function buildPaper(){
    const row = document.getElementById('rlPaper');
    row.innerHTML = '';
    document.querySelectorAll('#paperScope button').forEach(b=>{
      row.appendChild(mkChip(b.textContent.trim(), b.classList.contains('sel'), ()=>{
        b.click();                                   // 설정 팝업의 로직·저장을 그대로 탄다
        buildPaper();
      }));
    });
  }

  /* ── 재생 알약 ── */
  const pill = document.getElementById('pillPlay');
  pill.innerHTML = ICON_PLAY;
  pill.onclick = ()=>{ if(!playing) track('play'); playing ? stopPlay() : startPlay(); };

  /* ── 영상 크기 고르기 ── */
  let vidSize = 'fhd';
  function buildVidSizes(){
    const row = document.getElementById('vidSizeRow');
    row.innerHTML = '';
    Object.entries(VID_SIZES).forEach(([k, v])=>{
      row.appendChild(mkChip(v.name, vidSize === k, ()=>{ vidSize = k; buildVidSizes(); }));
    });
  }
  buildVidSizes();
  document.getElementById('vidGo').onclick = async ()=>{
    const btn = document.getElementById('vidGo');
    if(btn.disabled) return;
    if(playing) stopPlay();
    btn.disabled = true;
    const bar = document.getElementById('vidBar');
    bar.style.display = 'block';
    const fill = bar.firstElementChild;
    try{
      track('mp4');
      let label = '만드는 중 {n}%';
      const r = await exportVideo({size: vidSize,
        onMode: ()=>{ label = '녹화 중 {n}%'; toast(t('이 기기에서는 곡 길이만큼 실시간으로 녹화합니다')); },
        onProgress: f=>{
          fill.style.width = Math.round(f * 100) + '%';
          btn.textContent = t(label).replace('{n}', Math.round(f * 100));
        }});
      if(r && r.native){
        if(r.saved) toast(t('영상이 만들어졌습니다 — {f} ({m}MB)').replace('{f}', r.name).replace('{m}', (r.bytes/1048576).toFixed(1)));
      } else if(r){
        const name = ((document.getElementById('titleInput')?.value || '').trim() || '악보') + '.' + r.ext;
        /* 2026-08-23: **여기서 앵커로 직접 내려받고 있었다.** 앱(WKWebView)에서는
           `blob:capacitor://localhost/…`를 열 수 없어 iOS가 거부한다 —
           실기기 콘솔에 `Failed to open URL blob:capacitor://… Code=115`.
           그런데 코드는 그 실패를 못 보고 **"영상이 만들어졌습니다"를 띄웠다.**
           아무것도 안 받은 사용자에게 성공했다고 말하는 게 제일 나쁜 실패다.

           `saveFile()`이 iOS에서 공유 시트를 먼저 쓴다 — PDF·PNG·곡 파일이
           이미 그 길로 간다. **파일을 넘기는 길은 하나여야 한다.**
           여기가 유일하게 그 함수를 안 거치고 있었다. */
        await saveFile(r.blob, name);
        toast(t('영상이 만들어졌습니다 — {f} ({m}MB)').replace('{f}', name).replace('{m}', (r.bytes/1048576).toFixed(1)));
      }
    }catch(err){
      toast(t('영상을 만들지 못했습니다: {e}').replace('{e}', String(err && err.message || err)));
    }
    btn.disabled = false; btn.textContent = t('영상 만들기');
    bar.style.display = 'none'; fill.style.width = '0';
  };

  /* applyPadView가 부른다 — 모드를 떠나면 패널을 닫고 그룹을 팝업으로 되돌린다 */
  return function scoreRailsSync(){
    if(!railModeActive()){ closeL(); closeR(); }
    const bp = document.getElementById('pillBpm');
    if(bp) bp.innerHTML = bpm + '<small>BPM</small>';
  };
})();

/* ================= 영상 악보 (2026-08-17) =================
   악보를 한 줄짜리 긴 띠로 구워 오른쪽에서 왼쪽으로 흘리고, 재생선은 서 있는다.
   PoC(poc-video2.js)에서 배운 것을 그대로 가져왔다 —
   60fps(30이면 오선이 계단으로 튄다) · 2배 슈퍼샘플링(줄여 그려야 또렷하다) ·
   위치는 playheadX()(박 사이 BEAT_GAP·M_PAD 순간이동이 "뚝뚝"의 정체였다).

   **인코더는 H.264+MP4를 먼저 시도하고, 안 되면 VP9+WebM으로 떨어진다.**
   아이패드가 주 대상인데 WebM은 iOS가 못 연다 — 그래서 MP4가 1순위다.
   프리뷰·테스트용 크로뮴은 H.264 인코더가 빠져 있어 WebM 경로를 탄다.
   덕분에 같은 파이프라인이 자동으로 두 경로 다 검증된다.

   소리는 안 넣는다 — 신스가 실시간 AudioContext에 묶여 있어 오프라인 렌더에
   못 태운다. 도돌이·기호도 안 펼친다 — 띠가 뒤로 순간이동하면 더 어색하다. */

async function exportVideo(opt){
  opt = opt || {};
  const size = VID_SIZES[opt.size] || VID_SIZES.fhd;
  const W = opt.w || size.w, H = opt.h || size.h;
  const FPS = opt.fps || 60;
  let SS = opt.ss || 2;
  /* 2026-10-12 (맥 제보): 아이패드 앱을 맥에서 돌리면 WebCodecs(VideoEncoder)가 없다.
     그때는 **캔버스를 실시간으로 녹화**한다(MediaRecorder + captureStream) — 곡 길이만큼 걸리지만
     결과는 같은 그림이다. 둘 다 없을 때만 포기한다 */
  const REC = typeof VideoEncoder === 'undefined';
  /* 맥에서 도는 아이패드 앱은 MediaRecorder도 없다(2026-10-12 실측) — 그때는 **네이티브가 영상을 만든다**
     (MaiPdf.makeVideo, AVAssetWriter). 띠 그림·재생선 위치·글자 층은 여기서 만들어 넘긴다 */
  const NATIVE_VID = REC && IS_NATIVE && !!(window.Capacitor && window.Capacitor.Plugins
    && window.Capacitor.Plugins.MaiPdf && window.Capacitor.Plugins.MaiPdf.makeVideo);
  const CAN_REC = typeof MediaRecorder !== 'undefined' && !!HTMLCanvasElement.prototype.captureStream;
  if(REC && !NATIVE_VID && !CAN_REC)
    throw new Error(t('이 브라우저는 영상 만들기를 지원하지 않습니다'));
  if(playing) stopPlay();

  /* 1) 악보를 한 줄 띠로 굽는다. paint가 GEO를 만지므로 **끝나면 renderScore()로 되돌린다** */
  const BAND = Math.min(300, Math.round(H * 0.3));       // 띠의 화면 높이
  const n = measures.length;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  document.body.appendChild(svg);
  /* ★ oneRow — 구간 새 줄·마디별 새 줄·멀티레스트가 띠를 여러 줄로 쪼갠 사고(2026-09-14).
     띠는 무조건 한 줄이고, 마디 x는 균일 폭 가정 대신 **paint가 채운 캐시**를 쓴다 */
  const vc = [];
  paint(svg, {availW: 1e6, perLine: n, from: 0, to: n, oneRow: true, cache: vc});
  if(vc.length !== n || vc.some(L => !L)) throw new Error(t('악보 굽기 실패'));
  if(vc.some(L => L.top !== vc[0].top)) throw new Error(t('악보 굽기 실패'));   // 한 줄이어야 한다
  const rawW = +svg.getAttribute('width'), rawH = +svg.getAttribute('height');
  const img = new Image();
  const url = URL.createObjectURL(new Blob(
    [new XMLSerializer().serializeToString(svg)], {type:'image/svg+xml'}));
  await new Promise((res, rej)=>{ img.onload = res; img.onerror = ()=>rej(new Error(t('악보 굽기 실패'))); img.src = url; });
  const raw = document.createElement('canvas');
  raw.width = Math.ceil(rawW); raw.height = Math.ceil(rawH);
  const rx = raw.getContext('2d', {willReadFrequently:true});
  rx.fillStyle = '#fbfaff'; rx.fillRect(0, 0, raw.width, raw.height);
  rx.drawImage(img, 0, 0);
  URL.revokeObjectURL(url); svg.remove();
  // 먹이 있는 세로 구간만 남긴다
  let px = rx.getImageData(0, 0, raw.width, raw.height).data;
  let top = raw.height, bot = 0;
  for(let y = 0; y < raw.height; y++)
    for(let x = 0; x < raw.width; x += 3){
      const i = (y * raw.width + x) * 4;
      if(px[i] < 220 || px[i+1] < 215){ if(y < top) top = y; if(y > bot) bot = y; break; }
    }
  if(bot <= top){ top = 0; bot = raw.height - 1; }
  px = null;
  const inkH = bot - top + 1;
  let S = (BAND - 16) / inkH * SS;
  // 캔버스 한계(Safari 폭 ~32767px). 곡이 아주 길면 슈퍼샘플부터 줄인다
  while(rawW * S > 30000 && SS > 1){ SS -= 1; S = (BAND - 16) / inkH * SS; }
  if(rawW * S > 30000) S = 30000 / rawW;
  const strip = document.createElement('canvas');
  strip.width = Math.ceil(rawW * S); strip.height = Math.ceil(inkH * S);
  const sx = strip.getContext('2d');
  sx.imageSmoothingQuality = 'high';
  sx.fillStyle = '#fbfaff'; sx.fillRect(0, 0, strip.width, strip.height);
  sx.drawImage(raw, 0, top, raw.width, inkH, 0, 0, strip.width, strip.height);

  /* 2) 재생선 x를 **지금, 동기로** 전부 계산해 둔다.
     playheadX는 전역 GEO를 읽는다 — 인코딩 루프는 이벤트 루프에 양보하므로
     그 사이 renderScore()가 돌면 GEO가 화면값으로 바뀌어 위치가 전부 어긋난다.
     미리 뽑아 두면 그 함정이 원천적으로 없다. */
  /* 카운트인 = **첫 마디 박자표만큼** (2026-10-12 사용자 요청). 한 칸 = BPM 한 박(기준 음표는 tempoUnitQ) —
     4/4는 4 · 3/4는 3 · 6/8은 점4분 2 · 12/8은 4 · 5/8·7/8은 8분 5·7 */
  const secPerBeat = 60 / bpm, TAIL = 0.6;
  const COUNT_N = Math.max(1, Math.min(12, Math.round(measureQ(measures[0]) / tempoUnitQ(measures[0]))));
  const LEAD = COUNT_N * secPerBeat;
  /* 마디 길이는 재생과 같은 잣대(measureQ × qDurOf) — 4/4에서는 4·secPerBeat 그대로 */
  const mDur = measures.map(m => measureQ(m) * qDurOf(m));
  const mT0 = []; { let acc = 0; for(let i = 0; i < n; i++){ mT0[i] = acc; acc += mDur[i]; } }
  const total = LEAD + mT0[n-1] + mDur[n-1] + TAIL;
  const frames = Math.round(total * FPS);
  const xs = new Float64Array(frames);
  const prevMul = ROW_MUL;
  for(let f = 0, mi = 0; f < frames; f++){
    const tt = Math.max(0, f / FPS - LEAD);
    while(mi < n - 1 && tt >= mT0[mi + 1]) mi++;
    const m = measures[mi], L = vc[mi], nx = (mi + 1 < n) ? vc[mi + 1] : null;
    const nb = beatCount(m);
    const beat = Math.min(nb, beatAtQ(m, (tt - mT0[mi]) / qDurOf(m)));
    ROW_MUL = L.mul || 1;
    xs[f] = playheadX(L.x0, beat, nb, nx ? nx.x0 : null, m, nx ? measures[mi + 1] : null) * S;
  }
  ROW_MUL = prevMul;
  renderScore();                                   // GEO·화면 원상 복구

  /* 3) 인코더 — H.264+MP4 우선, 안 되면 VP9+WebM. WebCodecs가 없으면(REC) 아래 녹화 경로 */
  const bitrate = Math.min(16e6, Math.round(W * H * FPS * 0.10));
  let enc, muxer, kind, ext;
  if(!REC){
  const avc = {codec:'avc1.640033', width:W, height:H, bitrate, framerate:FPS, avc:{format:'avc'}};
  const vp9 = {codec:'vp09.00.50.08', width:W, height:H, bitrate, framerate:FPS};
  const avcOK = await VideoEncoder.isConfigSupported(avc).then(r=>r.supported).catch(()=>false);
  if(avcOK && typeof Mp4Muxer !== 'undefined'){
    kind = 'mp4'; ext = 'mp4';
    muxer = new Mp4Muxer.Muxer({target: new Mp4Muxer.ArrayBufferTarget(),
      video:{codec:'avc', width:W, height:H}, fastStart:'in-memory'});
    enc = new VideoEncoder({output:(c,m)=>muxer.addVideoChunk(c,m), error:e=>{ exportVideo._err = e.message; }});
    enc.configure(avc);
  } else {
    const vpOK = await VideoEncoder.isConfigSupported(vp9).then(r=>r.supported).catch(()=>false);
    if(!vpOK) throw new Error(t('이 브라우저에 쓸 수 있는 영상 인코더가 없습니다'));
    kind = 'webm'; ext = 'webm';
    muxer = new WebMMuxer.Muxer({target: new WebMMuxer.ArrayBufferTarget(),
      video:{codec:'V_VP9', width:W, height:H, frameRate:FPS}});
    enc = new VideoEncoder({output:(c,m)=>muxer.addVideoChunk(c,m), error:e=>{ exportVideo._err = e.message; }});
    enc.configure(vp9);
  }
  }   // !REC

  /* 4) 프레임 */
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d', {alpha:false});
  g.imageSmoothingQuality = 'high';
  const HEADX = Math.round(W * 0.30);
  const bandTop = Math.round((H - strip.height / SS) / 2);
  const title = (document.getElementById('titleInput')?.value || '').trim();

  /* 프레임 하나 그리기 — 인코더 경로와 녹화 경로가 같이 쓴다 */
  /* 프레임 층 — 인코더·녹화·네이티브 세 경로가 같이 쓴다.
     띠 위에 얹는 것(가라앉힘·재생선·제목·BPM)은 프레임마다 같고, 카운트인 숫자만 바뀐다 */
  const stripH = strip.height / SS;
  const drawOverlay = gg => {
    // 지나간 부분은 살짝 가라앉힌다
    gg.fillStyle = 'rgba(251,250,255,.62)';
    gg.fillRect(0, bandTop - 10, HEADX - 2, stripH + 20);
    // 재생선
    gg.fillStyle = '#7B4BE0';
    gg.fillRect(HEADX - 1.5, bandTop - 14, 3, stripH + 28);
    gg.beginPath(); gg.moveTo(HEADX - 8, bandTop - 14); gg.lineTo(HEADX + 8, bandTop - 14);
    gg.lineTo(HEADX, bandTop - 2); gg.closePath(); gg.fill();
    // 제목·BPM
    gg.fillStyle = '#14121A'; gg.textAlign = 'left'; gg.textBaseline = 'alphabetic';
    if(title){ gg.font = '700 ' + Math.round(H * 0.033) + 'px system-ui,sans-serif';
               gg.fillText(title, Math.round(W * 0.05), Math.round(bandTop * 0.5)); }
    gg.fillStyle = '#8E88A0'; gg.font = '600 ' + Math.round(H * 0.02) + 'px system-ui,sans-serif';
    gg.fillText('♩ = ' + bpm, Math.round(W * 0.05), Math.round(bandTop * 0.5) + Math.round(H * 0.035));
  };
  const drawCount = (gg, nn) => {
    gg.fillStyle = 'rgba(20,18,26,.88)';
    gg.font = '700 ' + Math.round(H * 0.14) + 'px system-ui,sans-serif';
    gg.textAlign = 'center'; gg.textBaseline = 'middle';
    gg.fillText(String(nn), W / 2, bandTop + stripH / 2);
  };
  const countOf = f => {                       // 카운트인 숫자(COUNT_N~1), 없으면 0
    const tt = f / FPS - LEAD;
    // 4 → 3 → 2 → 1 거꾸로 센다 (2026-10-12 사용자 요청 — 시작까지 남은 박 수)
    return tt < 0 ? Math.max(1, Math.min(COUNT_N, 1 + Math.floor((-tt) / secPerBeat))) : 0;
  };
  const drawFrame = f => {
    g.fillStyle = '#fbfaff'; g.fillRect(0, 0, W, H);
    g.drawImage(strip, 0, 0, strip.width, strip.height,
                HEADX - xs[f] / SS, bandTop, strip.width / SS, stripH);
    drawOverlay(g);
    const nn = countOf(f);
    if(nn) drawCount(g, nn);
  };

  /* 네이티브 경로 (맥). 띠 그림 한 장 + 프레임마다 x + 투명 층(겉·카운트 1~4)을 넘기면
     네이티브가 AVAssetWriter로 H.264 mp4를 만들고 **저장 창까지 띄운다** — 파일이 JS로 돌아오지 않는다 */
  async function nativeVideo(){
    const P = window.Capacitor.Plugins.MaiPdf;
    const layer = draw => {
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      draw(c.getContext('2d')); return c.toDataURL('image/png').split(',')[1];
    };
    const counts = Array.from({length: COUNT_N}, (_, i) => layer(gg => drawCount(gg, i + 1)));
    const cnt = Array.from({length: frames}, (_, f) => countOf(f));
    const xsOut = Array.from(xs, v => +(HEADX - v / SS).toFixed(2));    // 프레임마다 띠의 왼쪽 x
    let sub = null;
    if(opt.onProgress && P.addListener)
      sub = await P.addListener('videoProgress', e => opt.onProgress(Math.min(0.99, +e.p || 0)));
    try{
      const name = ((document.getElementById('titleInput')?.value || '').trim() || '악보') + '.mp4';
      const r = await P.makeVideo({
        strip: strip.toDataURL('image/png').split(',')[1],
        overlay: layer(drawOverlay), counts, cnt, xs: xsOut,
        width: W, height: H, fps: FPS, bitrate,
        bandTop, stripW: strip.width / SS, stripH, filename: name});
      if(opt.onProgress) opt.onProgress(1);
      return {native: true, saved: !!(r && r.saved), name, bytes: (r && r.bytes) || 0,
              kind: 'mp4', ext: 'mp4', frames, seconds: total};
    }finally{
      if(sub && sub.remove) sub.remove();
    }
  }

  /* 녹화 경로 (WebCodecs 없음). 프레임 번호를 **흐른 시간에서** 뽑는다 — 그리기가 밀려도
     영상 속 시간이 늦어지지 않고 프레임만 건너뛴다. 창이 가려지면 타이머가 느려지므로 곡 길이를 지켜 본다 */
  async function recordVideo(){
    const mime = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm']
      .find(m => !MediaRecorder.isTypeSupported || MediaRecorder.isTypeSupported(m));
    if(!mime) throw new Error(t('이 브라우저에 쓸 수 있는 영상 인코더가 없습니다'));
    if(opt.onMode) opt.onMode('rec');
    drawFrame(0);
    const stream = cv.captureStream(FPS);
    const rec = new MediaRecorder(stream, {mimeType: mime, videoBitsPerSecond: bitrate});
    const chunks = [];
    rec.ondataavailable = e => { if(e.data && e.data.size) chunks.push(e.data); };
    const stopped = new Promise(res => { rec.onstop = res; });
    rec.start(1000);
    const t0 = performance.now();
    for(;;){
      const f = Math.floor((performance.now() - t0) / 1000 * FPS);
      if(f >= frames) break;
      drawFrame(f);
      if(opt.onProgress) opt.onProgress(f / frames);
      await new Promise(r => setTimeout(r, 1000 / FPS / 2));
    }
    drawFrame(frames - 1);
    await new Promise(r => setTimeout(r, 120));
    rec.stop(); await stopped;
    stream.getTracks().forEach(tr => tr.stop());
    if(opt.onProgress) opt.onProgress(1);
    const type = mime.split(';')[0];
    const blob = new Blob(chunks, {type});
    if(!blob.size) throw new Error(t('녹화된 영상이 비었습니다'));
    const k = /mp4/.test(type) ? 'mp4' : 'webm';
    return {blob, bytes: blob.size, kind: k, ext: k, frames, seconds: total, realtime: true};
  }

  if(REC) return NATIVE_VID ? nativeVideo() : recordVideo();   // 그리기 함수가 선언된 **뒤**여야 한다(const TDZ)

  for(let f = 0; f < frames; f++){
    drawFrame(f);
    const vf = new VideoFrame(cv, {timestamp: Math.round(f * 1e6 / FPS),
                                   duration: Math.round(1e6 / FPS)});
    enc.encode(vf, {keyFrame: f % (FPS * 2) === 0});
    vf.close();
    if(exportVideo._err) throw new Error(exportVideo._err);
    /* 인코더가 밀리면 기다린다 (2026-08-24) — 그리기가 인코딩보다 훨씬 빨라
       안 기다리면 1080p 프레임(장당 ~8MB)이 인코더 큐에 수백 장 쌓인다.
       WKWebView는 메모리 한도가 낮아 실기기에서 13마디 32%쯤에 앱이 통째로 죽었다. */
    while(enc.encodeQueueSize > 4)
      await new Promise(r=> setTimeout(r, 4));
    if(f % 8 === 0){
      if(opt.onProgress) opt.onProgress(f / frames);
      await new Promise(r=> setTimeout(r, 0));      // UI·인코더에 숨 쉴 틈
    }
  }
  await enc.flush();
  muxer.finalize();
  if(opt.onProgress) opt.onProgress(1);
  const buf = muxer.target.buffer;
  return {blob: new Blob([buf], {type: 'video/' + kind}), bytes: buf.byteLength, kind, ext,
          frames, seconds: total};
}

/* ── 악보 높이 끌기 (한 단 패드 세로) ──────
   2단의 세로 분할선과 짝이다. 값은 px로 잡고 저장한다 — %로 잡으면 아이패드를
   돌릴 때마다 뜻이 달라진다(세로 1366 화면의 40%와 가로 1024의 40%는 다른 물건).
   **화면 밖으로 나가지 않게 매번 다시 조인다** — 저장해 둔 큰 값을 작은 기기에서
   그대로 쓰면 입력 패널이 통째로 화면 밖으로 밀린다. */
const SCOREH_KEY = 'maidrum.scoreH';
let scoreH = 0;                       // 0 = 사용자가 안 정했다 (기본 동작)

function scoreHBounds(){
  const wrap = document.getElementById('scoreWrap');
  const top = wrap ? wrap.getBoundingClientRect().top + window.scrollY : 120;
  // 아래로 입력 패널 최소 한 덩어리와 독은 남긴다
  return {min:150, max:Math.max(180, Math.round(window.innerHeight - 110 - 200)), top};
}
function applyScoreH(){
  const b = document.body;
  if(scoreH > 0){
    const {min, max} = scoreHBounds();
    b.style.setProperty('--scoreH', Math.max(min, Math.min(max, scoreH)) + 'px');
  } else {
    b.style.removeProperty('--scoreH');
  }
}
function saveScoreH(){
  if(!STORAGE_OK) return;
  if(scoreH > 0) lsSet(SCOREH_KEY, String(Math.round(scoreH)));
  else lsDel(SCOREH_KEY);
}
(function initScoreH(){
  const v = +(lsGet(SCOREH_KEY) || 0);
  if(v > 0) scoreH = v;
  applyScoreH();
  const sp = document.getElementById('vsplit');
  if(!sp) return;
  let dragging = false;
  sp.addEventListener('pointerdown', e=>{
    dragging = true;
    sp.setPointerCapture(e.pointerId);
    document.body.classList.add('is-vsplitting');
    e.preventDefault();
  });
  sp.addEventListener('pointermove', e=>{
    if(!dragging) return;
    const {min, max, top} = scoreHBounds();
    scoreH = Math.max(min, Math.min(max, Math.round(e.clientY + window.scrollY - top)));
    applyScoreH();
  });
  const end = e=>{
    if(!dragging) return;
    dragging = false;
    try{ sp.releasePointerCapture(e.pointerId); }catch(_){}
    document.body.classList.remove('is-vsplitting');
    saveScoreH();
    relayout();
  };
  sp.addEventListener('pointerup', end);
  sp.addEventListener('pointercancel', end);
  // 더블탭하면 기본으로. 끌어 놓고 되돌릴 길이 없으면 못 만진다
  sp.addEventListener('dblclick', ()=>{
    scoreH = 0; applyScoreH(); saveScoreH(); relayout();
    toast('악보 높이를 기본으로 되돌렸습니다.');
  });
  addEventListener('resize', applyScoreH);
})();

/* 출력 줄 수를 바꾸면 검토 모드 화면도 같이 바뀌어야 한다 */
(function(){
  const sel = document.getElementById('perLineSel');
  if(sel) sel.addEventListener('change', ()=>{ if(padView === 'score') applyPadView(); });
})();

/* 초기화 */
/* ── Studio 공개 스위치 (2026-08-12) ──────
   베타는 **폰 LITE만** 연다. maidrum.com은 폰과 Studio가 같은 파일이라,
   잠그지 않으면 아이패드로 연 사람에게 아직 실기기 점검이 안 끝난 리얼드럼·연습이
   그대로 열린다. 피드백도 두 제품 것이 섞여 들어와 읽기 어려워진다.

   전체 공개할 때는 **이 한 줄만 true로** 바꾼다. 아래 열쇠 코드는 그대로 둬도 무해하다.

   열쇠는 `?studio` — 나와 테스터는 계속 Studio를 쓴다.
   한 번 열면 기억하므로 주소에서 파라미터가 사라져도 유지된다(`?studio=off`로 잠금).
   manifest-studio.json의 start_url이 이미 `/?studio`라 홈 화면에 추가해도 그대로 열린다. */
const PUBLIC_STUDIO = false;
const STUDIO_KEY = 'maidrum.studio';

/* ── 열쇠가 듣는 곳 (2026-08-17) ───────────────────────
   `?studio`는 편했지만 **공개 도메인에서는 그게 곧 유료판 무료 배포**였다.
   maidrum.com은 보호가 없고, 파일 하나에 Studio 코드가 통째로 들어 있어
   주소에 파라미터 하나만 붙이면 열렸다.

   그래서 **공개 도메인에서만 열쇠를 죽인다.** 파일을 가르지 않고 호스트로 가른다 —
   배포 산출물은 계속 하나다.
   - maidrum.com → 열쇠도, 기억해 둔 값도 안 듣는다. 항상 LITE
   - 그 밖(*.vercel.app · localhost · file:) → 지금까지처럼 `?studio`가 연다.
     아이패드 Studio 배포는 Vercel SSO 뒤에 있고, `file:`은 verify-*.js가 도는 길이다

   **문을 잠근 것이지 방을 없앤 것이 아니다.** 저장한 파일을 고치면 여전히 열 수 있다.
   코드까지 빼려면 배포 때 잘라내야 하는데 그건 파일 하나 원칙과 맞바꾸는 일이다.

   테스터 주의: maidrum.com/?studio로 홈 화면에 추가해 둔 설치는 이제 LITE로 뜬다.
   Studio 배포 주소로 다시 추가해야 한다. */
const STUDIO_HOST_OK = (function(){
  let h = '';
  try{ h = (location.hostname || '').toLowerCase(); }catch(e){}
  if(!h) return true;                                  // file: — 검사 스크립트가 이 길로 돈다
  if(h === 'localhost' || h === '127.0.0.1') return true;
  return !/(^|\.)maidrum\.com$/.test(h);
})();

/* ── 공개 도메인의 테스터 코드 ─────────────────────────
   맨 문을 잠그면 테스터(드러머 2인)가 들어올 길이 없어진다. Studio 배포는 Vercel SSO
   뒤에 있어 계정이 필요하고, 그건 테스터에게 요구할 수 없는 일이다.
   그래서 공개 도메인에는 **코드가 붙은 문**을 하나 남긴다.

       maidrum.com/?studio0808

   **바꾸려면 아래 한 줄만** 고치면 된다. 자릿수도 자유다 — 길게 쓸수록 문턱이 높다.
   코드를 바꾸면 저장해 둔 통행증(`STUDIO_PASS_KEY`)이 전부 무효가 된다.
   값이 아니라 **파라미터 이름**에 코드가 붙는 모양이라(`?studio0808`), 주소만 보고
   "여기에 숫자를 넣으면 되겠구나"가 덜 읽힌다.

   **정직하게: 4자리는 만 가지다.** 마음먹고 훑으면 뚫린다. 이건 유료화 방어가 아니라
   테스터 편의용이고, 진짜 방어는 앱에서만 되는 것들이다(네이티브 PDF·파일 앱·저장 미러).

   통행증은 옛 열쇠(`maidrum.studio`)와 **다른 칸에 담는다.** 예전에 `?studio`로 한 번
   열어 둔 사람이 그대로 통과하면 잠근 의미가 없다. */
const STUDIO_CODE = '0808';
const STUDIO_PASS_KEY = 'maidrum.studiopass';

const STUDIO_OK = (function(){
  /* 앱은 아이패드 Studio 단독으로 낸다. 호스트가 무엇이든 잠기면 안 된다 —
     Capacitor는 `capacitor://localhost`로 뜨는데 열쇠가 없어 LITE로 떨어진다. */
  if(IS_NATIVE) return true;
  if(PUBLIC_STUDIO) return true;

  if(!STUDIO_HOST_OK){
    let q = '';
    try{ q = location.search || ''; }catch(e){}
    // `?studio0808`, `?studio0808=`, `?a=1&studio0808` 다 잡는다
    if(new RegExp('(^|[?&])studio' + STUDIO_CODE + '(=|&|$)').test(q)){
      try{ localStorage.setItem(STUDIO_PASS_KEY, STUDIO_CODE); }catch(e){}
      return true;
    }
    let off = null;
    try{ off = new URLSearchParams(q).get('studio'); }catch(e){}
    if(off === 'off' || off === '0'){                  // `?studio=off`로 되잠금
      try{ localStorage.removeItem(STUDIO_PASS_KEY); }catch(e){}
      return false;
    }
    /* 맨 `?studio`는 **아무 일도 하지 않는다** — 열지도, 지우지도 않는다.
       manifest-studio.json의 start_url이 `/?studio`라서, 지우게 만들면 홈 화면에
       추가해 둔 테스터가 열 때마다 통행증을 잃는다. (매니페스트에 코드를 넣는 건
       더 나쁘다 — 파일 하나만 열어 보면 코드가 그대로 보인다) */
    try{ return localStorage.getItem(STUDIO_PASS_KEY) === STUDIO_CODE; }catch(e){}
    return false;
  }

  let v = null;
  try{ v = new URLSearchParams(location.search).get('studio'); }catch(e){}
  if(v !== null){                       // `?studio`는 빈 문자열로 온다 — null과 구분할 것
    const on = (v !== 'off' && v !== '0');
    try{ localStorage.setItem(STUDIO_KEY, on ? '1' : '0'); }catch(e){}
    return on;
  }
  // 사파리 사생활 보호에서는 던진다. 못 읽으면 잠긴 쪽이 기본 — 실수로 열리지 않게
  try{ return localStorage.getItem(STUDIO_KEY) === '1'; }catch(e){}
  return false;
})();

/* ── PC 스튜디오 (maidrum.com/pro, 2026-10-20 사용자 요청) ─────────────────
   "스튜디오에서 쓸 PC 버전 · 저장한 악보를 한눈에 보는 라이브러리 · maidrum.com/pro".
   **파일은 그대로 하나다**([[ipad-fork]] 교훈). 주소로 가른다 — vercel.json이 /pro를 index.html로 돌린다.
   - `PC_EDITION` — 주소가 /pro다. 앱(IS_NATIVE)은 해당 없음
   - `SHELF_ON`  — 거기에 Studio가 열렸다(통행증). 라이브러리·책갈피·PRO 배지·단축키는 이것만 본다
   - Studio가 안 열렸으면 **문**(#pcGate)이 뜬다. 열쇠는 `STUDIO_CODE` 그대로 — 문이 둘이어도 열쇠는 하나

   ★ `var`인 이유: renderScore가 부팅 중(이 줄보다 위)에서 이미 돈다. const면 TDZ로 백지가 된다
   ([[tdz]] — 세 번 겪었다). var는 그 사이 undefined(=거짓)라 안전하다. COPY_TAB과 같은 수.
   공개 도메인 밖(file:·localhost·*.vercel.app)에서는 `?pc`로도 연다 — 검사·프리뷰용 */
var PC_EDITION = (function(){
  if(IS_NATIVE) return false;
  let p = '', q = '';
  try{ p = location.pathname || ''; q = location.search || ''; }catch(e){}
  if(/^\/pro\/?$/.test(p)) return true;
  return STUDIO_HOST_OK && /(^|[?&])pc(=|&|$)/.test(q);
})();
/* ★ 2.1 (2026-10-21 사용자 결정 "라이브러리 대신 라이브러리로 해서 2.1에 포함") — **앱에도 켠다.**
   이름은 화면에서만 「라이브러리」로 바꿨다(코드·저장 열쇠는 shelf 그대로 — 열쇠를 바꾸면 PC에서 쓰던 즐겨찾기가 사라진다).
   PRO 배지·브랜딩·문(pcGate)은 여전히 PC_EDITION만 본다. 웹 Studio(?studio)·폰은 예전 곡 목록 그대로 */
var SHELF_ON = (PC_EDITION || IS_NATIVE) && STUDIO_OK;

/* 표기 팔레트 글자 접기 — **재서 정한다** (2026-08-18, 사용자 결정).
   "드러머는 이 기호들을 이미 안다"가 근거다. 크로스 스틱·림샷이 들어오면서 줄이
   폰에서 712px(자리 330)까지 갔는데, 글자를 떼니 431px가 됐다.
   설정 톱니와 같은 방식이다 — 아이콘 + `aria-label`(`verify-settings.js`가 그 규칙을 지킨다).
   **글자를 켠 상태로 먼저 재야 한다** — `compact`인 채로 재면 늘 들어맞아서 영영 안 펴진다.
   버튼마다 아이콘이 있어야 성립한다. R·L은 글자가 곧 기호라 그대로 둔다. */
/* 맥 앱 가로 밀기 (2026-10-12) — overflow:hidden 줄을 휠·트랙패드·마우스 끌기로 민다.
   scrollLeft는 overflow:hidden이어도 코드로 움직일 수 있다. scrollIntoView도 그대로 듣는다 */
(function initMacScroll(){
  if(!IS_MAC_APP) return;
  const ROWS = '.artrow, .chiprow';
  document.addEventListener('wheel', e=>{
    const el = e.target.closest && e.target.closest(ROWS);
    if(!el || el.scrollWidth <= el.clientWidth + 1) return;
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if(!d) return;
    el.scrollLeft += d;
    e.preventDefault();
  }, {passive:false});
  /* 팔레트만 마우스로 끌어 민다. 칩 줄은 마우스 끌기가 이미 **마디 옮기기**라 건드리지 않는다.
     6px 넘게 끌었으면 뒤따르는 click을 삼킨다 — 안 그러면 끌다 놓은 자리의 칩이 눌린다 */
  let drag = null;
  document.addEventListener('pointerdown', e=>{
    if(e.pointerType !== 'mouse' || e.button !== 0) return;
    const el = e.target.closest && e.target.closest('.artrow');
    if(!el || el.scrollWidth <= el.clientWidth + 1) return;
    drag = {el, x: e.clientX, left: el.scrollLeft, moved: false};
  }, true);
  document.addEventListener('pointermove', e=>{
    if(!drag) return;
    const dx = e.clientX - drag.x;
    if(!drag.moved && Math.abs(dx) < 6) return;
    drag.moved = true;
    drag.el.scrollLeft = drag.left - dx;
  }, true);
  document.addEventListener('pointerup', ()=>{
    if(!drag) return;
    if(drag.moved){
      const swallow = ev=>{ ev.stopPropagation(); ev.preventDefault(); };
      document.addEventListener('click', swallow, {capture:true, once:true});
      setTimeout(()=> document.removeEventListener('click', swallow, true), 0);
    }
    drag = null;
  }, true);
})();
function fitArtRow(){
  const row = document.getElementById('artRow');
  if(!row) return;
  row.classList.remove('compact');
  if(row.scrollWidth > row.clientWidth + 1) row.classList.add('compact');
}
/* ── 큰 화면 앱 안내 배너 (2026-08-25) ──────────────
   웹 폭을 폰에 맞춰 묶은 뒤(main max-width 480), **왜 좁은지를 말해 주는 자리**다.
   좁기만 하고 이유가 없으면 그냥 못 만든 웹으로 읽힌다.
   뜨는 조건은 셋 다 참일 때뿐 — 웹이고(앱 아님), Studio가 안 열렸고, 화면이 넓다.
   앱에서는 `IS_NATIVE`로, Studio 배포에서는 `STUDIO_OK`로 각각 막힌다. */
const PROMO_KEY = 'maidrum.promo.pad';
let PROMO_OFF = false;
try{ PROMO_OFF = localStorage.getItem(PROMO_KEY) === '1'; }catch(e){}
function syncPadPromo(w){
  const el = document.getElementById('padPromo');
  if(!el) return;
  /* 폭 조건을 뗐다(2026-08-29) — 폰 방문자가 제일 많은데 폰에서만 안 보였다.
     웹 LITE면 어디서나 뜬다. 앱·Studio·한 번 닫은 사람에게는 안 뜬다. */
  el.classList.toggle('on', !IS_NATIVE && !STUDIO_OK && !PROMO_OFF);
}
function applyEdition(){
  const w = window.innerWidth, h = window.innerHeight;
  // 잠겨 있으면 화면이 아무리 넓어도 LITE다. 안내는 띄우지 않는다 —
  // 없는 기능을 광고하면 기대만 생기고, 베타 피드백이 폰 하나로 안 모인다
  const pad  = w >= 700 && STUDIO_OK;
  const land = w > h;
  const ipad = pad && land && w >= 860;      // 아이패드 가로 = 2단
  document.body.classList.toggle('edition-pad', pad);
  document.body.classList.toggle('edition-ipad', ipad);
  document.body.classList.toggle('edition-pc', !!(SHELF_ON && PC_EDITION));   // PC 스튜디오(/pro) — PRO 배지
  document.body.classList.toggle('has-shelf', !!SHELF_ON);                    // 라이브러리·책갈피 단추 (PC + 앱, 2.1)
  track(ipad ? 'screen-ipad' : pad ? 'screen-pad' : 'screen-phone');
  document.documentElement.classList.toggle('is-fixed-viewport', ipad);
  if(!pad){                       // 폰에는 연습 도구가 없다 — 그리드로 되돌린다
    showPracticePanel(false);
  }
  if(ipad) applySplit(); else document.body.style.removeProperty('--splitW');
  placeDock();
  applyBranding(pad);
  syncPadPromo(w);
  applyPadView();
  fitArtRow();          // 칼럼 폭이 바뀌면 들어가는 글자 수도 바뀐다
  if(typeof placeRails === 'function') placeRails();
}

/* 한 파일이 두 제품이다 — 폰 LITE / 아이패드 Studio.
   head의 정적 메타는 **폰 LITE가 기본**이다. JS가 안 돌아도, 검색엔진이 긁어가도
   폰 쪽 정체성이 나오게 하려는 것. 넓은 화면에서만 Studio로 갈아 끼운다.
   홈 화면 추가는 설치 시점의 manifest와 title을 읽으므로 이 시점 교체로 충분하다.
   **manifest.json(폰)은 건드리지 않는다** — 이미 홈 화면에 추가한 사용자의 설치가
   바뀌면 안 되기 때문. Studio는 별도 파일(manifest-studio.json)을 쓴다. */
const BRAND = {
  lite:   { title:'따쿵따다둥 — 드럼 악보 작업실', manifest:'/manifest.json' },
  studio: { title:'따쿵따다둥 — 드럼 악보 작업실', manifest:'/manifest.json' },
  pc:     { title:'따쿵따다둥 — 드럼 악보 작업실', manifest:'/manifest.json' },
};
let _brand = null;
function applyBranding(pad){
  const k = (SHELF_ON && PC_EDITION) ? 'pc' : pad ? 'studio' : 'lite';
  if(k === _brand) return;
  _brand = k;
  const b = BRAND[k];
  document.title = b.title;
  const link = document.getElementById('manifestLink');
  if(link) link.setAttribute('href', b.manifest);
  const at = document.querySelector('meta[name="apple-mobile-web-app-title"]');
  if(at) at.setAttribute('content', k === 'pc' ? '따쿵따다둥' : pad ? '따쿵따다둥' : '따쿵따다둥');
}
applyEdition();

/* ================= 라이브러리 — PC 스튜디오 (maidrum.com/pro, 2026-10-20) =================
   사용자 요청: "목록 말고 저장한 악보들을 한눈에 볼 수 있는 라이브러리 — 책갈피 · 즐겨찾기 · 최근 악보".

   **저장 구조는 그대로다.** 색인(maidrum.lib)·본문(maidrum.s.<id>)을 읽기만 하고, 새로 쓰는 것은 둘뿐이다.
   - `maidrum.shelf` — 즐겨찾기 · 마지막으로 연 시각(위 SHELF_KEY 주석)
   - 마디의 `bm` — 책갈피. 마디에 붙어 다니므로 옮기기·삭제·실행 취소·파일 저장을 저절로 따라간다

   미리보기는 **진짜 악보 렌더러(paint)로 첫 두 마디를 굽는다.** `measures`를 잠깐 갈아 끼워 그리는데,
   paint는 GEO·ROW_MUL을 만지므로 라이브러리를 닫을 때 renderScore()로 되돌린다(scoreImage와 같은 규칙).
   굽는 것은 rAF 조각으로 — 60곡을 한 번에 그리면 첫 화면이 멈춘다. 같은 곡은 (수정 시각·길이)가
   같으면 다시 안 굽는다.

   여기 있는 상태는 전부 `var`다 — 위쪽 renderLib·openSong이 이 함수들을 부르는데, 부팅 중에
   먼저 불려도 TDZ로 죽지 않게. */
var _shelfInfo = new Map();     // id → {sig, bpm, marks:[{mi,label,sec}], head, thumb}
var _shelfView = 'all';
var _shelfGen = 0;
var _shelfGeoDirty = false;
var _thumbHost = null;
var SHELF_RECENT_N = 12;

function shelfIsOpen(){
  const el = document.getElementById('shelf');
  return !!(el && el.classList.contains('is-open'));
}
function shelfLoad(){
  let d = null;
  try{ d = JSON.parse(lsGet(SHELF_KEY) || 'null'); }catch(e){ d = null; }
  const has = id => lib.songs.some(x => x.id === id);
  shelfSt = {v:1, fav:{}, open:{}};
  if(!d || typeof d !== 'object') return;
  if(d.fav && typeof d.fav === 'object') for(const k in d.fav){ if(d.fav[k] && has(k)) shelfSt.fav[k] = 1; }
  if(d.open && typeof d.open === 'object') for(const k in d.open){ const v = +d.open[k]; if(v > 0 && has(k)) shelfSt.open[k] = v; }
}
function shelfSave(){
  if(!SHELF_ON || !STORAGE_OK) return;
  lsSet(SHELF_KEY, JSON.stringify(shelfSt));
}
function shelfTouch(id){
  if(!SHELF_ON || !id) return;
  shelfSt.open[id] = Date.now();
  shelfSave();
}
function shelfForget(id){
  _shelfInfo.delete(id);
  if(!SHELF_ON) return;
  delete shelfSt.fav[id]; delete shelfSt.open[id];
  shelfSave();
}
function shelfFav(id){
  if(shelfSt.fav[id]) delete shelfSt.fav[id]; else shelfSt.fav[id] = 1;
  shelfSave();
  track(shelfSt.fav[id] ? 'shelf-fav' : 'shelf-unfav');
}

/* 본문을 읽어 카드에 필요한 것만 뽑는다. 마디 전체를 정규화하지 않는다 — 책갈피·BPM은 원문에서 바로 읽고,
   정규화는 미리보기에 쓸 앞 세 마디만 한다(400마디 곡도 싸다) */
function shelfInfo(s){
  const raw = lsGet(songKey(s.id));
  if(!raw) return null;
  const sig = (s.at || 0) + ':' + raw.length;
  const old = _shelfInfo.get(s.id);
  if(old && old.sig === sig) return old;
  let d = null;
  try{ d = JSON.parse(raw); }catch(e){ d = null; }
  const ms = (d && Array.isArray(d.measures)) ? d.measures : [];
  const marks = [];
  let memo = 0;
  ms.forEach(m => { if(m && Array.isArray(m.memo)) memo += m.memo.length; });
  ms.forEach((m, i)=>{
    if(m && typeof m.bm === 'string')
      marks.push({mi:i, label:m.bm.trim().slice(0, 30), sec:(typeof m.sec === 'string' ? m.sec.trim() : '')});
  });
  const inf = {sig, bpm: (d && +d.bpm) || 0, marks, memo, head: ms.slice(0, 3), thumb: null};
  _shelfInfo.set(s.id, inf);
  return inf;
}
function markName(k){ return k.label || k.sec || ''; }

/* 첫 두 마디를 진짜 렌더러로 굽는다. 실패해도 라이브러리는 떠야 하므로 빈 문자열로 물러난다 */
function shelfThumb(inf){
  if(inf.thumb !== null) return inf.thumb;
  let out = '';
  const keep = measures;
  try{
    const ms = normalizeMeasures(inf.head.length ? inf.head : [emptyMeasure()]);
    if(!_thumbHost){
      _thumbHost = document.createElement('div');
      _thumbHost.setAttribute('aria-hidden', 'true');
      _thumbHost.style.cssText = 'position:fixed;left:-99999px;top:0;width:10px;height:10px;overflow:hidden;visibility:hidden;';
      document.body.appendChild(_thumbHost);
    }
    const sv = document.createElementNS(SVG_NS, 'svg');
    _thumbHost.appendChild(sv);
    measures = ms;                      // ← 잠깐 갈아 끼운다. 아래 finally가 반드시 되돌린다
    // 셋째 마디를 넘겨 두는 이유: 둘째가 곡의 끝 마디로 보이면 마침줄이 그려진다
    /* 한 줄에 한 마디씩 두 줄 — 두 마디를 한 줄에 놓으면 카드 폭에서 오선이 실처럼 가늘어진다 */
    paint(sv, {availW:0, perLine:1, from:0, to:Math.min(2, ms.length), noZoom:true});
    measures = keep;
    /* 그린 것만 잘라 보인다 — 머리말 자리·아래 여백이 빠져야 카드에서 음표가 읽힌다.
       viewBox는 카드 비율(16:6.4)에 맞춰 세로를 넉넉히 편다(납작한 띠가 늘어나지 않게) */
    let w = +sv.getAttribute('width') || 600, h = +sv.getAttribute('height') || 140, x = 0, y = 0;
    try{
      const bb = sv.getBBox();
      if(bb && bb.width > 20 && bb.height > 10){
        x = bb.x - 10; y = bb.y - 10; w = bb.width + 20; h = bb.height + 20;
        const want = w * 6.4 / 16;
        if(h < want){ y -= (want - h) / 2; h = want; }
      }
    }catch(e){}
    sv.setAttribute('viewBox', [x, y, w, h].map(v => +v.toFixed(1)).join(' '));
    sv.removeAttribute('width'); sv.removeAttribute('height');
    sv.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    out = sv.outerHTML;
    sv.remove();
  }catch(e){ out = ''; }
  finally{ measures = keep; }
  _shelfGeoDirty = true;
  inf.thumb = out;
  return out;
}

function shelfQuery(){
  const q = document.getElementById('shelfQ');
  return q ? q.value.trim().toLowerCase() : '';
}
function shelfSorted(){
  const sort = (document.getElementById('shelfSort') || {}).value || 'at';
  const rows = lib.songs.slice();
  const openAt = x => shelfSt.open[x.id] || 0;
  if(sort === 'title'){
    const coll = new Intl.Collator(LANG === 'en' ? 'en' : 'ko', {numeric:true, sensitivity:'base'});
    rows.sort((a,b)=> coll.compare(a.title || t('무제'), b.title || t('무제')));
  }
  else if(sort === 'bars') rows.sort((a,b)=> (b.bars|0) - (a.bars|0) || (b.at||0) - (a.at||0));
  else if(sort === 'open') rows.sort((a,b)=> (openAt(b) || b.at || 0) - (openAt(a) || a.at || 0));
  else rows.sort((a,b)=> (b.at||0) - (a.at||0));
  return rows;
}
function shelfRecent(){
  const key = x => shelfSt.open[x.id] || x.at || 0;
  return lib.songs.slice().sort((a,b)=> key(b) - key(a)).slice(0, SHELF_RECENT_N);
}
function shelfMatch(s, q){
  if(!q) return true;
  if((s.title || t('무제')).toLowerCase().includes(q)) return true;
  const inf = _shelfInfo.get(s.id);
  return !!(inf && inf.marks.some(k => markName(k).toLowerCase().includes(q)));
}

function openShelf(view){
  if(!SHELF_ON) return;
  track('shelf');
  if(playing) stopPlay();
  flushSong(); libLoad(); shelfLoad();
  closeLib();
  if(view) _shelfView = view;
  const el = document.getElementById('shelf');
  el.classList.add('is-open');
  renderShelf();
}
function closeShelf(){
  const el = document.getElementById('shelf');
  if(!el || !el.classList.contains('is-open')) return;
  el.classList.remove('is-open', 'dropping');
  _shelfGen++;                                   // 굽던 조각을 멈춘다
  if(_shelfGeoDirty){ _shelfGeoDirty = false; renderScore(); updateEditCursor(); }
}

function shelfCounts(){
  let marks = 0;
  lib.songs.forEach(s => { const inf = shelfInfo(s); if(inf) marks += inf.marks.length; });
  const set = (id, v)=>{ const e = document.getElementById(id); if(e) e.textContent = v; };
  set('shelfNall', lib.songs.length);
  set('shelfNfav', lib.songs.filter(s => shelfSt.fav[s.id]).length);
  set('shelfNrecent', Math.min(SHELF_RECENT_N, lib.songs.length));
  set('shelfNmarks', marks);
  set('shelfNplog', plLoad().length);
  set('shelfNdiary', diLoad().length);
  const note = document.getElementById('shelfNote');
  if(note) note.textContent = STORAGE_OK
    ? t(IS_NATIVE ? '{n}곡 · 이 기기 안에 저장됩니다. 중요한 곡은 파일로도 저장하세요.'   // 앱에는 "브라우저"가 없다 (2.1)
                  : '{n}곡 · 이 브라우저 안에 저장됩니다. 중요한 곡은 파일로도 저장하세요.').replace('{n}', lib.songs.length)
    : t('이 브라우저는 저장이 막혀 있어 곡을 보관할 수 없습니다. 파일로 저장해 주세요.');
}

function renderShelf(){
  if(!shelfIsOpen()) return;
  libLoad();
  shelfCounts();                         // 본문을 한 번씩 읽어 책갈피·BPM을 캐시에 채운다
  document.querySelectorAll('#shelfNav .nv').forEach(b => b.classList.toggle('sel', b.dataset.v === _shelfView));
  const sortEl = document.getElementById('shelfSort');
  if(sortEl) sortEl.disabled = (_shelfView !== 'all' && _shelfView !== 'fav');
  const main = document.getElementById('shelfMain');
  main.innerHTML = '';
  if(_shelfView === 'plog') renderPlog(main);
  else if(_shelfView === 'diary') renderDiary(main);
  else if(_shelfView === 'marks') renderShelfMarks(main);
  else renderShelfCards(main);
  shelfWarm();
}

var SH_STAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.6l2.6 5.3 5.8.85-4.2 4.1 1 5.8L12 16.9l-5.2 2.75 1-5.8-4.2-4.1 5.8-.85z"/></svg>';
var SH_RIB  = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 3.5h11v17l-5.5-4-5.5 4z"/></svg>';

function shelfHead(main, title, sub){
  const h = document.createElement('h3');
  h.textContent = t(title);
  if(sub){ const sp = document.createElement('span'); sp.textContent = sub; h.appendChild(sp); }
  main.appendChild(h);
}
function shelfEmpty(main, head, body){
  const p = document.createElement('div');
  p.className = 'shelf-empty';
  p.innerHTML = '<b>' + escapeHtml(t(head)) + '</b>' + escapeHtml(t(body));
  main.appendChild(p);
}

function renderShelfCards(main){
  const q = shelfQuery();
  let rows, title, sub = '';
  if(_shelfView === 'fav'){ rows = shelfSorted().filter(s => shelfSt.fav[s.id]); title = '즐겨찾기'; }
  else if(_shelfView === 'recent'){ rows = shelfRecent(); title = '최근 악보';
    sub = t('최근에 연 순서 · {n}곡까지').replace('{n}', SHELF_RECENT_N); }
  else { rows = shelfSorted(); title = '전체 악보'; }
  rows = rows.filter(s => shelfMatch(s, q));
  shelfHead(main, title, sub || (rows.length ? t('{n}곡').replace('{n}', rows.length) : ''));
  if(!rows.length){
    if(q) shelfEmpty(main, '찾는 곡이 없습니다', '제목이나 책갈피 이름의 일부만 넣어도 찾습니다.');
    else if(_shelfView === 'fav') shelfEmpty(main, '즐겨찾기가 비어 있습니다', '카드 오른쪽 위의 별을 누르면 자주 쓰는 곡이 여기 모입니다.');
    else shelfEmpty(main, '아직 곡이 없습니다', '＋ 새 곡으로 시작하거나 .ddakung.json 파일을 이 창에 끌어다 놓으세요.');
    return;
  }
  const grid = document.createElement('div');
  grid.className = 'shelf-grid';
  rows.forEach(s => grid.appendChild(shelfCard(s)));
  main.appendChild(grid);
}

function shelfCard(s){
  const inf = shelfInfo(s) || {bpm:0, marks:[], thumb:''};
  const card = document.createElement('article');
  card.className = 'scard' + (s.id === lib.cur ? ' cur' : '');
  card.dataset.id = s.id;
  const name = s.title || t('무제');
  /* 곡 길이는 「총 n마디」 — 「n마디」는 영어에서 Bar n(몇째 마디)이라 길이로 읽히지 않는다 */
  const meta = [t('총 {n}마디').replace('{n}', s.bars|0)];
  if(inf.bpm) meta.push(inf.bpm + ' BPM');
  if(inf.memo) meta.push(t('메모 {n}').replace('{n}', inf.memo));
  meta.push(agoText(s.at));
  card.innerHTML =
      '<button class="sopen" type="button" data-act="open">'
    +   '<span class="sthumb" data-no-i18n>' + (inf.thumb || '') + '</span>'
    +   '<span class="sinfo"><b data-no-i18n>' + escapeHtml(name) + '</b><span class="smeta">' + escapeHtml(meta.join(' · ')) + '</span></span>'
    + '</button>'
    + '<button class="sfav' + (shelfSt.fav[s.id] ? ' on' : '') + '" type="button" data-act="fav" aria-pressed="'
    +   (shelfSt.fav[s.id] ? 'true' : 'false') + '" aria-label="' + escapeHtml(t('즐겨찾기')) + '" title="' + escapeHtml(t('즐겨찾기')) + '">' + SH_STAR + '</button>'
    + (s.id === lib.cur ? '<span class="snow">' + escapeHtml(t('지금 열린 곡')) + '</span>' : '');
  card.querySelector('.sopen').setAttribute('aria-label', t('악보 보기') + ': ' + name);
  card.querySelector('.sopen').title = t('전체화면 보기');
  if(inf.marks.length){
    const box = document.createElement('div');
    box.className = 'smarks';
    inf.marks.slice(0, 4).forEach(k=>{
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'smark'; b.dataset.act = 'go'; b.dataset.mi = k.mi;
      const nm = markName(k);
      b.innerHTML = SH_RIB + '<span data-no-i18n>' + escapeHtml(t('{n}마디').replace('{n}', k.mi + 1) + (nm ? ' · ' + nm : '')) + '</span>';
      b.title = t('이 마디에서 전체화면 보기');
      box.appendChild(b);
    });
    if(inf.marks.length > 4){
      const more = document.createElement('button');
      more.type = 'button'; more.className = 'smark more'; more.dataset.act = 'marks';
      more.textContent = '+' + (inf.marks.length - 4);
      more.title = t('책갈피 전부 보기');
      box.appendChild(more);
    }
    card.appendChild(box);
  }
  const acts = document.createElement('div');
  acts.className = 'sacts';
  acts.innerHTML = '<button type="button" data-act="edit">' + escapeHtml(t('편집')) + '</button>'
                 + '<button type="button" data-act="dup">' + escapeHtml(t('복제')) + '</button>'
                 + '<button type="button" data-act="del" class="danger">' + escapeHtml(t('삭제')) + '</button>';
  card.appendChild(acts);
  return card;
}

function renderShelfMarks(main){
  const q = shelfQuery();
  const groups = [];
  shelfSorted().forEach(s=>{
    const inf = shelfInfo(s);
    if(!inf || !inf.marks.length) return;
    const titleHit = !q || (s.title || t('무제')).toLowerCase().includes(q);
    const ks = titleHit ? inf.marks : inf.marks.filter(k => markName(k).toLowerCase().includes(q));
    if(ks.length) groups.push({s, ks});
  });
  const total = groups.reduce((a, g)=> a + g.ks.length, 0);
  shelfHead(main, '책갈피', total ? t('{n}개').replace('{n}', total) : '');
  if(!groups.length){
    if(q) shelfEmpty(main, '찾는 책갈피가 없습니다', '곡 제목이나 책갈피 이름의 일부만 넣어도 찾습니다.');
    else shelfEmpty(main, '책갈피가 없습니다', '편집 화면에서 마디를 고르고 「책갈피」(키보드 B)를 누르면 여기 모입니다. 연습할 자리로 바로 갑니다.');
    return;
  }
  const list = document.createElement('div');
  list.className = 'mlist';
  groups.forEach(({s, ks})=>{
    const g = document.createElement('section');
    g.className = 'mgroup' + (s.id === lib.cur ? ' cur' : '');
    g.dataset.id = s.id;
    g.innerHTML = '<header><b data-no-i18n>' + escapeHtml(s.title || t('무제')) + '</b><span>'
      + escapeHtml(t('총 {n}마디').replace('{n}', s.bars|0) + ' · ' + agoText(s.at)) + '</span>'
      + '<span class="mbtns"><button class="btn sm" type="button" data-act="view">' + escapeHtml(t('전체화면 보기')) + '</button></span></header>';
    ks.forEach(k=>{
      const r = document.createElement('div');
      r.className = 'mrow'; r.dataset.mi = k.mi;
      r.innerHTML = '<span class="mno">' + SH_RIB + escapeHtml(t('{n}마디').replace('{n}', k.mi + 1)) + '</span>'
        + '<input type="text" maxlength="30" data-act="label" spellcheck="false" autocomplete="off">'
        + '<button class="btn sm ink" type="button" data-act="view" title="' + escapeHtml(t('이 마디에서 전체화면 보기')) + '">' + escapeHtml(t('이동')) + '</button>'
        + '<button class="mx" type="button" data-act="unmark" data-no-i18n aria-label="' + escapeHtml(t('책갈피 빼기')) + '" title="' + escapeHtml(t('책갈피 빼기')) + '">✕</button>';
      const inp = r.querySelector('input');
      inp.value = k.label;
      inp.placeholder = k.sec ? k.sec : t('이름 (예: 후렴 · 필인 연습)');
      inp.setAttribute('aria-label', t('책갈피 이름'));
      g.appendChild(r);
    });
    list.appendChild(g);
  });
  main.appendChild(list);
}

/* 미리보기 굽기 — 보이는 카드부터, 한 프레임에 10ms 남짓 */
function shelfWarm(){
  const gen = ++_shelfGen;
  const main = document.getElementById('shelfMain');
  const todo = [...main.querySelectorAll('.scard')].filter(c => !c.querySelector('.sthumb svg'));
  if(!todo.length) return;
  let i = 0;
  const step = ()=>{
    if(gen !== _shelfGen || !shelfIsOpen()) return;
    const t0 = performance.now();
    while(i < todo.length && performance.now() - t0 < 10){
      const card = todo[i++];
      const s = lib.songs.find(x => x.id === card.dataset.id);
      const inf = s && shelfInfo(s);
      const box = card.querySelector('.sthumb');
      if(inf && box) box.innerHTML = shelfThumb(inf);
    }
    if(i < todo.length) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* 곡을 열고(필요하면) 그 마디로 간다. 라이브러리는 닫는다 */
function shelfOpenAt(id, mi){
  if(id !== lib.cur) openSong(id);
  if(lib.cur !== id) return;                 // 못 열었다 — openSong이 이유를 토스트로 말했다
  closeShelf();
  shelfTouch(id);
  if(mi != null && measures[mi]){
    selMeasure = mi; selEnd = mi; cursorB = 0; cursorK = 0;
    if(typeof padView !== 'undefined' && padView !== 'edit' && padView !== 'score' && typeof setPadView === 'function'){
      try{ setPadView('edit'); }catch(e){}
    }
    refreshAll();
    scrollScoreTo(mi, true);
  }
}

/* 책갈피 고치기 — 지금 곡은 화면의 `measures`를 고쳐 commit(되돌리기 가능), 다른 곡은 본문을 직접 고친다.
   다른 곡의 수정 시각(at)은 안 바꾼다 — 책갈피는 악보를 고친 게 아니다 */
function shelfEditMark(id, mi, label){
  if(id === lib.cur){
    const m = measures[mi]; if(!m) return;
    if(label === null) delete m.bm; else m.bm = label;
    refreshChips(); renderScore(); commit(); flushSong();
  } else {
    const raw = lsGet(songKey(id)); if(!raw) return;
    let d; try{ d = JSON.parse(raw); }catch(e){ return; }
    const m = d && d.measures && d.measures[mi]; if(!m) return;
    if(label === null) delete m.bm; else m.bm = label;
    if(!lsSet(songKey(id), JSON.stringify(d))){ toast('저장 공간이 부족해 책갈피를 고치지 못했습니다.'); return; }
  }
  _shelfInfo.delete(id);
}


/* 저장 팝업의 「라이브러리에 저장」 — 곡은 원래 자동 저장되지만, **눌러서 확정하는 단추**가 있어야 안심한다.
   아직 곡 항목이 없으면(예제를 고치지 않고 연 첫 화면) 여기서 만든다 — saveDraft가 첫 저장 때 만드는 그 길 */
function saveToShelf(){
  if(!SHELF_ON) return;
  if(!STORAGE_OK){ appAlert('이 브라우저는 저장이 막혀 있어 곡을 보관할 수 없습니다. 파일로 저장해 주세요.'); return; }
  clearTimeout(_draftTimer);
  _draftLast = '';                     // 바뀐 게 없어도 한 번은 쓴다 — "저장했다"가 사실이어야 한다
  saveDraft();
  if(!lib.cur || lsGet(songKey(lib.cur)) === null){ toast('저장 공간이 부족해 라이브러리에 넣지 못했습니다.'); return; }
  shelfTouch(lib.cur);
  track('save-shelf');
  const pop = document.getElementById('savePop'); if(pop) pop.classList.remove('is-open');
  const name = document.getElementById('titleInput').value.trim();
  toast(t('<b>{name}</b>을(를) 라이브러리에 저장했습니다.').replace('{name}', escapeHtml(name || t('무제')))
        + (name ? '' : ' ' + t('제목을 넣으면 라이브러리에서 찾기 쉽습니다.')), '라이브러리 열기', ()=> openShelf('all'));
}

/* 편집 화면의 책갈피 단추·B 키 */
function bmToggle(){
  if(!SHELF_ON) return;
  const m = measures[selMeasure]; if(!m) return;
  const n = selMeasure + 1;
  if(typeof m.bm === 'string'){
    delete m.bm;
    toast(t('{n}마디 책갈피를 뺐습니다.').replace('{n}', n));
  } else {
    m.bm = (typeof m.sec === 'string' ? m.sec.trim().slice(0, 30) : '');
    track('bookmark');
    toast(t('<b>{n}마디</b>에 책갈피를 꽂았습니다.').replace('{n}', n), '라이브러리', ()=> openShelf('marks'));
  }
  refreshChips(); renderScore(); commit();
}
function syncBmBtn(){
  const b = document.getElementById('bmM');
  if(!b) return;
  const on = !!(measures[selMeasure] && typeof measures[selMeasure].bm === 'string');
  b.setAttribute('aria-pressed', on ? 'true' : 'false');
}
/* 화면 악보의 붉은 리본 — renderScore가 부른다. 위치는 재생선 캐시(slotXCache)에서 */
function drawBmFlags(){
  for(let i = 0; i < measures.length; i++){
    const m = measures[i];
    if(!m || typeof m.bm !== 'string') continue;
    const L = slotXCache[i];
    if(!L) continue;
    const x = L.x0 + Math.max(10, (L.w || 40)) - 14, y = L.top - 19;
    svg.appendChild(el('path', {d:'M' + x.toFixed(1) + ' ' + y.toFixed(1) + 'h9v14l-4.5-3.6l-4.5 3.6z',
      fill:'#E33B32', class:'bmflag', 'pointer-events':'none'}));
  }
}

/* .ddakung.json 여러 개를 끌어다 놓으면 새 곡으로 넣는다(편집기에는 안 연다 — 라이브러리에 쌓기만).
   본문 모양은 draftPayload와 같다 */
function shelfImportFiles(files){
  const list = [...(files || [])].filter(f => /\.json$/i.test(f.name) || f.type === 'application/json');
  if(!list.length){ toast('악보 파일(.ddakung.json)만 넣을 수 있습니다.'); return; }
  if(!STORAGE_OK){ toast('이 브라우저는 저장이 막혀 있어 곡을 보관할 수 없습니다. 파일로 저장해 주세요.'); return; }
  flushSong(); libLoad();
  Promise.all(list.map(f => f.text().then(txt => ({f, txt}), ()=> ({f, txt:''})))).then(rs=>{
    let added = 0, skipped = 0, full = false;
    rs.forEach(({f, txt})=>{
      let d = null;
      try{ d = JSON.parse(txt); }catch(e){ d = null; }
      if(!looksLikeScore(d)){ skipped++; return; }
      const title = ((typeof d.title === 'string' && d.title.trim()) ? d.title
                   : f.name.replace(/\.(?:mai|ddakung)\.json$/i, '').replace(/\.json$/i, '')).slice(0, 60);
      let ms;
      try{ ms = normalizeMeasures(d.measures); }catch(e){ skipped++; return; }
      const meta = metaClean(d.meta);
      const at = Date.now();
      const body = JSON.stringify({
        v: 3, title, ...(+d.bpm ? {bpm: +d.bpm} : {}), measures: ms,
        ...(metaEmpty(meta) ? {} : {meta}),
        ...(d.style && d.style !== 'classic' ? {style: d.style} : {}),
        ...(d.hsize && d.hsize !== 'normal' ? {hsize: d.hsize} : {}),
        ...(d.tempo ? {tempo: true} : {}),
        at, app: APP_VER,
      });
      const id = newId();
      if(!lsSet(songKey(id), body)){ full = true; return; }
      lib.songs.unshift({id, title, at, bars: ms.length});
      added++;
    });
    if(added) libSave();
    track('shelf-drop');
    let msg = added ? t('<b>{n}곡</b>을 라이브러리에 넣었습니다.').replace('{n}', added) : t('넣은 곡이 없습니다.');
    if(skipped) msg += ' ' + t('악보 파일이 아니어서 건너뜀: {n}개').replace('{n}', skipped);
    if(full) msg += ' ' + t('저장 공간이 차서 일부를 못 넣었습니다.');
    toast(msg);
    if(shelfIsOpen()){ _shelfView = 'all'; renderShelf(); } else openShelf('all');
  });
}

(function initShelf(){
  const shelf = document.getElementById('shelf');
  if(!SHELF_ON){
    // 다른 에디션에는 라이브러리·책갈피가 아예 없다(단추는 CSS가 숨긴다)
    return;
  }
  const libBtn = document.getElementById('libBtn');
  if(libBtn){ libBtn.textContent = '라이브러리'; libBtn.title = '라이브러리 (L)'; }
  document.getElementById('shelfBtn').onclick = ()=> openShelf();
  document.getElementById('bmM').onclick = bmToggle;
  document.getElementById('saveShelfBtn').onclick = saveToShelf;
  document.getElementById('shelfClose').onclick = closeShelf;
  document.getElementById('shelfNew').onclick = ()=>{ closeShelf(); newSong(); };
  document.getElementById('shelfFile').onclick = ()=>{ closeShelf(); document.getElementById('fileInput').click(); };
  document.getElementById('shelfCopyAll').onclick = ()=> document.getElementById('libCopyAll').click();
  document.getElementById('shelfPasteIn').onclick = ()=> document.getElementById('libPasteIn').click();
  document.getElementById('shelfSort').onchange = ()=> renderShelf();
  let qT = 0;
  document.getElementById('shelfQ').addEventListener('input', ()=>{ clearTimeout(qT); qT = setTimeout(renderShelf, 120); });
  document.getElementById('shelfNav').addEventListener('click', e=>{
    const b = e.target.closest('.nv'); if(!b) return;
    _shelfView = b.dataset.v; renderShelf();
    document.getElementById('shelfMain').scrollTop = 0;
  });

  const main = document.getElementById('shelfMain');
  main.addEventListener('click', e=>{
    const a = e.target.closest('[data-act]'); if(!a || a.dataset.act === 'label') return;
    const host = a.closest('[data-id]'); if(!host) return;
    const id = host.dataset.id, act = a.dataset.act;
    /* 누르면 **바로 전체화면 보기** (2026-10-20 사용자 결정 — 한때 「보기 / 편집」을 고르게 했다가 걷었다:
       "전체화면에 편집하기가 있으니 불필요"). 편집기로 바로 가는 길은 카드 아래 작은 「편집」 하나만 남긴다 */
    const miOf = ()=>{ const r = a.closest('[data-mi]'); return r ? +r.dataset.mi : null; };
    if(act === 'open' || act === 'go' || act === 'view') openReader(id, miOf());
    else if(act === 'edit') shelfOpenAt(id, miOf());
    else if(act === 'fav'){
      shelfFav(id);
      a.classList.toggle('on', !!shelfSt.fav[id]);
      a.setAttribute('aria-pressed', shelfSt.fav[id] ? 'true' : 'false');
      shelfCounts();
      if(_shelfView === 'fav') renderShelf();
    }
    else if(act === 'marks'){ _shelfView = 'marks'; renderShelf(); }
    else if(act === 'dup'){ dupSong(id); }                  // renderLib가 라이브러리를 다시 그린다
    else if(act === 'del'){
      const s = lib.songs.find(x => x.id === id);
      appAsk(t('"{name}"을(를) 지울까요?\n되돌릴 수 없습니다.').replace('{name}', (s && s.title) || t('무제')), '삭제')
        .then(ok=>{ if(ok) delSong(id, true); });
    }
    else if(act === 'unmark'){
      const r = a.closest('[data-mi]'); if(!r) return;
      shelfEditMark(id, +r.dataset.mi, null);
      renderShelf();
    }
  });
  // 책갈피 이름 — 칸을 떠나거나 Enter를 누르면 저장한다
  main.addEventListener('change', e=>{
    const inp = e.target.closest('input[data-act="label"]'); if(!inp) return;
    const host = inp.closest('[data-id]'), r = inp.closest('[data-mi]');
    if(!host || !r) return;
    shelfEditMark(host.dataset.id, +r.dataset.mi, inp.value.trim().slice(0, 30));
  });
  main.addEventListener('keydown', e=>{
    if(e.key === 'Enter' && e.target.matches('input[data-act="label"]')){ e.preventDefault(); e.target.blur(); }
  });

  /* 파일 끌어다 놓기 — PC니까. 라이브러리가 닫혀 있어도 창 어디에 놓든 받는다 */
  const hasFiles = e => !!(e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files'));
  let dragN = 0;
  window.addEventListener('dragenter', e=>{
    if(!hasFiles(e)) return;
    dragN++;
    if(!shelfIsOpen()) openShelf();
    shelf.classList.add('dropping');
  });
  window.addEventListener('dragleave', e=>{
    if(!hasFiles(e)) return;
    dragN = Math.max(0, dragN - 1);
    if(!dragN) shelf.classList.remove('dropping');
  });
  window.addEventListener('dragover', e=>{ if(hasFiles(e)) e.preventDefault(); });
  window.addEventListener('drop', e=>{
    if(!hasFiles(e)) return;
    e.preventDefault();
    dragN = 0; shelf.classList.remove('dropping');
    shelfImportFiles(e.dataTransfer.files);
  });

  /* 키보드 — 라이브러리가 열려 있으면 편집기 단축키(스페이스 재생 · ⌘Z · T 탭 템포)를 막는다.
     capture 단계라 아래쪽 document 리스너보다 먼저 돈다. 묻는 창·곡 옮기기 창이 위에 있으면 비켜 준다 */
  document.addEventListener('keydown', e=>{
    if(readerIsOpen()){ readerKey(e); return; }       // 악보 보기가 맨 위다
    const tg = e.target || {};
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName || '') || tg.isContentEditable;
    if(shelfIsOpen()){
      if(document.querySelector('#askPop.is-open, #movePop.is-open, #plogPop.is-open')) return;
      if(e.key === 'Escape'){
        e.preventDefault(); e.stopPropagation();
        closeShelf();
        return;
      }
      if((!typing && e.key === '/') || ((e.metaKey || e.ctrlKey) && (e.key === 'f' || e.key === 'F'))){
        e.preventDefault(); e.stopPropagation();
        const q = document.getElementById('shelfQ'); q.focus(); q.select();
        return;
      }
      if(!typing || e.metaKey || e.ctrlKey) e.stopPropagation();
      /* 입력칸 밖의 ⌘Z는 **브라우저 자체 되돌리기**가 받는다 — 마지막으로 고친 입력칸(곡 제목)을
         되돌려 제목이 지워졌다(검사에서 잡음). 라이브러리 위에서는 그 기본 동작도 막는다 */
      if(!typing && (e.metaKey || e.ctrlKey) && /^[zZyY]$/.test(e.key)) e.preventDefault();
      return;
    }
    if(typing || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    if(document.querySelector('.pop.is-open')) return;
    if(e.key === 'b' || e.key === 'B'){ e.preventDefault(); bmToggle(); }
    else if(e.key === 'l' || e.key === 'L'){ e.preventDefault(); openShelf(); }
  }, true);
})();

/* ================= 연습 기록장 · 일기장 — PC 스튜디오 라이브러리 (2026-10-21) =================
   요청(드러머 김현정 님): "매일 연습기록장 + 일기장. 둘은 분리. 연습기록은 주·월·연별로.
   이순신 난중일기처럼 깔끔하게. 악보는 따쿵따다둥에서 가져오고. 연습마다 기분을 적어 둠".
   사용자 결정: /pro 먼저 · 기분 = 얼굴 5단계 + 한 단어 · 연습할 때마다 한 줄(하루 여러 번).

   - **연습 기록장** `maidrum.plog` = {v:1, s:[{id, d:'YYYY-MM-DD', tm:'HH:MM', min, mood:0~5, word, memo, songs:[{id,title}], at}]}
     앱이 재는 자동 기록(maidrum.hist — 재생 시간)은 **건드리지 않는다.** 화면에서 옅게 같이 보여 주고,
     새 기록의 「연습 시간」 기본값을 "오늘 잰 시간 − 이미 적은 시간"으로 채우는 데만 쓴다
   - **일기장** `maidrum.diary` = {v:1, e:[{d, text, songs:[{id,title}], at}]} — 하루 한 장. 연습 기록과 섞지 않는다
   - 악보는 라이브러리 곡을 붙인다. 제목도 같이 적어 둔다 — 곡을 지워도 "무엇을 연습했나"는 남아야 한다
   - 주는 **월요일**에 시작한다. 전체 백업 복사에 둘 다 실린다.
   상태는 전부 var([[tdz]]). */
var MOODS = [{v:1, f:'😣', k:'힘듦'}, {v:2, f:'🙁', k:'별로'}, {v:3, f:'😐', k:'보통'}, {v:4, f:'🙂', k:'좋음'}, {v:5, f:'😄', k:'최고'}];
var _pl = {tab:'week', at:null, sel:''};
var _di = {sel:'', t:0};
var WD_KO = ['일','월','화','수','목','금','토'];

function jParse(k){ try{ return JSON.parse(lsGet(k) || 'null'); }catch(e){ return null; } }
function plLoad(){
  const d = jParse(PLOG_KEY);
  const s = (d && Array.isArray(d.s)) ? d.s : [];
  return s.filter(x => x && typeof x.id === 'string' && /^\d{4}-\d\d-\d\d$/.test(x.d)).map(x => ({
    id: x.id, d: x.d, tm: /^\d\d:\d\d$/.test(x.tm) ? x.tm : '', min: Math.max(0, Math.min(1440, x.min|0)),
    mood: Math.max(0, Math.min(5, x.mood|0)), word: String(x.word || '').slice(0, 16), memo: String(x.memo || '').slice(0, 300),
    songs: Array.isArray(x.songs) ? x.songs.filter(q => q && typeof q.id === 'string').slice(0, 8)
             .map(q => ({id: q.id, title: String(q.title || '').slice(0, 60)})) : [],
    at: +x.at || 0 }));
}
function plSave(s){
  if(!STORAGE_OK) return false;
  s.sort((a, b)=> (a.d + a.tm).localeCompare(b.d + b.tm));
  return lsSet(PLOG_KEY, JSON.stringify({v:1, s}));
}
function diLoad(){
  const d = jParse(DIARY_KEY);
  const e = (d && Array.isArray(d.e)) ? d.e : [];
  return e.filter(x => x && /^\d{4}-\d\d-\d\d$/.test(x.d)).map(x => ({
    d: x.d, text: String(x.text || '').slice(0, 20000),
    songs: Array.isArray(x.songs) ? x.songs.filter(q => q && typeof q.id === 'string').slice(0, 8)
             .map(q => ({id: q.id, title: String(q.title || '').slice(0, 60)})) : [],
    at: +x.at || 0 }));
}
function diSave(e){
  if(!STORAGE_OK) return false;
  e.sort((a, b)=> b.d.localeCompare(a.d));
  return lsSet(DIARY_KEY, JSON.stringify({v:1, e}));
}

/* 날짜 */
function jDate(s){ const p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
function jToday(){ return dayStrOf(new Date()); }
function jMon(dt){ const x = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
function jAdd(dt, n){ return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + n); }
function jLabel(s, withYear){
  const d = jDate(s);
  if(LANG === 'en') return d.toLocaleDateString('en-US', {weekday:'short', month:'short', day:'numeric', ...(withYear ? {year:'numeric'} : {})});
  return (withYear ? d.getFullYear() + '년 ' : '') + (d.getMonth() + 1) + '월 ' + d.getDate() + '일 (' + WD_KO[d.getDay()] + ')';
}
function jMin(m){ m = Math.round(m); const h = (m / 60) | 0, mm = m % 60;
  return h ? h + t('시간') + (mm ? ' ' + mm + t('분') : '') : m + t('분'); }
function jAuto(){                         // 날짜 → 앱이 잰 재생 시간(분)
  const map = {};
  try{ histLoad().forEach(x => { map[x.d] = (x.ms || 0) / 60000; }); }catch(e){}
  try{ const td = statsToday(); map[td.day] = (td.ms || 0) / 60000; }catch(e){}
  return map;
}
function jByDay(s){ const m = {}; s.forEach(x => (m[x.d] = m[x.d] || []).push(x)); return m; }
function jMoodAvg(list){
  const v = list.filter(x => x.mood).map(x => x.mood);
  return v.length ? v.reduce((a, b)=> a + b, 0) / v.length : 0;
}
function jFace(v){ const m = MOODS[Math.round(v) - 1]; return m ? m.f : ''; }
function jLevel(min){ return min <= 0 ? 0 : min < 15 ? 1 : min < 30 ? 2 : min < 60 ? 3 : 4; }
function jSongTitle(q){
  const s = lib.songs.find(x => x.id === q.id);
  return (s && s.title) || q.title || t('무제');
}

/* ───────────── 연습 기록장 ───────────── */
function renderPlog(main){
  if(!_pl.at) _pl.at = new Date();
  const all = plLoad(), by = jByDay(all), auto = jAuto();
  const q = shelfQuery();
  const hit = x => !q || (x.memo + ' ' + x.word + ' ' + x.songs.map(jSongTitle).join(' ')).toLowerCase().includes(q);
  const wrap = document.createElement('div');
  wrap.className = 'jwrap';
  const at = _pl.at;
  let title = '', from, to;
  if(_pl.tab === 'week'){
    from = jMon(at); to = jAdd(from, 6);
    title = LANG === 'en' ? 'Week of ' + jLabel(dayStrOf(from))
      : from.getFullYear() + '년 ' + (from.getMonth() + 1) + '월 ' + from.getDate() + '일 – ' + (to.getMonth() + 1) + '월 ' + to.getDate() + '일';
  } else if(_pl.tab === 'month'){
    from = new Date(at.getFullYear(), at.getMonth(), 1); to = new Date(at.getFullYear(), at.getMonth() + 1, 0);
    title = LANG === 'en' ? from.toLocaleDateString('en-US', {month:'long', year:'numeric'}) : at.getFullYear() + '년 ' + (at.getMonth() + 1) + '월';
  } else {
    from = new Date(at.getFullYear(), 0, 1); to = new Date(at.getFullYear(), 11, 31);
    title = LANG === 'en' ? String(at.getFullYear()) : at.getFullYear() + '년';
  }
  const f = dayStrOf(from), tt = dayStrOf(to);
  const inR = all.filter(x => x.d >= f && x.d <= tt);
  const days = new Set(inR.filter(x => x.min > 0 || x.mood).map(x => x.d));
  const sum = inR.reduce((a, x)=> a + x.min, 0);
  let autoSum = 0; for(const k in auto){ if(k >= f && k <= tt) autoSum += auto[k]; }
  const avg = jMoodAvg(inR);
  wrap.innerHTML =
      '<div class="jbar">'
    +   '<div class="jtabs" role="tablist">' + ['week', 'month', 'year'].map(k =>
          '<button type="button" data-pl-tab="' + k + '" class="' + (_pl.tab === k ? 'sel' : '') + '">' + escapeHtml(t({week:'주', month:'월', year:'연'}[k])) + '</button>').join('') + '</div>'
    +   '<button class="jnav" type="button" data-pl-nav="-1" aria-label="' + escapeHtml(t('이전')) + '">‹</button>'
    +   '<b class="jtitle" data-no-i18n>' + escapeHtml(title) + '</b>'
    +   '<button class="jnav" type="button" data-pl-nav="1" aria-label="' + escapeHtml(t('다음')) + '">›</button>'
    +   '<button class="btn sm" type="button" data-pl-nav="0">' + escapeHtml(t('오늘')) + '</button>'
    +   '<button class="btn ink sm jadd" type="button" data-pl-add="">' + escapeHtml(t('＋ 연습 기록')) + '</button>'
    + '</div>'
    + '<div class="jsum">'
    +   '<div><b>' + escapeHtml(jMin(sum)) + '</b><span>' + escapeHtml(t('적은 연습 시간')) + '</span></div>'
    +   '<div><b>' + days.size + '</b><span>' + escapeHtml(t('연습한 날')) + '</span></div>'
    +   '<div><b>' + inR.length + '</b><span>' + escapeHtml(t('기록')) + '</span></div>'
    +   '<div><b class="jface">' + (avg ? jFace(avg) : '–') + '</b><span>' + escapeHtml(t('기분 평균')) + '</span></div>'
    +   '<div class="jauto"><b>' + escapeHtml(jMin(autoSum)) + '</b><span>' + escapeHtml(t('앱이 잰 재생 시간')) + '</span></div>'
    + '</div>';
  const body = document.createElement('div');
  body.className = 'jbody';
  wrap.appendChild(body);
  if(_pl.tab === 'week') plWeek(body, from, by, auto, hit);
  else if(_pl.tab === 'month') plMonth(body, from, to, by, auto, hit);
  else plYear(body, at.getFullYear(), by, auto);
  main.appendChild(wrap);
}

function plDayList(box, ds, by, hit, emptyMsg){
  let any = false;
  ds.forEach(d=>{
    const list = (by[d] || []).filter(hit);
    if(!list.length) return;
    any = true;
    const g = document.createElement('section');
    g.className = 'jday';
    g.innerHTML = '<h4>' + escapeHtml(jLabel(d, _pl.tab === 'year')) + '<span>' + escapeHtml(jMin(list.reduce((a, x)=> a + x.min, 0))) + '</span>'
      + '<button class="jdayadd" type="button" data-pl-add="' + d + '" title="' + escapeHtml(t('이 날 기록 더하기')) + '" aria-label="' + escapeHtml(t('이 날 기록 더하기')) + '">＋</button></h4>';
    list.forEach(x=>{
      const r = document.createElement('div');
      r.className = 'jrow';
      r.dataset.plId = x.id;
      const m = MOODS[x.mood - 1];
      r.innerHTML = '<span class="jtm" data-no-i18n>' + escapeHtml(x.tm || '') + '</span>'
        + '<span class="jmn" data-no-i18n>' + escapeHtml(x.min ? jMin(x.min) : '–') + '</span>'
        + '<span class="jmood" data-no-i18n>' + (m ? '<i>' + m.f + '</i>' + escapeHtml(x.word || t(m.k)) : '') + '</span>'
        + '<span class="jsongs">' + x.songs.map(q => '<button type="button" class="jsong" data-song="' + escapeHtml(q.id) + '" data-no-i18n>♪ ' + escapeHtml(jSongTitle(q)) + '</button>').join('') + '</span>'
        + '<span class="jmemo" data-no-i18n>' + escapeHtml(x.memo) + '</span>'
        + '<button class="jedit" type="button" data-pl-edit="' + x.id + '">' + escapeHtml(t('고치기')) + '</button>';
      g.appendChild(r);
    });
    box.appendChild(g);
  });
  if(!any){
    const p = document.createElement('div');
    p.className = 'shelf-empty jempty';
    p.innerHTML = '<b>' + escapeHtml(t(emptyMsg)) + '</b>' + escapeHtml(t('연습을 마치면 「＋ 연습 기록」으로 한 줄 남겨 보세요. 시간은 앱이 잰 값으로 채워 둡니다.'));
    box.appendChild(p);
  }
}

function plWeek(body, mon, by, auto, hit){
  const ds = [...Array(7)].map((_, i)=> dayStrOf(jAdd(mon, i)));
  const mins = ds.map(d => (by[d] || []).reduce((a, x)=> a + x.min, 0));
  const top = Math.max(30, ...mins, ...ds.map(d => auto[d] || 0));
  const bars = document.createElement('div');
  bars.className = 'jweek';
  const today = jToday();
  ds.forEach((d, i)=>{
    const dt = jDate(d), list = by[d] || [];
    const a = auto[d] || 0, mn = mins[i];
    const c = document.createElement('button');
    c.type = 'button'; c.className = 'jwd' + (d === today ? ' today' : '');
    c.dataset.plAdd = d;
    c.title = t('이 날 기록 더하기');
    c.innerHTML = '<span class="jwbar"><i class="ja" style="height:' + Math.round(a / top * 100) + '%"></i>'
      + '<i class="jl" style="height:' + Math.round(mn / top * 100) + '%"></i></span>'
      + '<span class="jwm" data-no-i18n>' + (mn ? escapeHtml(jMin(mn)) : '') + '</span>'
      + '<span class="jwf" data-no-i18n>' + list.filter(x => x.mood).slice(0, 3).map(x => jFace(x.mood)).join('') + '</span>'
      + '<span class="jwl" data-no-i18n>' + escapeHtml((LANG === 'en' ? ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'] : WD_KO)[dt.getDay()]) + ' ' + (dt.getMonth() + 1) + '/' + dt.getDate() + '</span>';
    bars.appendChild(c);
  });
  body.appendChild(bars);
  const lg = document.createElement('p');
  lg.className = 'jlegend';
  lg.innerHTML = '<i class="jl"></i>' + escapeHtml(t('적은 연습 시간')) + '<i class="ja"></i>' + escapeHtml(t('앱이 잰 재생 시간'));
  body.appendChild(lg);
  plDayList(body, ds.slice().reverse(), by, hit, '이번 주 기록이 없습니다');
}

function plMonth(body, first, last, by, auto, hit){
  const cal = document.createElement('div');
  cal.className = 'jcal';
  (LANG === 'en' ? ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'] : ['월','화','수','목','금','토','일']).forEach(w=>{
    const h = document.createElement('span'); h.className = 'jch'; h.textContent = w; h.setAttribute('data-no-i18n', ''); cal.appendChild(h);
  });
  const lead = (first.getDay() + 6) % 7;
  for(let i = 0; i < lead; i++){ const e = document.createElement('span'); e.className = 'jce'; cal.appendChild(e); }
  const today = jToday();
  for(let n = 1; n <= last.getDate(); n++){
    const d = dayStrOf(new Date(first.getFullYear(), first.getMonth(), n));
    const list = by[d] || [];
    const mn = list.reduce((a, x)=> a + x.min, 0);
    const c = document.createElement('button');
    c.type = 'button';
    c.className = 'jcd lv' + jLevel(mn) + (d === today ? ' today' : '') + (d === _pl.sel ? ' sel' : '') + (!list.length && (auto[d] || 0) >= 1 ? ' autoonly' : '');
    c.dataset.plDay = d;
    c.innerHTML = '<span class="jn">' + n + '</span>'
      + '<span class="jcf" data-no-i18n>' + list.filter(x => x.mood).slice(0, 3).map(x => jFace(x.mood)).join('') + '</span>'
      + '<span class="jcm" data-no-i18n>' + (mn ? escapeHtml(jMin(mn)) : '') + '</span>';
    c.title = jLabel(d) + (mn ? ' · ' + jMin(mn) : '');
    cal.appendChild(c);
  }
  body.appendChild(cal);
  if(_pl.sel && _pl.sel >= dayStrOf(first) && _pl.sel <= dayStrOf(last)){
    const sel = document.createElement('div');
    sel.className = 'jselbar';
    sel.innerHTML = '<b data-no-i18n>' + escapeHtml(jLabel(_pl.sel)) + '</b><button class="btn ink sm" type="button" data-pl-add="' + _pl.sel + '">' + escapeHtml(t('이 날 기록 더하기')) + '</button>';
    body.appendChild(sel);
    plDayList(body, [_pl.sel], by, hit, '이 날은 기록이 없습니다');
  } else {
    const ds = []; for(let n = last.getDate(); n >= 1; n--) ds.push(dayStrOf(new Date(first.getFullYear(), first.getMonth(), n)));
    plDayList(body, ds, by, hit, '이 달 기록이 없습니다');
  }
}

function plYear(body, y, by, auto){
  /* 잔디 — 열 = 주(월요일 시작), 행 = 요일. 칸 진하기 = 그날 적은 연습 시간 */
  const grid = document.createElement('div');
  grid.className = 'jgrass';
  const start = jMon(new Date(y, 0, 1)), end = new Date(y, 11, 31);
  const months = document.createElement('div');
  months.className = 'jgm';
  let col = 0, lastM = -1;
  for(let w = new Date(start); w <= end; w = jAdd(w, 7), col++){
    const colEl = document.createElement('div');
    colEl.className = 'jgc';
    for(let i = 0; i < 7; i++){
      const dt = jAdd(w, i), d = dayStrOf(dt);
      const c = document.createElement('i');
      if(dt.getFullYear() !== y){ c.className = 'out'; colEl.appendChild(c); continue; }
      const mn = (by[d] || []).reduce((a, x)=> a + x.min, 0);
      c.className = 'lv' + jLevel(mn) + (!mn && (auto[d] || 0) >= 1 ? ' autoonly' : '');
      c.title = jLabel(d) + (mn ? ' · ' + jMin(mn) : '');
      c.dataset.plDay = d;
      colEl.appendChild(c);
    }
    const m = jAdd(w, 6).getMonth();
    const lab = document.createElement('span');
    if(m !== lastM && jAdd(w, 6).getFullYear() === y){ lab.textContent = LANG === 'en' ? ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m] : (m + 1) + '월'; lastM = m; }
    lab.setAttribute('data-no-i18n', '');
    months.appendChild(lab);
    grid.appendChild(colEl);
  }
  const gw = document.createElement('div');
  gw.className = 'jgwrap';
  gw.append(months, grid);
  body.appendChild(gw);
  /* 달마다 합계 막대 — 누르면 그 달로 */
  const mb = document.createElement('div');
  mb.className = 'jmonths';
  const tot = [...Array(12)].map((_, m)=>{
    let s = 0, n = 0;
    for(const d in by){ if(d.startsWith(y + '-' + String(m + 1).padStart(2, '0'))){ s += by[d].reduce((a, x)=> a + x.min, 0); n += by[d].length; } }
    return {s, n};
  });
  const top = Math.max(60, ...tot.map(x => x.s));
  tot.forEach((x, m)=>{
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'jmb'; b.dataset.plMonth = m;
    b.innerHTML = '<span class="jmbar"><i style="height:' + Math.round(x.s / top * 100) + '%"></i></span>'
      + '<span class="jmv" data-no-i18n>' + (x.s ? escapeHtml(jMin(x.s)) : '') + '</span>'
      + '<span class="jml" data-no-i18n>' + (LANG === 'en' ? ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m] : (m + 1) + '월') + '</span>';
    mb.appendChild(b);
  });
  body.appendChild(mb);
}

/* 기록 창 — 새로 / 고치기 */
function plOpen(id, day){
  const pop = document.getElementById('plogPop');
  const all = plLoad();
  const x = id ? all.find(s => s.id === id) : null;
  const now = new Date();
  const d = x ? x.d : (day || jToday());
  let min = x ? x.min : 0;
  if(!x){
    const auto = jAuto()[d] || 0;
    const logged = all.filter(s => s.d === d).reduce((a, s)=> a + s.min, 0);
    min = Math.max(0, Math.round(auto - logged));
  }
  pop.dataset.id = x ? x.id : '';
  document.getElementById('plTitle').textContent = t(x ? '연습 기록 고치기' : '연습 기록');
  document.getElementById('plDate').value = d;
  document.getElementById('plTime').value = x ? x.tm : String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  document.getElementById('plMin').value = min || '';
  document.getElementById('plWord').value = x ? x.word : '';
  document.getElementById('plMemo').value = x ? x.memo : '';
  pop._mood = x ? x.mood : 0;
  pop._songs = x ? x.songs.slice() : (lib.cur && lib.songs.some(s => s.id === lib.cur)
    ? [{id: lib.cur, title: (lib.songs.find(s => s.id === lib.cur) || {}).title || ''}] : []);
  document.getElementById('plDel').style.display = x ? '' : 'none';   // .btn의 display가 [hidden]을 이긴다
  plSync();
  pop.classList.add('is-open');
  setTimeout(()=>{ try{ document.getElementById('plMin').focus(); }catch(e){} }, 30);
}
function plSync(){
  const pop = document.getElementById('plogPop');
  document.querySelectorAll('#plMoods button').forEach(b => {
    const on = +b.dataset.mood === pop._mood;
    b.classList.toggle('sel', on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  const m = MOODS[pop._mood - 1];
  document.getElementById('plWord').placeholder = m ? t(m.k) + ' — ' + t('한 단어(선택)') : t('한 단어(선택)');
  const box = document.getElementById('plSongs');
  box.innerHTML = pop._songs.map((q, i)=> '<span class="jchip" data-no-i18n>♪ ' + escapeHtml(jSongTitle(q))
    + '<button type="button" data-rm="' + i + '" aria-label="' + escapeHtml(t('빼기')) + '">✕</button></span>').join('');
  const sel = document.getElementById('plSongAdd');
  const have = new Set(pop._songs.map(q => q.id));
  sel.innerHTML = '<option value="">' + escapeHtml(t('＋ 라이브러리에서 악보 붙이기')) + '</option>'
    + lib.songs.slice().sort((a, b)=> (shelfSt.open[b.id] || b.at || 0) - (shelfSt.open[a.id] || a.at || 0))
        .filter(s => !have.has(s.id)).map(s => '<option value="' + escapeHtml(s.id) + '">' + escapeHtml(s.title || t('무제')) + '</option>').join('');
  sel.disabled = pop._songs.length >= 8;
}
function plCommit(){
  const pop = document.getElementById('plogPop');
  const d = document.getElementById('plDate').value;
  if(!/^\d{4}-\d\d-\d\d$/.test(d)){ toast('날짜를 골라 주세요.'); return; }
  const all = plLoad();
  const id = pop.dataset.id || ('pl-' + newId());
  const rec = {id, d, tm: document.getElementById('plTime').value || '',
    min: Math.max(0, Math.min(1440, Math.round(+document.getElementById('plMin').value || 0))),
    mood: pop._mood | 0, word: document.getElementById('plWord').value.trim().slice(0, 16),
    memo: document.getElementById('plMemo').value.trim().slice(0, 300),
    songs: pop._songs.slice(0, 8), at: Date.now()};
  if(!rec.min && !rec.mood && !rec.memo && !rec.songs.length){ toast('시간·기분·메모·악보 중 하나는 적어 주세요.'); return; }
  const i = all.findIndex(s => s.id === id);
  if(i >= 0) all[i] = rec; else all.push(rec);
  if(!plSave(all)){ toast('저장 공간이 부족해 기록하지 못했습니다.'); return; }
  track(i >= 0 ? 'plog-edit' : 'plog-add');
  pop.classList.remove('is-open');
  _pl.at = jDate(d);
  if(_pl.tab === 'month') _pl.sel = d;
  if(shelfIsOpen()){ _shelfView = 'plog'; renderShelf(); } else openShelf('plog');
  toast(t('{d} 연습을 적었습니다.').replace('{d}', jLabel(d)));
}
function plDelete(){
  const pop = document.getElementById('plogPop');
  const id = pop.dataset.id; if(!id) return;
  appAsk('이 연습 기록을 지울까요?', '삭제').then(ok=>{
    if(!ok) return;
    plSave(plLoad().filter(s => s.id !== id));
    pop.classList.remove('is-open');
    renderShelf();
  });
}

/* ───────────── 일기장 ───────────── */
function renderDiary(main){
  const all = diLoad();
  const q = shelfQuery();
  if(!_di.sel) _di.sel = jToday();
  const wrap = document.createElement('div');
  wrap.className = 'dwrap';
  const list = document.createElement('div');
  list.className = 'dlist';
  list.innerHTML = '<div class="dlhead"><input type="date" id="diDate" value="' + escapeHtml(_di.sel) + '" aria-label="' + escapeHtml(t('날짜')) + '">'
    + '<button class="btn ink sm" type="button" data-di-today="">' + escapeHtml(t('오늘 일기')) + '</button></div>';
  const rows = all.filter(e => !q || (e.text + ' ' + e.songs.map(jSongTitle).join(' ')).toLowerCase().includes(q));
  if(!rows.length){
    const p = document.createElement('p'); p.className = 'dnone';
    p.textContent = t(q ? '찾는 일기가 없습니다.' : '아직 쓴 일기가 없습니다.');
    list.appendChild(p);
  }
  rows.forEach(e=>{
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'ditem' + (e.d === _di.sel ? ' sel' : '');
    b.dataset.diDay = e.d;
    const line = (e.text.split('\n').find(l => l.trim()) || '').slice(0, 60);
    b.innerHTML = '<b data-no-i18n>' + escapeHtml(jLabel(e.d, true)) + '</b><span data-no-i18n>' + escapeHtml(line || (e.songs.length ? '♪ ' + jSongTitle(e.songs[0]) : '')) + '</span>'
      + (e.songs.length ? '<em data-no-i18n>♪ ' + e.songs.length + '</em>' : '');
    list.appendChild(b);
  });
  const page = document.createElement('article');
  page.className = 'dpage';
  const cur = all.find(e => e.d === _di.sel) || {d:_di.sel, text:'', songs:[]};
  const dt = jDate(_di.sel);
  const wd = LANG === 'en' ? dt.toLocaleDateString('en-US', {weekday:'long'}) : ['일','월','화','수','목','금','토'][dt.getDay()] + '요일';
  page.innerHTML = '<header><b data-no-i18n>' + escapeHtml(LANG === 'en'
        ? dt.toLocaleDateString('en-US', {year:'numeric', month:'long', day:'numeric'})
        : dt.getFullYear() + '년 ' + (dt.getMonth() + 1) + '월 ' + dt.getDate() + '일') + '</b><span data-no-i18n>' + escapeHtml(wd) + '</span></header>'
    + '<textarea id="diText" data-no-i18n spellcheck="false" placeholder="' + escapeHtml(t('오늘 연습은 어땠나요. 짧게 적어도 됩니다.')) + '"></textarea>'
    + '<div class="dsongs" id="diSongs"></div>'
    + '<div class="dfoot"><select id="diSongAdd" aria-label="' + escapeHtml(t('악보 붙이기')) + '"></select>'
    + '<span class="dsaved" id="diSaved"></span>'
    + '<button class="btn sm" type="button" id="diDel"' + (all.some(e => e.d === _di.sel) ? '' : ' style="display:none"') + '>' + escapeHtml(t('이 날 일기 지우기')) + '</button></div>';
  wrap.append(list, page);
  main.appendChild(wrap);
  const ta = page.querySelector('#diText');
  ta.value = cur.text;
  page._songs = cur.songs.slice();
  diSongsDraw(page);
}
function diSongsDraw(page){
  const box = page.querySelector('#diSongs');
  box.innerHTML = '';
  page._songs.forEach((q, i)=>{
    const s = lib.songs.find(x => x.id === q.id);
    const c = document.createElement('div');
    c.className = 'dsong' + (s ? '' : ' gone');
    let thumb = '';
    if(s){ const inf = shelfInfo(s); if(inf) thumb = shelfThumb(inf); }
    c.innerHTML = '<button type="button" class="dsopen" data-song="' + escapeHtml(q.id) + '" title="' + escapeHtml(t(s ? '전체화면 보기' : '라이브러리에 없는 곡입니다')) + '">'
      + '<span class="sthumb" data-no-i18n>' + thumb + '</span><b data-no-i18n>' + escapeHtml(jSongTitle(q)) + '</b></button>'
      + '<button type="button" class="dsrm" data-di-rm="' + i + '" aria-label="' + escapeHtml(t('빼기')) + '" data-no-i18n>✕</button>';
    box.appendChild(c);
  });
  const sel = page.querySelector('#diSongAdd');
  const have = new Set(page._songs.map(q => q.id));
  sel.innerHTML = '<option value="">' + escapeHtml(t('＋ 라이브러리에서 악보 붙이기')) + '</option>'
    + lib.songs.slice().sort((a, b)=> (shelfSt.open[b.id] || b.at || 0) - (shelfSt.open[a.id] || a.at || 0))
        .filter(s => !have.has(s.id)).map(s => '<option value="' + escapeHtml(s.id) + '">' + escapeHtml(s.title || t('무제')) + '</option>').join('');
  sel.disabled = page._songs.length >= 8;
}
/* 쓰는 대로 저장한다(0.4초 묶음). 글도 악보도 없으면 그 날 장을 지운다 — 빈 장이 목록에 쌓이지 않게 */
function diStore(page, now){
  clearTimeout(_di.t);
  const go = ()=>{
    const all = diLoad();
    const text = (page.querySelector('#diText') || {}).value || '';
    const i = all.findIndex(e => e.d === _di.sel);
    const empty = !text.trim() && !page._songs.length;
    if(empty){ if(i >= 0){ all.splice(i, 1); diSave(all); } }
    else {
      const rec = {d:_di.sel, text, songs: page._songs.slice(0, 8), at: Date.now()};
      if(i >= 0) all[i] = rec; else all.push(rec);
      if(!diSave(all)){ toast('저장 공간이 부족해 일기를 저장하지 못했습니다.'); return; }
    }
    const sv = document.getElementById('diSaved');
    if(sv) sv.textContent = empty ? '' : t('저장됨');
    const del = document.getElementById('diDel'); if(del) del.style.display = empty ? 'none' : '';
    // 목록 줄만 고친다(편집 중인 칸을 다시 그리면 커서가 튄다)
    const it = document.querySelector('#shelfMain .ditem[data-di-day="' + _di.sel + '"]');
    if(!it || empty) diListRefresh();
    else { const sp = it.querySelector('span'); if(sp) sp.textContent = (text.split('\n').find(l => l.trim()) || '').slice(0, 60); }
    shelfCounts();
  };
  if(now) go(); else _di.t = setTimeout(go, 400);
}
function diListRefresh(){
  const page = document.querySelector('#shelfMain .dpage');
  const keep = page ? {v: page.querySelector('#diText').value, s: page._songs, pos: page.querySelector('#diText').selectionStart} : null;
  renderShelf();
  const np = document.querySelector('#shelfMain .dpage');
  if(np && keep){ const ta = np.querySelector('#diText'); ta.value = keep.v; np._songs = keep.s; diSongsDraw(np);
    if(document.activeElement === document.body){ try{ ta.focus(); ta.setSelectionRange(keep.pos, keep.pos); }catch(e){} } }
}
function diGo(d){
  const page = document.querySelector('#shelfMain .dpage');
  if(page) diStore(page, true);
  _di.sel = d;
  renderShelf();
}

/* 백업 — 연습 기록장·일기장을 「전체 백업 복사」에 싣고, 불러올 때 합친다(같은 id·같은 날은 새것이 이긴다) */
function journalBackup(){
  const p = plLoad(), d = diLoad();
  return (p.length || d.length) ? {plog: p, diary: d} : null;
}
function journalImport(text){
  text = String(text || '');
  const tag = BACKUP_TAGS.find(tag => text.includes(tag)) || BACKUP_TAG;
  const i = text.indexOf(tag);
  if(i < 0) return 0;
  let o = null; try{ o = JSON.parse(text.slice(i + tag.length).trim()); }catch(e){ return 0; }
  if(!o || typeof o !== 'object') return 0;
  let n = 0;
  if(Array.isArray(o.plog) && o.plog.length){
    const mine = plLoad(), map = new Map(mine.map(x => [x.id, x]));
    o.plog.forEach(x => { if(x && typeof x.id === 'string' && /^\d{4}-\d\d-\d\d$/.test(x.d)){
      const old = map.get(x.id); if(!old || (+x.at || 0) > old.at){ map.set(x.id, x); n++; } } });
    lsSet(PLOG_KEY, JSON.stringify({v:1, s:[...map.values()]}));
    plSave(plLoad());                         // 접기·정렬을 한 번 거친다
  }
  if(Array.isArray(o.diary) && o.diary.length){
    const mine = diLoad(), map = new Map(mine.map(x => [x.d, x]));
    o.diary.forEach(x => { if(x && /^\d{4}-\d\d-\d\d$/.test(x.d)){
      const old = map.get(x.d); if(!old || (+x.at || 0) > old.at){ map.set(x.d, x); n++; } } });
    lsSet(DIARY_KEY, JSON.stringify({v:1, e:[...map.values()]}));
    diSave(diLoad());
  }
  return n;
}

(function initJournal(){
  if(!SHELF_ON){ const p = document.getElementById('plogPop'); if(p) p.remove(); return; }
  const main = document.getElementById('shelfMain');
  /* 클릭 — 연습 기록장 */
  main.addEventListener('click', e=>{
    const T = e.target;
    let b;
    if((b = T.closest('[data-pl-tab]'))){ _pl.tab = b.dataset.plTab; _pl.sel = ''; renderShelf(); return; }
    if((b = T.closest('[data-pl-nav]'))){
      const k = +b.dataset.plNav, a = _pl.at || new Date();
      _pl.sel = '';
      if(!k) _pl.at = new Date();
      else if(_pl.tab === 'week') _pl.at = jAdd(a, 7 * k);
      else if(_pl.tab === 'month') _pl.at = new Date(a.getFullYear(), a.getMonth() + k, 1);
      else _pl.at = new Date(a.getFullYear() + k, 0, 1);
      renderShelf(); return;
    }
    if((b = T.closest('[data-pl-add]'))){ plOpen(null, b.dataset.plAdd || null); return; }
    if((b = T.closest('[data-pl-edit]'))){ plOpen(b.dataset.plEdit); return; }
    if((b = T.closest('[data-pl-day]'))){
      const d = b.dataset.plDay;
      if(_pl.tab === 'year'){ _pl.tab = 'month'; _pl.at = jDate(d); _pl.sel = d; }
      else _pl.sel = (_pl.sel === d ? '' : d);
      renderShelf(); return;
    }
    if((b = T.closest('[data-pl-month]'))){ _pl.tab = 'month'; _pl.at = new Date((_pl.at || new Date()).getFullYear(), +b.dataset.plMonth, 1); _pl.sel = ''; renderShelf(); return; }
    if((b = T.closest('.jsong, .dsopen'))){
      const id = b.dataset.song;
      if(lib.songs.some(s => s.id === id)) openReader(id, null);
      else toast('라이브러리에 없는 곡입니다. 지운 곡일 수 있습니다.');
      return;
    }
    /* 일기장 */
    if((b = T.closest('[data-di-day]'))){ diGo(b.dataset.diDay); return; }
    if(T.closest('[data-di-today]')){ diGo(jToday()); return; }
    if((b = T.closest('[data-di-rm]'))){
      const page = b.closest('.dpage'); page._songs.splice(+b.dataset.diRm, 1); diSongsDraw(page); diStore(page, true); return;
    }
    if(T.closest('#diDel')){
      appAsk(t('{d} 일기를 지울까요?').replace('{d}', jLabel(_di.sel, true)), '삭제').then(ok=>{
        if(!ok) return;
        diSave(diLoad().filter(x => x.d !== _di.sel));
        renderShelf();
      });
    }
  });
  main.addEventListener('input', e=>{
    if(e.target.id === 'diText'){ const sv = document.getElementById('diSaved'); if(sv) sv.textContent = ''; diStore(e.target.closest('.dpage'), false); }
  });
  main.addEventListener('change', e=>{
    if(e.target.id === 'diSongAdd' && e.target.value){
      const page = e.target.closest('.dpage'), s = lib.songs.find(x => x.id === e.target.value);
      if(s){ page._songs.push({id: s.id, title: s.title || ''}); diSongsDraw(page); diStore(page, true); }
    }
    if(e.target.id === 'diDate' && e.target.value) diGo(e.target.value);
  });
  main.addEventListener('focusout', e=>{ if(e.target.id === 'diText') diStore(e.target.closest('.dpage'), true); });

  /* 기록 창 */
  const pop = document.getElementById('plogPop');
  document.getElementById('plMoods').addEventListener('click', e=>{
    const b = e.target.closest('[data-mood]'); if(!b) return;
    pop._mood = (pop._mood === +b.dataset.mood) ? 0 : +b.dataset.mood;   // 다시 누르면 뺀다
    plSync();
  });
  document.getElementById('plSongs').addEventListener('click', e=>{
    const b = e.target.closest('[data-rm]'); if(!b) return;
    pop._songs.splice(+b.dataset.rm, 1); plSync();
  });
  document.getElementById('plSongAdd').addEventListener('change', e=>{
    const s = lib.songs.find(x => x.id === e.target.value);
    if(s && pop._songs.length < 8) pop._songs.push({id: s.id, title: s.title || ''});
    plSync();
  });
  document.getElementById('plSave').onclick = plCommit;
  document.getElementById('plDel').onclick = plDelete;
  const close = ()=> pop.classList.remove('is-open');
  document.getElementById('plCancel').onclick = close;
  pop.addEventListener('click', e=>{ if(e.target === pop) close(); });
  pop.addEventListener('keydown', e=>{
    if(e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); close(); }
    else if(e.key === 'Enter' && (e.metaKey || e.ctrlKey)){ e.preventDefault(); plCommit(); }
  });
})();

/* ================= 악보 보기 + 메모 — 라이브러리에서 곡을 누르면 (PC 스튜디오, 2026-10-20) =================
   사용자 요청: "라이브러리에서 악보를 클릭했을 때 악보만 보이게 하고, 악보 전체에 메모를 할 수 있게".

   **보이는 것은 인쇄용 페이지 그대로다**(exportPages — A4, 줄마디는 「저장 → 출력」 설정). 편집기 패널·입력판·독이 없다.
   **메모는 악보 위 한 겹**이다. 펜·형광펜·글 메모·지우개. 악보 기보(paint)는 한 글자도 안 바뀐다 —
   PDF·PNG·영상·편집 화면에는 메모가 안 실리고, 이 화면과 여기서 하는 「메모째 인쇄」에만 나온다.

   ★ 저장 — **마디에 묶는다**(펜슬 메모 m.ink와 같은 생각, CLAUDE.md 8-16). 페이지 좌표로 두면 마디를 더하거나
   줄마디를 바꾸는 순간 메모가 엉뚱한 자리에 뜬다. 획·글은 **가장 가까운 마디**의 소속이고
     x = 마디 폭의 비율(fx), y = 오선 칸(LG) 단위(fy)
   로 담는다. 펜슬 메모와 달리 **범위를 넓게 연다**(fx −4~5, fy −60~60) — 제목 옆·여백·단 사이 어디든 "악보 전체"에 쓴다.
     m.memo = [{k:'p'|'h', p:[[fx,fy],…], c, w} | {k:'t', x:fx, y:fy, t:'글', c}]
   measures 안에 있으니 **되돌리기·자동 저장·파일 저장·마디 옮기기**를 저절로 따라간다(commit 한 번).
   복사·복제는 책갈피처럼 떼고 간다.

   이 구역의 상태도 전부 var — 위쪽 함수들이 부팅 중에 먼저 불릴 수 있다([[tdz]]). */
var _rd = {open:false, id:'', tool:'view', col:{p:'red', h:'yel', t:'blue'}, w:1, hide:false,
           zoom:1, pos:[], pages:[], draw:null, edit:null};
var RD_COL = {red:'#E0382F', blue:'#2F6FE0', green:'#1E9E58', ink:'', yel:'#FFD83D', lime:'#9BE15D', pink:'#FF8FB8', sky:'#7CC8FF'};
var RD_PAL = {p:['red','blue','green','ink'], h:['yel','lime','pink','sky'], t:['blue','red','green','ink']};
var RD_LIM = {items:80, pts:400, text:200};

function rdColor(c){ return c === 'ink' || !RD_COL[c] ? INK : RD_COL[c]; }
function readerIsOpen(){ return _rd.open; }

/* 곡을 지금 곡으로 열고(편집기 뒤편), 페이지만 보이는 창을 덮는다 */
function openReader(id, mi){
  if(!SHELF_ON) return;
  if(id !== lib.cur) openSong(id);
  if(lib.cur !== id) return;                       // 못 열었다 — openSong이 이유를 말했다
  shelfTouch(id);
  if(playing) stopPlay();
  if(mi != null && measures[mi]){ selMeasure = mi; selEnd = mi; cursorB = 0; cursorK = 0; }
  _rd.open = true; _rd.id = id;
  track('reader');
  document.getElementById('reader').classList.add('is-open');
  rdRender();
  if(mi != null) rdScrollTo(mi, true);
  else document.getElementById('rdPages').scrollTop = 0;
}
function closeReader(toEditor){
  if(!_rd.open) return;
  rdEditDone(false);
  _rd.open = false;
  document.getElementById('reader').classList.remove('is-open');
  document.getElementById('rdPages').innerHTML = '';
  if(playing) stopPlay();
  if(toEditor){
    closeShelf();
    refreshAll();
    scrollScoreTo(selMeasure, true);
  } else if(shelfIsOpen()) renderShelf();        // 메모 수가 카드에 반영되게
}

/* 페이지를 굽는다. exportPages가 페이지마다 마디 자리(pos)를 같이 돌려준다 —
   메모를 그 자리에 얹는다. 끝에서 renderScore()를 부르므로 편집 화면 상태는 안 흔들린다 */
function rdRender(){
  const box = document.getElementById('rdPages');
  const keep = box.scrollTop;
  box.innerHTML = '';
  const pos = [];
  const pages = exportPages(perLineOut(), 0, pos);
  _rd.pos = pos; _rd.pages = [];
  pages.forEach((sv, pi)=>{
    const w = +sv.getAttribute('width') || 595, h = +sv.getAttribute('height') || 842;
    if(!sv.getAttribute('viewBox')) sv.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    sv.removeAttribute('width'); sv.removeAttribute('height');
    sv.classList.add('rd-svg');
    const page = document.createElement('div');
    page.className = 'rd-page';
    page.dataset.pi = pi;
    page.style.aspectRatio = w + ' / ' + h;
    const ov = document.createElementNS(SVG_NS, 'svg');
    ov.setAttribute('viewBox', sv.getAttribute('viewBox'));
    ov.setAttribute('class', 'rd-ov');
    ov.setAttribute('data-no-i18n', '');
    const no = document.createElement('span');
    no.className = 'rd-no'; no.textContent = (pi + 1) + ' / ' + pages.length;
    page.append(sv, ov, no);
    box.appendChild(page);
    _rd.pages.push({page, ov});
  });
  rdZoomApply();
  rdDrawAll();
  box.scrollTop = keep;
  rdSyncUI();
}

/* 마디 자리 → 페이지 좌표 */
function rdXY(L, fx, fy){ return [L.x0 + fx * L.w, L.top + fy * LG]; }

/* 메모 한 겹 다시 그리기. 숨김이면 책갈피 리본만 */
function rdDrawPage(pi){
  const P = _rd.pages[pi]; if(!P) return;
  const ov = P.ov, pos = _rd.pos[pi] || [];
  ov.innerHTML = '';
  for(const k in pos){
    const mi = +k, L = pos[k], m = measures[mi];
    if(!L || !m) continue;
    if(typeof m.bm === 'string'){
      const x = L.x0 + Math.max(10, L.w) - 14, y = L.top - 19;
      ov.appendChild(el('path', {d:'M' + x.toFixed(1) + ' ' + y.toFixed(1) + 'h9v14l-4.5-3.6l-4.5 3.6z',
        fill:'#E33B32', class:'rd-bm'}));
    }
    if(_rd.hide || !Array.isArray(m.memo)) continue;
    m.memo.forEach((it, i)=> rdDrawItem(ov, L, it, mi, i));
  }
}
function rdDrawItem(g, L, it, mi, i){
  if(it.k === 't'){
    const xy = rdXY(L, it.x, it.y);
    const fs = 2.1 * LG;
    const lines = String(it.t || '').split('\n');
    const tx = el('text', {x: xy[0].toFixed(1), y: (xy[1] + fs * 0.85).toFixed(1), 'font-size': fs.toFixed(1),
      fill: rdColor(it.c), 'font-weight': 600, class: 'rd-t', 'data-mi': mi, 'data-i': i,
      'font-family': 'Pretendard Variable, Pretendard, system-ui, sans-serif'});
    lines.forEach((ln, j)=>{
      const sp = el('tspan', {x: xy[0].toFixed(1), dy: j ? (fs * 1.25).toFixed(1) : 0});
      sp.textContent = ln || ' ';
      tx.appendChild(sp);
    });
    g.appendChild(tx);
    /* 뒤판 — 악보 위에서 글이 읽히게 반투명 종이를 깐다(글을 그린 뒤 크기를 재서) */
    try{
      const bb = tx.getBBox();
      if(!bb || !bb.width) throw 0;              // 문서 밖(인쇄용 페이지)에서는 잴 수 없다 — 뒤판 없이
      const bg = el('rect', {x:(bb.x - 4).toFixed(1), y:(bb.y - 3).toFixed(1), width:(bb.width + 8).toFixed(1),
        height:(bb.height + 6).toFixed(1), rx:4, fill:'#FFF8C8', opacity:0.82, class:'rd-tbg'});
      g.insertBefore(bg, tx);
    }catch(e){}
    return;
  }
  if(!Array.isArray(it.p) || it.p.length < 1) return;
  const pts = it.p.map(q => rdXY(L, q[0], q[1]));
  let d = 'M' + pts[0][0].toFixed(1) + ' ' + pts[0][1].toFixed(1);
  if(pts.length === 1) d += 'l0.1 0';
  for(let j = 1; j < pts.length - 1; j++){
    d += 'Q' + pts[j][0].toFixed(1) + ' ' + pts[j][1].toFixed(1) + ' '
       + ((pts[j][0] + pts[j+1][0]) / 2).toFixed(1) + ' ' + ((pts[j][1] + pts[j+1][1]) / 2).toFixed(1);
  }
  if(pts.length > 1) d += 'L' + pts[pts.length-1][0].toFixed(1) + ' ' + pts[pts.length-1][1].toFixed(1);
  const hl = it.k === 'h';
  g.appendChild(el('path', {d, fill:'none', stroke: rdColor(it.c),
    'stroke-width': hl ? (it.w === 2 ? 2.6 : 1.7) * LG : (it.w === 2 ? 0.42 : 0.24) * LG,
    'stroke-linecap':'round', 'stroke-linejoin':'round', opacity: hl ? 0.55 : 0.95,
    class: hl ? 'rd-h' : 'rd-p', 'data-mi': mi, 'data-i': i}));
}
function rdDrawAll(){ _rd.pages.forEach((_, pi)=> rdDrawPage(pi)); }

/* 가장 가까운 마디 — 마디 상자(오선 4칸 높이)까지의 거리. 같은 페이지 안에서만 찾는다 */
function rdNearest(pi, x, y){
  const pos = _rd.pos[pi] || [];
  let best = -1, bd = Infinity;
  for(const k in pos){
    const L = pos[k]; if(!L || !L.w) continue;
    const dx = x < L.x0 ? L.x0 - x : (x > L.x0 + L.w ? x - L.x0 - L.w : 0);
    const dy = y < L.top ? L.top - y : (y > L.top + 4*LG ? y - L.top - 4*LG : 0);
    const dd = dx*dx + dy*dy;
    if(dd < bd){ bd = dd; best = +k; }
  }
  return best;
}
function rdRel(L, x, y){
  return [Math.round(Math.max(-4, Math.min(5, (x - L.x0) / L.w)) * 1000) / 1000,
          Math.round(Math.max(-60, Math.min(60, (y - L.top) / LG)) * 100) / 100];
}
function rdToSvg(ov, cx, cy){
  const ctm = ov.getScreenCTM(); if(!ctm) return null;
  const p = new DOMPoint(cx, cy).matrixTransform(ctm.inverse());
  return [p.x, p.y];
}

/* 메모 하나를 마디에 담는다. 마디마다 상한(80) — 넘치면 알린다 */
function rdAdd(mi, item){
  const m = measures[mi]; if(!m) return false;
  if(!m.memo) m.memo = [];
  if(m.memo.length >= RD_LIM.items){ toast('한 마디에 담을 수 있는 메모(80개)가 가득 찼습니다.'); return false; }
  m.memo.push(item);
  commit();
  track('memo-' + item.k);
  return true;
}
function rdRemove(mi, i){
  const m = measures[mi]; if(!m || !m.memo || !m.memo[i]) return;
  m.memo.splice(i, 1);
  if(!m.memo.length) delete m.memo;
}

/* 지우개 — 누른 자리 근처의 획·글을 지운다(끌면서 여러 개). 한 번 누르고 뗄 때 commit 한 번 */
function rdEraseAt(pi, x, y){
  const pos = _rd.pos[pi] || [], R = 1.2 * LG;
  let hit = false;
  for(const k in pos){
    const mi = +k, L = pos[k], m = measures[mi];
    if(!L || !m || !m.memo) continue;
    for(let i = m.memo.length - 1; i >= 0; i--){
      const it = m.memo[i];
      if(it.k === 't'){
        const node = _rd.pages[pi].ov.querySelector('text[data-mi="' + mi + '"][data-i="' + i + '"]');
        if(!node) continue;
        const bb = node.getBBox();
        if(x >= bb.x - 4 && x <= bb.x + bb.width + 4 && y >= bb.y - 3 && y <= bb.y + bb.height + 3){ rdRemove(mi, i); hit = true; }
        continue;
      }
      const near = (it.p || []).some(q => { const p = rdXY(L, q[0], q[1]); return (p[0]-x)*(p[0]-x) + (p[1]-y)*(p[1]-y) <= R*R; });
      if(near){ rdRemove(mi, i); hit = true; }
    }
  }
  if(hit) rdDrawPage(pi);
  return hit;
}

/* ── 글 메모 편집칸 ── 페이지 위에 textarea를 띄운다. Enter = 넣기, Shift+Enter = 줄바꿈, Esc = 취소 */
function rdEditOpen(pi, x, y, mi, i){
  rdEditDone(false);                 // 쓰던 글은 넣고 넘어간다 — pointerdown을 막아 blur가 안 올 수 있다
  const P = _rd.pages[pi]; if(!P) return;
  const vb = P.ov.viewBox.baseVal, r = P.page.getBoundingClientRect();
  const sc = r.width / vb.width;
  const ta = document.createElement('textarea');
  ta.className = 'rd-ta';
  ta.maxLength = RD_LIM.text;
  ta.rows = 1;
  ta.placeholder = t('메모를 쓰고 Enter');
  ta.style.left = (x * sc) + 'px';
  ta.style.top = (y * sc) + 'px';
  ta.style.fontSize = Math.max(12, 2.1 * LG * sc) + 'px';
  const old = (mi != null && measures[mi] && measures[mi].memo) ? measures[mi].memo[i] : null;
  const col = old ? old.c : _rd.col.t;
  ta.style.color = rdColor(col);
  if(old){ ta.value = old.t || ''; }
  P.page.appendChild(ta);
  _rd.edit = {pi, x, y, mi: old ? mi : null, i: old ? i : null, ta, col};
  const fit = ()=>{ ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; };
  ta.addEventListener('input', fit);
  // Enter(넣기)·Esc(취소)는 readerKey가 받는다 — capture 단계에서 키를 막으므로 여기까지 안 온다
  /* 자기 칸일 때만 닫는다 — 앞 칸이 지워지며 늦게 온 blur가 **새로 연 칸을 빈 채로 닫는** 경주가 있었다(검사에서 잡음) */
  ta.addEventListener('blur', ()=> setTimeout(()=>{ if(_rd.edit && _rd.edit.ta === ta) rdEditDone(false); }, 0));
  try{ ta.focus({preventScroll:true}); }catch(e){}       // 바로 — 늦게 주면 첫 글자가 몸통(body)으로 샌다
  setTimeout(fit, 0);
  if(old){                       // 고치는 동안 원래 글은 감춘다
    const node = P.ov.querySelector('text[data-mi="' + mi + '"][data-i="' + i + '"]');
    if(node){ node.style.visibility = 'hidden'; if(node.previousSibling) node.previousSibling.style.visibility = 'hidden'; }
  }
}
function rdEditDone(cancel){
  const E = _rd.edit; if(!E) return;
  _rd.edit = null;
  const txt = E.ta.value.replace(/\s+$/, '').slice(0, RD_LIM.text);
  E.ta.remove();
  if(cancel){ rdDrawPage(E.pi); return; }
  if(E.mi != null){                                   // 고치기 — 비우면 지운다
    const m = measures[E.mi];
    if(m && m.memo && m.memo[E.i]){
      if(txt.trim()) m.memo[E.i].t = txt; else rdRemove(E.mi, E.i);
      commit();
    }
  } else if(txt.trim()){
    const mi = rdNearest(E.pi, E.x, E.y);
    const L = (_rd.pos[E.pi] || [])[mi];
    if(L){ const r = rdRel(L, E.x, E.y); rdAdd(mi, {k:'t', x:r[0], y:r[1], t:txt, c:E.col}); }
  }
  rdDrawPage(E.pi);
  rdSyncUI();
}

/* ── 포인터 — 도구에 따라 긋기·글·지우기. 보기 도구일 때는 아무것도 안 잡는다(스크롤·선택 그대로) ── */
function rdPointerDown(e){
  if(_rd.tool === 'view' || e.button > 0) return;
  const page = e.target.closest('.rd-page'); if(!page) return;
  if(e.target.closest('.rd-ta')) return;
  const pi = +page.dataset.pi, P = _rd.pages[pi];
  const p = rdToSvg(P.ov, e.clientX, e.clientY); if(!p) return;
  e.preventDefault();
  if(_rd.tool === 'text'){
    const hit = e.target.closest && e.target.closest('text.rd-t');
    if(hit){ rdEditOpen(pi, 0, 0, +hit.dataset.mi, +hit.dataset.i); rdEditMove(pi, +hit.dataset.mi, +hit.dataset.i); }
    else rdEditOpen(pi, p[0], p[1]);
    return;
  }
  if(_rd.tool === 'erase'){
    _rd.draw = {pi, id:e.pointerId, erase:true, hit: rdEraseAt(pi, p[0], p[1])};
    try{ page.setPointerCapture(e.pointerId); }catch(err){}
    return;
  }
  const k = _rd.tool === 'hl' ? 'h' : 'p';
  const c = _rd.col[k];
  const node = el('path', {d:'M' + p[0].toFixed(1) + ' ' + p[1].toFixed(1) + 'l0.1 0', fill:'none', stroke: rdColor(c),
    'stroke-width': k === 'h' ? (_rd.w === 2 ? 2.6 : 1.7) * LG : (_rd.w === 2 ? 0.42 : 0.24) * LG,
    'stroke-linecap':'round', 'stroke-linejoin':'round', opacity: k === 'h' ? 0.42 : 0.95});
  P.ov.appendChild(node);
  _rd.draw = {pi, id:e.pointerId, k, c, pts:[p], node};
  try{ page.setPointerCapture(e.pointerId); }catch(err){}
}
/* 고치는 글 메모는 원래 자리에 편집칸을 띄운다 */
function rdEditMove(pi, mi, i){
  const E = _rd.edit; if(!E) return;
  const L = (_rd.pos[pi] || [])[mi], it = measures[mi] && measures[mi].memo && measures[mi].memo[i];
  if(!L || !it) return;
  const xy = rdXY(L, it.x, it.y);
  const P = _rd.pages[pi], sc = P.page.getBoundingClientRect().width / P.ov.viewBox.baseVal.width;
  E.ta.style.left = (xy[0] * sc) + 'px'; E.ta.style.top = (xy[1] * sc) + 'px';
  E.x = xy[0]; E.y = xy[1];
}
function rdPointerMove(e){
  const D = _rd.draw; if(!D || e.pointerId !== D.id) return;
  const P = _rd.pages[D.pi];
  const p = rdToSvg(P.ov, e.clientX, e.clientY); if(!p) return;
  if(D.erase){ if(rdEraseAt(D.pi, p[0], p[1])) D.hit = true; return; }
  const l = D.pts[D.pts.length - 1];
  if(Math.hypot(p[0]-l[0], p[1]-l[1]) < 1.2 || D.pts.length >= RD_LIM.pts) return;
  D.pts.push(p);
  D.node.setAttribute('d', D.node.getAttribute('d') + 'L' + p[0].toFixed(1) + ' ' + p[1].toFixed(1));
}
function rdPointerUp(e){
  const D = _rd.draw; if(!D || e.pointerId !== D.id) return;
  _rd.draw = null;
  if(D.erase){ if(D.hit){ commit(); rdSyncUI(); } return; }
  D.node.remove();
  /* 획은 **첫 점에서 가장 가까운 마디**의 소속 — 줄을 넘어 그어도 한 덩어리로 움직인다 */
  const mi = rdNearest(D.pi, D.pts[0][0], D.pts[0][1]);
  const L = (_rd.pos[D.pi] || [])[mi];
  if(L){
    rdAdd(mi, {k:D.k, p: D.pts.map(q => rdRel(L, q[0], q[1])), c:D.c, w:_rd.w});
  }
  rdDrawPage(D.pi);
  rdSyncUI();
}

function rdZoomApply(){
  const box = document.getElementById('rdPages');
  const base = Math.min(980, Math.max(320, box.clientWidth - 64));
  box.style.setProperty('--rdw', Math.round(base * _rd.zoom) + 'px');
  const z = document.getElementById('rdZoom'); if(z) z.textContent = Math.round(_rd.zoom * 100) + '%';
}
function rdZoom(d){
  _rd.zoom = d === 0 ? 1 : Math.max(0.6, Math.min(2.2, Math.round((_rd.zoom + d) * 10) / 10));
  rdEditDone(false);
  rdZoomApply();
}
function rdScrollTo(mi, flash){
  for(let pi = 0; pi < _rd.pos.length; pi++){
    const L = (_rd.pos[pi] || [])[mi]; if(!L) continue;
    const P = _rd.pages[pi], box = document.getElementById('rdPages');
    const sc = P.page.getBoundingClientRect().width / P.ov.viewBox.baseVal.width;
    box.scrollTop = P.page.offsetTop + (L.top - 40) * sc - 24;
    if(flash){
      const r = el('rect', {x:L.x0 - 6, y:L.top - 24, width:L.w + 12, height:4*LG + 48, rx:8,
        fill:'#E33B32', opacity:0.14, class:'rd-flash'});
      P.ov.insertBefore(r, P.ov.firstChild);
      setTimeout(()=> r.remove(), 1600);
    }
    return;
  }
}

function rdSetTool(tool){
  rdEditDone(false);
  _rd.tool = tool;
  rdSyncUI();
}
function rdMemoCount(){
  return measures.reduce((a, m)=> a + (Array.isArray(m.memo) ? m.memo.length : 0), 0);
}
function rdSyncUI(){
  const R = document.getElementById('reader'); if(!R) return;
  R.dataset.tool = _rd.tool;
  R.querySelectorAll('[data-tool]').forEach(b => { const on = b.dataset.tool === _rd.tool;
    b.classList.toggle('sel', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
  const key = _rd.tool === 'hl' ? 'h' : _rd.tool === 'text' ? 't' : 'p';
  const pal = document.getElementById('rdColors');
  pal.hidden = !(_rd.tool === 'pen' || _rd.tool === 'hl' || _rd.tool === 'text');
  if(!pal.hidden){
    pal.querySelectorAll('button[data-c]').forEach((b, j)=>{
      const c = RD_PAL[key][j];
      b.dataset.c = c; b.style.setProperty('--c', rdColor(c));
      b.classList.toggle('sel', _rd.col[key] === c);
      b.setAttribute('aria-label', t(RD_NAME[c] || c));
      b.title = t(RD_NAME[c] || c);
    });
  }
  const wb = document.getElementById('rdWidth');
  wb.hidden = !(_rd.tool === 'pen' || _rd.tool === 'hl');
  wb.setAttribute('aria-pressed', _rd.w === 2 ? 'true' : 'false');
  document.getElementById('rdHide').setAttribute('aria-pressed', _rd.hide ? 'true' : 'false');
  document.getElementById('rdUndo').disabled = !histPast.length;
  document.getElementById('rdRedo').disabled = !histFuture.length;
  const n = rdMemoCount();
  const s = lib.songs.find(x => x.id === _rd.id);
  document.getElementById('rdTitle').textContent = (s && s.title) || (document.getElementById('titleInput').value) || t('무제');
  document.getElementById('rdSub').textContent = t('{p}쪽').replace('{p}', _rd.pages.length)
    + ' · ' + t('메모 {n}개').replace('{n}', n);
  document.getElementById('rdPlay').textContent = playing ? t('■ 정지') : t('▶ 재생');
}
var RD_NAME = {red:'빨강', blue:'파랑', green:'초록', ink:'먹색', yel:'노랑', lime:'연두', pink:'분홍', sky:'하늘'};

/* 메모째 인쇄 — 늘 흰 종이(buildPrintPages와 같은 규칙). 메모를 페이지 SVG에 직접 얹어 #printArea로 */
function rdPrint(){
  rdEditDone(false);
  track('reader-print');
  printArea.innerHTML = '';
  const keepPaper = PAPER;
  PAPER = 'white'; applyPaper();
  const pos = [];
  const pages = exportPages(perLineOut(), linesPerPage(perLineOut()), pos);
  pages.forEach((sv, pi)=>{
    if(!_rd.hide){
      const g = el('g', {class:'rd-print'});
      sv.appendChild(g);
      const P = pos[pi] || [];
      for(const k in P){
        const m = measures[+k];
        if(m && Array.isArray(m.memo)) m.memo.forEach((it, i)=> rdDrawItem(g, P[k], it, +k, i));
      }
    }
    const d = document.createElement('div');
    d.className = 'page';
    d.appendChild(sv);
    printArea.appendChild(d);
  });
  PAPER = keepPaper; applyPaper(); renderScore();
  outputPrintPages();                // 웹 = window.print(정리는 afterprint) · 앱 = 네이티브 PDF (2.1)
}

/* 키보드 — 라이브러리의 capture 핸들러가 이 창이 열려 있으면 여기로 넘긴다 */
function readerKey(e){
  const tg = e.target || {};
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName || '') || tg.isContentEditable;
  if(document.querySelector('#askPop.is-open, #movePop.is-open')) return;
  if(typing){
    /* 글을 쓰는 동안에는 **아무 키도 편집기로 안 보낸다.** 편집기의 스페이스 재생은 INPUT만 비켜 가서
       textarea에 친 띄어쓰기를 삼키고 재생을 걸었다(검사에서 잡음). capture에서 막으므로
       편집칸의 Enter·Esc도 여기서 처리한다. 한글 조합 중의 Enter는 조합을 끝내는 키라 건드리지 않는다 */
    e.stopPropagation();
    if(tg.classList && tg.classList.contains('rd-ta') && !e.isComposing && e.keyCode !== 229){
      if(e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); rdEditDone(false); }
      else if(e.key === 'Escape'){ e.preventDefault(); rdEditDone(true); }
    }
    return;
  }
  e.stopPropagation();
  const k = e.key;
  if(k === 'Escape'){ e.preventDefault(); closeReader(false); return; }
  if((e.metaKey || e.ctrlKey) && (k === 'z' || k === 'Z')){
    e.preventDefault(); e.shiftKey ? redo() : undo(); rdRender(); return;
  }
  if((e.metaKey || e.ctrlKey) && (k === 'y' || k === 'Y')){ e.preventDefault(); redo(); rdRender(); return; }
  if((e.metaKey || e.ctrlKey) && (k === '=' || k === '+')){ e.preventDefault(); rdZoom(0.1); return; }
  if((e.metaKey || e.ctrlKey) && k === '-'){ e.preventDefault(); rdZoom(-0.1); return; }
  if((e.metaKey || e.ctrlKey) && k === '0'){ e.preventDefault(); rdZoom(0); return; }
  if(e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
  if(e.code === 'Space'){ e.preventDefault(); rdPlay(); return; }
  const tools = {v:'view', p:'pen', h:'hl', t:'text', e:'erase'};
  const tl = tools[k.toLowerCase()];
  if(tl){ e.preventDefault(); rdSetTool(tl); }
}
function rdPlay(){
  playBtn.click();
  setTimeout(rdSyncUI, 0);
}

(function initReader(){
  const R = document.getElementById('reader');
  if(!R) return;
  if(!SHELF_ON){ R.remove(); return; }
  document.getElementById('rdBack').onclick = ()=> closeReader(false);
  document.getElementById('rdEdit').onclick = ()=> closeReader(true);
  document.getElementById('rdPrint').onclick = rdPrint;
  document.getElementById('rdPlay').onclick = rdPlay;
  document.getElementById('rdZoomIn').onclick = ()=> rdZoom(0.1);
  document.getElementById('rdZoomOut').onclick = ()=> rdZoom(-0.1);
  document.getElementById('rdZoomFit').onclick = ()=> rdZoom(0);
  document.getElementById('rdUndo').onclick = ()=>{ undo(); rdRender(); };
  document.getElementById('rdRedo').onclick = ()=>{ redo(); rdRender(); };
  document.getElementById('rdHide').onclick = ()=>{ _rd.hide = !_rd.hide; rdEditDone(false); rdDrawAll(); rdSyncUI(); };
  document.getElementById('rdWidth').onclick = ()=>{ _rd.w = _rd.w === 2 ? 1 : 2; rdSyncUI(); };
  R.querySelectorAll('[data-tool]').forEach(b => b.onclick = ()=> rdSetTool(b.dataset.tool));
  document.getElementById('rdColors').addEventListener('click', e=>{
    const b = e.target.closest('button[data-c]'); if(!b) return;
    const key = _rd.tool === 'hl' ? 'h' : _rd.tool === 'text' ? 't' : 'p';
    _rd.col[key] = b.dataset.c;
    rdSyncUI();
  });
  document.getElementById('rdClear').onclick = ()=>{
    const n = rdMemoCount();
    if(!n){ toast('지울 메모가 없습니다.'); return; }
    appAsk(t('이 곡의 메모 {n}개를 모두 지울까요?\n되돌리기(⌘Z)로 다시 살릴 수 있습니다.').replace('{n}', n), '모두 지우기').then(ok=>{
      if(!ok) return;
      measures.forEach(m => { delete m.memo; });
      commit(); rdDrawAll(); rdSyncUI();
    });
  };
  const box = document.getElementById('rdPages');
  box.addEventListener('pointerdown', rdPointerDown);
  /* 애플 펜슬 Scribble 막기 (2.1, 앱에 켜면서) — 8-33과 같은 문제: 펜슬로 쓰면 iPadOS가 손글씨 입력으로 가로채
     pointerdown이 안 온다. 그리기 도구일 때 **스타일러스 터치만** 막는다(손가락 스크롤은 그대로) */
  const rdEatPen = e=>{
    const R = document.getElementById('reader');
    if(!R || R.dataset.tool === 'view') return;
    const t0 = e.touches && e.touches[0];
    if(t0 && t0.touchType === 'stylus' && e.target.closest && e.target.closest('.rd-ov')) e.preventDefault();
  };
  box.addEventListener('touchstart', rdEatPen, {passive:false});
  box.addEventListener('touchmove',  rdEatPen, {passive:false});
  box.addEventListener('pointermove', rdPointerMove);
  box.addEventListener('pointerup', rdPointerUp);
  box.addEventListener('pointercancel', rdPointerUp);
  /* ⌘/Ctrl + 휠 = 확대 — 브라우저 전체 확대 대신 악보만 */
  box.addEventListener('wheel', e=>{
    if(!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    rdZoom(e.deltaY < 0 ? 0.1 : -0.1);
  }, {passive:false});
  window.addEventListener('resize', ()=>{ if(_rd.open){ rdEditDone(false); rdZoomApply(); } });
})();

/* PC 스튜디오 문 — /pro로 왔는데 Studio가 안 열린 사람. 코드가 맞으면 통행증을 적고 새로 연다.
   공개 도메인(maidrum.com)은 `STUDIO_PASS_KEY`, 그 밖은 옛 열쇠 칸(`STUDIO_KEY`)에 — STUDIO_OK가 읽는 칸 그대로 */
(function initPcGate(){
  const gate = document.getElementById('pcGate');
  if(!gate) return;
  if(!PC_EDITION || STUDIO_OK){ gate.remove(); return; }
  gate.classList.add('is-open');
  track('pc-gate');
  const inp = document.getElementById('pcGateCode'), msg = document.getElementById('pcGateMsg');
  const go = ()=>{
    const v = (inp.value || '').trim();
    if(v !== STUDIO_CODE){ msg.textContent = t('코드가 맞지 않습니다.'); inp.select(); return; }
    let saved = false;
    try{
      if(STUDIO_HOST_OK) localStorage.setItem(STUDIO_KEY, '1');
      else localStorage.setItem(STUDIO_PASS_KEY, STUDIO_CODE);
      saved = true;
    }catch(e){}
    if(!saved){ msg.textContent = t('이 브라우저는 저장이 막혀 있어 코드를 기억할 수 없습니다.'); return; }
    track('pc-gate-open');
    location.reload();
  };
  document.getElementById('pcGateGo').onclick = go;
  inp.addEventListener('keydown', e=>{ if(e.key === 'Enter'){ e.preventDefault(); go(); } });
  setTimeout(()=>{ try{ inp.focus(); }catch(e){} }, 60);
})();

/* 배너 닫기 — 기억한다. 광고를 두 번 보여 주면 그때부터는 방해물이다 */
(function(){
  const x = document.getElementById('padPromoX');
  if(x) x.onclick = ()=>{
    PROMO_OFF = true;
    try{ localStorage.setItem(PROMO_KEY, '1'); }catch(e){}
    syncPadPromo(window.innerWidth);
  };
  const go = document.getElementById('padPromoGo');
  if(go) go.addEventListener('click', ()=> track('promo-pad'));
  const gp = document.getElementById('padPromoPlay');
  if(gp) gp.addEventListener('click', ()=> track('promo-play'));
  /* 안드로이드 방문자에게는 Google Play가 앞·라임 (2026-10-07) */
  if(go && gp && /Android/i.test(navigator.userAgent)){
    go.parentNode.insertBefore(gp, go);
    gp.classList.remove('alt'); go.classList.add('alt');
  }
})();

/* ── 스토어 홍보 팝업 (2026-10-07) ──────────────
   사람당 한 번. 닫거나 스토어로 가면 다시 안 뜬다.
   안 뜨는 곳: 앱(통째로 뗀다) · Studio 열쇠 · 배너를 이미 닫은 사람(관심 없다고 말한 셈) ·
   저장소가 막힌 브라우저(기억을 못 하니 새로 고칠 때마다 뜨게 된다).
   다른 창이 열려 있으면 그게 닫힐 때까지 기다린다 — 작업 중인 창 위에 겹치지 않는다. */
const STORE_POP_KEY = 'maidrum.pop.store';
const STORE_POP_DELAY = 30000;          // 첫 화면은 막지 않는다 — 30초 써 본 뒤에
(function initStorePop(){
  // Personal workspace: original store promotion is intentionally not initialized.
  return;
  const pop = document.getElementById('storePop');
  if(!pop) return;
  if(IS_NATIVE){ pop.remove(); return; }
  const app = document.getElementById('storeApp');
  const play = document.getElementById('storePlay');
  if(/Android/i.test(navigator.userAgent)){
    app.parentNode.insertBefore(play, app);
    play.classList.add('main'); app.classList.remove('main');
  }
  const remember = ()=>{ try{ localStorage.setItem(STORE_POP_KEY, '1'); }catch(e){} };
  const close = ()=>{ pop.classList.remove('is-open'); remember(); };
  document.getElementById('storeClose').onclick = close;
  pop.addEventListener('click', e=>{ if(e.target === pop) close(); });
  document.addEventListener('keydown', e=>{
    if(e.key === 'Escape' && pop.classList.contains('is-open')) close();
  });
  app.addEventListener('click', ()=>{ track('storepop-app'); close(); });
  play.addEventListener('click', ()=>{ track('storepop-play'); close(); });
  /* 언어 (2026-10-07) — **해외에서 접속하면 영어.** 화면 언어(LANG)는 기기 언어를 따르므로
     기기가 한국어면 해외에서도 한국어다. 이 창만은 접속 지역을 본다.
     서버가 없어 IP로는 못 보고, 기기 시간대가 Asia/Seoul이 아니면 해외로 친다.
     설정에서 한국어를 **직접 고른** 사람에게는 한국어. `file:`(검사)은 `?abroad`일 때만 해외로 본다. */
  function storePopLang(){
    if(LANG === 'en') return 'en';
    let chose = null; try{ chose = localStorage.getItem(LANG_KEY); }catch(e){}
    if(chose === 'ko') return 'ko';
    let tz = ''; try{ tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; }catch(e){}
    const real = location.protocol !== 'file:' || /[?&]abroad\b/.test(location.search);
    return (real && tz && tz !== 'Asia/Seoul') ? 'en' : 'ko';
  }
  const KO_SRC = new Map();
  function fillStorePop(){
    const en = storePopLang() === 'en';
    pop.querySelectorAll('[data-i18n-html]').forEach(el=>{
      if(!KO_SRC.has(el)) KO_SRC.set(el, el.innerHTML);
      const v = en ? EN_HTML[el.getAttribute('data-i18n-html')] : KO_SRC.get(el);
      if(v) el.innerHTML = v;
    });
    pop.querySelectorAll('[data-sp]').forEach(el=>{
      if(!KO_SRC.has(el)) KO_SRC.set(el, el.textContent);
      const v = en ? EN[KO_SRC.get(el)] : KO_SRC.get(el);
      if(v) el.textContent = v;
    });
    pop.setAttribute('aria-label', en ? '따쿵따다둥 apps' : '따쿵따다둥 앱 안내');
    pop.lang = en ? 'en' : 'ko';
    return en;
  }
  fillStorePop();
  window.openStorePop = ()=>{ fillStorePop(); pop.classList.add('is-open'); };

  let seen = true;
  try{ seen = localStorage.getItem(STORE_POP_KEY) === '1'; }catch(e){}
  if(STUDIO_OK || PROMO_OFF || seen) return;
  setTimeout(function tryOpen(){
    if(PROMO_OFF) return;                 // 기다리는 사이 배너를 닫았다 — 관심 없다는 뜻
    if(document.hidden || document.querySelector('.pop.is-open')){ setTimeout(tryOpen, 5000); return; }
    track(fillStorePop() ? 'storepop-show-en' : 'storepop-show');
    pop.classList.add('is-open');
  }, STORE_POP_DELAY);
})();

let _per = null;
window.addEventListener('resize', ()=>{
  applyEdition();
  renderScore();
  const p = window.innerWidth >= 700;
  if(p !== _per){ _per = p; buildGrid(); }
  scrollScoreTo(selMeasure, true);
});
buildGrid(); refreshChips();
_per = window.innerWidth >= 700;

/* ── 앱에서 링크 열기 (2026-08-17) ────────────────────────
   `target="_blank"`는 앱에서 아무 일도 하지 않는다. 그리고 `/privacy.html` 같은
   내부 문서로 그냥 넘어가면 **돌아올 길이 없다** — 앱에는 브라우저 뒤로가기가 없다.
   그래서 앱에서는 모든 바깥 링크를 Safari 시트로 넘긴다.
   내부 문서는 배포 URL로 바꿔 보낸다(`vercel.json`이 `cleanUrls`라 `.html`을 뗀다). */
/* ================= 메트로놈 탭 엔진 (2026-08-28) =================
   곡 재생(tick/startPlay)과 **완전히 독립**된 시계다. 같은 lookahead 방식
   (setInterval 25ms + AudioContext 시계 0.12초 선예약)을 쓰되 상태를 하나도
   안 나눠 갖는다 — 전역 bpm도 안 쓴다(곡 BPM과 메트로놈 BPM은 딴 값이다).
   두 시계가 동시에 도는 길은 셋 다 막았다: 탭을 떠나면 showMetroPanel(false)이
   끄고, startPlay가 metroStop을 부르고, 스페이스 키는 is-metro에서 이쪽으로 온다.

   리서치(2026-08-28): Tempo(Frozen Ape)=박별 강세·자동 템포·코치(무음 마디),
   Gap Click(Benny Greb)=갭 트레이너, Soundbrenner=무음 트레이너·점진 템포,
   Pro Metronome=분할·강세 편집. 여기 다 있다. 전부 무료(사용자 결정).
   화면 문법은 Tempo, 카운팅이 주인공이다(2026-08-28 사용자 요청 2건):
   ① 화면을 가득 채우는 카운팅 사각형 — 현재 박 패드가 통째로 빛나고 숫자가
      크게 튀었다 줄어든다("멀리서도 카운팅이 확실히 보이게")
   ② 사각형을 누르면 그 박의 소리를 고르는 창 — 강세·보통·약하게·뮤트에
      드러머용 고스트·림(크로스 스틱)·하이햇까지

   2026-08-29 블루픽(bluepick.app, 드럼어스) 리서치 반영 4건 — metronome/BLUEPICK.md:
   연습 기록 합산(본편 자산 재활용) · 항상 화면 켬 · 패닝 · 분할 점.
   B항목(2026-08-29): 연음 5·6·7 · 리듬꼴 클릭(16분 그리드에 쉼표 — 우리 그리드 언어로
   그린다, 악보 기호가 아니라) · Basic/Full 토글.

   TDZ 주의: 이 IIFE는 최상위에서 즉시 돈다. 즉시 읽는 것은 DOM과 localStorage뿐이고
   위쪽 것은 함수 선언(ac·bus·clickTone·voiceBuf·releaseAfter·stopPlay·t)이라 안전하다. */
(function metroTab(){
  const mm = document.getElementById('metroMode');
  if(!mm) return;
  const $m = id => document.getElementById(id);

  const MKEY = 'maidrum.metro.v1';
  const DEF = { bpm:120, num:4, den:4, sub:1, sound:'click', flash:true,
                pan:'C', wake:true, fig:null, ui:'full', barVoice:false,
                beats:['accent','normal','normal','normal'],
                gapOn:false, gapPlay:4, gapMute:2,
                autoOn:false, autoEvery:4, autoStep:5, autoGoal:160,
                /* 2026-10-08 리서치 5건 — countIn: 카운트인 마디(0~2, Tempo·Soundbrenner), randMute: 박마다
                   무음 확률 %(Time Guru·PolyNome Gap Click), stopOn/stopBars: N마디 후 자동 정지(Tempo 트래커·
                   Pro Metronome Stage) — 곡의 길이이기도 하다. setAuto: 세트리스트 자동 진행(기기 설정, 곡 설정 아님) */
                countIn:0, randMute:0, stopOn:false, stopBars:32, setAuto:false,
                lag:0,   /* 화면 지연 보정 ms(기기 설정 — 세트리스트에 안 담는다, 2.1) */
                /* 2026-10-08 B·C — vol: 메트로놈 볼륨(기기), bal: 약박 세기 %(강세 밸런스, 곡), poly: 마디당 폴리리듬
                   N(0=끔, 곡), map: 마디별 박자표 [[num,den],…](악보에서 가져오기, 곡) — 도는 동안 S.num/den을 몰고 간다 */
                vol:100, bal:62, poly:0, map:null };
  let S = Object.assign({}, DEF);
  try{
    const raw = localStorage.getItem(MKEY);
    if(raw){ const p = JSON.parse(raw); if(p && typeof p === 'object') S = Object.assign({}, DEF, p); }
  }catch(e){}
  if(Array.isArray(S.acc)){   // v1 이관 — 옛 강세 숫자(3/2/1/0)를 소리 종류로
    S.beats = S.acc.map(a => a === 3 ? 'accent' : a === 2 ? 'normal' : a === 1 ? 'soft' : 'mute');
    delete S.acc;
  }
  let saveT = 0;
  function save(){
    clearTimeout(saveT);
    saveT = setTimeout(()=>{ try{ localStorage.setItem(MKEY, JSON.stringify(S)); }catch(e){} }, 300);
  }

  /* 겹박자(6/8·9/8·12/8)는 점4분이 한 박이고 분할은 셋잇단으로 굳는다 — Tempo와
     같은 해석이다. 홑박자는 분모와 무관하게 BPM이 곧 클릭이다(5/8은 8분음표=한 클릭). */
  const compound    = ()=> S.den === 8 && S.num % 3 === 0;
  const beatsPerBar = ()=> compound() ? S.num / 3 : S.num;
  function subOffsets(){
    if(compound()) return [0, 1/3, 2/3];
    if(S.sub === 'sw') return [0, 2/3];            // 셔플 — 뒤 8분을 셋잇단 셋째 자리로
    const n = Math.max(1, Math.min(7, S.sub|0)), a = [];
    for(let i=0;i<n;i++) a.push(i/n);
    return a;
  }
  /* ── 박 소리 종류 (2026-08-28 사용자 요청) ──
     강세 숫자 대신 박마다 소리를 고른다 — 강세·보통·약하게·뮤트에 더해
     드러머용 고스트·림(크로스 스틱)·하이햇. 사각형을 누르면 고르는 창이 뜬다. */
  const BTYPES = ['accent','normal','soft','mute','ghost','rim','hihat'];
  const BT_LABEL = {accent:'강세', normal:'보통', soft:'약하게', mute:'뮤트',
                    ghost:'고스트', rim:'림', hihat:'하이햇'};
  /* ── 리듬꼴 (블루픽 B-6) — 16분 그리드 4칸에 쉼표를 섞은 패턴.
     켜져 있으면 분할 대신 이 패턴이 클릭을 정한다: 첫 칸이 x면 그 박의 소리(강세·림…),
     나머지 칸은 서브 클릭. 첫 칸이 쉼표인 꼴(엇박 연습)은 박 소리가 안 나는 게 정체다 —
     패드 숫자와 분할 점은 계속 돌아서 눈이 박을 잡아 준다. 겹박자에서는 잠근다. */
  function figPat(i){
    /* 4글자면 모든 박에 같은 꼴, 4×박 글자면 한 마디 전체(박 i의 네 칸). 길이가 안 맞으면 꺼진 것 (2026-10-08) */
    if(compound() || !S.fig || !/^[x·]+$/.test(S.fig)) return null;
    if(S.fig.length === 4) return S.fig;
    const n = beatsPerBar();
    if(S.fig.length === 4 * n) return S.fig.substr(((i|0) % n) * 4, 4);
    return null;
  }
  function figBar(){                            // 편집용 — 마디 전체 4×박 글자(없으면 전부 쉼표)
    const n = beatsPerBar(), f = figPat(0) ? S.fig : '';
    if(f.length === 4 * n) return f;
    if(f.length === 4){ let s = ''; for(let i = 0; i < n; i++) s += f; return s; }
    return '····'.repeat(n);
  }
  function btOf(i){
    const v = S.beats[i];
    return BTYPES.indexOf(v) >= 0 ? v : (i === 0 ? 'accent' : 'normal');
  }
  function normBeats(){
    const n = beatsPerBar(), a = [];
    for(let i=0;i<n;i++) a.push(btOf(i));
    S.beats = a;
  }

  /* ── 소리 ──
     전부 bus().dry로 나간다 — 곡의 클릭과 같은 이유로 메트로놈은 드라이가 맞다.
     목소리(원·투·쓰리·포)는 voiceBuf를 직접 편다. playVoice를 안 쓰는 이유는
     그 함수의 끊는 시각이 곡 BPM(beatDur)을 읽기 때문이다 — 여기 박 길이로 끊어야
     다음 박에 정확히 멎는다. 5박 이상은 목소리가 없어서 클릭으로 받는다
     (wrap하면 원투쓰리포"원"이 되어 틀린 카운트가 된다). */
  /* ── 메트로놈 출력단 — 패닝 (블루픽 A-3) ──
     인이어로 클릭을 한쪽 귀에만 받는 드러머용. 곡 재생 소리는 건드리면 안 되므로
     bus()가 아니라 메트로놈 소리만 지나는 패너를 bus().dry 앞에 하나 둔다.
     본편 clickTone은 bus().dry에 직결이라 못 쓴다 — 같은 결의 mtClick을 여기서 만든다. */
  let MT_PAN = null, MT_GAIN = null;
  function mtOut(){
    const c = ac();
    if(!MT_PAN){
      MT_PAN = c.createStereoPanner ? c.createStereoPanner() : c.createGain();
      MT_GAIN = c.createGain();                  // 메트로놈 볼륨 — 곡 재생과 따로(2026-10-08)
      MT_PAN.connect(MT_GAIN).connect(bus().clk);
    }
    if(MT_PAN.pan) MT_PAN.pan.value = S.pan === 'L' ? -1 : S.pan === 'R' ? 1 : 0;
    MT_GAIN.gain.value = Math.max(0, Math.min(1, (S.vol|0) / 100));
    return MT_PAN;
  }
  function mtClick(t, freq, peak){             // 본편 clickTone과 같은 소리 결(사각파 + 28ms)
    const c = ac(), o = c.createOscillator(), gg = c.createGain();
    o.type = 'square'; o.frequency.value = freq;
    gg.gain.setValueAtTime(0.0001, t);
    gg.gain.linearRampToValueAtTime(peak, t + 0.0008);
    gg.gain.linearRampToValueAtTime(0.0001, t + 0.028);
    o.connect(gg).connect(mtOut()); o.start(t); o.stop(t + 0.05);
    releaseAfter(t + 0.05, [gg]);
  }
  function voiceAt(t, i){
    const buf = voiceBuf(i); if(!buf) return false;
    const c = ac(), s = c.createBufferSource(), g = c.createGain();
    s.buffer = buf;
    const st = Math.max(t - voiceLead(i), c.currentTime);
    const end = t + Math.max(0.06, 60 / S.bpm);
    g.gain.setValueAtTime(0.95, st);
    g.gain.setValueAtTime(0.95, Math.max(st, end - 0.03));
    g.gain.linearRampToValueAtTime(0.0001, end);
    s.connect(g).connect(mtOut());
    s.start(st); s.stop(end + 0.02);
    releaseAfter(end, [g]);
    return true;
  }
  function beep(t, hi, g0){
    const c = ac(), o = c.createOscillator(), og = c.createGain();
    o.type = 'sine'; o.frequency.value = hi ? 1568 : 784;
    og.gain.setValueAtTime(0.0001, t);
    og.gain.linearRampToValueAtTime(0.30*g0, t+0.002);
    og.gain.exponentialRampToValueAtTime(0.0001, t+0.07);
    o.connect(og).connect(mtOut()); o.start(t); o.stop(t+0.09);
    releaseAfter(t+0.09, [og]);
  }
  function wood(t, hi, g0){
    const c = ac(), o = c.createOscillator(), og = c.createGain();
    o.type = 'triangle';
    const f0 = hi ? 1750 : 1150;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f0*0.55, t+0.035);
    og.gain.setValueAtTime(0.0001, t);
    og.gain.linearRampToValueAtTime(0.5*g0, t+0.0015);
    og.gain.exponentialRampToValueAtTime(0.0001, t+0.055);
    o.connect(og).connect(mtOut()); o.start(t); o.stop(t+0.08);
    releaseAfter(t+0.08, [og]);
  }
  function clickAt(t, hi, g0){
    if(S.sound === 'beep') beep(t, hi, g0);
    else if(S.sound === 'wood') wood(t, hi, g0);
    else mtClick(t, hi ? 2250 : 1500, (hi ? 0.26 : 0.17) * g0);
  }
  /* 고스트·림·하이햇은 클릭 세트와 무관하게 제 소리를 낸다 — 그게 이 종류의 정체다.
     본편 SYNTH를 부르지 않고 여기서 작게 만든다: 단독 작업본(metronome.html)과
     엔진이 글자까지 같아야 해서다(셈이 주는 건 ac·bus·clickTone·voiceBuf뿐). */
  let NBUF = null;
  function nsrc(){
    const c = ac();
    if(!NBUF){
      NBUF = c.createBuffer(1, (c.sampleRate * 0.25) | 0, c.sampleRate);
      const d = NBUF.getChannelData(0);
      for(let k = 0; k < d.length; k++) d[k] = Math.random() * 2 - 1;
    }
    const s = c.createBufferSource(); s.buffer = NBUF; return s;
  }
  function ghostAt(t, g){                       // 아주 작은 스네어 — 괄호 속 유령음
    const c = ac(), n = nsrc(), f = c.createBiquadFilter(), gg = c.createGain();
    f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.9;
    gg.gain.setValueAtTime(0.0001, t);
    gg.gain.linearRampToValueAtTime(0.12 * (g || 1), t + 0.002);
    gg.gain.exponentialRampToValueAtTime(0.0001, t + 0.055);
    n.connect(f).connect(gg).connect(mtOut()); n.start(t); n.stop(t + 0.08);
    releaseAfter(t + 0.08, [gg]);
  }
  function rimAt(t, g){                         // 크로스 스틱 — 나무 딱
    const c = ac(), gg = c.createGain(); gg.gain.value = 1;
    [1750, 3300].forEach((f0, k) => {
      const o = c.createOscillator(), og = c.createGain();
      o.type = 'triangle'; o.frequency.value = f0;
      og.gain.setValueAtTime(0.0001, t);
      og.gain.linearRampToValueAtTime((k ? 0.18 : 0.4) * (g || 1), t + 0.0012);
      og.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
      o.connect(og).connect(gg); o.start(t); o.stop(t + 0.07);
    });
    gg.connect(mtOut());
    releaseAfter(t + 0.07, [gg]);
  }
  function hatAt(t, g){                         // 닫힌 하이햇 — 치칫
    const c = ac(), n = nsrc(), f = c.createBiquadFilter(), gg = c.createGain();
    f.type = 'highpass'; f.frequency.value = 6800;
    gg.gain.setValueAtTime(0.0001, t);
    gg.gain.linearRampToValueAtTime(0.32 * (g || 1), t + 0.0015);
    gg.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    n.connect(f).connect(gg).connect(mtOut()); n.start(t); n.stop(t + 0.08);
    releaseAfter(t + 0.08, [gg]);
  }
  function beatSound(t, i, muted){
    const bt = btOf(i);
    if(muted || bt === 'mute') return;
    if(bt === 'ghost'){ ghostAt(t); return; }
    if(bt === 'rim'){ rimAt(t); return; }
    if(bt === 'hihat'){ hatAt(t); return; }
    if(S.sound === 'voice' && i < 4 && voiceAt(t, i)) return;
    /* 약박 세기(S.bal %) — Time Guru의 '강세 밸런스'. 강세는 항상 1, 보통은 bal, 약하게는 그 절반 */
    const nb = Math.max(0.05, Math.min(1, (S.bal|0) / 100));
    clickAt(t, bt === 'accent', bt === 'accent' ? 1 : bt === 'soft' ? nb * 0.5 : nb);
  }
  function subSound(t, i, muted){
    if(muted) return;
    /* 하이햇·고스트·림 박은 서브 틱도 그 소리의 작은 버전으로 낸다.
       하이햇 박에 16분을 걸면 "칫-칫-칫-칫"이어야 한다 — 첫 틱만 하이햇이고
       나머지가 약한 1100Hz 클릭이면 하이햇 옆에서 사실상 안 들린다
       (2026-09-01 사용자 버그 신고: "하이햇이 첫음만 나온다"). */
    const bt = btOf(i);
    if(bt === 'hihat'){ hatAt(t, 0.55); return; }
    if(bt === 'ghost'){ ghostAt(t, 0.6); return; }
    if(bt === 'rim'){ rimAt(t, 0.45); return; }
    if(S.sound === 'beep') beep(t, false, 0.16);
    else if(S.sound === 'wood') wood(t, false, 0.2);
    else mtClick(t, 1100, 0.06);
  }

  /* ── 연습 기록 합산 (블루픽 A-1) ──
     본편의 오늘 기록(statsToday·statFlush·인증샷·연속 일수)에 메트로놈 시간을 쌓는다.
     블루픽의 핵심 고리("연습이 곧 기록")를 이미 있는 자산 재활용으로 얻는 자리다.
     단독 작업본에는 이 함수들이 없다 — HAS_STATS 가드로 조용히 넘어간다.
     ⚠ statFlush()는 끝에서 _statBpm을 **곡 BPM(전역 bpm)**으로 되돌린다.
     메트로놈이 돌 때 그 값은 남의 값이다 — 부른 직후 반드시 S.bpm으로 되잡는다. */
  const HAS_STATS = typeof statsToday === 'function' && typeof statFlush === 'function';
  function statStart(){
    if(!HAS_STATS) return;
    try{ _statT0 = Date.now(); _statBpm = S.bpm; statsToday(); }catch(e){}
  }
  function statBeat(){                         // 재생과 같은 1초 정산 리듬 (statTick과 같은 규약)
    if(!HAS_STATS || !_statT0) return;
    try{
      if(S.bpm !== _statBpm || Date.now() - _statT0 >= 1000){ statFlush(); _statBpm = S.bpm; }
    }catch(e){}
  }
  function statStop(){
    if(!HAS_STATS) return;
    try{
      statFlush(); _statBpm = S.bpm; _statT0 = 0;
      statsSave(true);
      if(typeof certSumRefresh === 'function') certSumRefresh();
      if(typeof todayRefresh === 'function') todayRefresh();
      if(typeof histDraw === 'function') histDraw();
    }catch(e){}
  }

  /* ── 항상 화면 켬 (블루픽 A-2) ──
     연습 중 화면이 꺼지면 클릭도 눈의 박도 같이 죽는다. 도는 동안만 잡고 멈추면 놓는다.
     Wake Lock API가 없는 브라우저에서는 조용히 아무 일도 안 한다. 탭을 나갔다 오면
     잠금이 풀려 있으므로 visibilitychange에서 되잡는다. */
  let WLOCK = null;
  function wakeOn(){
    if(!S.wake) return;
    try{
      if(navigator.wakeLock && navigator.wakeLock.request)
        navigator.wakeLock.request('screen').then(l=>{ WLOCK = l; }).catch(()=>{});
    }catch(e){}
  }
  function wakeOff(){
    try{ if(WLOCK){ WLOCK.release().catch(()=>{}); WLOCK = null; } }catch(e){}
  }
  document.addEventListener('visibilitychange', ()=>{
    if(running && document.visibilityState === 'visible') wakeOn();
  });

  /* ── 시계 ── */
  let running = false, timer = 0, nextT = 0, beatI = 0, barI = 0;
  const LOOK = 0.12, TICK = 25;
  const vis = new Set();
  let curDot = -1, flashT = 0;

  function isMuted(bar){
    if(bar < 0 || !S.gapOn) return false;       // 카운트인 마디(음수)는 절대 안 쉰다
    const p = Math.max(1, S.gapPlay|0), q = Math.max(1, S.gapMute|0);
    return (bar % (p + q)) >= p;
  }
  /* 랜덤 뮤트 — Time Guru의 핵심. 갭 트레이너(주기적)와 달리 예측이 안 돼서 밀림·당김이 바로 드러난다 */
  function randMuted(bar){
    return bar >= 0 && (S.randMute|0) > 0 && Math.random() * 100 < (S.randMute|0);
  }
  let endT = 0;                                  // 자동 정지 예약 시각(AudioContext 시계). 0이면 없음
  /* 화면 지연 보정 (2.1, 2026-10-19 제보 "블루투스로 들으면 싱크가 안 맞는다 — Tempo는 안 밀린다").
     블루투스는 소리가 스피커보다 150~300ms 늦게 귀에 닿는데 패드·점·플래시는 예약 시각에 바로 켜져서
     눈이 귀보다 먼저 갔다. 출력 지연을 재서 화면을 그만큼 늦춘다 —
     웹뷰가 알려 주면(ctx.outputLatency, 크롬·안드로이드) 그걸, iOS 앱은 네이티브(AVAudioSession.outputLatency)로 잰다.
     사파리 웹은 둘 다 없어서 0 — 그때는 손으로 맞추는 칸(S.lag ms)이 받는다. 둘은 더한다. */
  let LAG_AUTO = 0;
  function visLag(){ return LAG_AUTO + Math.max(0, Math.min(500, S.lag|0)) / 1000; }
  function refreshLag(){
    try{ const c = ac(); if(typeof c.outputLatency === 'number' && c.outputLatency > 0) LAG_AUTO = c.outputLatency; }catch(e){}
    try{
      const P = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.MaiPdf;
      if(IS_NATIVE && P && P.audioLatency) P.audioLatency().then(r=>{
        const v = r && +r.output; if(v >= 0 && v < 1) LAG_AUTO = v;   // 유선·내장 스피커면 0.005 안팎이라 사실상 그대로
        syncLagInfo();
      }).catch(()=>{});
    }catch(e){}
    syncLagInfo();
  }
  function syncLagInfo(){
    const el = $m('mtLagInfo'); if(!el) return;
    const a = Math.round(LAG_AUTO * 1000);
    el.textContent = a >= 20 ? t('자동 +{n}ms').replace('{n}', a) : '';
  }
  function tickM(){
    const c = ac(), now = c.currentTime;
    if(nextT === Infinity) return;             // start()가 컨텍스트를 깨우는 중
    if(endT){ if(now >= endT) finish(); return; }   // 마지막 박이 울리고 나서 멈춘다
    while(nextT < now + LOOK){
      const bd = 60 / S.bpm;                 // 이번 박 길이 — 자동 템포는 다음 박부터
      /* 카운트인 — barI가 음수인 동안. 클릭 세트와 무관하게 목소리로 "원·투·쓰리·포"(5박 이상은 클릭),
         분할·리듬꼴·갭·랜덤·마디 카운팅 전부 쉬고 맨 박만 센다 (2026-10-08, Tempo 최대 2마디와 같은 규약) */
      if(barI < 0){
        if(!(beatI < 4 && voiceAt(nextT, beatI))) clickAt(nextT, beatI === 0, beatI === 0 ? 1 : 0.62);
        scheduleVis(nextT, beatI, barI, false);
        beatI++;
        if(beatI >= beatsPerBar()){ beatI = 0; barI++; }
        nextT += bd;
        continue;
      }
      const muted = isMuted(barI) || randMuted(barI);
      /* 폴리리듬 — 마디를 N등분한 둘째 클릭을 박 위에 겹친다(4/4에 3이면 3:4). 갭 무음 마디는 같이 쉰다.
         소리는 박 클릭과 구별되게 비프(클릭 세트가 비프면 우드) (2026-10-08, Pro Metronome·PolyNome) */
      if(beatI === 0 && (S.poly|0) >= 2 && !isMuted(barI)){
        const P = S.poly|0, barLen = bd * beatsPerBar();
        for(let k = 0; k < P; k++){
          const pt = nextT + k * barLen / P;
          if(S.sound === 'beep') wood(pt, k === 0, 0.5); else beep(pt, k === 0, 0.45);
        }
      }
      /* 마디별 박자표(악보에서 가져오기) — 마디 첫 박에서 그 마디의 박자표로 갈아 끼우고 화면은 그 시각에 다시 그린다 */
      if(beatI === 0 && S.map && S.map[barI]){
        const ts = S.map[barI];
        if(ts[0] !== S.num || ts[1] !== S.den){ S.num = ts[0]; S.den = ts[1]; scheduleRebuild(nextT); }
      }
      /* 뮤트 박은 통째로 쉰다 — 첫 타만이 아니라 그 박의 분할·리듬꼴 서브 틱까지.
         "뮤트"의 뜻이 그 박을 쉬는 것이기 때문이다 (2026-08-29 사용자 버그 신고).
         점(눈)은 계속 돈다. */
      const beatMuted = muted || btOf(beatI) === 'mute';
      /* 마디 카운팅 (2026-08-29, Tempo 유료판 방식) — 켜면 각 마디 **첫 박**에서
         지금이 몇 번째 마디인지(1~4 순환) 목소리로 말하고, 나머지 박은 평소 클릭.
         "원-2-3-4, 투-2-3-4, 쓰리…, 포…" — 드러머가 프레이즈를 세는 그 방식이다.
         클릭 세트와 무관하게 목소리로만 센다(사용자 결정). 뮤트·갭 무음이면 안 센다. */
      const barSpoken = S.barVoice && beatI === 0 && !beatMuted && voiceAt(nextT, barI % 4);
      const fig = figPat(beatI);
      if(fig){
        /* 리듬꼴 — 분할 대신 16분 그리드 패턴을 친다. 점은 네 칸 다 돌아서
           쉼표 자리도 눈으로 센다 */
        for(let k = 0; k < 4; k++){
          if(fig[k] === 'x'){
            if(k === 0){ if(!barSpoken) beatSound(nextT, beatI, beatMuted); }
            else subSound(nextT + k * bd / 4, beatI, beatMuted);
          }
          subDotVis(nextT + k * bd / 4, beatI, k);
        }
      } else {
        if(!barSpoken) beatSound(nextT, beatI, beatMuted);
        const offs = subOffsets();
        for(let k=1; k<offs.length; k++) subSound(nextT + offs[k]*bd, beatI, beatMuted);
        if(offs.length > 1)
          for(let k=0; k<offs.length; k++) subDotVis(nextT + offs[k]*bd, beatI, k);
      }
      scheduleVis(nextT, beatI, barI, muted);
      beatI++;
      if(beatI >= beatsPerBar()){
        beatI = 0; barI++;
        if(S.autoOn && S.bpm < S.autoGoal && barI % Math.max(1, S.autoEvery|0) === 0)
          setBpm(Math.min(S.autoGoal, S.bpm + Math.max(1, S.autoStep|0)));
        /* 자동 정지 — N마디를 다 울린 뒤(마지막 박 길이까지) 멈춘다. 세트리스트 자동 진행이면 다음 곡으로 */
        if(S.stopOn && barI >= Math.max(1, S.stopBars|0)){ endT = nextT + bd; nextT += bd; break; }
      }
      nextT += bd;
    }
    statBeat();
  }
  function scheduleRebuild(at){
    const ms = Math.max(0, (at + visLag() - ac().currentTime) * 1000 - 1);   // 그 박의 점등보다 1ms 먼저
    const h = setTimeout(()=>{ vis.delete(h); if(!running) return; buildDots(); syncTs(); }, ms);
    vis.add(h);
  }
  function finish(){
    const next = S.setAuto && curSet >= 0 && curSet + 1 < setsRead().length;
    stop();
    if(next){ loadSet(curSet + 1); start(); }
  }
  /* 화면은 scheduleVisual과 같은 수법 — 예약 시각까지 setTimeout. 멈추면 전부 취소한다 */
  function scheduleVis(at, i, bar, muted){
    const ms = Math.max(0, (at + visLag() - ac().currentTime) * 1000);
    const h = setTimeout(()=>{
      vis.delete(h);
      if(!running) return;
      /* 카운팅 사각형 — 이 화면의 주인공. 현재 박 패드가 통째로 빛나고
         그 안의 숫자가 크게 튀었다 줄어든다. 갭 무음 마디에는 윤곽만 남아
         소리가 없어도 눈이 계속 센다. */
      const pads = $m('mtDots').children;
      if(curDot >= 0 && pads[curDot]){
        pads[curDot].classList.remove('cur');
        pads[curDot].classList.remove('mt-muted');
        pads[curDot].querySelectorAll('.mtSubDots i').forEach(el=> el.classList.remove('on'));
      }
      const p = pads[i];
      if(p){
        p.classList.add('cur');
        p.classList.toggle('mt-muted', muted);
        const nm = p.querySelector('.num');
        if(nm){
          /* 'pop'이 아니라 'mt-pop'인 이유: 본편에 .pop{display:none}(팝업 기본)이 있다.
             안 붙인 클래스명은 본편 전역과 충돌한다 — Safari 사고(.pad)와 같은 자리다 */
          nm.classList.remove('mt-pop'); void nm.offsetWidth;   // 애니메이션 재시동
          nm.classList.add('mt-pop');
        }
      }
      curDot = i;
      if(S.flash && !muted && btOf(i) !== 'mute') flash(btOf(i) === 'accent');
      const bl = $m('mtBar');
      if(bl) bl.textContent = bar < 0 ? t('카운트인')
        : ((S.gapOn || (S.randMute|0) > 0) ? t(muted ? '무음' : '클릭') + ' · ' : '')
          + t('{b}마디').replace('{b}', bar + 1)
          + (S.stopOn ? ' / ' + Math.max(1, S.stopBars|0) : '');
    }, ms);
    vis.add(h);
  }
  function flash(acc){
    const f = $m('mtFlash'); if(!f) return;
    f.classList.add('on'); f.classList.toggle('acc', acc);
    clearTimeout(flashT);
    flashT = setTimeout(()=>{ f.classList.remove('on'); f.classList.remove('acc'); }, 90);
  }

  function start(){
    if(running) return;
    if(typeof playing !== 'undefined' && playing && typeof stopPlay === 'function') stopPlay(false);
    const c = ac();
    if(S.map && S.map[0] && (S.map[0][0] !== S.num || S.map[0][1] !== S.den)){   // 악보 곡은 첫 마디 박자표로
      S.num = S.map[0][0]; S.den = S.map[0][1]; buildDots(); syncTs();
    }
    running = true; beatI = 0; barI = -Math.max(0, Math.min(2, S.countIn|0)); curDot = -1; endT = 0;
    /* 시작 지연 (2.1, 2026-10-19 제보 "누르면 미세하게 늦게 시작한다").
       예전엔 첫 박을 120ms 뒤에 두고 첫 틱도 25ms 뒤에 돌았다 — 손가락을 뗄 때(click) 시작하는 것까지 더해
       누른 뒤 0.2초쯤 늦었다. 이제 누르는 순간(pointerdown) 시작하고, 첫 박은 40ms 뒤, 첫 틱은 그 자리에서.
       컨텍스트가 잠들어 있으면 시계가 멈춰 있어 그 시각으로 예약하면 깨어날 때 박이 몰린다 — 깬 뒤에 잡는다. */
    const go = ()=>{ if(!running) return; nextT = c.currentTime + 0.04; refreshLag(); tickM(); };
    nextT = Infinity;                          // 깨어나기 전에는 tickM이 아무것도 예약하지 않는다
    timer = setInterval(tickM, TICK);
    if(c.state === 'running') go();
    else if(c.resume) c.resume().then(go, go);
    else go();
    statStart();                               // 메트로놈 시간도 오늘 기록에 쌓인다
    wakeOn();
    syncRun();
    if(typeof track === 'function') track('metro-start');
  }
  function stop(){
    if(!running) return;
    running = false; clearInterval(timer); timer = 0; endT = 0;
    statStop();                                // 오늘 기록 마감 — 인증샷·연속 일수에 반영
    wakeOff();
    vis.forEach(clearTimeout); vis.clear();
    clearTimeout(flashT);
    const f = $m('mtFlash'); if(f){ f.classList.remove('on'); f.classList.remove('acc'); }
    Array.prototype.forEach.call($m('mtDots').children, d=>{
      d.classList.remove('cur'); d.classList.remove('mt-muted');
      d.querySelectorAll('.mtSubDots i').forEach(el=> el.classList.remove('on'));
    });
    idleBar();
    if(S.map && S.map[0] && (S.map[0][0] !== S.num || S.map[0][1] !== S.den)){   // 멈추면 첫 마디 박자표로 되돌린다 — 세트리스트 표기와 같게
      S.num = S.map[0][0]; S.den = S.map[0][1]; buildDots(); syncTs();
    }
    syncRun();
  }
  function syncRun(){
    const b = $m('mtStart');
    if(b){
      b.textContent = running ? '■' : '▶';
      b.classList.toggle('on', running);
      b.setAttribute('aria-label', t(running ? '메트로놈 정지' : '메트로놈 시작'));
      b.title = t(running ? '메트로놈 정지' : '메트로놈 시작');
    }
  }
  /* startPlay·showMetroPanel·스페이스 키가 잡는 손잡이 */
  window.metroStop = stop;
  window.metroToggle = ()=>{ running ? stop() : start(); };

  /* ── BPM ── */
  const TERMS = [[40,'Grave'],[45,'Largo'],[55,'Adagio'],[66,'Andante'],[76,'Moderato'],
                 [108,'Allegretto'],[120,'Allegro'],[156,'Vivace'],[176,'Presto'],[200,'Prestissimo']];
  function termOf(v){ let name = 'Grave'; for(const p of TERMS){ if(v >= p[0]) name = p[1]; } return name; }
  function setBpm(v){
    v = Math.max(20, Math.min(300, Math.round(v) || 0));
    if(!v) return;
    S.bpm = v; save();
    $m('mtBpmVal').textContent = v;
    $m('mtRange').value = v;
    $m('mtTerm').textContent = termOf(v);
  }
  let taps = [];
  function onTap(){
    const now = performance.now();
    if(taps.length && now - taps[taps.length-1] > 2000) taps = [];
    taps.push(now);
    if(taps.length > 6) taps.shift();
    if(taps.length >= 2) setBpm(60000 / ((taps[taps.length-1] - taps[0]) / (taps.length - 1)));
  }

  /* ── 카운팅 사각형 + 소리 고르기 창 ──
     열 수는 4열을 기준으로 줄을 나눈다: 4박=한 줄, 5·6박=3열, 8박=4열 2줄, 9박=3×3. */
  function padCols(n){ const rows = Math.ceil(n / 4); return Math.ceil(n / rows); }
  function paintPad(i){
    const d = $m('mtDots').children[i]; if(!d) return;
    const bt = btOf(i);
    d.dataset.bt = bt;
    d.setAttribute('aria-label', t('{n}박').replace('{n}', i + 1) + ' — ' + t(BT_LABEL[bt]));
    const lb = d.querySelector('.bt'); if(lb) lb.textContent = t(BT_LABEL[bt]);
  }
  function buildDots(){
    normBeats();
    const box = $m('mtDots'); box.innerHTML = '';
    const n = beatsPerBar();
    box.style.setProperty('--mtCols', padCols(n));
    box.style.setProperty('--mtRows', Math.ceil(n / padCols(n)));   // Basic 패드 높이 나누기 (2.1)
    for(let i = 0; i < n; i++){
      const d = document.createElement('button');
      d.type = 'button';
      d.innerHTML = '<span class="num"></span><span class="bt"></span><span class="mtSubDots"></span>';
      d.querySelector('.num').textContent = i + 1;
      /* Basic에는 ▶가 없다 — 패드 전체가 시작·정지 단추다(2.1, 2026-10-19 제보 "버튼이 작아 한 손으로 안 눌린다").
         박 소리 고르기는 Full에서. Full은 예전처럼 누르면 그 박의 소리 창 */
      d.addEventListener('pointerdown', e=>{ if(S.ui === 'basic') pressDown(e); });
      d.onclick = ()=>{ if(S.ui === 'basic'){ pressClick(); return; } openPop(i); };
      box.appendChild(d);
      paintPad(i);
    }
    curDot = -1;
    fitNums();
  }
  /* 박 숫자를 패드 안에 넣는다 (2.1). 숫자 크기는 vh로 정해져서 **세로 화면에서는 패드 폭보다
     커진다**(834 세로 Basic: 숫자 460px · 패드 196px). 설계 크기를 먼저 재고, 패드 폭 84%·높이 66%를
     넘을 때만 그 비율로 줄인다 — 가로 화면처럼 들어가는 곳은 한 픽셀도 안 바뀐다.
     offsetWidth를 쓴다: .cur의 scale(1.05)·튀는 애니메이션(transform)에 안 흔들린다.
     패드 크기가 바뀌는 길(회전·Basic/Full·패널 열기)은 ResizeObserver 하나가 다 받는다. */
  var fitRO = null, fitRaf = 0;               // var — buildDots가 이 줄보다 먼저 불려도 TDZ가 안 나게
  function fitNums(){
    const box = $m('mtDots'); if(!box) return;
    if(!fitRO && window.ResizeObserver){
      fitRO = new ResizeObserver(()=>{ cancelAnimationFrame(fitRaf); fitRaf = requestAnimationFrame(fitNums); });
      fitRO.observe(box);
    }
    [...box.children].forEach(d=>{
      const num = d.querySelector('.num'); if(!num) return;
      d.removeAttribute('data-fit');
      const W = d.clientWidth, H = d.clientHeight, w = num.offsetWidth, h = num.offsetHeight;
      if(!W || !H || !w || !h) return;                       // 숨어 있으면 다음 크기 변화 때
      const k = Math.min(1, (W * 0.84) / w, (H * 0.66) / h);
      if(k >= 0.999) return;
      const fs = parseFloat(getComputedStyle(num).fontSize) * k;
      d.style.setProperty('--mtNumFit', Math.floor(fs) + 'px');
      d.setAttribute('data-fit', '');
    });
  }
  if(document.fonts && document.fonts.ready) document.fonts.ready.then(()=> fitNums());
  /* ── 분할 점 (블루픽 A-4) — 패드 아래 작은 점 줄. 16비트면 박당 4점이 차오른다.
     분할이 소리로만 있던 걸 눈에 보이게 한다. 분할 1일 때는 점이 잡음이라 숨긴다. */
  function paintSubDots(){
    const on = !!figPat(0);
    Array.prototype.forEach.call($m('mtDots').children, (d, i)=>{
      const box = d.querySelector('.mtSubDots'); if(!box) return;
      const fig = on ? figPat(i) : null;         // 마디 리듬꼴이면 박마다 다르다
      const n = fig ? 4 : subOffsets().length;
      let cells = '';
      for(let k = 0; k < n; k++)
        cells += (fig && fig[k] !== 'x') ? '<i class="mt-rest"></i>' : '<i></i>';
      box.innerHTML = (n > 1 || fig) ? cells : '';
    });
  }
  function subDotVis(at, i, k){
    const ms = Math.max(0, (at + visLag() - ac().currentTime) * 1000);
    const h = setTimeout(()=>{
      vis.delete(h);
      if(!running) return;
      const p = $m('mtDots').children[i]; if(!p) return;
      const dots = p.querySelectorAll('.mtSubDots i');
      dots.forEach((el, j)=> el.classList.toggle('on', j <= k));
    }, ms);
    vis.add(h);
  }

  /* 소리 고르기 창. 이름이 mtVoicePop인 이유 — 본편 .pop 충돌 사고와 같은 규칙(mt 접두사). */
  let popBeat = -1;
  function openPop(i){
    popBeat = i;
    const w = $m('mtVoicePop'); if(!w) return;
    $m('mtPopTitle').textContent = t('{n}박 소리').replace('{n}', i + 1);
    Array.prototype.forEach.call(w.querySelectorAll('button[data-bt]'), b=>
      b.classList.toggle('sel', b.dataset.bt === btOf(i)));
    w.hidden = false;
  }
  function closePop(){ const w = $m('mtVoicePop'); if(w) w.hidden = true; popBeat = -1; }
  (function wirePop(){
    const w = $m('mtVoicePop'); if(!w) return;
    w.addEventListener('click', e=>{
      if(e.target === w){ closePop(); return; }        // 바깥을 누르면 닫힌다
      const b = e.target.closest('button[data-bt]');
      if(!b || popBeat < 0) return;
      S.beats[popBeat] = b.dataset.bt; save();
      paintPad(popBeat);
      const c = ac(); if(c.resume) c.resume();          // 고르자마자 미리 한 번 들려준다
      beatSound(c.currentTime + 0.03, popBeat, false);
      closePop();
    });
    const x = $m('mtPopClose'); if(x) x.onclick = closePop;
  })();

  /* ── 박자표·분할 ── */
  function syncTs(){
    $m('mtNum').value = S.num; $m('mtDen').value = S.den;
    const comp = compound();
    $m('mtSubHint').style.display = comp ? '' : 'none';
    Array.prototype.forEach.call($m('mtSub').children, b=>{
      b.classList.toggle('sel', !comp && String(S.sub) === b.dataset.sub);
      b.disabled = comp;
    });
    /* 스트립의 음표 버튼 — 지금 분할의 악보 기호를 그대로 옮겨 그린다(Tempo와 같은 문법).
       겹박자는 셋잇단으로 굳으므로 버튼도 셋잇단 기호로 잠근다 */
    const sb = $m('mtSubBtn');
    if(sb){
      const cur = $m('mtSub').querySelector('[data-sub="' + (comp ? '3' : String(S.sub)) + '"]');
      const gl = cur && cur.querySelector('svg');
      if(gl) sb.innerHTML = gl.outerHTML;
      sb.disabled = comp;
      sb.classList.toggle('mt-off', !!figPat());   // 리듬꼴이 분할을 덮는 동안 흐리게
    }
    syncFig();
    $m('mtTsInfo').textContent = comp ? S.num + '/' + S.den + ' · ' + beatsPerBar() + '×3' : '';   // 홑박자는 셀렉트 둘이 이미 말한다 — 겹박자만 (2026-10-14)
    paintSubDots();                            // 분할 수가 바뀌면 점 수도 바뀐다
  }
  function resync(){ if(running){ beatI = 0; barI = 0; } }   // 마디 구조가 바뀌면 처음 박부터
  /* 손으로 박자표를 고르면 '악보에서' 가져온 마디별 박자표(S.map)를 버린다 (2.1, 2026-10-19 제보
     "3/4박 바꾸고 나서 다시 안 돌아가요"). 맵이 남아 있으면 ▶·■마다 첫 마디 박자표로, 마디마다 그 마디
     박자표로 되돌려 놓아 손으로 고른 값이 한 번도 안 먹었다. 맵은 저장(maidrum.metro.v1)에 남아서
     세트리스트 줄을 지운 뒤에도 따라다녔다. 고른 순간부터는 그 곡의 맵이 아니다. */
  function dropMap(){ if(S.map){ S.map = null; } }
  $m('mtNum').onchange = e=>{ dropMap(); S.num = Math.max(1, Math.min(16, +e.target.value || 4)); buildDots(); syncTs(); save(); resync(); };
  $m('mtDen').onchange = e=>{ dropMap(); const v = +e.target.value; S.den = (v === 2 || v === 8 || v === 16) ? v : 4; buildDots(); syncTs(); save(); resync(); };
  $m('mtSub').addEventListener('click', e=>{
    const b = e.target.closest('button'); if(!b || b.disabled) return;
    S.sub = b.dataset.sub === 'sw' ? 'sw' : +b.dataset.sub;
    syncTs(); save();
    const w = $m('mtSubPop'); if(w) w.hidden = true;    // 고르면 닫힌다
  });
  /* 분할 창 — 음표 버튼으로 연다. 바깥이나 ✕를 누르면 닫힌다 */
  (function wireSubPop(){
    const w = $m('mtSubPop'), sb = $m('mtSubBtn');
    if(!w || !sb) return;
    sb.onclick = ()=>{ syncTs(); w.hidden = false; };
    w.addEventListener('click', e=>{ if(e.target === w) w.hidden = true; });
    const x = $m('mtSubClose'); if(x) x.onclick = ()=>{ w.hidden = true; };
  })();
  /* ── 리듬꼴 버튼·창 — 블루픽의 리듬 피겨 칩. 표기는 악보 기호가 아니라
     16분 그리드 셀이다(우리 앱의 그리드 언어 — 따쿵따다둥답게). */
  /* 마디 편집 그리드 — 박마다 4칸, 누르면 토글. 전부 쉼표면 끈다 */
  function renderFigBar(){
    const box = $m('mtFigBar'); if(!box) return;
    const n = beatsPerBar(), f = figBar();
    box.style.setProperty('--mtFigBeats', n);
    let h = '';
    for(let k = 0; k < 4 * n; k++)
      h += '<button type="button" data-k="' + k + '" class="' + (f[k] === 'x' ? 'on' : '') + (k % 4 === 0 ? ' mt-b0' : '') + '" data-no-i18n></button>';
    box.innerHTML = h;
    box.classList.toggle('mt-lock', compound());
  }
  function syncFig(){
    const fb = $m('mtFigBtn'); if(!fb) return;
    const fig = figPat(0);
    renderFigBar();
    const cells = fb.querySelector('.mtFigCells');
    if(cells){
      let h = '';
      for(let k = 0; k < 4; k++)
        h += (fig && fig[k] === 'x') ? '<i class="on"></i>' : '<i></i>';
      cells.innerHTML = h;
    }
    fb.classList.toggle('on', !!fig);
    fb.disabled = compound();
    const w = $m('mtFigPop');
    if(w) Array.prototype.forEach.call(w.querySelectorAll('button[data-fig]'), b=>
      b.classList.toggle('sel', b.dataset.fig === (S.fig || '')));
  }
  (function wireFigPop(){
    const w = $m('mtFigPop'), fb = $m('mtFigBtn');
    if(!w || !fb) return;
    fb.onclick = ()=>{ syncFig(); w.hidden = false; };
    w.addEventListener('click', e=>{
      if(e.target === w){ w.hidden = true; return; }
      const cell = e.target.closest('#mtFigBar button[data-k]');
      if(cell && !compound()){
        const f = figBar().split(''), k = +cell.dataset.k;
        f[k] = f[k] === 'x' ? '·' : 'x';
        const s = f.join('');
        S.fig = /x/.test(s) ? s : null;         // 전부 쉼표면 끈다
        save(); paintSubDots(); syncTs();
        return;                                  // 편집 중엔 안 닫힌다
      }
      const b = e.target.closest('button[data-fig]');
      if(!b) return;
      S.fig = b.dataset.fig || null;
      save(); paintSubDots(); syncTs();          // syncTs가 syncFig까지 부른다
      w.hidden = true;
      if(S.fig){                                  // 고르자마자 한 박 미리 들려준다
        const c = ac(); if(c.resume) c.resume();
        const bd0 = 60 / S.bpm, t0 = c.currentTime + 0.05;
        for(let k = 0; k < 4; k++)
          if(S.fig[k] === 'x') (k === 0 ? mtClick(t0, 2250, 0.24) : mtClick(t0 + k * bd0 / 4, 1100, 0.1));
      }
    });
    const x = $m('mtFigClose'); if(x) x.onclick = ()=>{ w.hidden = true; };
  })();
  /* ── Basic/Full (블루픽 B-7) — Basic은 패드+스트립만. 설정 구획을 접는다 */
  function idleBar(){                          // 멈춰 있을 때 왼쪽 위 — Basic이면 시작하는 법을 알려 준다
    const bl = $m('mtBar'); if(bl && !running) bl.textContent = S.ui === 'basic' ? t('패드를 누르면 시작 · 정지') : '';
  }
  function syncUi(){
    mm.classList.toggle('mt-basic', S.ui === 'basic');
    idleBar();
    const tg = $m('mtUiTg');
    if(tg) Array.prototype.forEach.call(tg.children, b=>
      b.classList.toggle('sel', b.dataset.ui === S.ui));
  }
  (function wireUiTg(){
    const tg = $m('mtUiTg'); if(!tg) return;
    tg.addEventListener('click', e=>{
      const b = e.target.closest('button'); if(!b) return;
      S.ui = b.dataset.ui === 'basic' ? 'basic' : 'full';
      save(); syncUi();
    });
  })();

  /* ── 클릭 소리 ── */
  $m('mtSound').addEventListener('click', e=>{
    const b = e.target.closest('button'); if(!b) return;
    S.sound = b.dataset.snd; save(); syncSound();
    const c = ac(); if(c.resume) c.resume();       // 미리 듣기 — 고르자마자 한 번 울린다
    if(S.sound === 'voice') voiceAt(c.currentTime + 0.03, 0);
    else clickAt(c.currentTime + 0.03, true, 1);
  });
  function syncSound(){
    Array.prototype.forEach.call($m('mtSound').children, b=> b.classList.toggle('sel', b.dataset.snd === S.sound));
    $m('mtFlashOn').checked = !!S.flash;
  }

  /* ── 갭 트레이너 · 자동 템포 ── */
  function bindNum(id, key, lo, hi){
    const el = $m(id);
    el.value = S[key];
    el.onchange = ()=>{ S[key] = Math.max(lo, Math.min(hi, +el.value || lo)); el.value = S[key]; save(); syncInfo(); };
  }
  function bindChk(id, key){
    const el = $m(id); el.checked = !!S[key];
    el.onchange = ()=>{ S[key] = el.checked; save(); syncInfo(); };
  }
  function syncInfo(){
    $m('mtGapInfo').textContent = S.gapOn
      ? t('클릭 {a} · 무음 {b}').replace('{a}', S.gapPlay).replace('{b}', S.gapMute) : '';
    $m('mtAutoInfo').textContent = S.autoOn
      ? t('{e}마디마다 +{s} · 목표 {g}').replace('{e}', S.autoEvery).replace('{s}', S.autoStep).replace('{g}', S.autoGoal) : '';
  }

  /* ── 배선 ── */
  $m('mtRange').oninput = e=> setBpm(+e.target.value);
  $m('mtDn').onclick   = ()=> setBpm(S.bpm - 1);
  $m('mtUp').onclick   = ()=> setBpm(S.bpm + 1);
  $m('mtDn10').onclick = ()=> setBpm(S.bpm - 10);
  $m('mtUp10').onclick = ()=> setBpm(S.bpm + 10);
  /* 누르는 순간(pointerdown) 시작·정지 (2.1, 2026-10-19 제보 — 연주 중 한 손으로 급히 누른다).
     click은 손을 뗄 때라 그만큼 늦다. 키보드(스페이스·엔터)는 pointerdown 없이 click만 온다 —
     그래서 click은 직전 pointerdown이 없을 때만 듣는다. detail로 가르지 않는 이유: 터치에서 오는 click도
     detail이 0인 브라우저가 있다(크로뮴 터치 에뮬레이션에서 실측 — 눌러서 켜고 뗄 때 도로 꺼졌다) */
  let lastPress = -1e9;
  function pressDown(e){ if(e.button > 0) return false; e.preventDefault(); lastPress = performance.now(); window.metroToggle(); return true; }
  function pressClick(){ if(performance.now() - lastPress > 800) window.metroToggle(); }
  function pressToggle(el){
    el.addEventListener('pointerdown', pressDown);
    el.addEventListener('click', pressClick);
  }
  pressToggle($m('mtStart'));
  $m('mtTap').addEventListener('pointerdown', e=>{ e.preventDefault(); onTap(); });
  bindChk('mtFlashOn','flash'); bindChk('mtWakeOn','wake'); bindChk('mtBarVoiceOn','barVoice');
  bindChk('mtGapOn','gapOn'); bindChk('mtAutoOn','autoOn');
  bindChk('mtStopOn','stopOn'); bindChk('mtSetAuto','setAuto');
  (function wireRanges(){
    const v = $m('mtVol'), b = $m('mtBal');
    if(v){ v.value = S.vol; $m('mtVolVal').textContent = S.vol;
      v.oninput = ()=>{ S.vol = +v.value; $m('mtVolVal').textContent = S.vol; save(); mtOut(); };
      v.onchange = ()=>{ const c = ac(); if(c.resume) c.resume(); clickAt(c.currentTime + 0.03, true, 1); }; }
    if(b){ b.value = S.bal; $m('mtBalVal').textContent = S.bal;
      b.oninput = ()=>{ S.bal = +b.value; $m('mtBalVal').textContent = S.bal; save(); };
      b.onchange = ()=>{ const c = ac(); if(c.resume) c.resume();                       // 강세 → 보통 두 번 들려준다
        clickAt(c.currentTime + 0.03, true, 1); clickAt(c.currentTime + 0.33, false, Math.max(0.05, S.bal / 100)); }; }
  })();
  function syncPoly(){
    const g = $m('mtPoly'); if(g) Array.prototype.forEach.call(g.children, x=> x.classList.toggle('sel', +x.dataset.poly === (S.poly|0)));
    const sb = $m('mtSubBtn'); if(sb) sb.setAttribute('data-poly', (S.poly|0) >= 2 ? String(S.poly|0) : '');
  }
  const polyG = $m('mtPoly');
  if(polyG) polyG.addEventListener('click', e=>{
    const x = e.target.closest('button'); if(!x) return;
    S.poly = +x.dataset.poly || 0; save(); syncPoly();
  });
  /* 악보에서 가져오기 — 본편에만 있는 것(measures·tsOf·bpm·titleInput). 단독본은 단추가 숨는다.
     곡 제목·BPM·첫 마디 박자표·마디 수(=자동 정지)·마디별 박자표 맵을 세트리스트 한 줄로 */
  (function wireFromScore(){
    const btn = $m('mtSetFromScore'); if(!btn) return;
    const has = typeof measures !== 'undefined' && typeof tsOf === 'function';
    btn.style.display = has ? '' : 'none';
    if(!has) return;
    btn.onclick = ()=>{
      const ms = measures; if(!ms || !ms.length) return;
      const ts0 = tsOf(ms[0]);
      const te = document.getElementById('titleInput');
      const name = ((te && te.value) || '').trim() || t('무제');
      const snap = setSnap();
      snap.bpm = Math.max(20, Math.min(300, Math.round(+bpm) || 120));
      snap.num = ts0[0]; snap.den = ts0[1];
      snap.stopOn = true; snap.stopBars = ms.length;
      const map = ms.map(m=> tsOf(m));
      snap.map = map.some(x=> x[0] !== ts0[0] || x[1] !== ts0[1]) ? map : null;
      const a = setsRead(), hit = a.findIndex(p=> p.name === name);
      if(hit >= 0) a[hit] = { name, s: snap }; else a.push({ name, s: snap });
      setsWrite(a); renderSets(); loadSet(hit >= 0 ? hit : a.length - 1);
    };
  })();
  bindNum('mtCountIn','countIn',0,2); bindNum('mtRandMute','randMute',0,90); bindNum('mtStopBars','stopBars',1,999);
  bindNum('mtLag','lag',0,500);
  $m('mtSetAuto').addEventListener('change', setsInfo);
  /* 본편 setLang은 <html lang>을 바꾼다 — 그때 t()로 만든 글(행 표기·총 시간)도 다시 그린다 */
  try{ new MutationObserver(()=> renderSets()).observe(document.documentElement, { attributes:true, attributeFilter:['lang'] }); }catch(e){}
  $m('mtStopOn').addEventListener('change', ()=>{ setsInfo(); });
  $m('mtStopBars').addEventListener('change', ()=>{ setsInfo(); });
  /* 페달·키보드 — AirTurn류 블루투스 페달은 키보드다(↑↓ 또는 PageUp/Down). 메트로놈 화면이 보일 때만,
     입력칸 밖에서만. ↑/PageUp = 이전 곡, ↓/PageDown = 다음 곡 (스페이스는 본편/단독본 각자 분기) */
  document.addEventListener('keydown', e=>{
    if(!mm || mm.offsetParent === null) return;
    const tg = e.target.tagName; if(tg === 'INPUT' || tg === 'SELECT' || tg === 'TEXTAREA') return;
    const n = setsRead().length; if(!n) return;
    if(e.key === 'ArrowDown' || e.key === 'PageDown'){ e.preventDefault(); loadSet(Math.min(n - 1, curSet + 1)); }
    else if(e.key === 'ArrowUp' || e.key === 'PageUp'){ e.preventDefault(); loadSet(Math.max(0, curSet - 1)); }
  });
  $m('mtWakeOn').addEventListener('change', ()=>{ if(running){ S.wake ? wakeOn() : wakeOff(); } });
  $m('mtPan').addEventListener('click', e=>{
    const b = e.target.closest('button'); if(!b) return;
    S.pan = b.dataset.pan; save(); syncPan();
    const c = ac(); if(c.resume) c.resume();   // 고르자마자 그 자리에서 들려준다
    mtClick(c.currentTime + 0.03, 1500, 0.2);
  });
  function syncPan(){
    Array.prototype.forEach.call($m('mtPan').children, b=>
      b.classList.toggle('sel', b.dataset.pan === S.pan));
  }
  bindNum('mtGapPlay','gapPlay',1,32); bindNum('mtGapMute','gapMute',1,32);
  bindNum('mtAutoEvery','autoEvery',1,64); bindNum('mtAutoStep','autoStep',1,40);
  bindNum('mtAutoGoal','autoGoal',20,300);


  /* ── 세트리스트 — 설정 저장·불러오기 (2026-09-01, 사용자 요청) ──
     Tempo의 유료 Setlist와 같은 자리. 지금 세팅을 이름 붙여 저장하고 탭 한 번으로 되부른다.
     저장 대상은 곡 성격의 것만 — 화면 취향(플래시·화면 켬·Basic/Full)은 기기의 것이라 뺀다.
     같은 이름으로 저장하면 덮어쓴다. 삭제는 ✕를 2.5초 안에 두 번(실수 방지 — 창은 안 띄운다). */
  const SETKEY = 'maidrum.metro.sets.v1';
  const SETFIELDS = ['bpm','num','den','sub','fig','beats','sound','pan','barVoice',
                     'gapOn','gapPlay','gapMute','autoOn','autoEvery','autoStep','autoGoal',
                     'countIn','randMute','stopOn','stopBars','bal','poly','map'];   // 자동 정지 마디 수 = 그 곡의 길이
  let curSet = -1;                               // 세트리스트에서 마지막으로 불러온 곡(자동 진행·페달의 기준)
  function barSec(s){ const comp = s.den === 8 && s.num % 3 === 0; return (comp ? s.num / 3 : s.num) * 60 / s.bpm; }
  function setsInfo(){
    const el = $m('mtSetInfo'); if(!el) return;
    const a = setsRead(); let sec = 0;
    a.forEach(p=>{ if(p.s.stopOn) sec += Math.max(1, p.s.stopBars|0) * barSec(p.s); });
    const mm = Math.floor(sec / 60), ss = Math.round(sec % 60);
    el.textContent = a.length ? t('{n}곡').replace('{n}', a.length) + (sec ? ' · ' + mm + ':' + (ss < 10 ? '0' : '') + ss : '') : '';
  }
  function loadSet(i){
    const a = setsRead(); if(i < 0 || i >= a.length) return;
    curSet = i; setApply(a[i].s);
    const box = $m('mtSetList');
    Array.prototype.forEach.call(box.querySelectorAll('.mtSetLd'), (b, k)=> b.classList.toggle('sel', k === i));
    const row = box.children[i]; if(row && row.scrollIntoView) row.scrollIntoView({ block: 'nearest' });
  }
  function setsRead(){
    try{ const a = JSON.parse(localStorage.getItem(SETKEY) || '[]'); return Array.isArray(a) ? a : []; }
    catch(e){ return []; }
  }
  function setsWrite(a){ try{ localStorage.setItem(SETKEY, JSON.stringify(a)); }catch(e){} }
  function setSnap(){
    const s = {};
    SETFIELDS.forEach(k=>{ s[k] = k === 'beats' ? S.beats.slice() : S[k]; });
    return s;
  }
  function setApply(s){
    SETFIELDS.forEach(k=>{ S[k] = s[k] !== undefined ? (k === 'beats' ? s[k].slice() : s[k]) : DEF[k]; });   // 옛 곡에 없는 열쇠(map·poly·bal)는 기본값 — 앞 곡의 맵이 남지 않게
    save();
    /* 화면 되밀기 — 숫자·체크 입력은 bind 때 한 번만 심기므로 여기서 직접 다시 민다 */
    setBpm(S.bpm); buildDots(); syncTs(); syncSound(); syncPan(); syncInfo();
    $m('mtBarVoiceOn').checked = !!S.barVoice;
    $m('mtGapOn').checked = !!S.gapOn; $m('mtAutoOn').checked = !!S.autoOn;
    $m('mtStopOn').checked = !!S.stopOn;
    syncPoly(); const bl = $m('mtBal'); if(bl){ bl.value = S.bal; $m('mtBalVal').textContent = S.bal; }
    [['mtGapPlay','gapPlay'],['mtGapMute','gapMute'],['mtAutoEvery','autoEvery'],
     ['mtAutoStep','autoStep'],['mtAutoGoal','autoGoal'],['mtCountIn','countIn'],
     ['mtRandMute','randMute'],['mtStopBars','stopBars']].forEach(p=>{ $m(p[0]).value = S[p[1]]; });
    resync();                                   // 도는 중이면 처음 박부터
  }
  function renderSets(){
    const box = $m('mtSetList'); if(!box) return;
    box.innerHTML = '';
    setsRead().forEach((p, i)=>{
      const row = document.createElement('div'); row.className = 'mtSetIt'; row.setAttribute('role','listitem');
      const ld = document.createElement('button'); ld.type = 'button'; ld.className = 'mtSetLd';
      ld.setAttribute('data-no-i18n','');        // 이름은 사용자 글 — 번역기가 만지면 안 된다
      const nm = document.createElement('b'); nm.textContent = p.name;
      const mt = document.createElement('span');
      mt.textContent = p.s.bpm + ' · ' + p.s.num + '/' + p.s.den
        + (p.s.stopOn ? ' · ' + t('길이 {n}마디').replace('{n}', Math.max(1, p.s.stopBars|0)) : '')
        + (p.s.map ? ' · ' + t('악보') : '');   // '{n}마디'·'{b}마디'는 본편에서 '몇 번째 마디' — 길이는 제 열쇠
      ld.appendChild(nm); ld.appendChild(mt);
      if(i === curSet) ld.classList.add('sel');
      ld.onclick = ()=> loadSet(i);
      const del = document.createElement('button'); del.type = 'button'; del.className = 'mtSetDel';
      del.textContent = '✕'; del.setAttribute('aria-label', t('삭제')); del.setAttribute('data-no-i18n','');
      let armT = 0;
      del.onclick = ()=>{
        if(del.classList.contains('mt-arm')){
          clearTimeout(armT);
          const a = setsRead(); a.splice(i, 1); setsWrite(a);
          if(curSet === i) curSet = -1; else if(curSet > i) curSet--;
          renderSets();
        } else {
          del.classList.add('mt-arm'); del.title = t('한 번 더 누르면 삭제');
          armT = setTimeout(()=> del.classList.remove('mt-arm'), 2500);
        }
      };
      row.appendChild(ld); row.appendChild(del); box.appendChild(row);
    });
    setsInfo();
  }
  (function wireSets(){
    const btn = $m('mtSetSave'), nm = $m('mtSetName');
    if(!btn || !nm) return;
    btn.onclick = ()=>{
      const name = (nm.value || '').trim() || (S.num + '/' + S.den + ' · ' + S.bpm);
      const a = setsRead();
      const hit = a.findIndex(p=> p.name === name);
      const entry = { name: name, s: setSnap() };
      if(hit >= 0){ a[hit] = entry; curSet = hit; } else { a.push(entry); curSet = a.length - 1; }
      if(a.length > 60) a.shift();               // 상한 — 가장 오래된 것부터 민다
      setsWrite(a); nm.value = ''; renderSets();
    };
    nm.addEventListener('keydown', e=>{ if(e.key === 'Enter'){ e.preventDefault(); btn.click(); } });
  })();

  /* 패널 높이 — 본편은 위에 모드바가 있고 세로 패드에선 그게 둘째 줄로 내려간다(위 75 → 136px).
     CSS 변수 --mtTop에 실측(패널 top + 7px 아래 여백)을 넣는다. 켤 때(본편 showMetroPanel → metroFit)와 크기 바뀔 때 */
  function fitPanel(){
    if(!mm || mm.offsetParent === null) return;
    const top = mm.getBoundingClientRect().top;
    if(top >= 0 && top < 400) mm.style.setProperty('--mtTop', Math.round(top + 7) + 'px');
  }
  window.metroFit = fitPanel;
  window.addEventListener('resize', ()=>{ fitPanel(); setTimeout(fitPanel, 60); });
  setBpm(S.bpm); buildDots(); syncTs(); syncSound(); syncPan(); syncInfo(); syncUi(); syncRun(); syncPoly(); renderSets(); fitPanel();
})();

/* ── 카피 탭 (2026-10-16, CLAUDE.md 8-63) ───────────────────────────
   유튜브를 앱 안에 띄워 속도를 줄여 들으며 그리드에 그린다. Studio(패드) 전용 —
   applyPadView가 `pad`일 때만 copy를 켜므로 폰 LITE에는 아예 안 나온다.

   플레이어는 **yt.html(maidrum.com)을 iframe으로** 연다. 앱 주소(capacitor://localhost)에서
   유튜브를 직접 띄우면 Referer가 안 실려 Error 153이 난다. 말은 postMessage로만 한다.

   지키는 것
   - iframe은 링크를 넣었을 때만 만든다(그 전엔 네트워크 0건)
   - 모드를 떠나거나 앱이 뒤로 가면 멈춘다(안 보이는 플레이어가 소리 내면 약관 위반)
   - 악보 재생(startPlay)이 시작되면 멈춘다 — window.ytPause
   - 곡마다 영상·위치·속도·A–B를 기억한다(localStorage 'maidrum.copy', 곡 id 키) */
(function copyTab(){
  const pane = document.getElementById('copyPane');
  if(!pane) return;
  const $ = id => document.getElementById(id);
  const KEY = 'maidrum.copy';
  const SRC = IS_NATIVE ? 'https://maidrum.com/yt.html' : 'yt.html';
  const TARGET = IS_NATIVE ? 'https://maidrum.com'
               : (/^https?:$/.test(location.protocol) ? location.origin : '*');
  let frame = null, booted = false, ready = false, ytOn = false, shown = false;
  let vid = '', want = null;           // want = 부팅 전에 보낼 load
  let cur = 0, dur = 0, rate = 1, A = null, B = null, loop = false, saveT = 0, songOf = null;
  let urlOpen = false;                 // '영상 바꾸기'로 링크 칸을 다시 연 상태

  /* 링크 → 영상 id. watch?v= · youtu.be · shorts/ · embed/ · live/ · music. · m. · id만 */
  function parseLink(s){
    s = String(s || '').trim();
    if(/^[\w-]{11}$/.test(s)) return {id:s, t:0};
    let u; try{ u = new URL(/:\/\//.test(s) ? s : 'https://' + s); }catch(e){ return null; }
    const h = u.hostname.replace(/^(www|m|music)\./, '');
    let id = '';
    if(h === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
    else if(h === 'youtube.com' || h === 'youtube-nocookie.com'){
      id = u.searchParams.get('v') || '';
      const m = u.pathname.match(/^\/(shorts|embed|live|v)\/([\w-]{11})/);
      if(!id && m) id = m[2];
    }
    if(!/^[\w-]{11}$/.test(id)) return null;
    const tt = u.searchParams.get('t') || u.searchParams.get('start') || '';
    let t = 0;
    const hms = tt.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/);
    if(hms) t = (+hms[1] || 0) * 3600 + (+hms[2] || 0) * 60 + (+hms[3] || 0);
    return {id, t};
  }
  const fmt = x => { x = Math.max(0, x || 0); const m = Math.floor(x / 60), s = Math.floor(x % 60);
                     return m + ':' + (s < 10 ? '0' : '') + s; };
  const fmt1 = x => fmt(x) + '.' + Math.floor((Math.max(0, x || 0) % 1) * 10);

  function store(){ try{ return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; }catch(e){ return {}; } }
  const songNow = () => (lib && lib.cur) || '_';
  function save(){
    clearTimeout(saveT);
    saveT = setTimeout(()=>{
      /* 곡 항목은 첫 저장 때 생긴다(saveDraft). 그 전에 연 영상은 '_'에 있다가
         곡이 생기면 그 곡으로 옮겨 간다 */
      const s = store();
      if(songOf === '_' && songNow() !== '_'){ delete s['_']; songOf = songNow(); }
      const k = songOf || songNow();
      if(vid) s[k] = {v:vid, t:Math.round(cur * 10) / 10, r:rate, a:A, b:B, l:loop ? 1 : 0, at:Date.now()};
      if(k !== '_' && s['_'] && s['_'].v === vid) delete s['_'];     // 곡이 생기기 전 기록은 넘겨받았다
      const keys = Object.keys(s);
      if(keys.length > 60) keys.sort((x, y)=>(s[x].at || 0) - (s[y].at || 0))
                               .slice(0, keys.length - 60).forEach(x => delete s[x]);
      try{ localStorage.setItem(KEY, JSON.stringify(s)); }catch(e){}
    }, 400);
  }

  function send(cmd, o){
    if(!frame || !frame.contentWindow) return;
    try{ frame.contentWindow.postMessage(Object.assign({mai:'yt', cmd}, o || {}), TARGET); }catch(e){}
  }
  function err(msg, noLink){
    const e = $('cpErr');
    if(!msg){ e.hidden = true; return; }
    $('cpErrMsg').textContent = t(msg);
    $('cpOpen').href = 'https://www.youtube.com/watch?v=' + encodeURIComponent(vid) + (cur > 1 ? '&t=' + Math.floor(cur) + 's' : '');
    $('cpOpen').hidden = !vid || !!noLink;
    e.hidden = false;
  }
  function sync(){
    const on = ready && !!vid;
    ['cpBack5','cpBack2','cpPlay','cpA','cpB'].forEach(id => $(id).disabled = !on);
    $('cpLoop').disabled = !(on && A != null && B != null);
    if(loop && (A == null || B == null)) loop = false;
    $('cpLoop').setAttribute('aria-pressed', loop ? 'true' : 'false');
    $('cpPlayPath').setAttribute('d', ytOn ? 'M6.5 4.5h4v15h-4zM13.5 4.5h4v15h-4z' : 'M7 4.5v15l13-7.5z');
    $('cpPlay').setAttribute('aria-label', t(ytOn ? '일시정지' : '재생'));
    $('cpTime').textContent = fmt(cur) + ' / ' + fmt(dur);
    $('cpAB').textContent = (A != null ? 'A ' + fmt1(A) : '') + (B != null ? '  B ' + fmt1(B) : '');
    $('cpABClear').hidden = (A == null && B == null);
    pane.classList.toggle('has-vid', !!vid && !!frame && !urlOpen);
    $('cpChange').hidden = !(vid && frame) || urlOpen;
    $('cpA').classList.toggle('sel', A != null);
    $('cpB').classList.toggle('sel', B != null);
    pane.querySelectorAll('#cpRates button').forEach(b => b.classList.toggle('sel', Math.abs(+b.dataset.r - rate) < 0.01));
  }

  function open(id, t0, st){
    err('');
    vid = id; ready = false; ytOn = false; dur = 0;
    cur = t0 || 0;
    rate = (st && st.r) || 1;
    A = st && st.a != null ? st.a : null;
    B = st && st.b != null ? st.b : null;
    loop = !!(st && st.l);
    songOf = songNow();
    $('cpEmpty').style.display = 'none';
    want = {id, t:cur, rate};
    if(!frame){
      frame = document.createElement('iframe');
      frame.title = 'YouTube';
      frame.allow = 'autoplay; encrypted-media; picture-in-picture';
      frame.setAttribute('allowfullscreen', '');
      frame.src = SRC;
      $('cpBox').appendChild(frame);
    } else if(booted){ send('load', want); want = null; }
    sync(); save();
  }

  window.addEventListener('message', e=>{
    if(!frame || e.source !== frame.contentWindow) return;
    const m = e.data;
    if(!m || m.mai !== 'yt' || !m.ev) return;
    if(m.ev === 'boot'){ booted = true; if(want){ send('load', want); want = null; } return; }
    if(m.ev === 'ready'){ ready = true; dur = +m.d || 0; err(''); if(!shown) send('pause'); }
    else if(m.ev === 'state'){
      ytOn = m.s === 1;
      if(ytOn && !shown) send('pause');            // 숨은 상태에서는 소리를 내지 않는다
    }
    else if(m.ev === 'time'){
      cur = +m.t || 0; if(+m.d) dur = +m.d;
      if(loop && A != null && B != null && B > A && ytOn && cur >= B) send('seek', {t:A});
      save();
    }
    else if(m.ev === 'rate'){ rate = +m.r || 1; save(); }
    else if(m.ev === 'error'){
      ready = false; ytOn = false;
      const c = m.code;
      err(c === 101 || c === 150 ? '이 영상은 다른 앱에서 재생하지 못하게 막혀 있습니다.'
        : c === 2 ? '유튜브 링크를 알아볼 수 없습니다.'
        : c === 'net' ? '인터넷에 연결되어 있지 않습니다.'
        : c === 5 || c === 100 ? '재생할 수 없는 영상입니다.'
        : '플레이어를 열 수 없습니다.');
    }
    sync();
  });

  function load(){
    const v = $('cpUrl').value;
    const p = parseLink(v);
    if(!p){ err('유튜브 링크를 알아볼 수 없습니다.', true); return; }     // 띄워 둔 영상은 그대로 둔다
    urlOpen = false;
    $('cpUrl').blur();
    if(p.id === vid && frame){ if(p.t) send('seek', {t:p.t}); sync(); return; }
    track('copy-load');
    open(p.id, p.t, null);
  }
  $('cpLoad').onclick = load;
  $('cpChange').onclick = ()=>{ urlOpen = true; sync(); const u = $('cpUrl'); u.focus(); u.select(); };
  // 아무것도 안 바꾸고 나가면 다시 접는다
  $('cpUrl').addEventListener('blur', ()=> setTimeout(()=>{
    if(!urlOpen || document.activeElement === $('cpLoad')) return;
    const p = parseLink($('cpUrl').value);
    if(!p || p.id === vid){ urlOpen = false; if(vid) $('cpUrl').value = 'https://youtu.be/' + vid; err(''); sync(); }
  }, 150));
  $('cpUrl').addEventListener('keydown', e=>{ if(e.key === 'Enter'){ e.preventDefault(); load(); } });
  // 붙여넣자마자 불러온다 — 아이패드에서 "붙여넣기 → 불러오기" 두 번 누를 일을 줄인다
  $('cpUrl').addEventListener('paste', ()=> setTimeout(()=>{ if(parseLink($('cpUrl').value)) load(); }, 0));

  /* 영상을 틀면 악보 재생은 멈춘다 — 둘이 겹치면 어느 쪽도 안 들린다 */
  $('cpPlay').onclick  = ()=>{ if(!ready) return;
    if(!ytOn && playing) stopPlay();          // 전역 playing = 악보 재생 중
    send(ytOn ? 'pause' : 'play'); };
  const back = n => { if(!ready) return; cur = Math.max(0, cur - n); send('seek', {t:cur}); sync(); };
  $('cpBack5').onclick = ()=>back(5);
  $('cpBack2').onclick = ()=>back(2);
  $('cpRates').addEventListener('click', e=>{
    const b = e.target.closest('button[data-r]'); if(!b) return;
    rate = +b.dataset.r; send('rate', {r:rate}); sync(); save();
  });
  $('cpA').onclick = ()=>{ A = Math.round(cur * 10) / 10; if(B != null && B <= A) B = null; sync(); save(); };
  $('cpB').onclick = ()=>{
    const b = Math.round(cur * 10) / 10;
    if(A == null) A = 0;
    if(b <= A){ toast(t('끝점(B)은 시작점(A)보다 뒤여야 합니다.')); return; }
    B = b; loop = true; sync(); save();
  };
  $('cpLoop').onclick = ()=>{
    if(A == null || B == null){ toast(t('A와 B를 먼저 찍으세요.')); return; }
    loop = !loop; if(loop && ready) send('seek', {t:A}); sync(); save();
  };
  $('cpABClear').onclick = ()=>{ A = B = null; loop = false; sync(); save(); };

  /* 모드가 부른다. 들어올 때 이 곡에 기억된 영상이 있으면 다시 띄운다 */
  window.copyShow = function(on){
    on = !!on;
    if(on === shown) return;
    shown = on;
    pane.style.display = on ? '' : 'none';
    if(!on){ if(ytOn) send('pause'); return; }
    const all = store();
    const st = all[songNow()] || all['_'];        // '_' = 곡 항목이 생기기 전에 연 영상
    if(st && st.v && (st.v !== vid || songOf !== songNow())){
      $('cpUrl').value = 'https://youtu.be/' + st.v;
      open(st.v, st.t || 0, st);
    } else if(!st && songOf && songOf !== songNow() && vid){
      // 다른 곡으로 왔는데 이 곡엔 기억이 없다 — 앞 곡 영상을 붙여 두지 않는다
      if(ytOn) send('pause');
      vid = ''; ready = false; songOf = null;
      if(frame){ frame.remove(); frame = null; booted = false; }
      $('cpUrl').value = ''; $('cpEmpty').style.display = ''; err('');
    }
    sync();
  };
  window.ytPause = ()=>{ if(ytOn) send('pause'); };
  document.addEventListener('visibilitychange', ()=>{ if(document.hidden && ytOn) send('pause'); });
  sync();
})();

const SITE = location.origin;
if(IS_NATIVE){
  document.addEventListener('click', e=>{
    const a = e.target && e.target.closest && e.target.closest('a[href]');
    if(!a) return;
    let href = a.getAttribute('href');
    if(!href || href.charAt(0) === '#') return;
    if(href.charAt(0) === '/') href = SITE + href.replace(/\.html$/, '');
    if(!/^https?:/i.test(href)) return;
    const P = window.Capacitor && window.Capacitor.Plugins;
    if(!P || !P.Browser) return;         // 플러그인이 없으면 기본 동작에 맡긴다
    e.preventDefault();
    P.Browser.open({url: href}).catch(()=>{});
  }, true);
}

/* 이어서 열기.
   저장된 작업이 있으면 그걸 쓰고, 없을 때만 시범용 4마디(demoSong)를 깔아 준다.
   순서가 중요하다 — 프리셋을 먼저 깔고 복구하면 한순간 남의 악보가 보인다.

   순서: 색인 읽기 → 옛 초안 이관 → 현재 곡 복구.
   이관을 복구보다 **먼저** 해야 예전 사용자가 자기 작업을 그대로 이어받는다. */
function bootLibrary(){
  libLoad();
  libMigrate();
  shelfLoad();
  const _restored = restoreDraft();
  if(_restored) shelfTouch(lib.cur);
  if(!_restored){
    measures = demoSong();
    // 제목도 같이 깐다. **곡 항목을 만들지는 않는다** — 그건 첫 저장 때다(바로 아래 주석).
    // 그래서 아무것도 안 한 사람의 곡 목록에 예제가 박히지 않는다
    const _te = document.getElementById('titleInput');
    if(_te) _te.value = t(DEMO_TITLE);
  }
  // 곡 항목은 여기서 안 만든다 — 첫 저장 때 saveDraft()가 만든다.
  // 그래야 시범용 8비트가 사용자의 첫 곡으로 박히지 않는다

  // Restore/demo initialization must synchronize chips and the total-bars field
  // as well as SVG/grid. refreshAll only renders; it does not save or commit.
  refreshAll();
  refreshEditBtns(); refreshRangeBtn();
  _cur = snapshot();          // 히스토리 기준점
  refreshUndoBtns();

  if(_restored){
    scrollScoreTo(selMeasure, true);
    // 복구했다는 사실과 **다음 길**을 같이 준다. 자동 저장을 처음 겪는 사람에게
    // 이 한 줄이 없으면 "왜 지난번 게 그대로 있지?"가 된다.
    // 라이브러리가 생긴 뒤로 여기서 줄 길은 "새로 시작"(덮어쓰기)이 아니라 "곡 목록"이다
    setTimeout(()=> toast('지난 작업을 <b>이어서</b> 열었습니다.', SHELF_ON ? '라이브러리' : '곡 목록', openLib), 400);
  }
}

/* 앱에서는 **미러 복구를 먼저** 끝낸 뒤에 라이브러리를 연다.
   순서를 바꾸면 저장소가 비워진 기기에서 시범용 8비트가 먼저 깔리고, 그 뒤에
   복구된 곡이 덮어써서 "한순간 남의 악보가 보인다" — 위 주석이 경계하는 그 장면이다.
   복구가 실패해도 앱은 떠야 하므로 어느 쪽으로 끝나든 bootLibrary를 부른다. */
if(IS_NATIVE){ nativeRestore().then(bootLibrary, bootLibrary); }
else{ bootLibrary(); }

/* 구매 상태. **악보를 먼저 띄우고 나서** 확인한다 — 스토어 응답을 기다리느라
   첫 화면이 늦어지면 안 된다. 캐시로 먼저 칠하고, 답이 오면 덮어쓴다 */
proSync();

/* 언어는 **맨 마지막에** 먹인다. 그 전에 만들어진 화면까지 한 번에 훑기 위해서다.
   한국어면 `t`가 항등이라 어느 노드도 안 건드린다 — 값이 같으면 쓰지 않는다. */
applyLang();
if(typeof refreshLangUI === 'function') refreshLangUI();
