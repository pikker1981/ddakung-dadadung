import './styles/grid-clipboard.css';

type GridPoint={instrument:string;step:number;measure:number;start:number;end:number;row:number};
type ClipResult={ok:boolean;reason?:string;changed?:boolean;rows?:number;duration?:number;start?:number;end?:number;ready?:boolean};
type ClipInfo={ready:boolean;rows:number;duration:number;start:number;end:number;instruments:string[]};
declare global {interface Window {ddakungGridClipboard:{point(instrument:string,step:number,measure:number):GridPoint|null;copy(a:GridPoint,b:GridPoint):ClipResult;inspectPaste(target:GridPoint):ClipResult;paste(target:GridPoint):ClipResult;clear():ClipInfo;info():ClipInfo}}}

const reasons:Record<string,string>={
  'invalid-point':'입력 칸이 바뀌었습니다. 붙일 칸을 다시 선택하세요.',
  'empty-clipboard':'Ctrl을 누른 채 입력 칸을 드래그해 먼저 복사하세요.',
  'row-overflow':'아래쪽 악기 행이 부족합니다. 더 위쪽 행에서 붙여넣으세요.',
  'time-overflow':'붙일 구간의 마디가 부족합니다. 마디를 추가하거나 앞쪽 칸을 선택하세요.',
  'incompatible-grid':'기존 타격 위치를 이 분할에 정확히 옮길 수 없습니다. 대상 박의 분할을 맞춰 주세요.',
  'unsupported-articulation':'대상 악기에서 사용할 수 없는 주법이 포함되어 있습니다. 같은 악기 행에 붙여넣으세요.',
  'unsupported-attachment':'손 순서나 꾸밈음을 옮길 수 없는 악기 행입니다. 손 악기 행을 선택하세요.'
};

export function installGridClipboard():void {
  const api=window.ddakungGridClipboard,grid=document.getElementById('grid')!,toolbar=document.querySelector('.editor-toolbar')!;
  if(!api)throw new Error('Grid clipboard unavailable');
  const controls=document.createElement('div');controls.className='clipboard-controls';
  controls.innerHTML='<span class="clipboard-status" role="status" aria-live="polite">Ctrl+드래그로 입력 범위 복사</span><button type="button" class="btn ghost sm" data-clip-paste disabled>범위 붙여넣기</button><button type="button" class="btn ghost sm" data-clip-clear hidden>선택 해제 · Esc</button>';
  toolbar.append(controls);
  toolbar.querySelector('.editor-hint')!.textContent='Ctrl+드래그 복사 → 붙일 시작 칸 클릭 → Ctrl+V · 우클릭은 32분음표 나누기';
  const status=controls.querySelector<HTMLElement>('.clipboard-status')!,paste=controls.querySelector<HTMLButtonElement>('[data-clip-paste]')!,clear=controls.querySelector<HTMLButtonElement>('[data-clip-clear]')!;
  let range:{start:number;end:number;firstRow:number;lastRow:number}|null=null,target:GridPoint|null=null;
  let drag:{a:GridPoint;b:GridPoint;pointerId:number}|null=null,ignoreFocus=false,targetNeedsReselect=false;
  let points=new Map<HTMLElement,GridPoint>();
  function point(cell:HTMLElement):GridPoint|null{return api.point(cell.dataset.ins!,Number(cell.dataset.step),Number(cell.dataset.measure));}
  function cellOf(event:Event):HTMLElement|null{return (event.target as HTMLElement).closest?.<HTMLElement>('.cell')||null;}
  function message(text:string,error=false){status.textContent=text;status.classList.toggle('is-error',error);}
  function selected(a:GridPoint,b:GridPoint){range={start:Math.min(a.start,b.start),end:Math.max(a.end,b.end),firstRow:Math.min(a.row,b.row),lastRow:Math.max(a.row,b.row)};}
  function repaint(){
    for(const [cell,p] of points){
      const included=!!range&&p.row>=range.firstRow&&p.row<=range.lastRow&&p.start>=range.start-1e-8&&p.start<range.end-1e-8;
      cell.classList.toggle('clip-selected',included);
      cell.classList.toggle('clip-anchor',!!target&&p.measure===target.measure&&p.instrument===target.instrument&&p.step===target.step);
    }
    grid.classList.toggle('clipboard-ready',api.info().ready);grid.classList.toggle('clipboard-selecting',!!drag);
  }
  function refreshPoints(){points=new Map([...grid.querySelectorAll<HTMLElement>('.cell')].flatMap(cell=>{const p=point(cell);return p?[[cell,p] as const]:[];}));repaint();}
  function syncTarget(){
    const info=api.info();clear.hidden=!info.ready&&!drag;
    if(!info.ready||!target){paste.disabled=true;return;}
    const current=api.point(target.instrument,target.step,target.measure);
    if(!current||Math.abs(current.start-target.start)>=1e-8){target=null;targetNeedsReselect=true;paste.disabled=true;message(reasons['invalid-point'],true);repaint();return;}
    const plan=api.inspectPaste(current);
    paste.disabled=!plan?.ok;
    if(!plan?.ok)paste.title=reasons[plan?.reason||'invalid-point']||'이 위치에 붙여넣을 수 없습니다.';
    else paste.title=`${target.measure+1}마디의 선택한 칸부터 붙여넣기 · Ctrl+V`;
  }
  function chooseTarget(cell:HTMLElement){
    const p=point(cell);if(!p)return;target=p;targetNeedsReselect=false;window.maiWorkspace.selectEditorMeasure(p.measure);syncTarget();repaint();
    const plan=api.inspectPaste(p);message(plan.ok?`${p.measure+1}마디 · ${cell.dataset.ins?window.maiWorkspace.describeCell(p.instrument,p.step,p.measure).label.split(',')[0]:''} · Ctrl+V로 붙여넣기`:reasons[plan.reason||'invalid-point']||'이 위치에 붙여넣을 수 없습니다.',!plan.ok);
  }
  function reset(){
    if(drag&&grid.hasPointerCapture(drag.pointerId))grid.releasePointerCapture(drag.pointerId);
    drag=null;range=null;target=null;targetNeedsReselect=false;api.clear();message('Ctrl+드래그로 입력 범위 복사');syncTarget();repaint();
  }
  function apply(){
    if(targetNeedsReselect){message(reasons['invalid-point'],true);return;}
    if(!target)return;const current=api.point(target.instrument,target.step,target.measure);
    if(!current||Math.abs(current.start-target.start)>=1e-8){target=null;targetNeedsReselect=true;message(reasons['invalid-point'],true);syncTarget();repaint();return;}
    const result=api.paste(current);message(result.ok?(result.changed?'범위를 붙여넣었습니다. Ctrl+Z로 한 번에 되돌릴 수 있어요.':'같은 내용이라 변경하지 않았습니다.'):reasons[result.reason||'invalid-point']||'붙여넣지 못했습니다.',!result.ok);
    refreshPoints();syncTarget();
  }
  grid.addEventListener('pointerdown',event=>{
    const cell=cellOf(event);if(!cell||event.button!==0||event.pointerType==='touch')return;
    if(event.ctrlKey||event.metaKey){
      const p=point(cell);if(!p)return;event.preventDefault();event.stopImmediatePropagation();
      drag={a:p,b:p,pointerId:event.pointerId};target=null;targetNeedsReselect=false;selected(p,p);grid.setPointerCapture(event.pointerId);message('복사할 범위를 드래그하세요. 마우스를 놓으면 복사됩니다.');syncTarget();repaint();
    }else if(api.info().ready){
      event.preventDefault();event.stopImmediatePropagation();chooseTarget(cell);ignoreFocus=true;cell.focus({preventScroll:true});ignoreFocus=false;
    }
  },true);
  grid.addEventListener('pointermove',event=>{
    if(!drag||event.pointerId!==drag.pointerId)return;event.preventDefault();
    const cell=document.elementFromPoint(event.clientX,event.clientY)?.closest<HTMLElement>('.cell');
    if(!cell||!grid.contains(cell))return;const p=point(cell);if(!p)return;drag.b=p;selected(drag.a,p);repaint();
  });
  grid.addEventListener('pointerup',event=>{
    if(!drag||event.pointerId!==drag.pointerId)return;event.preventDefault();event.stopImmediatePropagation();
    const {a,b,pointerId}=drag;drag=null;if(grid.hasPointerCapture(pointerId))grid.releasePointerCapture(pointerId);
    const result=api.copy(a,b);if(result.ok){message(`${result.rows}개 악기 행 복사됨 · 붙일 시작 칸을 클릭한 뒤 Ctrl+V`);}else{range=null;message(reasons[result.reason||'invalid-point']||'범위를 복사하지 못했습니다.',true);}
    const focus=[...points].find(([,p])=>p.instrument===b.instrument&&p.step===b.step&&p.measure===b.measure)?.[0];ignoreFocus=true;focus?.focus({preventScroll:true});ignoreFocus=false;syncTarget();repaint();
  },true);
  grid.addEventListener('pointercancel',()=>{if(drag)reset();});
  grid.addEventListener('lostpointercapture',()=>{if(drag)reset();});
  grid.addEventListener('focusin',event=>{
    const cell=cellOf(event);if(!cell||drag||ignoreFocus||!api.info().ready)return;
    if(target){syncTarget();if(targetNeedsReselect)return;}
    if(!targetNeedsReselect)chooseTarget(cell);
  });
  grid.addEventListener('paste',event=>{
    if(!api.info().ready)return;const cell=cellOf(event);if(!cell)return;
    event.preventDefault();event.stopImmediatePropagation();if(!targetNeedsReselect)target=point(cell);apply();
  });
  document.addEventListener('keydown',event=>{
    if(!api.info().ready&&!drag)return;
    const element=event.target as HTMLElement;
    if(element.closest('input,textarea,select,[contenteditable="true"]'))return;
    const inGrid=grid.contains(element)||controls.contains(element);if(!inGrid)return;
    if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key))targetNeedsReselect=false;
    if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();reset();return;}
    if(!(event.ctrlKey||event.metaKey))return;
    if(event.key.toLowerCase()==='v'){event.preventDefault();event.stopImmediatePropagation();if(!target&&!targetNeedsReselect){const cell=cellOf(event);if(cell)target=point(cell);}apply();}
    if(event.key.toLowerCase()==='c'){event.preventDefault();event.stopImmediatePropagation();message('선택 범위가 복사되어 있습니다. 붙일 칸을 고른 뒤 Ctrl+V를 누르세요.');}
  },true);
  paste.onclick=apply;clear.onclick=reset;
  const observer=new MutationObserver(()=>{refreshPoints();syncTarget();});
  observer.observe(grid,{childList:true,subtree:true});
  window.addEventListener('blur',()=>{if(drag)reset();});refreshPoints();syncTarget();
}
