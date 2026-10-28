import './styles/rhythm.css';

type Feel={bounceEnabled:boolean;bounce:number;bounceSubdivision:2|4;nuanceEnabled:boolean;nuance:number;storageOk:boolean};
type Voice='hand'|'foot'|'both';
type Division={division:number;label:string;name?:string;isTuplet:boolean};
type Beat={beat:number;number:number;quarterLength:number;compound:boolean;divisions:{hand:number;foot:number};allowed:Division[]};
type Context={measure:number;beat:number;voices:string[];beats:Beat[]};
type Options={measure:number;beat:number;voice:Voice;division:number;scope:'beat'|'measure'};
type Conflict={beat:number;voice:string};
type Plan={ok:boolean;canApply:boolean;changed:boolean;conflicts:Conflict[];targets:unknown[];safeTargets:unknown[];targetCount:number;reason?:string};
type Result=Plan&{applied:boolean;appliedCount:number;skippedCount:number};
declare global {interface Window {
  ddakungGroove:{get():Feel;set(values:Partial<Feel>):Feel;reset():Feel};
  ddakungTuplets:{context():Context;inspect(options:Options):Plan;apply(options:Options,policy?:'cancel'|'safe-only'):Result};
}}
const patternNames:Record<number,string>={4:'4분할 · 한 묶음에 넷',8:'8분할 · 한 묶음에 여덟',3:'3연음 · 한 박에 셋',6:'6연음 · 한 박에 여섯',23:'16분 둘 + 3연음',32:'3연음 + 16분 둘',13:'8분 하나 + 3연음',31:'3연음 + 8분 하나',33:'3연음 + 3연음'};
const patterns=[4,8,3,6,23,32,13,31,33];

export function installRhythmTools():void {
  if(document.getElementById('rhythmTools'))return;
  const groove=window.ddakungGroove,tuplets=window.ddakungTuplets;
  if(!groove||!tuplets)throw Error('Rhythm tools unavailable');
  const row=document.createElement('div');row.id='rhythmTools';row.className='rhythm-tools';
  row.innerHTML=`<div role="group" aria-label="음표 분할"><span>음표 분할</span><button type="button" data-tuplet="8" aria-haspopup="dialog" aria-controls="tupletDialog">32분음표</button><button type="button" data-tuplet="3" aria-haspopup="dialog" aria-controls="tupletDialog">3연음</button><button type="button" data-tuplet="6" aria-haspopup="dialog" aria-controls="tupletDialog">6연음</button><button type="button" data-beam aria-pressed="false" title="타격 위치를 정확히 합칠 수 있는 마디에서 킥과 손 음표의 빔을 합칩니다">킥 빔 합치기</button></div><div role="group" aria-label="재생 느낌"><span>재생 느낌</span><button type="button" data-bounce aria-pressed="false">바운스</button><button type="button" data-nuance aria-pressed="false">뉘앙스</button><button type="button" data-feel-settings aria-haspopup="dialog" aria-controls="feelDialog">강도 조절</button></div><span class="rhythm-storage" role="status"></span>`;
  document.getElementById('artRow')!.before(row);
  row.addEventListener('keydown',event=>{if(event.code==='Space')event.stopPropagation();});
  const beam=row.querySelector<HTMLButtonElement>('[data-beam]')!;
  function syncBeam(){const merged=!!document.querySelector('#stemScope [data-stems="merge"].sel');beam.setAttribute('aria-pressed',String(merged));beam.textContent=merged?'킥 빔 합치기 켬':'킥 빔 합치기';}
  beam.addEventListener('click',()=>{const merged=beam.getAttribute('aria-pressed')==='true';document.querySelector<HTMLButtonElement>(`#stemScope [data-stems="${merged?'split':'merge'}"]`)?.click();syncBeam();});
  const stemControls=document.getElementById('stemScope');if(stemControls)new MutationObserver(syncBeam).observe(stemControls,{subtree:true,attributes:true,attributeFilter:['class']});syncBeam();
  const feel=document.createElement('dialog');feel.id='feelDialog';feel.className='rhythm-dialog';feel.setAttribute('aria-labelledby','feelTitle');
  feel.innerHTML=`<header><div><span class="rhythm-eyebrow">PLAYBACK FEEL</span><h2 id="feelTitle">재생 느낌</h2></div><button type="button" data-close>닫기</button></header><p>악보와 BPM은 그대로 두고 연주감만 바꿉니다. 메트로놈과 직접 입력 미리듣기는 원래 박을 유지합니다.</p><section><label class="rhythm-toggle"><input type="checkbox" data-enabled="bounce"> 바운스</label><p>엇박을 조금 늦춰 흔들림을 만듭니다. 3·6연음, 섞어 나누기와 복합박에는 추가 스윙을 적용하지 않습니다.</p><label for="bounceSubdivision">바운스 기준</label><select id="bounceSubdivision"><option value="2">8분음표 기준</option><option value="4">16분음표 기준</option></select><label for="bounceStrength">바운스 강도 <output data-value="bounce"></output></label><input id="bounceStrength" type="range" min="0" max="100" value="50" data-strength="bounce"><p>재생 중 바운스 변경은 다음 마디부터 반영됩니다.</p></section><section><label class="rhythm-toggle"><input type="checkbox" data-enabled="nuance"> 뉘앙스</label><p>타격마다 작은 강약 차이를 줍니다. 고스트·일반·액센트의 구분과 반복할 때의 일관성을 유지합니다.</p><label for="nuanceStrength">뉘앙스 강도 <output data-value="nuance"></output></label><input id="nuanceStrength" type="range" min="0" max="100" value="50" data-strength="nuance"><p>다음에 예약되는 타격부터 반영됩니다.</p></section><p class="rhythm-result" role="status"></p><button type="button" data-reset>재생 느낌 초기화</button>`;
  const tuplet=document.createElement('dialog');tuplet.id='tupletDialog';tuplet.className='rhythm-dialog';tuplet.setAttribute('aria-labelledby','tupletTitle');
  tuplet.innerHTML=`<header><div><span class="rhythm-eyebrow">RHYTHM NOTATION</span><h2 id="tupletTitle">음표 분할 · 연음 입력</h2></div><button type="button" data-close>닫기</button></header><p>32분음표는 4분음표 한 박을 여덟 칸으로 나누고 세 줄 빔으로 표시합니다. 3·6연음과 반박 혼합 분할도 선택할 수 있습니다.</p><p class="tuplet-context"></p><div class="rhythm-fields"><label for="tupletBeat">적용할 박<select id="tupletBeat"></select></label><label for="tupletVoice">악기 범위<select id="tupletVoice"><option value="both">손과 발</option><option value="hand">손 악기</option><option value="foot">발 악기</option></select></label><label for="tupletScope">적용 범위<select id="tupletScope"><option value="beat">선택한 박</option><option value="measure">현재 마디 전체</option></select></label><label for="tupletPattern">음표 묶음<select id="tupletPattern"></select></label></div><p class="tuplet-meter"></p><p>기존 타격 시점과 주법을 유지할 수 있는 범위만 바꿉니다. 분할을 바꾸면 음표 길이와 빔 묶음은 새 분할에 따라 달라질 수 있습니다.</p><div class="tuplet-plan" role="status" aria-live="polite"></div><div class="rhythm-actions"><button type="button" class="primary" data-apply>이 분할 적용</button><button type="button" data-safe hidden>가능한 범위만 적용</button></div><p class="rhythm-result" role="status"></p><details><summary>사진처럼 손·발을 함께 묶으려면</summary><p>손과 발의 실제 타격 위치를 공통 묶음으로 표현할 수 있으면 한 빔으로 잇습니다. 정확히 합칠 수 없는 폴리리듬은 성부를 나눕니다.</p><button type="button" data-merge>손·발 빔 합치기</button></details>`;
  document.body.append(feel,tuplet);
  const example=document.createElement('a');example.className='rhythm-example';example.href='/examples/tuplet-reference.ddakung.json';example.download='tuplet-reference.ddakung.json';example.textContent='사진 방식의 3·6연음 예시 악보 내려받기';tuplet.append(example);
  let opener:HTMLButtonElement|null=null,current:Context|null=null,fixed32=false;
  for(const dialog of [feel,tuplet]){
    dialog.querySelector('[data-close]')!.addEventListener('click',()=>dialog.close());
    dialog.addEventListener('keydown',event=>{if(event.key!=='Escape')event.stopPropagation();});
    dialog.addEventListener('close',()=>opener?.focus());
  }
  function syncFeel(){
    const state=groove.get();
    feel.querySelector<HTMLSelectElement>('#bounceSubdivision')!.value=String(state.bounceSubdivision);
    for(const kind of ['bounce','nuance'] as const){
      const enabled=kind==='bounce'?state.bounceEnabled:state.nuanceEnabled;
      const toggle=row.querySelector<HTMLButtonElement>(`[data-${kind}]`)!;
      toggle.setAttribute('aria-pressed',String(enabled));toggle.textContent=`${kind==='bounce'?'바운스':'뉘앙스'}${enabled?' 켬':''}`;
      feel.querySelector<HTMLInputElement>(`[data-enabled="${kind}"]`)!.checked=enabled;
      const range=feel.querySelector<HTMLInputElement>(`[data-strength="${kind}"]`)!;range.value=String(state[kind]);range.setAttribute('aria-valuetext',`${state[kind]}%`);
      feel.querySelector<HTMLOutputElement>(`[data-value="${kind}"]`)!.value=`${state[kind]}%`;
    }
    const message=state.storageOk?'이 브라우저에 저장됩니다. 곡의 음표 데이터는 바뀌지 않습니다.':'설정을 저장하지 못했습니다. 현재 재생에는 적용되지만 다시 열면 유지되지 않을 수 있습니다.';
    feel.querySelector('.rhythm-result')!.textContent=message;
    row.querySelector('.rhythm-storage')!.textContent=state.storageOk?'':'재생 설정 저장 실패';
  }
  row.querySelector('[data-bounce]')!.addEventListener('click',()=>{const state=groove.get();groove.set({bounceEnabled:!state.bounceEnabled});});
  row.querySelector('[data-nuance]')!.addEventListener('click',()=>{const state=groove.get();groove.set({nuanceEnabled:!state.nuanceEnabled});});
  row.querySelector('[data-feel-settings]')!.addEventListener('click',event=>{opener=event.currentTarget as HTMLButtonElement;syncFeel();feel.showModal();});
  for(const kind of ['bounce','nuance'] as const){
    feel.querySelector<HTMLInputElement>(`[data-enabled="${kind}"]`)!.addEventListener('change',event=>groove.set(kind==='bounce'?{bounceEnabled:(event.target as HTMLInputElement).checked}:{nuanceEnabled:(event.target as HTMLInputElement).checked}));
    feel.querySelector<HTMLInputElement>(`[data-strength="${kind}"]`)!.addEventListener('input',event=>groove.set({[kind]:(event.target as HTMLInputElement).valueAsNumber}));
  }
  feel.querySelector('[data-reset]')!.addEventListener('click',()=>groove.reset());
  feel.querySelector<HTMLSelectElement>('#bounceSubdivision')!.addEventListener('change',event=>groove.set({bounceSubdivision:Number((event.target as HTMLSelectElement).value) as 2|4}));
  window.addEventListener('ddakung-groove-change',syncFeel);syncFeel();
  const beat=tuplet.querySelector<HTMLSelectElement>('#tupletBeat')!,voice=tuplet.querySelector<HTMLSelectElement>('#tupletVoice')!,scope=tuplet.querySelector<HTMLSelectElement>('#tupletScope')!,pattern=tuplet.querySelector<HTMLSelectElement>('#tupletPattern')!;
  function options():Options{return {measure:current!.measure,beat:Number(beat.value),voice:voice.value as Voice,scope:scope.value as Options['scope'],division:Number(pattern.value)};}
  function allowedPatterns(){
    const targets=scope.value==='measure'?current!.beats:current!.beats.filter(item=>item.beat===Number(beat.value));
    return patterns.filter(division=>targets.length&&targets.every(item=>(!fixed32||division===item.quarterLength*8)&&item.allowed.some(option=>option.division===division)));
  }
  function renderPlan(refreshPatterns=false){
    if(!current)return;
    if(refreshPatterns){const previous=Number(pattern.value),allowed=allowedPatterns();pattern.replaceChildren(...allowed.map(division=>new Option(fixed32?`32분음표 · ${division}칸`:patternNames[division],String(division))));pattern.value=String(allowed.includes(previous)?previous:allowed[0]);}
    beat.disabled=scope.value==='measure';
    const plan=tuplets.inspect(options()),panel=tuplet.querySelector('.tuplet-plan')!,apply=tuplet.querySelector<HTMLButtonElement>('[data-apply]')!,safe=tuplet.querySelector<HTMLButtonElement>('[data-safe]')!;
    if(fixed32&&!pattern.value){panel.textContent='현재 범위의 박 묶음에서는 32분음표 분할을 지원하지 않습니다. 박 묶음이나 적용 범위를 바꿔 주세요.';}
    else if(!plan.ok){panel.textContent=plan.reason==='stale-context'?'선택한 마디가 바뀌었습니다. 이 창을 닫고 다시 선택하세요.':fixed32?'현재 범위의 박 묶음에서는 32분음표 분할을 지원하지 않습니다. 박 묶음이나 적용 범위를 바꿔 주세요.':'현재 박자에서 사용할 수 없는 분할입니다.';}
    else if(plan.conflicts.length){const names=[...new Set(plan.conflicts.map(item=>`${current!.beats.find(beat=>beat.beat===item.beat)?.number??item.beat+1}박 ${item.voice==='hand'?'손':'발'}`))];panel.textContent=`${names.join(', ')}: 기존 타격 시점을 이 분할로 유지할 수 없어 그대로 둡니다. 가능한 범위만 적용하거나 다른 묶음을 선택하세요.`;}
    else panel.textContent=plan.changed?'기존 타격 시점을 유지하며 분할을 바꿀 수 있습니다.':'이미 이 분할입니다.';
    apply.disabled=!pattern.value||!plan.ok||!plan.canApply||!plan.changed;safe.hidden=!pattern.value||!plan.ok||!plan.conflicts.length;safe.disabled=!pattern.value||!plan.changed||!plan.safeTargets.length;
    const selected=current.beats.filter(item=>scope.value==='measure'||item.beat===Number(beat.value));
    tuplet.querySelector('.tuplet-meter')!.textContent=fixed32?'32분음표 간격 · 세 줄 빔 · 연음 숫자 없음.':selected.some(item=>item.compound)?'점4분 박의 3·6분할은 기본 분할이므로 연음 숫자가 붙지 않습니다.':Number(pattern.value)===8?'8분할 · 실제 음표 길이는 박 묶음 길이에 따릅니다.':Number(pattern.value)===4?'4분할 · 실제 음표 길이는 박 묶음 길이에 따릅니다.':'일반 박은 연음 묶음 위에 3·6 숫자를 표시합니다.';
  }
  for(const select of [beat,voice,scope,pattern])select.addEventListener('change',()=>{tuplet.querySelector('.rhythm-result')!.textContent='';renderPlan(select!==pattern);});
  row.querySelectorAll<HTMLButtonElement>('[data-tuplet]').forEach(button=>button.addEventListener('click',()=>{
    opener=button;current=tuplets.context();fixed32=button.dataset.tuplet==='8';beat.replaceChildren(...current.beats.map(item=>new Option(`${item.number}박`,String(item.beat))));beat.value=String(current.beat);voice.value='both';scope.value='beat';pattern.replaceChildren(...patterns.map(division=>new Option(patternNames[division],String(division))));pattern.value=button.dataset.tuplet!;
    tuplet.querySelector('.tuplet-context')!.textContent=`${current.measure+1}마디 · 선택한 박의 분할을 편집합니다.`;tuplet.querySelector('.rhythm-result')!.textContent='';renderPlan(true);tuplet.showModal();
  }));
  function applyTuplets(policy:'cancel'|'safe-only'){
    if(!current)return;
    const result=tuplets.apply(options(),policy);
    renderPlan();
    tuplet.querySelector('.rhythm-result')!.textContent=result.applied?`${result.appliedCount}개 분할 적용${result.skippedCount?` · ${result.skippedCount}개 범위는 기존 음표 유지`:''}. 되돌리기로 복구할 수 있습니다.`:result.reason==='stale-context'?'선택한 마디가 바뀌어 적용하지 않았습니다.':'기존 음표를 바꾸지 않았습니다. 적용 범위를 확인하세요.';
  }
  tuplet.querySelector('[data-apply]')!.addEventListener('click',()=>applyTuplets('cancel'));
  tuplet.querySelector('[data-safe]')!.addEventListener('click',()=>applyTuplets('safe-only'));
  tuplet.querySelector('[data-merge]')!.addEventListener('click',()=>{document.querySelector<HTMLButtonElement>('#stemScope [data-stems="merge"]')?.click();tuplet.querySelector('.rhythm-result')!.textContent='타격 위치를 정확히 합칠 수 있는 마디는 한 빔으로 표시합니다.';});
}
