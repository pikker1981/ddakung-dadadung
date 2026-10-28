import type {MaiDocument} from './domain';

export const RECOGNITION_TICKS_PER_QUARTER = 48;
const instruments = ['crash','hihat','ride','tom1','tom2','snare','ftom','kick','hihatFoot','splash','china','fx'] as const;
type Instrument = typeof instruments[number];
const articulations = {normal:1,ghost:2,accent:3,open:4,xstick:5,rim:6,choke:7,bell:8} as const;
export interface RecognitionNote {
  instrument: Instrument; onset:number; duration:number;
  articulation:keyof typeof articulations; sticking:'R'|'L'|null; confidence:number;
}
export interface RecognitionResult {
  title:string; bpm:number; timeSignature:{numerator:number;denominator:4|8};
  measures:{notes:RecognitionNote[];warnings:string[]}[]; warnings:string[];
}
export interface RecognitionConversion {score:MaiDocument;warnings:string[]}
const record = (v:unknown):v is Record<string,unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
function fail(message:string):never {throw new Error(message);}
function warnings(value:unknown,path:string):string[] {
  if(!Array.isArray(value) || value.length>256 || value.some(v=>typeof v!=='string'||v.length>2000)) fail(`${path}: 경고 목록이 올바르지 않습니다.`);
  return value as string[];
}
/** Validate the complete external result before conversion or any editor mutation. */
export function validateRecognition(input:unknown):RecognitionResult {
  if(!record(input)) fail('인식 결과는 JSON 객체여야 합니다.');
  if(typeof input.title!=='string'||input.title.length>200) fail('title: 제목은 200자 이하여야 합니다.');
  if(typeof input.bpm!=='number'||!Number.isInteger(input.bpm)||input.bpm<40||input.bpm>220) fail('bpm: 40~220 사이 정수가 필요합니다.');
  const ts=input.timeSignature;
  if(!record(ts)||!Number.isInteger(ts.numerator)||Number(ts.numerator)<1||Number(ts.numerator)>16||![4,8].includes(Number(ts.denominator))||typeof ts.denominator!=='number') fail('timeSignature: 분자는 1~16, 분모는 4 또는 8이어야 합니다.');
  if(!Array.isArray(input.measures)||input.measures.length<1||input.measures.length>32) fail('measures: 1~32마디가 필요합니다.');
  warnings(input.warnings,'warnings');
  const length=Number(ts.numerator)*192/Number(ts.denominator);
  input.measures.forEach((measure,index)=>{
    const prefix=`${index+1}마디`;
    if(!record(measure)||!Array.isArray(measure.notes)||measure.notes.length>4096) fail(`${prefix}: 음표 목록이 올바르지 않습니다.`);
    warnings(measure.warnings,`${prefix} warnings`);
    const seen=new Set<string>();
    measure.notes.forEach((note,n)=>{
      const p=`${prefix} ${n+1}번째 음표`;
      if(!record(note)||!instruments.includes(note.instrument as Instrument)) fail(`${p}: 지원하지 않는 악기입니다.`);
      if(typeof note.onset!=='number'||!Number.isFinite(note.onset)||note.onset<0||note.onset>=length) fail(`${p}: onset은 마디 안의 48 ticks/4분음표 위치여야 합니다.`);
      if(typeof note.duration!=='number'||!Number.isFinite(note.duration)||note.duration<=0||note.onset+note.duration>length) fail(`${p}: duration이 마디 범위를 벗어났습니다.`);
      if(typeof note.articulation!=='string'||!Object.hasOwn(articulations,note.articulation)) fail(`${p}: 지원하지 않는 주법입니다.`);
      const a=note.articulation,id=note.instrument;
      if((a==='open'&&!['hihat','hihatFoot','snare','tom1','tom2','ftom'].includes(String(id)))||(['xstick','rim'].includes(a)&&id!=='snare')||(a==='bell'&&id!=='ride')||(a==='choke'&&id==='kick')) fail(`${p}: ${id}에 ${a} 주법을 보존할 수 없습니다.`);
      if(note.sticking!==null&&note.sticking!=='R'&&note.sticking!=='L') fail(`${p}: sticking은 R, L 또는 null이어야 합니다.`);
      if(typeof note.confidence!=='number'||!Number.isFinite(note.confidence)||note.confidence<0||note.confidence>1) fail(`${p}: confidence는 0~1이어야 합니다.`);
      const key=`${id}:${note.onset}`;
      if(seen.has(key)) fail(`${p}: 같은 악기와 위치에 중복 음표가 있습니다.`);
      seen.add(key);
    });
  });
  return JSON.parse(JSON.stringify(input)) as RecognitionResult;
}
const mixed:Record<number,[number,number]>={23:[2,3],32:[3,2],13:[1,3],31:[3,1],33:[3,3]};
function fractions(d:number):number[] {
  const p=mixed[d];
  return p ? [...Array.from({length:p[0]},(_,k)=>k/(2*p[0])),...Array.from({length:p[1]},(_,k)=>0.5+k/(2*p[1]))] : Array.from({length:d},(_,k)=>k/d);
}
function defaultGroups(n:number,d:number):number[] {
  if(d===4)return Array(n).fill(1);
  if(n%3===0)return Array(n/3).fill(3);
  const out:number[]=[];while(n>3){out.push(2);n-=2;}if(n)out.push(n);return out;
}
const foot=(id:string)=>id==='kick'||id==='hihatFoot';
/** Exact onset conversion. Unsupported rhythms fail instead of quantizing. */
export function recognitionToScore(input:unknown):RecognitionConversion {
  const data=validateRecognition(input), {numerator,denominator}=data.timeSignature;
  const groups=defaultGroups(numerator,denominator), resultWarnings=[...data.warnings];
  const measures=data.measures.map((source,mi)=>{
    resultWarnings.push(...source.warnings.map(w=>`${mi+1}마디: ${w}`));
    const div:{h:number;f:number}[]=[], rows:Record<string,number[]>={};
    instruments.forEach(id=>rows[id]=[]);
    const stick:number[]=[];let start=0;
    groups.forEach((group,bi)=>{
      const length=group*192/denominator, notes=source.notes.filter(n=>n.onset>=start&&n.onset<start+length);
      const allowed=denominator===8&&group===3?[3,6]:length===48?[2,4,3,6,8,23,32,13,31,33]:[2,4,3,6,8];
      const chosen:{h:number;f:number}={h:4,f:4};
      for(const voice of ['h','f'] as const){
        const ns=notes.filter(n=>foot(n.instrument)===(voice==='f'));
        // Equality is intentional: no tolerance may silently move an onset.
        const d=allowed.find(candidate=>ns.every(n=>fractions(candidate).some(f=>start+f*length===n.onset)));
        if(d===undefined) fail(`${mi+1}마디 ${bi+1}박 ${voice==='h'?'손':'발'}: 정확히 표현할 수 없는 리듬입니다. 같은 성부의 충돌이나 지원하지 않는 분할을 확인하세요.`);
        chosen[voice]=d;
        const positions=fractions(d).map(f=>start+f*length);
        for(const id of instruments.filter(id=>foot(id)===(voice==='f'))){
          rows[id].push(...positions.map(position=>{
            const note=ns.find(n=>n.instrument===id&&n.onset===position);
            return note?articulations[note.articulation]:0;
          }));
        }
        if(voice==='h')positions.forEach(position=>{
          const values=new Set(ns.filter(n=>n.onset===position&&n.sticking).map(n=>n.sticking));
          if(values.size>1)fail(`${mi+1}마디: 같은 손 음표 위치에 R/L이 충돌합니다. 편집기는 칸당 하나의 스티킹만 지원합니다.`);
          stick.push(values.has('R')?1:values.has('L')?2:0);
        });
        if(ns.some(n=>foot(n.instrument)&&n.sticking))resultWarnings.push(`${mi+1}마디: 발 악기의 R/L은 편집기가 지원하지 않아 생략됩니다.`);
      }
      div.push(chosen);start+=length;
    });
    if(source.notes.length) resultWarnings.push(`${mi+1}마디: 타격 위치는 유지됩니다. 편집기는 음표 길이를 다음 타격과 박 경계로 계산하므로 인식된 duration 표기는 별도로 보존하지 못합니다.`);
    return {ts:[numerator,denominator],div,...rows,...(stick.some(Boolean)?{stick}:{})};
  });
  return {score:{v:3,title:data.title,bpm:data.bpm,measures},warnings:[...new Set(resultWarnings)]};
}
