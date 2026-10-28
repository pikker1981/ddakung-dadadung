import { validateRecognition, recognitionToScore, type RecognitionResult } from './image-score';
import './styles/image-import.css';

type Health={available:boolean;token:string;error?:string};
type Job={id:string;state:'queued'|'running'|'succeeded'|'failed'|'cancelled';result?:unknown;error?:string};
const instruments:Record<string,string>={crash:'크래쉬',splash:'스플래시',china:'차이나',fx:'이펙트·스택',hihat:'하이햇',ride:'라이드',tom1:'하이 탐',tom2:'미드 탐',snare:'스네어',ftom:'플로어 탐',kick:'킥',hihatFoot:'하이햇 페달'};
const arts:Record<string,string>={normal:'기본',ghost:'고스트',accent:'액센트',open:'오픈',xstick:'크로스스틱',rim:'림샷',choke:'닫음',bell:'벨'};
function selectItems(values:Record<string,string>,selected:string){return Object.entries(values).map(([value,label])=>{const option=document.createElement('option');option.value=value;option.textContent=label;option.selected=value===selected;return option;});}

export function installImageImport(){
  const trigger=document.createElement('button');trigger.id='imageImportButton';trigger.type='button';trigger.textContent='이미지 악보';trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-controls','imageImportDialog');
  document.getElementById('loadBtn')!.after(trigger);
  const dialog=document.createElement('dialog');dialog.id='imageImportDialog';dialog.className='rhythm-dialog image-import';dialog.setAttribute('aria-labelledby','imageImportTitle');
  dialog.innerHTML=`<header><div><span class="rhythm-eyebrow">IMAGE TO SCORE · PC</span><h2 id="imageImportTitle">이미지에서 드럼 악보로</h2></div><button type="button" data-close>닫기</button></header>
    <p>이미지를 읽고, 마디별로 확인한 뒤 새 곡으로 가져옵니다. 인식 결과에는 오류가 있을 수 있습니다.</p>
    <p class="image-connection" role="status">PC 연결 확인 중…</p><button type="button" data-reconnect>PC 연결 다시 확인</button>
    <div class="image-import-grid"><section class="image-source"><h3>원본 이미지</h3><label class="image-file-label">악보 이미지 선택<input type="file" accept="image/png,image/jpeg" data-file></label><p>PNG · JPG, 최대 12MB. 선명한 인쇄 악보부터 사용하세요.</p>
    <div class="image-paper"><img data-image hidden alt="인식에 사용할 악보 영역"><span data-empty>악보 이미지를 선택하세요</span></div>
    <fieldset data-crop><legend>악보 영역 자르기 (%)</legend><div class="image-crop-fields"><label>왼쪽<input data-crop-field="left" type="number" min="0" max="99" value="0"></label><label>위쪽<input data-crop-field="top" type="number" min="0" max="99" value="0"></label><label>너비<input data-crop-field="width" type="number" min="1" max="100" value="100"></label><label>높이<input data-crop-field="height" type="number" min="1" max="100" value="100"></label></div><div class="rhythm-actions"><button type="button" data-rotate>오른쪽으로 90° 회전</button><button type="button" data-reset-crop>영역 초기화</button></div></fieldset>
    <p>‘인식 시작’을 누르면 선택한 영역이 이 PC의 Codex CLI로 전달됩니다. CLI는 로그인된 계정의 온라인 모델을 사용하며 계정 사용량에 포함됩니다. 별도 API 키는 필요 없습니다.</p>
    <div class="rhythm-actions"><button type="button" class="primary" data-recognize disabled>인식 시작</button><button type="button" data-cancel hidden>인식 취소</button></div><p data-status role="status" aria-live="polite"></p></section>
    <section class="image-review"><h3>인식 결과 검토</h3><p data-review-empty>인식이 끝나면 마디별 음표와 불확실한 부분을 여기에서 수정할 수 있습니다.</p>
    <div data-review hidden><div class="image-meta"><label>곡 이름<input data-title maxlength="120"></label><label>BPM<input data-bpm type="number" min="20" max="300"></label></div><p data-meter></p><label>검토할 마디<select data-bar></select></label><p>위치는 마디 시작부터 센 48분할 단위입니다. 1박 = 48, 16분 = 12, 32분 = 6, 3연음 = 16, 6연음 = 8.</p><div data-warnings role="status"></div><div class="image-note-list"></div><button type="button" data-add-note>음표 추가</button>
    <details><summary>마디의 음표를 표로 검토</summary><p>악기·위치·길이·주법·손 순서를 수정하세요. 음표 길이는 가져온 뒤 다음 타격·쉼표와 앱의 빔 규칙에 따라 표시될 수 있습니다.</p></details>
    <p data-conversion role="status"></p><label class="image-confirm"><input type="checkbox" data-checked>원본과 비교했고 불확실한 부분을 확인했습니다.</label><div class="rhythm-actions"><button type="button" class="primary" data-import disabled>새 곡으로 가져오기</button><button type="button" data-download disabled>검토 결과 파일 저장</button></div></div></section></div>`;
  document.body.append(dialog);
  const q=<T extends HTMLElement>(selector:string)=>dialog.querySelector<T>(selector)!;
  let health:Health|null=null,original:HTMLImageElement|null=null,angle=0,imageDataUrl='',filename='',recognition:RecognitionResult|null=null,jobId='',running=false,generation=0,imageRevision=0,imageValid=false,pollTimer=0,ticker=0,started=0;
  const crop={left:0,top:0,width:100,height:100};
  const isLocal=['127.0.0.1','localhost'].includes(location.hostname)||(location.protocol==='ddakung:'&&location.hostname==='app');
  const setStatus=(message:string)=>{q('[data-status]').textContent=message;};
  async function request<T>(path:string,options:RequestInit={}):Promise<T>{
    const response=await fetch(`/local-omr${path}`,{...options,signal:AbortSignal.timeout(12000),headers:{'Content-Type':'application/json',...(health?{'X-OMR-Token':health.token}:{}),...options.headers}});
    if(!response.ok){const payload=await response.json().catch(()=>null);throw Error(payload?.error||`PC 연결 오류 (${response.status}). PC 실행 프로그램을 확인하세요.`);}
    return response.json() as Promise<T>;
  }
  function busy(value:boolean){running=value;q<HTMLButtonElement>('[data-recognize]').disabled=value||!imageValid||!health?.available;q<HTMLButtonElement>('[data-cancel]').hidden=!value;q<HTMLInputElement>('[data-file]').disabled=value;q<HTMLFieldSetElement>('[data-crop]').disabled=value;}
  async function connect(){
    if(!isLocal){q('.image-connection').textContent='이미지 인식은 PC 로컬 실행 화면에서 사용할 수 있습니다. PC 실행 프로그램으로 작업실을 여세요.';busy(false);return;}
    try{health=await request<Health>('/health');q('.image-connection').textContent=health.available?'PC 연결됨 · Codex CLI 준비됨':health.error||'Codex CLI를 찾지 못했습니다. PC에서 Codex 설치·로그인을 확인하세요.';}
    catch{health=null;q('.image-connection').textContent='PC 연결 프로그램이 꺼져 있습니다. 프로젝트 폴더에서 npm run pc로 실행한 뒤 다시 확인하세요.';}
    busy(running);
  }
  function clearReview(){recognition=null;q('[data-review]').hidden=true;q('[data-review-empty]').hidden=false;q<HTMLInputElement>('[data-checked]').checked=false;}
  function prepareImage(){
    if(!original)return;
    const w=original.naturalWidth,h=original.naturalHeight;
    const source=document.createElement('canvas');source.width=angle%180?h:w;source.height=angle%180?w:h;
    const ctx=source.getContext('2d')!;ctx.fillStyle='#fff';ctx.fillRect(0,0,source.width,source.height);ctx.translate(source.width/2,source.height/2);ctx.rotate(angle*Math.PI/180);ctx.drawImage(original,-w/2,-h/2);
    const sw=source.width*crop.width/100,sh=source.height*crop.height/100,scale=Math.min(1,3000/Math.max(sw,sh));
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(sw*scale));canvas.height=Math.max(1,Math.round(sh*scale));
    canvas.getContext('2d')!.drawImage(source,source.width*crop.left/100,source.height*crop.top/100,sw,sh,0,0,canvas.width,canvas.height);
    imageDataUrl=canvas.toDataURL('image/png');if(imageDataUrl.length>10*1024*1024)imageDataUrl=canvas.toDataURL('image/jpeg',0.9);
    q<HTMLImageElement>('[data-image]').src=imageDataUrl;q('[data-image]').hidden=false;q('[data-empty]').hidden=true;imageValid=true;clearReview();busy(false);
    setStatus(`${canvas.width} × ${canvas.height} · 이 영역을 인식합니다.`);
  }
  function resetCrop(){Object.assign(crop,{left:0,top:0,width:100,height:100});for(const input of dialog.querySelectorAll<HTMLInputElement>('[data-crop-field]'))input.value=String(crop[input.dataset.cropField as keyof typeof crop]);}
  q<HTMLInputElement>('[data-file]').addEventListener('change',async event=>{
    const file=(event.target as HTMLInputElement).files?.[0];if(!file)return;
    const revision=++imageRevision;clearReview();original=null;imageDataUrl='';imageValid=false;q('[data-image]').hidden=true;q('[data-empty]').hidden=false;busy(false);
    if(!['image/png','image/jpeg'].includes(file.type)||file.size>12*1024*1024){setStatus('12MB 이하의 PNG 또는 JPG 이미지를 선택하세요.');return;}
    const objectUrl=URL.createObjectURL(file),image=new Image();
    try{image.src=objectUrl;await image.decode();if(revision!==imageRevision)return;if(image.naturalWidth*image.naturalHeight>40000000)throw Error('이미지가 너무 큽니다. 4천만 화소 이하로 줄여 주세요.');original=image;filename=file.name;angle=0;resetCrop();prepareImage();}
    catch(error){setStatus(error instanceof Error?error.message:'이미지 파일을 읽을 수 없습니다.');}finally{URL.revokeObjectURL(objectUrl);}
  });
  q('[data-crop]').addEventListener('change',()=>{
    const next={...crop};for(const input of dialog.querySelectorAll<HTMLInputElement>('[data-crop-field]'))next[input.dataset.cropField as keyof typeof crop]=input.valueAsNumber;
    if(Object.values(next).some(v=>!Number.isFinite(v))||next.left<0||next.top<0||next.width<=0||next.height<=0||next.left+next.width>100||next.top+next.height>100){imageValid=false;clearReview();busy(false);setStatus('자르기 영역이 이미지 안에 들어오도록 값을 조정하세요.');return;}
    Object.assign(crop,next);prepareImage();
  });
  q('[data-rotate]').addEventListener('click',()=>{angle=(angle+90)%360;resetCrop();prepareImage();});q('[data-reset-crop]').addEventListener('click',()=>{resetCrop();prepareImage();});
  function stopTimers(){window.clearTimeout(pollTimer);window.clearInterval(ticker);}
  function updateConversion(){
    if(!recognition)return;
    try{const conversion=recognitionToScore(recognition);q('[data-conversion]').textContent=conversion.warnings.length?conversion.warnings.join(' · '):'현재 설정으로 가져올 수 있습니다.';q<HTMLButtonElement>('[data-import]').disabled=!q<HTMLInputElement>('[data-checked]').checked;q<HTMLButtonElement>('[data-download]').disabled=false;}
    catch(error){q('[data-conversion]').textContent=error instanceof Error?error.message:'이 결과를 악보로 변환할 수 없습니다.';q<HTMLButtonElement>('[data-import]').disabled=true;q<HTMLButtonElement>('[data-download]').disabled=true;}
  }
  function renderNotes(){
    if(!recognition)return;
    const index=Number(q<HTMLSelectElement>('[data-bar]').value),bar=recognition.measures[index],list=q('.image-note-list');list.replaceChildren();
    const warnings=[...recognition.warnings,...bar.warnings];q('[data-warnings]').replaceChildren(...warnings.map(message=>{const p=document.createElement('p');p.textContent=message;return p;}));
    bar.notes.forEach((note,noteIndex)=>{
      const item=document.createElement('fieldset');item.className=`image-note${note.confidence<0.8?' uncertain':''}`;const legend=document.createElement('legend');legend.textContent=`${noteIndex+1}번째 타격${note.confidence<0.8?' · 확인 필요':''} · 확신도 ${Math.round(note.confidence*100)}%`;item.append(legend);
      const selectField=(labelText:string,values:Record<string,string>,value:string,change:(value:string)=>void)=>{const label=document.createElement('label');label.textContent=labelText;const select=document.createElement('select');select.append(...selectItems(values,value));select.addEventListener('change',()=>{change(select.value);q<HTMLInputElement>('[data-checked]').checked=false;updateConversion();});label.append(select);item.append(label);};
      const numberField=(labelText:string,value:number,change:(value:number)=>void)=>{const label=document.createElement('label');label.textContent=labelText;const input=document.createElement('input');input.type='number';input.min='0';input.step='1';input.value=String(value);input.addEventListener('change',()=>{change(input.valueAsNumber);q<HTMLInputElement>('[data-checked]').checked=false;updateConversion();});label.append(input);item.append(label);};
      selectField('악기',instruments,note.instrument,value=>{note.instrument=value as typeof note.instrument;});numberField('위치 (48 = 1박)',note.onset,value=>{note.onset=value;});numberField('길이',note.duration,value=>{note.duration=value;});selectField('주법',arts,note.articulation,value=>{note.articulation=value as typeof note.articulation;});selectField('손',{'':'없음',R:'오른손 R',L:'왼손 L'},note.sticking||'',value=>{note.sticking=(value||null) as typeof note.sticking;});
      const remove=document.createElement('button');remove.type='button';remove.textContent='삭제';remove.setAttribute('aria-label',`${noteIndex+1}번째 타격 삭제`);remove.addEventListener('click',()=>{bar.notes.splice(noteIndex,1);q<HTMLInputElement>('[data-checked]').checked=false;renderNotes();});item.append(remove);list.append(item);
    });updateConversion();
  }
  function showResult(result:unknown){
    recognition=validateRecognition(result);q('[data-review]').hidden=false;q('[data-review-empty]').hidden=true;q<HTMLInputElement>('[data-title]').value=recognition.title;q<HTMLInputElement>('[data-bpm]').value=String(recognition.bpm);q('[data-meter]').textContent=`${recognition.timeSignature.numerator}/${recognition.timeSignature.denominator} · ${recognition.measures.length}마디 · 1박 = 48단위`;
    q<HTMLSelectElement>('[data-bar]').replaceChildren(...recognition.measures.map((_,index)=>new Option(`${index+1}마디`,String(index))));q<HTMLInputElement>('[data-checked]').checked=false;renderNotes();
  }
  async function poll(id:string,revision:number){
    try{const job=await request<Job>(`/jobs/${encodeURIComponent(id)}`);if(revision!==generation)return;
      if(job.state==='succeeded'){stopTimers();jobId='';busy(false);showResult(job.result);setStatus('인식이 끝났습니다. 원본과 결과를 비교한 뒤 가져오세요.');}
      else if(job.state==='failed'||job.state==='cancelled'){stopTimers();jobId='';busy(false);setStatus(job.error||(job.state==='cancelled'?'인식을 취소했습니다.':'인식에 실패했습니다. 이미지를 확인하고 다시 시도하세요.'));}
      else pollTimer=window.setTimeout(()=>void poll(id,revision),1500);
    }catch(error){if(revision!==generation)return;stopTimers();busy(false);setStatus(`연결이 끊겼습니다. ${error instanceof Error?error.message:''} 재시도 전 실행 중인 인식을 취소하세요.`);q<HTMLButtonElement>('[data-recognize]').disabled=true;q<HTMLButtonElement>('[data-cancel]').hidden=!jobId;}
  }
  q('[data-recognize]').addEventListener('click',async()=>{
    if(running||!health?.available||!imageValid)return;clearReview();busy(true);setStatus('이미지를 전달하고 있습니다…');const revision=++generation;
    try{const job=await request<Job>('/jobs',{method:'POST',body:JSON.stringify({imageDataUrl,filename})});if(revision!==generation){void request(`/jobs/${encodeURIComponent(job.id)}`,{method:'DELETE'}).catch(()=>{});return;}jobId=job.id;started=Date.now();ticker=window.setInterval(()=>setStatus(`악보를 읽고 있습니다 · ${Math.floor((Date.now()-started)/1000)}초 경과. 복잡한 악보는 몇 분 걸릴 수 있습니다.`),1000);void poll(job.id,revision);}
    catch(error){if(revision!==generation)return;busy(false);setStatus(error instanceof Error?error.message:'인식을 시작하지 못했습니다.');}
  });
  q('[data-cancel]').addEventListener('click',async()=>{if(!jobId)return;const id=jobId,revision=generation;try{await request(`/jobs/${encodeURIComponent(id)}`,{method:'DELETE'});if(revision!==generation||jobId!==id)return;++generation;stopTimers();jobId='';busy(false);setStatus('인식을 취소했습니다.');}catch(error){if(revision===generation)setStatus(error instanceof Error?error.message:'취소 요청을 보내지 못했습니다.');}});
  q<HTMLSelectElement>('[data-bar]').addEventListener('change',renderNotes);
  q('[data-add-note]').addEventListener('click',()=>{if(!recognition)return;recognition.measures[Number(q<HTMLSelectElement>('[data-bar]').value)].notes.push({instrument:'snare',onset:0,duration:12,articulation:'normal',sticking:null,confidence:1});q<HTMLInputElement>('[data-checked]').checked=false;renderNotes();});
  q('[data-title]').addEventListener('change',()=>{if(recognition){recognition.title=q<HTMLInputElement>('[data-title]').value;updateConversion();}});q('[data-bpm]').addEventListener('change',()=>{if(recognition){recognition.bpm=q<HTMLInputElement>('[data-bpm]').valueAsNumber;updateConversion();}});q('[data-checked]').addEventListener('change',updateConversion);
  q('[data-import]').addEventListener('click',()=>{if(!recognition||!q<HTMLInputElement>('[data-checked]').checked)return;try{const {score}=recognitionToScore(recognition);if(!window.maiWorkspace.importScore(score))throw Error('새 곡으로 저장하지 못했습니다. 브라우저 저장 공간을 확인하고 결과 파일을 저장하세요.');setStatus('새 곡으로 가져왔습니다.');dialog.close();}catch(error){q('[data-conversion]').textContent=error instanceof Error?error.message:'가져오기에 실패했습니다.';}});
  q('[data-download]').addEventListener('click',()=>{if(!recognition)return;try{const {score}=recognitionToScore(recognition),url=URL.createObjectURL(new Blob([JSON.stringify(score,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='image-score.ddakung.json';a.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(error){q('[data-conversion]').textContent=String(error);}});
  trigger.addEventListener('click',()=>{dialog.showModal();void connect();});q('[data-reconnect]').addEventListener('click',()=>void connect());
  function close(){const abandoned=jobId;++generation;stopTimers();jobId='';busy(false);if(abandoned)void request(`/jobs/${encodeURIComponent(abandoned)}`,{method:'DELETE'}).catch(()=>{});dialog.close();}
  q('[data-close]').addEventListener('click',close);dialog.addEventListener('cancel',event=>{event.preventDefault();close();});dialog.addEventListener('close',()=>trigger.focus());dialog.addEventListener('keydown',event=>event.stopPropagation());
}
