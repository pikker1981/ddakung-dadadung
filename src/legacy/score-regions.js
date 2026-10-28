/* Beat-region operations are staged in memory; only apply() touches the song. */
(function(){
  const MAX_BEATS=32000, MAX_BYTES=8*1024*1024, KEYS=['vel','orn','ornIns','tie'];
  const clone=x=>JSON.parse(JSON.stringify(x));
  const fail=error=>({ok:false,error,reason:error,changed:false});
  const plain=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
  function bounded(x){
    const text=JSON.stringify(x); if(!text||text.length>MAX_BYTES) throw Error('too-large');
    return JSON.parse(text);
  }
  function prepare(doc){return prepareScoreDocument(bounded(doc));}
  function addresses(list,beats){
    if(!Array.isArray(beats)||!beats.length||beats.length>MAX_BEATS) throw Error('invalid-selection');
    const unique=new Map();
    for(const p of beats){
      if(!plain(p)||!Number.isInteger(p.measure)||!Number.isInteger(p.beat)||p.measure<0||p.beat<0||
        !list[p.measure]||p.beat>=beatCount(list[p.measure])) throw Error('invalid-selection');
      unique.set(p.measure+':'+p.beat,{measure:p.measure,beat:p.beat});
    }
    return [...unique.values()].sort((a,b)=>a.measure-b.measure||a.beat-b.beat);
  }
  // A tie belongs to its previous onset, even across a bar line. Track beat/local
  // coordinates so changing another beat's division does not change that identity.
  function predecessors(list){
    const out=new Map(),previous={};
    list.forEach((m,mi)=>{
      for(let b=0;b<beatCount(m);b++) for(const ins of CATALOG){
        const off=beatOffset(m,ins.voice,b),len=divCells(divOf(m,b,ins.voice));
        for(let k=0;k<len;k++) if(m[ins.id]?.[off+k]){
          const key=mi+':'+b+':'+ins.id+':'+k;
          out.set(key,previous[ins.id]||null); previous[ins.id]=key;
        }
      }
    }); return out;
  }
  function copyFrom(list,beats){
    const chosen=addresses(list,beats),pred=predecessors(list),included=new Set();
    const packed=chosen.map(({measure:mi,beat:b})=>{
      const m=list[mi],rows={};
      for(const ins of CATALOG){
        const off=beatOffset(m,ins.voice,b),n=divCells(divOf(m,b,ins.voice));
        rows[ins.id]=Array.from({length:n},(_,k)=>{
          const step=off+k,value=m[ins.id]?.[step]||0,key=mi+':'+b+':'+ins.id+':'+k;
          const tie=value&&included.has(pred.get(key)) ? (m.tie?.[ins.id]?.[step]||0) : 0;
          if(value) included.add(key);
          return {value,vel:value?(m.vel?.[ins.id]?.[step]||0):0,
            orn:value?(m.orn?.[ins.id]?.[step]||0):0,ornIns:value?(m.ornIns?.[ins.id]?.[step]||0):0,tie};
        });
      }
      const off=beatOffset(m,'hand',b),n=divCells(divOf(m,b,'hand'));
      return {q:beatQ(m,b),h:divOf(m,b,'hand'),f:divOf(m,b,'foot'),rows,
        stick:Array.from({length:n},(_,k)=>m.stick?.[off+k]||0)};
    });
    return {ok:true,clip:clone({kind:'ddakung-score-beats',version:1,beats:packed}),beats:chosen.length};
  }
  function copyDocument(doc,beats){try{return copyFrom(prepare(doc).measures,beats);}catch(e){return fail(e.message);}}
  function copyCurrent(beats){try{return copyFrom(measures,beats);}catch(e){return fail(e.message);}}
  function validate(raw){
    const clip=bounded(raw);
    if(!plain(clip)||clip.kind!=='ddakung-score-beats'||clip.version!==1||!Array.isArray(clip.beats)||
      !clip.beats.length||clip.beats.length>MAX_BEATS) throw Error('invalid-clip');
    const seen=new Set();
    for(const b of clip.beats){
      if(!plain(b)||![0.5,1,1.5,2,3,4].includes(b.q)||!plain(b.rows)) throw Error('invalid-clip');
      const allowed=DIV_UI.concat(DIV_MIX_UI);
      if(!allowed.includes(b.h)||!allowed.includes(b.f)||Object.keys(b.rows).length!==CATALOG.length) throw Error('invalid-clip');
      const n=divCells(b.h);
      if(!Array.isArray(b.stick)||b.stick.length!==n||b.stick.some(v=>![0,1,2].includes(v))) throw Error('invalid-clip');
      for(const ins of CATALOG){
        const row=b.rows[ins.id],len=divCells(ins.voice==='hand'?b.h:b.f);
        if(!Array.isArray(row)||row.length!==len) throw Error('invalid-clip');
        for(const cell of row){
          if(!plain(cell)||Object.keys(cell).sort().join(',')!=='orn,ornIns,tie,value,vel'||
            !Number.isInteger(cell.value)||cell.value<0||cell.value>ART_MAX||artFor(ins.id,cell.value)!==cell.value||
            !Number.isInteger(cell.vel)||cell.vel<0||cell.vel>127||![0,1,2,3].includes(cell.orn)||![0,1].includes(cell.tie)||
            !(cell.ornIns===0||(typeof cell.ornIns==='string'&&CATALOG.some(i=>i.id===cell.ornIns&&i.voice==='hand')))||
            (!cell.value&&(cell.vel||cell.orn||cell.ornIns||cell.tie))||(!cell.orn&&cell.ornIns)||
            (ins.voice!=='hand'&&(cell.orn||cell.ornIns))) throw Error('invalid-clip');
          if(cell.tie&&!seen.has(ins.id))cell.tie=0;
          if(cell.value)seen.add(ins.id);
        }
      }
    } return clip;
  }
  function replaceBeat(m,b,source){
    // Splice every row before changing div: all offsets refer to the old grid.
    for(const ins of CATALOG){
      const off=beatOffset(m,ins.voice,b),n=divCells(divOf(m,b,ins.voice));
      const row=source?.rows[ins.id],count=row?row.length:n;
      if(!m[ins.id]) m[ins.id]=Array(voiceLen(m,ins.voice)).fill(0);
      m[ins.id].splice(off,n,...Array.from({length:count},(_,k)=>row?.[k].value||0));
      for(const key of KEYS){
        const values=Array.from({length:count},(_,k)=>row?.[k][key]||0);
        if(!m[key]?.[ins.id]&&values.some(Boolean)){
          if(!m[key])m[key]={};m[key][ins.id]=Array(voiceLen(m,ins.voice)).fill(0);
        }
        if(m[key]?.[ins.id])m[key][ins.id].splice(off,n,...values);
      }
    }
    const off=beatOffset(m,'hand',b),n=divCells(divOf(m,b,'hand')),values=source?.stick||Array(n).fill(0);
    if(!m.stick&&values.some(Boolean))m.stick=Array(voiceLen(m,'hand')).fill(0);
    if(m.stick)m.stick.splice(off,n,...values);
    if(source){if(!m.div)m.div=Array.from({length:beatCount(m)},(_,i)=>({h:divOf(m,i,'hand'),f:divOf(m,i,'foot')}));m.div[b]={h:source.h,f:source.f};}
  }
  function cleanTies(staged,original,edited){
    const before=predecessors(original),after=predecessors(staged);
    const sameOnset=key=>{
      const [mi,b,id,k]=key.split(':'),ins=CATALOG.find(i=>i.id===id);
      return Math.abs(cellFrac(divOf(original[mi],+b,ins.voice),+k)-cellFrac(divOf(staged[mi],+b,ins.voice),+k))<1e-8;
    };
    staged.forEach((m,mi)=>{
      for(let b=0;b<beatCount(m);b++)for(const ins of CATALOG){
        const off=beatOffset(m,ins.voice,b),n=divCells(divOf(m,b,ins.voice));
        for(let k=0;k<n;k++)if(m.tie?.[ins.id]?.[off+k]){
          const key=mi+':'+b+':'+ins.id+':'+k,prev=after.get(key);
          if(!prev||(!edited.has(mi+':'+b)&&(before.get(key)!==prev||!sameOnset(prev))))m.tie[ins.id][off+k]=0;
        }
      }
    });
  }
  function stage(raw,target){
    try{
      const clip=validate(raw);addresses(measures,[target]);
      const destinations=[];
      for(let mi=target.measure;mi<measures.length&&destinations.length<clip.beats.length;mi++)
        for(let b=mi===target.measure?target.beat:0;b<beatCount(measures[mi])&&destinations.length<clip.beats.length;b++)destinations.push({measure:mi,beat:b});
      if(destinations.length!==clip.beats.length)return fail('time-overflow');
      for(let k=0;k<destinations.length;k++){
        const p=destinations[k],m=measures[p.measure],src=clip.beats[k];
        if(Math.abs(beatQ(m,p.beat)-src.q)>1e-8)return fail('incompatible-beat-length');
        if(!divsFor(m,p.beat).includes(src.h)||!divsFor(m,p.beat).includes(src.f))return fail('incompatible-division');
      }
      const staged=clone(measures),edited=new Set();
      destinations.forEach((p,k)=>{replaceBeat(staged[p.measure],p.beat,clip.beats[k]);edited.add(p.measure+':'+p.beat);});
      cleanTies(staged,measures,edited);
      return {ok:true,changed:JSON.stringify(staged)!==JSON.stringify(measures),beats:destinations.length,staged};
    }catch(e){return fail(e.message);}
  }
  function apply(result){
    const {staged,...summary}=result;if(!summary.ok||!summary.changed)return summary;
    if(playing||(typeof PLAY_PENDING!=='undefined'&&PLAY_PENDING))stopPlay();
    if(window.ddakungAudio?.stopPreview)window.ddakungAudio.stopPreview();
    measures=staged;refreshAll();commit();return summary;
  }
  function deleteBeats(beats){
    try{
      const chosen=addresses(measures,beats),staged=clone(measures),edited=new Set();
      chosen.forEach(p=>{replaceBeat(staged[p.measure],p.beat,null);edited.add(p.measure+':'+p.beat);});
      cleanTies(staged,measures,edited);
      return apply({ok:true,changed:JSON.stringify(staged)!==JSON.stringify(measures),beats:chosen.length,staged});
    }catch(e){return fail(e.message);}
  }
  window.ddakungScoreRegions={prepare,copyDocument,copyCurrent,inspectPaste(clip,target){const {staged,...result}=stage(clip,target);return result;},paste(clip,target){return apply(stage(clip,target));},deleteBeats};
})();
