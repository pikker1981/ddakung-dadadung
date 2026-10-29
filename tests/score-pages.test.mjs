import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/legacy/03-notation.js',import.meta.url),'utf8');
function fixture(total=45,ipad=false){
  const wrap={clientWidth:1600,scrollTop:200,scrollLeft:20};
  const titleInput={value:'Current score title'};
  const bodyClasses=new Set(['crt-workspace',...(ipad?['ipad-workspace']:[])]);
  const c=vm.createContext({document:{body:{classList:{contains:name=>bodyClasses.has(name)}},getElementById:id=>id==='scoreWrap'?wrap:id==='titleInput'?titleInput:null},getComputedStyle:()=>({paddingLeft:'0',paddingRight:'0',paddingTop:'5px',paddingBottom:'5px'}),window:{dispatchEvent(){}},CustomEvent:class{},wrap,bodyClasses});
  vm.runInContext(`let measures=Array.from({length:${total}},(_,i)=>({kick:[i%2,0],vel:{kick:[50+i,0]}})),selMeasure=0,slotXCache=[],SHELF_ON=false,songMeta={sub:'subtitle',copyright:'credit'};
    const svg={style:{},attrs:{},getAttribute:name=>svg.attrs[name]??null,setAttribute:(name,value)=>{svg.attrs[name]=String(value)}};let lastPaint=null,paintWidth=null,paintHeight=300,zoomLevel=1,lastOverlayWidth=null;function zoomF(){return zoomLevel}function syncCurOverlay(){lastOverlayWidth=svg.style.width}function updateEditCursor(){}
    function paint(target,o){lastPaint=o;for(let i=o.from;i<o.to;i++)o.cache[i]={top:100,x0:i*10};const width=paintWidth??o.availW;target.setAttribute('width',width);target.setAttribute('height',paintHeight);target.setAttribute('viewBox','0 0 '+width+' '+paintHeight);return width}
    function selectMeasure(i){selMeasure=i;renderScore()}
  `+source.slice(source.indexOf("let screenPerLine = 'auto';"),source.indexOf('/* 머리말이 먹는 높이.'))+
    source.slice(source.indexOf('function renderScore(){'),source.indexOf('/* 출력용 페이지 SVG 배열.')),c);
  return {run:s=>vm.runInContext(s,c),json:s=>JSON.parse(vm.runInContext(`JSON.stringify(${s})`,c))};
}
test('screen renders twenty original measures per page and clamps final page without mutating notes',()=>{
  const f=fixture();const before=f.json('measures');f.run('renderScore()');
  assert.deepEqual(f.json('[lastPaint.from,lastPaint.to]'),[0,20]);
  f.run('selectMeasure(20)');assert.deepEqual(f.json('[lastPaint.from,lastPaint.to]'),[20,40]);
  assert.equal(f.run('slotXCache[0]'),undefined);assert.ok(f.run('slotXCache[20]'));
  f.run('selectMeasure(40)');assert.deepEqual(f.json('[lastPaint.from,lastPaint.to]'),[40,45]);
  assert.deepEqual(f.json('measures'),before);
});
test('playback follow crosses 20 to 21, 40 to 41 and loops back without changing editor selection',()=>{
  const f=fixture();f.run('renderScore()');
  assert.equal(f.run('ensureScorePage(19)'),false);
  assert.equal(f.run('ensureScorePage(20)'),true);assert.equal(f.run('selMeasure'),0);
  f.run('renderScore()');assert.equal(f.run('lastPaint.from'),20);
  assert.equal(f.run('ensureScorePage(40)'),true);assert.equal(f.run('lastPaint.to'),45);
  assert.equal(f.run('ensureScorePage(0)'),true);assert.equal(f.run('lastPaint.from'),0);
  assert.equal(f.run('wrap.scrollTop'),0);
});
test('manual next and previous select page starts, deletion clamps page and fixed output preview remains unpaged',()=>{
  const f=fixture();f.run('renderScore()');assert.equal(f.run('moveScorePage(-1)'),false);
  f.run('wrap.scrollTop=200;wrap.scrollLeft=30;moveScorePage(1)');assert.equal(f.run('selMeasure'),20);
  assert.equal(f.run('wrap.scrollTop'),0);assert.equal(f.run('wrap.scrollLeft'),0);
  f.run('moveScorePage(1)');assert.equal(f.run('selMeasure'),40);
  assert.equal(f.run('moveScorePage(1)'),false);
  f.run('moveScorePage(-1)');assert.equal(f.run('selMeasure'),20);
  f.run('measures.length=5;selMeasure=0;renderScore()');assert.deepEqual(f.json('[lastPaint.from,lastPaint.to]'),[0,5]);
  f.run('screenPerLine=4;renderScore()');assert.equal(f.run('scorePageInfo().enabled'),false);
  assert.equal(f.run('moveScorePage(1)'),false);
});

test('iPad screen paints four-measure groups with original indices and a partial final group',()=>{
  const f=fixture(45,true),before=f.json('measures');f.run('renderScore()');
  assert.deepEqual(f.json('[lastPaint.from,lastPaint.to,lastPaint.maxPerLine,lastPaint.screenColumns,lastPaint.unfoldRests]'),[0,4,2,2,true]);
  f.run('selectMeasure(22)');
  assert.deepEqual(f.json('[lastPaint.from,lastPaint.to]'),[20,24]);
  assert.deepEqual(f.json('Object.keys(slotXCache)'),['20','21','22','23']);
  assert.deepEqual(f.json('scorePageInfo()'),{enabled:true,start:20,end:23,total:45,page:23,pages:45});
  f.run('selectMeasure(44)');
  assert.deepEqual(f.json('[lastPaint.from,lastPaint.to]'),[44,45]);
  assert.deepEqual(f.json('scorePageInfo()'),{enabled:true,start:44,end:44,total:45,page:45,pages:45});
  assert.deepEqual(f.json('measures'),before);
  const partial=fixture(7,true);partial.run('selectMeasure(6)');
  assert.deepEqual(partial.json('[lastPaint.from,lastPaint.to]'),[4,7]);
  assert.deepEqual(partial.json('Object.keys(slotXCache)'),['4','5','6']);
  // Empty measures must remain separate units when multi-rests are on.
  const units=source.slice(source.indexOf('  const units = [];'),source.indexOf('  const UW = units.map'));
  const plan=JSON.parse(vm.runInNewContext(units+'JSON.stringify(units)',{oneRow:false,o:{unfoldRests:true},from:0,to:4,mrestRun:()=>4,GEO:{MEASURE_W:100},MWs:[100,100,100,100]}));
  assert.deepEqual(plan.map(u=>[u.mi,u.n]),[[0,1],[1,1],[2,1],[3,1]]);
});

test('iPad two-column row planning ignores width and document breaks without changing ordinary auto rows',()=>{
  const rowCode=source.slice(source.indexOf('  const units = [];'),source.indexOf('  // 마디 번호 줄(rows)'));
  const rows=(count,screenColumns)=>JSON.parse(vm.runInNewContext(rowCode+'JSON.stringify(rowsU.map(r=>r.map(u=>units[u].mi)))',{
    oneRow:false,o:{perLine:'auto',screenColumns,maxPerLine:2,unfoldRests:true,availW:120},
    from:4,to:4+count,mrestRun:()=>4,GEO:{MEASURE_W:900},MWs:Array(8).fill(900),clef:62,lineBreakAt:()=>true,
  }));
  assert.deepEqual(rows(4,2),[[4,5],[6,7]]);
  assert.deepEqual(rows(3,2),[[4,5],[6]]);
  assert.deepEqual(rows(1,2),[[4]]);
  assert.deepEqual(rows(4,undefined),[[4],[5],[6],[7]]);
});

test('iPad playback follows individual measures and can return to the editor selection on stop',()=>{
  const f=fixture(8,true);f.run('selectMeasure(2)');
  assert.equal(f.run('ensureScorePage(2)'),false);
  assert.equal(f.run('ensureScorePage(3)'),true);
  assert.deepEqual(f.json('[lastPaint.from,lastPaint.to,selMeasure,scorePageInfo().page]'),[0,4,2,4]);
  f.run('renderScore()');assert.equal(f.run('lastPaint.from'),0);
  assert.equal(f.run('ensureScorePage(4)'),true);
  assert.deepEqual(f.json('[lastPaint.from,lastPaint.to,scorePageInfo().page]'),[4,8,5]);
  assert.equal(f.run('ensureScorePage(6)'),true);
  assert.deepEqual(f.json('[lastPaint.from,lastPaint.to,scorePageInfo().page]'),[4,8,7]);
  assert.equal(f.run('ensureScorePage(7)'),true);
  assert.deepEqual(f.json('[lastPaint.from,lastPaint.to,scorePageInfo().page]'),[4,8,8]);
  assert.equal(f.run('ensureScorePage(7)'),false);
  assert.equal(f.run('ensureScorePage(0)'),true);
  assert.deepEqual(f.json('[lastPaint.from,lastPaint.to,selMeasure]'),[0,4,2]);
  // stopPlay already calls this operation to restore the edited measure.
  assert.equal(f.run('ensureScorePage(selMeasure)'),true);
  assert.deepEqual(f.json('[lastPaint.from,lastPaint.to,selMeasure]'),[0,4,2]);
});

test('iPad previous and next select adjacent editor measures with bounded navigation',()=>{
  const f=fixture(6,true);f.run('renderScore()');
  assert.equal(f.run('moveScorePage(-1)'),false);
  assert.equal(f.run('moveScorePage(1)'),true);
  assert.deepEqual(f.json('[selMeasure,lastPaint.from,lastPaint.to,scorePageInfo().page]'),[1,0,4,2]);
  assert.equal(f.run('moveScorePage(1)'),true);
  assert.deepEqual(f.json('[selMeasure,lastPaint.from,lastPaint.to,scorePageInfo().page]'),[2,0,4,3]);
  f.run('selectMeasure(3)');assert.equal(f.run('moveScorePage(1)'),true);
  assert.deepEqual(f.json('[selMeasure,lastPaint.from,lastPaint.to,scorePageInfo().page]'),[4,4,6,5]);
  assert.equal(f.run('moveScorePage(1)'),true);
  assert.deepEqual(f.json('[selMeasure,lastPaint.from,lastPaint.to,scorePageInfo().page]'),[5,4,6,6]);
  assert.equal(f.run('moveScorePage(1)'),false);
  assert.equal(f.run('moveScorePage(-1)'),true);
  assert.deepEqual(f.json('[selMeasure,lastPaint.from,lastPaint.to,scorePageInfo().page]'),[4,4,6,5]);
  assert.equal(f.run('moveScorePage(-1)'),true);
  assert.deepEqual(f.json('[selMeasure,lastPaint.from,lastPaint.to,scorePageInfo().page]'),[3,0,4,4]);
  f.run('measures.length=1;selMeasure=0;renderScore()');
  assert.deepEqual(f.json('[lastPaint.from,lastPaint.to]'),[0,1]);
  assert.deepEqual(f.json('scorePageInfo()'),{enabled:true,start:0,end:0,total:1,page:1,pages:1});
  assert.equal(f.run('moveScorePage(1)'),false);
  assert.equal(f.run('moveScorePage(-1)'),false);
});

test('installing the iPad shell refreshes page size while fixed output preview still paints the full document',()=>{
  const f=fixture();f.run('selectMeasure(22)');
  assert.deepEqual(f.json('[lastPaint.from,lastPaint.to]'),[20,40]);
  f.run("bodyClasses.add('ipad-workspace');renderScore()");
  assert.deepEqual(f.json('[lastPaint.from,lastPaint.to]'),[20,24]);
  f.run('screenPerLine=4;renderScore()');
  assert.equal(f.run('scorePageInfo().enabled'),false);
  assert.deepEqual(f.json('[lastPaint.from,lastPaint.to]'),[0,45]);
  assert.equal(f.run('moveScorePage(1)'),false);
  f.run("screenPerLine='auto';bodyClasses.delete('ipad-workspace');renderScore()");
  assert.deepEqual(f.json('[lastPaint.from,lastPaint.to]'),[20,40]);
});

test('compact iPad score fits paper width and height without a repeated heading and preserves full output headings',()=>{
  const f=fixture(45,true);f.run('wrap.clientWidth=180;paintWidth=540;zoomLevel=1.5;renderScore()');
  assert.equal(f.run('svg.style.width'),'180px');
  assert.equal(f.run('lastOverlayWidth'),'180px');
  assert.deepEqual(f.json('[lastPaint.title,lastPaint.meta,lastPaint.copyright]'),['',null,'']);
  f.run('wrap.clientHeight=130;paintHeight=600;renderScore()');
  assert.equal(f.run('svg.style.width'),'108px');
  assert.equal(f.run('lastOverlayWidth'),'108px');
  // Hidden/unmeasured paper or an absent viewBox height must not collapse it.
  f.run('wrap.clientHeight=0;renderScore()');assert.equal(f.run('svg.style.width'),'180px');
  f.run('wrap.clientHeight=130;paintHeight=0;renderScore()');assert.equal(f.run('svg.style.width'),'180px');
  f.run('wrap.clientHeight=116;paintWidth=175;paintHeight=208;svg.getBBox=()=>({x:6,y:25.5,width:156.53,height:123.46});renderScore()');
  const trimmed=f.json("svg.getAttribute('viewBox').split(/\\s+/).map(Number)");
  assert.deepEqual(trimmed.slice(0,3),[0,17.5,175]);
  assert.ok(Math.abs(trimmed[3]-139.46)<1e-9);
  assert.ok(Math.abs(f.run("Number(svg.getAttribute('height'))")-139.46)<1e-9);
  assert.ok(Math.abs(f.run('parseFloat(svg.style.width)')-175*106/139.46)<1e-9);
  f.run("svg.getBBox=()=>{throw new Error('unmeasured')};renderScore()");
  assert.equal(f.run("svg.getAttribute('viewBox')"),'0 0 175 208');
  assert.ok(Math.abs(f.run('parseFloat(svg.style.width)')-175*106/208)<1e-9);
  f.run('paintWidth=540;paintHeight=600;svg.getBBox=()=>({y:25.5,height:123.46})');
  f.run('screenPerLine=4;renderScore()');
  assert.equal(f.run('svg.style.width'),'810px');
  assert.equal(f.run("svg.getAttribute('viewBox')"),'0 0 540 600');
  assert.deepEqual(f.json('[lastPaint.title,lastPaint.meta,lastPaint.copyright]'),['Current score title',{sub:'subtitle',copyright:'credit'},'credit']);
  f.run("screenPerLine='auto';bodyClasses.delete('ipad-workspace');renderScore()");
  assert.equal(f.run('svg.style.width'),'810px');
  assert.equal(f.run("svg.getAttribute('viewBox')"),'0 0 540 600');
  assert.equal(f.run('lastPaint.title'),'Current score title');
});

test('four-measure engraving keeps real noteheads, grace notes and bar boundaries clear',()=>{
  for(const variant of ['sixteenths','ruff-accent-sticking','thirty-seconds']){
    const f=realEngravingFixture();
    if(variant==='ruff-accent-sticking')f.run('measures.forEach(m=>{m.snare.fill(3);m.orn={snare:Array(16).fill(0)};m.orn.snare[0]=3;m.stick=Array.from({length:16},(_,i)=>i%2+1)})');
    if(variant==='thirty-seconds')f.run('measures.forEach(m=>{m.division=8;m.snare=Array(32).fill(1);m.orn={snare:Array(32).fill(0)};m.orn.snare[0]=3})');
    const before=f.json('measures');
    const width=f.run("paint(svg,{availW:300,perLine:'auto',maxPerLine:2,screenColumns:2,unfoldRests:true,readOnly:true,cache,rows})");
    assert.deepEqual(f.json('rows'),[[0,1],[2,3]]);
    assert.ok(f.run('cache.every(p=>p.mul>=1)'));
    assert.ok(width>300,'natural engraving must be fitted as a whole SVG');
    const ellipses=f.target.children.filter(n=>n.tag==='ellipse');
    const heads=ellipses.filter(n=>Number(n.attrs.rx)>4);
    const perMeasure=variant==='thirty-seconds'?32:16;
    assert.equal(heads.length,perMeasure*4);
    for(const offset of [0,perMeasure*2]){
      const a=heads[offset+perMeasure-1],b=heads[offset+perMeasure];
      assert.equal(a.attrs.cy,b.attrs.cy);
      assert.ok(Number(b.attrs.cx)-Number(a.attrs.cx)>=Number(a.attrs.rx)+Number(b.attrs.rx),'bar-boundary noteheads overlap');
    }
    for(const y of new Set(ellipses.map(n=>n.attrs.cy))){
      const row=ellipses.filter(n=>n.attrs.cy===y).sort((a,b)=>Number(a.attrs.cx)-Number(b.attrs.cx));
      for(let i=1;i<row.length;i++){
        const a=row[i-1],b=row[i];
        assert.ok(Number(b.attrs.cx)-Number(a.attrs.cx)-Number(a.attrs.rx)-Number(b.attrs.rx)>=0.5,'note/grace heads need visible clearance');
      }
    }
    if(variant==='ruff-accent-sticking'){
      assert.equal(f.target.children.filter(n=>n.tag==='text'&&['R','L'].includes(n.textContent)).length,64);
      assert.equal(f.target.children.filter(n=>n.tag==='path'&&n.attrs.d===f.run('ACCENT_GLYPH.above.d')).length,64);
    }
    assert.deepEqual(f.json('measures'),before);
  }
  const ordinary=realEngravingFixture();
  ordinary.run("paint(svg,{availW:300,perLine:'auto',maxPerLine:2,unfoldRests:true,readOnly:true,cache,rows})");
  assert.deepEqual(ordinary.json('rows'),[[0],[1],[2],[3]]);
  assert.ok(ordinary.run('cache.some(p=>p.mul<1)'),'ordinary engraving retains its existing spacing rule');
});

// Exercise the complete engraver with fixed 4/4 input, rather than the range-only
// paint stub above. The retained paint/spacing/note/grace/mark functions emit all
// SVG elements; this DOM stand-in only records their actual attributes.
function realEngravingFixture(){
  class SvgNode{
    constructor(tag){this.tag=tag;this.attrs={};this.children=[];this.style={};}
    set innerHTML(_){this.children=[];}
    setAttribute(name,value){this.attrs[name]=String(value);}
    getAttribute(name){return this.attrs[name]??null;}
    removeAttribute(name){delete this.attrs[name];}
    appendChild(node){this.children.push(node);return node;}
  }
  const target=new SvgNode('svg');
  const c=vm.createContext({document:{getElementById:()=>target,createElementNS:(_,tag)=>new SvgNode(tag)}});
  vm.runInContext(`
    const INSTR=[{id:'snare',voice:'hand',pos:4,head:'o'}],HAND_INS=INSTR,FOOT_INS=[],byId={snare:INSTR[0]};
    const ST={font:'Georgia',headRx:5.4,headRy:4.5,ghostRx:4.1,ghostRy:3.1,tilt:-22,stem:1.1,beam:4.5,staff:1,hollow:1.7,xw:1.8,xwg:1.4,jitter:0};
    const ART={NORM:1,GHOST:2,ACCENT:3,OPEN:4,XSTICK:5,RIM:6,CLOSED:7,BELL:8,BUZZ:12};
    const OPEN_OK={},CLOSED_OK={},XSTICK_OK={},RIM_OK={},BELL_OK={},ROLL_SLASH={},DIV_MIX={},DYN_OK=[],HP_OK=[];
    const HEAD_SIZES={normal:1},headSize='normal',showTempo=false,bpm=100,INK='#171717',STICK_POS='above',
      TEXT_BASE_PX=10,SHOW_BARNUM=true,SHOW_MREST=true,CRASH_RING=false,SEXT_SPLIT=true,MERGE_STEMS=false;
    let measures=Array.from({length:4},()=>({snare:Array(16).fill(1)})),cache=[],rows=[];
    function beatCount(){return 4}function beatQ(){return 1}function tsOf(){return [4,4]}
    function divOf(m,b,voice){return m.division||4}function divCells(d){return d}
    function cellFrac(d,k){return k/d}function divSegs(d){return [{k0:0,n:d,f0:0,fl:1,div:d}]}
    function beatOffset(m,voice,b){return b*(m.division||4)}
    function idxAt(m,voice,b,k){return beatOffset(m,voice,b)+k}
    function isGhost(v){return v===2}function rollPart(v){return v}
    function compoundBeat(){return false}
    function lineGap(){return 0}function lineBreakAt(){return false}function mrestRun(){return 1}
    function textPx(){return 10}function zoomF(){return 1}function jit(){return 0}
    function ornOf(m,id,step){return m.orn?.[id]?.[step]||0}function ornInsOf(m,id){return id}
    function tapMeasures(){return false}
  `+source,c);
  return {run:s=>vm.runInContext(s,c),json:s=>JSON.parse(vm.runInContext(`JSON.stringify(${s})`,c)),target};
}
