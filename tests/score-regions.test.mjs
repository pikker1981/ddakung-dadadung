import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
const domain=await readFile(new URL('../src/legacy/01-domain-and-language.js',import.meta.url),'utf8');
const persistence=await readFile(new URL('../src/legacy/06-persistence-and-import.js',import.meta.url),'utf8');
const contract=await readFile(new URL('../src/legacy/import-contract.js',import.meta.url),'utf8');
const regions=await readFile(new URL('../src/legacy/score-regions.js',import.meta.url),'utf8');
function fn(source,name){
  const start=source.indexOf('function '+name+'(');assert.ok(start>=0,name);
  let at=source.indexOf('{',start),end=at+1,depth=1;
  for(;depth&&end<source.length;end++){if(source[end]==='{')depth++;if(source[end]==='}')depth--;}
  return source.slice(start,end);
}
function fixture(){
  const c=vm.createContext({window:{ddakungAudio:{stopPreview(){vm.runInContext('previews++',c);}}}});
  const names=['pruneVelocity','divParts','divCells','cellFrac','defaultGroups','tsOf','groupsOf','beatQ','compoundBeat','mergedBeat','divsFor','defaultDivFor','beatCount','divOf','beatOffset','voiceLen','artFor','emptyMeasure','metaClean','commit','undo','redo'];
  vm.runInContext(domain.slice(domain.indexOf('const CATALOG ='),domain.indexOf('const CAT_BY_ID ='))+
    domain.slice(domain.indexOf('const ART ='),domain.indexOf('/* ================= 박 나누기'))+`
    const VK={hand:'h',foot:'f'},DIV_UI=[2,3,4,5,6,7,8],DIV_MIX_UI=[23,32,13,31,24,42,33],DIV_MIX={23:[2,3],32:[3,2],13:[1,3],31:[3,1],24:[2,4],42:[4,2],33:[3,3]},BEATS=4,TS_NUM_MAX=16,TS_DEN_OK=[4,8],SONG_TS=[4,4],SONG_GRP=null;
    const DYN_OK=['mf'],HP_OK=['<','>'],NAV_OK=[],INK_COLORS={red:1},META_KEYS=['artist'],bpmRange={min:40,max:220};
    let INSTR=[],byId=Object.fromEntries(CATALOG.map(i=>[i.id,i]));
    let measures=[],histPast=[],histFuture=[],_cur=null,playing=false,PLAY_PENDING=false,stops=0,previews=0,refreshes=0;const HIST_MAX=80;
    function snapshot(){return JSON.stringify(measures)}function applySnapshot(s){measures=JSON.parse(s)}
    function refreshUndoBtns(){}function autosaveSoon(){}function refreshAll(){refreshes++}
    function stopPlay(){stops++;playing=false;PLAY_PENDING=false}
    function blank(h=4,f=4,ts=[4,4],grp){return emptyMeasure(Array.from({length:16},()=>({h,f})),ts,grp)}
    `+names.map(n=>fn(domain,n)).join('\n')+fn(persistence,'normDiv')+fn(persistence,'normalizeMeasures')+
    fn(persistence,'prepareScoreDocument')+contract+`measures=[blank(),blank(),blank()];commit();`+regions,c);
  return {api:c.window.ddakungScoreRegions,run:s=>vm.runInContext(s,c),json:s=>JSON.parse(vm.runInContext('JSON.stringify('+s+')',c))};
}
const at=(measure,beat)=>({measure,beat});
const json=x=>JSON.parse(JSON.stringify(x));

test('noncontiguous selection sorts/deduplicates all catalog rows and snapshots attachments independently',()=>{
  const f=fixture();f.run(`measures[0].ride[0]=16;measures[0].snare[8]=3;measures[0].snare[9]=1;
    measures[0].vel={snare:Array(16).fill(0)};measures[0].vel.snare[8]=101;
    measures[0].orn={snare:Array(16).fill(0)};measures[0].orn.snare[8]=3;
    measures[0].ornIns={snare:Array(16).fill(0)};measures[0].ornIns.snare[8]='tom1';
    measures[0].tie={snare:Array(16).fill(0)};measures[0].tie.snare[8]=1;measures[0].tie.snare[9]=1;
    measures[0].stick=Array(16).fill(0);measures[0].stick[8]=2`);
  const result=f.api.copyCurrent([at(0,2),at(0,0),at(0,2)]);assert.equal(result.beats,2);
  assert.equal(result.clip.beats[0].rows.ride[0].value,16);
  assert.deepEqual(json(result.clip.beats[1].rows.snare[0]),{value:3,vel:101,orn:3,ornIns:'tom1',tie:0});
  assert.equal(result.clip.beats[1].rows.snare[1].tie,1);
  f.run('measures[0].snare[8]=0');assert.equal(result.clip.beats[1].rows.snare[0].value,3);
});

test('cross-bar paste replaces only destination beat grids, retains surrounding notes/metadata and undoes once',()=>{
  const f=fixture();f.run(`measures[0]=blank(3,6);measures[0].snare[0]=3;measures[0].ride[1]=16;measures[0].kick[5]=1;
    measures[1].snare[0]=2;measures[1].snare[12]=1;measures[2].snare[4]=6;
    measures[1].text='keep';measures[1].memo=[{k:'t',t:'keep',x:0,y:0}];measures[1].sec='A';commit();histPast=[];playing=true;PLAY_PENDING=true;`);
  const clip=f.api.copyCurrent([at(0,0),at(0,1)]).clip,before=f.json('measures');
  assert.equal(f.api.inspectPaste(clip,at(1,3)).ok,true);assert.deepEqual(f.json('measures'),before);
  assert.equal(f.api.paste(clip,at(1,3)).changed,true);
  assert.deepEqual(f.json('measures[1].div'),[{h:4,f:4},{h:4,f:4},{h:4,f:4},{h:3,f:6}]);
  assert.equal(f.run('measures[1].snare[0]'),2);assert.equal(f.run('measures[1].snare[12]'),3);
  assert.equal(f.run('measures[2].snare[3]'),6);assert.equal(f.run('measures[1].memo[0].t'),'keep');
  assert.equal(f.run('measures[1].sec'),'A');assert.equal(f.run('histPast.length'),1);
  assert.equal(f.run('stops+previews+refreshes'),3);
  f.run('undo()');assert.deepEqual(f.json('measures'),before);
});

test('invalid clips, insufficient duration and incompatible beat lengths reject atomically',()=>{
  const f=fixture(),clip=json(f.api.copyCurrent([at(0,0),at(0,1)]).clip),before=f.json('measures');
  assert.equal(f.api.paste(clip,at(2,3)).reason,'time-overflow');
  f.run('measures[1]=blank(3,3,[6,8])');
  assert.equal(f.api.paste(clip,at(1,0)).reason,'incompatible-beat-length');
  for(const alter of [x=>x.beats[0].rows.snare[0].vel=128,x=>x.beats[0].h=999,x=>x.beats[0].rows.snare[0].value='1',x=>x.beats[0].rows.snare.pop(),x=>x.beats[0].stick[0]=3]){
    const bad=json(clip);alter(bad);assert.equal(f.api.paste(bad,at(0,0)).ok,false);
  }
  assert.equal(f.run('histPast.length+stops+previews+refreshes'),0);
  assert.deepEqual(f.json('measures[0]'),before[0]);
});

test('deletion clears selected notes and attachments without shortening bars, clears dependent ties and is one undo',()=>{
  const f=fixture();f.run(`measures[0].snare[0]=1;measures[0].snare[4]=1;measures[0].snare[8]=1;
    measures[0].tie={snare:Array(16).fill(0)};measures[0].tie.snare[4]=1;measures[0].tie.snare[8]=1;
    measures[0].vel={snare:Array(16).fill(0)};measures[0].vel.snare[4]=90;
    measures[0].stick=Array(16).fill(0);measures[0].stick[4]=1;measures[0].text='keep';commit();histPast=[];`);
  const before=f.json('measures');assert.equal(f.api.deleteBeats([at(0,1)]).changed,true);
  assert.equal(f.run('measures[0].snare[4]+measures[0].vel.snare[4]+measures[0].stick[4]'),0);
  assert.equal(f.run('measures[0].tie.snare[8]'),0);assert.equal(f.run('measures[0].snare.length'),16);
  assert.equal(f.run('measures.length'),3);assert.equal(f.run('measures[0].text'),'keep');
  assert.equal(f.api.deleteBeats([at(0,1)]).changed,false);assert.equal(f.run('histPast.length'),1);
  f.run('undo()');assert.deepEqual(f.json('measures'),before);
});

test('prepare/copy external document normalizes purely without current-song, roster or history changes',()=>{
  const f=fixture(),before=f.json('measures');
  const doc={title:'External',measures:[{snare:[true],ride:[16],ts:[4,4]}]};
  const prepared=f.api.prepare(doc);assert.equal(prepared.measures[0].snare[0],1);
  prepared.measures[0].snare[0]=3;assert.equal(doc.measures[0].snare[0],true);
  const result=f.api.copyDocument(doc,[at(0,0)]);assert.equal(result.ok,true);
  assert.equal(result.clip.beats[0].rows.ride[0].value,16);
  assert.deepEqual(f.json('measures'),before);assert.equal(f.run('histPast.length+INSTR.length'),0);
  assert.equal(f.api.copyDocument({measures:[]},[at(0,0)]).ok,false);
});

test('unchanged paste preserves valid outgoing ties and creates no history; untrusted incoming tie cannot borrow a destination onset',()=>{
  const f=fixture();f.run(`measures[0].snare[0]=1;measures[0].snare[4]=1;
    measures[0].tie={snare:Array(16).fill(0)};measures[0].tie.snare[4]=1;commit();histPast=[]`);
  const clip=f.api.copyCurrent([at(0,0)]).clip;
  assert.equal(f.api.paste(clip,at(0,0)).changed,false);
  assert.equal(f.run('measures[0].tie.snare[4]'),1);assert.equal(f.run('histPast.length'),0);
  clip.beats[0].rows.snare[0].tie=1;
  assert.equal(f.api.paste(clip,at(0,2)).ok,true);
  assert.equal(f.run('measures[0].tie.snare[8]'),0);
});
