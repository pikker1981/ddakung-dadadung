import {classifyPencilStroke,dedupePencilCandidates,makePencilEnvelope,type PencilCoreCandidate} from './pencil-hybrid-core';
import type {PencilCandidate} from './domain';
import './styles/pencil-hybrid.css';

declare global {
  interface Window {
    webkit?: {messageHandlers?: {pencil?: {postMessage(message:unknown):void}}};
  }
}

type Candidate=PencilCandidate & {id:string; articulation:string; confidence:number; source:string};
const INSTRUMENTS={hihat:'하이햇',snare:'스네어',kick:'킥'} as const;
const ARTICULATIONS={normal:'기본',ghost:'고스트',accent:'액센트'} as const;
const q=<T extends HTMLElement>(root:ParentNode,selector:string)=>root.querySelector<T>(selector)!;

function hasNativePencilBridge(){return !!window.webkit?.messageHandlers?.pencil;}

export function installPencilHybrid(){
  if(document.getElementById('pencilHybridButton'))return;
  const trigger=document.createElement('button');
  trigger.id='pencilHybridButton';trigger.type='button';trigger.className='btn ghost sm';
  trigger.textContent='펜 리듬 입력';trigger.setAttribute('aria-haspopup','dialog');
  (document.getElementById('loadBtn')||document.querySelector('.fileacts'))?.after(trigger);
  const dialog=document.createElement('dialog');dialog.id='pencilHybridDialog';dialog.className='pencil-hybrid-dialog';
  dialog.innerHTML=`<form method="dialog" class="pencil-hybrid-card">
    <header><div><span class="pencil-eyebrow">PENCIL HYBRID · C안</span><h2>펜으로 리듬 입력</h2></div><button type="button" data-close aria-label="닫기">×</button></header>
    <p class="pencil-intro">선택한 마디 안에서 하이햇·스네어·킥 레인을 따라 그리면 음표 후보를 만듭니다. 후보를 확인한 뒤 악보에 적용하세요.</p>
    <p class="pencil-status" data-status role="status" aria-live="polite"></p>
    <div class="pencil-canvas-wrap"><canvas data-canvas aria-label="펜 리듬 입력 캔버스"></canvas><div class="pencil-lane-labels" aria-hidden="true"><span>하이햇</span><span>스네어</span><span>킥</span></div></div>
    <div class="pencil-actions"><button type="button" data-native class="ghost">네이티브 PencilKit 열기</button><button type="button" data-clear class="ghost">획 지우기</button></div>
    <section class="pencil-candidates" aria-labelledby="pencilCandidatesTitle"><h3 id="pencilCandidatesTitle">확인할 후보 <span data-count>0</span></h3><div data-list class="pencil-list"><p class="pencil-empty">아직 후보가 없습니다.</p></div></section>
    <footer><button type="button" data-cancel class="ghost">취소</button><button type="button" data-apply class="primary" disabled>악보에 적용</button></footer>
  </form>`;
  document.body.append(dialog);
  const canvas=q<HTMLCanvasElement>(dialog,'[data-canvas]'),ctx=canvas.getContext('2d')!;
  const status=q(dialog,'[data-status]'),list=q(dialog,'[data-list]'),count=q(dialog,'[data-count]');
  let candidates:Candidate[]=[];let measure=0;let stepCount=16;let drawing:{id:number;points:{x:number;y:number}[]}|null=null;
  const lanes=['hihat','snare','kick'];
  const setStatus=(message:string)=>{status.textContent=message;};
  const snapshot=()=>window.maiWorkspace.snapshot();
  const currentMeasure=()=>window.maiWorkspace.editorView().selected;
  const resetCanvas=()=>{const rect=canvas.getBoundingClientRect();const dpr=Math.max(1,window.devicePixelRatio||1);canvas.width=Math.max(1,Math.round(rect.width*dpr));canvas.height=Math.max(1,Math.round(rect.height*dpr));ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,rect.width,rect.height);ctx.strokeStyle='#6a6454';ctx.lineWidth=1;for(let i=1;i<3;i++){const y=rect.height*i/3;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(rect.width,y);ctx.stroke();}for(let i=1;i<stepCount;i++){const x=rect.width*i/stepCount;ctx.strokeStyle=i%4===0?'#8b6b45':'#3f3b32';ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,rect.height);ctx.stroke();}drawCandidates();};
  const drawCandidates=()=>{const rect=canvas.getBoundingClientRect();for(const c of candidates){const lane=lanes.indexOf(c.instrument);if(lane<0)continue;const x=(c.step+0.5)*rect.width/stepCount,y=(lane+0.5)*rect.height/3;ctx.fillStyle=c.articulation==='ghost'?'#c78147':'#ed670f';ctx.beginPath();ctx.arc(x,y,7,0,Math.PI*2);ctx.fill();}};
  const renderCandidates=()=>{list.replaceChildren();count.textContent=String(candidates.length);q<HTMLButtonElement>(dialog,'[data-apply]').disabled=candidates.length===0;if(candidates.length===0){const empty=document.createElement('p');empty.className='pencil-empty';empty.textContent='아직 후보가 없습니다.';list.append(empty);resetCanvas();return;}candidates.forEach((candidate,index)=>{const row=document.createElement('div');row.className='pencil-candidate';const ins=document.createElement('select');ins.setAttribute('aria-label',`${index+1}번째 후보 악기`);for(const [value,label] of Object.entries(INSTRUMENTS)){const o=new Option(label,value,candidate.instrument===value,candidate.instrument===value);ins.append(o);}ins.addEventListener('change',()=>{candidate.instrument=ins.value;resetCanvas();});const step=document.createElement('input');step.type='number';step.min='1';step.max=String(stepCount);step.value=String(candidate.step+1);step.setAttribute('aria-label',`${index+1}번째 후보 위치`);step.addEventListener('change',()=>{candidate.step=Math.max(0,Math.min(stepCount-1,step.valueAsNumber-1));step.value=String(candidate.step+1);resetCanvas();});const art=document.createElement('select');art.setAttribute('aria-label',`${index+1}번째 후보 주법`);for(const [value,label] of Object.entries(ARTICULATIONS)){const o=new Option(label,value,candidate.articulation===value,candidate.articulation===value);art.append(o);}art.addEventListener('change',()=>{candidate.articulation=art.value;resetCanvas();});const remove=document.createElement('button');remove.type='button';remove.className='ghost';remove.textContent='삭제';remove.addEventListener('click',()=>{candidates.splice(index,1);renderCandidates();});row.append(ins,step,art,remove);list.append(row);});resetCanvas();};
  const resize=()=>{if(dialog.open)resetCanvas();};window.addEventListener('resize',resize);
  const pointFromEvent=(event:PointerEvent)=>{const r=canvas.getBoundingClientRect();return{x:Math.max(0,Math.min(r.width,event.clientX-r.left)),y:Math.max(0,Math.min(r.height,event.clientY-r.top))};};
  const collect=(event:PointerEvent)=>{const events=typeof event.getCoalescedEvents==='function'?event.getCoalescedEvents():[event];for(const item of events)drawing?.points.push(pointFromEvent(item));};
  canvas.addEventListener('pointerdown',event=>{if(event.pointerType==='touch')return;event.preventDefault();canvas.setPointerCapture(event.pointerId);drawing={id:event.pointerId,points:[pointFromEvent(event)]};});
  canvas.addEventListener('pointermove',event=>{if(!drawing||drawing.id!==event.pointerId)return;event.preventDefault();collect(event);});
  const finish=(event:PointerEvent)=>{if(!drawing||drawing.id!==event.pointerId)return;collect(event);const current=drawing;drawing=null;const rect=canvas.getBoundingClientRect();const laneHeight=rect.height/3;const result=classifyPencilStroke({points:current.points,width:rect.width,height:rect.height,stepCount,lanes:lanes.map((instrument,index)=>({instrument,top:index/3,bottom:(index+1)/3}))});for(const item of result)candidates.push({...item,measure,id:`${Date.now()}-${Math.random().toString(36).slice(2)}`});candidates=dedupePencilCandidates(candidates) as Candidate[];renderCandidates();setStatus(result.length?`${result.length}개 후보를 만들었습니다. 위치와 주법을 확인하세요.`:'레인 안에서 다시 그려 주세요.');};
  canvas.addEventListener('pointerup',finish);canvas.addEventListener('pointercancel',event=>{if(drawing?.id===event.pointerId)drawing=null;setStatus('입력이 취소되었습니다. 다시 그려 주세요.');});
  const open=()=>{const doc=snapshot();measure=currentMeasure();const m=doc.measures[measure]||{};stepCount=Math.max(1,Math.max((m.hihat as unknown[]|undefined)?.length||0,(m.snare as unknown[]|undefined)?.length||0,(m.kick as unknown[]|undefined)?.length||0,16));candidates=[];renderCandidates();dialog.showModal();requestAnimationFrame(resetCanvas);setStatus(`현재 ${measure+1}마디 · ${stepCount}칸 입력`);setStatus(hasNativePencilBridge()?'네이티브 브리지 사용 가능 · 웹 후보 입력도 사용할 수 있습니다.':`현재 ${measure+1}마디 · ${stepCount}칸 입력 · 웹 폴백`);};
  const sendNative=(cmd:'open'|'export'|'close'|'cancel')=>{const handler=window.webkit?.messageHandlers?.pencil;if(!handler){setStatus('네이티브 PencilKit을 사용할 수 없어 웹 입력을 계속합니다.');return;}handler.postMessage(makePencilEnvelope(cmd,`measure-${measure}`));setStatus(`네이티브 PencilKit ${cmd} 요청을 보냈습니다.`);};
  q<HTMLButtonElement>(dialog,'[data-native]').addEventListener('click',()=>sendNative('open'));q<HTMLButtonElement>(dialog,'[data-clear]').addEventListener('click',()=>{candidates=[];renderCandidates();setStatus('후보를 지웠습니다.');});
  q<HTMLButtonElement>(dialog,'[data-apply]').addEventListener('click',()=>{const result=window.maiWorkspace.applyPencilCandidates(candidates);if(result.ok){setStatus(`${result.changed||0}개 음표를 적용했습니다.`);dialog.close();}else setStatus(result.message||result.reason||'후보를 적용하지 못했습니다.');});
  const close=()=>{sendNative('cancel');dialog.close();};q<HTMLButtonElement>(dialog,'[data-close]').addEventListener('click',close);q<HTMLButtonElement>(dialog,'[data-cancel]').addEventListener('click',close);dialog.addEventListener('cancel',event=>{event.preventDefault();close();});dialog.addEventListener('close',()=>trigger.focus());
  window.addEventListener('pencil.result',event=>{const detail=(event as CustomEvent).detail as {candidates?:PencilCandidate[];error?:string}|undefined;if(!detail)return;if(detail.candidates?.length){candidates=dedupePencilCandidates([...candidates,...detail.candidates.map((candidate,index)=>({...candidate,id:`native-${Date.now()}-${index}`,source:'native',articulation:String(candidate.articulation||'normal'),confidence:candidate.confidence||0.9}))]) as Candidate[];renderCandidates();setStatus('네이티브 결과를 후보로 불러왔습니다. 확인 후 적용하세요.');}else if(detail.error)setStatus(`네이티브 입력 오류: ${detail.error}`);});
  trigger.addEventListener('click',open);
}
