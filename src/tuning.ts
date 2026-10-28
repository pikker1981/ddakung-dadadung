import './styles/tuning.css';
import {modelSources,presetSources,type DrumKit} from './tuning-library';

type TuningValues={volume:number;pitch:number;resonance:number;tension:number};
type Instrument={id:string;label:string;metal:boolean};
type DrumSource=DrumKit&{available:boolean;loadError?:string;layers:number;alternates:number;articulations:string[];warnings:string[]};
type TuningAPI={
  volumeMax(id:string):number;
  polishGet():{amount:number;storageOk:boolean};polishSet(amount:number):{amount:number;storageOk:boolean};
  mixerGet(id:string):{volume:number;pan:number;mute:boolean;solo:boolean};
  mixerSet(id:string,values:{pan?:number;mute?:boolean;solo?:boolean}):boolean;
  mixerReset():boolean;clearSolo():void;mixerStatus():{storageOk:boolean;soloCount:number};
  instruments():Instrument[];get(id:string):TuningValues;
  status():{storageOk:boolean;muted:boolean;playing:boolean;sampleState:string;sampleError:string;sampleProgress:number;kit:string;kitLabel:string;sourceLoading:boolean;sourceStorageOk:boolean};
  catalog():Promise<{kits:DrumKit[];personalLibrary?:{models:number;error?:string}}>;loadKit(id:string):Promise<unknown>;retrySources():Promise<unknown>;
  sourceFor(id:string):string;getSources(id:string):Promise<DrumSource[]>;
  chooseSource(id:string,source:string):Promise<boolean>;auditionSource(id:string,source:string,variant?:'open'):Promise<boolean>;
  resume():Promise<void>;audition(id:string):void;cancelAudition():void;
  set(id:string,values:Partial<TuningValues>):boolean;reset(id?:string):boolean;preview(id:string,variant?:'open'|'ghost'):Promise<void>;
};
declare global {interface Window {ddakungAudio:TuningAPI}}
const categories=[{label:'킥',ids:['kick']},{label:'스네어',ids:['snare']},{label:'탐',ids:['tom1','tom2','ftom']},{label:'하이햇',ids:['hihat','hihatFoot']},{label:'라이드',ids:['ride']},{label:'크래쉬',ids:['crash']},{label:'스플래시',ids:['splash']},{label:'차이나',ids:['china']},{label:'스택 · FX',ids:['fx']}];
const articulations:Record<string,string>={kick:'킥',snare:'센터',snareRim:'림 주법',snareXStick:'크로스스틱',tom1:'하이 탐',tom2:'미드 탐',ftom:'플로어 탐',hihat:'닫힘',hihatOpen:'열림',hihatFoot:'페달',ride:'보우',rideBell:'벨 주법',crash:'크래쉬',splash:'스플래시',china:'차이나',fx:'스택 · FX'};
function sourceWarning(warning:string):string {
  if(!warning.includes(':'))return warning;
  const colon=warning.indexOf(':'),id=warning.slice(0,colon),description=warning.slice(colon+1).trim(),label=articulations[id]||id;
  if(description.startsWith('No recorded ')||description.startsWith('No separately identified '))return `${label}: 별도 녹음 없음 · 일반 타격으로 대체`;
  if(description.includes('edge articulation'))return `${label}: 별도 림샷 대신 스네어 가장자리 녹음`;
  if(description.includes('Derived from tom1'))return `${label}: 별도 미드 탐 대신 하이 탐을 −3반음 변환`;
  if(description==='TR808 claves')return `${label}: 어쿠스틱 크로스스틱 대신 808 클라베스`;
  if(description==='TR808 cowbell')return `${label}: 라이드 벨 대신 808 카우벨`;
  if(description==='TR808 cymbal')return `${label}: 808 심벌 녹음 공유`;
  if(description.startsWith('Closed hi-hat'))return `${label}: 별도 페달 녹음 대신 닫힌 하이햇`;
  return `${label}: ${description}`;
}

export function installDrumTuning():void {
  if(document.getElementById('drumTuningButton'))return;
  const api=window.ddakungAudio;if(!api)throw Error('Drum audio bridge unavailable');
  const button=document.createElement('button');button.id='drumTuningButton';button.className='btn tuning-open';button.type='button';button.textContent='내 드럼 만들기';button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-controls','drumTuningDialog');
  button.addEventListener('keydown',event=>{if(event.code==='Space')event.stopPropagation();});
  (document.querySelector('.fileacts')||document.querySelector('.topbar'))?.prepend(button);
  const dialog=document.createElement('dialog');dialog.id='drumTuningDialog';dialog.className='drum-tuning';dialog.setAttribute('aria-labelledby','tuningTitle');dialog.setAttribute('aria-describedby','tuningIntro');
  dialog.innerHTML=`<div class="tuning-heading"><div><span class="tuning-eyebrow">YOUR KIT · YOUR SOUND</span><h2 id="tuningTitle">내 드럼 만들기</h2></div><button type="button" class="btn" data-close aria-label="드럼 라이브러리 닫기">닫기</button></div>
    <p id="tuningIntro">악기마다 실제 녹음 모델을 골라 나만의 킷을 조합하고 개별 튜닝하세요. 모델 목록과 기존 녹음 뱅크를 함께 사용할 수 있습니다.</p>
    <p class="tuning-bank-status" role="status" aria-live="polite"></p><button type="button" class="btn" data-retry hidden>소리 다시 준비하기</button>
    <div class="tuning-categories" role="group" aria-label="악기 분류"></div>
    <div class="tuning-instrument-row"><label class="tuning-select-label" for="tuningInstrument">선택할 악기</label><select id="tuningInstrument"></select></div>
    <div class="tuning-workspace"><section class="tuning-library" aria-labelledby="soundLibraryTitle"><div class="tuning-section-heading"><h3 id="soundLibraryTitle">01 소리 선택</h3><span>실제 악기 모델 라이브러리</span></div><p class="tuning-source-intro">먼저 들어본 뒤 ‘이 소리 사용’을 누르세요. 후보를 듣는 동안 현재 킷은 바뀌지 않습니다.</p><p class="tuning-library-status" role="status" aria-live="polite"></p><div class="tuning-library-filters"><label for="tuningBrand">제조사<select id="tuningBrand"><option value="">전체 제조사</option></select></label><label for="tuningSearch">모델 검색<input type="search" id="tuningSearch" placeholder="모델명 · 크기 검색" autocomplete="off"></label></div><p class="tuning-model-status" role="status" aria-live="polite"></p><div class="tuning-source-cards"></div><details class="tuning-legacy-banks"><summary>기존 녹음 뱅크</summary><p>모델명이 확인되지 않은 기존 킷 녹음입니다. 모델별 악기 목록과 구분해 계속 사용할 수 있습니다.</p><div class="tuning-bank-cards"></div></details></section>
    <section class="tuning-adjustment" aria-labelledby="tuningAdjustmentTitle"><div class="tuning-section-heading"><h3 id="tuningAdjustmentTitle">02 개별 튜닝</h3></div><p class="tuning-current-source"></p><label class="tuning-audition"><input type="checkbox" data-audition checked> 조절하면서 듣기</label><p class="tuning-character" id="tuningCharacter"></p><div class="tuning-sliders"></div><div class="tuning-actions"><button type="button" class="btn ink" data-preview>선택한 소리 듣기</button><button type="button" class="btn" data-ghost-preview hidden>고스트 듣기</button><button type="button" class="btn" data-open-preview hidden>오픈 하이햇 듣기</button><button type="button" class="btn" data-reset>이 악기 튜닝 초기화</button></div><p class="tuning-status" role="status" aria-live="polite"></p></section></div>
    <section class="tuning-kit-summary" aria-labelledby="myKitTitle"><div class="tuning-section-heading"><h3 id="myKitTitle">나의 조합 킷</h3><span>악기를 눌러 다시 편집</span></div><div class="tuning-kit-pieces"></div><p>소리 선택과 튜닝은 이 브라우저에 자동 저장됩니다. 현재 .ddakung 곡 파일에는 포함되지 않습니다.</p></section>
    <details class="tuning-preset"><summary>전체 킷 프리셋으로 시작하기</summary><p>기본 킷 악기들의 출처를 프리셋으로 바꿉니다. 추가한 스플래시·차이나·스택/FX 모델과 개별 튜닝 값은 유지됩니다.</p><label class="tuning-select-label" for="tuningKit">전체 킷 프리셋</label><select id="tuningKit"><option value="studio-jazz">버추오시티 · 스튜디오 재즈</option></select><button type="button" class="btn" data-apply-preset>기본 킷에 프리셋 적용</button></details>
    <details><summary>샘플과 튜닝 동작 안내</summary><p>실제 녹음의 재생 속도로 음높이를, 필터와 짧은 어택으로 조임을 바꿉니다. 울림 100% 이하는 녹음 꼬리를 짧게 자르고, 100% 초과는 룸 잔향을 더합니다. 녹음을 반복하거나 실제 나사 조임을 물리적으로 재현하지 않습니다. 고스트·일반·액센트는 가장 가까운 세기의 녹음을 고르며, 단일 레이어 녹음에는 추가 세기 녹음이 없습니다. 주법 대체가 있는 소스는 카드에 표시합니다.</p><p>조절 중에는 약 130ms 간격으로 최신 값을 들려주며, 곡 재생 중에는 다음 타격에만 적용합니다. 메트로놈은 바뀌지 않습니다. 전체 드럼 또는 악기 볼륨이 0%이면 미리듣기도 들리지 않습니다.</p></details><button type="button" class="btn tuning-reset-all" data-reset-all>전체 악기 튜닝만 초기화</button>`;
  document.body.append(dialog);
  const select=dialog.querySelector<HTMLSelectElement>('#tuningInstrument')!,kitSelect=dialog.querySelector<HTMLSelectElement>('#tuningKit')!,audition=dialog.querySelector<HTMLInputElement>('[data-audition]')!;
  const status=dialog.querySelector<HTMLElement>('.tuning-status')!,libraryStatus=dialog.querySelector<HTMLElement>('.tuning-library-status')!,cards=dialog.querySelector<HTMLElement>('.tuning-source-cards')!,pieces=dialog.querySelector<HTMLElement>('.tuning-kit-pieces')!;
  const brandSelect=dialog.querySelector<HTMLSelectElement>('#tuningBrand')!,search=dialog.querySelector<HTMLInputElement>('#tuningSearch')!,bankCards=dialog.querySelector<HTMLElement>('.tuning-bank-cards')!,modelStatus=dialog.querySelector<HTMLElement>('.tuning-model-status')!;
  const instruments=api.instruments();let kits:DrumKit[]=[],librarySources:DrumSource[]=[],audioError='',libraryRevision=0,actionRevision=0;
  const kitLabel=(id:string)=>id==='synth'?'합성 대체 소리':kits.find(kit=>kit.id===id)?.label||id;
  categories.forEach((category,index)=>{const item=document.createElement('button');item.type='button';item.className='tuning-category';item.textContent=category.label;item.dataset.category=String(index);item.addEventListener('click',()=>changeInstrument(category.ids[0]));dialog.querySelector('.tuning-categories')!.append(item);});
  const controls:{key:keyof TuningValues;label:string;min:number;max:number;step:number;help:string}[]=[
    {key:'volume',label:'악기 볼륨',min:0,max:200,step:1,help:'100% 원래 크기 · 200% 입력 게인 +6dB · 현재 악기만 조절'},
    {key:'pitch',label:'음높이',min:-12,max:12,step:1,help:'낮게 −12 · 원래 0 · 높게 +12 반음'},
    {key:'resonance',label:'울림 · 룸',min:25,max:200,step:5,help:'25–100% 녹음 꼬리 · 100–200% 룸 잔향'},
    {key:'tension',label:'조임 · 어택',min:-100,max:100,step:5,help:'부드럽게 −100 · 원래 0 · 또렷하게 +100'},
  ];
  const display=(key:keyof TuningValues,value:number)=>key==='pitch'?`${value>0?'+':''}${value} 반음`:key==='volume'||key==='resonance'?`${value}%`:`${value>0?'+':''}${value}`;
  controls.forEach(control=>{const row=document.createElement('div');row.className='tuning-control';row.innerHTML=`<div><label for="tuning-${control.key}">${control.label}</label><output for="tuning-${control.key}"></output></div><input id="tuning-${control.key}" type="range" min="${control.min}" max="${control.max}" step="${control.step}" aria-describedby="tuning-${control.key}-help"><p id="tuning-${control.key}-help">${control.help}</p>`;const input=row.querySelector<HTMLInputElement>('input')!;input.addEventListener('input',()=>{api.set(select.value,{[control.key]:input.valueAsNumber});sync();autoPreview();});dialog.querySelector('.tuning-sliders')!.append(row);});
  instruments.forEach(instrument=>{const piece=document.createElement('button');piece.type='button';piece.className='tuning-kit-piece';piece.dataset.instrument=instrument.id;const name=document.createElement('strong'),source=document.createElement('span');name.textContent=instrument.label;piece.append(name,source);piece.addEventListener('click',()=>changeInstrument(instrument.id));pieces.append(piece);});
  function sync(){
    const current=instruments.find(item=>item.id===select.value);if(!current)return;
    const values=api.get(select.value),state=api.status();
    const volume=dialog.querySelector<HTMLInputElement>('#tuning-volume')!;
    volume.max=String(api.volumeMax(select.value));
    dialog.querySelector('#tuning-volume-help')!.textContent=`100% 원래 크기 · 최대 ${volume.max}% 입력 게인 · 현재 악기만 조절`;
    controls.forEach(({key})=>{const input=dialog.querySelector<HTMLInputElement>(`#tuning-${key}`)!;input.value=String(values[key]);input.setAttribute('aria-valuetext',display(key,values[key]));input.parentElement!.querySelector('output')!.textContent=display(key,values[key]);});
    dialog.querySelector<HTMLElement>('#tuningCharacter')!.textContent=current.metal?'금속 음높이 · 워시 꼬리 · 밝기와 어택':'드럼 음높이 · 꼬리와 룸 · 헤드 어택';
    dialog.querySelector<HTMLElement>('.tuning-current-source')!.textContent=`${current.label} · ${kitLabel(api.sourceFor(current.id))}`;
    dialog.querySelector<HTMLButtonElement>('[data-open-preview]')!.hidden=select.value!=='hihat';
    dialog.querySelector<HTMLButtonElement>('[data-ghost-preview]')!.hidden=select.value!=='snare';
    dialog.querySelector<HTMLButtonElement>('[data-preview]')!.textContent=select.value==='snare'?'일반 타격 듣기':'선택한 소리 듣기';
    dialog.querySelector<HTMLElement>('.tuning-bank-status')!.textContent=state.sourceLoading?`소리 준비 중 ${Math.round(state.sampleProgress*100)}%${state.sampleState==='ready'?' · 현재 조합은 계속 재생됩니다':''}`:state.sampleError?`소리 변경 실패 · ${state.sampleError}${state.sampleState==='ready'?' · 이전 조합 유지':''}`:state.sampleState==='ready'?`${state.kitLabel} · 실제 녹음 준비됨`:state.sampleState==='synth'?'합성 대체 소리 선택됨':'드럼 소리 준비 중';
    dialog.querySelector<HTMLButtonElement>('[data-retry]')!.hidden=!state.sampleError;
    const notices=[!state.storageOk||!state.sourceStorageOk?'설정을 저장하지 못했습니다. 현재 소리는 적용되지만 재실행하면 유지되지 않을 수 있습니다.':'현재 악기 설정 · 이 브라우저에 자동 저장됨',state.muted?'전체 드럼 볼륨이 꺼져 있습니다.':'',values.volume===0?'이 악기 볼륨은 0%입니다.':'',audioError].filter(Boolean);status.textContent=notices.join(' · ');status.classList.toggle('tuning-warning',!!audioError||!state.storageOk||!state.sourceStorageOk||state.muted||values.volume===0);
    dialog.querySelectorAll<HTMLElement>('[data-source]').forEach(card=>{const selected=card.dataset.source===api.sourceFor(select.value);card.classList.toggle('is-selected',selected);const apply=card.querySelector<HTMLButtonElement>('[data-use]')!;apply.disabled=selected||card.dataset.available==='false';apply.textContent=selected?'사용 중':'이 소리 사용';});
    pieces.querySelectorAll<HTMLButtonElement>('button').forEach(piece=>{const id=piece.dataset.instrument!;piece.querySelector('span')!.textContent=kitLabel(api.sourceFor(id));piece.classList.toggle('is-selected',id===select.value);});
  }
  function autoPreview(){if(audition.checked&&dialog.open)api.audition(select.value);}
  function renderSources(){
    const id=select.value,current=instruments.find(item=>item.id===id)!;
    const available=librarySources.filter(source=>source.available);
    const models=modelSources(available,id,brandSelect.value,search.value);
    cards.replaceChildren();bankCards.replaceChildren();
    modelStatus.textContent=models.length?`${current.label} · ${models.length}개 모델·음색`:modelSources(available,id).length?'검색 조건에 맞는 모델이 없습니다.':'이 악기의 모델별 녹음은 아직 없습니다. 아래 기존 녹음 뱅크를 이용하세요.';
    for(const source of [...models,...presetSources(librarySources).filter(source=>source.available||source.loadError)]){
      const card=document.createElement('article');card.className='tuning-source-card';card.dataset.source=source.id;card.dataset.available=String(source.available);
      const heading=document.createElement('h4');heading.textContent=source.kind==='instrument'?source.model||source.label:source.label;
      const identity=document.createElement('p');identity.className='tuning-source-identity';identity.textContent=(source.scope==='personal'?'이 PC · ':'')+(source.kind==='instrument'?[source.brand,source.size].filter(Boolean).join(' · '):'기존 녹음 뱅크');
      const description=document.createElement('p');description.className='tuning-source-description';description.textContent=source.descriptionKo||source.description||'';
      const specs=document.createElement('p');specs.className='tuning-source-specs';specs.textContent=source.available?`${source.layers}개 세기 레이어${source.alternates>1?` · 같은 세기 최대 ${source.alternates}개 녹음`: ' · 같은 세기 추가 녹음 없음'} · ${source.articulations.map(key=>key==='crash'&&source.kind==='instrument'?'타격':articulations[key]||key).join(' / ')}`:`목록 불러오기 실패 · ${source.loadError||'녹음 없음'}`;
      const warnings=document.createElement('p');warnings.className='tuning-source-warning';warnings.textContent=source.warnings.map(sourceWarning).join(' · ');warnings.hidden=!source.warnings.length;
      const actions=document.createElement('div');actions.className='tuning-source-actions';
      const listen=document.createElement('button');listen.type='button';listen.className='btn';listen.textContent='듣기';listen.setAttribute('aria-label',`${source.label} ${current.label} 후보 듣기`);listen.disabled=!source.available;
      listen.addEventListener('click',async()=>{const action=++actionRevision;libraryStatus.textContent=`${source.label} · 이 악기 샘플만 준비 중…`;try{const played=await api.auditionSource(id,source.id);if(action===actionRevision&&id===select.value)libraryStatus.textContent=played?`후보 미리듣기 · ${source.label} · 현재 조합은 그대로입니다`:'후보 미리듣기가 취소되었습니다.';}catch(error){if(action===actionRevision&&id===select.value)libraryStatus.textContent=`미리듣기 실패 · ${(error as Error).message}`;}});
      const apply=document.createElement('button');apply.type='button';apply.className='btn ink';apply.dataset.use='';apply.textContent='이 소리 사용';apply.setAttribute('aria-label',`${source.label} ${current.label}에 사용`);apply.disabled=!source.available;
      apply.addEventListener('click',async()=>{const action=++actionRevision;libraryStatus.textContent=`${source.label} · ${current.label} 소리 적용 중…`;try{const committed=await api.chooseSource(id,source.id);if(action!==actionRevision||id!==select.value)return;if(committed){libraryStatus.textContent=`${source.label} 적용됨 · 이 악기의 튜닝 값은 유지됩니다`;autoPreview();}sync();}catch(error){if(action===actionRevision&&id===select.value)libraryStatus.textContent=`변경 실패 · 이전 소리 유지 · ${(error as Error).message}`;sync();}});
      actions.append(listen,apply);const credit=document.createElement('a');credit.href=source.source||'#';credit.target='_blank';credit.rel='noopener noreferrer';credit.textContent=source.license?`녹음 출처 · ${source.license}`:'녹음 출처';card.append(identity,heading,description,specs,warnings,actions,credit);(source.kind==='instrument'?cards:bankCards).append(card);
    }
    const failed=librarySources.filter(source=>source.kind==='instrument'&&source.loadError);
    if(failed.length){const notice=document.createElement('p');notice.className='tuning-source-warning';notice.textContent=`모델 목록 일부를 불러오지 못했습니다: ${failed.map(source=>source.label).join(', ')}. 악기를 다시 선택해 재시도하세요.`;cards.append(notice);}
    sync();
  }
  async function refreshSources(){
    const revision=++libraryRevision,id=select.value;librarySources=[];cards.replaceChildren();bankCards.replaceChildren();modelStatus.textContent='';brandSelect.disabled=true;search.disabled=true;libraryStatus.textContent='이 악기의 실제 모델과 녹음 뱅크를 찾는 중…';
    try{const sources=await api.getSources(id);if(revision!==libraryRevision)return;librarySources=sources;
      const brands=[...new Set(modelSources(sources.filter(source=>source.available),id).map(source=>source.brand).filter((brand):brand is string=>!!brand))].sort((a,b)=>a.localeCompare(b));
      brandSelect.replaceChildren(new Option('전체 제조사',''),...brands.map(brand=>new Option(brand,brand)));brandSelect.disabled=false;search.disabled=false;
      const hasModels=modelSources(sources.filter(source=>source.available),id).length>0;
      dialog.querySelector<HTMLDetailsElement>('.tuning-legacy-banks')!.open=!hasModels;
      libraryStatus.textContent=`${instruments.find(item=>item.id===id)!.label} · ${sources.filter(source=>source.available).length}개 소스 · 후보 듣기는 선택을 바꾸지 않습니다`;renderSources();
    }catch(error){if(revision===libraryRevision){libraryStatus.textContent=`라이브러리를 불러오지 못했습니다 · ${(error as Error).message}`;modelStatus.textContent='악기를 다시 선택해 재시도하세요.';}}
  }
  brandSelect.addEventListener('change',renderSources);search.addEventListener('input',renderSources);
  function changeInstrument(id:string){search.value='';brandSelect.value='';api.cancelAudition();actionRevision++;audioError='';const categoryIndex=categories.findIndex(category=>category.ids.includes(id));const category=categories[categoryIndex];select.replaceChildren(...category.ids.map(key=>new Option(instruments.find(item=>item.id===key)!.label,key)));select.value=id;dialog.querySelectorAll<HTMLButtonElement>('[data-category]').forEach(item=>item.setAttribute('aria-pressed',String(Number(item.dataset.category)===categoryIndex)));sync();if(dialog.open){void refreshSources();autoPreview();}}
  async function refreshCatalog(){try{const catalog=await api.catalog();kits=catalog.kits;const previous=kitSelect.value;const presets=presetSources(kits);kitSelect.replaceChildren(...presets.map(kit=>new Option(kit.label,kit.id)),new Option('합성 드럼 · 대체 소리','synth'));kitSelect.value=presets.some(kit=>kit.id===previous)?previous:presets.find(kit=>kit.id==='studio-jazz')?.id||presets[0]?.id||'synth';sync();}catch{audioError='샘플 목록을 불러오지 못했습니다.';sync();}}
  async function preview(variant?:'open'|'ghost'){audioError='';try{await api.preview(select.value,variant);}catch(error){audioError=(error as Error).message||'소리를 시작하지 못했습니다.';}sync();}
  changeInstrument('kick');
  button.addEventListener('click',()=>{audioError='';void api.resume().catch(()=>{});sync();dialog.showModal();void refreshCatalog();void refreshSources();autoPreview();});
  dialog.querySelector('[data-close]')!.addEventListener('click',()=>dialog.close());select.addEventListener('change',()=>changeInstrument(select.value));
  audition.addEventListener('change',()=>{if(audition.checked)autoPreview();else api.cancelAudition();});
  dialog.querySelector('[data-apply-preset]')!.addEventListener('click',async()=>{audioError='';void api.resume().catch(()=>{});try{await api.loadKit(kitSelect.value);libraryStatus.textContent='기본 킷의 소리 출처를 프리셋으로 변경했습니다. 추가 심벌과 개별 튜닝은 유지됩니다.';autoPreview();}catch(error){audioError=(error as Error).message;}sync();});
  dialog.querySelector('[data-retry]')!.addEventListener('click',async()=>{try{await api.retrySources();void refreshCatalog();void refreshSources();autoPreview();}catch(error){audioError=(error as Error).message;}sync();});
  dialog.querySelector('[data-preview]')!.addEventListener('click',()=>{void preview();});dialog.querySelector('[data-open-preview]')!.addEventListener('click',()=>{void preview('open');});
  dialog.querySelector('[data-ghost-preview]')!.addEventListener('click',()=>{void preview('ghost');});
  dialog.querySelector('[data-reset]')!.addEventListener('click',()=>{api.reset(select.value);sync();autoPreview();});dialog.querySelector('[data-reset-all]')!.addEventListener('click',()=>{api.reset();sync();autoPreview();});
  dialog.addEventListener('keydown',event=>{if(event.key!=='Escape')event.stopPropagation();});dialog.addEventListener('close',()=>{api.cancelAudition();actionRevision++;libraryRevision++;button.focus();});
  window.addEventListener('ddakung-tuning-change',()=>{if(dialog.open)sync();});
  function bankIndicator(){const state=api.status();button.textContent=state.sourceLoading?`드럼 준비 ${Math.round(state.sampleProgress*100)}%`:state.sampleState==='error'?'소리 준비 실패 · 내 드럼':'내 드럼 만들기';if(dialog.open)sync();}
  bankIndicator();window.addEventListener('ddakung-samples-change',bankIndicator);
  window.addEventListener('ddakung-audio-error',event=>{audioError=(event as CustomEvent<string>).detail;sync();if(!dialog.open){dialog.showModal();void refreshCatalog();void refreshSources();}});
}
