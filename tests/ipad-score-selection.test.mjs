import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
const source = await readFile(new URL('../src/score-region-ui.ts', import.meta.url), 'utf8');
class Element {
  constructor(tag='div') { this.tag=tag; this.tagName=tag.toUpperCase();this.classList={add(){}};this.inert=false;this.children=[]; this.dataset={}; this.style={}; this.attrs={}; this.listeners={}; this.disabled=false; }
  set innerHTML(value) {
    this.children=[];
    for(const match of value.matchAll(/<(button|span)\b([^>]*)>/g)) {
      const child=new Element(match[1]);
      for(const a of match[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g)) {
        child.attrs[a[1]]=a[2]??'';
        if(a[1].startsWith('data-')) child.dataset[a[1].slice(5)]=a[2]??'';
        if(a[1]==='disabled')child.disabled=true;
      }
      this.append(child);
    }
  }
  querySelectorAll(selector) { const found=[]; const visit=node=>{for(const c of node.children){if(selector==='button'?c.tag==='button':selector==='span'?c.tag==='span':selector.startsWith('[')&&Object.hasOwn(c.attrs,selector.slice(1,-1)))found.push(c);visit(c);}};visit(this);return found; }
  querySelector(s) {return this.querySelectorAll(s)[0]??null;}
  append(...items) {for(const item of items){this.children.push(item);item.parent=this;}}
  prepend(item) {this.children.unshift(item);item.parent=this;}
  before(){} after(item){this.next=item;} focus(){} setPointerCapture(){} contains(el){return el===this||this.children.some(c=>c.contains(el));}
  setAttribute(k,v){this.attrs[k]=v;}
  addEventListener(k,fn){(this.listeners[k]??=[]).push(fn);}
  removeEventListener(k,fn){this.listeners[k]=(this.listeners[k]??[]).filter(f=>f!==fn);}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(c=>c!==this);}
  emit(k,event){for(const f of this.listeners[k]??[])f(event);}
}
function fixture() {
  const ids=new Map(['scoreWrap','scoreSvg','undoBtn','setBtn','loadBtn'].map(id=>[id,new Element(id)]));
  const body=new Element('body');body.style.overflow='auto';
  const background=new Element('main'),alreadyInert=new Element('aside');alreadyInert.inert=true;body.append(background,alreadyInert);
  const document=Object.assign(new Element('document'),{body,getElementById:id=>ids.get(id),createElement:tag=>new Element(tag),createElementNS:(ns,tag)=>{const el=new Element(tag);el.namespaceURI=ns;return el;}});
  let lastCopy,lastPaste;
  const geometry=Array.from({length:8},(_,i)=>({measure:Math.floor(i/4),beat:i%4,x:i*100,y:0,width:99,height:100}));
  const channels=[];
  class Channel{constructor(){channels.push(this);}postMessage(message){this.sent??=[];this.sent.push(message);}close(){this.closed=true;}}
  const api={copyCurrent(beats){lastCopy=structuredClone(beats);return{ok:true,clip:{saved:'all metadata'},beats:beats.length};},copyDocument(doc,beats){return this.copyCurrent(beats);},prepare:doc=>doc,inspectPaste:()=>({ok:true}),paste(clip,target){lastPaste={clip,target};return {ok:true,beats:2};},deleteBeats:()=>({ok:true})};
  const window={document,ddakungScoreRegions:api,ddakungScoreRender:{currentGeometry:()=>({beats:geometry}),renderDocument:()=>({svg:'',beats:geometry})},maiWorkspace:{snapshot:()=>({measures:[{div:[1,1,1,1]},{div:[1,1,1,1]}]}),selectEditorMeasure(){}},addEventListener(){}};
  ids.get('scoreSvg').getScreenCTM=()=>({inverse:()=>({})});
  const context=vm.createContext({window,document,HTMLElement:Element,Node:Element,crypto:{randomUUID:()=> '00000000-0000-0000-0000-000000000000'},BroadcastChannel:Channel,DOMPoint:class{constructor(x,y){this.x=x;this.y=y;}matrixTransform(){return this;}}});
  const compiled=ts.transpileModule(source.replace("import './styles/score-regions.css';",'').replace('export function','function'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
  vm.runInContext(compiled+'\ninstallScoreRegions();',context);
  const wrap=ids.get('scoreWrap'), controls=wrap.children[0];
  const pointer=(type,index,options={})=>wrap.emit(type,{button:0,clientX:index*100+50,clientY:50,ctrlKey:false,metaKey:false,pointerType:'touch',pointerId:1,preventDefault(){},stopImmediatePropagation(){},...options});
  const tap=(index,ctrlKey=false)=>{pointer('pointerdown',index,{ctrlKey});pointer('pointerup',index,{ctrlKey});};
  return{tap,pointer,controls,body,background,alreadyInert,channels,copy:()=>lastCopy,paste:()=>lastPaste,button:s=>controls.querySelector(s),openSource:()=>ids.get('loadBtn').next.onclick()};
}
test('touch beat mode clears a whole measure, toggles noncontiguous beats, and anchors paste at first selected beat',()=>{
  const f=fixture();f.tap(0);f.button('[data-copy]').onclick();assert.equal(f.copy().length,4);
  f.button('[data-mode]').parent.children.find(b=>b.dataset.mode==='beats').onclick();
  f.tap(6);f.tap(4);f.button('[data-copy]').onclick();assert.deepEqual(f.copy(),[{measure:1,beat:0},{measure:1,beat:2}]);
  f.tap(3);f.tap(1);f.button('[data-paste]').onclick();assert.equal(f.paste().target.beat,1);assert.equal(f.paste().target.measure,0);assert.equal(f.paste().clip.saved,'all metadata');
  f.tap(7);f.button('[data-copy]').onclick();assert.deepEqual(f.copy(),[{measure:1,beat:3}]);
});
test('Ctrl beat selection still clears measure then toggles a beat',()=>{
  const f=fixture();f.tap(0);f.tap(2,true);f.tap(3,true);f.tap(2,true);f.button('[data-copy]').onclick();assert.deepEqual(f.copy(),[{measure:0,beat:3}]);
});

test('reference iframe closes its own channel and preserves copied parent clipboard for paste',()=>{
  const f=fixture();f.openSource();assert.equal(f.body.style.overflow,'hidden');
  assert.equal(f.background.inert,true);assert.equal(f.alreadyInert.inert,true);const overlay=f.body.children.at(-1);assert.equal(overlay.attrs.role,'dialog');assert.match(overlay.children[1].src,/score-source.html/);
  f.openSource();assert.equal(f.channels.length,1);
  const channel=f.channels[0];channel.onmessage({data:{type:'document',document:{measures:[]},name:'reference.json'}});
  channel.onmessage({data:{type:'copy',beats:[{measure:0,beat:0},{measure:0,beat:2}]}});
  assert.equal(channel.sent.at(-1).count,2);
  channel.onmessage({data:{type:'back'}});assert.equal(channel.closed,true);assert.equal(f.body.children.length,2);assert.equal(f.background.inert,false);assert.equal(f.alreadyInert.inert,true);assert.equal(f.body.style.overflow,'auto');
  f.tap(4,true);f.button('[data-paste]').onclick();assert.equal(f.paste().clip.saved,'all metadata');assert.equal(f.paste().target.measure,1);
  f.openSource();assert.equal(f.channels.length,2);
});
test('touch commits only on tap release and cancelled or moved scroll gestures preserve selection',()=>{
 const f=fixture();f.button('[data-mode]').parent.children.find(b=>b.dataset.mode==='beats').onclick();
 f.pointer('pointerdown',1);assert.equal(f.button('[data-copy]').disabled,true);f.pointer('pointerup',1);assert.equal(f.button('[data-copy]').disabled,false);
 f.pointer('pointerdown',5);f.pointer('pointercancel',5);f.pointer('pointerup',5);
 f.pointer('pointerdown',6);f.pointer('pointermove',6,{clientY:75});f.pointer('pointerup',6);
 f.pointer('pointerdown',7);f.pointer('pointerup',7,{clientY:75});
 f.button('[data-copy]').onclick();assert.deepEqual(f.copy(),[{measure:0,beat:1}]);
 f.pointer('pointerdown',0);f.pointer('pointercancel',0);f.tap(4);f.button('[data-copy]').onclick();assert.deepEqual(f.copy(),[{measure:1,beat:0}]);
});
function sourceFixture(){
 const names=['source-score','source-scroll','source-status','source-copy','source-prev','source-next','source-file','source-back','source-selection','source-empty','source-title','source-page'];
 const ids=new Map(names.map(name=>[name,new Element(name)]));
 const document=Object.assign(new Element('document'),{getElementById:id=>ids.get(id),createElement:tag=>new Element(tag),createElementNS:(ns,tag)=>{const el=new Element(tag);el.namespaceURI=ns;return el;}});
 const modes=['measure','beats'].map(mode=>{const b=new Element('button');b.dataset.sourceMode=mode;b.attrs['data-source-mode']=mode;document.append(b);return b;});
 const score=ids.get('source-score');score.getBoundingClientRect=()=>({left:0,top:0,width:800,height:100});ids.get('source-scroll').clientWidth=834;
 const sent=[];let channel;
 class Channel extends Element{constructor(){super();channel=this;}postMessage(m){sent.push(structuredClone(m));}close(){}}
 const context=vm.createContext({document,window:{addEventListener(){}},location:{search:'?source=00000000-0000-0000-0000-000000000000'},URLSearchParams,BroadcastChannel:Channel,ResizeObserver:class{observe(){}},setTimeout(){return 1;},clearTimeout(){}});
 return readFile(new URL('../src/score-source.ts',import.meta.url),'utf8').then(text=>{
   vm.runInContext(ts.transpileModule(text.replace("import './score-source.css';",''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText,context);
   const beats=Array.from({length:8},(_,i)=>({measure:Math.floor(i/4),beat:i%4,x:i*100,y:0,width:99,height:100}));
   channel.emit('message',{data:{type:'render',svg:'',width:800,height:100,beats,totalMeasures:2,page:1,pages:1}});
   const pointer=(type,index,options={})=>score.emit(type,{button:0,clientX:index*100+50,clientY:50,ctrlKey:false,metaKey:false,pointerType:'touch',pointerId:1,preventDefault(){},...options});
   return{pointer,mode:m=>modes.find(b=>b.dataset.sourceMode===m).onclick(),copy:()=>ids.get('source-copy').emit('click',{}),sent};
 });
}
test('reference touch taps commit on release while pointercancel and moved scroll preserve reference selection',async()=>{
 const f=await sourceFixture();f.mode('beats');
 f.pointer('pointerdown',1);f.copy();assert.equal(f.sent.filter(m=>m.type==='copy').length,0);f.pointer('pointerup',1);
 f.pointer('pointerdown',5);f.pointer('pointercancel',5);f.pointer('pointerup',5);
 f.pointer('pointerdown',6);f.pointer('pointermove',6,{clientY:75});f.pointer('pointerup',6);
 f.pointer('pointerdown',7);f.pointer('pointerup',7,{clientY:75});
 f.copy();assert.deepEqual(f.sent.at(-1).beats,[{measure:0,beat:1}]);
 f.pointer('pointerdown',3);f.pointer('pointerup',3);f.copy();assert.deepEqual(f.sent.at(-1).beats,[{measure:0,beat:1},{measure:0,beat:3}]);
});
test('mouse Ctrl drag still selects a continuous range immediately',()=>{
 const f=fixture();f.pointer('pointerdown',1,{pointerType:'mouse',ctrlKey:true});assert.equal(f.button('[data-copy]').disabled,false);
 f.pointer('pointermove',3,{pointerType:'mouse',ctrlKey:true});f.pointer('pointerup',3,{pointerType:'mouse',ctrlKey:true});
 f.button('[data-copy]').onclick();assert.deepEqual(f.copy(),[{measure:0,beat:1},{measure:0,beat:2},{measure:0,beat:3}]);
});
