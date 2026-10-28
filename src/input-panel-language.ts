import './styles/input-panel.css';

const labels:Record<string,string>={
  '리듬 입력':'RHYTHM INPUT','음표 분할':'Subdivision','32분음표':'32nd notes','3연음':'Triplets','6연음':'Sextuplets',
  '마디 반복 재생':'Bar loop playback','반복 시작 마디':'Loop start bar','반복 끝 마디':'Loop end bar','입력판 표시 마디 수':'Visible input bars','이전 입력 마디':'Previous input bars','다음 입력 마디':'Next input bars',
  '타격 위치를 정확히 합칠 수 있는 마디에서 킥과 손 음표의 빔을 합칩니다':'Join kick and hand beams when their timing can be represented exactly.',
  '크래쉬 일반 타격 입력':'Enter a normal crash hit','라이드 일반 타격 입력':'Enter a normal ride hit','스플래시 일반 타격 입력':'Enter a normal splash hit','차이나 일반 타격 입력':'Enter a normal china hit','스택·이펙트 심벌 일반 타격 입력':'Enter a normal stack / FX hit',
  '킥 빔 합치기':'Join kick beams','킥 빔 합치기 켬':'Join kick beams ON','재생 느낌':'Feel','바운스':'Bounce','바운스 켬':'Bounce ON','뉘앙스':'Nuance','뉘앙스 켬':'Nuance ON','강도 조절':'Adjust feel',
  '크래쉬 타격':'Crash','라이드 타격':'Ride','스플래시 타격':'Splash','차이나 타격':'China','스택·FX 타격':'Stack / FX',
  '롤 1':'Roll 1','롤 2':'Roll 2','롤 3':'Roll 3','버즈롤':'Buzz roll','오른손':'Right','왼손':'Left','고스트 롤':'Ghost roll',
  '마디 반복':'Bar loop','시작':'Start','끝':'End','현재 마디':'Current bar','선택 구간':'Selection','반복 재생':'Play loop','반복 정지':'Stop loop','반복 해제':'Clear loop',
  '현재 마디 또는 시작·끝 마디를 지정하세요.':'Choose the current bar or a start and end bar.',
  '표시 마디 수':'Visible bars','← 이전':'← Previous','다음 →':'Next →','범위 붙여넣기':'Paste range','선택 해제 · Esc':'Clear selection · Esc',
  'Ctrl+드래그로 입력 범위 복사':'Ctrl+drag to copy a range','Ctrl+드래그 복사 → 붙일 시작 칸 클릭 → Ctrl+V · 우클릭은 32분음표 나누기':'Ctrl+drag to copy → select destination → Ctrl+V · Right-click to divide into 32nds',
  '입력 칸 우클릭 · 32분음표로 나누기':'Right-click a cell to divide into 32nds','나누기':'Divide',
  '타격 악기를 선택한 뒤 입력 칸을 누르세요.':'Choose an instrument, then click an input cell.',
  '입력 칸이 바뀌었습니다. 붙일 칸을 다시 선택하세요.':'The grid changed. Select the destination again.',
  'Ctrl을 누른 채 입력 칸을 드래그해 먼저 복사하세요.':'Hold Ctrl and drag input cells to copy first.',
  '아래쪽 악기 행이 부족합니다. 더 위쪽 행에서 붙여넣으세요.':'Not enough instrument rows below. Choose a higher row.',
  '붙일 구간의 마디가 부족합니다. 마디를 추가하거나 앞쪽 칸을 선택하세요.':'Not enough destination bars. Add bars or choose an earlier cell.',
  '기존 타격 위치를 이 분할에 정확히 옮길 수 없습니다. 대상 박의 분할을 맞춰 주세요.':'The note timing does not fit this grid. Match the destination subdivision.',
  '대상 악기에서 사용할 수 없는 주법이 포함되어 있습니다. 같은 악기 행에 붙여넣으세요.':'This articulation is not supported here. Paste into the same instrument row.',
  '손 순서나 꾸밈음을 옮길 수 없는 악기 행입니다. 손 악기 행을 선택하세요.':'Sticking or grace notes require a hand instrument row.',
  '이 위치에 붙여넣을 수 없습니다.':'Cannot paste at this position.',
  '범위를 붙여넣었습니다. Ctrl+Z로 한 번에 되돌릴 수 있어요.':'Range pasted. Press Ctrl+Z to undo.',
  '같은 내용이라 변경하지 않았습니다.':'The content is identical. Nothing changed.',
  '붙여넣지 못했습니다.':'Could not paste.',
  '복사할 범위를 드래그하세요. 마우스를 놓으면 복사됩니다.':'Drag to select. Release to copy.',
  '범위를 복사하지 못했습니다.':'Could not copy the range.',
  '선택 범위가 복사되어 있습니다. 붙일 칸을 고른 뒤 Ctrl+V를 누르세요.':'Range copied. Select a destination and press Ctrl+V.',
  '크래쉬':'Crash','하이햇':'Hi-hat','스네어':'Snare','킥':'Kick','하이탐':'High tom','미들탐':'Mid tom','플로어탐':'Floor tom','풋 하이햇':'Foot hi-hat','라이드':'Ride','스플래시':'Splash','차이나':'China','이펙트·스택':'Effect / stack',
};

export function installInputPanelLanguage(){
  const panel=document.querySelector<HTMLElement>('.crt-input-panel');if(!panel)return;
  const legacy=window.maiWorkspace as typeof window.maiWorkspace&{inputEnglish(text:string):string};
  panel.lang='en';
  const translate=(text:string)=>{
    const trimmed=text.trim();if(!/[가-힣]/.test(trimmed))return text;
    let result=labels[trimmed]||trimmed.replace(/^(\d+)마디$/,'Bar $1')
        .replace(/^(\d+)(?:–(\d+))?마디 \/ 총 (\d+)마디$/,(_,a,b,total)=>`Bars ${a}${b?'–'+b:''} / ${total}`)
        .replace(/^(\d+)(?:–(\d+))?마디 · (반복 재생 중|반복 준비됨|반복 꺼짐)$/,(_,a,b,state)=>`Bars ${a}${b?'–'+b:''} · ${{'반복 재생 중':'Loop playing','반복 준비됨':'Loop ready','반복 꺼짐':'Loop off'}[state as string]}`);
    if(result===trimmed){
      result=trimmed.replace(/^(\d+)개 악기 행 복사됨 · 붙일 시작 칸을 클릭한 뒤 Ctrl\+V$/,'$1 instrument rows copied · Select destination → Ctrl+V')
        .replace(/^(\d+)마디 · (.+) · Ctrl\+V로 붙여넣기$/,(_,bar,name)=>`Bar ${bar} · ${labels[name]||legacy.inputEnglish(name)} · Ctrl+V to paste`)
        .replace(/^(.+) 행의 칸을 눌러 일반 타격을 입력하세요\.$/,(_,name)=>`Select a ${labels[name]||legacy.inputEnglish(name)} cell to enter a normal hit.`);
    }
    if(result===trimmed)result=legacy.inputEnglish(trimmed);
    return text.replace(trimmed,result);
  };
  const observer=new MutationObserver(records=>{observer.disconnect();for(const r of records){if(r.type==='characterData')translateNode(r.target);else if(r.type==='attributes')translateElement(r.target as Element);else for(const node of r.addedNodes)scan(node);}observe();});
  function translateNode(node:Node){if(node.nodeType!==Node.TEXT_NODE||node.parentElement?.closest('script,style,textarea,input,[data-no-i18n]'))return;const next=translate(node.textContent||'');if(next!==node.textContent)node.textContent=next;}
  function translateElement(el:Element){for(const attr of ['title','aria-label','placeholder']){const value=el.getAttribute(attr);if(value){const next=translate(value);if(value!==next)el.setAttribute(attr,next);}}}
  function scan(node:Node){if(node.nodeType===Node.TEXT_NODE){translateNode(node);return;}if(node.nodeType!==Node.ELEMENT_NODE)return;const el=node as Element;translateElement(el);const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let text:Node|null;while((text=walker.nextNode()))translateNode(text);el.querySelectorAll('[title],[aria-label],[placeholder]').forEach(translateElement);}
  function observe(){observer.observe(panel!,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['title','aria-label','placeholder']});}
  scan(panel);observe();
}
