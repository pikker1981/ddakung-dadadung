/* ================= 악보 렌더링 (SVG) ================= */
const SVG_NS = 'http://www.w3.org/2000/svg';
const svg = document.getElementById('scoreSvg');
const LG = 9;                 // 오선 간격
/* INK는 위쪽 `PAPERS` 구역에서 `let`으로 선언한다 — 악보 배경색 설정이 바꾼다 */
/* 기하값은 한 덩어리로 묶어 둔다. 화면용과 출력용이 서로 다른 값으로 그리기 때문에
   전역 변수를 흩어 두면 출력 한 번에 화면 좌표가 오염된다. */
let GEO = {SLOT_W:23, BEAT_GAP:7, M_PAD:16, CLEF_W:62, MEASURE_W:0};
const SYS_H = 150, TOP_PAD = 26;
/* ── 출력 고정 배치의 기하값 (2026-09-02에 한 곳으로 모음) ───────────
   값이 화면보다 촘촘한 이유: 인쇄물은 SVG를 종이 폭에 맞춰 축소하므로 한 마디가
   넓을수록 오선 자체가 작아진다. 마디폭/오선높이 비를 7 언저리로 맞춰야 A4 세로
   4마디에서 오선 높이가 약 6mm(악보 표준)로 떨어진다. slot 22로 두면 4마디 폭이
   1692px이 되어 오선이 4mm까지 줄었다. 2마디 이하는 넉넉하게 간다.

   **`paint`와 페이지 예산이 같은 값을 봐야 한다.** 예전에는 이 숫자가 paint 안에만
   있어서 페이지 예산이 "한 장에 열 단"이라는 고정값을 따로 들고 있었고, 둘이
   어긋나면 종이 밖으로 밀린 단이 소리 없이 잘렸다(2026-09-02 제보). */
const PRINT_GEO = {slot:14, gap:4, pad:9, clef:48};   // 첫 음표 x=63, 박자표 끝 ≈40 — 안 물린다
const PRINT_GEO_WIDE = {slot:22, gap:7, pad:16, clef:64};
function printGeo(perLine){ return perLine <= 2 ? PRINT_GEO_WIDE : PRINT_GEO; }
/* 인쇄 영역은 웹(`@media print`)과 앱(`body.pdf-out.pdf-pt`) 두 벌 모두 182 x 269mm다.
   SVG는 `width:100%`라 가로 182mm에 딱 맞춰 늘어난다 — 즉 **1px = 182/svgW mm**이고,
   세로로 쓸 수 있는 픽셀은 `svgW * 269/182`다. 265로 잡는 건 프린터의 물리적 여백과
   반올림 몫으로 4mm를 남기려는 것. 이 4mm가 "빠듯하게 들어갔다"와 "반만 나갔다"를 가른다. */
const PRINT_W_MM = 182, PRINT_H_MM = 265;
/* 한 장에서 쓸 수 있는 세로 픽셀. **설계 폭 기준**이다 — 실제 SVG는 설계 폭보다
   좁아지지 않으므로(`fillW`가 바닥) 이 값은 늘 하한이고, 그래서 넘칠 일이 없다. */
function printBudgetPx(perLine){
  const p = Math.max(1, perLine|0), g = printGeo(p);
  return (g.clef + p*(g.pad*2 + 16*g.slot + 3*g.gap) / zoomF() + 8) * PRINT_H_MM / PRINT_W_MM;   // 악보 크기만큼 설계 폭이 좁다 — paint의 fullW와 한 쌍
}
let slotXCache = [];          // [measureIdx] => {x0, top} — 화면 렌더에서만 채운다
let SVGT = null;              // 현재 그리는 대상 SVG

function el(name, attrs){
  const e = document.createElementNS(SVG_NS, name);
  for(const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}
function yOf(pos, top){ return top + pos*LG/2; }

/* ── 펜슬 메모 그리기 (2026-08-17) ──
   획 좌표는 마디에 상대적이다(fx=마디 폭 비율, fy=LG 단위) — 그래서 화면·인쇄·
   PNG·영상이 **같은 이 함수 하나로** 그려진다. paint 루프에서 drawMarks 다음에 부른다.
   'ink' 색은 지금 배경의 먹색(INK)을 따라간다 — 어두운 배경에서도 보인다. */
const INK_COLORS = {red:1, blue:1, ink:1};
function inkColor(c){
  return c === 'blue' ? '#4C8DFF' : c === 'ink' ? INK : '#E5484D';
}
/* ── 셈여림·헤어핀 그리기 (1.8) ──
   줄 하나를 통째로 받는다(헤어핀이 여러 마디에 걸치므로 마디 단위로는 못 그린다).
   items = 이 줄의 마디들 [{mi, cx, mx, MW, multi}] — paint 루프가 모은다. ROW_MUL이 걸린 채로 부른다.
   자리는 오선 아래 셈여림 층(MARK_Y.dyn, markLevels가 잡는다) */
const DYN_S = 0.95;                         // 셈여림 글자 크기(LG/9 배수에 곱한다)
function dynWidth(v){
  const s = LG/9 * DYN_S;
  return v.split('').reduce((w, ch) => w + (DYN_GLYPH[ch] ? DYN_GLYPH[ch].adv : 0), 0) * s - 1.5*s*(v.length-1);
}
function drawDynText(v, x, y){
  const s = LG/9 * DYN_S;
  let gx = x;
  v.split('').forEach(ch=>{
    const g = DYN_GLYPH[ch]; if(!g) return;
    SVGT.appendChild(el('path',{d:g.d, fill:INK, class:'dyn',     // class는 검사용 표식
      transform:`translate(${+gx.toFixed(2)} ${y})` + (s !== 1 ? ` scale(${+s.toFixed(4)})` : '')}));
    gx += (g.adv - 1.5) * s;
  });
}
function dynBeatX(it, b){
  const m = measures[it.mi];
  if(it.multi || !b) return it.multi ? it.mx + 8 : xAtPos(it.cx, 0, m);
  return xAtPos(it.cx, Math.min(b, beatCount(m) - 1), m);
}
function drawDynRow(items, bottom){
  if(!items.some(it => { const m = measures[it.mi]; return m && (m.dyn || m.hp); })) return;
  const y = bottom + MARK_Y.dyn, yc = y - 3.6, H = 5.4;   // 열린 끝 10.8 = 1.2sp (MuseScore 기본)
  const dynAt = {};                         // mi → [x0, x1] 셈여림 글자가 차지한 자리
  items.forEach(it=>{
    const m = measures[it.mi];
    if(!m || !DYN_OK.includes(m.dyn)) return;
    const x = dynBeatX(it, m.dynB|0) - 4;
    drawDynText(m.dyn, x, y);
    dynAt[it.mi] = [x, x + dynWidth(m.dyn), m.dynB|0];
  });
  /* 헤어핀 — 같은 기호가 이어진 마디 묶음. 줄을 넘으면 이 줄 몫만 긋고, 벌어짐은
     묶음 전체에서의 자리로 정한다(다음 줄은 벌어진 채 시작한다 — 인쇄 악보 관례) */
  const hpOf = mi => { const m = measures[mi]; return m && HP_OK.includes(m.hp) ? m.hp : null; };
  /* mi가 앞 마디(mi-1)의 헤어핀에 이어지는가 — 같은 기호이고 hpS(여기서 새로, 1.9)가 없을 때 */
  const joins = mi => mi > 0 && hpOf(mi) && hpOf(mi) === hpOf(mi - 1) && !measures[mi].hpS;
  for(let i = 0; i < items.length; i++){
    const it = items[i], type = hpOf(it.mi);
    if(!type) continue;
    let j = i;
    while(j + 1 < items.length && joins(items[j+1].mi) && items[j+1].mi === items[j].mi + (items[j].multi || 1)) j++;
    const a = items[i], z = items[j];
    let S = a.mi; while(joins(S)) S--;
    let E = z.mi + (z.multi || 1) - 1; while(E + 1 < measures.length && joins(E + 1)) E++;
    const total = E - S + 1;
    const contL = S < a.mi, contR = E > z.mi + (z.multi || 1) - 1;
    let x1;
    if(contL) x1 = a.mx + 4;
    else {
      const hb = measures[a.mi].hpB|0;
      x1 = dynBeatX(a, hb);
      const d = dynAt[a.mi];
      if(d && d[2] === hb) x1 = d[1] + 4;    // 같은 자리 셈여림 글자 뒤에서 시작한다
    }
    let x2 = z.mx + z.MW - (contR ? 2 : 7);
    const nmi = z.mi + (z.multi || 1);
    if(!contR && dynAt[nmi] && dynAt[nmi][2] === 0) x2 = Math.min(x2, dynAt[nmi][0] - 4);  // 이어지는 셈여림 글자 앞에서 멈춘다
    const startMeas = measures[S].hpB ? (measures[S].hpB / beatCount(measures[S])) : 0;
    const f1 = contL ? (a.mi - S) / total : startMeas / total;
    const f2 = (z.mi + (z.multi || 1) - S) / total;
    const open = f => type === '<' ? f : 1 - f;
    const hA = contL ? H * open(f1) : (type === '<' ? 0 : H);
    const hB = contR ? H * open(f2) : (type === '<' ? H : 0);
    if(x2 - x1 < 8){ i = j; continue; }
    const ln = (y1a, y2a)=> SVGT.appendChild(el('line',{x1:+x1.toFixed(2), y1:+y1a.toFixed(2), x2:+x2.toFixed(2), y2:+y2a.toFixed(2),
      stroke:INK, 'stroke-width':1.1, 'stroke-linecap':'round', class:'hp'}));
    ln(yc - hA, yc - hB); ln(yc + hA, yc + hB);
    i = j;
  }
}
function drawInk(m, mx, top, MW){
  if(!m.ink || !SVGT) return;
  for(const s of m.ink){
    const P = s.p;
    if(!P || P.length < 2) continue;
    const X = i => mx + P[i][0]*MW, Y = i => top + P[i][1]*LG;
    /* 이차 곡선 중점 스무딩 — 각 점을 제어점으로, 이웃 중점을 끝점으로 */
    let d = 'M' + X(0).toFixed(1) + ' ' + Y(0).toFixed(1);
    for(let i = 1; i < P.length - 1; i++){
      d += 'Q' + X(i).toFixed(1) + ' ' + Y(i).toFixed(1) + ' '
         + ((X(i)+X(i+1))/2).toFixed(1) + ' ' + ((Y(i)+Y(i+1))/2).toFixed(1);
    }
    d += 'L' + X(P.length-1).toFixed(1) + ' ' + Y(P.length-1).toFixed(1);
    SVGT.appendChild(el('path', {d, fill:'none', stroke: inkColor(s.c),
      'stroke-width': s.w === 2 ? 2.6 : 1.4, 'stroke-linecap':'round',
      'stroke-linejoin':'round', opacity: 0.92, 'pointer-events':'none',
      'data-ink': 1}));
  }
}

/* 악보를 target SVG에 그린다.
   o = {availW, perLine:'auto'|숫자, from, to, title, cache}
   반환값은 그려진 SVG의 자연 폭(px). */
function titleCymbalClearance(seen,head,need){
  // The outer pad moves both title and staff. Reserve a separate header gap
  // when the added upper cymbal rows would otherwise beam through the title.
  return head>0&&seen.some(m=>m&&['splash','china','fx'].some(id=>(m[id]||[]).some(Boolean)))
    ? Math.max(0,Math.ceil(-need)-35) : 0;
}
function paint(target, o){
  const prevT = SVGT;
  SVGT = target;
  target.innerHTML = '';
  const from = o.from|0;
  const to = (o.to == null) ? measures.length : o.to;
  const n = Math.max(1, to - from);
  let slot, gap, pad, clef, perLine;
  if(o.perLine === 'auto'){
    // 좁은 화면에서는 슬롯을 좁혀 한 마디가 통째로 들어가게 한다
    const narrow = o.availW < 560;
    slot = narrow ? 18 : 23;
    gap  = narrow ? 5  : 7;
    pad  = narrow ? 12 : 16;
    clef = narrow ? 52 : 62;
    const fit = (s,g,p,c)=>Math.max(1, Math.floor((o.availW - c) / (p*2 + 16*s + 3*g)));
    perLine = fit(slot, gap, pad, clef);
    // 넓은 화면에서 한 줄에 한 마디만 들어가면 세로로만 길어져서 악보로 안 읽힌다.
    // (아이패드 62% 칼럼 588px에서 slot 23이면 정확히 1마디였다)
    // CRT 화면은 최대 4마디, 기존 화면은 2마디까지 간격만 조정한다. 음표 머리 크기는 유지한다.
    // 폰(narrow)은 어떤 값으로도 2마디가 안 되므로 건드리지 않는다.
    const screenTarget = o.maxPerLine ? Math.min(o.maxPerLine, fit(14,4,9,48)) : 2;
    if(!narrow && perLine < screenTarget){
      const CAND = [[19,6,14,58],[16,5,11,52],[14,4,9,48]];
      for(const c of CAND){
        if(fit(c[0],c[1],c[2],c[3]) >= screenTarget){ slot=c[0]; gap=c[1]; pad=c[2]; clef=c[3]; perLine=fit(c[0],c[1],c[2],c[3]); break; }
      }
    }
  } else {
    // 출력용 고정 레이아웃. 줄당 마디 수를 먼저 정하고 폭은 거기서 나온다.
    // 값이 화면보다 촘촘한 이유: 인쇄물은 SVG를 종이 폭에 맞춰 축소하므로
    // 한 마디가 넓을수록 오선 자체가 작아진다. 마디폭/오선높이 비를 7 언저리로
    // 맞춰야 A4 세로 4마디에서 오선 높이가 약 6mm(악보 표준)로 떨어진다.
    // slot 22로 두면 4마디 폭이 1692px이 되어 오선이 4mm까지 줄었다.
    perLine = Math.max(1, o.perLine);
    const g = printGeo(designPerLine(perLine));   // 표식이 없으면 perLine 그대로
    slot = g.slot; gap = g.gap; pad = g.pad; clef = g.clef;
  }
  GEO = {SLOT_W:slot, BEAT_GAP:gap, M_PAD:pad, CLEF_W:clef,
         MEASURE_W: pad*2 + 16*slot + 3*gap};
  /* 마디 폭이 마디마다 다를 수 있다(32분 박이 넓다). 한 번 재서 들고 다닌다.
     `GEO.MEASURE_W`는 이제 **기본 마디 폭**일 뿐이라 배치에 쓰지 않는다. */
  ROW_MUL = 1;                       // 마디 폭은 **자연 폭**으로 잰다(늘리기 전 값)
  _bwToken++;                        // 박 폭 캐시를 이 그림 기준으로 새로 잡는다
  const MWs = [];
  for(let i=from; i<to; i++) MWs[i] = measureW(measures[i], i);

  /* ── 줄 나누기 — 마디 수가 아니라 **폭**으로 자른다 (2026-08-15) ──
     `auto`도 고정 배치도 "줄이 정해진 폭을 넘지 않게" 채운다.
     마디 폭이 다 같으면 예전 결과와 **완전히 같다** — `auto`는 `floor((availW-clef)/MW)`,
     고정은 `perLine`개가 정확히 들어차서 예전 잘라내기와 한 마디도 안 다르다.

     **고정 배치에서 마디 수를 안 지키는 이유** (사용자 결정, 실제 악보 관례):
     32분이 든 마디는 1.8배 넓다. 4마디를 고집하면 그 줄만 넓어져 SVG 전체가
     종이 폭에 맞춰 축소되고, **오선 높이가 6mm 아래로 떨어진다** — A4 세로가 깨진다.
     그래서 `perLine`은 이제 **정확한 개수가 아니라 설계 폭**(`perLine * 기본 마디 폭`)이다.
     넓은 마디가 끼면 그 줄만 3마디 또는 2마디가 되고, **줄 폭과 오선 높이는 그대로 유지된다.**

     **짝수를 우선한다.** 곡이 보통 8·16·32마디라 줄이 짝수로 떨어져야 마지막이 딱 맞는다.
     `perLine`이 짝수일 때만 건다 — 사용자가 홀수를 고르면 그건 그대로 지킨다.
     마지막 줄처럼 남은 게 그것뿐이면 **홀수도 그대로 받는다**(줄을 더 늘리는 게 더 나쁘다).

     줄마다 마디 수가 다를 수 있으므로 **`ln*perLine`으로 마디 번호를 되짚지 말 것** —
     `rows[ln]`에 번호가 그대로 들어 있다. */
  /* 그리기 단위(칸). 보통은 마디 하나 = 칸 하나라 units[u].mi === from+u 이고 아래가 예전과
     같다. 멀티레스트가 켜져 있으면 빈 마디 묶음이 칸 하나(폭 = 기본 마디 폭)가 된다 */
  /* 영상 띠(o.oneRow, 2026-09-14): 줄을 끊는 것(구간 새 줄·마디별 새 줄·설계 폭)과
     멀티레스트 묶기를 전부 무시하고 **마디 전부를 한 줄에** 놓는다. 띠는 시간축이라
     줄을 끊으면 안 되고, 묶으면 재생선이 그 구간만 n배 빨라진다 */
  const oneRow = !!o.oneRow;
  const ZF = (oneRow || o.noZoom || o.perLine === 'auto') ? 1 : zoomF();   // 악보 크기 — auto는 renderScore가 availW로 처리
  const units = [];
  for(let i=from; i<to; ){
    const n = oneRow || o.unfoldRests ? 1 : mrestRun(i, to);
    units.push({mi:i, n, w: n > 1 ? GEO.MEASURE_W : MWs[i]});
    i += n;
  }
  const UW = units.map(u => u.w);
  const nU = units.length;
  const uBreak = (u)=> lineBreakAt(units[u].mi);
  const rowsU = [];
  if(oneRow){
    rowsU.push(Array.from({length: nU}, (_,k)=> k));
  } else if(o.screenColumns===2){
    // iPad's four-measure overview keeps two columns even when a dense measure
    // or a document line/section break would split an automatic screen row.
    for(let u=0;u<nU;u+=2)rowsU.push(Array.from({length:Math.min(2,nU-u)},(_,k)=>u+k));
  } else if(o.perLine === 'auto'){
    let u = 0;
    while(u < nU){
      const row = [u]; let w = UW[u]; u++;
      while(u < nU && row.length < (o.maxPerLine || Infinity) && clef + w + UW[u] <= o.availW && !uBreak(u)){ row.push(u); w += UW[u]; u++; }
      rowsU.push(row);
    }
  } else {
    /* 줄마다 마디 수가 다를 수 있다(m.ln) — 표식이 없으면 전부 perLine이라 예전과 같다 */
    const lnEff = lnEffTable(perLine);
    /* **문턱을 딱 자르면 안 된다.** 32분이 한 박만 들어가도 4마디 합이 설계 폭을
       4.4% 넘는데, 그것 때문에 줄이 4→2로 떨어지면 페이지가 절반 빈다.
       그 정도는 그냥 받는다 — 넘친 만큼 SVG가 축소될 뿐이고, 5%면
       A4 세로에서 오선이 6.00 → 5.72mm다. 눈에 안 띈다.
       크게 넘치는 경우(마디가 통째로 32분)만 줄을 나눈다. */
    let u = 0;
    while(u < nU){
      const rowN = lnEff[units[u].mi] || perLine;
      const base = rowN * GEO.MEASURE_W / ZF; // 이 줄의 설계 폭 — 악보 크기(ZF)만큼 좁힌다
      const cap = base * 1.05;
      const wantEven = rowN % 2 === 0;
      // 한 마디가 설계 폭보다 넓으면 어쩔 수 없이 혼자 한 줄을 쓴다(그 줄만 넓어진다)
      let c = 1, w = UW[u];
      while(u + c < nU && c < rowN && w + UW[u+c] <= cap + 1e-6 && !uBreak(u+c)){ w += UW[u+c]; c++; }
      /* 짝수로 내리되, **줄이 너무 비면 그만둔다.** 3→2로 내리는 값이 25%짜리
         빈 자리면 프레이즈를 지키는 값보다 손해다. 사용자 말 그대로
         "어쩔 수 없는 경우에는 홀수도 용납". */
      if(wantEven && c >= 3 && c % 2 === 1 && (nU - u) > c){
        let w2 = 0;
        for(let k=0; k<c-1; k++) w2 += UW[u+k];
        if(w2 >= base*0.7) c--;
      }
      rowsU.push(Array.from({length: c}, (_,k)=> u+k));
      u += c;
    }
  }
  // 마디 번호 줄(rows) — 페이지 나누기·o.rows·markLevels가 보는 것. 묶음은 마디 전부를 편다
  const rows = rowsU.map(r => r.flatMap(u => Array.from({length: units[u].n}, (_,k)=> units[u].mi + k)));
  /* 줄 나누기 결과를 밖으로 흘려 준다 — **페이지 나누기가 이걸 봐야 한다.**
     줄을 몇 개로 자를지는 여기(폭 계산)만 알고, `exportPages`는 그걸 모르는 채
     마디 수로 페이지를 잘랐다가 맨 아래 단을 잘라 먹었다(2026-09-02). */
  if(o.rows) rows.forEach(r => o.rows.push(r));
  const rowW = rowsU.map(r => r.reduce((s,u)=> s + UW[u], 0));
  const lines = rows.length;
  const taps = [];
  const title = (o.title || '').trim();
  /* ── 머리말 (2026-08-27) ──
     상용 악보 관례(Gould, *Behind Bars*): 제목·부제는 가운데,
     **작사는 왼쪽 / 작곡·편곡은 오른쪽**, 저작권은 지면 맨 아래.
     왼쪽·오른쪽으로 가르는 건 취향이 아니라 관례다 — 눈이 찾는 자리가 정해져 있다.

     ★ **제목만 있는 옛 악보는 높이 30 그대로다.** 아래 계산이 `sub`도 `크레딧`도
     없을 때 정확히 예전 값으로 떨어지도록 짜여 있다. svgdump 바이트 비교가
     여기에 걸려 있으니 순서를 바꾸지 말 것. */
  const HB = headBlock(title, o.meta || null);
  const {subT, cred, subY, credY} = HB;
  let titleH = HB.h;
  const copyT = (o.copyright || '').trim();
  const copyH = copyT ? 20 : 0;
  /* 위쪽 여백. 첫 단은 위에 여유가 없어서 그대로 두면 **viewBox 밖으로 잘린다** —
     실제로 구간 상자가 잘렸고, 셋잇단 숫자도 2px씩 잘리고 있었다(오래된 버그).
     `markLevels()`가 이 구간에 실제로 필요한 높이를 재고 표시 층까지 잡아 준다.
     기본 34(빔 꼭대기)를 넘는 만큼만 문다 — 필요 없으면 한 px도 안 문다.
     둘째 단부터는 앞 단의 남는 자리(SYS_H)를 쓰므로 계산에 안 넣는다. */
  const need = markLevels(measures.slice(from, to));
  titleH += titleCymbalClearance(measures.slice(from,to),titleH,need);
  // 35 = 하이햇 빔 꼭대기(34.5)의 올림. 원래 TOP_PAD가 감당하던 높이라 여기까진 공짜다
  const pad0 = TOP_PAD + Math.max(0, Math.ceil(-need) - 35);
  // 발 성부가 예전보다 깊어진 만큼 단 간격을 넓힌다 (0이면 예전과 완전히 같다)
  const sysH = SYS_H + (MARK_Y.extra || 0) + lineGap();
  /* ── 줄을 폭에 맞춰 늘린다 (justify, 2026-08-15 사용자 결정) ──
     32분 때문에 줄마다 마디 수가 달라지면 끝나는 자리가 제각각이라 들쭉날쭉해 보인다.
     인쇄 악보는 **모든 단을 같은 폭으로 늘린다.** 마지막 단은 짧을 때만 자연 폭으로 둔다
     (아래 `LAST_FILL`). 처음엔 마지막 단을 무조건 안 늘렸는데, 8마디 곡처럼
     단이 둘뿐이면 그게 곧 악보의 절반이라 **한쪽만 짧은 그림**이 됐다.

     **기존 악보는 그대로다.** 32분이 없으면 모든 줄이 이미 설계 폭에 꽉 차서
     배수가 정확히 1.0이고(1016/1016), 마지막 줄은 원래 안 늘린다.
     `Math.min(perLine, n)`은 옛 식 그대로 — 곡이 한 줄보다 짧으면 그만큼만 잡는다.

     **화면 `auto`는 안 늘린다.** 종이처럼 채워야 할 폭이 없고, 늘리면 기존 화면이 바뀐다.
     늘어난 배수는 **`slotXCache`에 같이 담는다** — 재생선이 이 캐시로 x를 구하는데
     배수를 모르면 32분이 든 악보 모드에서 커서가 어긋난다. */
  const isFixed = (o.perLine !== 'auto');
  /* 고정 배치(인쇄·악보 모드)는 **설계 폭**을 바닥으로 잡고, 화면 `auto`는 **카드 폭**을 잡는다.
     인쇄 악보의 단이 늘 페이지 폭을 채우는 것과 같다.
     비례 배치 전에는 안 늘려도 줄이 저절로 꽉 찼는데, 이제는 여유로운 마디가 좁아져서
     **안 늘리면 악보가 카드 오른쪽을 비운 채 작게 그려진다**(빈 악보에서 카드의 73%).
     대신 SVG가 카드 폭에 딱 맞으므로 통째 축소가 사라져 **오선이 8% 커진다** —
     가로로 차지하는 자리는 거의 같고(실측 302 → 306px) 세로만 그만큼 커진다. */
  const fullW = isFixed ? Math.min(designPerLine(perLine), n) * GEO.MEASURE_W / ZF
                        : Math.max(1, o.availW - clef - 8);
  /* ── 어디까지 늘릴 것인가 (2026-08-18, 사용자 제보 "세로에서 악보가 안 이쁘다") ──
     고정 배치에서는 **제일 넓은 줄**까지 같이 본다. 32분·16분이 든 줄은 설계 폭을 넘는데,
     그 줄만 길고 나머지가 설계 폭에서 멈추면 오른쪽 끝이 들쭉날쭉해진다
     (실측: 아이패드 세로 8마디에서 1단 1190px · 2단 1030px).
     **SVG 폭은 어차피 제일 넓은 줄이 정한다** — 그 자리는 이미 쓰고 있으므로
     나머지 줄을 거기까지 늘려도 축소율·오선 높이는 1px도 안 변한다. 빈자리만 없어진다. */
  /* 넘친 줄(5% 안)은 이제 **설계 폭으로 눌러 맞춘다** (2026-09-10 간격 공사).
     예전엔 제일 넓은 줄까지 나머지를 늘렸다 — 줄을 누르면 머리가 겹칠 수 있어서였다.
     간격표의 충돌 최소가 그걸 구조로 막으므로, 이제 모든 줄이 설계 폭이고
     오선 높이·페이지당 줄 수가 **어떤 악보에서도 안 변한다.**
     (`target`은 이 함수의 매개변수다 — 겹치면 앱이 안 뜬다) */
  const fillW = fullW;
  /* **마지막 줄은 너무 짧으면 안 늘린다.** 인쇄 악보 관례이고(마지막 단은 자연 폭),
     한 마디만 남은 줄을 페이지 폭까지 늘리면 그 마디만 우스꽝스럽게 벌어진다.
     처음엔 Sibelius·Dorico 값(65%)을 썼는데, 2026-08-29 사용자 악보(99마디,
     마지막 줄 = 빽빽한 두 마디 + 빈 마디 = 64%)가 문턱 바로 아래서 잘리다 만
     것처럼 나갔다. **반 넘게 찼으면 채우는 게 그림이 낫다** — 50%로 내린다.
     반 아래(한두 마디 잔량)는 여전히 자연 폭이다. */
  const LAST_FILL = 0.5;
  /* **겹치기 직전까지만 누른다** (2026-08-17).
     줄이 카드보다 넓으면 가로로 눌리는데(`mul` < 1), 그때 **음표 머리는 안 줄어든다.**
     그래서 눌린 만큼 머리가 서로 겹쳤다 — 폰 390에서 마디 전체가 셋잇단일 때 실측 −0.5px.
     누르는 것 자체는 좋다. 안 누르면 SVG가 넓어져 **악보가 통째로 작아지고**,
     32분이 없는 마디까지 같이 작아진다(실측 오선 8.89 → 7.76px).

     그래서 하한을 "1"이 아니라 **머리가 닿는 지점**으로 잡는다.
     그 줄의 제일 좁은 간격이 머리 폭 + 여백 아래로 안 내려가게만 막는다 —
     평범한 8비트 줄은 간격이 27px이라 애초에 안 걸린다(하한 0.44, 실제 0.86).
     걸리는 건 32분·셋잇단이 빼곡한 줄뿐이고, 그런 줄만 조금 덜 눌린다.

     **고정 배치(인쇄)는 안 건다.** 줄 나누기가 이미 설계 폭의 5%로 넘침을 막고 있어
     `mul`이 0.95 아래로 안 내려간다 — 걸릴 일이 없는데 걸면 `SYS_H`만 흔든다. */
  const rowMul = rows.map((r, ln) => {
    if(!(rowW[ln] > 0)) return 1;
    if(ln === rows.length - 1 && rowW[ln] < fillW * LAST_FILL) return 1;
    /* 늘리기·누르기 모두 solveRowMul이 푼다. 누를 때 충돌 최소에 걸린 gap은 안 줄어들어
       머리가 못 겹친다 — 옛 squeezeFloor·꾸밈음 하한이 전부 간격표 안으로 들어왔다.
       걸린 gap이 있으면 실제 줄 폭이 fillW보다 넓게 남고, 그만큼 svgW가 커져 악보가
       통째로 줄어든다 — 옛 하한과 같은 동작이다. */
    return solveRowMul(rowsU[ln].map(u => units[u].n > 1 ? {fixed: units[u].w} : units[u].mi), fillW);
  });
  /* **설계 폭 아래로는 안 내려간다.** 줄이 그보다 좁으면 인쇄에서 종이 폭에 맞춰
     확대되면서 `SYS_H`까지 커져 `LINES_PER_PAGE = 10`이 깨진다.
     마지막 줄은 안 늘리므로(관례) 한 줄짜리 악보나 짧은 마지막 줄에서 실제로 걸린다 —
     비례 배치가 들어오면서 그 줄이 눈에 띄게 좁아져 이 하한이 꼭 필요해졌다. */
  // 실제 줄 폭 — 충돌 최소에 걸린 gap 때문에 rowW×mul과 다를 수 있다. 오선·svgW·마디선이 다 이 값
  const rowWAt = rowsU.map((r, ln) => r.reduce((sum, u)=> sum + (units[u].n > 1 ? units[u].w * rowMul[ln]
                                                        : measureWAt(measures[units[u].mi], units[u].mi, rowMul[ln])), 0));
  const svgW = clef + Math.max(Math.max(...rowWAt), fillW) + 8;
  /* 둘째 장부터의 머리·발 (2026-09-12 드러머 요청): 위 가운데 작은 제목(running title),
     아래 가운데 쪽 번호 "2 / 3". 첫 장은 제목이 이미 있고 쪽 번호도 안 적는다 — 첫 장의 예산·배치가
     옛 악보와 한 px도 안 달라야 한다(9단이 8단으로 떨어진 실측이 있었다).
     o.pageNo·o.pageCount·o.runTitle은 exportPages만 준다 — 화면·옛 호출부는 전부 0이라 예전 그대로 */
  const runT = (o.pageNo > 1) ? String(o.runTitle || '').trim() : '';
  const runH = runT ? 16 : 0;   // 작은 제목 자리. TOP_PAD(26)가 있어 기호가 글자를 안 문다
  const pnT = (o.pageNo > 1) ? (o.pageNo + ' / ' + o.pageCount) : '';
  const pnH = pnT ? 14 : 0;     // 둘 합쳐 30px — 10단 장(1520)이 예산(1561) 안에 남는 값
  const svgH = pad0 + titleH + runH + lines*sysH + copyH + pnH;
  target.setAttribute('width', svgW);
  target.setAttribute('height', svgH);
  target.setAttribute('viewBox', `0 0 ${svgW} ${svgH}`);
  /* 재즈만 글자를 눕힌다. **뿌리에 한 번** 걸고 글자들이 물려받는다 —
     text마다 붙이면 클래식의 출력 바이트가 달라진다(없던 속성이 생긴다).
     클래식·손사보에서는 removeAttribute라 아무 흔적도 안 남는다. */
  if(ST.italic) target.setAttribute('font-style','italic');
  else target.removeAttribute('font-style');
  if(title){
    /* 26px — 시판 악보의 제목 크기에 맞췄다(2026-08-28). baseline을 +10으로 내려
       큰 글자의 윗부분이 pad0(최소 26px) 안에서 안 잘리게 한다 */
    const tt = el('text',{x:svgW/2, y:pad0+Math.round(10*HB.f), 'font-size':Math.round(26*HB.f), 'font-weight':'700',
      fill:INK, 'text-anchor':'middle'});
    tt.textContent = title;
    target.appendChild(tt);
  }
  const headTx = (x, y, size, anchor2, str, op)=>{
    const e2 = el('text',{x, y, 'font-size':size, fill:INK, 'text-anchor':anchor2,
      'font-family':ST.font, class:'score-metadata'});
    if(op) e2.setAttribute('opacity', op);
    e2.textContent = str;
    target.appendChild(e2);
  };
  if(subT) headTx(svgW/2, pad0+subY, Math.round(12*HB.f), 'middle', subT, .82);
  cred.forEach((c2,i)=> headTx(svgW-10, pad0+credY+i*(11*HB.f), 9.5*HB.f, 'end', c2, .9));
  // 템포 — 왼쪽 위. 크레딧과 같은 높이 띠라 세로 자리를 새로 안 먹는다
  if(HB.tempoT) headTx(6, pad0+credY+8, 11*HB.f, 'start', HB.tempoT, .9);
  /* 저작권은 **지면 맨 아래**다. 머리말이 아니라 각주 자리 — 악보 관례이고,
     위에 두면 제목보다 먼저 눈에 들어온다. */
  if(copyT) headTx(svgW/2, svgH-7, 8.5, 'middle', copyT, .65);
  /* 맨 위 — 첫 단의 기호(R·L·○)는 TOP_PAD+runH 아래에서 시작한다. 16px = 인쇄 약 7.7pt(제목 26px의 6할) */
  if(runT) headTx(svgW/2, 15, 16, 'middle', runT, .75);
  if(pnT) headTx(svgW/2, svgH-6, 13, 'middle', pnT, .7);

  for(let ln=0; ln<lines; ln++){
    const top = pad0 + titleH + runH + ln*sysH + 34;   // 오선 첫 줄 y
    const bottom = top + 4*LG;
    const row = rows[ln];
    ROW_MUL = rowMul[ln];                 // 이 줄의 가로 배수. 아래 루프 끝에서 되돌린다
    const lineEnd = clef + rowWAt[ln];
    // 오선
    for(let l=0;l<5;l++)
      /* seed에 `l`을 넣지 않는다 — 줄마다 따로 흔들면 다섯 줄이 서로 벌어졌다
         좁아졌다 하면서 오선이 **꼬여 보인다**(실측). 손으로 그어도 오선은
         다섯 줄 펜으로 한 번에 긋는다. 단(ln)마다만 다르게 흔든다. */
      target.appendChild(el('line',{x1:6,y1:top+l*LG,x2:lineEnd,y2:top+l*LG,stroke:INK,'stroke-width':ST.staff}));
    /* 퍼커션 클레프(‖)는 **단마다** 그린다. 박자표는 **맨 처음 한 번만**.
       기보 관례다(Gould, Behind Bars) — 박자표는 곡이 시작할 때와 **바뀔 때만** 적는다.
       단마다 4/4가 반복되면 "여기서 박자가 또 바뀌나?"로 읽힌다.
       폰은 한 줄에 한 마디라 4/4가 화면에 다섯 번씩 찍혔다 (2026-08-17 드러머 제보).

       `from > 0`이면 안 그린다 — 출력 2페이지째, 즉 곡 중간에서 시작하는 단이다.
       인쇄물 2페이지에 박자표를 다시 적지 않는 것과 같은 이유다.
       **왼쪽 여백(clef)은 그대로 둔다.** 단마다 폭이 달라지면 마디가 세로로 안 맞고,
       줄 나누기 계산까지 흔들린다. 박자표 자리는 그냥 여백이 된다 — 실제 악보도
       클레프 다음에 그만큼 띄우므로 어색하지 않다. */
    const clefX = 15;
    /* 박자표 숫자 한 쌍. 두 자리 수(12/8)는 살짝 좁혀 옆에 안 닿게 한다.
       줄머리(클레프 옆)와 곡 중간(마디 앞) 두 곳이 같은 함수를 쓴다 */
    function drawTS(TS, x, topY){
      /* Bravura timeSig 글리프(TS_GLYPH) — 높이 2sp의 굵은 세리프 인그레이빙 숫자.
         분자 원점 = 위에서 둘째 줄(topY+LG), 분모 = 넷째 줄(topY+3LG)이라 숫자가
         3~5선 / 1~3선 사이를 정확히 채운다(SMuFL 표준 배치, 표준 문서 §1).
         텍스트 폰트 숫자(13.5px bold)는 아마추어 티라 걷어냈다 (2026-09-10).
         분자·분모는 같은 세로축(cx)에 가운데 정렬 — 두 자리 수(12/8)도 그대로 된다. */
      const s = LG/9, cx = x + 8.5*s;
      const mk = (num, oy)=>{
        const ds = String(num).split('').map(ch => TS_GLYPH[ch]).filter(Boolean);
        if(!ds.length) return;
        let tw = 0; ds.forEach(g => tw += g.adv);
        // 두 자리 수가 왼쪽으로 넘칠 때는 마디선 직전에서 멈춘다
        let gx = Math.max(cx - (tw/2)*s, x - 3*s);
        ds.forEach(g=>{
          target.appendChild(el('path',{d:g.d, fill:INK, class:'ts',   // class는 검사용 표식
            transform:`translate(${gx} ${oy})` + (s!==1 ? ` scale(${s})` : '')}));
          gx += g.adv*s;
        });
      };
      mk(TS[0], topY + LG);
      mk(TS[1], topY + 3*LG);
    }
    /* 퍼커션 클레프 — Bravura 실측: 막대 0.64sp(5.76px)·틈 0.25sp(2.24px), 2~4선 높이 2sp.
       예전 3.2px 막대는 "얇은 선 두 줄"이라 아마추어 티의 대표 자리였다(표준 문서 §2). */
    target.appendChild(el('rect',{x:clefX,y:top+LG,width:5.76,height:2*LG,fill:INK}));
    target.appendChild(el('rect',{x:clefX+8,y:top+LG,width:5.76,height:2*LG,fill:INK}));
    if(ln === 0 && (o.from|0) === 0) drawTS(tsOf(measures[o.from|0] || measures[0] || {}), clefX + 19, top);
    // 시작 세로줄
    target.appendChild(el('line',{x1:6,y1:top,x2:6,y2:bottom,stroke:INK,'stroke-width':1.4}));

    let mx = clef;                     // 마디마다 폭이 달라서 누적한다
    let prevCx = 0;                    // 같은 줄 앞 마디의 내용 시작 x — 마디 사이 붙임줄이 본다
    const rowU = rowsU[ln];
    const dynItems = [];               // 셈여림·헤어핀은 줄 단위로 그린다 (1.8) — 루프 끝에서
    for(let k=0;k<rowU.length;k++){
      const unit = units[rowU[k]];
      if(unit.n > 1){
        /* ── 멀티레스트 칸 ── 마디 n개가 칸 하나. 구간 이름·새 줄 표식·마디 번호는 첫 마디 것,
           박자표 변경도 첫 마디에서. 재생선 캐시는 칸을 n등분해 마디마다 채운다 — 배수를
           "빈 마디 자연 폭 → 등분 폭"으로 주면 xAtPos가 그 안을 정확히 걷는다. 탭은 첫 마디 선택 */
        const mi = unit.mi, MW = unit.w * ROW_MUL;
        const lead = tsChangesAt(mi) ? TS_INSET * ROW_MUL : 0;
        if(o.cache) for(let j=0; j<unit.n; j++)
          o.cache[mi+j] = {x0: mx + lead + j*(MW-lead)/unit.n, top, mul: ((MW-lead)/unit.n) / MWs[mi+j], w:(MW-lead)/unit.n};
        if(o.pos) for(let j=0; j<unit.n; j++)        // 악보 보기의 메모 자리(2026-10-20) — 그리지는 않는다
          o.pos[mi+j] = {x0: mx + lead + j*(MW-lead)/unit.n, top, w:(MW-lead)/unit.n};
        if(o.cache && !o.readOnly && !oneRow && tapMeasures() && selB() >= mi && selA() <= mi + unit.n - 1){
          target.appendChild(el('rect',{x:mx, y:top-26, width:MW, height:4*LG+52,
            fill:'#7B4BE0', opacity:0.09, rx:7, 'pointer-events':'none'}));
        }
        const lnMark = !!(o.cache && !o.readOnly && !oneRow && measures[mi].ln);
        if(lnMark){
          const kk = el('text',{x:mx+2,y:top-14,'font-size':10,'font-weight':'700',fill:'#7B4BE0'}); kk.textContent = '↵';
          target.appendChild(kk);
        }
        if(SHOW_BARNUM){
          const num = el('text',{x:mx+2+(lnMark?9:0),y:top-14,'font-size':10,fill:'#8E88A0',class:'measure-number'}); num.textContent = mi+1;
          target.appendChild(num);
        }
        if(lead && (mi > (o.from|0) || o.screenPage)) drawTS(tsOf(measures[mi]), mx + 4, top);
        drawMultiRest(mx + lead, top, MW - lead, unit.n);
        dynItems.push({mi, cx: mx + lead, mx, MW, multi: unit.n});
        drawMarks(measures[mi], mx, top, bottom, MW, {});     // 구간 상자 + 마디선
        if(o.cache && !o.readOnly && !oneRow && tapMeasures()) taps.push({mi, x:mx, y:top-26, w:MW, h:4*LG+52});
        prevCx = 0;
        mx += MW;
        continue;
      }
      const mi = unit.mi, MW = measureWAt(measures[mi], mi);
      // 재생선이 이 캐시로 x를 구한다. **배수를 같이 담아야** 늘어난 줄에서 안 어긋난다
      /* ── 곡 중간의 박자표가 먹는 자리 (2026-09-01) ──────────
         `measureW(m, mi)`가 이미 MW에 TS_INSET을 더해 두었다. 그 몫만큼
         **내용만** 오른쪽으로 민다 — 마디선·구간 상자·탭 영역은 제자리다.
         음표 x는 `xAtPos(mx, …)`가 정하므로 미는 방법은 mx를 바꿔 넘기는 것뿐이다. */
      const lead = tsChangesAt(mi) ? TS_INSET * ROW_MUL : 0;
      const cx = mx + lead;
      // 재생선은 **음표가 시작하는 자리**를 기준으로 움직인다 — 박자표 몫은 뺀다
      if(o.cache) o.cache[mi] = {x0:cx, top, mul:ROW_MUL, w:MW - lead};
      if(o.pos) o.pos[mi] = {x0:cx, top, w:MW - lead};
      // 편집 중인 마디를 옅게 깔아 준다. 오선 위에 얹히지만 7%라 선이 그대로 보인다
      if(o.cache && !o.readOnly && !oneRow && tapMeasures() && mi >= selA() && mi <= selB()){
        target.appendChild(el('rect',{x:mx, y:top-26, width:MW, height:4*LG+52,
          fill:'#7B4BE0', opacity:0.09, rx:7, 'pointer-events':'none'}));
      }
      // 마디 번호 (끌 수 있다 — 2026-08-29)
      /* 새 줄 표식(m.ln)은 **화면에서만** ↵로 보여 준다 — 어디서 끊었는지 알아야 풀 수 있다 */
      const lnMark = !!(o.cache && !o.readOnly && !oneRow && measures[mi].ln);
      if(lnMark){
        const k = el('text',{x:mx+2,y:top-14,'font-size':10,'font-weight':'700',fill:'#7B4BE0'}); k.textContent = '↵';
        target.appendChild(k);
      }
      if(SHOW_BARNUM){
        const num = el('text',{x:mx+2+(lnMark?9:0),y:top-14,'font-size':10,fill:'#8E88A0',class:'measure-number'}); num.textContent = mi+1;
        target.appendChild(num);
      }
      /* ── 곡 중간의 박자표 (2026-09-01) ────────────────
         **앞 마디와 달라지는 마디에만** 찍는다. 인쇄 악보의 규칙 그대로다.
         줄머리(mi === from)는 위에서 이미 찍었으므로 건너뛴다 — 두 번 찍히면
         숫자가 겹친다. 자리는 마디 왼쪽 여백(M_PAD) 안이라 음표와 안 부딪힌다. */
      if(lead && (mi > (o.from|0) || o.screenPage)) drawTS(tsOf(measures[mi]), mx + 4, top);
      drawMeasure(measures[mi], cx, top);
      // 마디선과 악보 요소(구간·도돌이·괄호·가사·기호). 마디선을 여기서 긋는 이유는
      // **닫는 도돌이가 마디선을 대신하기 때문**이다 — 밖에서 또 그으면 줄이 겹친다
      drawMarks(measures[mi], mx, top, bottom, MW, {});
      drawInk(measures[mi], cx, top, MW - lead); // 펜 메모 — 화면·인쇄·영상 공통
      dynItems.push({mi, cx, mx, MW, multi: 0});
      drawStick(measures[mi], cx, top);          // 손 순서(R·L) — 같은 이유로 여기 한 곳
      drawKickLabels(measures[mi], cx, top);     // 데이터와 무관하게 실제 킥 온셋에 K를 표시한다
      drawTies(measures[mi], cx, top, {mi,      // 붙임줄 — 화면·인쇄·영상 공통 (마디 사이 포함)
        prev: (k > 0 && units[rowU[k-1]].n === 1) ? {m: measures[units[rowU[k-1]].mi], mx: prevCx} : null,
        next: k + 1 < rowU.length ? {m: measures[units[rowU[k+1]].mi]} : null});
      prevCx = cx;
      // 탭 영역은 맨 위에 깔아야 하므로 모아 뒀다가 마지막에 붙인다
      if(o.cache && !o.readOnly && !oneRow && tapMeasures()) taps.push({mi, x:mx, y:top-26, w:MW, h:4*LG+52});
      mx += MW;
    }
    drawDynRow(dynItems, bottom);      // 셈여림·헤어핀 — ROW_MUL이 이 줄 값일 때 (1.8)
  }
  ROW_MUL = 1;                       // **반드시 되돌린다** (GEO와 같은 함정)
  taps.forEach(t=>{
    const r = el('rect',{x:t.x, y:t.y, width:t.w, height:t.h, fill:'transparent', 'data-mi':t.mi});
    r.style.cursor = 'pointer';
    target.appendChild(r);
  });
  SVGT = prevT;
  return svgW;
}

/* ── 악보 요소 그리기 (2026-08-13) ───────────
   구간 이름 · 도돌이 · 1·2번 괄호 · 가사 · 세뇨/코다.
   **전부 기본 도형으로 그린다.** 쉼표·액센트는 Bravura 아웃라인을 박아 뒀지만
   여기 것들은 원·선·글자라서 폰트가 필요 없다 — 그래서 이 단계가 가능했다.
   D.S.·D.C.·Fine도 실제 악보에서 이탤릭 **글자**로 적으므로 글리프가 필요 없다.

   좌표 규칙: `top`이 오선 첫 줄, `bottom`은 다섯째 줄.
     top-46  구간 이름 상자(왼쪽) · 세뇨/코다/D.S./Fine·×N(오른쪽)
     top-34  1·2번 괄호(왼쪽)
     top-14  마디 번호 (원래 있던 것)
     bottom+34  가사·메모

   **처음에 -30/-20으로 뒀다가 다 겹쳤다.** 오선 위쪽은 이미 크래쉬 머리와
   16분 빔이 쓰고 있어서(실측 top-27까지 올라온다) 그 위로 올려야 한다.
   한 단이 150px인데 실제로 쓰는 건 100px 남짓이라 위로 올릴 자리는 넉넉하다.
   좌우로도 나눴다 — 구간 이름은 왼쪽, 기호는 오른쪽이라 한 마디에 둘이 있어도 안 겹친다. */
/* 2026-08-13 2차: 오픈 하이햇 ○가 스템 바깥으로 나가면서 **위쪽이 더 높아졌다.**
   고정값으로는 못 버틴다 — 위쪽에 뭐가 오르느냐가 악보마다 다르기 때문이다.
   빔 꼭대기는 그 구간에서 제일 높은 손 악기로 정해지고(크래쉬면 하이햇보다 4.5px 위),
   그 위로 ○(액센트가 겹치면 한 칸 더), 그 위로 셋잇단 숫자가 쌓인다.
   그래서 **층을 그때그때 쌓는다.** `MARK_Y`는 그 결과를 담는 그릇이고
   `markLevels()`가 매 렌더마다 채운다. 아무것도 없는 악보는 예전보다 오히려 붙는다
   (구간 이름만 있는 흔한 경우 위 여백 22 → 18). */
const MARK_Y = {sec:-70, volta:-56, nav:-70, text:34, stick:-33, stickB:37, kick:51, extra:0, dyn:0};
/* 이 구간을 그리는 데 위로 얼마나 필요한가. 오선 첫 줄(top) 기준의 음수 offset을 돌려준다 */
function markLevels(seen){
  let beam = -14;                                   // 빔의 하한(스템 최소 길이)
  let openPlain = false, openAcc = false, tup = false, tupAcc = false;
  seen.forEach(mm => {
    if(!mm) return;
    HAND_INS.forEach(i => {
      if((mm[i.id] || []).some(v => v)) beam = Math.min(beam, i.pos*LG/2 - 30);
    });
    const t = upperVoiceHasTuplet(mm);
    /* ○(오픈)와 ＋(닫음·초크)는 **같은 자리·같은 크기**라 층을 똑같이 문다.
       ＋는 심벌(크래쉬·라이드)에도 붙으므로 하이햇 줄만 보면 모자란다 —
       손 악기를 전부 훑는다. 허용 밖 값은 `artFor`가 이미 접어 두므로 셈이 안 는다 */
    const hh = mm.hihat || [];
    let acc = false, plain = false;
    for(let s = 0; s < hh.length; s++){
      const mark = HAND_INS.some(i => {
        const v = ((mm[i.id] || [])[s]|0);
        return (v === ART.OPEN && OPEN_OK[i.id]) || (v === ART.CLOSED && CLOSED_OK[i.id]);
      });
      if(!mark) continue;
      const a = HAND_INS.some(i => i.id !== 'hihat' && ((mm[i.id] || [])[s]|0) === ART.ACCENT);
      if(a) acc = true; else plain = true;
    }
    openAcc = openAcc || acc; openPlain = openPlain || plain;
    tup = tup || t; tupAcc = tupAcc || (t && acc);
  });
  // 음표 쪽이 실제로 올라간 높이
  let base = beam;
  if(openPlain) base = Math.min(base, beam - 14 - 5.5);
  if(openAcc)   base = Math.min(base, beam - 25 - 5.5);
  if(tup)       base = Math.min(base, beam - (tupAcc ? 37 : (openPlain || openAcc) ? 27 : 22) - 5.5);
  /* 손 순서(R·L)가 위에 붙으면 음표 층 바로 위에 한 층을 차지한다.
     아래에 붙으면 가사 자리(34)와 겹치므로 가사를 한 층 내린다.
     글자가 없으면 아무것도 안 바꾼다 — 기존 악보는 바이트까지 그대로다 */
  const anyStick = seen.some(mm => mm && mm.stick && mm.stick.some(v=>v));
  MARK_Y.stick = Math.round(base) - 3;
  if(anyStick && STICK_POS === 'above') base -= 13;
  /* ── 오선 **아래**도 같은 이유로 층을 쌓는다 (2026-08-18, 풋 하이햇) ──
     위쪽과 판박이다. 발 빔이 어디까지 내려가는지가 악보마다 다르다 —
     킥(pos 7)만 있으면 오선 아래 23.5px, 풋 하이햇(pos 9)이 있으면 32.5px,
     발 액센트가 붙으면 거기서 한 층 더. 가사·R·L을 34/37 고정값으로 두면 그 위에 얹힌다.
     `drawVoiceBeat`의 발 빔 식(`max(maxY+28, top+4*LG+22)`)을 오선 아래 기준으로 옮긴 것이고,
     **한 곳이 바뀌면 다른 곳도 바꿔야 한다.** */
  let footBase = 22;                       // 발 빔의 하한 — drawVoiceBeat와 같은 값
  let footAcc = false;
  seen.forEach(mm => {
    if(!mm) return;
    FOOT_INS.forEach(i => {
      const row = mm[i.id] || [];
      if(!row.some(v => v)) return;
      footBase = Math.max(footBase, i.pos*LG/2 - 4*LG + 28);
      if(row.some(v => (v|0) === ART.ACCENT)) footAcc = true;
    });
  });
  if(footAcc) footBase += 10 + 8.78;       // 액센트 글리프는 기준선 아래 8.78까지 내려간다
  /* 발 빔이 `fb`까지 내려갔을 때 오선 아래가 어떻게 쌓이는지.
     글자 윗변이 빔 아래로 떨어지게 8px 더 문다. `Math.max`로 감싸는 게 핵심이다 —
     킥만 있는 흔한 악보는 계산값이 32라 예전 값(34/37)이 그대로 이긴다. */
  const anyText = seen.some(mm => mm && mm.text);
  // 셈여림·헤어핀 (1.8) — 발 잉크(·아래 R·L) 밑, 가사 위에 한 층. 없으면 아무것도 안 바뀐다
  const anyDyn = seen.some(mm => mm && (DYN_OK.includes(mm.dyn) || HP_OK.includes(mm.hp)));
  const stickBelow = anyStick && STICK_POS === 'below';
  const anyKick = seen.some(mm => mm && (mm.kick||[]).some((v,s)=>kickLabelOnset(mm,s)));
  /* `px`는 가사 글자 크기다. 윗변(캡)과 아랫변(디센더)이 크기를 따라가야
     글자를 키웠을 때 빔에 물리지 않는다. 10px에서는 8/4 — **옛 값 그대로**다. */
  const belowStack = (fb, px, dyn, kick=false)=>{
    const cap = Math.round(px*0.8), desc = Math.round(px*0.35);
    const floor = Math.ceil(fb) + cap;
    const sb = Math.max(37, floor);
    let tx = stickBelow ? sb + 10 : Math.max(26 + cap, floor);
    let ink = fb;                                  // 실제로 잉크가 내려간 깊이
    if(stickBelow) ink = Math.max(ink, sb + 4);
    // Reserve a dedicated K row below the R/L row, including when R/L is above.
    // Dynamics and text then stack below K rather than sharing its baseline.
    const kb = sb + 14;
    if(kick){ink=Math.max(ink,kb+4);tx=Math.max(tx,kb+8+cap);}
    /* 셈여림 기준선 — 글자 윗변(f 머리 ≈ 15)이 위 잉크 아래 4px에 오게. 아랫변(p 꼬리)은 +5 */
    let dy = 0;
    if(dyn){
      dy = Math.ceil(ink) + 4 + 15;
      ink = Math.max(ink, dy + 5);
      tx = Math.max(tx, dy + 5 + 4 + cap);
    }
    if(anyText)    ink = Math.max(ink, tx + desc);
    return {sb, kb, tx, ink, dy};
  };
  /* 기준(`was`)은 **킥만 있고 글자가 10px이던 시절**이다. 발이 깊어진 만큼, 그리고
     글자를 키운 만큼 단 간격이 넓어진다. 둘 다 그대로면 차이가 0이라 안 움직인다. */
  const now = belowStack(footBase, textPx(), anyDyn, anyKick), was = belowStack(23.5, TEXT_BASE_PX, false);
  MARK_Y.stickB = now.sb;
  MARK_Y.kick   = now.kb;
  MARK_Y.text   = now.tx;
  MARK_Y.dyn    = now.dy;
  /* **단 간격은 차이만큼만 넓힌다.** 오선 아래로 44px쯤 지나면 다음 단의 구간 상자
     (top-70)와 만나는데, `SYS_H`(150)는 고정이라 그냥 두면 겹친다 — 풋 하이햇에
     액센트까지 붙으면 실제로 겹쳤다(2026-08-18 실측).
     절대값이 아니라 **킥만 있던 시절과의 차이**를 무는 이유: 그래야 예전 악보가
     1px도 안 움직인다. 발 성부가 깊어진 악보만 그만큼 벌어진다.
     남은 한계 — 원래부터 있던 빠듯함(가사 + 구간 상자)은 그대로다. 그건 SYS_H를
     통째로 손대야 하고 인쇄 쪽 나누기가 같이 걸리는, 따로 결정할 일이다. */
  // Preserve old staff spacing, but reserve the extra upper cymbal/beam layers on later systems too.
  const upperExtra = seen.some(mm => mm && ['splash','china','fx'].some(id => (mm[id] || []).some(v=>v)))
    ? Math.max(0, Math.ceil(-base - 39)) : 0;
  MARK_Y.extra = Math.max(0, Math.ceil(now.ink - was.ink)) + upperExtra;
  const volta = base - 10;                          // 괄호 숫자가 y+8까지 내려온다 (+2 여유)
  const hasVolta = seen.some(mm => mm && mm.end);
  const top = (hasVolta ? volta : base) - 10;       // 구간 상자 바닥은 y+7
  const hasTop = seen.some(mm => mm && (mm.sec || mm.nav || (mm.rep && mm.rep.times > 2)));
  MARK_Y.sec = MARK_Y.nav = Math.round(top);
  MARK_Y.volta = Math.round(volta);
  return hasTop ? top - 8 : hasVolta ? volta : base;   // 필요한 총 높이
}

/* 코다 기호 — 원 하나에 십자. 도형이 정확히 정의돼 있어 폰트 없이 그려도 같다 */
function codaMark(x, y, s){
  const r = 5.2*s, arm = 8.6*s;
  SVGT.appendChild(el('circle',{cx:x, cy:y, r:r, fill:'none', stroke:INK, 'stroke-width':1.9*s}));
  SVGT.appendChild(el('line',{x1:x, y1:y-arm, x2:x, y2:y+arm, stroke:INK, 'stroke-width':1.9*s}));
  SVGT.appendChild(el('line',{x1:x-arm, y1:y, x2:x+arm, y2:y, stroke:INK, 'stroke-width':1.9*s}));
}
/* 세뇨 — **여기만 근사다.** Bravura(U+E047)의 아웃라인을 못 뽑아서
   S자 곡선 + 사선 + 점 두 개로 손으로 세웠다. 12px 언저리로 그려지므로 눈에는 같지만,
   글리프를 뽑게 되면 이 함수만 갈아 끼우면 된다. */
function segnoMark(x, y, s){
  const g = el('g',{transform:`translate(${x} ${y}) scale(${s})`});
  g.appendChild(el('path',{d:'M-3.6 4.6C-1.2 6.6 2.4 5.6 2.4 2.6C2.4 -0.2 -2.4 -0.6 -2.4 -3.0C-2.4 -5.2 0.6 -6.2 3.2 -4.4',
    fill:'none', stroke:INK, 'stroke-width':1.7, 'stroke-linecap':'round'}));
  g.appendChild(el('line',{x1:-5.2, y1:5.4, x2:5.2, y2:-5.4, stroke:INK, 'stroke-width':1.4}));
  g.appendChild(el('circle',{cx:-4.2, cy:-2.2, r:1.15, fill:INK}));
  g.appendChild(el('circle',{cx:4.2, cy:2.2, r:1.15, fill:INK}));
  SVGT.appendChild(g);
}
const NAV_TEXT = {ds:'D.S.', dc:'D.C.', fine:'Fine', tocoda:'to Coda'};

/* 마디 하나에 딸린 표시를 전부 그린다. 마디선(도돌이 포함)까지 여기서 책임진다 —
   **닫는 도돌이는 마디선 자체를 대신하기 때문에** 바깥에서 따로 그으면 두 줄이 겹친다. */
function drawMarks(m, mx, top, bottom, MW, opts){
  const s = LG/9;
  const rep = m.rep;

  /* 구간 이름 — 상자 + 굵은 글자(리허설 마크 관례).
     **색 상자로 안 채운다.** 인쇄가 흑백이면 회색 덩어리가 되고 글자가 죽는다 */
  if(m.sec){
    const t = el('text',{x:mx+7, y:top+MARK_Y.sec+4, 'font-size':10.5, 'font-weight':'700',
      fill:INK, 'letter-spacing':'-0.02em'});
    t.textContent = m.sec;
    SVGT.appendChild(t);
    // 글자 폭을 잴 수 없는 상태(인쇄용 분리 SVG)에서도 상자가 맞도록 글자 수로 잡는다.
    // 한글은 폭이 거의 일정해서 이 근사가 잘 맞는다
    const w = m.sec.length * 10.8 + 10;
    SVGT.appendChild(el('rect',{x:mx+2, y:top+MARK_Y.sec-8, width:w, height:15,
      fill:'none', stroke:INK, 'stroke-width':1, rx:2.5}));
  }

  /* 1·2번 괄호 — 시작에 아래로 꺾인 갈고리, 위에 숫자 */
  if(m.end){
    const y = top + MARK_Y.volta;
    SVGT.appendChild(el('path',{d:`M${mx+1} ${y+9}L${mx+1} ${y}L${mx+MW-1} ${y}`,
      fill:'none', stroke:INK, 'stroke-width':1.2}));
    const t = el('text',{x:mx+6, y:y+8, 'font-size':9.5, 'font-weight':'700', fill:INK});
    t.textContent = m.end + '.';
    SVGT.appendChild(t);
  }

  /* 세뇨·코다·D.S.·Fine — 마디 오른쪽 위. 기호는 그리고 나머지는 글자다 */
  if(m.nav){
    const y = top + MARK_Y.nav;
    if(m.nav === 'segno')      segnoMark(mx + MW - 12, y, s);
    else if(m.nav === 'coda')  codaMark(mx + MW - 12, y, s);
    else {
      const t = el('text',{x:mx+MW-4, y:y+4, 'font-size':10, 'font-style':'italic',
        'font-weight':'700', fill:INK, 'text-anchor':'end'});
      t.textContent = NAV_TEXT[m.nav] || '';
      SVGT.appendChild(t);
    }
  }

  /* 가사·메모 — 오선 아래 한 줄. 킥 스템이 bottom+20 언저리까지 내려와서 그 아래에 둔다 */
  if(m.text){
    const t = el('text',{x:mx+4, y:bottom+MARK_Y.text, 'font-size':textPx(), fill:INK});
    t.textContent = m.text;
    SVGT.appendChild(t);
  }

  /* ── 도돌이 ────────────────────────────
     관례: 굵은 줄이 바깥, 가는 줄이 안쪽, 점 두 개가 **반복되는 음악 쪽**을 본다. */
  const dots = (dx)=>{
    SVGT.appendChild(el('circle',{cx:dx, cy:top+LG*1.5, r:1.6, fill:INK}));
    SVGT.appendChild(el('circle',{cx:dx, cy:top+LG*2.5, r:1.6, fill:INK}));
  };
  if(rep && rep.a){
    // 굵은 줄 0.5sp(4.5px) — 가는 줄(1.4)과의 대비가 표준의 핵심이다
    SVGT.appendChild(el('rect',{x:mx+1, y:top, width:4.5, height:bottom-top, fill:INK}));
    SVGT.appendChild(el('rect',{x:mx+8.6, y:top, width:1.4, height:bottom-top, fill:INK}));
    dots(mx + 14);
  }
  if(rep && rep.b){
    const bx = mx + MW;
    dots(bx - 14);
    SVGT.appendChild(el('rect',{x:bx-10, y:top, width:1.4, height:bottom-top, fill:INK}));
    SVGT.appendChild(el('rect',{x:bx-5.5, y:top, width:4.5, height:bottom-top, fill:INK}));
    /* ×N은 기호와 같은 맨 윗줄에 둔다. 괄호 줄에 뒀더니 16분 빔과 닿았다.
       한 마디에 기호까지 같이 있으면 왼쪽으로 비켜 준다 */
    if(rep.times && rep.times > 2){
      const t = el('text',{x:bx-2-(m.nav?34:0), y:top+MARK_Y.nav+4, 'font-size':9,
        'font-weight':'700', fill:INK, 'text-anchor':'end'});
      t.textContent = '×' + rep.times;
      SVGT.appendChild(t);
    }
  }
  /* ── 마디선 (2026-08-29: 겹세로줄·마침줄) ────────────────
     닫는 도돌이가 마디선을 대신한다. 안 그러면 굵은 줄 옆에 얇은 줄이 하나 더 선다.
     **기본(m.bar 없음)은 예전 코드 그대로** — 옛 악보의 출력 바이트가 한 자도 안 변한다.
     관례: 겹세로줄 = 얇은 줄 둘(단락이 바뀐다), 마침줄 = 얇은 줄 + 굵은 줄(곡의 끝).
     굵은 줄이 **오른쪽**이다 — 여는 도돌이와 반대다. */
  if(!(rep && rep.b) && !opts.skipBar){
    const thin = (x)=> SVGT.appendChild(el('line',{x1:x, y1:top, x2:x, y2:bottom,
      stroke:INK, 'stroke-width':1.4}));
    if(m.bar === 'double'){
      thin(mx+MW-4.5); thin(mx+MW);
    }else if(m.bar === 'final'){
      thin(mx+MW-7);
      SVGT.appendChild(el('rect',{x:mx+MW-4.5, y:top, width:4.5, height:bottom-top, fill:INK}));
    }else{
      thin(mx+MW);
    }
  }
}

/* 화면 렌더의 줄당 마디 수.
   'auto' = 폭에 맞춰 접는다(기본). 숫자면 출력과 같은 고정 배치 —
   검토 모드가 이걸 써서 인쇄 결과를 화면에서 미리 보여 준다. */
let screenPerLine = 'auto';
const SCREEN_PAGE_SIZE = 20;
let screenPageStart = 0, screenPageSelection = -1, screenPageFocus = 0, screenPageSize = SCREEN_PAGE_SIZE;
function scorePagingEnabled(){return screenPerLine==='auto'&&document.body.classList.contains('crt-workspace');}
// The iPad editor shows four-measure groups in two columns. Detached source and print renders
// keep using SCREEN_PAGE_SIZE and their explicit ranges.
function scoreScreenPageSize(){return document.body.classList.contains('ipad-workspace')?4:SCREEN_PAGE_SIZE;}
function scoreScreenPageStart(mi,size){return Math.floor(mi/size)*size;}
function scorePageInfo(){
  const size=scoreScreenPageSize(),total=measures.length,pages=Math.max(1,size===4?total:Math.ceil(total/size));
  return {enabled:scorePagingEnabled(),start:screenPageStart,end:Math.min(total-1,screenPageStart+size-1),total,page:size===4?screenPageFocus+1:Math.floor(screenPageStart/size)+1,pages};
}
function ensureScorePage(mi){
  if(!scorePagingEnabled()||mi<0||mi>=measures.length)return false;
  const size=scoreScreenPageSize(),start=scoreScreenPageStart(mi,size);
  if(start===screenPageStart&&screenPageSize===size&&(size!==4||screenPageFocus===mi))return false;
  screenPageStart=start;screenPageFocus=mi;screenPageSelection=selMeasure;screenPageSize=size;renderScore();
  const wrap=document.getElementById('scoreWrap');if(wrap){wrap.scrollTop=0;wrap.scrollLeft=0;}
  return true;
}
function moveScorePage(direction){
  if(!scorePagingEnabled()||![-1,1].includes(direction))return false;
  const size=scoreScreenPageSize(),start=size===4?screenPageFocus+direction:screenPageStart+direction*size;
  if(start<0||start>=measures.length)return false;
  selectMeasure(start);ensureScorePage(start);return true;
}

/* 머리말이 먹는 높이. **paint와 exportPages가 같은 이 함수를 본다** —
   따로 세면 페이지 나누기와 실제 그림이 어긋나 마지막 단이 잘린다.
   ★ 제목만 있으면 정확히 30이다(예전 값). 그래야 옛 악보가 한 픽셀도 안 움직인다. */
/* ── 머리말 배치, 두 번째 판 (2026-08-28, 상용 악보 실측 대조) ──
   시판 악보 세 장(악보바다 둘 + Real Book 계열)을 나란히 놓고 맞췄다.
   1. **제목 26px** — 16은 마디 번호와 구분이 안 갈 만큼 작았다. 지면의 이름인데
      본문 글자 크기였다
   2. **크레딧은 전부 오른쪽 위에 쌓는다** — "염평안 작사 / 염평안 작곡 / 염평안 노래"
      처럼. 이름이 먼저, 역할이 뒤다('{n} 작사'). 첫 판은 작사를 왼쪽, 작곡을
      오른쪽에 갈랐는데 국내 시판 악보는 그렇게 안 한다 — 오른쪽 한 기둥이다.
      영어는 관례가 달라 그대로 'Words by {n}' 꼴을 쓴다(i18n이 처리)
   3. 크레딧 기둥은 제목과 **같은 높이 띠**에서 시작한다(credY=4) — 가운데 제목과
      오른쪽 기둥이 가로로 겹칠 일은 사실상 없고, 세로 자리를 아낀다
   ⚠ 제목 크기가 바뀌었으므로 **옛 악보의 렌더도 바뀐다** — 의도한 변경이다.
   verify-render-same은 제목 없는 경우로만 바이트 동일성을 잰다. */
function headBlock(title, MT){
  const cred = [];
  if(MT){
    if(MT.lyricist) cred.push(t('{n} 작사').replace('{n}', MT.lyricist));
    if(MT.composer) cred.push(t('{n} 작곡').replace('{n}', MT.composer));
    if(MT.arranger) cred.push(t('{n} 편곡').replace('{n}', MT.arranger));
    if(MT.artist)   cred.push(t('{n} 노래').replace('{n}', MT.artist));
  }
  const f = HEAD_SIZES[headSize] || 1;   // 머리말 글자 크기 — 보통=1이면 아래가 전부 예전 값
  const subT = MT ? (MT.sub || '') : '';
  const hasTitle = !!(title || '').trim();
  let subY = 0, h = hasTitle ? Math.round(44*f) : 0;
  if(subT){ subY = hasTitle ? Math.round(28*f) : 8; h = Math.max(h, subY + Math.round(16*f)); }
  const credY = 4;
  if(cred.length) h = Math.max(h, credY + (cred.length - 1)*(11*f) + 18);
  /* 템포는 **왼쪽 위**다 — 제목보다 살짝 위, 상용 악보의 표준 자리.
     크레딧 기둥과 가로로 마주 보므로 세로 자리를 새로 안 먹는다.
     다만 제목이 없으면 템포만 떠 있게 되므로 그때는 높이를 벌어 준다. */
  /* 둘째 장부터는 안 적는다 (2026-09-12 드러머 제보 "템포가 페이지마다 나온다") —
     exportPages가 뒷장에는 meta를 null로 주므로 그걸로 가른다. 화면·첫 장은 그대로 */
  const tempoT = (showTempo && MT) ? ('\u2669 = ' + bpm) : '';
  if(tempoT) h = Math.max(h, hasTitle ? h : 20);
  return {h, subT, cred, subY, credY, f, tempoT};
}

function renderScore(){
  slotXCache = [];
  const previousPageStart=screenPageStart;
  const paged=scorePagingEnabled();
  const pageSize=scoreScreenPageSize();
  const ipadWindow=paged&&pageSize===4;
  if(paged){
    if(screenPageSelection!==selMeasure||screenPageSize!==pageSize){screenPageStart=scoreScreenPageStart(selMeasure,pageSize);screenPageFocus=selMeasure;screenPageSelection=selMeasure;screenPageSize=pageSize;}
    screenPageFocus=Math.max(0,Math.min(screenPageFocus,measures.length-1));
    screenPageStart=ipadWindow?scoreScreenPageStart(screenPageFocus,pageSize):Math.max(0,Math.min(screenPageStart,Math.max(0,Math.ceil(measures.length/pageSize)-1)*pageSize));
  }
  const wrap = document.getElementById('scoreWrap'), wrapStyle = getComputedStyle(wrap);
  const wrapW = Math.max(1, wrap.clientWidth - parseFloat(wrapStyle.paddingLeft) - parseFloat(wrapStyle.paddingRight));
  const Z = zoomF();
  const svgW = paint(svg, {
    availW: screenPerLine === 'auto' ? wrapW / Z : wrapW, perLine: screenPerLine,
    maxPerLine: ipadWindow ? 2 : document.body.classList.contains('crt-workspace') ? 4 : undefined,
    screenColumns:ipadWindow?2:undefined,
    unfoldRests:ipadWindow,
    from:paged?screenPageStart:0,to:paged?Math.min(measures.length,screenPageStart+pageSize):measures.length,
    screenPage:paged,
    title: ipadWindow ? '' : (document.getElementById('titleInput')?.value || ''),
    meta: ipadWindow ? null : songMeta, copyright: ipadWindow ? '' : songMeta.copyright,
    cache: slotXCache,
  });
  // iPad's compact monitor fits the four-measure group. Keep engraving/cache units
  // unchanged: selection uses getScreenCTM and the cursor copies this SVG's box.
  // Other screens retain their note size and scroll when a measure overflows.
  let displayZ=Z;
  if(ipadWindow){
    // Remove unused system padding while retaining the engraving coordinates.
    // Some detached/hidden SVGs cannot report a box, so retain paint's viewBox.
    try{
      const box=svg.getBBox?.();
      if(Number.isFinite(box?.y)&&Number.isFinite(box?.height)&&box.height>0){
        const top=Math.max(0,box.y-8),height=box.y+box.height+8-top;
        if(Number.isFinite(height)&&height>0){
          svg.setAttribute('viewBox',`0 ${top} ${svgW} ${height}`);
          svg.setAttribute('height',height);
        }
      }
    }catch(e){}
    const wrapH=wrap.clientHeight-(parseFloat(wrapStyle.paddingTop)||0)-(parseFloat(wrapStyle.paddingBottom)||0);
    const svgH=Number((svg.getAttribute('viewBox')||'').trim().split(/\s+/)[3]);
    displayZ=Math.min(Z,wrapW/svgW,wrapH>0&&svgH>0?wrapH/svgH:Infinity);
  }
  svg.style.width = (svgW * displayZ) + 'px';
  svg.style.height = 'auto';
  svg.style.maxWidth = 'none';
  // 재생 커서 — **악보 SVG 밖, 위에 얹은 작은 SVG에** 둔다 (2.1, 2026-10-21 제보 "음표가 많으면 버벅인다").
  // 악보 SVG 안의 선 하나를 매 프레임 옮기면 브라우저가 **악보 전체(76마디면 8,500개 요소)를 다시 그린다.**
  // 실측(76마디·CPU 4배 감속): 재생 12초 동안 긴 작업 114번·6.4초 → 커서만 끄면 2번·0.15초.
  // 메인 스레드가 밀리면 25ms 예약 틱이 늦어지고, 0.12초 앞당김을 넘기면 소리가 늦게·몰려 나간다.
  // 겉 SVG는 같은 viewBox·같은 크기로 악보 위에 겹친다 — 좌표계가 같아서 계산은 그대로다.
  syncCurOverlay(svg);
  if(SHELF_ON) drawBmFlags();      // var라 부팅 중에는 undefined(거짓) — TDZ 없음
  if(typeof updateEditCursor==='function') updateEditCursor();
  if(paged&&previousPageStart!==screenPageStart){wrap.scrollTop=0;wrap.scrollLeft=0;}
  if(document.body.classList.contains('crt-workspace'))window.dispatchEvent(new CustomEvent('ddakung-score-page-change',{detail:scorePageInfo()}));
  window.dispatchEvent(new CustomEvent('ddakung-score-render'));
}

/* 출력용 페이지 SVG 배열. 화면 상태는 마지막에 renderScore()로 되돌린다.
   둘째 인자는 **옛 호출부 호환으로 받기만 하고 안 쓴다** — 한 장에 몇 단이 들어가는지는
   이제 아래에서 높이를 재서 페이지마다 따로 정한다(2026-09-02). */
function exportPages(perLine, _lppIgnored, posOut){     // posOut: [] 를 주면 페이지마다 마디 자리(악보 보기)
  const pages = [];
  const title = (document.getElementById('titleInput')?.value || '');
  const copy = (songMeta.copyright || '').trim();
  /* 머리말도 저작권도 **첫 장에만** 놓는다. 장마다 머리말을 되풀이하면 새 곡이
     시작하는 것처럼 읽히고, 저작권은 원래 곡이 시작하는 지면의 발치에 한 번 적는다.
     첫 장으로 몰아 둔 데는 실용적인 이유도 있다 — 저작권을 마지막 장에 두면
     "몇 장인가"가 "저작권이 자리를 얼마나 먹는가"에 달려서 셈이 순환한다. */
  /* ★ 페이지는 **단(줄) 수**로 자른다. 마디 수(옛 `lpp * perLine`)로 자르면 안 된다.
     줄 나누기는 `paint`가 **폭**으로 하기 때문에 한 줄에 perLine개가 안 들어가는
     악보가 있다 — 12/8(마디가 1.5배 넓다) · 32분 · 앞꾸밈음. 그런 악보는 한 장이
     예산보다 많은 단을 싣게 되고, 인쇄 `.page`가 `overflow:hidden`이라
     **맨 아래 단이 소리 없이 반만 나간다**
     (2026-09-02 사용자 제보 「숙녀에게」 12/8 58마디 — 1장에 11단이 실려 32마디가 잘렸다).

     줄 나누기 규칙은 paint 안에만 있고 폭 계산(GEO·비례 배치)에 얽혀 있어서
     밖에서 다시 세면 두 벌이 어긋난다. 그래서 **한 번 그려 보고 그 계획을 받는다.**
     버리는 SVG 한 장 값이지만, 인쇄는 자주 하는 일이 아니고 두 벌을 안 만드는 값이 더 크다.
     (둘째 인자 `linesPerPage`는 옛 호출부 호환으로 받기만 하고 안 쓴다 —
      한 장에 몇 단이 들어가는지는 이제 아래에서 **높이를 재서** 정한다) */
  const plan = [];
  paint(document.createElementNS(SVG_NS, 'svg'), {availW:0, perLine, rows:plan});
  const budget = printBudgetPx(designPerLine(perLine));   // paint의 설계 폭과 같은 값
  /* 이 페이지에 몇 단이 들어가는가. **실을 마디를 알아야 위 여백을 알 수 있다** —
     구간 상자·볼타·셋잇단 숫자가 오선 위 자리를 먹고, 그 양은 마디마다 다르다.
     그래서 넣어 보고 안 맞으면 한 단씩 줄인다. `paint`가 쓰는 것과 **같은 식**이라
     (`svgH = pad0 + titleH + lines*sysH + copyH`) 재 본 값과 그려진 값이 어긋나지 않는다.
     첫 시도값은 위 여백을 최소로 잡은 상한이라 아래로만 움직인다 — 보통 한두 번 돈다. */
  const fitRows = (startRow, head)=>{
    const rest = plan.length - startRow;
    let n = Math.max(1, Math.min(rest,
      Math.floor((budget - TOP_PAD - head) / Math.max(1, SYS_H + lineGap()))));
    const from = plan[startRow][0];
    while(n > 1){
      const lastRow = plan[startRow + n - 1];
      const need = markLevels(measures.slice(from, lastRow[lastRow.length - 1] + 1));
      const pad = TOP_PAD + Math.max(0, Math.ceil(-need) - 35);
      const titleGap=titleCymbalClearance(measures.slice(from,lastRow[lastRow.length-1]+1),head,need);
      if(pad + head + titleGap + n*(SYS_H + (MARK_Y.extra || 0) + lineGap()) <= budget) break;
      n--;
    }
    return n;
  };
  const head0 = headBlock(title, songMeta).h + (copy ? 20 : 0);
  /* 장 나누기를 먼저 끝내고 그린다 — 쪽 번호 "n / 전체"에 전체 장 수가 필요하다 (2026-09-12).
     둘째 장부터는 작은 제목(18px)과 쪽 번호(14px)가 자리를 먹으므로 예산에서 뺀다 */
  const RUN_H = title.trim() ? 16 : 0, PN_H = 14;   // paint의 runH·pnH와 한 쌍
  const ranges = [];
  { let at = 0, ln = 0;
    while(ln < plan.length){
      const pi = ranges.length;
      const end = ln + fitRows(ln, pi === 0 ? head0 : RUN_H + PN_H);
      const lastRow = plan[end - 1];
      const to = lastRow[lastRow.length - 1] + 1;
      ranges.push({from:at, to}); at = to; ln = end;
    } }
  ranges.forEach((rg, pi)=>{
    const s = document.createElementNS(SVG_NS, 'svg');
    paint(s, {availW:0, perLine, from:rg.from, to:rg.to,
              title: pi===0 ? title : '', meta: pi===0 ? songMeta : null,
              copyright: pi===0 ? copy : '',
              pageNo: pi + 1, pageCount: ranges.length, runTitle: title,
              pos: posOut ? (posOut[pi] = []) : undefined});
    pages.push(s);
  });
  if(!pages.length){
    const s = document.createElementNS(SVG_NS, 'svg');
    paint(s, {availW:0, perLine, title, meta:songMeta, copyright:copy,
              pos: posOut ? (posOut[0] = []) : undefined});
    pages.push(s);
  }
  renderScore();          // GEO / slotXCache 복구
  return pages;
}

/* 박 폭은 분할과 무관하게 **고정**이다. 셋잇단 박도 16분 박과 같은 자리를 차지한다.
   pos = 마디 시작부터 몇 박째인지(실수). div=4일 때 slotX와 픽셀 단위로 같다 —
   그래야 이번 변경이 기존 악보를 한 픽셀도 안 건드린다. */
function beatW(){ return 4*GEO.SLOT_W; }

/* ── 박 폭은 분할에 따라 갈린다 (2026-08-14) ────
   원래는 분할과 무관하게 고정이었다. 셋잇단이 들어올 때 일부러 그렇게 했다 —
   기존 악보를 한 픽셀도 안 건드리려고. 32분(div 8)에서 그 규칙이 깨졌다:
   칸 폭이 `SLOT_W/2`가 되는데 X 머리는 `2*4.4 + 1.8 = 10.6px` 고정이라
   **출력(SLOT_W 14)에서 칸이 7px, 즉 3.6px 겹친다.** 고스트 괄호는 아예 안 들어간다.

   그래서 **넓혀야 하는 분할만 예외**로 둔다. `BEAT_W_MUL`에 없는 분할은 배수 1이라
   결과가 예전과 **산술적으로 완전히 같다** — `2*pad + 4*(4*slot) + 3*gap`은
   옛 `pad*2 + 16*slot + 3*gap`과 같은 식이다. 즉 **div 8이 없는 악보는 안 바뀐다.**
   (`svgdump.js`가 SVG 문자열을 통째로 비교해서 이걸 못 박는다)

   1.8배를 고른 이유: 출력(SLOT_W 14)에서 32분 칸이 7 → 12.6px가 되어
   머리 10.6px 사이에 2px가 남는다. 1.6이면 0.6px뿐이라 종이에서는 붙어 보였다(실측).
   손·발 분할이 다르면 **넓은 쪽을 따른다** — 한쪽만 좁히면 그 성부가 겹친다.

   **6연음(div 6)은 일부러 안 넣었다.** 출력에서 9.33px라 이미 1.3px 겹치는데,
   여기에 배수를 주면 **기존 악보가 리플로우된다.** 고칠 값은 `{6: 1.25}`로 정해져 있고,
   할지 말지는 따로 결정할 일이다 (기존 사용자 악보의 줄바꿈이 바뀐다). */
/* 5·7은 1.8에 열었다 — 입력판 칸이 손가락보다 좁아지지 않게.
   24·42(1.9)는 32분 반박의 칸이 32분 박(1.8배)의 칸과 같은 시간 폭이다. 앞뒤 반박이 같은 폭을
   나눠 쓰므로 1.6이면 32분 칸이 0.8×(1/4)박 — 16분 반박 쪽이 남는 만큼 덜 넓힌다. 33은 23과 같다 */
const BEAT_W_MUL = {8: 1.8, 7: 1.5, 5: 1.2, 23: 1.2, 32: 1.2, 13: 1.1, 31: 1.1,
                    24: 1.6, 42: 1.6, 33: 1.2};
function beatMul(m, b){
  if(!m || !m.div) return 1;
  /* **박 길이를 곱한다.** 6/8의 박은 점4분이라 4/4의 박보다 1.5배 길다.
     안 곱하면 입력판 칸이 위 악보와 세로로 안 맞는다 — 그 정렬이 이 그리드의 강점이다.
     4/4에서는 beatQ가 1이라 예전 값 그대로다 */
  return beatQ(m, b) * Math.max(BEAT_W_MUL[divOf(m, b, 'hand')] || 1,
                                BEAT_W_MUL[divOf(m, b, 'foot')] || 1);
}
/* 앞꾸밈음 자리는 이제 간격표(beatSpans)의 충돌 최소(COL_ORN)가 잡는다 (2026-09-10 간격 공사).
   옛 ORN_W_MUL(박을 통째로 곱하기)·ornAtBeatStart는 그 안으로 들어갔다 — CLAUDE.md 8-52. */
/* ── 간격 공사 — 음가 폭 + 충돌 최소, 두 겹 (2026-09-10, engraving-review 규칙 1) ──
   2026-08-15 비례 배치(지수 0.6)는 **박 폭만** 내용에 비례했고, 박 안의 음표는
   시간 비례(선형)로 놓였다 — 점8분+16분 박에서 16분이 박 폭의 75% 지점에 찍혀
   인쇄 악보(음가 폭 비례)와 다른 "앱 티"가 남았다. 이제 온셋 사이마다 간격표를 만들고
   xAtPos·measureW·재생선·페이지가 전부 **같은 표**를 본다. 목표 렌더는
   design-review-0903/score32.svg 다.

   gap마다 두 값 — **w(음가 폭)** = SLOT_W·√(길이/16분): 음가가 2배면 폭은 √2배(Dorico 표준).
   **min(충돌 최소)** = 머리+숨(15, 단 SLOT_W보다 크지 않게 — 옛 MIN_STEP 규칙) +
   앞 음 오른쪽 부속 + 뒤 음 왼쪽 부속(고스트 괄호·앞꾸밈음).
   실제 픽셀 = max(w × ROW_MUL, min) — **justify·눌림은 음가 폭에만 곱한다.**
   그래서 줄을 아무리 눌러도 머리가 못 겹친다(옛 MIN_STEP·squeezeFloor·ornMul을 대체).
   16분으로 꽉 찬 박은 w=SLOT_W ≥ min이라 **예전 폭 그대로다**(div8 항등식 유지). */
const SPACE_P = 0.5;                     // √2 규칙. 0.6(≈MuseScore 1.5)에서 표준값으로 (2026-09-10)
function spanW(t){                       // t = 박 단위 길이. **음가 폭만** — 하한은 gap.min이 진다
  return GEO.SLOT_W * Math.pow(t*4, SPACE_P);
}
const COL_GHOST_R = 3.6, COL_GHOST_L = 4.9;   // 고스트 괄호가 머리 밖으로 나가는 폭 (0.4/0.55sp)
const COL_ORN = {1: 3.6, 2: 10.6, 3: 17.6};            // 플램·드래그가 왼쪽에 더 요구하는 폭 (옛 ORN_NEED − 15)
function colBase(){ return Math.min(15, GEO.SLOT_W); }   // 머리 10.8 + 숨
/* 박마다 온셋 수만큼 돌고 xAtPos가 음표마다 부른다 — 캐시는 예전 그대로
   (_bwToken: paint가 GEO를 잡을 때마다 올린다. 마디는 제자리에서 고쳐지므로
   객체 동일성만으로는 무효화가 안 된다) */
let _bwToken = 0;
const _bwCache = new WeakMap();
function beatSpans(m, b){
  if(!m) return {gaps:[{t0:0, t1:1, w:beatW(), min:0}], nat:beatW()};   // 옛 beatWOf의 !m 폴백
  if(m.rpt){ const w = spanW(beatQ(m, b)); return {gaps:[{t0:0, t1:1, w, min:0}], nat:w}; }   // % 마디 = 빈 마디 폭
  let e = _bwCache.get(m);
  if(!e || e.token !== _bwToken){ e = {token:_bwToken, arr:[]}; _bwCache.set(m, e); }
  if(e.arr[b]) return e.arr[b];
  // 손·발 온셋을 박 안의 시각으로 모으고, 그 시각의 부속(고스트·앞꾸밈음)도 같이 적는다
  const att = new Map();
  let mixHit = false;
  ['hand','foot'].forEach(v=>{
    const d = divOf(m, b, v), off = beatOffset(m, v, b), dn = divCells(d);
    for(let k=0; k<dn; k++){
      let hit = false, ghost = false;
      for(const i of INSTR){
        if(i.voice !== v) continue;
        const val = m[i.id][off+k]|0;
        if(val){ hit = true; if(isGhost(val)) ghost = true; }
      }
      if(!hit) continue;
      const t = cellFrac(d, k);
      const a = att.get(t) || {l:0, r:0};
      if(ghost){ a.l = Math.max(a.l, COL_GHOST_L); a.r = Math.max(a.r, COL_GHOST_R); }
      if(v === 'hand' && m.orn){
        let o = 0;
        for(const id in m.orn){ const x = (m.orn[id]||[])[off+k]|0; if(x > o) o = x; }
        if(o) a.l = Math.max(a.l, COL_ORN[o] || 0);
      }
      att.set(t, a);
      if(DIV_MIX[d]) mixHit = true;
    }
  });
  /* 섞은 박(1.8) — 뒤 반박 머리(0.5)에 쉼표가 설 수 있다. 온셋이 아니라도 그 자리를
     간격표의 경계로 세워 쉼표가 앞뒤 머리와 같은 충돌 최소를 받게 한다. 안 세우면
     쉼표가 다음 머리 바로 옆(0.5 → 0.667)에 끼어 겹친다 */
  if(mixHit && !att.has(0.5)) att.set(0.5, {l:0, r:0});
  const ts = [...att.keys()].sort((x,y)=>x-y);
  const q = beatQ(m, b), base = colBase();
  const gaps = [];
  let prev = 0, prevAtt = null;            // 박 머리(온셋 아님)에는 부속이 없다
  for(const t of ts){
    if(t > prev + 1e-9)
      gaps.push({t0:prev, t1:t, w:spanW((t - prev)*q),
                 min: prevAtt ? base + prevAtt.r + att.get(t).l : 0});
    prev = t; prevAtt = att.get(t);
  }
  /* 꼬리 — 마지막 온셋에서 박 끝까지. **다음 박 첫 칸(k=0)의 온셋·꾸밈음은 이 gap이
     책임진다**(옛 ornAtBeatStart가 하던 일). 사이에 BEAT_GAP이 따로 더해지므로 그만큼 뺀다.
     마디 마지막 박이면 M_PAD가 받으므로 0이다. */
  let tailMin = 0;
  if(prevAtt && b + 1 < beatCount(m)){
    const nl = nextBeatHeadAtt(m, b + 1);
    /* BEAT_GAP은 안 뺀다 — BEAT_GAP은 ROW_MUL을 타고 줄어들어서, 빼 두면 줄이
       눌릴 때 하한이 뚫려 머리가 겹친다(390 셋잇단 실측 -0.5px) */
    if(nl != null) tailMin = base + prevAtt.r + nl;
  }else if(prevAtt){
    /* 마디 끝 기호 자리 (2026-09-11). 닫는 도돌이(점~굵은 줄 15.6px)·마침줄(7.7)·
       겹세로줄(5.9)은 마디선 **안쪽**에 그려지는데, 그 폭을 아무도 안 잡아 둬서
       16분·32분으로 끝나는 마디의 마지막 머리가 도돌이 점을 덮었다(제보 17마디).
       온셋은 xAtPos가 (M_PAD+6)에서 시작하므로 마지막 온셋 중심 → 마디선의 여백은
       꼬리 + (M_PAD−6)·ROW_MUL 뿐이다(화면 10·출력 3px). 그 여백은 줄이 눌리면
       같이 줄어드니 최악(0.75배)만 믿고 나머지를 여기서 받는다.
       기호 없는 보통 마디선은 예전 그대로 0 — 옛 악보 바이트가 안 바뀐다. */
    const need = endSignNeed(m);
    if(need) tailMin = Math.max(0, need + prevAtt.r - (GEO.M_PAD - 6) * 0.75);
  }
  gaps.push({t0:prev, t1:1, w:spanW((1 - prev)*q), min: tailMin});
  const nat = gaps.reduce((s,g)=> s + Math.max(g.w, g.min), 0);
  return (e.arr[b] = {gaps, nat});
}
/* 마지막 온셋 중심 → 마디선까지 필요한 최소 거리: 머리 반폭 5.4 + 숨 3 + 기호가 안쪽으로
   차지하는 폭. 닫는 도돌이가 마디선을 대신하므로 rep.b가 우선이다 */
function endSignNeed(m){
  if(m.rep && m.rep.b) return 24;          // 5.4 + 3 + 15.6 (점 r1.6 @ bx-14)
  if(m.bar === 'final') return 16;         // 5.4 + 3 + 7.7 (얇은 줄 @ MW-7)
  if(m.bar === 'double') return 14;        // 5.4 + 3 + 5.2 (얇은 줄 @ MW-4.5)
  return 0;
}
/* 다음 박 **첫 칸(k=0)** 온셋의 왼쪽 부속. 온셋이 없으면 null(충돌 상대가 없다) */
function nextBeatHeadAtt(m, b){
  let has = false, ghost = false, l = 0;
  ['hand','foot'].forEach(v=>{
    const off = beatOffset(m, v, b);
    for(const i of INSTR){
      if(i.voice !== v) continue;
      const val = m[i.id][off]|0;
      if(val){ has = true; if(isGhost(val)) ghost = true; }
    }
  });
  if(!has) return null;
  if(ghost) l = COL_GHOST_L;
  if(m.orn){
    const off = beatOffset(m, 'hand', b);
    let o = 0;
    for(const id in m.orn){ const x = (m.orn[id]||[])[off]|0; if(x > o) o = x; }
    if(o) l = Math.max(l, COL_ORN[o] || 0);
  }
  return l;
}
/* gap의 실제 픽셀 — justify(mul)는 음가 폭에만 붙고, 충돌 최소에서 멈춘다 */
function gapPx(g, mul){ return Math.max(g.w * (mul == null ? ROW_MUL : mul), g.min); }
function beatPxAt(m, b, mul){
  let s = 0;
  for(const g of beatSpans(m, b).gaps) s += gapPx(g, mul);
  return s;
}
function beatWOf(m, b){                  // 자연 폭(mul=1) — 줄 나누기·measureW가 본다
  if(!m) return beatW();
  return beatSpans(m, b).nat;
}
/* 마디 앞에 박자표가 붙으면 그만큼 넓어야 한다 (2026-09-01).
   `measureW`는 줄 나누기·SVG 폭·재생선이 다 보는 값이라, 여기서 안 더하면
   숫자가 첫 음표를 덮는다. 앞 마디를 봐야 알 수 있으므로 인덱스를 같이 받는다.
   **인덱스를 안 주면 예전과 똑같다** — 옛 호출부가 그대로 돈다. */
const TS_INSET = 15;
function tsChangesAt(mi){
  if(!(mi > 0)) return false;
  const a = tsOf(measures[mi-1]), b = tsOf(measures[mi]);
  return a[0] !== b[0] || a[1] !== b[1];
}
function measureW(m, mi){
  const nb = beatCount(m);
  let w = 2*GEO.M_PAD + (nb-1)*GEO.BEAT_GAP;
  for(let b=0; b<nb; b++) w += beatWOf(m, b);
  if(mi !== undefined && tsChangesAt(mi)) w += TS_INSET;
  return w;
}
/* ROW_MUL이 반영된 **실제** 마디 폭. 패드·박 사이·박자표 자리는 선형으로 늘고 줄고,
   온셋 gap은 충돌 최소에서 멈춘다 — 그래서 measureW×ROW_MUL과 같지 않을 수 있다.
   마디선·구간 상자·탭 영역·재생선 캐시가 전부 이 값을 써야 그림과 어긋나지 않는다. */
function measureWAt(m, mi, mul){
  const u = (mul == null ? ROW_MUL : mul);
  const nb = beatCount(m);
  let w = (2*GEO.M_PAD + (nb-1)*GEO.BEAT_GAP) * u;
  for(let b=0; b<nb; b++) w += beatPxAt(m, b, u);
  if(mi !== undefined && tsChangesAt(mi)) w += TS_INSET * u;
  return w;
}
/* 줄 배수 풀기 — Σ measureWAt(mul) = fillW 인 mul. gap이 min에서 멈추므로 폭은 mul의
   구간별 1차 함수다: min에 걸린 gap(고정분)과 나머지(선형분)를 나눠 한 번에 풀고,
   걸리는 집합이 바뀌면 다시 푼다 — 단조라 몇 번이면 수렴한다.
   아무 gap도 안 걸리면 첫 판에 fillW/자연폭이 나와 **예전 식과 정확히 같다.** */
function solveRowMul(row, fillW){
  let lin0 = 0; const gaps = [];
  row.forEach(mi=>{
    if(mi && typeof mi === 'object'){ lin0 += mi.fixed; return; }   // 멀티레스트 칸 — 통째로 선형
    const m = measures[mi]; if(!m) return;
    const nb = beatCount(m);
    lin0 += 2*GEO.M_PAD + (nb-1)*GEO.BEAT_GAP + (tsChangesAt(mi) ? TS_INSET : 0);
    for(let b=0; b<nb; b++) gaps.push(...beatSpans(m, b).gaps);
  });
  const nat = lin0 + gaps.reduce((s,g)=> s + Math.max(g.w, g.min), 0);
  let mul = nat > 0 ? fillW / nat : 1;
  for(let it=0; it<6; it++){
    let lin = lin0, fixed = 0;
    for(const g of gaps){ if(g.w*mul >= g.min) lin += g.w; else fixed += g.min; }
    const next = lin > 0 ? (fillW - fixed) / lin : mul;
    if(Math.abs(next - mul) < 1e-4){ mul = next; break; }
    mul = next;
  }
  return Math.max(mul, 0.01);
}
/* **`m`을 꼭 넘길 것.** 안 넘기면 박 폭이 전부 기본값으로 계산되어
   32분이 든 마디에서 음표가 엉뚱한 자리에 찍힌다. `pos`가 마디 끝(=nb)이어도
   안전하다 — `divOf`가 범위 밖에서 4를 돌려주므로 마지막 항이 0이 된다. */
function xAtPos(mx, pos, m){
  const b = Math.floor(pos + 1e-9);
  let x = (GEO.M_PAD + 6) * ROW_MUL;
  for(let i=0; i<b; i++) x += beatPxAt(m, i) + GEO.BEAT_GAP * ROW_MUL;
  const f = pos - b;
  if(f > 1e-9){
    /* 박 안은 이제 시간 비례가 아니라 **간격표를 걷는다** — 온셋 자리는 gap 경계에
       정확히 서고, 그 사이(쉼표·재생선)는 gap 안에서 선형으로 잇는다 */
    for(const g of beatSpans(m, b).gaps){
      if(f >= g.t1 - 1e-9) x += gapPx(g);
      else { if(f > g.t0) x += (f - g.t0) / (g.t1 - g.t0) * gapPx(g); break; }
    }
  }
  return mx + x;
}
/* 줄을 폭에 맞춰 늘릴 때의 **가로 배수**. 마디 안의 x 오프셋에만 곱한다 —
   음표 머리·글리프 크기는 안 건드린다(인쇄 악보도 간격만 늘린다).
   `GEO`와 같은 성격의 전역이라 같은 함정을 갖는다: **쓴 뒤 반드시 1로 되돌릴 것.**
   `paint()`가 줄마다 세팅하고 끝에서 되돌린다. 재생선은 `slotXCache[mi].mul`을
   잠깐 세팅했다 되돌린다. 안 되돌리면 다음 그리기가 통째로 늘어난다. */
let ROW_MUL = 1;

/* ★ 재생선의 x — **앵커 사이를 시간으로 잇는다** (2026-08-14).

   `xAtPos`는 **음표를 찍는 자리**라 박과 박 사이에 BEAT_GAP이, 마디와 마디 사이에
   M_PAD가 양쪽으로 끼어 있다. 그리는 데는 그게 맞다. 그런데 **움직이는 선**이
   그 위를 지나면 박이 바뀔 때 GEO.BEAT_GAP, 마디가 바뀔 때 2*M_PAD+12만큼
   순간이동한다 — 한 마디에 네 번이다.
   영상 개념증명에서 "뚝뚝 끊긴다"의 정체가 이것이었다(프레임 수를 30→60으로
   올려도 그대로였던 이유). 샘플링이 아니라 **위치 함수 자체가 끊겨 있었다.**

   고침: 박의 자리(앵커)는 그대로 두고 앵커와 앵커 사이를 시간으로 채운다.
   재생선은 매 박 정확히 음표 위에 있으면서 점프가 사라진다.
   마디 끝 박만 조금 빨리 가지만 점프가 아니라 속도 변화라 눈에 안 띈다.

   nextX0 = **다음에 칠 마디의 x0**. 같은 줄 바로 오른쪽일 때만 넘긴다 —
   줄이 바뀌거나 도돌이로 되돌아가면 이어 봐야 화면을 가로질러 날아갈 뿐이다.
   그때는 마디 끝(`xAtPos(x0, nb)` = 마디선 바로 앞)까지만 간다.

   영상 내보내기(`poc-video2.js`)도 이 함수를 쓴다. 계산이 두 벌이 되면
   한쪽만 고쳐 놓고 다른 쪽이 끊기는 일이 반드시 생긴다.

   **`b0`는 `nb-1`에 가둔다.** 여기에 `1e-9` 같은 보정을 넣으면 마디 끝(beat=nb)에서
   `b0`가 nb로 올라가 마지막 구간이 통째로 사라지고, 그 자리에 16px 점프가 생긴다
   (마디마다 한 번. 실제로 이렇게 짰다가 검증에서 잡혔다). beat=nb는 f=1로,
   즉 "다음 앵커에 정확히 도착"으로 읽혀야 한다. */
function playheadX(x0, beat, nb, nextX0, m, mNext){
  const b  = Math.max(0, Math.min(nb, beat));
  const b0 = Math.min(nb - 1, Math.floor(b)), f = b - b0;
  const xa = xAtPos(x0, b0, m);
  const xb = (b0 + 1 < nb) ? xAtPos(x0, b0 + 1, m)
           : (nextX0 != null ? xAtPos(nextX0, 0, mNext || m) : xAtPos(x0, nb, m));
  return xa + (xb - xa) * f;
}

/* 음표값 — 한 박이 div칸일 때 span칸을 차지하는 음의 꼬리(빔) 개수와 점 여부.
   단위 칸 하나의 꼬리 수: 8분=1, 8분셋잇단=1, 16분=2, 16분셋잇단=2, 32분=3.
   span이 2의 거듭제곱이면 그만큼 꼬리가 줄고, 1.5배면 점을 붙인다.

   div=4에서 기존 규칙과 정확히 같다 — 1칸=16분(2), 2칸=8분(1), 3칸=점8분(1+점), 4칸=4분(0).
   div=3이면 1칸=8분(1), 2칸=4분(0), 3칸=점4분(0+점) — 3:2 괄호 안에서 점4분이 곧 한 박이다. */
const UNIT_FLAGS = {1:0, 2:1, 3:1, 4:2, 5:2, 6:2, 7:2, 8:3};   // 5·7 = 16분 5·7연음, 1 = 반박 조각의 8분 (1.8)
function noteValue(span, div, q){
  let u = (div in UNIT_FLAGS) ? UNIT_FLAGS[div] : 2;   // 1 → 0이라 || 를 쓰면 안 된다 (1.8)
  /* 두 박을 묶은 박(q=2)은 칸 하나가 그만큼 길다 — 꼬리가 하나 준다.
     묶은 박의 div 3이 4분음표 셋잇단(꼬리 0)이 되는 이유가 이 줄이다.
     점4분 박(q=1.5, 6/8)은 floor(log2 1.5)=0이라 예전 그대로다 */
  if(q >= 2) u -= Math.floor(Math.log2(q));
  /* 반박 조각(섞어 나누기, q=0.5)은 칸 하나가 그만큼 짧다 — 꼬리가 하나 는다.
     q가 1·1.5·2…인 옛 경로는 이 줄을 안 탄다 */
  else if(q > 0 && q < 1) u -= Math.floor(Math.log2(q));
  let p = 1;
  while(p*2 <= span) p *= 2;                 // span 이하의 가장 큰 2의 거듭제곱
  const raw = u - Math.round(Math.log2(p));
  /* raw가 음수면 4분보다 긴 값 — 묶은 박에서만 나온다. 2분음표(빈 머리)로 그린다 */
  return {flags: Math.max(0, raw), half: raw < 0, dot: (span === p*1.5)};
}
/* 셋잇단처럼 2의 거듭제곱이 아닌 분할만 괄호·숫자가 필요하다.
   **점4분 박(6/8·12/8…)에서는 3칸·6칸이 셋잇단이 아니다** — 그냥 8분·16분이다.
   6/8 악보에 3이 줄줄이 찍히면 그건 틀린 악보다. m·b를 안 주면 예전처럼 답한다 */
function isTuplet(d, m, b){
  // 섞은 박은 셋 조각이 있으면 숫자가 오른다 — markLevels·handInkTop이 층을 예약한다
  if(DIV_MIX[d]) return DIV_MIX[d].includes(3);
  if(d === 5 || d === 7) return true;            // 5·7연음 (1.8)
  if(!(d===3 || d===6)) return false;
  if(m && b != null && compoundBeat(m, b)) return false;
  return true;
}

function voiceHasAny(m, voice){
  return INSTR.some(i => i.voice===voice && m[i.id].some(v=>v));
}
/* 한 마디 반복 기호(%) — SMuFL repeat1Bar 모양: 굵은 사선 + 점 둘, 마디 한가운데·셋째 줄.
   `m.rpt`가 켜진 마디는 음표 대신 이것만 그린다 — 데이터(음표)는 그대로 있어 재생·커서가
   예전처럼 돈다. 간격표(beatSpans)도 빈 마디 폭으로 준다 (2026-09-12 드러머 제보). */
function drawRepeatBar(cx, top){
  const cy = top + 2*LG;
  SVGT.appendChild(el('line',{x1:cx-6.5, y1:cy+7.5, x2:cx+6.5, y2:cy-7.5, stroke:INK,
    'stroke-width':3.4, 'stroke-linecap':'round'}));
  SVGT.appendChild(el('circle',{cx:cx-7, cy:cy-3.6, r:1.9, fill:INK}));
  SVGT.appendChild(el('circle',{cx:cx+7, cy:cy+3.6, r:1.9, fill:INK}));
}
function drawMeasure(m, mx, top){
  const hasH = voiceHasAny(m,'hand'), hasF = voiceHasAny(m,'foot');
  // 마디가 통째로 비면 온쉼표 하나만.
  // Weinberg: 두 성부에 공통인 쉼표는 원래 자리에 한 번만 적어도 된다
  const mw = measureWAt(m);
  if(m.rpt){ drawRepeatBar(mx + mw/2, top); return; }
  /* 빈 마디를 **자리표시로** 쓰는 채보가 있다(2026-08-29 요청 12) — 그때는 온쉼표가
     거슬린다. 성부 하나만 쉬는 온쉼표는 안 건드린다. 그건 "이 성부는 쉰다"는 정보다. */
  if(!hasH && !hasF){ if(SHOW_MREST) drawWholeRest(mx + mw/2, top, 'both'); return; }

  /* ── 스템 통합 표기 (2026-08-15, 사용자 설정) ──
     손·발을 한 성부로 합쳐 **전부 위 스템**으로 그린다. 킥이 아래로 내려가지 않고
     같은 자리의 하이햇·스네어와 한 스템에 매달린다 — 드러머 절반이 이렇게 읽는다.
     `drawVoiceBeat`가 이미 한 스템에 머리를 여러 개 그리므로(`ys` 배열) 비용이 거의 없다.

     **쉼표는 한 번만 나온다.** 성부가 하나니까 그게 맞는 동작이다 —
     2026-08-11 피드백("손·발 양쪽에 쉼표를 그려 달라")은 성부가 둘일 때의 얘기다.
     합친 표기에서는 애초에 "어느 성부가 쉬는지"를 물을 일이 없다. */
  if(mergeOK(m)){
    for(let b=0;b<beatCount(m);b++) drawVoiceBeat(m, mx, top, b, 'all', mergedNotationBeat(m, b));
    return;
  }
  // 한 성부만 마디 내내 비면 박마다 4분쉼표를 늘어놓지 않고 온쉼표 하나로 적는다
  if(!hasH) drawWholeRest(mx + mw/2, top, 'hand');
  if(!hasF) drawWholeRest(mx + mw/2, top, 'foot');
  for(let b=0;b<beatCount(m);b++){
    const hOn = hasH && onsetsOf(m, b, 'hand').length;
    const fOn = hasF && onsetsOf(m, b, 'foot').length;
    // 양쪽이 다 쉬는 박이면 공통 쉼표를 원래 자리에 한 번만 (Weinberg).
    // 두 성부가 다 살아 있는 마디에서만. 한쪽이 마디 내내 비면 그쪽은 이미 온쉼표를 받았다
    if(hasH && hasF && !hOn && !fOn){
      restGlyph(xAtPos(mx, b + 0.375, m), top + REST_ORIGIN.both*LG,
                mergedBeat(m, b) ? 'h' : 'q');
      continue;
    }
    if(hasH) drawVoiceBeat(m, mx, top, b, 'hand');
    if(hasF) drawVoiceBeat(m, mx, top, b, 'foot');
  }
}

/* ── 앞꾸밈음 그리기 — 플램·드래그 (2026-08-17) ──
   본음 **왼쪽**에 작은 음표를 붙인다. 플램은 하나(꼬리 하나), 드래그는 둘(빔으로 이음).
   스템 방향은 본음을 따라간다. 슬러는 안 그린다 — 오선 간격이 9px이라 뭉개지고,
   드럼 교재도 생략하는 쪽이 많다.
   **가로 자리는 그 박의 실제 칸 폭(stepPx)에 맞춰 좁힌다** — 고정값으로 두면
   출력(SLOT_W 14)이나 32분 박에서 앞 음표 머리를 덮는다(8-13장 교훈).
   박 자체도 `ORN_W_MUL`로 넓어져 있어서 둘이 같이 맞물린다. */
function drawOrn(x, y, up, kind, ins, stepPx, roomPx, mainY){
  /* 본음 머리(rx 5.4)와 꾸밈음 머리(rx 3.2)가 **안 닿는** 거리에서 시작한다 —
     8.6이면 사이가 0px이라 붙어 보였다. 여유가 있으면 머리 하나 폭(13.5)까지 벌린다 */
  let near = Math.max(9.4, Math.min(13.5, stepPx * 0.45));
  /* 꾸밈음 **둘 사이**의 하한은 머리 폭에서 나온다 — 6.4(rx 3.2 × 2)에 숨 0.6.
     5.6으로 뒀더니 드래그의 두 머리가 0.8px 겹쳤다(verify-orn이 잡았다).
     ✗ 머리는 가로로 더 넓어서 조금 더 벌린다 */
  let gap2 = (kind >= 2)
    ? Math.max(7.0, Math.min(8.6, stepPx * 0.30)) + (ins.head === 'x' ? 1.4 : 0) : 0;
  const nGap = Math.max(0, Math.min(2, kind - 1));   // 꾸밈음 사이 틈 개수 — 드래그 1 · 러프 2
  /* **쓸 수 있는 자리를 넘지 않는다.** 간격이 넉넉해질수록 near·gap2도 같이 커지는데,
     중간 구간(간격 26~36px)에서는 그 증가분이 여유분보다 빨라 앞 머리를 덮었다.
     `roomPx`는 부르는 쪽이 준다 — 보통은 앞 온셋까지, 마디 첫 음은 마디선까지다
     (꾸밈음이 마디선을 넘어가면 앞 마디 것처럼 보인다). */
  const cap = Math.max(0, roomPx - 3.2 - 0.6);
  if(near + gap2*nGap > cap && cap > 0){
    const k = cap / (near + gap2*nGap);
    near = Math.max(9.4, near * k);
    if(gap2) gap2 = Math.max(7.0, gap2 * k);
  }
  const xs = []; for(let i=nGap; i>=0; i--) xs.push(x - near - gap2*i);   // 왼쪽부터
  const sdx = up ? 2.7 : -2.7;               // 스템은 머리 옆(본음과 같은 규칙)
  const stemH = 13;
  const tips = [];
  xs.forEach(gx=>{
    if(ins.head === 'x'){
      const r = 2.8;
      SVGT.appendChild(el('line',{x1:gx-r,y1:y-r,x2:gx+r,y2:y+r,stroke:INK,'stroke-width':1.3,'stroke-linecap':'round'}));
      SVGT.appendChild(el('line',{x1:gx-r,y1:y+r,x2:gx+r,y2:y-r,stroke:INK,'stroke-width':1.3,'stroke-linecap':'round'}));
    } else {
      SVGT.appendChild(el('ellipse',{cx:gx, cy:y, rx:3.2, ry:2.4, fill:INK,
        transform:`rotate(${ST.tilt} ${gx} ${y})`}));   // 본음과 같은 기울기 — 스타일을 따른다
    }
    const ty = up ? y - stemH : y + stemH;
    SVGT.appendChild(el('line',{x1:gx+sdx, y1:y, x2:gx+sdx, y2:ty, stroke:INK, 'stroke-width':1.1}));
    tips.push({x:gx+sdx, y:ty});
  });
  if(kind >= 2){
    // 드래그·러프 — 꾸밈음 둘·셋을 **두 겹 빔**으로 잇는다(16분이 관례)
    const dy = up ? 3.6 : -3.6, last = tips[tips.length-1];
    for(let i=0; i<2; i++){
      SVGT.appendChild(el('line',{x1:tips[0].x, y1:tips[0].y + i*dy,
        x2:last.x, y2:last.y + i*dy, stroke:INK, 'stroke-width':1.5}));
    }
  } else {
    // 플램 — 꼬리 하나 + **스템 관통 사선**(표준: 두께 0.125sp, 약 40°).
    // 사선이 없으면 그냥 작은 음표라 플램으로 안 읽힌다 (2026-09-03 점검 5번)
    const t = tips[0];
    const d = up ? `M ${t.x} ${t.y} c 4.4 1.5, 5.4 5.2, 1.5 9.0 c 2.3 -4.2, 1.1 -6.4, -1.5 -7.3 Z`
                 : `M ${t.x} ${t.y} c 4.4 -1.5, 5.4 -5.2, 1.5 -9.0 c 2.3 4.2, 1.1 6.4, -1.5 7.3 Z`;
    SVGT.appendChild(el('path',{d, fill:INK}));
    SVGT.appendChild(el('line', up
      ? {x1:t.x-3.4, y1:y-4.2, x2:t.x+4.2, y2:y-10.6, stroke:INK, 'stroke-width':1.1, 'stroke-linecap':'round'}
      : {x1:t.x-3.4, y1:y+4.2, x2:t.x+4.2, y2:y+10.6, stroke:INK, 'stroke-width':1.1, 'stroke-linecap':'round'}));
  }
  /* 이음줄 — 꾸밈음 머리에서 본음 머리까지, 머리 쪽(스템 반대)의 작은 아치.
     교재 관례("connected with arc"). 오선 간격 9px에서도 뭉개지지 않는 얕은 곡선 */
  {
    const Y0 = (mainY == null) ? y : mainY;          // 본음이 다른 줄이면 거기까지 (2026-10-02)
    const gx = xs[0], my = up ? y + 4 : y - 4, my2 = up ? Y0 + 4 : Y0 - 4, dip = up ? 4 : -4;
    SVGT.appendChild(el('path',{d:`M ${gx} ${my} Q ${(gx+x)/2} ${(my+my2)/2+dip} ${x-3} ${my2}`,
      fill:'none', stroke:INK, 'stroke-width':1, 'stroke-linecap':'round'}));
  }
}

/* ── 손 순서(R·L) 그리기 (2026-08-17) ──
   글자는 칸 소속이라 손 분할로 x를 구한다. **음표가 있는 칸만** 그린다 —
   글자만 떠 있으면 어느 음의 손인지 알 수 없다. 위치는 설정(STICK_POS):
   위면 markLevels가 잡아 둔 층(MARK_Y.stick), 아래면 발 빔 밑(bottom+stickB). */
/* 한 마디의 손 성부 잉크가 오선 위로 얼마나 올라가는지 — markLevels의 마디별 판.
   markLevels는 **줄 전체의 최솟값**으로 층을 예약한다(안전 여백). 그대로 글자를
   그리면 다른 마디의 셋잇단·크래시 때문에 R·L이 자기 음표에서 한참 떠 버린다
   (2026-08-28 사용자 지적 — 실기기에서 크레딧 줄까지 올라가 있었다).
   예약은 markLevels대로 두고 **그리기만 이 값**을 쓴다. 마디별 값은 전역 최솟값보다
   항상 낮거나 같아서 예약된 층 안에 들어온다. 셈은 markLevels와 한 쌍이다 —
   한쪽을 고치면 다른 쪽도 같이 고칠 것. */
function handInkTop(mm){
  let beam = -14;
  HAND_INS.forEach(i => {
    if((mm[i.id] || []).some(v => v)) beam = Math.min(beam, i.pos*LG/2 - 30);
  });
  const tup = upperVoiceHasTuplet(mm);
  const hh = mm.hihat || [];
  let openPlain = false, openAcc = false;
  for(let sIdx = 0; sIdx < hh.length; sIdx++){
    // markLevels와 **한 쌍**이다 — 위 함수를 고치면 여기도 같이 고칠 것
    const mark = HAND_INS.some(i => {
      const v = ((mm[i.id] || [])[sIdx]|0);
      return (v === ART.OPEN && OPEN_OK[i.id]) || (v === ART.CLOSED && CLOSED_OK[i.id]);
    });
    if(!mark) continue;
    const a = HAND_INS.some(i => i.id !== 'hihat' && ((mm[i.id] || [])[sIdx]|0) === ART.ACCENT);
    if(a) openAcc = true; else openPlain = true;
  }
  let base = beam;
  if(openPlain) base = Math.min(base, beam - 12 - 3.8);
  if(openAcc)   base = Math.min(base, beam - 19 - 3.8);
  if(tup)       base = Math.min(base, beam - (openAcc ? 29 : 22) - 5.5);
  return base;
}

function drawStick(m, mx, top){
  if(m.rpt || !m.stick || !m.stick.some(v=>v)) return;
  const y = (STICK_POS === 'below') ? top + 4*LG + MARK_Y.stickB
                                    : top + Math.round(handInkTop(m)) - 3;
  const nb = beatCount(m);
  for(let b=0; b<nb; b++){
    const div = divOf(m, b, 'hand'), off = beatOffset(m, 'hand', b), dn = divCells(div);
    for(let k=0; k<dn; k++){
      const s = off + k, v = m.stick[s];
      if(!v) continue;
      if(!HAND_INS.some(i => (m[i.id]||[])[s])) continue;
      /* 사용자 제보 악보(2026-08-17)를 따른다 — 굵은 세리프 R·L이 빔·기호 위
         한 줄에 나란히. 박자표·셋잇단 숫자와 같은 Georgia 계열이라 악보에 녹는다 */
      const t = el('text',{x: xAtPos(mx, b + cellFrac(div, k), m), y, 'font-size':10.5,
        'font-weight':'700', fill:INK, 'text-anchor':'middle',
        'font-family':ST.font});
      t.textContent = (v === 1) ? 'R' : 'L';
      SVGT.appendChild(t);
    }
  }
}

function kickLabelOnset(m,s){
  return !!(m && !m.rpt && (m.kick||[])[s] && !(m.tie && m.tie.kick && m.tie.kick[s]));
}
function drawKickLabels(m,mx,top){
  if(!m || m.rpt || !(m.kick||[]).some((v,s)=>kickLabelOnset(m,s))) return;
  for(let b=0;b<beatCount(m);b++){
    const div=divOf(m,b,'foot'),off=beatOffset(m,'foot',b);
    for(let k=0;k<divCells(div);k++){
      if(!kickLabelOnset(m,off+k)) continue;
      const label=el('text',{x:xAtPos(mx,b+cellFrac(div,k),m),y:top+4*LG+MARK_Y.kick,
        'font-size':10.5,'font-weight':'700',fill:INK,'text-anchor':'middle','font-family':ST.font,
        class:'kick-label'});
      label.textContent='K';SVGT.appendChild(label);
    }
  }
}

/* ── 붙임줄 그리기 (2026-08-24) ──
   값 1이 붙은 온셋과 같은 악기의 **바로 앞 온셋**을 곡선으로 잇는다.
   곡선은 머리 쪽(스템 반대)이다 — 위 스템이면 머리 아래로 처지고, 발 성부(아래 스템)는
   머리 위로 솟는다. 스템 통합 표기(mergeOK)면 전부 위 스템이라 전부 아래 곡선이다.
   paint 루프에서 drawStick 옆에 한 번 부르므로 화면·PDF·PNG·영상에 다 실린다. */
/* 마디 사이 붙임줄 (2026-09-12 드러머 제보 STY 13→14마디 "o___+", 킥) —
   마디 **첫 온셋**에 값 1이 붙어 있으면 **앞 마디의 마지막 온셋**에서 잇는다.
   앞 마디가 같은 줄이면 곡선을 그 음까지 긋고, 줄이 바뀌면 관례대로 양쪽에 짧은
   토막을 남긴다(앞 줄 끝에서 마디선 쪽으로, 새 줄 첫 음 왼쪽에서 들어오는 토막).
   `link` = {prev:{m,mx}|null, next:{m,mx}|null, mi} — paint 루프가 채운다.
   안 주면(옛 호출부·검사) 마디 안 붙임줄만 그리던 예전 그대로다. */
function drawTies(m, mx, top, link){
  if(m.rpt) return;
  const merged = mergeOK(m);
  const arc = (x1, x2, y, up)=>{
    if(x2 - x1 < 8) return;                // 이을 폭이 없으면 안 그린다
    const dir = up ? 1 : -1;               // 위 스템 → 머리 아래
    const yy = y + dir * 6.6;
    const sag = dir * Math.min(7.5, 3.2 + (x2 - x1) * 0.09);
    SVGT.appendChild(el('path',{
      d:`M ${x1 + 2.5} ${yy} Q ${(x1 + x2) / 2} ${yy + sag} ${x2 - 2.5} ${yy}`,
      fill:'none', stroke:INK, 'stroke-width':1.4, 'stroke-linecap':'round'}));
  };
  const lastOnset = (mm, id)=>{ const a = mm[id] || []; for(let j=a.length-1; j>=0; j--) if(a[j]|0) return j; return -1; };
  const STUB = 16;
  if(m.tie) for(const id in m.tie){
    const ins = byId[id];
    if(!ins) continue;
    const row = m.tie[id], arr = m[id] || [];
    const y = yOf(ins.pos, top);
    const up = merged ? true : (ins.voice !== 'foot');
    for(let k=0; k<row.length; k++){
      if(!row[k] || !(arr[k]|0)) continue;
      let prev = -1;
      for(let j=k-1; j>=0; j--) if(arr[j]|0){ prev = j; break; }
      const x2 = xAtPos(mx, beatPosOf(m, ins.voice, k), m);
      if(prev < 0){
        /* 마디 첫 음 — 앞 마디에서 넘어오는 붙임줄. link가 없거나 앞 마디에 그 악기 음이 없으면
           예전처럼 안 그린다 */
        if(!link) continue;
        const pm = link.mi > 0 ? measures[link.mi - 1] : null;
        if(!pm || lastOnset(pm, id) < 0) continue;
        if(link.prev && link.prev.m === pm){
          arc(xAtPos(link.prev.mx, beatPosOf(pm, ins.voice, lastOnset(pm, id)), pm), x2, y, up);
        } else {
          arc(x2 - STUB, x2, y, up);        // 줄 첫머리 — 왼쪽에서 들어오는 토막
        }
        continue;
      }
      arc(xAtPos(mx, beatPosOf(m, ins.voice, prev), m), x2, y, up);
    }
  }
  /* 줄 끝 마디 — 다음 마디 첫 음이 이어지면 마디선 쪽으로 나가는 토막 */
  if(link && !link.next){
    const nm = measures[link.mi + 1];
    if(nm && nm.tie) for(const id in nm.tie){
      const ins = byId[id]; if(!ins) continue;
      const na = nm[id] || []; let f = -1;
      for(let j=0; j<na.length; j++) if(na[j]|0){ f = j; break; }
      if(f < 0 || !nm.tie[id][f]) continue;
      const pj = lastOnset(m, id); if(pj < 0) continue;
      const x1 = xAtPos(mx, beatPosOf(m, ins.voice, pj), m);
      const up = merged ? true : (ins.voice !== 'foot');
      arc(x1, x1 + STUB, yOf(ins.pos, top), up);
    }
  }
}

/* 한 박 안의 온셋. k는 **그 박의 분할 안에서의 칸 번호**다 */
/* voice가 `'all'`이면 손·발을 한 줄로 합친다 (스템 통합 표기).
   **성부마다 배열 시작점이 다르다** — `beatOffset`이 그 성부의 앞선 분할을 더한 값이라,
   같은 박이라도 손과 발의 인덱스가 다를 수 있다. 그래서 칸 번호 `k`로 맞추고
   인덱스는 악기별로 따로 구한다. 합치기는 **손·발 분할이 같은 박에서만** 부른다
   (`mergeOK`가 판정한다) — 다르면 한 스템에 두 리듬이라 그릴 방법이 없다. */
function onsetsOf(m, b, voice){
  const all = (voice === 'all');
  const d = divCells(divOf(m, b, all ? 'hand' : voice));
  const list = all ? INSTR : INSTR.filter(i => i.voice === voice);
  const arr = [];
  for(let k=0; k<d; k++){
    const ids = list.filter(i => m[i.id][idxAt(m, i.voice, b, k)]).map(i => i.id);
    if(ids.length) arr.push({k, ids, idx: idxAt(m, all ? 'hand' : voice, b, k)});
  }
  return arr;
}
/* 이 마디를 통째로 합쳐 그릴 수 있는가 — 모든 박에 정확한 공통 기보 격자가 있어야 한다.
   **판정을 마디 단위로 하는 이유**: 박마다 갈리면 한 마디 안에서 어떤 박은 스템이
   위아래로, 어떤 박은 위로만 붙어 읽는 사람이 혼란스럽다. 마디는 통째로 한 방식이어야 한다. */
function mergeOK(m){
  if(!MERGE_STEMS) return false;
  for(let b=0; b<beatCount(m); b++)
    if(divOf(m,b,'hand') !== divOf(m,b,'foot') && !mergedNotationBeat(m, b)) return false;
  return true;
}

/* 위쪽 숫자·R/L·구간 표시의 층도 실제 그릴 성부의 연음 표기를 기준으로 잡는다. */
function upperVoiceHasTuplet(m){
  const merged = mergeOK(m);
  return (m.div || []).some((d,b) => {
    if(!d) return false;
    const projection = merged ? mergedNotationBeat(m, b) : null;
    return isTuplet(projection ? projection.tuplet : d.h, m, b);
  });
}

/* 통합 표기의 공통 격자는 그림에만 쓴다. 저장된 분할·음표·장식 인덱스는 그대로다.
   분할 이름이 달라도 실제 타격 시각이 같은 격자에 있으면 같은 줄기로 읽을 수 있다.
   6연음에 정박 16분 타격이 끼면 12칸(32분 6연음)으로 세분한다. 숫자는 6:4 비율을
   유지하므로 1/12박 두 음과 1/6박 다섯 음을 함께 정확히 표현한다. 일반 3:4 폴리리듬은
   이 예외에 포함하지 않는다. 공간표와 재생 커서는 원본 measure를 계속 사용한다. */
function mergedNotationBeat(m, b){
  const hd = divOf(m, b, 'hand'), fd = divOf(m, b, 'foot');
  if(hd === fd) return null;
  const events = [];
  for(const voice of ['hand', 'foot']){
    const d = divOf(m, b, voice);
    for(const o of onsetsOf(m, b, voice)){
      const indices = {};
      for(const id of o.ids) indices[id] = idxAt(m, voice, b, o.k);
      events.push({t:cellFrac(d, o.k), ids:o.ids, indices});
    }
  }
  const fits = d => events.every(o => Array.from({length:divCells(d)}, (_,k)=>cellFrac(d,k))
    .some(t => Math.abs(t - o.t) < 1e-9));
  // 기존 손/발 기보를 우선 보존하고, 실제 필요한 타격만으로 공통 격자를 찾는다.
  const candidates = [...new Set([hd, fd, 4, 23, 32, 6, 3, 8])];
  let div = candidates.find(fits), tuplet = div;
  if(div == null && !compoundBeat(m, b) && ((hd === 6 && fd === 4) || (hd === 4 && fd === 6))){
    div = 12; tuplet = 6;
  }
  if(div == null) return null;
  const bySlot = new Map();
  for(const o of events){
    const k = div === 12 ? Math.round(o.t * 12)
      : Array.from({length:divCells(div)}, (_,k)=>k).find(k => Math.abs(cellFrac(div,k)-o.t) < 1e-9);
    const n = bySlot.get(k) || {k, ids:[], indices:{}};
    n.ids.push(...o.ids); Object.assign(n.indices, o.indices); bySlot.set(k, n);
  }
  const ons = [...bySlot.values()].sort((a,b)=>a.k-b.k);
  // 현재 음가 렌더러는 2의 거듭제곱 또는 점음표만 정확히 적을 수 있다.
  // 새 공통 격자에서 5/12·5/8 같은 길이가 생기면 타이 분해가 필요하므로
  // 원래 성부 표기를 유지한다. 앞 쉼표는 restsFor가 분해하므로 제한하지 않는다.
  const exactSpan = span => {
    let p = 1;
    while(p * 2 <= span) p *= 2;
    return span === p || span === p * 1.5;
  };
  const segs = divSegs(div), nCells = divCells(div);
  const wholeBeatOne = ons.length === 1 && ons[0].k === 0 && segs.length === 1;
  if(!wholeBeatOne && ons.some((o,i) => {
    const sg = segs.find(s => o.k >= s.k0 && o.k < s.k0 + s.n);
    return !exactSpan(Math.min(ons[i+1]?.k ?? nCells, sg.k0 + sg.n) - o.k);
  })) return null;
  return {div, tuplet, ons};
}

/* 박 안의 빈 구간을 메트릭에 맞는 쉼표로 쪼갠다.
   start = 박 안에서의 시작 칸, len = 칸 수, div = 그 박의 분할.

   규칙은 분할에 상관없이 하나다 — **쓸 수 있는 가장 긴 값은 2의 거듭제곱이고,
   시작 위치가 그 값의 배수여야 한다.** 그래야 박의 반(0-1 / 2-3) 경계를 안 넘는다.
   강박에서 시작하고 남은 길이가 정확히 1.5배면 점쉼표 하나로 적는다 —
   8분+16분 두 개보다 읽기 쉽다(드러머 확인).

   div=4에서 기존 결과와 같다: (0,4)→4분 / (0,3)→점8분 / (2,2)→8분 / (1,3)→16분+8분 */
function restsFor(start, len, div){
  const out = [];
  let s = start, n = len;
  let guard = 0;
  while(n > 0 && guard++ < 32){
    let p = 1;
    while(p*2 <= n && s % (p*2) === 0) p *= 2;
    if(s % (p*2) === 0 && n === p*1.5){ out.push([s, p*1.5, div]); break; }   // 점쉼표
    out.push([s, p, div]);
    s += p; n -= p;
  }
  return out;
}

/* 셋잇단 괄호와 숫자.
   스템·빔 **바깥쪽**에 놓는다. 액센트가 beamY±10에 오므로 그보다 더 바깥이어야 한다.
   빔으로 한 덩어리가 됐고 앞에 쉼표도 없으면 괄호를 생략하고 숫자만 적는다(기보 표준). */
function tupletMark(x1, x2, y, up, num, bracket){
  const mid = (x1 + x2)/2, half = 5.2;
  const t = el('text',{x:mid, y:y + (up ? 3.4 : 3.4), 'font-size':10.5, 'font-weight':'700',
    fill:INK, 'font-family':ST.font, 'text-anchor':'middle'});
  t.textContent = String(num);
  if(bracket){
    const hook = up ? 4 : -4;
    /* 괄호 굵기 0.16sp(1.44) — 표준(tupletBracketThickness). 스템(1.1)과 값이
       갈라져야 검사도 괄호와 스템을 구분할 수 있다 (2026-09-10) */
    const seg = (a, b)=> SVGT.appendChild(el('line',{x1:a, y1:y, x2:b, y2:y,
      stroke:INK, 'stroke-width':1.44, 'stroke-linecap':'round'}));
    seg(x1, mid - half); seg(mid + half, x2);
    SVGT.appendChild(el('line',{x1, y1:y, x2:x1, y2:y + hook, stroke:INK, 'stroke-width':1.44, 'stroke-linecap':'round'}));
    SVGT.appendChild(el('line',{x1:x2, y1:y, x2:x2, y2:y + hook, stroke:INK, 'stroke-width':1.44, 'stroke-linecap':'round'}));
  }
  SVGT.appendChild(t);
}

function drawVoiceBeat(m, mx, top, b, voice, projection){
  const ons = projection ? projection.ons : onsetsOf(m, b, voice);
  const up = (voice !== 'foot');            // 'all'은 위로 — 합쳐 그릴 땐 전부 위 스템이다
  const div = projection ? projection.div : divOf(m, b, voice === 'all' ? 'hand' : voice);
  const tupletDiv = projection ? projection.tuplet : div;
  const bq = beatQ(m, b);                   // 박 길이(4분음표 단위) — 묶은 박이면 2
  /* 공통 격자에 투영한 음표도 주법·꾸밈음은 원본 악기의 성부 인덱스로 읽는다.
     격자가 같을 때도 앞선 박의 손·발 분할 합이 다르면 배열 시작점은 다를 수 있다. */
  const sOf = (id, n) => n.indices ? n.indices[id] : idxAt(m, byId[id].voice, b, n.k);
  const rv = (voice === 'all') ? 'both' : null;      // 쉼표 높이
  const xOfK = k => xAtPos(mx, b + cellFrac(div, k), m);
  /* 조각(1.8) — 보통 박은 조각 하나라 아래 셈이 예전과 글자 그대로 같다.
     섞은 박(23 등)은 반박 둘이고, 음길이·쉼표·셋잇단 숫자를 **조각 안에서** 센다.
     음은 조각 끝을 넘지 않는다 — 넘으면 한 음표로 적을 수 없는 길이가 된다 */
  const segs = divSegs(div), nCells = divCells(div);
  const segOf = k => { for(let i=segs.length-1; i>=0; i--) if(k >= segs[i].k0) return i; return 0; };
  /* 박이 통째로 비면 그 박 길이만큼의 쉼표. 손·발 **양쪽 다** 그린다.
     한쪽만 그리면 그 박이 쉬는 건지 안 그린 건지 읽는 사람이 알 수 없다.
     빈 박에는 셋잇단 괄호를 안 씌운다 — 소리 나는 게 없으면 그냥 쉼표다.
     **점4분 박(6/8)은 점4분쉼표다.** 4분쉼표로 그리면 마디가 8분음표 하나만큼
     모자라 보이고, 그건 읽는 사람에게 그냥 틀린 악보다 */
  if(!ons.length){
    // 묶은 박(2박 3연음 자리)이 통째로 비면 반쉼표 — 4분쉼표면 한 박이 모자라 보인다
    drawRest(xAtPos(mx, b + 0.375, m), top, up, bq >= 2 ? -1 : 0, compoundBeat(m, b), rv);
    return;
  }
  // 박 앞쪽 빈 구간. 음표는 다음 온셋까지 늘어나므로 쉼표가 필요한 곳은 여기뿐이다
  const lead = ons[0].k;
  if(segs.length === 1){
    if(lead > 0){
      restsFor(0, lead, div).forEach(([k, span])=>{
        const v = div === 12 ? noteValue(span, 6, bq / 2) : noteValue(span, div, bq);
        drawRest(xOfK(k), top, up, v.half ? -1 : v.flags, v.dot, rv);
      });
    }
  } else {
    /* 섞은 박 — 조각마다 앞 빈 구간을 쉰다. 통째로 빈 조각은 그 조각 길이(8분)의 쉼표 하나 */
    segs.forEach(sg=>{
      const inSeg = ons.filter(o => o.k >= sg.k0 && o.k < sg.k0 + sg.n);
      const ld = inSeg.length ? inSeg[0].k - sg.k0 : sg.n;
      if(ld <= 0) return;
      if(!inSeg.length){
        const fl = Math.max(0, Math.round(-Math.log2(sg.fl * bq)));
        drawRest(xOfK(sg.k0), top, up, fl, false, rv);
        return;
      }
      restsFor(0, ld, sg.n).forEach(([k, span])=>{
        const v = noteValue(span, sg.n, bq * sg.fl);
        drawRest(xOfK(sg.k0 + k), top, up, v.half ? -1 : v.flags, v.dot, rv);
      });
    });
  }
  // 음표 머리 & 스템 정보
  const notes = ons.map((o,i)=>{
    const si = segOf(o.k), sg = segs[si], segEnd = sg.k0 + sg.n;
    const next = Math.min((i<ons.length-1)? ons[i+1].k : nCells, segEnd);
    const span = next - o.k;
    const v = div === 12 ? noteValue(span, 6, bq / 2)
      : segs.length === 1 ? noteValue(span, div, bq) : noteValue(span, sg.n, bq * sg.fl);
    const x = xOfK(o.k);
    const ys = o.ids.map(id => yOf(byId[id].pos, top));
    return {x, ys, span, flags:v.flags, half:v.half, dot:v.dot, k:o.k, s:o.idx, ids:o.ids, indices:o.indices, seg:si};
  });
  /* 한 음이 박을 통째로 채우면 셋잇단이 아니라 그냥 4분음표다.
     "점4분 + 3 괄호"로 적어도 틀리진 않지만 아무도 그렇게 안 쓴다.
     **다만 6/8에서는 점을 지우면 안 된다** — 그 박 자체가 점4분이라
     점 없는 4분음표로 그리면 마디가 8분음표 하나만큼 짧아진다 */
  const wholeBeatOne = (segs.length === 1 && notes.length===1 && notes[0].k===0 && notes[0].span===div);
  if(wholeBeatOne){
    notes[0].flags = 0; notes[0].dot = compoundBeat(m, b);
    // 묶은 박을 통째로 채운 한 음은 2분음표다 — 4분으로 그리면 한 박이 사라져 보인다
    if(bq >= 2){ notes[0].half = true; notes[0].dot = false; }
  }
  // 빔 y
  let beamY;
  if(up){
    const minY = Math.min(...notes.flatMap(n=>n.ys));
    beamY = Math.min(minY - 30, top - 14);
  } else {
    const maxY = Math.max(...notes.flatMap(n=>n.ys));
    beamY = Math.max(maxY + 28, top + 4*LG + 22);
  }
  const stemDx = up ? 5.2 : -5.2;
  /* 앞꾸밈음이 쓸 수 있는 왼쪽 자리 — **앞 온셋까지의 실제 거리**로 잰다.
     박 안이면 바로 앞 음표, 박 첫 음이면 **앞 박의 마지막 음**이다(빈 박은 건너뛴다).
     마디 첫 음이면 마디선까지. 박 폭만 보고 재면 박 첫 음에서 틀린다 */
  let prevX = -Infinity;
  for(let pb = b - 1; pb >= 0; pb--){
    const pp = voice === 'all' ? mergedNotationBeat(m, pb) : null;
    const po = pp ? pp.ons : onsetsOf(m, pb, voice);
    if(!po.length) continue;
    const pd = pp ? pp.div : divOf(m, pb, voice === 'all' ? 'hand' : voice);
    prevX = xAtPos(mx, pb + cellFrac(pd, po[po.length-1].k), m);
    break;
  }
  // 머리 + 스템 + 점
  notes.forEach((n, ni)=>{
    const leftX = ni > 0 ? notes[ni-1].x : prevX;
    n.ids.forEach(id=>{
      const ins = byId[id];
      const y = yOf(ins.pos, top);
      const art = m[id][sOf(id,n)]|0;
      const ghost = isGhost(art);
      /* 크로스 스틱은 **머리 모양이 바뀐다**(스네어 줄에 x). 자리는 그대로 스네어다 —
         같은 드럼을 다르게 친 것이라 줄을 옮기면 다른 악기로 읽힌다. */
      const xStick = (art === ART.XSTICK && XSTICK_OK[id]);
      const rim    = (art === ART.RIM    && RIM_OK[id]);
      const bell   = (art === ART.BELL   && BELL_OK[id]);
      const head   = bell ? 'd' : xStick ? 'x' : ins.head;
      /* 아래 narrowK와 같은 식 — ⊗ 원이 위에서 먼저 쓴다(const narrowK는 더 아래라 TDZ) */
      const narrowKOf = ()=> (div >= 8 || div === 7 || div === 5 || !!DIV_MIX[div]) ? beatPxAt(m, b)/nCells : 0;
      if(ins.pos <= -2 && !(CRASH_RING && id === 'crash')){ // 원형 크래쉬 머리 안에는 덧줄을 겹치지 않는다
        for(let p=-2;p>=ins.pos;p-=2){
          // Higher ledger lines must not pass through the simultaneous ring crash below.
          if(p===-2 && CRASH_RING && n.ids.includes('crash')) continue;
          SVGT.appendChild(el('line',{x1:n.x-9,y1:yOf(p,top),x2:n.x+9,y2:yOf(p,top),stroke:INK,'stroke-width':1.44}));
        }
      }
      if(head==='d'){
        /* 라이드 벨 — 다이아몬드(마름모). 속을 안 채우는 게 표준이다:
           채우면 멀리서 보통 머리와 구별이 안 간다 */
        const rx = 4.6, ry = 3.6;
        SVGT.appendChild(el('polygon',{
          points:`${n.x},${y-ry} ${n.x+rx},${y} ${n.x},${y+ry} ${n.x-rx},${y}`,
          fill:'none', stroke:INK, 'stroke-width':1.5}));
      } else if(head==='x'){
        /* 크래쉬는 원래 덧줄 위치에 작은 원형 머리를 둔다.
           덧줄은 원 밖에서만 그려 내부 X와 겹치지 않게 한다. */
        const ring = CRASH_RING && id === 'crash';
        const ringR = ring ? (ghost ? 4.2 : 5.6) : 0;
        const r = ring ? (ringR - 1.25)/Math.SQRT2 : (ghost ? 3.3 : 4.4);
        const w = ring ? 1.25 : (ghost ? ST.xwg : ST.xw);
        if(ring){
          for(const side of [-1,1]) SVGT.appendChild(el('line',{
            x1:n.x+side*(ringR+0.6),y1:y,x2:n.x+side*9,y2:y,
            stroke:INK,'stroke-width':1.2}));
        }
        SVGT.appendChild(el('line',{x1:n.x-r,y1:y-r,x2:n.x+r,y2:y+r,stroke:INK,'stroke-width':w,'stroke-linecap':'round'}));
        SVGT.appendChild(el('line',{x1:n.x-r,y1:y+r,x2:n.x+r,y2:y-r,stroke:INK,'stroke-width':w,'stroke-linecap':'round'}));
        if(ring) SVGT.appendChild(el('circle',{cx:n.x, cy:y, r:ringR, fill:'none', stroke:INK,
          'stroke-width':1.2, class:'cring'}));
      } else if(n.half && !ghost){
        // 2분음표 — 빈 머리. 묶은 박(2박 3연음 자리)에서만 나온다
        SVGT.appendChild(el('ellipse',{cx:n.x,cy:y,rx:ST.headRx,ry:ST.headRy,fill:'none',stroke:INK,
          'stroke-width':ST.hollow,transform:`rotate(${ST.tilt} ${n.x} ${y})`}));
      } else {
        /* 손사보는 머리를 조금씩 어긋나게 놓는다 — 흔들림이 없으면 그냥 굵은 클래식이다.
           `jit`은 좌표에서 값을 뽑으므로 같은 자리는 늘 같게 흔들린다(인쇄=화면). */
        const jx = n.x + jit(n.x, y, ST.jitter), jy = y + jit(y, n.x, ST.jitter);
        SVGT.appendChild(el('ellipse',{cx:jx,cy:jy,rx:ghost?ST.ghostRx:ST.headRx,
          ry:ghost?ST.ghostRy:ST.headRy,
          fill:INK,transform:`rotate(${ST.tilt + jit(y, y, ST.jitter*4)} ${jx} ${jy})`}));
      }
      // 고스트 노트: 머리를 괄호로 감싼다.
      // 괄호 폭은 슬롯 폭을 따라간다 — 출력용 좁은 슬롯에서 옆 음과 물리지 않게
      /* 괄호 폭은 옆 음과 안 물리게 슬롯을 따라간다. `GEO.SLOT_W`는 **div 4일 때의
         칸 폭**이라 32분 박에서는 실제 칸(12.6px)보다 넓어져 옆 머리를 덮는다.
         그래서 32분에서만 진짜 칸 폭을 쓴다.
         6연음도 같은 문제가 있지만(칸이 SLOT_W의 0.67배) 여기서 같이 바꾸면
         **기존 악보의 고스트가 움직인다.** 따로 결정할 일이라 손대지 않았다. */
      /* 5·7연음·섞은 박(1.8)도 칸이 16분보다 좁다 — 32분처럼 실제 칸 폭을 따른다 (옛 분할은 그대로) */
      const narrowK = (div >= 8 || div === 7 || div === 5 || !!DIV_MIX[div]) ? beatPxAt(m, b)/nCells : 0;
      const px = Math.min(7.4, (narrowK || GEO.SLOT_W) * 0.45);
      /* 림샷: 머리를 원으로 감싼다. 반지름은 **칸 폭의 절반**을 넘지 않는다 —
         16분이 연달아 오면 원끼리 맞물리기 때문이다(출력 슬롯 14px에서 실제로 닿았다).
         아래로는 6.0에서 멈춘다. 머리 반폭이 5.4라 그보다 작으면 감싼 것으로 안 보인다.
         (고스트 괄호와 같은 이유로 같은 잣대를 쓰지만, 원은 양옆으로 다 나가서 더 빠듯하다) */
      const rimStep = (narrowK || GEO.SLOT_W);
      const rimR = Math.max(6.0, Math.min(7.6, rimStep*0.5 - 0.5));
      if(rim){
        SVGT.appendChild(el('circle',{cx:n.x, cy:y, r:rimR,
          fill:'none', stroke:INK, 'stroke-width':1.2}));
      }
      // 앞꾸밈음(플램·드래그) — 표기 값과 별개라 액센트 음표에도 붙는다
      const orn = ornOf(m, id, sOf(id, n));
      if(orn){
        const step = beatPxAt(m, b)/nCells;
        const room = isFinite(leftX) ? (n.x - leftX - 5.4)      // 앞 음표 머리까지
                                     : (GEO.M_PAD + 4) * ROW_MUL;  // 마디 첫 음 — 마디선까지
        // 크로스 스틱의 꾸밈음도 x 머리다 (2026-09-12 드러머 제보) — 본음과 같은 주법이다
        /* 꾸밈 악기가 다르면 **그 악기 줄**에 그린다 — 머리 모양도 그 악기, 이음줄은 본음 머리까지 (2026-10-02) */
        const gId = ornInsOf(m, id, sOf(id, n));
        const gIns = (gId !== id) ? byId[gId] : (xStick ? Object.assign({}, ins, {head:'x'}) : ins);
        const gy = (gId !== id) ? yOf(gIns.pos, top) : y;
        drawOrn(n.x, gy, up, orn, gIns, step, room, y);
      }
      if(ghost){
        SVGT.appendChild(el('path',{d:`M ${n.x-px} ${y-5.6} q -2.6 5.6 0 11.2`,
          stroke:INK,'stroke-width':1.2,fill:'none','stroke-linecap':'round'}));
        SVGT.appendChild(el('path',{d:`M ${n.x+px} ${y-5.6} q 2.6 5.6 0 11.2`,
          stroke:INK,'stroke-width':1.2,fill:'none','stroke-linecap':'round'}));
      }
      // 오픈 하이햇 ○는 여기서 안 그린다 — 스템 바깥으로 나갔다. 아래 참고
      if(n.dot){
        // 점은 감싼 원 **바깥**에 찍는다 — 안에 찍으면 원과 붙어 하나로 보인다
        const dx = ghost ? px + 4.5 : rim ? rimR + 4.2 : (CRASH_RING && id === 'crash') ? rimR + 4.2 : 10;
        SVGT.appendChild(el('circle',{cx:n.x+dx,cy:y - (y%LG===0? LG/2 : 0),r:1.9,fill:INK}));
      }
    });
    const yEnd = up ? Math.max(...n.ys) : Math.min(...n.ys);
    const sx = n.x + stemDx + jit(n.x + stemDx, beamY, ST.jitter);
    SVGT.appendChild(el('line',{x1:sx,y1:yEnd + (up?-1:1),x2:n.x+stemDx,y2:beamY,stroke:INK,'stroke-width':ST.stem}));
  });
  // 액센트는 스템 하나에 하나. 같은 x에 하이햇+스네어가 겹쳐 있어도 한 번만 그린다
  notes.forEach(n=>{
    if(!n.ids.some(id => (m[id][sOf(id,n)]|0) === ART.ACCENT)) return;
    // 스템이 아니라 **음표 머리 중심**에 맞춘다(기보 표준).
    // 빔 위에 놓이므로 아래 머리들과 세로로 줄이 맞아 읽기 좋다
    accentGlyph(n.x, up ? beamY - 10 : beamY + 10, up);
  });
  /* 오픈 하이햇 ○ — **스템·빔 바깥쪽**에 놓는다 (2026-08-13, 드러머 제보).
     예전에는 머리 바로 위(y-10.5)에 찍었는데, 그건 **머리와 빔 사이**라
     스템 옆에 끼인 것처럼 보였고 관례와도 달랐다.
     드럼 표기 관례(Drum Key)에서 ○와 +는 **스템 꼭대기 위**에 붙는 주법 기호다.
     액센트와 같은 자리 규칙을 쓰되, 액센트보다 한 칸 더 바깥으로 —
     아티큘레이션(액센트)이 음표에 가깝고 주법 기호(○)가 그 바깥이라는 순서를 지킨다. */
  notes.forEach(n=>{
    if(!n.ids.some(id => (m[id][sOf(id,n)]|0) === ART.OPEN && OPEN_OK[id])) return;
    const acc = n.ids.some(id => (m[id][sOf(id,n)]|0) === ART.ACCENT);
    /* r 5.5 = brassMuteOpen 1.22sp(표준). 예전 r 3.1(0.69sp)은 절반 크기라 잘 안 보였다.
       커진 만큼 자리도 바깥으로 — 액센트(beamY±10, 글리프 8.8)와 안 닿는 값이다.
       markLevels의 층 예약(14/25 + 5.5)과 한 쌍이다 — 한쪽을 고치면 같이 고칠 것. */
    const off = acc ? 25 : 14;
    SVGT.appendChild(el('circle',{cx:n.x, cy: up ? beamY - off : beamY + off,
      r:5.5, fill:'none', stroke:INK, 'stroke-width':1.1}));
  });
  /* 닫음 ＋ — ○의 짝이므로 **같은 자리·같은 크기**다. 하이햇이면 클로즈,
     크래쉬·라이드면 초크(뮤트). 한 악기가 두 뜻을 같이 가질 일이 없다 */
  notes.forEach(n=>{
    if(!n.ids.some(id => (m[id][sOf(id,n)]|0) === ART.CLOSED && CLOSED_OK[id])) return;
    const acc = n.ids.some(id => (m[id][sOf(id,n)]|0) === ART.ACCENT);
    const off = acc ? 25 : 14;                       // ○와 같은 자리 규칙
    const cy = up ? beamY - off : beamY + off, r = 4.9;   // brassMuteClosed 1.09sp
    SVGT.appendChild(el('line',{x1:n.x-r, y1:cy, x2:n.x+r, y2:cy,
      stroke:INK, 'stroke-width':1.5, 'stroke-linecap':'round'}));
    SVGT.appendChild(el('line',{x1:n.x, y1:cy-r, x2:n.x, y2:cy+r,
      stroke:INK, 'stroke-width':1.5, 'stroke-linecap':'round'}));
  });
  /* 롤 — 스템을 가로지르는 사선(트레몰로 표기)과 버즈롤의 z. 머리와 빔 사이에 놓는다.
     빔이 있는 음에서도 빔과 안 겹치게 머리 쪽으로 붙인다.
     사선이 셋보다 적으면 **가운데로 모은다** — 셋일 때 off0가 0이라
     예전 좌표가 한 픽셀도 안 움직인다(옛 악보 불변). */
  notes.forEach(n=>{
    let cnt = 0, buzz = false;
    n.ids.forEach(id => {
      const v = rollPart(m[id][sOf(id,n)]|0);       // 고스트 롤(13~16)도 같은 사선·z
      if(v === ART.BUZZ) buzz = true;
      else if(ROLL_SLASH[v]) cnt = Math.max(cnt, ROLL_SLASH[v]);
    });
    if(!cnt && !buzz) return;
    /* 스템의 **빈 구간**(빔에 가장 가까운 머리 → 빔)에 놓는다. 예전엔 스템 아래 끝
       (가장 먼 머리)에서 쟀는데, 하이햇+스네어 화음이면 그 중간이 곧 하이햇 머리라
       사선이 ✗ 머리를 덮었다 (2026-09-12 드러머 제보 STY 12·16마디). 홑음은 값이 같다. */
    const yEnd = up ? Math.min(...n.ys) : Math.max(...n.ys);
    const sx = n.x + stemDx;
    const mid = yEnd + (beamY - yEnd) * 0.55;          // 머리와 빔 사이
    if(buzz){
      /* z — 위 가로줄, 사선, 아래 가로줄. 사선 셋이 차지하던 세로 폭에 맞춘다.
         **획을 채우지 않는다**(fill:none) — 글꼴 없이 그려도 어느 기기에서나 같다 */
      const w = 4.2, h = 3.7;              // 사선(폭 8)과 비슷한 무게로 보이게
      SVGT.appendChild(el('polyline',{
        points:`${sx-w},${mid-h} ${sx+w},${mid-h} ${sx-w},${mid+h} ${sx+w},${mid+h}`,
        fill:'none', stroke:INK, 'stroke-width':1.6,
        'stroke-linecap':'round', 'stroke-linejoin':'round'}));
      return;
    }
    const off0 = (3 - cnt) * 2;
    for(let k=0; k<cnt; k++){
      const yy = mid + (up ? (off0 + k*4) : -(off0 + k*4));
      SVGT.appendChild(el('line',{x1:sx-4, y1:yy+2.2, x2:sx+4, y2:yy-2.2,
        stroke:INK, 'stroke-width':1.6, 'stroke-linecap':'round'}));
    }
  });
  /* 빔 / 플래그
     **꼬리가 없는 음(4분음표)은 빔을 못 받는다.** 셔플이 정확히 이 경우다 —
     셋잇단 1·3번째 칸을 치면 앞 음이 2칸을 차지해 4분음표가 되고, 뒤 음만 8분이다.
     그래서 빔은 "꼬리 있는 음이 연달아 있는 구간"마다 따로 긋는다.
     (div=4에서는 4분음표가 그 박의 유일한 음일 때만 나오므로 예전 결과와 같다) */
  const bw = ST.beam;
  const groups = [];
  let run = [];
  notes.forEach(n=>{
    if(n.flags > 0) run.push(n);
    else { if(run.length) groups.push(run); run = []; }
  });
  if(run.length) groups.push(run);
  const beamed = (groups.length===1 && groups[0].length===notes.length && notes.length>1);

  groups.forEach(gr=>{
    if(gr.length === 1){ drawFlags(gr[0].x+stemDx, beamY, up, gr[0].flags); return; }
    const x1 = gr[0].x+stemDx, x2 = gr[gr.length-1].x+stemDx;
    SVGT.appendChild(el('rect',{x:Math.min(x1,x2),y:up?beamY:beamY-bw,width:Math.abs(x2-x1),height:bw,fill:INK}));
    /* 2·3차 빔
       규칙은 하나다 — **두 음 사이의 빔 개수 = min(왼쪽 꼬리 수, 오른쪽 꼬리 수).**
       어느 쪽과도 못 이은 것만 분수빔(스텁)으로 처리한다.

       과거 버그 둘, 둘 다 이 한 줄에서 났다.
       1. 처음엔 `nxt.s-n.s===1`(칸이 붙어 있는가)만 봤다. 그래서 16분 다음에 오는
          8분에까지 2차 빔이 붙어 **8분이 16분처럼 보였다** — 싱커페이션이 전부 틀렸다
       2. 그걸 고치면서 `nxt.k-n.k===1`을 **꼬리 수 조건과 같이** 걸었는데, 그게
          32분 박을 깨뜨렸다 (2026-08-17 드러머 제보). 32분 격자에서 16분(2칸)+32분(1칸)이
          이어지면 `k` 차이가 2라 2차 빔이 안 그어지고, 첫 음에 **뜬금없는 스텁**이 붙는다.
          실측: 2차 빔이 [91→100] [117→130]…으로 끊기고 100~117이 비었다.

       **칸 간격은 볼 필요가 없다.** 한 빔 그룹 안에서 이웃한 두 음은 시간상 이미
       맞붙어 있다(앞 음의 길이가 다음 온셋까지다). 꼬리 수만 보면 규칙이 완결된다 —
       위 1번 버그도 `nxt.flags >= lvl` 하나로 막힌다. */
    const maxF = Math.max(...gr.map(n=>n.flags));
    for(let lvl=2; lvl<=maxF; lvl++){
      const off = (bw+2.25)*(lvl-1);   // 겹빔 틈 0.25sp(2.25px) = 빔 두께의 절반 (SMuFL beamSpacing)
      const y2 = up ? beamY + off : beamY - off;
      for(let i=0;i<gr.length;i++){
        const n = gr[i];
        if(n.flags < lvl) continue;
        const nx = n.x+stemDx;
        const prev = i>0 ? gr[i-1] : null;
        const nxt  = i<gr.length-1 ? gr[i+1] : null;
        /* 6연음은 2차 빔을 **3+3으로 끊는다** — 기보 표준 (2026-10-02, 드러머 제보).
           1차 빔은 그대로 한 덩어리, 숫자도 6 그대로. 칸 2→3 사이만 안 잇는다 */
        /* 섞은 박은 반박 경계에서 2차 빔을 끊는다 — 셋잇단 조각이 어디서 시작하는지 보이게 (1.8) */
        const brk = (a, b) => (SEXT_SPLIT && div === 6 && a.k < 3 && b.k >= 3)
          || (SEXT_SPLIT && div === 12 && a.k < 6 && b.k >= 6) || (a.seg !== b.seg);
        const linkNext = !!(nxt && nxt.flags >= lvl && !brk(n, nxt));
        const linkPrev = !!(prev && prev.flags >= lvl && !brk(prev, n));
        if(linkNext){
          const nnx = nxt.x+stemDx;
          SVGT.appendChild(el('rect',{x:Math.min(nx,nnx),y:up?y2:y2-bw,width:Math.abs(nnx-nx),height:bw,fill:INK}));
        } else if(!linkPrev){
          const dir = prev ? -1 : 1;
          SVGT.appendChild(el('rect',{x:dir>0?nx:nx-9,y:up?y2:y2-bw,width:9,height:bw,fill:INK}));
        }
      }
    }
  });
  /* 셋잇단 표시. 한 음이 박을 통째로 채운 경우는 그냥 4분음표라 안 그린다.
     빔으로 한 덩어리가 됐고 앞에 쉼표도 없으면 괄호 없이 숫자만 (기보 표준). */
  if(isTuplet(tupletDiv, m, b) && !wholeBeatOne){
    /* ○가 액센트 때문에 바깥으로 나간 스템이 있으면 숫자가 그 ○ 위에 얹힌다 —
       실제로 겹쳤다(숫자 −62~−51, ○ −57~−51). 그럴 때만 한 칸 더 밀어낸다 */
    const bigRing = notes.some(n =>
      n.ids.some(id => (m[id][sOf(id,n)]|0) === ART.OPEN && OPEN_OK[id]) &&
      n.ids.some(id => (m[id][sOf(id,n)]|0) === ART.ACCENT));
    /* ○·＋가 r 5.5로 커지면서(2026-09-10) 보통 ○ 위에서도 숫자가 물린다 —
       링이 있으면 한 층(27), 액센트 링이면 두 층(37) 바깥으로. markLevels와 한 쌍. */
    const anyRing = notes.some(n =>
      n.ids.some(id => ((m[id][sOf(id,n)]|0) === ART.OPEN && OPEN_OK[id]) ||
                       ((m[id][sOf(id,n)]|0) === ART.CLOSED && CLOSED_OK[id])));
    const off = bigRing ? 37 : anyRing ? 27 : 22;
    const y = up ? beamY - off : beamY + off;
    const onlyNum = beamed && lead === 0;
    /* ★ 괄호 오른쪽 끝은 **마지막 칸**을 기준으로 잡는다 (2026-08-28, 실기기 제보).
       예전엔 `xAtPos(b+1)`, 즉 **박의 끝**에서 조금 뺐다. 1박 셋잇단은 세 음이 박을
       꽉 채우니 그게 맞았는데, **2박 3연음은 세 음이 2/3 자리에서 끝난다** —
       괄호가 마지막 음을 한참 지나쳐 다음 박까지 뻗었다(실측 22.7px, 음 간격의 79%).
       가운데 숫자도 같이 오른쪽으로 밀려 있었다.
       기보 표준도 "첫 음에서 끝 음까지"다. **칸**을 기준으로 잡으므로 마지막 칸이
       쉼표여도 괄호는 그 자리까지 그대로 덮는다.
       여유 9 = 머리 반폭 5.4 + 3.6. 머리 크기는 화면·인쇄가 같으므로 고정값이 맞다
       (박 폭에 비례시키면 인쇄에서 다시 어긋난다). 1박 셋잇단은 예전 값과 0.7px
       차이라 눈에 안 보인다. */
    /* ★ 숫자는 **빔의 가운데**(첫 스템 ~ 끝 스템)에 놓는다 (2026-10-07 사용자 지적 "삐뚤삐뚤").
       예전엔 숫자만 있을 때는 머리 가운데, 괄호가 있을 때는 (첫 칸 −3 ~ 끝 칸 +9) 가운데라
       기준이 둘이었고, 둘 다 빔 가운데에서 스템 거리(5.2)만큼 비켜 있었다 — 숫자가 박마다
       조금씩 왼쪽·오른쪽으로 흔들려 보였다. 숫자는 빔 위에 앉으므로 빔에 맞추는 게 표준이다.
       괄호도 스템 축에 맞춰 양끝을 같은 만큼(TUP_EXT) 내민다 — 그래야 숫자가 괄호 정가운데다.
       끝은 여전히 **마지막 칸** 기준이다(2박 3연음에서 괄호가 다음 박까지 뻗던 2026-08-28 사고) */
    const TUP_EXT = 3;
    const sx = x => x + stemDx;
    if(segs.length === 1){
      const x1 = onlyNum ? sx(notes[0].x) : sx(xOfK(0)) - TUP_EXT;
      const x2 = onlyNum ? sx(notes[notes.length-1].x) : sx(xOfK(div - 1)) + TUP_EXT;
      if(div === 12) tupletMark(x1, x2, y, up, tupletDiv, !onlyNum);
      else tupletMark(x1, x2, y, up, div, !onlyNum);
    } else {
      /* 섞은 박 — 셋 조각에만 3을 단다(2·1 조각은 그냥 16분·8분이다).
         조각이 비어 있으면 쉼표뿐이라 괄호를 안 씌운다. 조각 안 음이 전부 한 빔에 들고
         앞에 쉼표가 없을 때만 괄호 없이 숫자 (보통 박과 같은 규칙) */
      segs.forEach((sg, si)=>{
        if(sg.n !== 3) return;
        const sn = notes.filter(n => n.seg === si);
        if(!sn.length) return;
        const inBeam = sn.every(n => n.flags > 0) && groups.some(gr => sn.every(n => gr.includes(n)));
        const solo = sn[0].k === sg.k0 && inBeam && sn.length > 1;
        const x1 = solo ? sx(sn[0].x) : sx(xOfK(sg.k0)) - TUP_EXT;
        const x2 = solo ? sx(sn[sn.length-1].x) : sx(xOfK(sg.k0 + sg.n - 1)) + TUP_EXT;
        tupletMark(x1, x2, y, up, 3, !solo);
      });
    }
  }
}

/* 깃발 — Bravura flag8th/16th/32nd 글리프(FLAG_GLYPH). 예전엔 같은 꼬리를 쌓아
   16분·32분을 만들었는데, 표준 폰트의 겹깃발은 **한 글리프**다(모양이 다르다).
   원점 = 스템 끝(x는 스템 중심, y는 beamY). 위 깃발은 원점에서 아래(+y)로 뻗는다. */
function drawFlags(x, y, up, count){
  const g = FLAG_GLYPH[(up ? 'u' : 'd') + Math.min(count, 3)];
  if(!g) return;
  const s = LG/9;
  SVGT.appendChild(el('path',{d:g.d, fill:INK,
    transform:`translate(${x - ST.stem/2} ${y})` + (s!==1 ? ` scale(${s})` : '')}));
}
/* ── 쉼표 ───────────────────────────────
   1. 음표와 **같은 잉크색**으로 그린다. 회색으로 그리면 안 그린 것처럼 보인다
      (예전 값 #6C6880. 드러머가 "쉼표가 들어가야 한다"고 한 원인 중 하나)
   2. 성부별로 세로 위치를 나눈다 — 손은 오선 위쪽, 발은 오선 아래.
      Weinberg 가이드: 쉼표가 어느 성부인지 보이게 위치를 옮겨도 된다 */
/* flags = 꼬리 개수(0=4분, 1=8분, 2=16분, 3=32분). 음표와 같은 잣대를 쓴다.

   **클램프를 배열 길이로 잡는다.** 예전엔 `Math.min(flags, 2)`로 박아 놔서
   32분쉼표를 그리라고 하면 **말없이 16분쉼표가 나왔다** (2026-08-14에 고쳤다).
   틀린 기보가 조용히 나가는 게 제일 나쁘다 — 글리프를 더 뽑으면 배열만 늘리면 된다. */
const REST_BY_FLAGS = ['q', 'e8', 'e16', 'e32'];
/* `rv`는 쉼표를 어느 높이에 놓을지 — 성부를 합쳐 그릴 때는 `'both'`(가운데 줄)다.
   성부가 하나뿐이라 손·발을 갈라 놓을 이유가 없다. 안 넘기면 예전과 같다. */
function drawRest(x, top, up, flags, dot, rv){
  const voice = rv || (up ? 'hand' : 'foot');
  // flags -1 = 반쉼표 — 묶은 박(2박 3연음)의 4분보다 긴 빈 구간
  const kind = (flags|0) < 0 ? 'h' : REST_BY_FLAGS[Math.min(flags|0, REST_BY_FLAGS.length - 1)];
  drawRestAt(x, top, voice, kind);
  if(dot){                                 // 점쉼표의 점
    const g = REST_GLYPH[kind], sc = LG/9;
    SVGT.appendChild(el('circle',{
      cx: x + (g.w/2 + 2.8)*sc,
      cy: top + REST_ORIGIN[voice]*LG - LG*0.42,
      r: LG*0.21, fill:INK}));
  }
}
/* 박자표 숫자 — Bravura(Steinberg, SIL OFL 1.1) timeSig0~9 (U+E080~E089) 아웃라인.
   REST_GLYPH와 같은 방법·같은 배율(0.036, LG=9 기준)로 뽑았다 — 뽑는 법은 REST_GLYPH 주석.
   원점은 글리프 세로 중앙(bBox -1sp~+1sp, 높이 2sp). 분자는 topY+LG, 분모는 topY+3LG에
   놓으면 오선 3~5선 / 1~3선 사이를 정확히 채운다(SMuFL 표준). adv = 다음 숫자까지의 전진폭. */
const TS_GLYPH = {
  '0': {adv:16.92, d:'M16.2 0C16.2 -5 12.74 -9.04 8.46 -9.04C4.18 -9.04 0.72 -5 0.72 0C0.72 4.97 4.18 9 8.46 9C12.74 9 16.2 4.97 16.2 0ZM8.46 -7.92C9.94 -7.92 11.16 -4.5 11.16 -0.25C11.16 3.96 9.94 7.38 8.46 7.38C6.95 7.38 5.76 3.96 5.76 -0.25C5.76 -4.5 6.95 -7.92 8.46 -7.92Z'},
  '1': {adv:12.02, d:'M0.86 -0.47C0.86 -0.47 0.72 -0.25 0.72 0C0.72 0.18 0.83 0.4 1.12 0.5C1.26 0.54 1.4 0.58 1.44 0.58C1.8 0.58 1.94 0.25 1.94 0.25C1.94 0.25 3.49 -2.23 3.89 -2.92C4.03 -3.17 4.18 -3.28 4.25 -3.28C4.39 -3.28 4.46 -2.99 4.46 -2.77L4.46 6.52C4.46 7.34 3.64 7.88 2.88 7.88C2.63 7.88 2.27 7.99 2.27 8.42C2.27 8.82 2.59 9 3.06 9L10.73 9C11.3 9 11.3 8.42 11.3 8.42C11.3 8.42 11.3 7.88 10.76 7.88C10.26 7.88 9.61 7.24 9.61 6.62L9.61 -8.21C9.61 -8.78 9.4 -9 8.89 -9.04C8.39 -9.04 7.49 -8.89 7.02 -8.89C6.34 -8.89 5.69 -8.93 5.15 -9C5.08 -9 5 -9.04 4.97 -9.04C4.61 -9.04 4.46 -8.68 4.32 -8.35Z'},
  '2': {adv:16.06, d:'M15.16 3.28C15.16 2.84 14.98 2.77 14.72 2.77C14.44 2.77 14.33 2.92 14.26 3.17L14.22 3.2C13.86 4.1 13.57 4.79 12.82 4.79C12.64 4.79 12.46 4.75 12.2 4.68C11.74 4.5 11.48 4.46 11.12 4.28C10.4 4 8.71 3.42 7.24 3.42C6.77 3.42 6.3 3.49 5.9 3.64C6.7 2.34 9.76 1.26 10.55 1.04C13.07 0.36 15.34 -0.68 15.34 -3.67C15.34 -7.49 11.59 -9.14 8.24 -9.14C5.72 -9.14 3.49 -8.93 1.73 -6.88C1.12 -6.12 0.72 -5.22 0.72 -4.25C0.72 -3.74 0.83 -3.24 1.04 -2.7C1.58 -1.58 2.7 -0.72 4 -0.72C6.19 -0.72 6.52 -2.99 6.52 -3.89C6.52 -6.05 4.03 -6.16 4.03 -6.88C4.1 -7.38 4.75 -8.24 6.88 -8.24C10.08 -8.24 10.12 -5.83 10.12 -4.79C10.12 -1.51 7.42 0.97 4.82 2.56C2.84 3.82 1.44 5.58 0.83 7.92L0.79 8.03C0.79 8.5 1.19 9.25 1.73 9.25C2.52 9.25 2.95 7.06 5.08 7.06C6.52 7.06 7.06 9 10.26 9C11.81 9 14.58 8.86 15.16 3.28Z'},
  '3': {adv:15.16, d:'M7.67 -8.93C7.63 -8.93 7.6 -8.93 7.52 -8.93L7.27 -8.96C7.24 -8.96 7.16 -8.96 7.13 -8.96C4.03 -8.96 0.94 -6.91 0.94 -5C0.94 -3.82 1.62 -2.23 3.85 -2.09L4.03 -2.09C5.62 -2.09 6.41 -3.24 6.41 -4.43L6.41 -4.72C6.3 -6.05 5.4 -6.12 5.22 -6.19C5.04 -6.26 4.5 -6.19 4.5 -6.7L4.5 -6.84C4.57 -7.45 5.69 -7.74 6.01 -7.74C9.07 -7.74 9.36 -5.83 9.36 -4.97L9.36 -4.72C9.36 -2.05 7.24 -1.01 4.97 -0.9C4.61 -0.86 4.1 -0.68 4.1 -0.29C4.1 0.14 4.72 0.14 5 0.14C9.14 0.14 9.47 2.95 9.47 3.42C9.47 7.24 7.52 7.67 6.73 7.67C6.59 7.67 6.44 7.63 6.41 7.63C6.12 7.6 5.44 7.6 5.4 7.06L5.4 6.88C5.4 6.08 6.19 5.54 6.23 4.5C6.23 2.99 5.18 1.91 3.64 1.91C3.49 1.91 3.38 1.91 3.24 1.94C2.63 2.05 1.94 2.41 1.51 2.88C0.9 3.42 0.72 4.28 0.72 5.08C0.79 7.88 3.35 8.96 6.88 9.04L7.2 9.04C10.76 9.04 14.44 7.2 14.44 4.03L14.44 3.78C14.36 2.74 14.11 2.05 13.43 1.26C13.21 0.97 12.92 0.72 12.56 0.5L11.81 0.07L10.62 -0.25C10.44 -0.29 10.33 -0.29 10.26 -0.43C10.22 -0.5 10.22 -0.54 10.22 -0.61C10.22 -0.76 10.26 -0.9 10.37 -0.94C10.76 -1.04 11.16 -1.08 11.48 -1.26C12.92 -1.94 13.68 -2.88 13.68 -4.54C13.68 -7.85 9.18 -8.82 7.67 -8.93Z'},
  '4': {adv:16.92, d:'M13.03 2.66L13.03 -5.04C13.03 -5.33 13 -5.65 12.6 -5.65C12.28 -5.65 12.1 -5.58 11.88 -5.33L8.46 -1.19C8.32 -1.01 8.14 -0.79 8.14 -0.36L8.14 2.66L3.28 2.66C6.16 0.22 11.92 -7.96 12.02 -8.39L12.06 -8.5C12.06 -8.82 11.81 -9.04 11.52 -9.04C11.2 -9.04 9.72 -8.96 9.07 -8.96C8.42 -8.96 6.8 -9.04 6.52 -9.04C6.19 -9.04 5.69 -8.93 5.69 -8.35C5.69 -3.89 2.16 1.12 1.08 2.63L0.86 2.92C0.86 2.92 0.86 2.95 0.86 2.95L0.83 2.99C0.76 3.17 0.72 3.31 0.72 3.42C0.72 3.78 1.01 4.03 1.44 4.03L8.14 4.03L8.14 6.3C8.14 7.27 7.34 7.56 6.7 7.56C6.12 7.56 5.87 7.88 5.87 8.24C5.87 8.6 6.01 9 6.55 9L14.22 9C14.58 9 14.94 8.75 14.94 8.24C14.94 7.74 14.51 7.52 14.15 7.52C13.79 7.52 13.03 7.31 13.03 6.16L13.03 4.03L15.66 4.03C16.02 4.03 16.2 3.78 16.2 3.35C16.2 2.92 16.06 2.66 15.66 2.66Z'},
  '5': {adv:14.51, d:'M2.74 -2.12C2.74 -2.12 2.88 -4.14 2.92 -4.46C2.95 -4.75 3.13 -4.93 3.46 -4.93L3.6 -4.93C3.96 -4.86 5.65 -4.61 7.13 -4.61C12.13 -4.61 12.31 -7.49 12.31 -8.06C12.31 -8.53 12.2 -8.82 11.81 -8.82C11.34 -8.82 8.53 -8.5 7.38 -8.5C6.23 -8.5 3.13 -8.78 2.52 -8.86C1.87 -8.86 1.69 -8.53 1.66 -8.24L1.26 -0.25L1.26 -0.18C1.26 0.29 1.62 0.36 1.98 0.36C2.34 0.36 2.38 0.04 2.77 -0.36C3.13 -0.72 4 -1.55 5.22 -1.55C6.44 -1.55 8.93 -0.86 8.93 3.13C8.93 7.09 6.8 7.6 5.87 7.6C5.58 7.6 5.29 7.6 5.04 7.49C4.86 7.38 4.64 7.24 4.61 6.98C4.61 6.73 4.86 6.59 5.04 6.48C5.87 5.98 6.41 5.08 6.41 4.07C6.41 2.48 5.15 1.26 3.6 1.26C1.66 1.26 0.86 2.66 0.76 3.92C0.72 4.14 0.72 4.36 0.72 4.57C0.72 7.56 2.66 9.04 7.09 9.04C11.41 9.04 13.79 6.37 13.79 3.13C13.79 -0.14 11.12 -2.81 7.85 -2.81C5.76 -2.81 4.21 -2.45 3.06 -1.76C2.99 -1.73 2.92 -1.73 2.88 -1.73C2.74 -1.73 2.74 -1.87 2.74 -1.98Z'},
  '6': {adv:15.62, d:'M10.98 -2.99C12.49 -2.99 13.86 -4.18 13.86 -5.72C13.86 -5.87 13.86 -5.98 13.82 -6.12C13.46 -8.42 10.66 -9.04 8.71 -9.04C5.98 -9 3.42 -7.67 2.12 -5.22C1.33 -3.71 0.72 -1.8 0.72 -0.11L0.72 0.04C0.76 1.69 1.04 3.56 1.84 5C3.31 7.67 5.08 8.96 8.1 8.96C9.72 8.96 11.52 8.71 12.82 7.67C14.08 6.66 14.9 5.04 14.9 3.42C14.9 0.61 12.24 -1.8 9.47 -1.8C8.32 -1.8 7.13 -1.37 6.19 -0.54C6.12 -0.47 6.05 -0.47 5.98 -0.47C5.76 -0.47 5.65 -0.76 5.65 -1.33C5.76 -7.99 7.88 -8.17 8.64 -8.17C9.36 -8.17 9.83 -7.99 9.83 -7.63C9.83 -7.13 9.14 -6.7 8.93 -6.26C8.75 -5.94 8.68 -5.58 8.68 -5.22C8.68 -4.68 8.86 -4.14 9.22 -3.74C9.47 -3.28 10.51 -2.99 10.98 -2.99ZM7.99 -0.07C9.14 -0.07 10.12 1.73 10.12 3.96C10.12 6.19 9.14 7.99 7.99 7.99C6.84 7.99 5.9 6.19 5.9 3.96C5.9 1.73 6.84 -0.07 7.99 -0.07Z'},
  '7': {adv:15.88, d:'M15.16 -7.34C15.16 -8.32 15.16 -8.78 14.54 -8.78C14.51 -8.78 13.93 -8.64 13.79 -8.39C13.54 -7.96 13.03 -5.9 12.13 -5.9C11.23 -5.9 9.54 -8.96 6.55 -8.96C4.46 -8.96 3.92 -8.14 3.42 -7.67C2.92 -7.2 2.7 -7.06 2.45 -7.02C2.16 -7.02 1.69 -7.52 1.51 -7.88C1.44 -8.03 1.26 -8.14 1.08 -8.14C0.9 -8.14 0.72 -8.03 0.72 -7.7L0.72 -1.76C0.72 -1.76 0.76 -1.19 1.12 -1.19C1.4 -1.19 1.51 -1.51 1.66 -1.91C2.02 -2.81 2.48 -4.9 4.1 -4.9C5.54 -4.9 7.27 -2.2 9.36 -2.2C10.37 -2.2 10.87 -2.74 11.16 -2.95C11.27 -3.02 11.41 -3.1 11.48 -3.1C11.63 -3.1 11.7 -2.99 11.74 -2.77C11.74 -1.76 8.96 0.25 6.8 2.81C5.44 4.39 4.32 6.48 4.32 7.88C4.32 8.64 4.32 9 5 9C5.65 9 6.44 8.68 7.34 8.68C8.24 8.68 9.94 9 10.3 9C10.66 9 10.87 8.71 10.87 7.67C10.87 1.66 15.16 -3.49 15.16 -7.2Z'},
  '8': {adv:15.7, d:'M12.02 -1.3C13.32 -2.12 14.18 -3.31 14.18 -5.11C14.18 -8.78 8.89 -9.32 7.92 -9.32C3.74 -9.32 0.9 -7.42 0.9 -4.39C0.9 -1.91 2.3 -0.58 4.03 0.4C2.16 1.3 0.72 2.48 0.72 4.75C0.72 7.88 3.96 9.32 7.52 9.32C11.12 9.32 14.98 7.78 14.98 2.92C14.98 0.76 13.72 -0.43 12.02 -1.3ZM10.15 -2.12C7.27 -3.13 4.21 -3.74 4.21 -6.01C4.21 -7.52 6.26 -8.28 7.85 -8.28C9 -8.28 12.06 -7.7 12.06 -5.18C12.06 -3.74 11.34 -2.81 10.15 -2.12ZM7.38 8.14C4.97 8.14 2.77 6.91 2.77 4.57C2.77 3.13 4.03 1.8 5.62 1.19C8.24 2.34 10.91 3.1 10.91 5.47C10.91 6.91 9.79 8.14 7.38 8.14Z'},
  '9': {adv:15.62, d:'M4.64 2.92C3.13 2.92 1.76 4.1 1.76 5.65C1.76 5.8 1.76 5.9 1.8 6.05C2.16 8.35 4.97 8.96 6.91 8.96C9.65 8.93 12.2 7.6 13.5 5.15C14.29 3.64 14.9 1.73 14.9 0.04L14.9 -0.11C14.87 -1.76 14.58 -3.64 13.79 -5.08C12.31 -7.74 10.55 -9.04 7.52 -9.04C5.9 -9.04 4.1 -8.78 2.81 -7.74C1.55 -6.73 0.72 -5.11 0.72 -3.49C0.72 -0.68 3.38 1.73 6.16 1.73C7.31 1.73 8.5 1.3 9.43 0.47C9.5 0.4 9.58 0.4 9.65 0.4C9.86 0.4 9.97 0.68 9.97 1.26C9.86 7.92 7.74 8.1 6.98 8.1C6.26 8.1 5.8 7.92 5.8 7.56C5.8 7.06 6.48 6.62 6.7 6.19C6.88 5.87 6.95 5.51 6.95 5.15C6.95 4.61 6.77 4.07 6.41 3.67C6.16 3.2 5.11 2.92 4.64 2.92ZM7.63 0C6.48 0 5.51 -1.8 5.51 -4.03C5.51 -6.26 6.48 -8.06 7.63 -8.06C8.78 -8.06 9.72 -6.26 9.72 -4.03C9.72 -1.8 8.78 0 7.63 0Z'},
};
/* 깃발 — Bravura flag8th/16th/32nd Up·Down (U+E240~E245). 원점 = 스템 끝.
   위 스템 깃발은 원점에서 아래로(+y), 아래 스템은 위로(-y) 뻗는다.
   손으로 그린 베지어 깃발(높이 17px)을 글리프(3.2sp)로 바꾼 것 — 2026-09-10, 인그레이빙 점검 4번. */
const FLAG_GLYPH = {
  u1: {d:'M8.57 28.44C8.57 28.44 9.5 25.02 9.5 22.21C9.5 17.71 7.63 13.46 5.36 9.86C3.53 7.02 2.02 3.92 1.44 0.47C1.33 -0.11 1.04 -0.32 0.68 -0.32C0.29 -0.32 0 -0.22 0 0.22L0 8.82C2.38 9.25 5.8 14.15 7.09 17.21C7.63 18.43 7.96 20.48 7.96 22.61C7.96 24.23 7.7 25.92 7.09 27.54C7.02 27.76 6.98 27.94 6.98 28.08C6.98 28.66 7.34 28.98 7.56 29.12C7.78 29.27 8.39 29.05 8.57 28.44Z'},
  d1: {d:'M8.64 -27.36C9.14 -25.85 9.4 -24.05 9.4 -22.43C9.4 -20.3 8.5 -17.28 7.96 -16.06C6.62 -13.03 4.82 -10.12 0 -8.5L0 -0.04C0 0.32 0.29 0.5 0.58 0.5C0.9 0.5 1.37 0.29 1.44 -0.29C2.05 -3.71 4.72 -6.84 6.55 -9.68C8.82 -13.25 11.02 -17.53 11.02 -22.03C11.02 -24.84 10.3 -27.4 10.01 -28.55C9.9 -28.94 9.68 -29.09 9.43 -29.09C8.89 -29.09 8.28 -28.4 8.64 -27.36Z'},
  u2: {d:'M9.79 28.66C9.94 28.48 10.04 26.42 10.04 24.7L10.04 23.9C10.04 22.39 9.65 20.92 9 19.58C9 19.48 8.96 19.4 8.96 19.26C8.96 19.19 8.96 19.12 9 19.01C9.11 18.79 9.9 16.63 9.9 14.44C9.9 13.97 9.86 13.57 9.79 13.14C9.43 10.69 8.5 9.68 5.9 6.88C3.96 4.79 1.94 4.21 1.33 0.4C1.26 0 0.83 -0.07 0.61 -0.07C0.4 -0.07 0 0.04 0 0.29L0 14.26L0.18 14.26C2.41 14.33 4.97 14.4 7.45 19.44C8.28 21.17 8.6 22.93 8.6 24.8C8.6 25.85 8.5 26.93 8.32 28.01C8.28 28.15 8.28 28.22 8.28 28.33C8.28 28.8 8.57 29.27 9.07 29.27C9.32 29.27 9.58 29.12 9.79 28.66ZM7.52 16.52C6.95 15.62 6.34 14.9 5.58 14.04C3.89 12.1 2.23 11.23 1.48 8.28C1.44 8.24 1.44 8.21 1.44 8.17C1.44 8.03 1.66 7.81 1.94 7.81L2.23 7.81C4.43 7.81 6.37 9.83 7.56 11.59C8.21 12.53 8.53 13.64 8.53 14.8C8.53 15.05 8.53 15.26 8.5 15.52C8.42 15.8 8.42 16.16 8.24 16.45C8.21 16.56 7.96 16.67 7.78 16.67C7.67 16.67 7.6 16.63 7.52 16.52Z'},
  d2: {d:'M8.64 -28.3C9.18 -25.27 9.18 -22 7.81 -19.19C5.33 -14.15 2.41 -14.04 0.18 -13.97L0 -13.97L0 -0.04C0 0.14 0.25 0.32 0.61 0.32C0.86 0.32 1.26 0.25 1.33 -0.14C2.2 -5.69 9.29 -7.24 10.15 -12.89C10.22 -13.28 10.26 -13.72 10.26 -14.18C10.26 -16.38 9.47 -18.54 9.36 -18.76C9.32 -18.83 9.32 -18.9 9.32 -19.01C9.32 -19.15 9.36 -19.22 9.36 -19.33C10.66 -22.03 10.69 -25.56 10.12 -28.44C9.94 -29.27 9.68 -29.23 9.25 -29.23C8.82 -29.2 8.53 -28.91 8.64 -28.3ZM8.14 -16.42C8.32 -16.42 8.57 -16.31 8.6 -16.16C8.78 -15.91 8.78 -15.55 8.86 -15.26C8.89 -15.01 8.89 -14.76 8.89 -14.54C8.89 -13.36 8.57 -12.28 7.92 -11.34C6.73 -9.58 4.43 -7.56 2.23 -7.56L1.94 -7.56C1.66 -7.56 1.44 -7.74 1.44 -7.92C1.44 -7.96 1.44 -7.99 1.48 -8.03C2.23 -10.98 4.25 -11.81 5.94 -13.79C6.7 -14.62 7.31 -15.34 7.88 -16.27C7.96 -16.38 8.03 -16.42 8.14 -16.42Z'},
  u3: {d:'M9.36 24.23C9.29 22.82 8.96 21.46 8.42 20.16C8.39 20.09 8.39 20.02 8.39 19.91C8.39 19.84 8.39 19.76 8.42 19.69C8.5 19.44 9.25 17.46 9.25 15.41C9.25 14.26 9 13.1 8.5 12.06C8.82 11.12 9.22 9.65 9.22 8.24C9.22 7.88 9.22 7.56 9.14 7.24C8.75 5.04 7.92 4.07 5.51 1.44C3.71 -0.5 1.76 -1.08 1.15 -4.68C1.12 -5 0.86 -5.36 0.5 -5.36C0.29 -5.36 0 -5.18 0 -4.93L0 15.23L0.18 15.23C2.27 15.3 4.64 15.37 6.95 20.05C7.74 21.64 8.06 23.26 8.06 24.98C8.06 25.99 7.96 27 7.78 28.04C7.78 28.15 7.74 28.22 7.74 28.3C7.74 28.73 7.96 29.05 8.21 29.16C8.28 29.2 8.35 29.23 8.42 29.23C8.64 29.23 8.89 29.05 9.14 28.66C9.25 28.44 9.4 26.78 9.4 25.24C9.4 24.88 9.36 24.55 9.36 24.23ZM7.49 6.52C7.88 7.24 8.03 7.78 8.03 8.24C8.03 8.53 7.96 8.75 7.92 9C7.85 9.36 7.67 9.97 7.49 10.58C6.98 9.94 6.34 9.25 5.51 8.35C3.74 6.41 1.98 5.8 1.4 2.3C3.38 2.3 5.51 3.17 7.49 6.52ZM7.88 16.42C7.81 16.7 7.81 16.99 7.7 17.24C7.67 17.35 7.49 17.46 7.31 17.46C7.2 17.46 7.09 17.42 7.06 17.32C6.52 16.52 6.01 15.91 5.4 15.19L5.22 15.01C3.67 13.18 2.2 12.38 1.4 9.76C1.33 9.5 1.51 9.18 1.84 9.18C4.72 9.18 7.96 12.64 7.96 15.55C7.96 15.84 7.92 16.13 7.88 16.42Z'},
  d3: {d:'M9.83 -24.34C9.83 -25.06 9.58 -29.23 8.32 -29.23C8.24 -29.23 8.17 -29.23 8.1 -29.2C7.85 -29.09 7.6 -28.73 7.6 -28.26C7.6 -28.19 7.63 -28.12 7.63 -28.01C7.92 -26.39 8.35 -25.27 8.35 -24.05C8.35 -23.04 8.06 -22 7.24 -20.52C4.5 -15.62 2.2 -15.55 0 -15.48L0 5.72C0 6.05 0.22 6.19 0.5 6.19C0.86 6.19 1.15 5.8 1.19 5.47C1.8 1.73 3.85 1.15 5.72 -0.9C8.24 -3.64 9.11 -4.64 9.5 -6.95C9.58 -7.27 9.58 -7.63 9.58 -7.99C9.58 -9.54 9.11 -11.12 8.78 -12.1C9.36 -13.14 9.61 -14.51 9.61 -15.73C9.61 -17.6 9.04 -19.15 8.89 -19.51C8.89 -19.55 8.89 -19.58 8.89 -19.58L8.78 -19.76C8.78 -19.91 8.82 -19.98 8.89 -20.09L9.04 -20.34C9.5 -21.24 9.68 -21.64 9.83 -23.94ZM1.4 -9.65C2.16 -12.53 3.82 -13.32 5.44 -15.23C6.16 -16.06 6.73 -16.74 7.31 -17.64C7.38 -17.75 7.49 -17.78 7.6 -17.78C7.78 -17.78 7.99 -17.68 8.03 -17.57C8.14 -17.32 8.14 -17.03 8.21 -16.74C8.24 -16.45 8.28 -16.13 8.28 -15.84C8.28 -12.89 4.97 -9.18 2.05 -9.18L1.87 -9.18C1.55 -9.18 1.4 -9.47 1.4 -9.65ZM8.24 -8.75C8.28 -8.5 8.35 -8.28 8.35 -7.99C8.35 -7.52 8.21 -6.95 7.78 -6.19C5.72 -2.74 3.53 -1.8 1.48 -1.8C1.4 -1.84 1.4 -1.87 1.4 -1.91C2.02 -5.65 3.85 -6.23 5.72 -8.28C6.59 -9.22 7.24 -9.94 7.74 -10.58C7.96 -9.9 8.14 -9.14 8.24 -8.75Z'},
};

/* 쉼표 글리프 — Bravura(Steinberg, SIL OFL 1.1)의 아웃라인을 뽑아 박아 둔 것.
   손으로 그린 근사 도형은 방향이 뒤집히거나 숫자 9처럼 보이는 등 티가 나서, 실제
   인쇄 악보 폰트의 패스를 쓴다. 웹폰트를 로드하지 않으므로 의존성은 그대로 없다.
   (OFL은 폰트에서 뽑은 아웃라인을 문서·앱에 심는 것을 허용한다)
   좌표는 LG=9 기준으로 미리 스케일해 두었고, 원점은 글리프 기준선이다.
   SMuFL 코드포인트: 4분 U+E4E5 / 8분 U+E4E6 / 16분 U+E4E7 / 32분 U+E4E8 / 온 U+E4E3

   다시 뽑을 때: 배율은 **0.036**(= LG 9 기준). e16의 w 11.52 / 320유닛에서 역산한 값이다.
   `opentype.parse(fs.readFileSync(...).buffer)` → `charToGlyph(...).getPath(0,0,upm*0.036)`.
   함정 둘 — (1) `toPathData(2)`가 정수 18에서 **NaN**을 뱉는다. `commands`를 직접 직렬화할 것.
   (2) `commands`에는 **닫는 Z가 없다.** 안 붙이면 외곽선이 안 닫힌다.
   맞게 뽑혔는지는 **이미 박혀 있는 e16을 같은 방법으로 다시 뽑아 문자열 비교**하면 된다
   (2026-08-14에 그렇게 확인했다 — 바이트 단위로 일치). */
const REST_GLYPH = {
  q: {top:-13.43, bot:13.5, w:9.68, x0:0.04,
      d:'M2.81 1.37C3.38 2.09 3.89 2.77 4.36 3.53C4.43 3.67 4.57 3.96 4.57 4.03C4.57 4.07 4.57 4.14 4.54 4.18C4.46 4.32 4.32 4.36 4.14 4.36C4 4.36 3.71 4.28 3.56 4.25C3.53 4.25 3.46 4.25 3.42 4.25L3.13 4.14C1.26 4.14 0.04 5.83 0.04 7.6C0.04 9.4 1.58 11.16 4.21 13.18C4.5 13.39 4.86 13.5 5.15 13.5C5.4 13.5 5.65 13.43 5.69 13.28C5.72 13.18 5.76 13.1 5.76 13.03C5.76 12.71 5.47 12.42 5.18 12.17C4.72 12.17 4.32 11.2 4.25 10.87C4.14 10.58 4.1 10.26 4.1 9.94C4.1 8.46 4.86 7.31 6.37 7.31C7.42 7.31 8.6 7.7 9.22 7.92L9.25 7.96C9.4 7.99 9.47 7.99 9.54 7.99C9.65 7.99 9.72 7.96 9.72 7.85C9.72 7.42 8.78 6.23 8.39 5.8C7.02 4.14 5.9 2.81 5.9 0.79C5.9 0.76 5.9 0.72 5.9 0.68L5.94 0.43C5.94 0.4 5.94 0.36 5.94 0.32C6.08 -1.76 7.38 -3.49 8.32 -4.97C8.42 -5.15 8.46 -5.33 8.46 -5.51C8.46 -5.87 8.32 -6.19 8.32 -6.19C8.32 -6.19 2.99 -12.53 2.38 -13.14C2.2 -13.32 1.94 -13.43 1.73 -13.43C1.37 -13.43 1.01 -13.18 1.01 -12.67C1.01 -12.49 1.04 -12.31 1.15 -12.1C1.3 -11.7 3.35 -9.86 3.35 -7.27C3.35 -5.94 2.81 -4.39 1.19 -2.7C0.83 -2.34 0.68 -1.94 0.68 -1.66C0.68 -1.15 1.04 -0.79 1.04 -0.79Z'},
  e8: {top:-6.26, bot:9.04, w:8.89, x0:0,
      d:'M4.82 -3.85C4.82 -5.18 3.74 -6.26 2.41 -6.26C1.08 -6.26 0 -5.18 0 -3.85C0 -3.1 0.43 -2.45 0.97 -2.02C1.55 -1.62 2.23 -1.4 2.92 -1.4C3.42 -1.4 3.92 -1.51 4.32 -1.66C4.82 -1.8 5.15 -1.94 5.62 -2.2C5.69 -2.23 5.76 -2.23 5.8 -2.23C5.94 -2.23 5.98 -2.09 5.98 -1.91C5.98 -1.8 5.98 -1.66 5.94 -1.51C5.83 -0.97 3.24 6.19 2.59 8.57C2.59 9 3.42 9.04 3.64 9.04C4.03 9.04 4.54 8.96 4.9 8.68C5 8.6 8.53 -4.03 8.53 -4.03C8.68 -4.68 8.86 -5.26 8.89 -5.44C8.89 -5.8 8.53 -5.98 8.46 -6.01C8.39 -6.01 8.28 -6.01 8.06 -5.87C7.81 -5.65 6.01 -3.49 4.82 -3.49Z'},
  e16: {top:-6.44, bot:18, w:11.52, x0:0,
      d:'M7.49 -4C7.49 -5.36 6.41 -6.44 5.04 -6.44C3.71 -6.44 2.59 -5.36 2.59 -4C2.59 -2.52 4.1 -1.55 5.47 -1.55C6.44 -1.55 7.45 -1.87 8.28 -2.34C8.39 -2.38 8.46 -2.41 8.53 -2.41C8.64 -2.41 8.71 -2.34 8.71 -2.16C8.71 -1.58 6.88 3.78 6.62 4.32C6.34 5 5.36 5.44 4.86 5.44C4.9 5.29 4.9 5.18 4.9 5.08C4.9 3.71 3.78 2.63 2.45 2.63C1.08 2.63 0 3.71 0 5.08C0 6.55 1.51 7.52 2.88 7.52C3.82 7.52 4.75 7.2 5.58 6.77C5.65 6.77 5.72 6.84 5.72 6.98L5.69 7.02C5.69 7.06 5.69 7.06 5.69 7.06L2.27 17.24C2.27 17.24 2.27 17.28 2.27 17.28L2.23 17.32C2.23 17.64 2.56 18 3.35 18C4.39 18 4.57 17.57 4.72 17.17L8.89 3.46C9.83 0.4 10.51 -2.02 10.51 -2.02C10.51 -2.02 11.41 -5.18 11.48 -5.65C11.48 -5.72 11.52 -5.76 11.52 -5.8C11.52 -6.01 11.23 -6.16 11.16 -6.19C10.98 -6.19 10.87 -6.12 10.76 -6.05C10.51 -5.83 8.71 -3.67 7.49 -3.64Z'},
  e32: {top:-15.34, bot:18, w:13.07, x0:0,
      d:'M12.71 -15.08C12.53 -15.08 12.42 -15.01 12.31 -14.94C12.06 -14.76 10.26 -12.56 9.04 -12.56L9.04 -12.89C9.04 -14.26 7.96 -15.34 6.59 -15.34C5.26 -15.34 4.14 -14.26 4.14 -12.89C4.14 -12.17 4.57 -11.52 5.15 -11.09C5.44 -10.84 5.8 -10.69 6.16 -10.58C6.44 -10.51 6.73 -10.44 7.09 -10.44C8.03 -10.44 9 -10.8 9.83 -11.23C9.86 -11.27 9.94 -11.27 9.97 -11.27C10.22 -11.27 10.37 -10.91 10.37 -10.66L10.33 -10.58C10.33 -10.58 10.33 -10.55 10.33 -10.55L8.93 -4.79C8.75 -4.21 7.56 -3.49 6.98 -3.49C7.02 -3.6 7.02 -3.71 7.02 -3.82C7.02 -5.18 5.9 -6.26 4.57 -6.26C3.2 -6.26 2.12 -5.18 2.12 -3.82C2.12 -3.1 2.56 -2.45 3.13 -2.02C3.42 -1.76 3.74 -1.62 4.1 -1.51C4.39 -1.44 4.72 -1.37 5.08 -1.37C6.01 -1.37 6.95 -1.73 7.78 -2.16C7.81 -2.2 7.85 -2.2 7.88 -2.2C8.06 -2.2 8.14 -1.91 8.14 -1.73L6.7 4.18C6.52 4.93 5.4 5.4 4.86 5.44C4.9 5.29 4.9 5.18 4.9 5.08C4.9 3.71 3.82 2.63 2.45 2.63C1.12 2.63 0 3.71 0 5.08C0 6.55 1.51 7.52 2.88 7.52C3.85 7.52 4.86 7.2 5.69 6.73C5.72 6.7 5.76 6.7 5.8 6.7C5.9 6.7 6.01 6.8 6.01 6.91C6.01 7.06 3.53 16.96 3.46 17.21C3.42 17.28 3.42 17.35 3.42 17.42C3.42 17.71 3.64 18 4.39 18C5.54 18 5.65 17.64 5.8 17.24C5.9 16.81 12.1 -10.91 12.1 -10.91C12.1 -10.91 12.96 -14.11 13.03 -14.54C13.03 -14.62 13.07 -14.65 13.07 -14.69C13.07 -15.01 12.78 -15.08 12.71 -15.08Z'},
  w: {top:-0.32, bot:4.86, w:10.15, x0:0,
      d:'M10.15 3.92L10.15 0.61C10.15 0.07 9.72 -0.32 9.22 -0.32L0.94 -0.32C0.4 -0.32 0 0.07 0 0.61L0 3.92C0 4.43 0.4 4.86 0.94 4.86L9.22 4.86C9.72 4.86 10.15 4.43 10.15 3.92Z'},
};

/* originY = 글리프 기준선. 폰트와 같은 방식이라 종류가 달라도 같은 선에 정렬된다.
   SMuFL 표준 위치는 가운데 줄(top + 2*LG) */
function restGlyph(x, originY, kind){
  const s = LG/9;
  /* 반쉼표('h')는 온쉼표와 같은 사각형이고 방향만 반대다 — 온쉼표는 줄에 매달리고
     반쉼표는 줄 **위에** 얹힌다. 글리프를 따로 뽑는 대신 온쉼표 패스를 제 높이만큼
     올려서 쓴다. 두 박을 묶은 박(2박 3연음)의 빈 박에서만 나온다 */
  if(kind === 'h'){ kind = 'w'; originY -= REST_GLYPH.w.bot * s; }
  const g = REST_GLYPH[kind];
  SVGT.appendChild(el('path',{ d:g.d, fill:INK,
    transform:`translate(${x - (g.x0 + g.w/2)*s} ${originY})` + (s!==1 ? ` scale(${s})` : '') }));
}
/* 액센트 — Bravura `articAccentAbove` U+E4A0 / `articAccentBelow` U+E4A1.
   쉼표와 같은 방식으로 아웃라인만 뽑아 박았다(LG=9 기준으로 미리 스케일).
   두 글리프는 같은 모양이고 기준선 기준 위/아래로만 다르다 —
   above는 y가 -8.82~0, below는 0~8.78. */
const ACCENT_GLYPH = {
  above: {d:'M11.74-3.78C12.20-3.89 12.20-4.14 12.20-4.43C12.20-4.72 12.20-4.93 11.74-5.08L0.94-8.75C0.79-8.78 0.65-8.82 0.61-8.82C0.29-8.82 0.18-8.60 0.07-8.32C0.04-8.17 0.00-8.06 0.00-7.96C0.00-7.78 0.11-7.60 0.50-7.45C0.50-7.45 8.28-4.82 8.64-4.68C8.82-4.64 8.89-4.54 8.89-4.43C8.89-4.32 8.82-4.25 8.60-4.18C8.21-4.07 0.50-1.44 0.50-1.44C0.11-1.26 0.00-1.08 0.00-0.90C0.00-0.79 0.04-0.68 0.07-0.58C0.18-0.32 0.32-0.04 0.58-0.04C0.61-0.04 0.68-0.04 0.72-0.07', w:12.2},
  below: {d:'M11.74 5.04C12.20 4.93 12.20 4.68 12.20 4.39C12.20 4.10 12.20 3.89 11.74 3.74L0.94 0.07C0.79 0.04 0.65 0.00 0.61 0.00C0.29 0.00 0.18 0.22 0.07 0.50C0.04 0.65 0.00 0.76 0.00 0.86C0.00 1.04 0.11 1.22 0.50 1.37C0.50 1.37 8.28 4.00 8.64 4.14C8.82 4.18 8.89 4.28 8.89 4.39C8.89 4.50 8.82 4.57 8.60 4.64C8.21 4.75 0.50 7.38 0.50 7.38C0.11 7.56 0.00 7.74 0.00 7.92C0.00 8.03 0.04 8.14 0.07 8.24C0.18 8.50 0.32 8.78 0.58 8.78C0.61 8.78 0.68 8.78 0.72 8.75', w:12.2},
};
/* 스템/빔 **바깥쪽**에 놓는다. 드럼 기보 관례이기도 하고,
   머리 옆(고스트 괄호)·머리 위(오픈 원)와 절대 안 겹친다. */
function accentGlyph(x, y, up){
  const g = ACCENT_GLYPH[up ? 'above' : 'below'], s = LG/9;
  SVGT.appendChild(el('path',{ d:g.d, fill:INK,
    transform:`translate(${x - (g.w/2)*s} ${y})` + (s!==1 ? ` scale(${s})` : '') }));
}

/* 성부별 기준선.
   두 성부가 같은 박에서 동시에 쉬는 경우는 공통 쉼표 하나로 처리하므로(아래 drawMeasure)
   손 쉼표와 발 쉼표가 한 박에 같이 나오는 일은 없다. 그래서 서로 겹칠 걱정 없이
   손은 위로, 발은 오선 아래로 넉넉히 벌려 둘 수 있다. */
const REST_ORIGIN = {hand: 1.7, foot: 4.6, both: 2.0};   // × LG
function drawRestAt(x, top, voice, kind){
  restGlyph(x, top + REST_ORIGIN[voice]*LG, kind);
}
/* 온쉼표 — 성부가 마디 내내 비었을 때. 오선 줄에 매단다 */
function drawWholeRest(x, top, voice){
  restGlyph(x, top + (voice==='foot' ? 4*LG : LG), 'w');
}

