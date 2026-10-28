import './styles/velocity-editor.css';
import type {VelocityNote} from './domain';

const key=(n:VelocityNote)=>`${n.measure}:${n.instrument}:${n.step}:${n.start}`;
export function installVelocityEditor():void {
  const api=window.maiWorkspace,grid=document.getElementById('grid')!;
  if(document.getElementById('velocityEditor'))return;
  const panel=grid.closest('.panel')||grid.parentElement!;
  const el=document.createElement('section');el.id='velocityEditor';el.className='velocity-editor';el.setAttribute('aria-label','음표 세기 편집');
  el.innerHTML=`<div class="velocity-heading"><strong>음표 세기</strong><button type="button" class="btn ghost sm" data-mode aria-pressed="false">세기 선택 모드</button><span data-status role="status" aria-live="polite">입력 모드 · 음표의 원래 세기를 사용합니다</span></div><div class="velocity-bars" aria-label="현재 입력 범위의 타격 세기"></div><div class="velocity-controls"><label>세기 <input data-number type="number" min="1" max="127" value="96" aria-label="선택한 음표 세기"></label><input data-slider type="range" min="1" max="127" value="96" aria-label="선택한 음표 세기 슬라이더"><button type="button" class="btn ghost sm" data-auto>자동으로</button><label>시작 <input data-start type="number" min="1" max="127" value="40" aria-label="범위 시작 세기"></label><label>끝 <input data-end type="number" min="1" max="127" value="110" aria-label="범위 끝 세기"></label><button type="button" class="btn ghost sm" data-ramp>점점 세게</button><button type="button" class="btn ghost sm" data-down>점점 여리게</button></div><p class="velocity-help">세기 모드에서 음표 클릭 · 드래그로 범위 선택 · Shift로 범위 확장 · Ctrl+드래그 복사 · 우클릭 32분 나누기</p>`;
  panel.append(el);
  const bars=el.querySelector<HTMLElement>('.velocity-bars')!,status=el.querySelector<HTMLElement>('[data-status]')!,modeButton=el.querySelector<HTMLButtonElement>('[data-mode]')!;
  const number=el.querySelector<HTMLInputElement>('[data-number]')!,slider=el.querySelector<HTMLInputElement>('[data-slider]')!,start=el.querySelector<HTMLInputElement>('[data-start]')!,end=el.querySelector<HTMLInputElement>('[data-end]')!;
  let mode=false,notes:VelocityNote[]=[],selected=new Set<string>(),anchor:VelocityNote|null=null,dirty=false,lastPreview=0;
  let drag:{first:Pick<VelocityNote,'row'|'start'>;pointer:number}|null=null,barDrag:{note:VelocityNote;pointer:number;top:number;height:number}|null=null;
  const clamp=(v:number)=>Math.max(1,Math.min(127,Math.round(v)));
  function chosen(){return notes.filter(n=>selected.has(key(n)));}
  function preview(n:VelocityNote|undefined){if(n&&!api.isPlaying()&&performance.now()-lastPreview>=130){lastPreview=performance.now();api.previewVelocity(n);}}
  function commit(){if(dirty){dirty=false;api.commitVelocityEdit();}}
  function apply(values:(n:VelocityNote)=>number|null,finish=true){const list=chosen();if(!list.length)return;const edits=list.map(n=>({...n,velocity:values(n)}));if(api.setNoteVelocities(edits)){dirty=true;notes=api.velocityNotes();preview(notes.find(n=>key(n)===key(list[0])));render();}if(finish)commit();}
  function range(a:Pick<VelocityNote,'row'|'start'>,b:Pick<VelocityNote,'row'|'start'>){selected=new Set(notes.filter(n=>n.row>=Math.min(a.row,b.row)&&n.row<=Math.max(a.row,b.row)&&n.start>=Math.min(a.start,b.start)-1e-8&&n.start<=Math.max(a.start,b.start)+1e-8).map(key));}
  function choose(n:VelocityNote,shift=false){if(shift&&anchor)range(anchor,n);else{anchor=n;selected=new Set([key(n)]);}render();preview(n);}
  function cellNote(cell:HTMLElement|null){return cell&&notes.find(n=>n.instrument===cell.dataset.ins&&n.measure===Number(cell.dataset.measure)&&n.step===Number(cell.dataset.step));}
  function cellPoint(cell:HTMLElement|null){return cell&&window.ddakungGridClipboard?.point(cell.dataset.ins!,Number(cell.dataset.step),Number(cell.dataset.measure));}
  function render(){
    const existing=new Map(notes.map(n=>[key(n),n]));selected=new Set([...selected].filter(k=>existing.has(k)));if(anchor&&!existing.has(key(anchor)))anchor=null;
    const list=chosen(),vels=new Set(list.map(n=>n.velocity));
    status.textContent=list.length?`${list.length}개 타격 선택 · ${vels.size===1?(list[0].velocity===null?'자동':list[0].velocity):'여러 세기'}`:mode?'음표를 클릭하거나 드래그해 선택하세요':'입력 모드 · 음표의 원래 세기를 사용합니다';
    for(const input of [number,slider]){input.disabled=!list.length;if(document.activeElement!==input)input.value=String(list[0]?.velocity??96);}
    for(const button of el.querySelectorAll<HTMLButtonElement>('[data-auto],[data-ramp],[data-down]'))button.disabled=!list.length;
    grid.classList.toggle('velocity-mode',mode);
    for(const cell of grid.querySelectorAll<HTMLElement>('.cell')){const n=cellNote(cell);cell.classList.toggle('velocity-selected',!!n&&selected.has(key(n)));}
    // Keep the active drag target mounted until pointerup.
    if(!barDrag){bars.replaceChildren();if(!notes.length){const empty=document.createElement('span');empty.className='velocity-empty';empty.textContent='타격을 입력하면 여기에 세기가 표시됩니다.';bars.append(empty);}
      for(const n of notes){const b=document.createElement('button');b.type='button';b.className='velocity-bar'+(selected.has(key(n))?' is-selected':'')+(n.velocity===null?' is-auto':'');b.dataset.note=key(n);b.title=`${n.measure+1}마디 · ${n.label} · ${n.velocity??'자동'}`;b.setAttribute('aria-label',b.title);b.setAttribute('aria-pressed',String(selected.has(key(n))));b.style.setProperty('--velocity',String((n.velocity??80)/127));const fill=document.createElement('i');const label=document.createElement('span');label.textContent=String(n.velocity??'A');b.append(fill,label);bars.append(b);}
    }else for(const b of bars.querySelectorAll<HTMLElement>('[data-note]')){const n=existing.get(b.dataset.note!);if(n){b.style.setProperty('--velocity',String((n.velocity??80)/127));b.querySelector('span')!.textContent=String(n.velocity??'A');b.classList.toggle('is-selected',selected.has(key(n)));}}
  }
  function refresh(){notes=api.velocityNotes();render();}
  modeButton.onclick=()=>{commit();mode=!mode;modeButton.setAttribute('aria-pressed',String(mode));modeButton.textContent=mode?'세기 선택 중':'세기 선택 모드';render();};
  grid.addEventListener('pointerdown',e=>{if(!mode||e.button!==0||e.ctrlKey||e.metaKey||window.ddakungGridClipboard?.info().ready)return;const cell=(e.target as HTMLElement).closest<HTMLElement>('.cell');if(!cell)return;e.preventDefault();e.stopImmediatePropagation();const n=cellNote(cell),point=cellPoint(cell);if(!point)return;if(n)choose(n,e.shiftKey);else{selected.clear();render();}drag={first:e.shiftKey&&anchor?anchor:point,pointer:e.pointerId};grid.setPointerCapture(e.pointerId);cell.focus({preventScroll:true});},true);
  grid.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.pointer)return;const cell=document.elementFromPoint(e.clientX,e.clientY)?.closest<HTMLElement>('.cell')||null;const point=cellPoint(cell);if(point){range(drag.first,point);render();}});
  function endGrid(){if(drag&&grid.hasPointerCapture(drag.pointer))grid.releasePointerCapture(drag.pointer);drag=null;}
  grid.addEventListener('pointerup',e=>{if(drag){e.preventDefault();e.stopImmediatePropagation();endGrid();}},true);grid.addEventListener('pointercancel',endGrid);
  grid.addEventListener('keydown',e=>{if(!mode||e.ctrlKey||e.metaKey)return;const cell=(e.target as HTMLElement).closest<HTMLElement>('.cell');if(!cell)return;const n=cellNote(cell);if(e.key===' '||e.key==='Enter'){e.preventDefault();e.stopImmediatePropagation();if(n)choose(n,e.shiftKey);else{selected.clear();render();}}else if(e.key==='Escape'){selected.clear();anchor=null;render();}},true);
  bars.addEventListener('click',e=>{const b=(e.target as HTMLElement).closest<HTMLElement>('[data-note]');if(!b)return;const n=notes.find(n=>key(n)===b.dataset.note);if(n&&!suppressClick)choose(n,e.shiftKey);suppressClick=false;});
  let suppressClick=false;
  bars.addEventListener('pointerdown',e=>{if(e.button!==0)return;const b=(e.target as HTMLElement).closest<HTMLElement>('[data-note]');const n=notes.find(n=>key(n)===b?.dataset.note);if(!b||!n)return;e.preventDefault();b.focus();if(!selected.has(key(n))||e.shiftKey)choose(n,e.shiftKey);const rect=b.getBoundingClientRect();barDrag={note:n,pointer:e.pointerId,top:rect.top,height:rect.height};bars.setPointerCapture(e.pointerId);suppressClick=true;});
  bars.addEventListener('pointermove',e=>{if(!barDrag||barDrag.pointer!==e.pointerId||!e.buttons)return;const value=clamp((1-(e.clientY-barDrag.top)/barDrag.height)*127);apply(()=>value,false);});
  function endBar(){const p=barDrag?.pointer;barDrag=null;if(p!==undefined&&bars.hasPointerCapture(p))bars.releasePointerCapture(p);commit();render();}
  bars.addEventListener('pointerup',endBar);bars.addEventListener('pointercancel',endBar);bars.addEventListener('lostpointercapture',()=>{if(barDrag)endBar();});
  for(const input of [number,slider]){input.addEventListener('input',()=>{if(!Number.isFinite(input.valueAsNumber))return;const value=clamp(input.valueAsNumber);if(input===slider)number.value=String(value);else slider.value=String(value);apply(()=>value,false);});input.addEventListener('change',commit);input.addEventListener('blur',commit);}
  el.querySelector<HTMLButtonElement>('[data-auto]')!.onclick=()=>apply(()=>null);
  function ramp(down:boolean){const list=chosen();if(!list.length)return;let a=clamp(start.valueAsNumber||1),b=clamp(end.valueAsNumber||127);if(down){[a,b]=[Math.max(a,b),Math.min(a,b)];}else [a,b]=[Math.min(a,b),Math.max(a,b)];const first=Math.min(...list.map(n=>n.start)),last=Math.max(...list.map(n=>n.start));apply(n=>clamp(a+(b-a)*(last===first?0:(n.start-first)/(last-first))));}
  el.querySelector<HTMLButtonElement>('[data-ramp]')!.onclick=()=>ramp(false);el.querySelector<HTMLButtonElement>('[data-down]')!.onclick=()=>ramp(true);
  window.addEventListener('mai-velocity-refresh',refresh);window.addEventListener('blur',()=>{endGrid();if(barDrag)endBar();commit();});refresh();
}
