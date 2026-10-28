import './styles/score-regions.css';

type Beat={measure:number;beat:number};
type Box=Beat&{x:number;y:number;width:number;height:number};
type Result={ok:boolean;clip?:unknown;error?:string;reason?:string;changed?:boolean;count?:number;beats?:number};
declare global {interface Window {
  ddakungScoreRegions:{prepare(document:unknown):unknown;copyDocument(document:unknown,beats:Beat[]):Result;copyCurrent(beats:Beat[]):Result;inspectPaste(clip:unknown,target:Beat):Result;paste(clip:unknown,target:Beat):Result;deleteBeats(beats:Beat[]):Result};
  ddakungScoreRender:{currentGeometry():{width:number;height:number;beats:Box[]};renderDocument(document:unknown,options:{width:number;page:number}):Record<string,unknown>};
}}
const key=(b:Beat)=>`${b.measure}:${b.beat}`;
const compare=(a:Beat,b:Beat)=>a.measure-b.measure||a.beat-b.beat;
const errors:Record<string,string>={'time-overflow':'붙일 마디가 부족합니다. 마디를 추가하거나 앞쪽 위치를 선택하세요.','incompatible-beat-length':'원본과 대상의 박 길이가 다릅니다. 같은 박자 구간을 선택하세요.','incompatible-division':'대상 박에서 이 음표 분할을 표현할 수 없습니다.','invalid-selection':'악보가 변경되었습니다. 붙일 위치를 다시 선택하세요.','invalid-clip':'복사한 악보 데이터를 확인할 수 없습니다. 다시 복사하세요.','too-large':'파일 크기는 8MB 이하여야 합니다.'};

export function installScoreRegions(){
  const api=window.ddakungScoreRegions,renderer=window.ddakungScoreRender;
  if(!api||!renderer)throw new Error('Score region tools unavailable');
  const wrap=document.getElementById('scoreWrap')!,svg=document.getElementById('scoreSvg') as unknown as SVGSVGElement;
  wrap.tabIndex=0;wrap.setAttribute('aria-label','악보 선택 · 마디 선택 또는 박 선택 모드를 사용하세요');
  const undo=document.getElementById('undoBtn') as HTMLButtonElement;
  undo.className='btn ghost sm';undo.textContent='↶ 되돌리기';undo.title='되돌리기 (Ctrl+Z)';
  document.getElementById('setBtn')!.before(undo);
  const source=document.createElement('button');source.id='openScoreSource';source.type='button';source.className='btn ghost sm';source.textContent='다른 악보에서 복사';
  document.getElementById('loadBtn')!.after(source);
  const controls=document.createElement('div');controls.className='score-region-controls';
  controls.innerHTML='<div class="score-selection-modes" role="group" aria-label="악보 선택 방식"><button type="button" data-mode="measure" aria-pressed="true">마디 선택</button><button type="button" data-mode="beats" aria-pressed="false">박 선택</button></div><span role="status" aria-live="polite">마디 선택: 마디 전체 · 박 선택: 눌러 추가/해제</span><button type="button" data-copy disabled>복사</button><button type="button" data-paste disabled>붙여넣기</button><button type="button" data-delete disabled>선택 음표 삭제</button><button type="button" data-clear>선택 해제</button>';
  wrap.prepend(controls);
  const status=controls.querySelector('span')!,copy=controls.querySelector<HTMLButtonElement>('[data-copy]')!,paste=controls.querySelector<HTMLButtonElement>('[data-paste]')!,del=controls.querySelector<HTMLButtonElement>('[data-delete]')!;
  const clipStatus=document.createElement('small');clipStatus.className='score-clip-info';clipStatus.setAttribute('aria-live','polite');controls.append(clipStatus);
  controls.querySelectorAll('button').forEach(b=>b.className='btn ghost sm');
  let selected=new Map<string,Beat>(),clip:unknown=null,target:Beat|null=null;
  let clipBeats=0,newDestination=false;
  let selectionMode:'measure'|'beats'='beats';
  let inputMode:'measure'|'beats'='measure';
  controls.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(button=>{button.onclick=()=>{inputMode=button.dataset.mode as typeof inputMode;controls.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));message(inputMode==='beats'?'박을 누르면 추가/해제합니다. 복사 후 다음 선택은 새 붙일 위치입니다.':'마디를 누르면 마디 전체를 선택합니다.');};});
  let drag:{anchor:Beat;before:Map<string,Beat>;pointer:number;x:number;y:number;moved:boolean}|null=null;
  let touch:{pointer:number;x:number;y:number;beat:Box}|null=null;
  const list=()=>[...selected.values()].sort(compare);
  function message(value:string){status.textContent=value;}
  function resultMessage(r:Result,success:string){message(r.ok?success:`적용하지 않았습니다: ${errors[r.error||r.reason||'']||'선택 위치와 박 길이를 확인하세요.'}`);}
  function refresh(){
    svg.querySelector('[data-score-selection]')?.remove();
    const group=document.createElementNS('http://www.w3.org/2000/svg','g');group.dataset.scoreSelection='true';group.setAttribute('pointer-events','none');
    let boxes=renderer.currentGeometry().beats.filter(b=>selected.has(key(b)));
    if(selectionMode==='measure')boxes=[...new Set(boxes.map(b=>b.measure))].map(measure=>{const parts=boxes.filter(b=>b.measure===measure),first=parts[0],x=Math.min(...parts.map(b=>b.x));return{...first,x,width:Math.max(...parts.map(b=>b.x+b.width))-x};});
    for(const b of boxes){const rect=document.createElementNS(group.namespaceURI,'rect');for(const [k,v] of Object.entries({x:b.x,y:b.y,width:b.width,height:b.height}))rect.setAttribute(k,String(v));rect.setAttribute('class','score-beat-selected');group.append(rect);}
    svg.append(group);copy.disabled=del.disabled=!selected.size;
    target=list()[0]||null;
    paste.disabled=!clip||!target||!api.inspectPaste(clip,target).ok;
    paste.textContent=clipBeats?`${clipBeats}박 붙여넣기`:'붙여넣기';
    clipStatus.textContent=clipBeats?`복사 내용: ${clipBeats}박${target?` · 붙일 시작: ${target.measure+1}마디 ${target.beat+1}박`: ' · 붙일 위치를 선택하세요'}`:'';
  }
  function describe(){const beats=list();message(beats.length?selectionMode==='measure'?`${beats[0].measure+1}마디 전체 선택 · 박 선택 모드에서 해당 박부터 새로 선택`:`${beats.length}박 선택 · ${beats[0].measure+1}마디 ${beats[0].beat+1}박부터 · Delete로 음표 삭제`:'마디 선택: 마디 전체 · 박 선택: 눌러 추가/해제');refresh();}
  function at(event:PointerEvent):Box|undefined{const matrix=svg.getScreenCTM();if(!matrix)return;const p=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse());return renderer.currentGeometry().beats.find(b=>p.x>=b.x&&p.x<=b.x+b.width&&p.y>=b.y&&p.y<=b.y+b.height);}
  function allBeats():Beat[]{const document=window.maiWorkspace.snapshot() as unknown as {measures:{div:unknown[]}[]};return document.measures.flatMap((m,measure)=>Array.from({length:m.div.length},(_,beat)=>({measure,beat})));}
  function choose(event:PointerEvent,b:Box){
    if(newDestination){selected.clear();selectionMode='beats';newDestination=false;}
    event.preventDefault();event.stopImmediatePropagation();wrap.focus({preventScroll:true});target={measure:b.measure,beat:b.beat};
    if(event.ctrlKey||event.metaKey||inputMode==='beats'){if(selectionMode==='measure')selected.clear();selectionMode='beats';drag={anchor:target,before:new Map(selected),pointer:event.pointerId,x:event.clientX,y:event.clientY,moved:false};if(selected.has(key(b)))selected.delete(key(b));else selected.set(key(b),target);if(event.pointerType!=='touch')wrap.setPointerCapture(event.pointerId);else drag=null;}
    else{selectionMode='measure';selected=new Map(allBeats().filter(v=>v.measure===b.measure).map(v=>[key(v),v]));target={measure:b.measure,beat:0};window.maiWorkspace.selectEditorMeasure(b.measure);}
    describe();
  }
  wrap.addEventListener('pointerdown',event=>{
    if(event.button!==0)return;const b=at(event);if(!b)return;
    if(event.pointerType==='touch'){touch={pointer:event.pointerId,x:event.clientX,y:event.clientY,beat:b};event.stopImmediatePropagation();return;}
    choose(event,b);
  },true);
  wrap.addEventListener('pointermove',event=>{if(touch&&event.pointerId===touch.pointer&&Math.hypot(event.clientX-touch.x,event.clientY-touch.y)>8)touch=null;if(!drag||event.pointerId!==drag.pointer)return;const b=at(event);if(!b)return;if(Math.hypot(event.clientX-drag.x,event.clientY-drag.y)>5)drag.moved=true;if(!drag.moved)return;const [a,z]=[drag.anchor,b].sort(compare);selected=new Map(drag.before);for(const v of allBeats())if(compare(v,a)>=0&&compare(v,z)<=0)selected.set(key(v),v);describe();});
  wrap.addEventListener('pointerup',event=>{if(touch&&event.pointerId===touch.pointer){const pending=touch;touch=null;if(Math.hypot(event.clientX-pending.x,event.clientY-pending.y)<=8)choose(event,pending.beat);}drag=null;});
  const finish=()=>{drag=null;touch=null;};wrap.addEventListener('pointercancel',finish);wrap.addEventListener('lostpointercapture',finish);
  function doCopy(){const r=api.copyCurrent(list());if(r.ok){clip=r.clip;clipBeats=r.beats||0;newDestination=true;message(`${clipBeats}박 복사됨 · 붙일 마디 또는 박을 선택하세요.`);}else resultMessage(r,'');refresh();}
  function doPaste(){
    target=list()[0]||null;if(!clip||!target)return;
    const start={...target},r=api.paste(clip,start);
    if(r.ok){
      const all=allBeats(),offset=all.findIndex(b=>key(b)===key(start)),applied=all.slice(offset,offset+(r.beats||clipBeats));
      selected=new Map(applied.map(b=>[key(b),b]));newDestination=true;
      const end=applied.at(-1)||start;
      message(`${r.beats||clipBeats}박 붙여넣기 완료 · ${start.measure+1}마디 ${start.beat+1}박 → ${end.measure+1}마디 ${end.beat+1}박 · Ctrl+Z로 복구`);
    }else resultMessage(r,'');refresh();
  }
  function doDelete(){if(!selected.size)return;const r=api.deleteBeats(list());resultMessage(r,'선택한 박의 음표를 삭제했습니다. 오른쪽 위 되돌리기로 복구할 수 있어요.');refresh();}
  copy.onclick=doCopy;paste.onclick=doPaste;del.onclick=doDelete;controls.querySelector<HTMLButtonElement>('[data-clear]')!.onclick=()=>{selected.clear();target=null;describe();};
  document.addEventListener('keydown',event=>{
    const el=event.target as HTMLElement;if(el.closest('input,textarea,select,[contenteditable="true"]'))return;
    if(!wrap.contains(el)&&!controls.contains(el))return;
    if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();event.stopImmediatePropagation();doDelete();}
    else if((event.ctrlKey||event.metaKey)&&['c','v'].includes(event.key.toLowerCase())){event.preventDefault();event.stopImmediatePropagation();event.key.toLowerCase()==='c'?doCopy():doPaste();}
    else if(event.key==='Escape'){selected.clear();target=null;describe();}
  },true);
  window.addEventListener('ddakung-score-render',refresh);
  window.addEventListener('mai-velocity-refresh',()=>{const valid=new Set(allBeats().map(key));for(const k of selected.keys())if(!valid.has(k))selected.delete(k);refresh();});
  let closeSource:(()=>void)|null=null;
  source.onclick=()=>{
    if(closeSource)return;
    const id=crypto.randomUUID(),channel=new BroadcastChannel(`ddakung-score-source:${id}`);
    const overlay=window.document.createElement('section');overlay.className='score-source-overlay';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','다른 악보에서 복사');
    const back=window.document.createElement('button');back.type='button';back.className='btn score-source-back';back.textContent='← 작업 악보로 돌아가기';
    const frame=window.document.createElement('iframe');frame.title='읽기 전용 원본 악보';
    let document:unknown=null,title='',page=1,width=1000;
    const previousOverflow=window.document.body.style.overflow;
    const background=[...window.document.body.children].filter((node):node is HTMLElement=>node instanceof HTMLElement&&node!==overlay&&!['SCRIPT','STYLE','LINK'].includes(node.tagName)).map(node=>({node,inert:node.inert}));
    const keepFocus=(event:FocusEvent)=>{if(closeSource&&event.target instanceof Node&&!overlay.contains(event.target))back.focus();};
    closeSource=()=>{document=null;channel.onmessage=null;channel.close();window.document.removeEventListener('focusin',keepFocus);overlay.remove();for(const item of background)item.node.inert=item.inert;window.document.body.style.overflow=previousOverflow;closeSource=null;source.focus();};
    back.onclick=()=>closeSource?.();overlay.append(back,frame);window.document.body.append(overlay);window.document.body.style.overflow='hidden';
    for(const item of background)item.node.inert=true;window.document.addEventListener('focusin',keepFocus);
    overlay.addEventListener('keydown',event=>{if(event.key==='Tab'&&event.shiftKey&&window.document.activeElement===back){event.preventDefault();frame.focus();}});
    overlay.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();closeSource?.();}});
    const render=()=>{if(!document)return;try{channel.postMessage({type:'render',...renderer.renderDocument(document,{width,page}),title});}catch(error){channel.postMessage({type:'error',error:String(error)});}};
    channel.onmessage=event=>{const m=event.data;if(!m||typeof m!=='object')return;
      try{
        if(m.type==='ready'){channel.postMessage({type:'connected'});}
        else if(m.type==='document'){document=null;document=api.prepare(m.document);title=String(m.name||'가져온 악보');page=1;width=Math.max(400,Math.min(6000,Number(m.width)||1000));render();}
        else if(m.type==='render-request'){page=Math.max(1,Math.trunc(Number(m.page)||1));width=Math.max(400,Math.min(6000,Number(m.width)||1000));render();}
        else if(m.type==='copy'&&document){const r=api.copyDocument(document,m.beats);if(r.ok){clip=r.clip;clipBeats=r.beats||0;selected.clear();target=null;newDestination=true;refresh();message(`다른 악보에서 ${clipBeats}박 복사됨 · 붙일 마디나 박을 선택하세요.`);}channel.postMessage({type:'copied',count:r.beats||0,error:r.ok?undefined:r.error||r.reason});}
        else if(m.type==='back'){closeSource?.();}
      }catch(error){channel.postMessage({type:'error',error:String(error)});}
    };
    frame.src=`./score-source.html?source=${id}&embedded=1`;back.focus();
  };
  refresh();
}
