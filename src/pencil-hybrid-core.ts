export type PencilPoint = {x:number;y:number};
export type PencilLane = {instrument:string; top:number; bottom:number};

export type PencilStroke = {
  points:PencilPoint[];
  width:number;
  height:number;
  stepCount:number;
  lanes:PencilLane[];
};

export type PencilCoreCandidate = {
  measure:number;
  instrument:string;
  step:number;
  endStep?:number;
  articulation:'normal';
  source:'web-pencil';
  confidence:number;
};

export function clamp(value:number,min:number,max:number){
  return Math.max(min,Math.min(max,value));
}

export function normalizePencilPoints(points:PencilPoint[],width:number,height:number){
  if(!Number.isFinite(width)||width<=0||!Number.isFinite(height)||height<=0) return [];
  return points
    .filter(point=>Number.isFinite(point.x)&&Number.isFinite(point.y))
    .map(point=>({x:clamp(point.x/width,0,1),y:clamp(point.y/height,0,1)}));
}

export function classifyPencilStroke(stroke:PencilStroke):PencilCoreCandidate[]{
  const points=normalizePencilPoints(stroke.points,stroke.width,stroke.height);
  const stepCount=Math.max(1,Math.floor(stroke.stepCount||16));
  if(points.length===0||stroke.lanes.length===0)return [];
  const first=points[0],last=points[points.length-1];
  const midY=points.reduce((sum,point)=>sum+point.y,0)/points.length;
  const lane=stroke.lanes.find(candidate=>midY>=candidate.top&&midY<=candidate.bottom);
  if(!lane)return [];
  const start=clamp(Math.round(first.x*stepCount),0,stepCount-1);
  const end=clamp(Math.round(last.x*stepCount),0,stepCount-1);
  const lo=Math.min(start,end),hi=Math.max(start,end);
  const span=hi-lo;
  const confidence=clamp(0.92-(Math.abs(midY-(lane.top+lane.bottom)/2)*0.35)-(span>0?0.08:0),0.35,0.98);
  const out:PencilCoreCandidate[]=[];
  if(span>=1&&Math.abs(last.x-first.x)>=0.08){
    for(let step=lo;step<=hi;step++)out.push({measure:0,instrument:lane.instrument,step,articulation:'normal',source:'web-pencil',confidence});
  }else{
    out.push({measure:0,instrument:lane.instrument,step:lo,articulation:'normal',source:'web-pencil',confidence});
  }
  return out;
}

export function dedupePencilCandidates<T extends {measure:number;instrument:string;step:number}>(candidates:T[]){
  const seen=new Set<string>(),out:T[]=[];
  for(const candidate of candidates){
    const key=`${candidate.measure}:${candidate.instrument}:${candidate.step}`;
    if(seen.has(key))continue;
    seen.add(key);out.push(candidate);
  }
  return out;
}

export function makePencilEnvelope(cmd:'open'|'export'|'close'|'cancel',documentId:string,id=`pencil-${Date.now()}`){
  return {v:1,id,cmd,documentId};
}
