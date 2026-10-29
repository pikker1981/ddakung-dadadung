/* Shared engraving for comparison panels. All coordinates use SVG viewBox units,
 * and measure/beat indices are zero based. Never mount foreign SVG into scoreSvg. */
(function(){
  function geometry(target, cache){
    const box=(target.getAttribute('viewBox')||'').trim().split(/\s+/).map(Number);
    const width=box[2]||Number(target.getAttribute('width'))||0;
    const height=box[3]||Number(target.getAttribute('height'))||0;
    const viewTop=Number.isFinite(box[1])?box[1]:0;
    const beats=[], previousMul=ROW_MUL;
    const tops=[...new Set(cache.filter(Boolean).map(p=>p.top))].sort((a,b)=>a-b);
    try{
      cache.forEach((p,mi)=>{
        const m=measures[mi]; if(!p||!m) return;
        ROW_MUL=p.mul||1;
        const nb=beatCount(m), nextTop=tops[tops.indexOf(p.top)+1];
        const upper=Math.min(-38,MARK_Y.stick-8);
        const y=Math.max(viewTop,p.top+upper);
        const bottom=Math.min(viewTop+height,p.top+Math.max(80,4*LG+MARK_Y.stickB+8,4*LG+(MARK_Y.kick||0)+8),nextTop==null?Infinity:nextTop+upper);
        for(let b=0;b<nb;b++){
          const x=xAtPos(p.x0,b,m);
          const end=b+1<nb?xAtPos(p.x0,b+1,m):p.x0+p.w;
          beats.push({measure:mi,beat:b,x,y,width:Math.max(0,end-x),height:Math.max(0,bottom-y)});
        }
      });
    }finally{ROW_MUL=previousMul;}
    return {width,height,beats};
  }
  function renderDocument(doc,options={}){
    if(!doc||!Array.isArray(doc.measures)||!doc.measures.length) throw new TypeError('A prepared score document is required.');
    // Save references, including roster objects and the current cache token. The
    // detached render uses cloned measures, so its WeakMap entries cannot replace
    // entries belonging to the current score. No UI/persistence setters are used.
    const saved={measures,INSTR,byId,HAND_INS,FOOT_INS,rosterOff,rosterOrder,rosterNames,
      songMeta,headSize,showTempo,bpm,scoreStyle,ST,INK,GEO,ROW_MUL,SVGT,_bwToken,
      MULTI_REST,marks:{...MARK_Y}};
    try{
      measures=JSON.parse(JSON.stringify(doc.measures));
      rosterOrder=CAT_ORDER.slice();rosterNames={};rosterOff=new Set();
      rebuildRoster();
      songMeta=metaClean(doc.meta);headSize=doc.hsize||'normal';showTempo=!!doc.tempo;
      bpm=Number(doc.bpm)||100;scoreStyle=Object.hasOwn(SCORE_STYLES,doc.style)?doc.style:'classic';
      ST=SCORE_STYLES[scoreStyle];INK='#171717';MULTI_REST=false;
      const totalMeasures=measures.length,pages=Math.max(1,Math.ceil(totalMeasures/SCREEN_PAGE_SIZE));
      const page=Math.max(1,Math.min(pages,Math.floor(Number(options.page)||1)));
      const from=(page-1)*SCREEN_PAGE_SIZE,to=Math.min(totalMeasures,from+SCREEN_PAGE_SIZE);
      const target=el('svg',{xmlns:SVG_NS}),cache=[];
      const width=Math.max(280,Math.min(4000,Number(options.width)||1200));
      paint(target,{availW:width,perLine:'auto',maxPerLine:4,from,to,screenPage:true,
        noZoom:true,readOnly:true,cache,title:page===1?String(doc.title||''):'',
        meta:page===1?songMeta:null,copyright:page===1?songMeta.copyright:''});
      const result=geometry(target,cache);
      return {...result,svg:target.outerHTML,totalMeasures,page,pages};
    }finally{
      ({measures,INSTR,byId,HAND_INS,FOOT_INS,rosterOff,rosterOrder,rosterNames,
        songMeta,headSize,showTempo,bpm,scoreStyle,ST,INK,GEO,ROW_MUL,SVGT,_bwToken,
        MULTI_REST}=saved);
      Object.assign(MARK_Y,saved.marks);
    }
  }
  window.ddakungScoreRender=Object.freeze({currentGeometry:()=>geometry(svg,slotXCache),renderDocument});
})();
