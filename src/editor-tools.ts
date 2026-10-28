import './styles/editor-tools.css';

export function installEditorTools():void {
  const workspace=window.maiWorkspace,grid=document.getElementById('grid')!;
  const toolbar=document.createElement('div');toolbar.className='editor-toolbar';
  toolbar.innerHTML='<label>표시 마디 수 <select aria-label="입력판 표시 마디 수"><option value="1">1마디</option><option value="2">2마디</option><option value="3">3마디</option><option value="4">4마디</option></select></label><button type="button" data-prev aria-label="이전 입력 마디">← 이전</button><span class="editor-range" aria-live="polite"></span><button type="button" data-next aria-label="다음 입력 마디">다음 →</button><span class="editor-hint">입력 칸 우클릭 · 32분음표로 나누기</span>';
  document.getElementById('gridMode')!.before(toolbar);
  const count=toolbar.querySelector('select')!,previous=toolbar.querySelector<HTMLButtonElement>('[data-prev]')!,next=toolbar.querySelector<HTMLButtonElement>('[data-next]')!;
  const fresh=document.createElement('button');fresh.id='newScoreButton';fresh.type='button';fresh.textContent='새로 열기';fresh.title='현재 곡을 저장하고 빈 새 악보 만들기';
  fresh.className='btn ghost sm';document.getElementById('loadBtn')!.before(fresh);
  const popup=document.createElement('div');popup.id='quickDivision';popup.className='quick-division';popup.setAttribute('popover','auto');popup.setAttribute('role','dialog');popup.setAttribute('aria-label','입력 칸 음표 분할');
  popup.innerHTML='<strong></strong><p>기존 타격 시점을 유지하고 32분음표 간격으로 나눕니다.</p><button type="button" data-voice>이 성부를 32분음표로</button><button type="button" data-both>손·발 함께 32분음표로</button><p class="quick-result" role="status"></p><button type="button" data-close>닫기</button>';
  document.body.append(popup);
  for(const button of [...toolbar.querySelectorAll('button'),...popup.querySelectorAll('button')])button.className='btn ghost sm';
  type Target={measure:number;beat:number;voice:'hand'|'foot';instrument:string;division:number;supported:boolean};
  let target:Target|null=null;
  const close=()=>{popup.hidePopover();target=null;};
  function sync(){
    const view=workspace.editorView();count.value=String(view.count);grid.dataset.editorCount=String(view.count);
    toolbar.querySelector('.editor-range')!.textContent=`${view.start+1}${view.end>view.start?'–'+(view.end+1):''}마디 / 총 ${view.total}마디`;
    previous.disabled=view.start===0;next.disabled=view.end>=view.total-1;
  }
  count.addEventListener('change',()=>{close();workspace.setEditorCount(Number(count.value));sync();});
  previous.onclick=()=>{close();workspace.moveEditorPage(-1);};next.onclick=()=>{close();workspace.moveEditorPage(1);};
  fresh.onclick=()=>{close();if(workspace.createNewSong())document.getElementById('titleInput')?.focus();sync();};
  window.addEventListener('ddakung-editor-view-change',()=>{sync();if(target&&workspace.editorView().selected!==target.measure)close();});
  fresh.addEventListener('keydown',event=>{if(event.code==='Space')event.stopPropagation();});
  const options=(voice:'hand'|'foot'|'both')=>({measure:target!.measure,beat:target!.beat,voice,division:target!.division,scope:'beat' as const});
  function inspect(button:HTMLButtonElement,voice:'hand'|'foot'|'both'){
    const plan=window.ddakungTuplets.inspect(options(voice));button.disabled=!target!.supported||!plan.ok||!plan.canApply||!plan.changed;
    button.title=!plan.ok?'현재 박에서 사용할 수 없는 분할입니다.':plan.conflicts.length?'기존 타격 위치를 유지할 수 없어 변경할 수 없습니다.':!plan.changed?'이미 32분음표 분할입니다.':'기존 타격을 유지하며 나눕니다.';
    return plan;
  }
  function open(cell:HTMLElement,x:number,y:number){
    close();const measure=Number(cell.dataset.measure);
    if(!workspace.selectEditorMeasure(measure))return;
    const beat=Number(cell.dataset.b),context=window.ddakungTuplets.context().beats.find(item=>item.beat===beat)!;
    const division=context.quarterLength*8;
    target={measure,beat,voice:cell.dataset.v==='foot'?'foot':'hand',instrument:cell.dataset.ins!,division,supported:context.allowed.some(item=>item.division===division)};
    popup.querySelector('strong')!.textContent=`${measure+1}마디 · ${target.beat+1}박 · ${target.voice==='hand'?'손':'발'} 악기`;
    const one=popup.querySelector<HTMLButtonElement>('[data-voice]')!,both=popup.querySelector<HTMLButtonElement>('[data-both]')!;
    one.textContent=`${target.voice==='hand'?'손':'발'} 악기를 32분음표로`;
    const plan=inspect(one,target.voice);inspect(both,'both');
    popup.querySelector('.quick-result')!.textContent=!target.supported?'현재 박 묶음에서는 32분음표 분할을 지원하지 않습니다. 박 묶음을 먼저 나눠 주세요.':plan.conflicts.length?'기존 타격 위치가 32분음표 칸과 맞지 않습니다. 현재 음표를 유지합니다.':!plan.ok?'현재 박자에서는 이 분할을 적용할 수 없습니다.':!plan.changed?'이미 32분음표로 나뉜 박입니다.':'';
    popup.style.left='0px';popup.style.top='0px';popup.showPopover();
    const rect=popup.getBoundingClientRect();popup.style.left=`${Math.max(8,Math.min(x,innerWidth-rect.width-8))}px`;popup.style.top=`${Math.max(8,Math.min(y,innerHeight-rect.height-8))}px`;
    (one.disabled?popup.querySelector<HTMLButtonElement>('[data-close]')!:one).focus();
  }
  grid.addEventListener('contextmenu',event=>{const cell=(event.target as HTMLElement).closest<HTMLElement>('.cell');if(!cell)return;event.preventDefault();open(cell,event.clientX,event.clientY);});
  grid.addEventListener('keydown',event=>{if(event.key!=='ContextMenu'&&!(event.shiftKey&&event.key==='F10'))return;const cell=(event.target as HTMLElement).closest<HTMLElement>('.cell');if(!cell)return;event.preventDefault();const rect=cell.getBoundingClientRect();open(cell,rect.left,rect.bottom);});
  function apply(voice:'hand'|'foot'|'both'){
    if(!target||!target.supported)return;const before=target,result=window.ddakungTuplets.apply(options(voice));
    if(!result.applied){popup.querySelector('.quick-result')!.textContent='기존 음표를 유지했습니다. 입력 칸을 다시 선택해 주세요.';return;}
    close();grid.querySelector<HTMLElement>(`.cell[data-measure="${before.measure}"][data-ins="${CSS.escape(before.instrument)}"][data-b="${before.beat}"]`)?.focus();
  }
  popup.querySelector('[data-voice]')!.addEventListener('click',()=>{if(target)apply(target.voice);});popup.querySelector('[data-both]')!.addEventListener('click',()=>apply('both'));popup.querySelector('[data-close]')!.addEventListener('click',close);
  popup.addEventListener('keydown',event=>{if(event.key!=='Escape')event.stopPropagation();});
  toolbar.addEventListener('keydown',event=>{if(event.code==='Space')event.stopPropagation();});
  sync();
}
