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

test('iPad screen paints the selected and next original measures in separate systems',()=>{
  const f=fixture(45,true),before=f.json('measures');f.run('renderScore()');
  assert.deepEqual(f.json('[lastPaint.from,lastPaint.to,lastPaint.maxPerLine,lastPaint.unfoldRests]'),[0,2,1,true]);
  f.run('selectMeasure(22)');
  assert.deepEqual(f.json('[lastPaint.from,lastPaint.to]'),[22,24]);
  assert.deepEqual(f.json('Object.keys(slotXCache)'),['22','23']);
  assert.deepEqual(f.json('scorePageInfo()'),{enabled:true,start:22,end:23,total:45,page:23,pages:45});
  f.run('selectMeasure(44)');
  assert.deepEqual(f.json('[lastPaint.from,lastPaint.to]'),[43,45]);
  assert.deepEqual(f.json('scorePageInfo()'),{enabled:true,start:43,end:44,total:45,page:45,pages:45});
  assert.deepEqual(f.json('measures'),before);
  // Even two empty measures must remain separate units when multi-rests are on.
  const units=source.slice(source.indexOf('  const units = [];'),source.indexOf('  const UW = units.map'));
  const plan=JSON.parse(vm.runInNewContext(units+'JSON.stringify(units)',{oneRow:false,o:{unfoldRests:true},from:0,to:2,mrestRun:()=>2,GEO:{MEASURE_W:100},MWs:[100,100]}));
  assert.deepEqual(plan.map(u=>[u.mi,u.n]),[[0,1],[1,1]]);
});

test('iPad playback follows individual measures and can return to the editor selection on stop',()=>{
  const f=fixture(8,true);f.run('selectMeasure(2)');
  assert.equal(f.run('ensureScorePage(2)'),false);
  assert.equal(f.run('ensureScorePage(3)'),true);
  assert.deepEqual(f.json('[lastPaint.from,lastPaint.to,selMeasure]'),[3,5,2]);
  f.run('renderScore()');assert.equal(f.run('lastPaint.from'),3);
  assert.equal(f.run('ensureScorePage(6)'),true);
  assert.deepEqual(f.json('[lastPaint.from,lastPaint.to,scorePageInfo().page]'),[6,8,7]);
  assert.equal(f.run('ensureScorePage(7)'),true);
  assert.deepEqual(f.json('[lastPaint.from,lastPaint.to,scorePageInfo().page]'),[6,8,8]);
  assert.equal(f.run('ensureScorePage(7)'),false);
  assert.equal(f.run('ensureScorePage(0)'),true);
  assert.deepEqual(f.json('[lastPaint.from,lastPaint.to,selMeasure]'),[0,2,2]);
  // stopPlay already calls this operation to restore the edited measure.
  assert.equal(f.run('ensureScorePage(selMeasure)'),true);
  assert.deepEqual(f.json('[lastPaint.from,lastPaint.to,selMeasure]'),[2,4,2]);
});

test('iPad previous and next select adjacent editor measures with bounded navigation',()=>{
  const f=fixture(3,true);f.run('renderScore()');
  assert.equal(f.run('moveScorePage(-1)'),false);
  assert.equal(f.run('moveScorePage(1)'),true);
  assert.deepEqual(f.json('[selMeasure,lastPaint.from,lastPaint.to,scorePageInfo().page]'),[1,1,3,2]);
  assert.equal(f.run('moveScorePage(1)'),true);
  assert.deepEqual(f.json('[selMeasure,lastPaint.from,lastPaint.to,scorePageInfo().page]'),[2,1,3,3]);
  assert.equal(f.run('moveScorePage(1)'),false);
  assert.equal(f.run('moveScorePage(-1)'),true);
  assert.deepEqual(f.json('[selMeasure,lastPaint.from,lastPaint.to,scorePageInfo().page]'),[1,1,3,2]);
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
  assert.deepEqual(f.json('[lastPaint.from,lastPaint.to]'),[22,24]);
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
