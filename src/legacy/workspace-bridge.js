/* Narrow adapter to the retained shared-scope core. No edition or purchase flags
 * are changed. These are exactly the original LITE note editing operations. */
window.maiWorkspace = Object.freeze({
  inputEnglish(text){
    if(Object.hasOwn(EN,text))return EN[text];
    for(const [ko,en] of Object.entries(EN)){
      if(!ko.includes('{'))continue;
      const names=[];
      const pattern=ko.split(/(\{\w+\})/).map(part=>/^\{\w+\}$/.test(part)?(names.push(part),/^\{(?:n|a|b|k|h|f)\}$/.test(part)?'([0-9–/·+., :]+)':'(.+?)'):part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('');
      const match=new RegExp('^'+pattern+'$').exec(text);
      if(match)return en.replace(/\{\w+\}/g,key=>{const value=match[names.indexOf(key)+1]||key,ins=CATALOG.find(i=>i.name===value);return ins?INS_EN[ins.id]||value:value;});
    }
    const instrument=CATALOG.find(ins=>ins.name===text);
    return instrument?INS_EN[instrument.id]||text:text;
  },
  measureRepeat(){return measureRepeatState();},
  playMeasureRepeat(a,b){return playMeasureRepeat(a,b);},
  stopMeasureRepeat(clear){return stopMeasureRepeat(clear);},
  scorePage(){return scorePageInfo();},
  moveScorePage(direction){return moveScorePage(direction);},
  velocityNotes(){
    const out=[],view=editorView(); let base=0;
    for(let mi=0;mi<measures.length;mi++){
      const m=measures[mi];
      if(mi>=view.start&&mi<=view.end) for(let row=0;row<INSTR.length;row++){
        const ins=INSTR[row];
        for(let step=0;step<(m[ins.id]?.length||0);step++){
          if(!m[ins.id][step]||tieOf(m,ins.id,step)) continue;
          const l=locOf(m,ins.voice,step);
          out.push({instrument:ins.id,measure:mi,step,row,start:base+beatStartQ(m,l.b)+cellFrac(l.d,l.k)*beatQ(m,l.b),velocity:noteVelocity(m,ins.id,step),label:insName(ins)});
        }
      }
      base+=measureQ(m);
    }
    return out.sort((a,b)=>a.start-b.start||a.row-b.row);
  },
  setNoteVelocities(edits){
    if(!Array.isArray(edits)) return false;
    // Validate every target before mutation; stale selections cannot partially edit.
    for(const e of edits){
      if(!e||typeof e!=='object'||!Number.isInteger(e.measure)||e.measure<0)return false;
      const m=measures[e.measure],ins=byId[e.instrument];
      if(!m||!ins||!Number.isInteger(e.step)||!m[ins.id]?.[e.step]||tieOf(m,ins.id,e.step)||!(e.velocity===null||(Number.isInteger(e.velocity)&&e.velocity>=1&&e.velocity<=127))) return false;
      const l=locOf(m,ins.voice,e.step); let base=0;for(let mi=0;mi<e.measure;mi++)base+=measureQ(measures[mi]);
      if(!Number.isFinite(e.start)||Math.abs(e.start-base-beatStartQ(m,l.b)-cellFrac(l.d,l.k)*beatQ(m,l.b))>1e-8) return false;
    }
    let changed=false;
    for(const e of edits){
      const m=measures[e.measure],id=e.instrument;
      if(noteVelocity(m,id,e.step)===e.velocity) continue;
      if(e.velocity!==null){if(!m.vel)m.vel={};if(!m.vel[id])m.vel[id]=new Array(m[id].length).fill(0);m.vel[id][e.step]=e.velocity;}
      else if(m.vel?.[id])m.vel[id][e.step]=0;
      pruneVelocity(m);changed=true;
    }
    return changed;
  },
  commitVelocityEdit(){commit();window.dispatchEvent(new Event('mai-velocity-refresh'));},
  previewVelocity(note){if(!playing&&!(typeof PLAY_PENDING!=='undefined'&&PLAY_PENDING)){const m=measures[note.measure];if(m?.[note.instrument]?.[note.step])previewSound(note.instrument,m[note.instrument][note.step],note.measure,note.step);}},
  isPlaying(){return playing||(typeof PLAY_PENDING!=='undefined'&&PLAY_PENDING);},
  activateCell(id, step, measure){
    if(measure !== undefined){
      if(!Number.isInteger(measure) || !measures[measure]?.[id] || !Number.isInteger(step) || step < 0 || step >= measures[measure][id].length) return;
      if(!activateEditorMeasure(measure)) return;
    }
    if(!byId[id] || !Number.isInteger(step) || step < 0 || !measures[selMeasure]?.[id] || step >= measures[selMeasure][id].length) return;
    if(selOrn){ ornTap(id, step); return; }
    if(selStick){ stickTap(id, step); return; }
    if(selTie){ tieTap(id, step); return; }
    const value = nextVal(id, step);
    if(setCell(id, step, value)) commit();
    if(value) previewSound(id, value,selMeasure,step);
  },
  describeCell(id, step, measure = selMeasure){
    const m = measures[measure], v = m?.[id]?.[step] || 0;
    return {label: `${t(byId[id]?.name || id)}, ${measure+1}${LANG === 'ko' ? '마디' : ' bar'}, ${step+1}${LANG === 'ko' ? '번째 칸' : ' step'}, ${v ? (LANG === 'ko' ? '음표' : 'note') : (LANG === 'ko' ? '쉼' : 'rest')}`, pressed: v > 0};
  },
  editorView(){ return editorView(); },
  setEditorCount(count){ return setEditorCount(count); },
  moveEditorPage(direction){ return moveEditorPage(direction); },
  selectEditorMeasure(index){ return activateEditorMeasure(index); },
  createNewSong(){ return newSong() === true; },
  snapshot(){ return JSON.parse(JSON.stringify({v:3, title:document.getElementById('titleInput').value, bpm, measures})); },
  isKorean(){ return LANG === 'ko'; },
  storageAvailable(){ return STORAGE_OK; },
  importScore(score){
    // Preparation is pure: an invalid result never saves, switches or stops play.
    const imported = prepareScoreDocument(score);
    if(!STORAGE_OK || lib.songs.length >= SONG_MAX) return false;
    if(!flushSong()) return false;
    const previousLib = JSON.parse(JSON.stringify(lib));
    const id = newId(), body = JSON.stringify(imported);
    // Write the complete new body before publishing its library entry.
    if(!lsSet(songKey(id), body)) return false;
    lib.songs.unshift({id,title:imported.title,at:Date.now(),bars:imported.measures.length});
    lib.cur = id;
    if(!libSave()){ lib = previousLib; lsDel(songKey(id)); return false; }
    if(playing) stopPlay();
    measures = imported.measures; syncRosterToNotes();
    selMeasure = 0; selEnd = 0; cursorB = 0; cursorK = 0;
    document.getElementById('titleInput').value = imported.title;
    songMeta = imported.meta; headSize = imported.hsize; showTempo = imported.tempo;
    if(typeof syncMetaUI === 'function') syncMetaUI();
    setScoreStyle(imported.style, true);
    bpm = imported.bpm; bpmRange.value = bpm;
    document.getElementById('bpmVal').textContent = bpm;
    if(loopRange){ loopRange = null; if(typeof refreshRangeBtn === 'function') refreshRangeBtn(); }
    _draftLast = body;
    shelfTouch(id); refreshAll();
    _cur = snapshot(); histPast.length = 0; histFuture.length = 0; refreshUndoBtns();
    renderLib(); closeLib();
    return true;
  },
  refreshScore(){ renderScore(); },
  refreshLayout(){ relayout(); }
});
// Surface actual localStorage write results, not an optimistic autosave label.
const _workspaceLsSet = lsSet;
lsSet = function(key, value){
  const ok = _workspaceLsSet(key, value);
  if(key === LIB_KEY || key.startsWith(SONG_PRE)) window.dispatchEvent(new CustomEvent('mai-storage-result', {detail:{ok}}));
  return ok;
};

// Notify the modern utility strip after legacy edits, undo, import and paging.
const _velocityRefreshGrid=typeof refreshGrid==='function'?refreshGrid:null;
if(_velocityRefreshGrid) refreshGrid=function(){const result=_velocityRefreshGrid.apply(this,arguments);window.dispatchEvent(new Event('mai-velocity-refresh'));return result;};
const _velocityBuildGrid=typeof buildGrid==='function'?buildGrid:null;
if(_velocityBuildGrid) buildGrid=function(){const result=_velocityBuildGrid.apply(this,arguments);window.dispatchEvent(new Event('mai-velocity-refresh'));return result;};
