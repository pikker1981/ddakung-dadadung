import './styles/mixer.css';

export function installMixer():void {
  if(document.getElementById('mainMixer'))return;
  const api=window.ddakungAudio;
  if(!api)throw Error('Drum audio bridge unavailable');
  const panel=document.createElement('section');panel.id='mainMixer';panel.className='main-mixer';panel.setAttribute('aria-labelledby','mainMixerTitle');
  panel.innerHTML=`<div class="mixer-heading"><div><span class="mixer-eyebrow">12 CHANNELS · YOUR BALANCE</span><h2 id="mainMixerTitle">드럼 믹서</h2><p>악기별 크기와 좌우 위치를 조절하세요. MUTE가 SOLO보다 우선합니다.</p></div><div class="mixer-actions"><button type="button" class="btn" data-clear-solo>SOLO 전체 해제</button><button type="button" class="btn" data-mixer-reset>믹서 초기화</button><button type="button" class="btn mixer-toggle" data-mixer-toggle aria-expanded="false" aria-controls="mixerBody">펼치기</button></div></div><div id="mixerBody" class="mixer-body" hidden><div class="mixer-channels" role="group" aria-label="악기별 믹서"></div><p class="mixer-status" role="status" aria-live="polite"></p></div>`;
  const main=document.querySelector('body > main');
  if(main)main.after(panel);else document.querySelector('footer')?.before(panel);
  if(!panel.isConnected)document.body.append(panel);
  const channels=panel.querySelector('.mixer-channels')!,body=panel.querySelector<HTMLElement>('#mixerBody')!,toggle=panel.querySelector<HTMLButtonElement>('[data-mixer-toggle]')!,sourceLabels=new Map<string,string>([['synth','합성 대체 소리']]);
  const setExpanded=(expanded:boolean)=>{body.hidden=!expanded;toggle.setAttribute('aria-expanded',String(expanded));toggle.textContent=expanded?'접기':'펼치기';panel.classList.toggle('is-collapsed',!expanded);};
  toggle.addEventListener('click',()=>setExpanded(toggle.getAttribute('aria-expanded')!=='true'));
  setExpanded(false);
  const finish=document.createElement('div');finish.className='mixer-polish';finish.innerHTML='<div><label for="mixerPolish">사운드 정리 · 자연 / 스튜디오</label><output for="mixerPolish"></output></div><input id="mixerPolish" type="range" min="0" max="100" step="1" aria-describedby="mixerPolishHelp"><p id="mixerPolishHelp">0% 기존 드럼 소리 · 기본 40% · 원음의 울림과 개별 튜닝 유지</p>';
  panel.querySelector('.mixer-heading')!.insertBefore(finish,panel.querySelector('.mixer-actions'));
  const finishInput=finish.querySelector<HTMLInputElement>('input')!;
  finishInput.addEventListener('input',()=>{api.polishSet(finishInput.valueAsNumber);sync();});
  for(const instrument of api.instruments()){
    const id=instrument.id,channel=document.createElement('article');channel.className='mixer-channel';channel.dataset.mixerId=id;
    channel.innerHTML=`<div class="mixer-channel-heading"><h3></h3><span class="mixer-source"></span></div><div class="mixer-control"><div><label for="mixer-volume-${id}">볼륨</label><output for="mixer-volume-${id}"></output></div><input id="mixer-volume-${id}" data-mixer-volume type="range" min="0" max="200" step="1"></div><div class="mixer-control"><div><label for="mixer-pan-${id}">팬</label><output for="mixer-pan-${id}"></output></div><input id="mixer-pan-${id}" data-mixer-pan type="range" min="-100" max="100" step="1"></div><div class="mixer-switches"><button type="button" data-mixer-mute aria-pressed="false">MUTE</button><button type="button" data-mixer-solo aria-pressed="false">SOLO</button></div>`;
    channel.querySelector('h3')!.textContent=instrument.label;
    channel.querySelector<HTMLInputElement>('[data-mixer-volume]')!.max=String(api.volumeMax(id));
    channel.querySelector<HTMLInputElement>('[data-mixer-volume]')!.setAttribute('aria-label',`${instrument.label} 볼륨`);
    channel.querySelector<HTMLInputElement>('[data-mixer-pan]')!.setAttribute('aria-label',`${instrument.label} 팬`);
    channel.querySelector('[data-mixer-mute]')!.setAttribute('aria-label',`${instrument.label} MUTE`);
    channel.querySelector('[data-mixer-solo]')!.setAttribute('aria-label',`${instrument.label} SOLO`);
    channel.querySelector<HTMLInputElement>('[data-mixer-volume]')!.addEventListener('input',event=>{api.set(id,{volume:(event.target as HTMLInputElement).valueAsNumber});sync();});
    channel.querySelector<HTMLInputElement>('[data-mixer-pan]')!.addEventListener('input',event=>{api.mixerSet(id,{pan:(event.target as HTMLInputElement).valueAsNumber});sync();});
    channel.querySelector('[data-mixer-mute]')!.addEventListener('click',()=>{api.mixerSet(id,{mute:!api.mixerGet(id).mute});sync();});
    channel.querySelector('[data-mixer-solo]')!.addEventListener('click',()=>{api.mixerSet(id,{solo:!api.mixerGet(id).solo});sync();});
    channels.append(channel);
  }
  function sync():void {
    const state=api.mixerStatus();
    const polish=api.polishGet();finishInput.value=String(polish.amount);finishInput.setAttribute('aria-valuetext',`${polish.amount}%`);finish.querySelector('output')!.textContent=`${polish.amount}%`;
    panel.querySelectorAll<HTMLElement>('[data-mixer-id]').forEach(channel=>{
      const id=channel.dataset.mixerId!,value=api.mixerGet(id),source=api.sourceFor(id);
      const volume=channel.querySelector<HTMLInputElement>('[data-mixer-volume]')!,pan=channel.querySelector<HTMLInputElement>('[data-mixer-pan]')!;
      volume.value=String(value.volume);pan.value=String(value.pan);
      const panText=value.pan===0?'중앙 0':`${value.pan<0?'L':'R'} ${Math.abs(value.pan)}`;
      volume.setAttribute('aria-valuetext',`${value.volume}%`);pan.setAttribute('aria-valuetext',panText);
      volume.parentElement!.querySelector('output')!.textContent=`${value.volume}%`;pan.parentElement!.querySelector('output')!.textContent=panText;
      channel.querySelector('[data-mixer-mute]')!.setAttribute('aria-pressed',String(value.mute));channel.querySelector('[data-mixer-solo]')!.setAttribute('aria-pressed',String(value.solo));
      channel.classList.toggle('is-muted',value.mute||state.soloCount>0&&!value.solo);
      const label=sourceLabels.get(source)||source;channel.querySelector<HTMLElement>('.mixer-source')!.textContent=label;channel.querySelector<HTMLElement>('.mixer-source')!.title=label;
    });
    panel.querySelector<HTMLButtonElement>('[data-clear-solo]')!.disabled=state.soloCount===0;
    const status=panel.querySelector<HTMLElement>('.mixer-status')!;
    status.textContent=!state.storageOk||!polish.storageOk?'설정을 저장하지 못했습니다. 현재 소리에는 적용되지만 재실행하면 유지되지 않을 수 있습니다.':`${state.soloCount?`SOLO ${state.soloCount}개 · `:''}볼륨 · 팬 · MUTE · 사운드 정리는 이 브라우저에 저장됩니다. SOLO는 재실행하면 해제됩니다.`;
    status.classList.toggle('mixer-warning',!state.storageOk||!polish.storageOk);
  }
  panel.querySelector('[data-clear-solo]')!.addEventListener('click',()=>{api.clearSolo();sync();});
  panel.querySelector('[data-mixer-reset]')!.addEventListener('click',()=>{api.mixerReset();sync();});
  panel.addEventListener('keydown',event=>{if(event.target instanceof HTMLInputElement||event.target instanceof HTMLButtonElement)event.stopPropagation();});
  for(const name of ['ddakung-mixer-change','ddakung-tuning-change','ddakung-samples-change','ddakung-polish-change'])window.addEventListener(name,sync);
  void api.catalog().then(catalog=>{for(const kit of catalog.kits)sourceLabels.set(kit.id,kit.label);sync();}).catch(()=>{});
  sync();
}
