export function installMeasureRepeat():void {
  const api=window.maiWorkspace;
  const row=document.createElement('section');row.className='measure-repeat-controls';row.setAttribute('aria-label','마디 반복 재생');
  row.innerHTML='<strong>마디 반복</strong><label>시작 <input type="number" min="1" step="1" aria-label="반복 시작 마디"></label><span>–</span><label>끝 <input type="number" min="1" step="1" aria-label="반복 끝 마디"></label><button type="button" class="btn" data-repeat-current>현재 마디</button><button type="button" class="btn" data-repeat-selection>선택 구간</button><button type="button" class="btn" data-repeat-play aria-pressed="false">반복 재생</button><button type="button" class="btn" data-repeat-clear>반복 해제</button><span class="measure-repeat-status" role="status" aria-live="polite"></span>';
  document.querySelector('.editor-toolbar')!.before(row);
  const [start,end]=Array.from(row.querySelectorAll<HTMLInputElement>('input'));
  const play=row.querySelector<HTMLButtonElement>('[data-repeat-play]')!,clear=row.querySelector<HTMLButtonElement>('[data-repeat-clear]')!;
  let dirty=false,busy=false,lastRange='';
  function sync(){
    const state=api.measureRepeat(),range=`${state.start}:${state.end}`;
    start.max=end.max=String(state.total);
    if(state.start!==null&&state.end!==null&&range!==lastRange){start.value=String(state.start+1);end.value=String(state.end+1);dirty=false;}
    else if(state.start===null&&!dirty){start.value=String(state.current+1);end.value=String(state.current+1);}
    lastRange=range;
    const active=state.enabled&&state.playing;
    play.textContent=active?'반복 정지':'반복 재생';play.setAttribute('aria-pressed',String(active));play.disabled=busy;
    clear.disabled=state.start===null;
    row.querySelector('.measure-repeat-status')!.textContent=state.start===null?'현재 마디 또는 시작·끝 마디를 지정하세요.':`${state.start+1}${state.end!==state.start?'–'+(state.end!+1):''}마디 · ${active?'반복 재생 중':state.enabled?'반복 준비됨':'반복 꺼짐'}`;
  }
  for(const input of [start,end]){input.required=true;input.addEventListener('input',()=>{dirty=true;});}
  row.querySelector('[data-repeat-current]')!.addEventListener('click',()=>{const state=api.measureRepeat();start.value=end.value=String(state.current+1);dirty=true;});
  row.querySelector('[data-repeat-selection]')!.addEventListener('click',()=>{const state=api.measureRepeat();start.value=String(state.selectedStart+1);end.value=String(state.selectedEnd+1);dirty=true;});
  play.addEventListener('click',async()=>{
    const state=api.measureRepeat();
    if(state.enabled&&state.playing){api.stopMeasureRepeat();sync();return;}
    if(!start.reportValidity()||!end.reportValidity())return;
    busy=true;sync();try{await api.playMeasureRepeat(start.valueAsNumber-1,end.valueAsNumber-1);}finally{busy=false;sync();}
  });
  clear.addEventListener('click',()=>{api.stopMeasureRepeat(true);dirty=false;sync();});
  // Space on a focused repeat button must not also toggle the global transport.
  row.addEventListener('keydown',event=>{if(event.code==='Space')event.stopPropagation();});
  window.addEventListener('ddakung-repeat-change',sync);
  window.addEventListener('mai-velocity-refresh',sync);
  sync();
}
