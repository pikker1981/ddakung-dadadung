export type DrumKit={id:string;label:string;kind?:string;instrument?:string;compatibleTargets?:string[];scope?:string;brand?:string;model?:string;size?:string;description?:string;descriptionKo?:string;license?:string;source?:string;bytes?:number;available?:boolean};
export function matchesInstrument(kit:DrumKit,id:string):boolean{return kit.compatibleTargets?.includes(id)||!kit.instrument||kit.instrument===(id==='hihatFoot'?'hihat':id);}
export function modelSources<T extends DrumKit>(sources:T[],id:string,brand='',query=''):T[]{
  const term=query.trim().toLocaleLowerCase();
  return sources.filter(source=>source.available!==false&&source.kind==='instrument'&&matchesInstrument(source,id)&&(!brand||source.brand===brand)&&(!term||[source.brand,source.model,source.size,source.label].filter(Boolean).join(' ').toLocaleLowerCase().includes(term)));
}
export function presetSources<T extends DrumKit>(sources:T[]):T[]{return sources.filter(source=>source.kind!=='instrument');}
