import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/legacy/03-notation.js',import.meta.url),'utf8');
function fixture(total=45){
  const wrap={clientWidth:1600,scrollTop:200,scrollLeft:20};
  const c=vm.createContext({document:{body:{classList:{contains:()=>true}},getElementById:id=>id==='scoreWrap'?wrap:null},getComputedStyle:()=>({paddingLeft:'0',paddingRight:'0'}),window:{dispatchEvent(){}},CustomEvent:class{},wrap});
  vm.runInContext(`let measures=Array.from({length:${total}},(_,i)=>({kick:[i%2,0],vel:{kick:[50+i,0]}})),selMeasure=0,slotXCache=[],SHELF_ON=false,songMeta={};
    const svg={style:{}};let lastPaint=null;function zoomF(){return 1}function syncCurOverlay(){}function updateEditCursor(){}
    function paint(target,o){lastPaint=o;for(let i=o.from;i<o.to;i++)o.cache[i]={top:100,x0:i*10};return o.availW}
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
