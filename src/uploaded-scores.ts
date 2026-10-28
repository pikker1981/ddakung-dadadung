import type {MaiDocument} from './domain';
import './styles/uploaded-scores.css';

type UploadedScore = {file:string;filename:string;title:string;bars:number;bpm:number};

/** Hosted originals stay immutable; the retained importer creates a local edit copy. */
export function installUploadedScores(): void {
  const list=document.getElementById('libList');
  if(!list)return;
  const section=document.createElement('section');section.id='uploadedScores';
  section.setAttribute('aria-labelledby','uploadedScoresTitle');
  const heading=document.createElement('h2');heading.id='uploadedScoresTitle';heading.textContent='업로드한 악보';
  const note=document.createElement('p');note.textContent='원본에서 새 편집본을 엽니다. 수정한 곡은 아래 ‘이 브라우저의 곡’에서 이어서 여세요.';
  const rows=document.createElement('div');rows.className='uploaded-score-list';
  const status=document.createElement('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.textContent='악보 목록 불러오는 중…';
  const localHeading=document.createElement('h2');localHeading.className='uploaded-local-heading';localHeading.textContent='이 브라우저의 곡';
  section.append(heading,note,rows,status);list.before(section,localHeading);
  let busy=false;
  const setBusy=(value:boolean)=>{busy=value;rows.querySelectorAll('button').forEach(button=>button.disabled=value);};
  async function load(){
    try{
      const response=await fetch('/scores/catalog.json');if(!response.ok)throw new Error();
      const catalog:UploadedScore[]=await response.json();
      if(!Array.isArray(catalog)||catalog.length>100||catalog.some(item=>!item||!/^score-\d+\.json$/.test(item.file)||typeof item.title!=='string'||typeof item.filename!=='string'||!Number.isInteger(item.bars)||!Number.isFinite(item.bpm)))throw new Error();
      rows.replaceChildren();
      for(const item of catalog){
        const row=document.createElement('div');row.className='uploaded-score-row';
        const open=document.createElement('button');open.type='button';open.className='uploaded-score-open';
        const title=document.createElement('b');title.textContent=item.title;
        const detail=document.createElement('span');detail.textContent=`${item.bars}마디 · ${item.bpm} BPM · 새 편집본 열기`;
        open.append(title,detail);
        const download=document.createElement('a');download.className='btn ghost sm';download.href=`/scores/${item.file}`;download.download=item.filename;download.textContent='원본 저장';download.setAttribute('aria-label',`${item.title} 원본 저장`);
        open.onclick=async()=>{
          if(busy)return;setBusy(true);status.textContent=`${item.title} 여는 중…`;
          try{
            const result=await fetch(`/scores/${item.file}`);if(!result.ok)throw new Error();
            const score:MaiDocument=await result.json();
            if(!window.maiWorkspace.importScore(score))throw new Error();
            status.textContent=`${item.title} 편집본을 이 브라우저의 곡에 추가했습니다.`;
          }catch{status.textContent='악보를 열지 못했습니다. 연결과 브라우저 저장 공간을 확인한 뒤 다시 눌러 주세요.';}
          finally{setBusy(false);}
        };
        row.append(open,download);rows.append(row);
      }
      status.textContent=`원본 ${catalog.length}곡 · 편집 내용은 기기마다 따로 저장됩니다.`;
    }catch{
      status.textContent='업로드한 악보 목록을 불러오지 못했습니다. ';
      const retry=document.createElement('button');retry.type='button';retry.className='btn sm';retry.textContent='다시 불러오기';retry.onclick=()=>{status.textContent='악보 목록 불러오는 중…';void load();};status.append(retry);
    }
  }
  void load();
}
