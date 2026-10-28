/* Input-grid clipboard. Times use quarter-note units, independent of cell counts. */
(function(){
  const EPS = 1e-8;
  let buffer = null;
  const clone = value => JSON.parse(JSON.stringify(value));
  const near = (a,b) => Math.abs(a-b) < EPS;
  function timeline(list, instrument){
    const ins = byId[instrument];
    if(!ins) return [];
    const cells = []; let base = 0;
    list.forEach((m,mi)=>{
      for(let b=0;b<beatCount(m);b++){
        const d=divOf(m,b,ins.voice), count=divCells(d), off=beatOffset(m,ins.voice,b);
        for(let k=0;k<count;k++) cells.push({instrument,measure:mi,step:off+k,
          start:base+beatStartQ(m,b)+cellFrac(d,k)*beatQ(m,b),
          end:base+beatStartQ(m,b)+cellFrac(d,k+1)*beatQ(m,b)});
      }
      base += measureQ(m);
    });
    return cells;
  }
  function point(instrument,step,measure){
    if(!Number.isInteger(step)||!Number.isInteger(measure)) return null;
    const row=INSTR.findIndex(i=>i.id===instrument);
    const m=measures[measure],ins=INSTR[row];
    if(!m||!ins||step<0||step>=voiceLen(m,ins.voice)) return null;
    let base=0;
    for(let mi=0;mi<measure;mi++) base+=measureQ(measures[mi]);
    for(let b=0;b<beatCount(m);b++){
      const d=divOf(m,b,ins.voice),off=beatOffset(m,ins.voice,b),k=step-off;
      if(k<0||k>=divCells(d)) continue;
      return {instrument,step,measure,row,
        start:base+beatStartQ(m,b)+cellFrac(d,k)*beatQ(m,b),
        end:base+beatStartQ(m,b)+cellFrac(d,k+1)*beatQ(m,b)};
    }
    return null;
  }
  function current(p){
    const fresh=p&&point(p.instrument,p.step,p.measure);
    if(!fresh||(Number.isFinite(p.start)&&!near(p.start,fresh.start))) return null;
    return fresh;
  }
  function info(){
    return buffer ? {ready:true,rows:buffer.rows.length,duration:buffer.duration,start:buffer.start,end:buffer.end,
      instruments:buffer.rows.map(r=>r.instrument)} : {ready:false,rows:0,duration:0,start:0,end:0,instruments:[]};
  }
  function copy(a,b){
    a=current(a); b=current(b);
    if(!a||!b) return {ok:false,reason:'invalid-point'};
    const start=Math.min(a.start,b.start),end=Math.max(a.end,b.end);
    const rows=INSTR.slice(Math.min(a.row,b.row),Math.max(a.row,b.row)+1).map(ins=>{
      const notes=[];
      for(const cell of timeline(measures,ins.id)){
        if(cell.start<start-EPS||cell.start>=end-EPS) continue;
        const m=measures[cell.measure],value=m[ins.id]?.[cell.step]||0;
        if(!value) continue;
        notes.push({time:cell.start-start,value,vel:noteVelocity(m,ins.id,cell.step)||0,orn:m.orn?.[ins.id]?.[cell.step]||0,
          ornIns:m.ornIns?.[ins.id]?.[cell.step]||0,
          tie:notes.length ? (m.tie?.[ins.id]?.[cell.step]||0) : 0,
          stick:ins.voice==='hand' ? (m.stick?.[cell.step]||0) : 0});
      }
      return {instrument:ins.id,notes};
    });
    buffer=clone({start,end,duration:end-start,rows});
    return {ok:true,...info()};
  }
  function attachment(m,key,id,step,value,voice){
    if(value){
      if(!m[key]) m[key]={};
      if(!m[key][id]) m[key][id]=new Array(voiceLen(m,voice)).fill(0);
      m[key][id][step]=value;
    }else if(m[key]?.[id]) m[key][id][step]=0;
  }
  function stage(target){
    if(!buffer) return {ok:false,reason:'empty-clipboard',changed:false};
    target=current(target);
    if(!target) return {ok:false,reason:'invalid-point',changed:false};
    if(target.row+buffer.rows.length>INSTR.length) return {ok:false,reason:'row-overflow',changed:false};
    const start=target.start,end=start+buffer.duration;
    if(end>songQ(measures)+EPS) return {ok:false,reason:'time-overflow',changed:false};
    const staged=clone(measures),writes=[],mapped=new Set(),touched=new Map();
    for(let r=0;r<buffer.rows.length;r++){
      const ins=INSTR[target.row+r]; mapped.add(ins.id);
      const cells=timeline(staged,ins.id);
      for(const note of buffer.rows[r].notes){
        const cell=cells.find(c=>near(c.start,start+note.time));
        if(!cell) return {ok:false,reason:'incompatible-grid',changed:false};
        if(artFor(ins.id,note.value)!==note.value) return {ok:false,reason:'unsupported-articulation',changed:false};
        if(ins.voice!=='hand'&&(note.stick||note.orn||note.ornIns)) return {ok:false,reason:'unsupported-attachment',changed:false};
        writes.push({ins,cell,note});
      }
      for(const cell of cells){
        if(cell.start<start-EPS||cell.start>=end-EPS) continue;
        const m=staged[cell.measure];
        if(m[ins.id]) m[ins.id][cell.step]=0;
        for(const key of ['orn','ornIns','tie','vel']) attachment(m,key,ins.id,cell.step,0,ins.voice);
        if(ins.voice==='hand') touched.set(cell.measure+':'+cell.step,cell);
      }
    }
    const sticks=new Map();
    for(const {ins,cell,note} of writes){
      const m=staged[cell.measure];
      if(!m[ins.id]) m[ins.id]=new Array(voiceLen(m,ins.voice)).fill(0);
      m[ins.id][cell.step]=note.value;
      for(const key of ['orn','ornIns','tie','vel']) attachment(m,key,ins.id,cell.step,note[key],ins.voice);
      if(ins.voice==='hand'){
        const key=cell.measure+':'+cell.step;
        if(note.stick||!sticks.has(key)) sticks.set(key,note.stick);
      }
    }
    for(const [key,cell] of touched){
      const m=staged[cell.measure],allHands=CATALOG.filter(i=>i.voice==='hand');
      const unrelated=allHands.some(i=>!mapped.has(i.id)&&m[i.id]?.[cell.step]);
      const any=allHands.some(i=>m[i.id]?.[cell.step]);
      const wanted=sticks.get(key)||0,existing=m.stick?.[cell.step]||0;
      if(unrelated&&wanted&&existing&&wanted!==existing) return {ok:false,reason:'unsupported-attachment',changed:false};
      const value=any ? (wanted||(unrelated?existing:0)) : 0;
      if(value&&!m.stick) m.stick=new Array(voiceLen(m,'hand')).fill(0);
      if(m.stick) m.stick[cell.step]=value;
    }
    // Ties may cross bar lines; only an absent copied predecessor makes one orphaned.
    for(const {ins,cell,note} of writes){
      if(!note.tie) continue;
      const previous=writes.some(w=>w.ins.id===ins.id&&w.cell.start<cell.start-EPS);
      if(!previous) attachment(staged[cell.measure],'tie',ins.id,cell.step,0,ins.voice);
    }
    for(let mi=0;mi<staged.length;mi++){
      const m=staged[mi];
      for(const key of ['orn','ornIns','tie','vel']){
        if(!m[key]) continue;
        for(const id of mapped) if(m[key][id]&&!m[key][id].some(Boolean)&&
          (!measures[mi][key]?.[id]||measures[mi][key][id].some(Boolean))) delete m[key][id];
        if(!Object.keys(m[key]).length) delete m[key];
      }
    }
    return {ok:true,changed:JSON.stringify(staged)!==JSON.stringify(measures),rows:buffer.rows.length,
      duration:buffer.duration,start,end,staged};
  }
  function inspectPaste(target){ const {staged,...result}=stage(target); return result; }
  function paste(target){
    const {staged,...result}=stage(target);
    if(!result.ok||!result.changed) return result;
    if(playing||(typeof PLAY_PENDING!=='undefined'&&PLAY_PENDING)) stopPlay();
    if(window.ddakungAudio?.stopPreview) window.ddakungAudio.stopPreview();
    measures=staged;
    refreshAll(); commit();
    return result;
  }
  window.ddakungGridClipboard={point,copy,inspectPaste,paste,clear(){buffer=null;return info();},info};
})();
