import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const bridge=readFileSync(new URL('../src/legacy/score-render-bridge.js',import.meta.url),'utf8');
const notation=readFileSync(new URL('../src/legacy/03-notation.js',import.meta.url),'utf8');
function fixture(){
  const c=vm.createContext({window:{}});
  vm.runInContext(`
    let measures=[{beats:2,widths:[20,80]}],INSTR=['current'],byId={},HAND_INS=[],FOOT_INS=[],
      rosterOff=new Set(['kick']),rosterOrder=['kick'],rosterNames={kick:'custom'},
      songMeta={sub:'current'},headSize='large',showTempo=true,bpm=155,scoreStyle='jazz',
      ST={font:'current'},INK='#aaa',GEO={M_PAD:10,BEAT_GAP:5},ROW_MUL=7,SVGT={},_bwToken=88,MULTI_REST=true;
    const SCREEN_PAGE_SIZE=20;const MARK_Y={stick:-35,stickB:37,extra:3},LG=9,SVG_NS='svg',CAT_ORDER=['kick'],SCORE_STYLES={classic:{font:'classic'}};
    const svg={getAttribute:k=>k==='viewBox'?'0 0 500 300':null},slotXCache=[{x0:50,top:100,mul:2,w:240}];
    function el(){return {getAttribute:k=>k==='viewBox'?'0 0 900 600':null,outerHTML:'<svg></svg>'}}
    function rebuildRoster(){INSTR=['foreign'];byId={kick:{}};HAND_INS=[];FOOT_INS=[];rosterOrder=['new'];}
    function metaClean(v){return {...v,copyright:v?.copyright||''}}
    function beatCount(m){return m.beats||2}
    function beatPxAt(m,b){return (m.widths?.[b]||40)*ROW_MUL}
    let paintOptions,throwPaint=false;
    function paint(target,o){
      paintOptions=o;GEO={M_PAD:8,BEAT_GAP:4};ROW_MUL=99;SVGT=target;_bwToken++;MARK_Y.extra=500;
      if(throwPaint)throw new Error('engraving failed');
      for(let i=o.from;i<o.to;i++)o.cache[i]={x0:40,top:100+Math.floor((i-o.from)/4)*150,mul:1.5,w:200};
    }
    const references={measures,INSTR,byId,HAND_INS,FOOT_INS,rosterOff,rosterOrder,rosterNames,songMeta,ST,GEO,SVGT};
  `+notation.slice(notation.indexOf('function xAtPos('),notation.indexOf('/* 줄을 폭에 맞춰 늘릴 때'))+bridge,c);
  return {run:s=>vm.runInContext(s,c),json:s=>JSON.parse(vm.runInContext(`JSON.stringify(${s})`,c))};
}
test('current geometry uses actual proportional beat anchors and cached row multiplier',()=>{
  const f=fixture(),g=f.json('window.ddakungScoreRender.currentGeometry()');
  assert.deepEqual([g.width,g.height],[500,300]);
  assert.deepEqual(g.beats.map(b=>[b.measure,b.beat,b.x,b.width]),[[0,0,82,50],[0,1,132,158]]);
  assert.ok(g.beats.every(b=>b.y<100&&b.y+b.height>=136));
  assert.equal(f.run('ROW_MUL'),7);
});
test('foreign render uses independent twenty-bar pages and restores every retained reference',()=>{
  const f=fixture();
  f.run("const foreign={title:'other',measures:Array.from({length:45},()=>({beats:2,widths:[20,80]}))};const before=JSON.stringify(foreign)");
  const result=f.json('window.ddakungScoreRender.renderDocument(foreign,{page:2,width:1000})');
  assert.deepEqual([result.page,result.pages,result.totalMeasures],[2,3,45]);
  assert.deepEqual([...new Set(result.beats.map(b=>b.measure))],Array.from({length:20},(_,i)=>i+20));
  assert.equal(result.svg,'<svg></svg>');
  assert.deepEqual(f.json('[paintOptions.from,paintOptions.to,paintOptions.maxPerLine,paintOptions.readOnly]'),[20,40,4,true]);
  assert.equal(f.run('paintOptions.cache===slotXCache'),false);
  assert.equal(f.run('Object.entries(references).every(([key,value])=>eval(key)===value)'),true);
  assert.deepEqual(f.json('[ROW_MUL,_bwToken,MARK_Y.extra,MULTI_REST,bpm,headSize,showTempo,scoreStyle,INK]'),[7,88,3,true,155,'large',true,'jazz','#aaa']);
  assert.equal(f.run('JSON.stringify(foreign)===before'),true);
  assert.equal(f.run('window.ddakungScoreRender.renderDocument(foreign,{page:999}).page'),3);
});
test('failed engraving restores state and successful foreign geometry has disjoint rows',()=>{
  const f=fixture();f.run('throwPaint=true');
  assert.throws(()=>f.run('window.ddakungScoreRender.renderDocument({measures:[{}]})'),/engraving failed/);
  assert.equal(f.run('Object.entries(references).every(([key,value])=>eval(key)===value)'),true);
  assert.deepEqual(f.json('[ROW_MUL,_bwToken,MARK_Y.extra]'),[7,88,3]);
  f.run('throwPaint=false');
  const beats=f.json('window.ddakungScoreRender.renderDocument({measures:Array.from({length:12},()=>({}))}).beats');
  assert.ok(beats[0].y+beats[0].height<=beats[8].y);
});
test('read-only paint suppresses current selection, tap targets and edit line markers',()=>{
  assert.equal((notation.match(/o\.cache && !o\.readOnly && !oneRow/g)||[]).length,6);
  assert.match(notation,/dispatchEvent\(new CustomEvent\('ddakung-score-render'\)\)/);
});
