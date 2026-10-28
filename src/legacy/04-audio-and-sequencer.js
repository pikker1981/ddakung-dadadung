/* ================= 오디오 엔진 ================= */
/* Device-local feel: score data, tempo and editing auditions remain untouched. */
const GROOVE_KEY = 'ddakung.groove.v1';
const GROOVE_DEFAULT = {bounceEnabled:false,bounce:50,bounceSubdivision:2,nuanceEnabled:false,nuance:50};
let GROOVE = {...GROOVE_DEFAULT}, GROOVE_STORAGE_OK = true;
function grooveSettings(value, base=GROOVE_DEFAULT){
  const out={...base};
  if(value && typeof value==='object'){
    for(const key of ['bounceEnabled','nuanceEnabled'])if(typeof value[key]==='boolean')out[key]=value[key];
    for(const key of ['bounce','nuance'])if(typeof value[key]==='number'&&Number.isFinite(value[key]))out[key]=Math.max(0,Math.min(100,value[key]));
    if(value.bounceSubdivision===2||value.bounceSubdivision===4)out.bounceSubdivision=value.bounceSubdivision;
  }
  return out;
}
try{const saved=localStorage.getItem(GROOVE_KEY);if(saved)GROOVE=grooveSettings(JSON.parse(saved));}catch{GROOVE_STORAGE_OK=false;}
function grooveSnapshot(){return {...GROOVE,storageOk:GROOVE_STORAGE_OK};}
function setGroove(value){
  GROOVE=grooveSettings(value,GROOVE);
  try{localStorage.setItem(GROOVE_KEY,JSON.stringify(GROOVE));GROOVE_STORAGE_OK=true;}catch{GROOVE_STORAGE_OK=false;}
  const snapshot=grooveSnapshot();
  const event=typeof CustomEvent==='function'?new CustomEvent('ddakung-groove-change',{detail:snapshot}):new Event('ddakung-groove-change');
  window.dispatchEvent(event);
  return snapshot;
}
window.ddakungGroove={get:grooveSnapshot,set:setGroove,reset:()=>setGroove(GROOVE_DEFAULT)};
let ctx = null;
let AUDIO_INTERRUPTED=false;
function configurePlaybackSession(){
  // WebKit's default ambient session obeys the iPad silent switch.
  // Request media playback before creating/resuming Web Audio when supported.
  try{if(typeof navigator!=='undefined'&&navigator.audioSession)navigator.audioSession.type='playback';}catch{}
}
function notifyAudioOutput(){window.dispatchEvent(new Event('ddakung-output-change'));}
function ac(){
  if(!ctx){
    configurePlaybackSession();
    ctx = new (window.AudioContext||window.webkitAudioContext)();
    ctx.addEventListener('statechange',()=>{
      if((ctx.state==='interrupted'||ctx.state==='suspended')&&playing){
        AUDIO_INTERRUPTED=true;stopPlay();
      }
      notifyAudioOutput();
    });
  }
  return ctx;
}
function resumeAudioContext(c=ac()){
  configurePlaybackSession();
  let timeout;
  // Call resume synchronously within the user's tap, before any network await.
  const resume=c.resume();
  return Promise.race([resume,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('오디오가 시작되지 않았습니다. 재생을 다시 눌러 주세요.')),6000);})])
    .then(()=>{if(c.state&&c.state!=='running')throw new Error('오디오가 중단되어 있습니다. 재생을 다시 눌러 주세요.');AUDIO_INTERRUPTED=false;notifyAudioOutput();})
    .finally(()=>clearTimeout(timeout));
}

/* App-local drum finish. Individual recordings, notes and tuning stay intact. */
const POLISH_KEY='ddakung.polish.v1';
let POLISH_AMOUNT=40,POLISH_STORAGE_OK=true;
try{const value=JSON.parse(localStorage.getItem(POLISH_KEY)||'null');if(typeof value==='number'&&Number.isFinite(value))POLISH_AMOUNT=Math.max(0,Math.min(100,Math.round(value)));}catch{POLISH_STORAGE_OK=false;}
function polishSettings(){return {amount:POLISH_AMOUNT,storageOk:POLISH_STORAGE_OK};}
function setPolish(amount){
  if(typeof amount!=='number'||!Number.isFinite(amount))return polishSettings();
  POLISH_AMOUNT=Math.max(0,Math.min(100,Math.round(amount)));
  try{localStorage.setItem(POLISH_KEY,JSON.stringify(POLISH_AMOUNT));POLISH_STORAGE_OK=true;}catch{POLISH_STORAGE_OK=false;}
  if(BUS){const now=ac().currentTime;for(const [node,value] of [[BUS.legacyOut,1-POLISH_AMOUNT/100],[BUS.polish.out,POLISH_AMOUNT/100]]){node.gain.cancelScheduledValues(now);node.gain.setTargetAtTime(value,now,0.02);}}
  window.dispatchEvent(new Event('ddakung-polish-change'));return polishSettings();
}
function outputSafetyCurve(){
  const curve=new Float32Array(8193),knee=0.84,ceiling=Math.pow(10,-1/20);
  for(let i=0;i<curve.length;i++){const x=2*i/(curve.length-1)-1,a=Math.abs(x);curve[i]=a<=knee?x:Math.sign(x)*(knee+(ceiling-knee)*Math.tanh((a-knee)/(ceiling-knee)));}
  return curve;
}
function polishedRoomIR(c){
  const length=Math.ceil(c.sampleRate*0.32),buffer=c.createBuffer(2,length,c.sampleRate);
  // Fixed short, band-smoothed stereo reflections. This is only added room;
  // the original sample sustain/resonance and playback rate are untouched.
  for(let channel=0;channel<2;channel++){
    const data=buffer.getChannelData(channel),offset=channel?0.0017:0;
    const taps=[[0.011,0.42],[0.019,-0.30],[0.031,0.23],[0.047,-0.18],[0.071,0.12],[0.103,-0.08],[0.149,0.045],[0.211,-0.025]];
    for(const [time,gain] of taps){const start=Math.round((time+offset)*c.sampleRate),width=Math.max(3,Math.round(c.sampleRate*0.0007));for(let j=0;j<width&&start+j<length;j++)data[start+j]+=gain*Math.sin(Math.PI*j/(width-1))/width;}
    let seed=0x1f123bb5+channel*997,low=0,energy=0;
    for(let i=Math.round(0.016*c.sampleRate);i<length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;low+=0.18*((seed/4294967296*2-1)-low);data[i]+=low*0.004*Math.exp(-i/c.sampleRate*24)*(1-i/length);}
    for(let i=0;i<length;i++)energy+=data[i]*data[i];
    const scale=energy>0?0.36/Math.sqrt(energy):1;for(let i=0;i<length;i++)data[i]*=scale;
  }
  return buffer;
}
function createDrumPolish(c,output){
  const dry=c.createGain(),send=c.createGain(),wet=c.createGain(),sum=c.createGain(),out=c.createGain();
  // Web Audio low/high-pass Q is expressed in dB, rather than a linear ratio.
  const butterworthQ=20*Math.log10(Math.SQRT1_2);
  const highpass=c.createBiquadFilter();highpass.type='highpass';highpass.frequency.value=25;highpass.Q.value=butterworthQ;
  const room=c.createConvolver();room.normalize=false;room.buffer=polishedRoomIR(c);
  const wetHP=c.createBiquadFilter();wetHP.type='highpass';wetHP.frequency.value=180;wetHP.Q.value=butterworthQ;
  const wetLP=c.createBiquadFilter();wetLP.type='lowpass';wetLP.frequency.value=6200;wetLP.Q.value=butterworthQ;wet.gain.value=0.20;
  const comp=c.createDynamicsCompressor();comp.threshold.value=-12;comp.knee.value=12;comp.ratio.value=1.6;comp.attack.value=0.018;comp.release.value=0.12;
  const makeup=c.createGain();makeup.gain.value=1.08;
  const limiter=c.createDynamicsCompressor();limiter.threshold.value=-1.5;limiter.knee.value=0;limiter.ratio.value=20;limiter.attack.value=0.001;limiter.release.value=0.08;
  const safe=c.createWaveShaper();safe.curve=limiterCurve();safe.oversample='2x';
  dry.connect(sum);send.connect(wetHP).connect(room).connect(wetLP).connect(wet).connect(sum);
  sum.connect(highpass).connect(comp).connect(makeup).connect(limiter).connect(safe).connect(out).connect(output);
  out.gain.value=POLISH_AMOUNT/100;
  return {dry,send,out,highpass,room,wetHP,wetLP,comp,makeup,limiter};
}

/* --- 마스터 버스: 드라이 + 룸 리버브 + 글루 컴프 --- */
let BUS = null;
function bus(){
  if(BUS) return BUS;
  const c = ac();
  /* 이 자리는 볼륨 손잡이가 아니라 **컴프 뒤 메이크업 게인**이다
     (2026-09-10). 컴프가 -14dB/3.2:1로 최대 10dB쯤 눌러놓는데 되돌려 올리는
     단이 없어서, 0.78이던 시절엔 뒤의 리미터가 아예 안 걸렸다 — 클리핑을
     막으라고 달아둔 안전망이 놀고 그만큼 전체가 조용했다.
     1.35(+4.8dB)로 올려 리미터가 제 일을 하게 한다. 천장은 소프트 클리퍼가
     0.964로 물고 있으니 아무리 올려도 클리핑은 안 난다 — 위험은 클리핑이
     아니라 **너무 올리면 트랜지언트가 뭉개지는 것**이다. 더 올릴 땐 귀로
     확인할 것. */
  const master = c.createGain(); master.gain.value = 1.35;
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -14; comp.knee.value = 24;
  comp.ratio.value = 3.2; comp.attack.value = 0.004; comp.release.value = 0.18;
  const dry = c.createGain(); dry.gain.value = 1;
  const wet = c.createGain(); wet.gain.value = 0.20;      // 룸 감각만 살짝
  const rev = c.createConvolver(); rev.buffer = roomIR(1.35, 2.6);
  const revLP = c.createBiquadFilter(); revLP.type='lowpass'; revLP.frequency.value = 6200;
  // 아웃풋 리미터.
  // 글루 컴프만으로는 크래쉬+킥+스네어 동시타에서 피크가 1.5까지 올라가 클리핑이 났다
  // (2026-08-11 오프라인 렌더로 확인. 원래부터 있던 문제).
  // 컴프는 어택 1.5ms라 첫 트랜지언트가 새므로 뒤에 소프트 클리퍼를 안전망으로 둔다.
  const lim = c.createDynamicsCompressor();
  lim.threshold.value = -2; lim.knee.value = 0;
  lim.ratio.value = 20; lim.attack.value = 0.0015; lim.release.value = 0.09;
  const safe = c.createWaveShaper();
  safe.curve = limiterCurve(); safe.oversample = '2x';   // 4x는 상시 부하라 폰에서 비싸다
  dry.connect(comp); rev.connect(revLP).connect(wet).connect(comp);
  const output=c.createWaveShaper();output.curve=outputSafetyCurve();output.oversample='2x';output.connect(c.destination);
  const legacyOut=c.createGain();legacyOut.gain.value=1-POLISH_AMOUNT/100;
  comp.connect(master).connect(lim).connect(safe).connect(legacyOut).connect(output);
  const polish=createDrumPolish(c,output);
  // The click keeps the old master settings on its own bus. Drum finish must
  // never duck or color the metronome. The final shared ceiling catches sums.
  const clk=c.createGain(),clickComp=c.createDynamicsCompressor(),clickMaster=c.createGain(),clickLim=c.createDynamicsCompressor(),clickSafe=c.createWaveShaper();
  clickComp.threshold.value=-14;clickComp.knee.value=24;clickComp.ratio.value=3.2;clickComp.attack.value=0.004;clickComp.release.value=0.18;
  clickMaster.gain.value=1.35;clickLim.threshold.value=-2;clickLim.knee.value=0;clickLim.ratio.value=20;clickLim.attack.value=0.0015;clickLim.release.value=0.09;
  clickSafe.curve=limiterCurve();clickSafe.oversample='2x';clk.connect(clickComp).connect(clickMaster).connect(clickLim).connect(clickSafe).connect(output);
  /* 드럼 볼륨 (2.1, 2026-10-15) — **드럼 소리만** 지나는 게인 두 개를 버스 앞에 둔다.
     voice()·withArt()는 BUS.dry/BUS.send를 보므로 그 둘을 이 게인으로 바꿔 끼우면
     악기 소리가 전부 여기를 지난다(샘플 킷 포함). 클릭·목소리·메트로놈 탭은
     **BUS.clk**(원래 드라이)로 바로 간다 — 드럼을 줄여도 박은 그대로 들린다.
     컴프 앞이라 드럼을 줄이면 컴프도 덜 눌러 클릭이 상대적으로 또렷해진다. */
  const drumD = c.createGain(), drumS = c.createGain();
  drumD.connect(dry); drumS.connect(rev);
  drumD.connect(polish.dry);drumS.connect(polish.send);
  drumD.gain.value = drumS.gain.value = drumGainNow();
  BUS = {dry:drumD, send:drumS, clk, master, ins:{},legacyOut,polish,output,clickComp,clickMaster};
  return BUS;
}
/* ===== 드럼 볼륨 (2.1, 2026-10-15) =====
   요청: "이 악보를 읽는 소리를 줄이고 싶음" — 실제 드럼 앞에서 연습할 때 앱 드럼은 작게,
   클릭은 그대로. **모든 탭에 걸린다**(2026-10-15 같은 날 사용자 결정 — 처음엔 연습 탭 전용이었다).
   손잡이는 둘: 연습 탭 카드와 설정 서랍(톱니 — 어느 탭·폰에서도 닿는다). 둘은 같은 값을 본다.
   "소리가 안 난다"가 오면 이 값부터 볼 것 — 설정 서랍에 0이면 「끔」으로 보인다.
   값은 0~100, 곡선은 제곱(50 → −12dB) — 선형이면 아래 절반이 거의 안 줄어 들린다.
   0이면 드럼은 안 나고 재생선·클릭·카운트인만 돈다. 곡 파일에 안 담는다(기기 설정). */
const DRUM_VOL_KEY = 'maidrum.drumvol';
let DRUM_VOL = 100;
try{ const v = parseInt(localStorage.getItem(DRUM_VOL_KEY), 10); if(v >= 0 && v <= 100) DRUM_VOL = v; }catch(e){}
function drumGainNow(){ const r = DRUM_VOL / 100; return r * r; }
function applyDrumVol(){
  const txt = DRUM_VOL === 0 ? t('끔') : DRUM_VOL + '%';
  document.querySelectorAll('[data-drumvol-val]').forEach(l=>{ l.textContent = txt; });
  document.querySelectorAll('[data-drumvol]').forEach(r=>{ if((r.value|0) !== DRUM_VOL) r.value = DRUM_VOL; });
  if(!BUS) return;                                   // 버스는 첫 소리 때 만든다 — 그때 drumGainNow()를 읽는다
  const now = ac().currentTime, g = drumGainNow();
  [BUS.dry, BUS.send].forEach(n=>{ n.gain.cancelScheduledValues(now); n.gain.setTargetAtTime(g, now, 0.02); });
}
(function initDrumVol(){
  document.querySelectorAll('[data-drumvol]').forEach(r=>{
    r.value = DRUM_VOL;
    r.addEventListener('input', ()=>{
      DRUM_VOL = Math.max(0, Math.min(100, r.value|0));
      applyDrumVol();                              // 다른 손잡이도 같이 따라온다
      try{ localStorage.setItem(DRUM_VOL_KEY, String(DRUM_VOL)); }catch(e){}
    });
  });
  applyDrumVol();
})();
/* ===== 악기별 볼륨 (2.1, 2026-10-15) =====
   악기마다 게인 두 개(드라이·센드)를 **한 번만** 만들어 드럼 게인 앞에 둔다 —
   hit()이 그 타격 동안 HIT_BUS를 그 악기 것으로 세우고, voice()·withArt()가 bus() 대신
   그걸 본다. 타격마다 노드를 만들지 않으므로 누수가 없다(8-x 굉음 사고와 무관).
   열쇠는 **hit()의 id**(바탕 악기)다 — 오픈 하이햇은 하이햇, 크로스 스틱·림샷은 스네어를 따른다.
   클릭·목소리는 hit()을 안 거치므로 안 탄다. 기기 설정(maidrum.insvol), 곡에 안 담는다.
   100이면 저장하지 않는다 — 기본 상태의 저장값이 {}로 남는다. 곡선은 드럼 볼륨과 같은 제곱. */
const INS_VOL_KEY = 'maidrum.insvol';
function insVolumeMax(id){return ['kick','snare','tom1','tom2'].includes(id)?400:200;}
let INS_VOL = {};
let INS_VOL_SAVE_HOOK = null;
let INS_VOL_STORAGE_OK = true;
try{ const o = JSON.parse(localStorage.getItem(INS_VOL_KEY) || '{}');
  if(o && typeof o === 'object') for(const k in o){ const v = o[k]; if(typeof v==='number' && Number.isFinite(v) && v >= 0 && v <= insVolumeMax(k) && v !== 100) INS_VOL[k] = v|0; } }catch(e){INS_VOL_STORAGE_OK=false;}
/* MIXER_RUNTIME_BEGIN: app-local balance; solo deliberately never serialized. */
const MIXER_KEY='ddakung.mixer.v1';
const MIXER_IDS=['kick','snare','tom1','tom2','ftom','hihat','hihatFoot','ride','crash','splash','china','fx'];
let MIXER={},MIXER_STORAGE_OK=true;
try{const saved=JSON.parse(localStorage.getItem(MIXER_KEY)||'{}');for(const id of MIXER_IDS){const value=saved?.[id];if(value&&typeof value==='object')MIXER[id]={pan:typeof value.pan==='number'&&Number.isFinite(value.pan)?Math.max(-100,Math.min(100,Math.round(value.pan))):0,mute:value.mute===true,solo:false};}}catch{MIXER_STORAGE_OK=false;}
function mixerOf(id){return MIXER[id]||{pan:0,mute:false,solo:false};}
function mixerAudible(id){const value=mixerOf(id);return !value.mute&&(!MIXER_IDS.some(key=>mixerOf(key).solo)||value.solo);}
function mixerRamp(parameter,value,now){parameter.cancelScheduledValues(now);parameter.setTargetAtTime(value,now,0.02);}
function applyMixer(){
  if(!BUS)return;
  const now=ac().currentTime;
  for(const [id,nodes] of Object.entries(BUS.ins)){
    const gain=mixerAudible(id)?insGainOf(id):0;
    for(const node of [nodes.dry,nodes.send])mixerRamp(node.gain,gain,now);
    for(const node of [nodes.panDry,nodes.panSend])if(node?.pan)mixerRamp(node.pan,mixerOf(id).pan/100,now);
  }
}
function mixerNotify(){window.dispatchEvent(new Event('ddakung-mixer-change'));}
function mixerSave(){try{localStorage.setItem(MIXER_KEY,JSON.stringify(Object.fromEntries(MIXER_IDS.map(id=>[id,{pan:mixerOf(id).pan,mute:mixerOf(id).mute}]))));MIXER_STORAGE_OK=true;}catch{MIXER_STORAGE_OK=false;}mixerNotify();return MIXER_STORAGE_OK;}
function mixerSet(id,values){
  if(!MIXER_IDS.includes(id))throw Error('Unknown instrument');
  const value={...mixerOf(id)};
  if(typeof values.pan==='number'&&Number.isFinite(values.pan))value.pan=Math.max(-100,Math.min(100,Math.round(values.pan)));
  for(const key of ['mute','solo'])if(typeof values[key]==='boolean')value[key]=values[key];
  MIXER[id]=value;applyMixer();return mixerSave();
}
function clearMixerSolo(){for(const id of MIXER_IDS)MIXER[id]={...mixerOf(id),solo:false};applyMixer();mixerNotify();}
function resetMixer(){MIXER={};const hook=INS_VOL_SAVE_HOOK;INS_VOL_SAVE_HOOK=null;try{for(const id of MIXER_IDS)setInsVol(id,100);}finally{INS_VOL_SAVE_HOOK=hook;}applyMixer();const saved=mixerSave(),tuned=hook?hook():true;return saved&&tuned&&INS_VOL_STORAGE_OK;}
/* MIXER_RUNTIME_END */
let HIT_BUS = null;                          // 지금 울리는 타격의 악기 버스 — hit()만 세운다
function insVolOf(id){ return INS_VOL[id] == null ? 100 : INS_VOL[id]; }
function insGainOf(id){ const r = insVolOf(id) / 100; return r <= 1 ? r * r : r; }
function insBus(id){
  const B = bus();
  if(B.ins[id]) return B.ins[id];
  const c = ac(), d = c.createGain(), s = c.createGain();
  d.gain.value = s.gain.value = mixerAudible(id)?insGainOf(id):0;
  const panDry=c.createStereoPanner?.(),panSend=c.createStereoPanner?.();
  if(panDry&&panSend){panDry.pan.value=panSend.pan.value=mixerOf(id).pan/100;d.connect(panDry).connect(B.dry);s.connect(panSend).connect(B.send);}
  else{d.connect(B.dry);s.connect(B.send);}
  return (B.ins[id] = {dry:d, send:s,panDry,panSend});
}
function setInsVol(id, v){
  v = Math.max(0, Math.min(insVolumeMax(id), v|0));
  if(v === 100) delete INS_VOL[id]; else INS_VOL[id] = v;
  try{ localStorage.setItem(INS_VOL_KEY, JSON.stringify(INS_VOL));INS_VOL_STORAGE_OK=true; }catch(e){INS_VOL_STORAGE_OK=false;}
  if(BUS && BUS.ins[id]){
    const now = ac().currentTime, g = mixerAudible(id)?insGainOf(id):0;
    [BUS.ins[id].dry, BUS.ins[id].send].forEach(n=>{ n.gain.cancelScheduledValues(now); n.gain.setTargetAtTime(g, now, 0.02); });
  }
  mixerNotify();
  if(INS_VOL_SAVE_HOOK) return INS_VOL_SAVE_HOOK()&&INS_VOL_STORAGE_OK;
}
/* Device-local synthesis controls. Scoped to voice creation, never the sequencer clock. */
const TUNING_KEY = 'ddakung.tuning.v1';
const TUNING_IDS = ['kick','snare','tom1','tom2','ftom','hihat','hihatFoot','ride','crash','splash','china','fx'];
const TUNING_DEFAULT = Object.freeze({pitch:0,resonance:100,tension:0});
let TUNING = {}, ACTIVE_TUNING = null, TUNING_STORAGE_OK = true;
function tuningClamp(v,lo,hi,fallback){return typeof v==='number' && Number.isFinite(v) ? Math.max(lo,Math.min(hi,v)) : fallback;}
function tuningClean(v){
  v=v && typeof v==='object' ? v : {};
  return {pitch:tuningClamp(v.pitch,-12,12,0),resonance:tuningClamp(v.resonance,25,200,100),tension:tuningClamp(v.tension,-100,100,0)};
}
try{
  const saved=JSON.parse(localStorage.getItem(TUNING_KEY)||'{}');
  if(saved && typeof saved==='object') TUNING_IDS.forEach(id=>{
    TUNING[id]=tuningClean(saved[id]);
    if(saved[id] && typeof saved[id].volume==='number') setInsVol(id,tuningClamp(saved[id].volume,0,insVolumeMax(id),100));
  });
}catch(e){TUNING_STORAGE_OK=false;}
function tuningOf(id){return TUNING[id]||TUNING_DEFAULT;}
function tuningPitch(){return ACTIVE_TUNING ? Math.pow(2,ACTIVE_TUNING.pitch/12) : 1;}
function tuningDecay(){return ACTIVE_TUNING ? ACTIVE_TUNING.resonance/100 : 1;}
function tuningTight(){return ACTIVE_TUNING ? ACTIVE_TUNING.tension/100 : 0;}
function tuningHz(hz){return hz*tuningPitch();}
function tuningEnd(t,duration){return t+duration*tuningDecay();}
function tuningSave(){
  try{localStorage.setItem(TUNING_KEY,JSON.stringify(Object.fromEntries(TUNING_IDS.map(id=>[id,{...tuningOf(id),volume:insVolOf(id)}]))));TUNING_STORAGE_OK=true;}
  catch(e){TUNING_STORAGE_OK=false;}
  window.dispatchEvent(new Event('ddakung-tuning-change'));return TUNING_STORAGE_OK;
}
/* SAMPLE_RUNTIME_BEGIN — dependency-injected, also exercised without a browser. */
const DRUM_SOURCE_GROUPS=Object.freeze({kick:['kick'],snare:['snare','snareRim','snareXStick'],tom1:['tom1'],tom2:['tom2'],ftom:['ftom'],hihat:['hihat','hihatOpen'],hihatFoot:['hihatFoot'],ride:['ride','rideBell'],crash:['crash'],splash:['splash'],china:['china'],fx:['fx']});
const DRUM_SOURCE_IDS=Object.keys(DRUM_SOURCE_GROUPS);
const DRUM_EXTRA_DEFAULTS=Object.freeze({splash:'paiste-pst5-splash-8',china:'paiste-innovations-china-18',fx:'big-rusty-stack-3-layer'});
const DRUM_SOURCE_KEY='ddakung.sources.v1';
function drumSourceBase(id){return DRUM_SOURCE_IDS.find(key=>DRUM_SOURCE_GROUPS[key].includes(id))||id;}
function drumSourceMatches(kit,id){return Array.isArray(kit.compatibleTargets)?kit.compatibleTargets.includes(id):!kit.instrument||kit.instrument===(id==='hihatFoot'?'hihat':id);}
class DrumSampleBank {
  constructor({context,fetcher,output,notify=()=>{},storage=null}){
    this.context=context;this.fetcher=fetcher;this.output=output;this.notify=notify;
    this.state='idle';this.id='studio-jazz';this.error='';this.progress=0;
    this.catalog=null;this.manifest=null;this.buffers=new Map();this.roundRobin=new Map();
    this.voices=new Set();this.generation=0;this.pending=null;this.controller=null;
    this.sources=Object.fromEntries(DRUM_SOURCE_IDS.map(id=>[id,DRUM_EXTRA_DEFAULTS[id]?'synth':'studio-jazz']));this.requestedSources=null;
    this.manifests=new Map();this.inflight=new Map();this.activeLoads=0;this.loadQueue=[];this.bufferLevels=new WeakMap();
    this.sourceLoading=false;this.storage=storage;this.sourceStorageOk=true;this.candidate=null;this.candidateRevision=0;
  }
  status(){return {sampleState:this.state,kit:this.id,sampleError:this.error,sampleProgress:this.progress,sourceLoading:this.sourceLoading,sourceStorageOk:this.sourceStorageOk,kitLabel:this.id==='custom'?'나의 조합 킷':this.manifest?.label||this.catalog?.kits.find(k=>k.id===this.id)?.label||this.id};}
  sourceFor(id){return this.sources[drumSourceBase(id)]||'studio-jazz';}
  isSynth(id){return this.sourceFor(id)==='synth';}
  serializeSources(){return {version:1,sources:{...this.sources}};}
  saveSources(){try{this.storage?.setItem(DRUM_SOURCE_KEY,JSON.stringify(this.serializeSources()));this.sourceStorageOk=true;}catch{this.sourceStorageOk=false;}this.update();}
  retrySources(){
    // A remounted personal library changes a previously successful public-only
    // catalog response. Explicit retry must discover those sources again.
    this.catalog=null;this.catalogPromise=null;this.manifests.clear();this.manifestPromises?.clear();
    return this.state==='error'?this.restoreSources():this.loadSources(this.sources,false);
  }
  async restoreSources(record){
    if(record===undefined){try{record=JSON.parse(this.storage?.getItem(DRUM_SOURCE_KEY)||'null');}catch{this.sourceStorageOk=false;}}
    const assignments=Object.fromEntries(DRUM_SOURCE_IDS.filter(id=>!DRUM_EXTRA_DEFAULTS[id]||record?.version===1&&typeof record.sources?.[id]==='string').map(id=>[id,record?.version===1&&typeof record.sources?.[id]==='string'?record.sources[id]:'studio-jazz']));
    return this.loadSources(assignments,false);
  }
  async getManifest(id){
    if(this.manifests.has(id))return this.manifests.get(id);
    if(!this.manifestPromises)this.manifestPromises=new Map();
    if(!this.manifestPromises.has(id))this.manifestPromises.set(id,(async()=>{
      const catalog=await this.getCatalog(),kit=catalog.kits.find(k=>k.id===id);
      if(!kit)throw Error('찾을 수 없는 드럼 소스입니다: '+id);
      const response=await this.fetcher(kit.manifest);if(!response.ok)throw Error('샘플 설명 파일을 불러오지 못했습니다.');
      const manifest=await response.json();
      if(manifest.version!==1||!manifest.variants)throw Error('샘플 설명 형식이 올바르지 않습니다.');
      this.manifests.set(id,manifest);return manifest;
    })().finally(()=>this.manifestPromises.delete(id)));
    return this.manifestPromises.get(id);
  }
  async getSources(id){
    if(!DRUM_SOURCE_GROUPS[id])throw Error('알 수 없는 악기입니다.');
    const catalog=await this.getCatalog();
    return Promise.all(catalog.kits.filter(kit=>drumSourceMatches(kit,id)&&kit.available!==false).map(async kit=>{
      try{
        const manifest=await this.getManifest(kit.id),group=DRUM_SOURCE_GROUPS[id],variants=manifest.variants[id]||[];
        return {...kit,available:variants.length>0,layers:new Set(variants.map(v=>v.velocity??0.8)).size,alternates:Math.max(0,...[...new Set(variants.map(v=>v.velocity??0.8))].map(velocity=>variants.filter(v=>(v.velocity??0.8)===velocity).length)),articulations:group.filter(key=>manifest.variants[key]?.length),warnings:group.flatMap(key=>manifest.fallbacks?.[key]?[key+': '+(manifest.fallbacksKo?.[key]||manifest.fallbacks[key])]:manifest.variants[key]?.length?[]:[key+': 별도 녹음 없음 · 일반 타격 사용'])};
      }catch(error){return {...kit,available:false,loadError:error.message,layers:0,alternates:0,articulations:[],warnings:[error.message]};}
    }));
  }
  async withLoadSlot(task){
    if(this.activeLoads>=4)await new Promise(resolve=>this.loadQueue.push(resolve));
    else this.activeLoads++;
    try{return await task();}finally{const next=this.loadQueue.shift();if(next)next();else this.activeLoads--;}
  }
  cancelStaleLoads(){
    for(const [url,entry] of this.inflight){
      if(![...entry.consumers].some(valid=>valid())){
        this.inflight.delete(url);entry.controller.abort();
      }
    }
  }
  obtainBuffer(url,valid){
    if(this.buffers.has(url))return Promise.resolve(this.buffers.get(url));
    if(this.candidate?.buffers.has(url))return Promise.resolve(this.candidate.buffers.get(url));
    const existing=this.inflight.get(url);
    if(existing){existing.consumers.add(valid);return existing.promise.then(buffer=>buffer||!valid()?buffer:this.obtainBuffer(url,valid));}
    const entry={controller:new AbortController(),consumers:new Set([valid]),promise:null};
    entry.promise=this.withLoadSlot(async()=>{
      if(entry.controller.signal.aborted||![...entry.consumers].some(check=>check()))return null;
      const timeout=setTimeout(()=>entry.controller.abort(),20000);
      try{
        const response=await this.fetcher(url,{signal:entry.controller.signal});
        if(!response.ok)throw Error('샘플을 불러오지 못했습니다: '+url.split('/').pop());
        const raw=await response.arrayBuffer();
        if(entry.controller.signal.aborted)return null;
        return await this.context().decodeAudioData(raw);
      }catch(error){
        if(entry.controller.signal.aborted&&[...entry.consumers].some(check=>check()))throw Error('샘플 응답 시간이 초과되었습니다. 다시 시도해 주세요.');
        throw error;
      }finally{clearTimeout(timeout);}
    }).finally(()=>{if(this.inflight.get(url)===entry)this.inflight.delete(url);});
    this.inflight.set(url,entry);return entry.promise;
  }
  async buildSelection(assignments,valid,onProgress=()=>{}){
    const catalog=Object.values(assignments).some(source=>source!=='synth')?await this.getCatalog():null;
    for(const [id,source] of Object.entries(assignments)){
      if(source==='synth')continue;
      const kit=catalog.kits.find(item=>item.id===source);
      if(!kit||kit.available===false||!drumSourceMatches(kit,id))throw Error('선택한 소스는 이 악기에 사용할 수 없습니다: '+id);
    }
    const manifests=new Map(await Promise.all([...new Set(Object.values(assignments).filter(id=>id!=='synth'))].map(async id=>[id,await this.getManifest(id)])));
    if(!valid())return null;
    const variants={},gains={},fallbacks={};
    for(const id of DRUM_SOURCE_IDS){
      const source=assignments[id];if(source==='synth')continue;
      const manifest=manifests.get(source);if(!manifest)continue;
      if(!manifest.variants[id]?.length)throw Error('선택한 소스에는 '+id+' 녹음이 없습니다.');
      for(const articulation of DRUM_SOURCE_GROUPS[id]){
        if(manifest.variants[articulation]?.length)variants[articulation]=manifest.variants[articulation];
        if(manifest.gains?.[articulation]!=null)gains[articulation]=manifest.gains[articulation];
        if(manifest.fallbacks?.[articulation])fallbacks[articulation]=manifest.fallbacks[articulation];
      }
    }
    const urls=[...new Set(Object.values(variants).flat().map(v=>v.url))];
    if(urls.length>1500||urls.some(url=>typeof url!=='string'||!url.startsWith('/samples/')))throw Error('샘플 경로가 올바르지 않습니다.');
    const buffers=new Map();let complete=0,cursor=0;
    await Promise.all(Array.from({length:Math.min(4,urls.length)},async()=>{
      while(cursor<urls.length&&valid()){
        const url=urls[cursor++],buffer=await this.obtainBuffer(url,valid);
        if(!valid())return;if(buffer)buffers.set(url,buffer);onProgress(++complete/urls.length);
      }
    }));
    return valid()?{manifest:{version:1,id:'custom',label:'나의 조합 킷',variants,gains,fallbacks},buffers}:null;
  }
  update(){this.notify(this.status());}
  async getCatalog(){
    if(this.catalog)return this.catalog;
    if(!this.catalogPromise)this.catalogPromise=(async()=>{
      const response=await this.fetcher('/samples/catalog.json');
      if(!response.ok)throw Error('샘플 목록을 불러오지 못했습니다.');
      const data=await response.json();
      if(data.version!==1||!Array.isArray(data.kits)||!data.kits.length)throw Error('샘플 목록 형식이 올바르지 않습니다.');
      this.catalog=data;return data;
    })().catch(error=>{this.catalogPromise=null;throw error;});
    return this.catalogPromise;
  }
  load(id=this.id){
    if(id==='custom')return this.loadSources(this.requestedSources||this.sources);
    return this.loadSources(Object.fromEntries(DRUM_SOURCE_IDS.map(key=>[key,id!=='synth'&&DRUM_EXTRA_DEFAULTS[key]?this.sources[key]||'synth':id])));
  }
  chooseSource(id,source){
    if(!DRUM_SOURCE_GROUPS[id])return Promise.reject(Error('알 수 없는 악기입니다.'));
    return this.loadSources({...this.requestedSources||this.sources,[id]:source});
  }
  loadSources(assignments,persist=true){
    const missingExtras=Object.keys(DRUM_EXTRA_DEFAULTS).filter(id=>typeof assignments[id]!=='string');
    assignments={...Object.fromEntries(Object.keys(DRUM_EXTRA_DEFAULTS).map(id=>[id,'synth'])),...assignments};
    const generation=++this.generation,previousReady=this.state==='ready'||this.state==='synth';
    this.cancelStaleLoads();
    const valid=()=>generation===this.generation;
    this.requestedSources={...assignments};this.sourceLoading=true;this.error='';this.progress=0;
    if(!previousReady)this.state='loading';this.update();
    this.pending=(async()=>{
      try{
        // Migration is part of this generation/readiness promise, so a newer
        // user choice can cancel it and catalog failures remain observable.
        if(missingExtras.length){
          const catalog=await this.getCatalog();if(!valid())return false;
          for(const id of missingExtras){
            const model=catalog.kits.find(kit=>kit.id===DRUM_EXTRA_DEFAULTS[id]&&kit.available!==false&&drumSourceMatches(kit,id));
            if(model)assignments[id]=model.id;
          }
          this.requestedSources={...assignments};
        }
        const selection=await this.buildSelection(assignments,valid,progress=>{this.progress=progress;this.update();});
        if(!selection||!valid())return false;
        const identity=Object.entries(assignments).filter(([id,source])=>!DRUM_EXTRA_DEFAULTS[id]||source!=='synth').map(([,source])=>source);
        const unique=[...new Set(identity)],kit=unique.length===1?unique[0]:'custom';
        const label=kit==='custom'?'나의 조합 킷':this.catalog?.kits.find(k=>k.id===kit)?.label||kit;
        // Commit all sources together. Playback retains the previous complete
        // selection throughout downloading; a failed change cannot erase it.
        const old=this.buffers;this.buffers=selection.buffers;old.clear();
        this.sources={...assignments};this.requestedSources=null;this.id=kit;
        this.manifest={...selection.manifest,id:kit,label};this.roundRobin.clear();
        this.state=kit==='synth'?'synth':'ready';this.sourceLoading=false;this.progress=1;
        this.stopPreview();if(persist)this.saveSources();else this.update();return true;
      }catch(error){
        if(!valid())return false;
        this.requestedSources=null;this.sourceLoading=false;this.state=previousReady?this.state:'error';
        this.error=error.message||String(error);this.update();throw error;
      }
    })();return this.pending;
  }
  cancelCandidate(){
    this.candidateRevision++;this.cancelStaleLoads();if(this.candidate){this.candidate.bank.stopAll();this.candidate.buffers.clear();this.candidate=null;}
  }
  async auditionSource(id,source,tuning,variant){
    if(!DRUM_SOURCE_GROUPS[id])throw Error('알 수 없는 악기입니다.');
    this.cancelCandidate();this.stopPreview();const revision=this.candidateRevision,valid=()=>revision===this.candidateRevision;
    const assignments=Object.fromEntries(DRUM_SOURCE_IDS.map(key=>[key,key===id?source:'synth']));
    const selection=await this.buildSelection(assignments,valid);if(!selection||!valid())return false;
    if(!selection.manifest.variants[id]?.length)throw Error('이 소스에는 선택한 악기의 녹음이 없습니다.');
    const bank=new DrumSampleBank({context:this.context,fetcher:this.fetcher,output:this.output});
    bank.state='ready';bank.manifest=selection.manifest;bank.buffers=selection.buffers;
    this.candidate={bank,buffers:selection.buffers};
    bank.onVoiceEnd=()=>{if(!bank.voices.size){selection.buffers.clear();if(this.candidate?.bank===bank)this.candidate=null;}};
    const sid=id==='hihat'&&variant==='open'?'hihatOpen':id;
    bank.play(sid,this.context().currentTime+0.005,0.8,tuning,true);return true;
  }
  async ready(){
    while(this.state!=='ready'&&this.state!=='synth'){
      const generation=this.generation;
      if(this.state==='error')throw Error(this.error);
      await (this.pending||this.load());
      if(generation===this.generation&&this.state==='error')throw Error(this.error);
    }
  }
  choose(id,velocity){
    let variants=this.manifest?.variants[id];
    // Missing articulations use a normal hit of the same instrument, never a
    // different articulation labelled as equivalent (edge is not a rimshot).
    if(!variants?.length){const base={snareRim:'snare',snareXStick:'snare',rideBell:'ride',hihatOpen:'hihat',hihatFoot:'hihat'}[id];variants=this.manifest?.variants[base];}
    if(!variants?.length)return null;
    const distance=Math.min(...variants.map(v=>Math.abs((v.velocity??0.8)-velocity)));
    const layer=variants.filter(v=>Math.abs(Math.abs((v.velocity??0.8)-velocity)-distance)<1e-6);
    const key=id+':'+(layer[0].velocity??0.8),index=this.roundRobin.get(key)||0;
    this.roundRobin.set(key,index+1);return layer[index%layer.length];
  }
  stopVoice(voice,when){
    if(!this.voices.has(voice))return;
    const c=this.context(),time=Math.max(c.currentTime,when??c.currentTime);
    if(time+0.025>=voice.stopTime)return;
    voice.stopTime=time+0.025;
    voice.gain.gain.cancelScheduledValues(time);
    // Keep scheduled future hits silent and fade sounding hits without clicks.
    voice.gain.gain.setTargetAtTime(0,time,0.004);
    try{voice.source.stop(time+0.025);}catch{}
  }
  stopPreview(){for(const voice of this.voices)if(voice.preview)this.stopVoice(voice);}
  stopAll(){for(const voice of this.voices)this.stopVoice(voice);}
  bufferLevel(buffer){
    if(!buffer||typeof buffer.getChannelData!=='function'||!buffer.length||!buffer.sampleRate)return null;
    if(this.bufferLevels.has(buffer))return this.bufferLevels.get(buffer);
    // Measure once per decoded buffer, without changing the recorded samples.
    // The attack window avoids letting long room tails determine ghost strength.
    const frames=Math.min(buffer.length,Math.ceil(buffer.sampleRate*0.16));let sum=0,count=0;
    for(let channel=0;channel<buffer.numberOfChannels;channel++){
      const data=buffer.getChannelData(channel);
      for(let i=0;i<frames;i+=4){sum+=data[i]*data[i];count++;}
    }
    const level=count?Math.sqrt(sum/count):0;this.bufferLevels.set(buffer,level);return level;
  }
  ghostSnareTrim(variant,trim){
    const variants=this.manifest?.variants.snare||[],normalVelocity=0.8;
    const distance=Math.min(...variants.map(v=>Math.abs((v.velocity??normalVelocity)-normalVelocity)));
    const references=variants.filter(v=>Math.abs(Math.abs((v.velocity??normalVelocity)-normalVelocity)-distance)<1e-6);
    const levels=references.map(v=>{const rms=this.bufferLevel(this.buffers.get(v.url));return rms==null?null:rms*Math.max(0.65,Math.min(1.25,normalVelocity/(v.velocity||normalVelocity)));}).filter(v=>v!=null);
    const selected=this.bufferLevel(this.buffers.get(variant.url));
    if(!selected||!levels.length)return 0.38;
    const reference=levels.reduce((sum,v)=>sum+v,0)/levels.length;
    // At most one quarter of a normal stroke's attack RMS before the master.
    // Already-soft recordings keep their natural level; never boost a ghost.
    return reference>0?Math.min(1,0.25*reference/(selected*trim)):0.38;
  }
  manualTrim(id,variant,velocity,ghost){
    const base={snareRim:'snare',snareXStick:'snare',rideBell:'ride',hihatOpen:'hihat',hihatFoot:'hihat'}[id]||id;
    const variants=this.manifest?.variants[id]?.length?this.manifest.variants[id]:this.manifest?.variants[base]||[];
    const distance=Math.min(...variants.map(v=>Math.abs((v.velocity??0.8)-0.8)));
    const references=variants.filter(v=>Math.abs(Math.abs((v.velocity??0.8)-0.8)-distance)<1e-6);
    const levels=references.map(v=>{const rms=this.bufferLevel(this.buffers.get(v.url));return rms>0?rms*Math.max(0.65,Math.min(1.25,0.8/(v.velocity||0.8))):null;}).filter(v=>v!==null);
    const selected=this.bufferLevel(this.buffers.get(variant.url));
    // All manual levels share one measured normal reference. Layer changes
    // change timbre, without reversing or jumping the intended attack level.
    const ratio=velocity/0.8*(ghost&&drumSourceBase(id)==='snare'?0.8:1);
    if(selected>0&&levels.length)return levels.reduce((a,b)=>a+b,0)/levels.length/selected*ratio;
    return velocity/(variant.velocity||0.8)*(ghost&&drumSourceBase(id)==='snare'?0.8:1);
  }
  play(id,time,velocity=0.8,tuning={pitch:0,resonance:100,tension:0},preview=false,ghost=false,feelGain=1,roll=null,manual=false){
    if(this.state!=='ready')return false;
    const variant=this.choose(id,velocity),buffer=variant&&this.buffers.get(variant.url);
    if(!buffer)return false;
    const c=this.context();
    if(preview)this.stopPreview();
    if(id==='hihat'||id==='hihatFoot'){
      for(const voice of this.voices)if(voice.id==='hihatOpen'&&voice.preview===preview&&voice.time<=time)this.stopVoice(voice,time);
    }
    // Bound both song and preview voice count under dense rolls / long cymbals.
    if(this.voices.size>=96){const oldest=this.voices.values().next().value;this.stopVoice(oldest);oldest.cleanup();}
    const source=c.createBufferSource(),gain=c.createGain(),filter=c.createBiquadFilter(),send=c.createGain();
    source.buffer=buffer;source.loop=false;
    const rimshot=id==='snareRim';
    const recordedRim=rimshot&&!this.manifest.fallbacks?.snareRim&&!this.manifest.variants.snare?.some(v=>v.url===variant.url);
    const rimPitch=rimshot?(recordedRim?2:3):0,rimPower=rimshot?(recordedRim?1.5:1.8):1;
    source.playbackRate.value=Math.pow(2,((tuning.pitch||0)+(variant.pitchSemitones||0)+rimPitch)/12);
    filter.type='lowpass';filter.frequency.value=Math.min(c.sampleRate*0.45,15000*Math.pow(2,(tuning.tension||0)/130));filter.Q.value=0.5;
    const rate=source.playbackRate.value,natural=buffer.duration/rate;
    const rollDrum=roll&&['snare','tom1','tom2','ftom'].includes(drumSourceBase(id));
    const naturalTail=Math.max(0.015,natural*Math.min(1,(tuning.resonance||100)/100));
    const tail=rollDrum?Math.min(naturalTail,Math.max(0.045,Math.min(0.18,roll.gap*1.6))):naturalTail;
    // Real soft strokes supply the timbre. Some libraries normalize layers,
    // so an explicit ghost also needs model-aware level/attack/room separation.
    const trim=Math.max(0.65,Math.min(1.25,velocity/(variant.velocity||0.8)));
    const ghostSnare=ghost&&drumSourceBase(id)==='snare';
    const level=(manual?this.manualTrim(id,variant,velocity,ghost):trim*(ghostSnare?this.ghostSnareTrim(variant,trim):1))*(this.manifest.gains?.[id]??1)*0.72*(preview&&!roll?1:feelGain)*rimPower;
    const ghostTone=ghostSnare?c.createBiquadFilter():null;
    if(ghostTone){ghostTone.type='highshelf';ghostTone.frequency.value=2800;ghostTone.gain.value=-4;}
    const rimTone=rimshot?c.createBiquadFilter():null;
    if(rimTone){rimTone.type='highshelf';rimTone.frequency.value=2600;rimTone.gain.value=recordedRim?4.5:6;}
    const attack=rimshot?0.00015:(100-(tuning.tension||0))/100*0.0015;
    gain.gain.setValueAtTime(0,time);gain.gain.linearRampToValueAtTime(level,time+attack+0.0003);
    if(rollDrum){
      gain.gain.setValueAtTime(level,time+Math.min(0.012,tail*0.2));
      gain.gain.linearRampToValueAtTime(level*0.28,time+tail*0.6);
      gain.gain.linearRampToValueAtTime(0,time+tail);
    }else{gain.gain.setValueAtTime(level,time+Math.max(attack+0.001,tail-0.02));gain.gain.linearRampToValueAtTime(0,time+tail);}
    const bus=this.output(id),room=id==='kick'?0.025:0.09;
    send.gain.value=(room+Math.max(0,(tuning.resonance||100)-100)/100*0.28)*(ghostSnare?0.45:1)*(rollDrum?0.25:1);
    source.connect(filter);if(ghostTone)filter.connect(ghostTone).connect(gain);else if(rimTone)filter.connect(rimTone).connect(gain);else filter.connect(gain);gain.connect(bus.dry);gain.connect(send).connect(bus.send);
    const voice={id,time,source,gain,preview,stopTime:time+tail+0.025,cleanup:()=>{this.voices.delete(voice);source.onended=null;for(const node of [source,filter,ghostTone,rimTone,gain,send])try{node?.disconnect();}catch{}this.onVoiceEnd?.();}};
    source.onended=voice.cleanup;this.voices.add(voice);source.start(time);source.stop(time+tail+0.025);return true;
  }
}
// At most one pending timer, latest instrument wins; no extra hits during song.
function createDrumAuditioner({preview,isPlaying,onError=()=>{},schedule=setTimeout,cancel=clearTimeout,delay=130}){
  let timer=null,latest=null;
  return {request(id){latest=id;if(timer!==null)return;timer=schedule(()=>{timer=null;if(isPlaying())return;Promise.resolve(preview(latest)).catch(onError);},delay);},cancel(){if(timer!==null)cancel(timer);timer=null;latest=null;}};
}
/* SAMPLE_RUNTIME_END */
const SAMPLE_BANK=new DrumSampleBank({context:ac,fetcher:(...args)=>fetch(...args),output:id=>insBus(({snareRim:'snare',snareXStick:'snare',hihatOpen:'hihat',rideBell:'ride'})[id]||id),storage:localStorage,notify:()=>window.dispatchEvent(new Event('ddakung-samples-change'))});
let PREVIEW_REVISION=0,PLAY_REQUEST=0,PLAY_PENDING=false,SYNTH_PREVIEW_BUS=null;
function stopSynthPreview(){
  if(!SYNTH_PREVIEW_BUS)return;
  const old=SYNTH_PREVIEW_BUS;SYNTH_PREVIEW_BUS=null;const time=ac().currentTime;
  for(const node of [old.dry,old.send]){node.gain.cancelScheduledValues(time);node.gain.setTargetAtTime(0,time,0.004);}
  setTimeout(()=>{old.dry.disconnect();old.send.disconnect();},30);
}
function synthPreviewBus(destination){
  stopSynthPreview();const c=ac(),dry=c.createGain(),send=c.createGain();dry.connect(destination.dry);send.connect(destination.send);
  const previewBus=SYNTH_PREVIEW_BUS={dry,send};
  setTimeout(()=>{if(SYNTH_PREVIEW_BUS===previewBus)SYNTH_PREVIEW_BUS=null;dry.disconnect();send.disconnect();},12000);
  return previewBus;
}

window.ddakungAudio={
  volumeMax:insVolumeMax,
  polishGet:polishSettings,polishSet:setPolish,
  mixerGet(id){if(!MIXER_IDS.includes(id))throw Error('Unknown instrument');return {...mixerOf(id),volume:insVolOf(id)};},
  mixerSet, mixerReset:resetMixer, clearSolo:clearMixerSolo,
  mixerStatus:()=>({storageOk:MIXER_STORAGE_OK&&INS_VOL_STORAGE_OK&&TUNING_STORAGE_OK,soloCount:MIXER_IDS.filter(id=>mixerOf(id).solo).length}),
  instruments:()=>TUNING_IDS.map(id=>({id,label:(CAT_BY_ID[id]&&CAT_BY_ID[id].name)||id,metal:['hihat','hihatFoot','ride','crash','splash','china','fx'].includes(id)})),
  get(id){if(!TUNING_IDS.includes(id))throw new Error('Unknown instrument');return {...tuningOf(id),volume:insVolOf(id)};},
  status:()=>({storageOk:TUNING_STORAGE_OK&&INS_VOL_STORAGE_OK,muted:DRUM_VOL===0,playing:typeof playing!=='undefined'&&playing,...SAMPLE_BANK.status()}),
  catalog:()=>SAMPLE_BANK.getCatalog(),
  sourceFor:id=>SAMPLE_BANK.sourceFor(id),
  getSources:id=>SAMPLE_BANK.getSources(id),
  chooseSource(id,source){this.cancelAudition();return SAMPLE_BANK.chooseSource(id,source);},
  retrySources(){return SAMPLE_BANK.retrySources();},
  async auditionSource(id,source,variant){this.cancelAudition();const revision=PREVIEW_REVISION,c=ac();await resumeAudioContext(c);if(revision!==PREVIEW_REVISION)return false;if(c.state&&c.state!=='running')throw Error('오디오를 시작하지 못했습니다.');return SAMPLE_BANK.auditionSource(id,source,tuningOf(id),variant);},
  loadKit(id){this.cancelAudition();return SAMPLE_BANK.load(id);},
  ready:()=>SAMPLE_BANK.ready(),
  resume:()=>resumeAudioContext(),
  outputStatus:()=>({state:ctx?.state||'not-started',playing,pending:PLAY_PENDING,interrupted:AUDIO_INTERRUPTED}),
  stopPreview(){PREVIEW_REVISION++;SAMPLE_BANK.stopPreview();SAMPLE_BANK.cancelCandidate();stopSynthPreview();},
  set(id,values){
    if(!TUNING_IDS.includes(id))throw new Error('Unknown instrument');
    TUNING[id]=tuningClean({...tuningOf(id),...values});
    if(Object.prototype.hasOwnProperty.call(values,'volume'))return setInsVol(id,tuningClamp(values.volume,0,insVolumeMax(id),100));
    return tuningSave();
  },
  reset(id){
    const ids=id?[id]:TUNING_IDS;
    if(ids.some(k=>!TUNING_IDS.includes(k)))throw new Error('Unknown instrument');
    const previousHook=INS_VOL_SAVE_HOOK;INS_VOL_SAVE_HOOK=null;
    try{ids.forEach(k=>{delete TUNING[k];setInsVol(k,100);});}finally{INS_VOL_SAVE_HOOK=previousHook;}
    return tuningSave();
  },
  audition(id){const revision=++PREVIEW_REVISION;resumeAudioContext().catch(error=>{if(revision===PREVIEW_REVISION)window.dispatchEvent(new CustomEvent('ddakung-audio-error',{detail:error.message}));});TUNING_AUDITION.request(id);},
  cancelAudition(){TUNING_AUDITION.cancel();this.stopPreview();},
  async preview(id,variant,automatic=false){
    if(!TUNING_IDS.includes(id))throw new Error('Unknown instrument');
    const revision=++PREVIEW_REVISION,c=ac();
    try{
      await resumeAudioContext(c);if(revision!==PREVIEW_REVISION)return;
      await SAMPLE_BANK.ready();
    }catch(error){if(revision!==PREVIEW_REVISION)return;throw error;}
    if(revision!==PREVIEW_REVISION||(automatic&&playing))return;
    SAMPLE_BANK.cancelCandidate();
    if(c.state&&c.state!=='running')throw new Error('Audio unavailable');
    const sid=id==='hihat'&&variant==='open'?'hihatOpen':id;
    const previous=ACTIVE_TUNING,previousBus=HIT_BUS,previousT=VOICE_T,t=c.currentTime+0.005;
    ACTIVE_TUNING=tuningOf(id);HIT_BUS=insBus(id);VOICE_T=t;
    if(SAMPLE_BANK.isSynth(id))HIT_BUS=synthPreviewBus(HIT_BUS);
    const ghost=id==='snare'&&variant==='ghost';
    try{if(SAMPLE_BANK.isSynth(id))withArt(id,t,ghost?ART.GHOST:ART.NORM,()=>SOUND[sid](t));else SAMPLE_BANK.play(sid,t,ghost?0.25:0.8,tuningOf(id),true,ghost);}finally{ACTIVE_TUNING=previous;HIT_BUS=previousBus;VOICE_T=previousT;}
  }
};
const TUNING_AUDITION=createDrumAuditioner({preview:id=>window.ddakungAudio.preview(id,undefined,true),isPlaying:()=>playing,onError:error=>window.dispatchEvent(new CustomEvent('ddakung-audio-error',{detail:error.message}))});
INS_VOL_SAVE_HOOK=tuningSave;
/* 0.85까지는 완전히 투명하고 그 위만 1.0 아래로 눕히는 곡선.
   WaveShaper는 입력 ±1 밖을 곡선 양끝값으로 물리므로 출력이 0.964를 넘지 않는다. */
function limiterCurve(){
  const n = 4096, cur = new Float32Array(n), K = 0.85;
  for(let i=0;i<n;i++){
    const x = i*2/(n-1) - 1, a = Math.abs(x), s = x < 0 ? -1 : 1;
    cur[i] = a <= K ? x : s*(K + (1-K)*Math.tanh((a-K)/(1-K)));
  }
  return cur;
}
function roomIR(sec, decay){
  const c = ac(), len = Math.floor(c.sampleRate*sec);
  const b = c.createBuffer(2, len, c.sampleRate);
  for(let ch=0; ch<2; ch++){
    const d = b.getChannelData(ch);
    for(let i=0;i<len;i++){
      const t = i/len;
      // 초반 반사 + 지수 감쇠
      d[i] = (Math.random()*2-1) * Math.pow(1-t, decay) * (i < c.sampleRate*0.01 ? 0.35 : 1);
    }
  }
  return b;
}
/* 타격 하나에 걸리는 트림. withArt()가 세팅해 두면 그 안에서 만들어진 모든
   voice()가 이 트림을 거쳐 나간다. 개별 SYNTH 함수를 건드리지 않고
   아티큘레이션을 입히기 위한 장치. */
let CUR_TRIM = null;

/* 약하게 친 스트로크는 세 가지가 동시에 변한다.
   (1) 작다  (2) 어둡다 — 스틱이 헤드를 살짝 건드리면 고차 배음이 안 실린다
   (3) 짧다  (4) 룸을 덜 울린다
   게인만 줄이면 "작은 똑같은 소리"라서 고스트로 안 들린다. 실제로 처음에 그렇게 만들었다가
   드러머 피드백으로 확인했다(2026-08-11). 밝기 지표가 거의 안 변한 게 증거였다.
   스네어는 6.2kHz 크랙 레이어를 죽이는 게 핵심이라 셸프를 가장 세게 건다. */
/* 기준: 드러머 확인 — "고스트는 보통 스네어 볼륨의 1/5". 피크 진폭 비 0.20 = −14dB.
   MIDI 관례(고스트 벨로시티 20~25 대 보통 100)와도 맞는다.
   vel 값이 그대로 비율이 되지는 않는다. 셸프가 피크를 만드는 크랙 레이어를 깎고
   마스터 리미터는 큰 쪽만 눌러서, 실측 비율을 보고 역산해야 한다. */
const GHOST = {
  snare: {vel:0.30, hz:2200, db:-12, tail:0.085},
  // 하이햇은 스펙트럼이 통째로 7kHz 위에 있어서 셸프 코너를 낮게 잡으면
  // 음색은 안 변하고 볼륨만 −15dB 빠진다. 코너를 9kHz로 올려야 "어두워"진다
  hihat: {vel:0.31, hz:9000, db:-8,  tail:0.05},
  hihatFoot: {vel:0.34, hz:5000, db:-6,  tail:0.03},   // 이미 어둡고 짧아서 덜 깎는다
  ride:  {vel:0.28, hz:7000, db:-7,  tail:0.20},
  crash: {vel:0.28, hz:7000, db:-7,  tail:0.20},
  splash:{vel:0.28, hz:7000, db:-7, tail:0.20},
  china: {vel:0.28, hz:7000, db:-7, tail:0.20},
  fx:    {vel:0.28, hz:7000, db:-7, tail:0.20},
  kick:  {vel:0.17, hz:3000, db:-9,  tail:0.12},   // 셸프가 안 먹는 저역이라 vel로만 잡는다
  _:     {vel:0.20, hz:3000, db:-9,  tail:0.10},   // 탐
};
/* 액센트 = 고스트의 반대. 세게 친 스트로크도 네 가지가 같이 변한다 —
   **크다 / 밝다 / 길다 / 룸을 더 울린다.** 게인만 올리면 "큰 똑같은 소리"가 되고,
   그건 고스트에서 이미 한 번 겪었다("차이가 없다"는 피드백).
   구조는 GHOST와 똑같이 `withArt`의 공용 트림에 얹는다.
   `tail`은 고스트처럼 자르는 게 아니라 **안 자른다**(null) — 대신 센드를 올려 길게 들리게. */
const ACCENT = {
  snare: {vel:1.55, hz:3000, db:+4.5, send:0.85},   // 크랙 레이어를 살려야 "빡" 소리가 난다
  hihat: {vel:1.45, hz:8000, db:+4,   send:0.70},
  hihatFoot: {vel:1.50, hz:5000, db:+3,   send:0.45},   // 세게 밟아도 룸은 덜 울린다
  ride:  {vel:1.45, hz:6000, db:+3.5, send:0.85},
  crash: {vel:1.35, hz:6000, db:+3,   send:0.90},
  splash:{vel:1.35, hz:6000, db:+3, send:0.90},
  china: {vel:1.35, hz:6000, db:+3, send:0.90},
  fx:    {vel:1.35, hz:6000, db:+3, send:0.90},
  kick:  {vel:1.55, hz:2000, db:+2,   send:0.60},   // 저역이라 셸프가 거의 안 먹는다. 게인 위주
  _:     {vel:1.50, hz:2500, db:+3,   send:0.75},   // 탐
};
function withArt(id, t, art, fn){
  if(isGhost(art)) art = ART.GHOST;          // 고스트 롤은 고스트 소리
  const rim=id==='snare'&&art===ART.RIM;
  if(art !== ART.GHOST && art !== ART.ACCENT&&!rim){ fn(); return; }
  const acc = (art === ART.ACCENT)||rim;
  const g = rim?{vel:1.5,hz:2600,db:5,send:0.65}:acc ? (ACCENT[id] || ACCENT._) : (GHOST[id] || GHOST._);
  const c = ac(), B = HIT_BUS || bus();
  const mk = ()=>{ const f = c.createBiquadFilter();
    f.type='highshelf'; f.frequency.value=g.hz; f.gain.value=g.db; return f; };
  // 드라이와 센드에 셸프를 따로 둔다. 하나로 합쳐 두 경로가 같은 노드로 들어가면
  // 신호가 두 번 더해져 드라이/웻 밸런스가 깨진다
  const shD = mk(), shS = mk();
  const d = c.createGain(), s = c.createGain();
  d.gain.setValueAtTime(g.vel, t);
  if(!acc) d.gain.exponentialRampToValueAtTime(g.vel*0.05, t + g.tail);   // 고스트만 꼬리를 자른다
  s.gain.value = g.vel * (acc ? g.send : 0.45);
  shD.connect(d).connect(B.dry);
  shS.connect(s).connect(B.send);
  const prev = CUR_TRIM;
  CUR_TRIM = {dry:shD, send:shS};
  try{ fn(); } finally { CUR_TRIM = prev; }
  // 정리는 "예약 시각 + 여유"만큼 뒤에 한다. 그냥 4000ms로 두면 실제 시계 기준이라
  // 오프라인 렌더처럼 컨텍스트 시간이 실제 시간보다 빨리 흐를 때 소리가 나기도 전에 노드가 끊긴다
  const lead = Math.max(0, t - c.currentTime) * 1000;
  setTimeout(()=>{ try{ shD.disconnect(); shS.disconnect(); d.disconnect(); s.disconnect(); }catch(e){} }, lead + 4000);
}
/* 한 번 울리고 끝난 노드는 반드시 끊어 줘야 한다.
   Web Audio는 목적지에 연결된 노드를 매 렌더 퀀텀마다 처리한다. 소리가 끝나도
   연결이 남아 있으면 계속 계산되고, 타격마다 10개씩 쌓여 30초 재생에 1000개가 넘는다.
   데스크톱에서는 티가 안 나지만 아이폰에서는 렌더 스레드가 밀려 버퍼가 깨지고
   21ms 주기의 사각파 굉음이 난다 (2026-08-11 실사용 제보로 확인).
   voice()가 만든 게인을 버스에서 떼면 그 위에 물린 오실레이터·필터·셰이퍼가
   통째로 목적지에서 분리되어 회수된다. 떼는 건 이 한 곳이면 충분하다. */
let VOICE_T = null;                        // 이번 타격의 예약 시각
const VOICE_TTL = 2.6;                     // 가장 긴 소리(크래쉬 1.9s) + 여유
function releaseAfter(t, nodes){
  const c = ac();
  // 실제 시계가 아니라 예약 시각 기준. 오프라인 렌더에서 소리 나기 전에 끊기는 걸 막는다
  const ms = (Math.max(0, t - c.currentTime) + VOICE_TTL * tuningDecay()) * 1000;
  setTimeout(()=>{ nodes.forEach(n=>{ try{ n.disconnect(); }catch(e){} }); }, ms);
}

/* 보이스 하나를 만들어 드라이/센드에 물린다 */
function voice(sendAmt){
  const c = ac(), B = CUR_TRIM || HIT_BUS || bus();
  bus();                                   // 트림이 있어도 버스는 만들어 둔다
  const g = c.createGain();
  const dead = [g];
  g.connect(B.dry);
  if(sendAmt > 0){
    const s = c.createGain(); s.gain.value = sendAmt;
    g.connect(s).connect(B.send);
    dead.push(s);
  }
  releaseAfter(VOICE_T == null ? c.currentTime : VOICE_T, dead);
  return g;
}
function env(p, t, a, peak, dec, curve){
  a *= Math.pow(2,-tuningTight()*0.65);
  dec *= tuningDecay();
  p.setValueAtTime(0.0001, t);
  p.linearRampToValueAtTime(peak, t + a);
  if(curve === 'lin') p.linearRampToValueAtTime(0.0001, t + dec);
  else p.exponentialRampToValueAtTime(0.0001, t + dec);
}
let _nb = null;
function noise(){
  const c = ac();
  if(!_nb){
    _nb = c.createBuffer(1, c.sampleRate*2, c.sampleRate);
    const d = _nb.getChannelData(0);
    for(let i=0;i<d.length;i++) d[i] = Math.random()*2-1;
  }
  const s = c.createBufferSource();
  s.buffer = _nb;
  s.playbackRate.value = 0.9 + Math.random()*0.2;   // 매 타격마다 미세하게 다르게
  // A tuned crash can ring beyond the two-second noise buffer. Its explicit
  // source.stop() still bounds the voice; leave neutral one-shots unchanged.
  if(tuningDecay()>1) s.loop = true;
  return s;
}
function filt(type, freq, q){
  const f = ac().createBiquadFilter();
  f.type = type; f.frequency.value = Math.min(ac().sampleRate*0.45,freq*Math.pow(2,tuningTight()*0.7)); if(q!=null) f.Q.value = q;
  return f;
}
function osc(type, f0){
  const o = ac().createOscillator(); o.type = type; o.frequency.value = tuningHz(f0); return o;
}
function drive(amount){                              // 새츄레이션 = 두께
  const ws = ac().createWaveShaper(), n = 1024, cur = new Float32Array(n);
  for(let i=0;i<n;i++){ const x = i*2/n - 1; cur[i] = Math.tanh(x*amount)/Math.tanh(amount); }
  ws.curve = cur; ws.oversample = '2x';
  return ws;
}
const rnd = (a,b)=> a + Math.random()*(b-a);

/* --- 808 계열 메탈 오실레이터(하이햇·심벌 공용) --- */
const METAL = [2, 3, 4.16, 5.43, 6.79, 8.21];
function metal(t, base, dur, hp, bp, peak, send){
  const c = ac(), g = voice(send);
  const bpF = filt('bandpass', bp, 0.9), hpF = filt('highpass', hp);
  bpF.connect(hpF).connect(g);
  METAL.forEach(r=>{
    const o = osc('square', base*r*rnd(0.995,1.005));
    o.connect(bpF); o.start(t); o.stop(tuningEnd(t, dur+0.05));
  });
  env(g.gain, t, 0.001, peak, dur);
  return g;
}

/* --- 개별 악기 --- */
const SYNTH = {
  kick(t){
    const c = ac(), g = voice(0.05), d = drive(2.2);
    d.connect(g);
    // 바디: 피치 엔벨로프가 빠르게 떨어지는 사인
    const o = osc('sine', 150);
    o.frequency.setValueAtTime(tuningHz(rnd(148,156)*(1+tuningTight()*0.18)), t);
    o.frequency.exponentialRampToValueAtTime(tuningHz(50), t+0.055*Math.pow(2,-tuningTight()*0.5));
    o.frequency.exponentialRampToValueAtTime(tuningHz(41), tuningEnd(t,0.32));
    const og = c.createGain(); env(og.gain, t, 0.002, 1.0, 0.42);
    o.connect(og).connect(d); o.start(t); o.stop(tuningEnd(t, 0.5));
    // 어택 클릭: 비터가 헤드를 때리는 소리
    const n = noise(), nf = filt('highpass', 2400), ng = c.createGain();
    env(ng.gain, t, 0.0005, 0.32, 0.012, 'lin');
    n.connect(nf).connect(ng).connect(d); n.start(t); n.stop(tuningEnd(t, 0.06));
    // 서브: 저역 두께
    const sub = osc('sine', 46), sg = c.createGain();
    env(sg.gain, t, 0.004, 0.45, 0.3);
    sub.connect(sg).connect(g); sub.start(t); sub.stop(tuningEnd(t, 0.4));
    g.gain.value = 0.95;
  },
  snare(t){
    const c = ac(), g = voice(0.30);
    // 통 울림: 두 개의 배음
    [[186, 0.9],[331, 0.55]].forEach(([f, amt])=>{
      const o = osc('triangle', f*rnd(0.99,1.01)), og = c.createGain();
      env(og.gain, t, 0.001, 0.42*amt, 0.13);
      o.connect(og).connect(g); o.start(t); o.stop(tuningEnd(t, 0.2));
    });
    // 스네어 와이어: 중역 몸통
    const n1 = noise(), f1 = filt('bandpass', 1750, 0.55), g1 = c.createGain();
    env(g1.gain, t, 0.001, 0.62, rnd(0.16,0.19));
    n1.connect(f1).connect(g1).connect(g); n1.start(t); n1.stop(tuningEnd(t, 0.3));
    // 크랙: 고역 어택
    const n2 = noise(), f2 = filt('highpass', 6200), g2 = c.createGain();
    env(g2.gain, t, 0.0005, 0.34, 0.045);
    n2.connect(f2).connect(g2).connect(g); n2.start(t); n2.stop(tuningEnd(t, 0.1));
    g.gain.value = 0.9;
  },
  hihat(t){ metal(t, 42, rnd(0.045,0.06), 7200, 10500, 0.30, 0.10); },
  hihatOpen(t){
    // 오픈은 길이와 워시가 다르다. 닫힘과 같은 base를 써서 음색은 형제로 들리게
    metal(t, 42, rnd(0.40,0.50), 6600, 9800, 0.24, 0.26);
    metal(t, 42, 0.05, 8200, 11500, 0.16, 0.08);   // 스틱 어택
  },
  /* 풋 하이햇 — **스틱 클로즈를 줄인 소리가 아니다.** 스틱은 금속을 때리지만
     페달은 두 장을 맞물린다. 그래서 (1) 더 짧고 (2) 어둡고(고역 어택이 없다)
     (3) 페달 보드가 바닥을 치는 저역 "툭"이 같이 난다.
     게인만 줄이면 "작은 하이햇"으로 들린다 — 고스트에서 이미 겪은 실수라
     같은 방식으로 스펙트럼을 함께 바꾼다. */
  hihatFoot(t){
    metal(t, 40, rnd(0.030,0.042), 5200, 7600, 0.30, 0.04);   // 어둡고 짧게, 룸도 거의 안 보낸다
    // 페달 보드 — 저역 노이즈 한 방. 이게 이 소리의 정체를 만든다
    const n = noise(), f = filt('lowpass', 430, 0.7), g = voice(0.02);
    env(g.gain, t, 0.001, 0.42, 0.05, 'lin');
    n.connect(f).connect(g); n.start(t); n.stop(tuningEnd(t, 0.09));
  },
  /* 크로스 스틱(림 클릭) — **스네어를 줄인 소리가 아니다.** 스틱을 눕혀 림을 때리므로
     와이어가 거의 안 울고, 나무 같은 몸통과 짧은 딱 소리만 남는다.
     게인만 줄이면 "작은 스네어"가 되는데, 그건 고스트에서 한 번 겪었다. */
  snareXStick(t){
    const c = ac(), g = voice(0.10);              // 룸도 거의 안 보낸다 — 드라이한 주법이다
    [[520, 0.75, 0.085], [1180, 0.32, 0.055]].forEach(([f, peak, dec])=>{
      const o = osc('sine', f*rnd(0.99,1.01)), og = c.createGain();
      env(og.gain, t, 0.001, peak, dec);
      o.connect(og).connect(g); o.start(t); o.stop(tuningEnd(t, 0.16));
    });
    const n = noise(), nf = filt('bandpass', 3200, 1.1), ng = c.createGain();
    env(ng.gain, t, 0.0005, 0.5, 0.02, 'lin');    // 스틱이 림에 닿는 딱
    n.connect(nf).connect(ng).connect(g); n.start(t); n.stop(tuningEnd(t, 0.05));
    g.gain.value = 0.62;                          // 보통 스네어보다 조용한 게 이 주법의 정체다
  },
  /* 림샷 — 헤드와 림을 **동시에** 때린다. 스네어를 키운 게 아니라 성분이 다르다:
     림이 같이 울어 가운데 대역에 또렷한 링이 생기고, 어택이 날카롭고, 통이 길게 남는다. */
  snareRim(t){
    const c = ac(), g = voice(0.55);              // 룸을 더 울린다
    [[186, 0.85],[331, 0.5]].forEach(([f, amt])=>{        // 통 배음은 스네어와 같은 것
      const o = osc('triangle', f*rnd(0.99,1.01)), og = c.createGain();
      env(og.gain, t, 0.001, 0.42*amt, 0.2);
      o.connect(og).connect(g); o.start(t); o.stop(tuningEnd(t, 0.28));
    });
    const r = osc('triangle', rnd(760, 800)), rg = c.createGain();   // 림이 우는 링
    env(rg.gain, t, 0.0008, 0.5, 0.24);
    r.connect(rg).connect(g); r.start(t); r.stop(tuningEnd(t, 0.32));
    const n1 = noise(), f1 = filt('bandpass', 1900, 0.5), g1 = c.createGain();
    env(g1.gain, t, 0.001, 0.7, rnd(0.17,0.20));
    n1.connect(f1).connect(g1).connect(g); n1.start(t); n1.stop(tuningEnd(t, 0.3));
    const n2 = noise(), f2 = filt('highpass', 5200), g2 = c.createGain();   // 크랙을 더 세게
    env(g2.gain, t, 0.0004, 0.62, 0.07);
    n2.connect(f2).connect(g2).connect(g); n2.start(t); n2.stop(tuningEnd(t, 0.13));
    g.gain.value = 1.15;
  },
  ride(t){
    const c = ac();
    metal(t, 38, rnd(0.85,0.95), 4600, 6800, 0.15, 0.35);   // 워시
    metal(t, 38, 0.13, 7200, 9600, 0.11, 0.12);             // 어택 정의
    // 스틱이 심벌에 닿는 소리 — 순음 대신 대역 노이즈
    const n = noise(), f = filt('bandpass', 5400, 0.8), g = voice(0.18);
    env(g.gain, t, 0.0008, 0.24, 0.055, 'lin');
    n.connect(f).connect(g); n.start(t); n.stop(tuningEnd(t, 0.1));
  },
  crash(t){
    const c = ac();
    metal(t, 34, 1.9, 3200, 5200, 0.22, 0.5);
    const n = noise(), f = filt('highpass', 3600), g = voice(0.5);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.34, t+0.012*Math.pow(2,-tuningTight()*0.65));         // 살짝 늦은 피크
    g.gain.exponentialRampToValueAtTime(0.0001, tuningEnd(t,1.7));
    n.connect(f).connect(g); n.start(t); n.stop(tuningEnd(t, 1.9));
  },
  tom1(t){ tom(t, 232, 0.30); },
  splash(t){ SYNTH.crash(t); },
  china(t){ SYNTH.crash(t); },
  fx(t){ SYNTH.crash(t); },
  tom2(t){ tom(t, 178, 0.34); },
  ftom(t){ tom(t, 118, 0.44); },
  click(t){    clickTone(t, 1500, 0.16); },                // 메트로놈은 드라이
  /* 첫 박. **소리를 따로 만든 이유** — 하이햇/오픈하이햇과 같은 방식이다.
     `clickHi`라는 별개 id면 나중에 녹음 샘플을 넣을 때도 파일만 두 개면 되고,
     `click`을 건드리지 않으니 예전 소리는 한 톨도 안 바뀐다. */
  clickHi(t){  clickTone(t, 2250, 0.24); },
};
function clickTone(t, freq, peak){
  const c = ac(), o = osc('square', freq), g = c.createGain();
  env(g.gain, t, 0.0008, peak, 0.028, 'lin');
  o.connect(g).connect(bus().clk); o.start(t); o.stop(tuningEnd(t, 0.05));
  releaseAfter(t, [g]);                                    // voice()를 안 거치므로 직접 끊는다
}
function tom(t, f0, dur){
  const c = ac(), g = voice(0.22);
  const o = osc('sine', f0);
  o.frequency.setValueAtTime(tuningHz(f0*rnd(0.99,1.01)*(1+tuningTight()*0.18)), t);
  o.frequency.exponentialRampToValueAtTime(tuningHz(f0*0.62), t+dur*0.85*tuningDecay()*Math.pow(2,-tuningTight()*0.5));
  const og = c.createGain(); env(og.gain, t, 0.002, 0.8, dur);
  o.connect(og).connect(g); o.start(t); o.stop(tuningEnd(t, dur+0.1));
  // 헤드 어택
  const n = noise(), nf = filt('bandpass', f0*4, 1.2), ng = c.createGain();
  env(ng.gain, t, 0.0005, 0.18, 0.03, 'lin');
  n.connect(nf).connect(ng).connect(g); n.start(t); n.stop(tuningEnd(t, 0.08));
  // 배음
  const o2 = osc('triangle', f0*1.58), g2 = c.createGain();
  env(g2.gain, t, 0.002, 0.14, dur*0.5);
  o2.connect(g2).connect(g); o2.start(t); o2.stop(tuningEnd(t, dur));
  g.gain.value = 0.85;
}

/* --- 메트로놈 목소리 (원·투·쓰리·포) -------------------------------
   **왜 파일이 아니라 코드 안에 있나.** 이 앱은 서비스 워커가 없어서 오프라인 캐시가
   브라우저 HTTP 캐시뿐이다. `/samples/*.wav`로 빼면 연습실 와이파이가 나쁠 때
   첫 재생에 목소리가 안 나온다 — 메트로놈이 박마다 나오다 말면 안 쓰느니만 못하다.

   **왜 mp3/aac가 아닌가.** 둘 다 인코더가 앞에 무음을 붙인다(mp3 ~26ms, aac ~48ms).
   그건 이 기능에서 제일 피해야 할 것이다 — 목소리가 박보다 늦게 들린다.
   `decodeAudioData`가 그 프라이밍을 걷어내는 방식이 브라우저마다 달라서 예측도 안 된다.

   그래서 **μ-law 8비트 16kHz 원시 PCM**을 base64로 박고 여기서 직접 편다.
   컨테이너도 디코더도 없으니 지연이 0이고 브라우저 차이도 없다.
   G.711 전화 규격이라 8비트치고 잡음이 적다 — 실측 SNR 37dB.
   네 단어 합쳐 base64 29KB. mp3보다 크지만 **정확히 제 시각에 울린다.**

   원본은 TTS(ElevenLabs, Dylan). **첫 후보는 버렸다** — Inworld 한국어 음성이
   "무겁고 느리다"고 반려됐다(2026-08-16). 배속·음높이를 올려 봐도 안 됐고,
   결국 화법이 다른 엔진으로 갈아탔다. 이건 파형을 손봐서 되는 문제가 아니었다.

   손질은 `voice-build.py`가 한다. 앞뒤를 잘라 **어택을 0ms에** 놓고 같은 RMS로 맞춘다.
   앞을 자를 때 **문턱을 20%로 잡는 게 핵심이다** — 5%로 잡았더니 "포"의 앞 105ms가
   최대값의 1~9%짜리 잡음인데도 소리로 오해해 그대로 남겼고, 그만큼 늦게 들렸다. */
const VOICE_SR = 16000;
const VOICE_B64 = [
  /* 원 */
  'fnlxa2ZfW1dRTUpFQT06NzQxLy0sKysqKyssLi8zNzxDT2jcy8C7trGuq6mmpKGfnp2dnJycnJydnZ6fn6Gjpaepq6yusLO2'+
  'uLu9v8LExsjIycnJysrMztTc6nRgWFFNSkdEQT48Ojc0MS8tKykoJiQjIR8fHh0cHBwcHBwdHR4fISMmKSwvNTtDTmnezcS+'+
  'ubWxrquopaKgn56dnZydnZ2en5+goqOkpaeoqaqsra6wtLe6vcHGys7T2eHudGRaU01KSEZFRUREQ0JBPz48Ojg2MzAvLSwr'+
  'KignJSMhHx8eHR0dHR0eHh8gIyUoKy4zOkFNZt/NxL66trKvrauopqSioJ+enp6enp6en5+goaGio6Slp6iqq62vtLi8wMfN'+
  '1d7tdmVcVlBNSkdFQ0E/Pj09PDo5ODc1MzIvLi0sKyopJyYkIiEfHx8eHh8fICEjJScqLC81O0JObNnJv7u3tLGvrq2sq6qq'+
  'qainpqalpaSkpKSjo6SkpKWmp6ipq6yusLO3u77FzNfqbFlPSkZCPz49PT08PT09Pj4+Pj4+Pj09PDw7Ojk3NTIvLSsoJSMh'+
  'IB8fHx8gISMlJyksLzQ6QU990sO8tbGurKuqqqmoqKenpqalpaWlpqenqKipqqqrq6ysra2ur6+xtLa5vMDGzNPf+GdYT0pG'+
  'QD48Ojk2NjU1NDM1MjMzMTEvLy4tLCopJyUjISAfHx4fHx8hIyUnKi0vNz1LddC/uLCsqaalo6KhoKCfn5+fn6CgoaKjpaeo'+
  'qqyusbS4u77DyMzS2uHt/m5oYF5aWFZTUU9OTU1MTExKS0hIRUI/PDw4NzQyMS4uLCspJyYjIiAfHx4eHh8hIiYoLDE3P0z4'+
  '0MG7trCuq6upqKempqWlpKOjo6Oio6OkpKWmqKmsrbC0ub7G0edkUkpEQj8/P0BFR0xQVl9lbXBuc2xmXVVQS0VAPDk2Mi8t'+
  'KykmJCEfHx4eHR4eHyAjJiovNT5N/ca9tK+sqaelpaWkpKSmpqenp6ioqKioqaqqq6utrrGztrq+xcvQ3PBjWldUUE1OT1NW'+
  'U1NTVlVPSkZCPzs3NDEvLiwqKSgmJCIfIB8fHh4fISUkKCsyPEBXf8K4s66tqKakpKWjpKOmp6iop6mqqqqpq6yurq6wtLi6'+
  'vL7H09vo715QT09VUk9TWmJjXl5lal9XT0xJQz04NTIvLCknJSIgHRwcGxwaGxweIyInLjx32r+yqqKhn56cmpycnZ6eoaWp'+
  'rKyxuMLKytHhV1RYW1pMTln75vTm2MjDxcS/uri4uri2trq+v8XO9VFEPDQuKickIB8dHBoZGRcaGRgbHCMkKDJAycGyq6Kc'+
  'nJqal5aYmpycnaGorbC2v95aUE1IPDk4PT06OTxITVNb6Me+ubiyraurrKurrK+2u8PUWj42LysmIR8dGxkYFhQUExYVFRka'+
  'IyYqQdytqaWdmJOUlJKRj5SXmZqcpa23wc5GNy8uLiooKCsuLjA1P1zgzL+yq6impaCfn6Cjo6WqtMTTVjosJSIeGxcVFBMR'+
  'Dg8OEBIPFRcfKSdFyaefn5iUjo+Qj4+OlJmbn6G01k06OCokIyMnJSYpLj5IXs23q6ilop6cnJydnZ2fo6iqrr7lSDswJh8c'+
  'GxgUEQ8QDw0NDRMPEhYaLSk9yqqcnZiUjo2Pj5CPk5qepqrDPiwpJx8cGh0fICMmM1HPv7SmnpubmpeVlZmamp2hq7G63EEu'+
  'KScfHBoZGBUTEhMQDw8PFxIUGx9SNnKqnZKZlY+MjJOUlJObs8R8Wy0bGhseGhYaHy0uLVa3paKimpWSlJaVlJabn6Oor85L'+
  'PDMsIx8eHhwaGBgYFhUTEhQTGRcZIyjJ2rqfmY+Tk46MjJWam5ymPysnJx0SERUaGRUaKEZaXLSgmZialJCPkpeXl5uhrrbA'+
  '4DssKSYiHhwdHh0bGxsbGhgWGBccHhopLciuu56Xj4+Uj42Mlp6goao2IB8fGxEOEhkaFxsqX8G/rZ2XlZeVkJCTmZycnqe9'+
  '5GhTNSckJiYgHR4hIh4cHR0cGRYYGR4cHCw8sK+smZKNj5KOjI6apaep0R8ZGRoVDg4VHR8dJ2+rpqifmJOUmpqXmJ2pr6ut'+
  'w01H6t0+MTU+OywmKiwmHRkaGhYQDxIaGhciN6umqJiOioyQjoyNmq62tWEdFBcaGRERGyw3Lj6xn52lopqYm6aooqOsy824'+
  'ts5LdL++Wz1Le00vKy8xJhsZGhkRDQ4UGxYZKcGfqJ2QiomPkI2NlrZOXUQeEA8XHBgUHkq1usGnmZadp6GdoLZoyLW8XknC'+
  'rbHCv6ypuV9R2m0zJiguJxsXFxgSDQ0QGhcYJsucnpyPiYeOk4+PmeonKSoaDg0XIB8bLLCeoKuflpaft6+prvI737Ozw8Ws'+
  'o6izuK6x4Tg2RD0tJy06LyAbGhoSDAwPGBUYKq+Ym5aMh4eQmJWWrSIXHB4UDA8hPDQsypuWnq2imZ26ScOusO70q5+jra6n'+
  'qL1QQkY5KyoxQkdCZcO9VC0jHRcOCQkNFBIbQp6Qk4+Jhoqbqqi0KA8NFx4ZFCKxnKGtoJWXsy8wSTYfHS66p6ObkY6RmJ6n'+
  'zCweHRwaHCZQvrOon5yitU4pGw8LCAcJDRgfap+PiYyMjI2YTCAfHxQMDiDKz9GikI2YrK+s8x0TFx8jIzyolZCPjYyPm61S'+
  'KBoREBMZITK6n5iVl5merEwhFA0KCAcIDRw+zaKTioiSl5mfzRYQFx0ZEx+rlZiclY2PpzcoKh0QDhYqVradj4uLjI6Vp0Ui'+
  'GBAMDBMjRLKdkIuMkZqjvywXDw0MCwwPFB0tzqutop6Ynd9LS3QtGR5cqa7Co5COnLWzqmkbEBQeHhojv5yWlpCNjZSgrdoq'+
  'GhcZGxwjWqmfnZuVlZ2zYTsoGxUXHCEmLDU6Ni0iGhYXHBscKsacnZyTjYuYqqqnwx8VGywoHSLvpai7tqSfrXVivbi+xK6h'+
  'n6CioanASDcxJx8gL1LszrGgnaKvwMhVLSAfJCchHBsaGRIODxQfIjOxmIyPkI6Oka47Nz4qGBcm2ts8SrCluzEqO0AvKDa5'+
  'o52YkY+Rlpyn3ikdGxsbHCrOqaKhnJiaqN08MCgcGB0qPkM6ODMkGA4LCw0TGC2pkoeHhoWHjJ9DJh0VDQwUJzlNxKaco79L'+
  'RT4wLDXRqZyVj4+Sl5ysPB4ZGRgXGSnHqaWjnpqer1U5NS4lHyg+w7vE3TspGQ4KBggLEyHel4uEg4aHjZdvFxAPERASIL6e'+
  'nZ6ipbksGxcYGyFDppSNioiKj57RKBcODA8XJEGtmZKRl56q2y8gHR8nNOuwpqKkqsIyHBMNCQYGCA0bT5+TjYmGiJOjv0Ml'+
  'ExAcN9DXvKGbpVYsKiYdGR87r56Vjo2OkZaidSUbGRYTFiJRtaynn56mullGR0BJ7ryrpZ+gp7HNRi0gGxoaGxwbHBwbFxIT'+
  'GS1er5yQiImNlJ2pMRcPERkeJUSuoZ+nstkzJiMrO9aomI+Pk5mfrTsdFhccHylNr6Cen6StwUo6PURpuqefoau1v04pHRwi'+
  'KCkuTL21vdZSLh8XEQ4NEB3MpZqRjIaOnb47NBYODxxJ07qtpK1KIhgVERUgeaKYjoqKjp27SCgZEhYlY7qsoJydrF4xJiEj'+
  'K1K2pZyYmJ+zWTQjGhgdMHS9rqWhq8s7KiMeHiQuP1nNubGzuLq8ur25tLa750o7My8vPEVNOy4nHRUPER3RppuSjomRp0ol'+
  'IxcTGj2imJWWmKPuKRoUERUl16aempeYo1cnHyAhIzHFpp+iqrl+NionK0K2oJmZnKOxVyUZFxoiM9WonJueqrriPTAwPFba'+
  'ycjiPSwiHRQPDg4ODRIvm46NjY2Hj74iFyYgGSFRnJmiuz4nGRUXHSjVm46Mj5aboL8lGx42W1DfwrbbLR4ZGBokX6mZk4+N'+
  'kp66YUk2LjXMqqq5Zz83KSEiLWmuoJ2cn6m2YjQoJiosKSMiIR4YEg8ODg4ODRUvmYuLjI6Hj7wkFSolHSjNmpysRi4fEhYg'+
  '3auhk4yMmLF9ZT4jJDquoqmy4zofFxUXHinJnZORlpmdp8w3P9GrpaKfpK9eLCAeIi5Rwaykn6OvxNHab0ZD38XgOigiHBYT'+
  'FBgeKDIzJx4YEw8LDyyQhYiOlYybJAwKITxqw6ian7wpGxAQJKuTk5eUkZw6GBo3yMu+qJ6ndygcGRgke6uioJqZpU0qOce3'+
  'x7+sqbs2JSMsQr+onpqZm6GvxMrCvsK+s7nUOyspJyksNmXJv872Vj0wKicgHiIoLzc4NicbEw4ODBJEjoSLndSoRRENEqqa'+
  'nZ2pqyUTERYeKK+RjZ1PKi4vIiy8lo+WonYsHh4pP7ysn5+s8C4yRLylnJeWm6z3NSsqMGa8tLvK7DkrKjjIraaioqaz+ERK'+
  '4r24ub/NXDw0ND9UT0tMbPdJNi4yQu/Kyt5fTD0vKSksLykkHh0aFR+9jo2edt6c1iUWK5+26x4fHBIcI0453Z2YnG1rq5iT'+
  'mJaZmqjMNyQqOLmyy0ArKiYoMPukmZWaqcJOQ07Srqense0uHBkbJz5Zzs3IZDo4QMqwpaCmtPNNR0E6PVvh11U7LysuP9u8'+
  'r6ihnp+kr73Fvb3J1ujSTy8kICgvO0dh3e1SPjg2Q2lwTDk9PjQrJykpJSEiKiklHhwcHRoUHLmLh5ZFLp6i5izbjpOgRiMf'+
  'FCTCoKxXuqe4HhcopZOTlZ2q4kJdY7+pm5qvKBYWGyc8yKqjp8U1KjW+opmYnKrfNCsqLULAs9MxJSQqMDxjxL/fQTY3Q963'+
  'ra+/Xz43NDhOy76/z+xXSEdpu62rr7i/4UQzMjxLRjQtLCwsKysvNDYyKycmKi8tKikrKyQnVJ+Yo9dHrqaqtLaenqCvb+zn'+
  'samqsb3CzWU7OkXRu7vA5fDLvLa1rqinrsf+ceR+aebf2+hxVD45PVfb0t3m3OFjRTs6P0hEPT1K7c/P2NzX31pDPj9JUE5O'+
  'SkVEQ0I/P0dZ/d7j29HLz/xcW//s593WzMrK0dXMxcfY7ujj/15b999wT0hFPTg4QEtHQD8/NSwpLC8vLzVN3t1qaNrNy8nA'+
  'vby+v769t6+qqq20uru/zNrZzsvP2NXR2uLh1MvKyMTFzOLnyLy2trWztbrH3n91dGpgTkM9PDw5Nzg7Ozg0MjU2Nzk7PkBF'+
  'SkxLU/vQxL+9u7u8wsjJx8LCxcrMzMrLysbDwMPI0N3f39ra3t3TzttmT0hEQT8+Ojg2NDEtLC0wNTEsKikqLCwtMTxPSTw6'+
  'PE5eW1RKbc+9t7Svraqqqqusq6uqq6ytra2wucfLy8zLysfMysbJz9LJytPc4XlcWGFtfdvZ4WhRTEVGQj9CREtHSEU+PTs9'+
  'PT5DQkNDSE9ZWl9v7d/s92xm7d3b3NTIw8C/u7i3t7u9wcjJysbEyMnHx8nXemFZVE1JSUlISUlGQT9DQkE7Ojg3ODU2Njc3'+
  'ODQvLCorKiwuMj5BQTs5P0/mzNHPzMS7ubWyr6upqauusrS1srGysLO1uL7BycrIycnGx8rQ4uXi2dLZ4HxkX1lUUltw7Pdl'+
  'WFZZV1NOTU9VXFxbT0pHSUxJR0JBQ0hOT1BSW2traGV95dzV1tXY1NDX087HwsLCx8fLzMzKx8zKxsHGzs/T1Nnd4PhrWVJM'+
  'SEdJTktHQkREPj07PDw7Ozc2MzQ1Njk5Ozs5My8uLjQ8Tk9KSUlbX3v76tPJv7y4ube0sK6urrC1t7i4trSysbG0ub7Cx8nH'+
  'xMrT2d3e6PP0+/j58u37aWvk1NXhfmJYU1FOS0xMS0pHRkZISUpNT1BPTk5OT1VVUExJR0M/PkFLYeni5uTe0srEwsPBwsLE'+
  'xsO/vLu9v8PJzM3KycvMzcvM0dne2tXR0uJkTkVDPz8/QEVDQDw6Ojw9PTw6OTY0MS8yNDY2MzAuMjg/RENDQUdNUlRb9dHB'+
  'vLi5uLa1s7KvsLS3uLi4uLi4t7e5u77BxcXBxsvJwr/Gz+fr28/Q7ltOTlReYVphePJtWlNPUVBOTU5UUk1IREVHTEtGREFD'+
  'RUdKSkxPU1pcavDk2dve5/Xw7N/X0c3KyMTCv76+vr69vLy9wMbIycrMz9HV2Njc5/N2cm1kX1dRUU1KRD8+PD08Ojg2Njc2'+
  'NTM0NjY3NTg6PD4+Pzw5Nzc3OT9KXGViYm3f1c3Iwb6+vby6ubSvra2vs7i5ubm4t7a2uby/w8PCwcDDx8zQ1OT08+3qd2dc'+
  'U1JOT1JSUE1NTElGRkdHSEhJSEVDQkVISkpLS0pLS05PUlhhePDl29PMysrMzs/R0c/Ny8rHwb+9vr69vb2/wMLExsjJy8vN'+
  'ztTe725hWVRPTUxLSkhHSEhIREA9Ozo5ODk5Ozw8Ozo4Nzc3ODg6PD5AQ0hNVFleX2RjbX7+8PDb0M3MzsvIxcPDw8PAvru4'+
  'trW2t7i7vL6+v7++vr+/wsfLz9Pa3uHo7vPv8vx0bWVcV1FPTk1NS0tJSkpJS0pNUVRYVFJPTUxMT1ddX11aXF5iX11eZXnu'+
  '39nVz83Mzc/P09XU0c7Ny8nHxsbFxsfIycjHxsbIyczO0tfc5vZvY1pWUk5MSkhGRkZEQkFAQD8+Pj8/Pz9AQEBBQEJDQ0NB'+
  'Q0RGTFBVV1NVUVBRUVtib/735d/d3NvY19fV0s/Oy8fEw8TEw8C/v76+vr6+vr6/v8HCxMjKzM7X4/N6fv7z6+fq+WZaVVFR'+
  'U1ZaWVtZVlRPUFJTU1BQT09PUFBSVFZZV1VUVFphc/ft5+Tk5efm4d3a19bV1tbV1NTW1NHPzs/Pz8/Pz87Ozs7P0NXZ3d7f'+
  '5+7y939uZl9dXl1dWldUUlRUVVNSUVBPTkxLSklJSElJSElJSktMTE1OT09RVFZXV1peX2JjZ2dnZ2pwdnp99vDq497Z19bV'+
  '09DR0tDPzs7Ozc3Ozs/P0NDPzszLzM3Nz9DU19nb3N7h5ev1fHdvaWJeXl5dW1tcXFxbXF5dXFtaWVlZWlpcXV5kam9wffj0'+
  '8fPt6uTf3dvb2tvd3d/h4N/d3d7f4ePo7O3w8PT6/Xd2eHr8fn17dXt0c3Rze3ZybmlqaWttbW5vb25pZmVlaGlrampqaWdl'+
  'Y2JiZGRjY2RlZGRlZWhpamtqbW5wdHR3enx8eHd2dHV0c3JyeH3+/v748e3u7+7s6Ofm5eTi4eDg4uPk5OPk5ebn6Onr7e7v'+
  '8fT1+Pn9/n58fX3/f359e3t5d3V0dnd4enp7e3t6eXl5eXl6e3t8fg==',
  /* 투 */
  'fvv/+35w+fhrePxoafxrXW5h8HRQZFdeb2BYVVVVYVn7UVvuUm5rXGvaWtzfS8/s38175dTr2Mt61tnU7d7PZcVZ48BKzP7d'+
  'zlHLc9Rc489f8dzMTMBVV8pL2+jrT9xWXcxC2uVI3VVX/U1a71ZLVdtEP8E7TtNJWk9+WFfbYVdwT81QXtJqS8VYT8JD2O7j'+
  'SclOZMJE+GbiSNfcRvblP93lSN/hSu5dT8Y/zU/33UPDQ9rdT8lwTdvYb/xkzWpexkxOvVhPw0lv1lDvxT5Svz7p3Fbba03S'+
  '30jc11N87Vba81bOz0bH1UHLYsntUMv7TH6+Z/tkzkjrwVXt39Y9v9pO3mjP+Evc1UvP+/pJa13ReEnCS1JPyln8WeLUOND+'+
  '7lDEUF7eP8nOfkOxPzGuXk3X7V9xTtb4OLZYS8JARcy7Nc+/LmfC0k7Zzj51xGJFvtE/2Ms97rlBysY+RdDIP97AQj7Pz0xv'+
  '021OZ+s+zcFC+sxHRr7MRm3GUk7Tzl14uj5BvGlHy8lNPXq6QVHAX1/eYTnMzNtjbnI3w+fU2U7HQmG8Q1Kxaz7c+kvPwO/5'+
  'T2dKzcVEWMzHLeGzNuS2UkRfSMjS3/lNw0FRuutX7MVOPuXvSL3JPORO/GtuyVFbXmtN1n5PuE4+zV1cx8txXmZN1c8907k7'+
  'U747Xr9PbNNG31I/s045tcg07Lo50L84u8c07cJQSMV97VJKv0lSv3U3ztk4f7ROPb5IyGtIu3Bc0XF2WTWysjHh0j9X3e7C'+
  'XDOxai/NbsK/REBsWlzKu/0557k7RrRG1bdhN1HIb9HnwU0v0LpbTVbOujwuu8Yyu7lENzy1yU5e08E1R7/iZGy/wTk0zMpP'+
  '3LjYNUTTzmO30DDPVkHNulw+v9xCOMHCPrXeNUw/7LrEX0VyZkZMz7zdTknt/T3KuMxFNdfBR1W/yj0/y+tSR83CV01EwtQ9'+
  'buvIWkzOWtlDbrhhQU+61zhJvM09xM1CR3Xf38FPQs3FSzzEu0haxug9QLvDX+hzUFBYduDN2kpVVkxtu8dB9uc/Qm+9u9z6'+
  'QjRf18O17T88Wl9Nu7xeT2U/P8jIxfxCQz7d0c3C9mE+UPJVwr/IPzbpZHXWxclLSVh4VWnEw+w/TU9p3t7BYElBccjX2mvt'+
  'TU722P5X2sXVRExN7cPIyFE+QdvA1mdgY0zzf0pSXtfbXFBGXcTP5v9NT1Pa62TO0eNRWPbVyMzSXEhHbtDab3rVV0pe2s34'+
  'XllbT1jKwN1IR27a7M3FXD9Jz8jW2t9xSFrp5W1L5+dMPkrIyOpdfGP+zOrhT07Nw8ZBOFDHvNTtT0hMatDdWU5y4VI+XM7J'+
  '20tLS2fX0sdZPk/72WpfzcxiTGpi5dLk1WBIVOnQ015+znFPSejO2NNbaGBf59nZWGXM0VZDUM/N2m9KSlrbxsluTVNuVUxs'+
  '1M5zTEdOX9vJz/lKS+vX4NvV7Vle5NPHyN1nWHN73szf9k9IWvXT6u9mS0ld2mT153ZzV2xu0cTK02hNTtbH0PxPWk9KVGX6'+
  'XFZNRDcyS+vdbUpMSElhzs38dOPP12Hew8TBxcXM2se9u8DOyMnMytfKycvL19hebe9t+E9OTT9CQEVLSkMzLzE0MTEwLzQ0'+
  'NC8wNT9RRU5FW8a+tLayq6ejoqSlpKOjpaWlp6etsbK5tsDX9UFCOzYxLCspJyEeHR4fIB4cGhoeKjAxJyAjK0DTwby2tKmm'+
  'pJ2cl5SXmp2cmpiVl5yipqmopamzzehOPDAoJy80JyAcGxsbHRoYFxAODRAfVMEkFBMZP62gnqu5t6yfnJuSjpCYnqikn5mR'+
  'lZ+44b60rqusuFYwLzIsLC8/RywjJywqHxoaGhcVEQsMGj61KhAQFzqwqKCsxK+emZ2km42LkJejq6SbkJGi00XKq7XsZE9I'+
  'Rz4vHx0rTsxEKCU13T8lGxkfIh4TCQwop6ceDA0bw6Kfps5GrZiZqr2biYiPod5ntpmMj64pK8GrzDpG0GI5NSkcGS20sT0j'+
  'Kmy47S8iHB4pLB0NCRi4m9EPDBMvsquqtFN5pJqjaMqSh4yd7zzCqpiOmUYeMK22LCdsrbhFJRoaKrWerikl76emy0xLOjMy'+
  'MykaDgwfr589DQsTLr3Dubw+Oa6dqEPdkIaMpD1FrqaZjpdWHSi0vCchSq62PCAYGCS1m6A0IVWopLbNyeBaOzkuHBINGN6l'+
  'tRYJDRpjvOTJWTnJpaTEUp+KiZa8QMGsopGQqiIbTa1AHiXPtUMkHx4dRZ2ZsiYsrp2frbvF7D9KZCwbFBEdVLdJEAoQIHxj'+
  'PVpiRsKppa69m4uMm7nMrKeglpnGIB9gwywdKWdHLSwnHR9nnZq4KTimmpujsdk/XsHILxsUEBtIuEsSCg4bPexIdD8zzKWf'+
  'rLqbi4uasr2sqaOUlLcdGDTQLx4jPTciICMiH0WemrcsPaabm52gtEI4yrBJHxcSFyvP5BcKDRo/bz1QVzpiraGhq5yMi5ao'+
  'uqujn5SUriMZKvw6IiIqKSEiJh8dM6SYqy4ouZmVl5yrTTXSrrsuHBcSFiZROBUMDhoyRF7WSzthpZmdpJuOi5KdqqikoJWW'+
  'ryYaKUYyIR4hHh4hIyAeL6ecqzgwr5uXlZmobj3Qr7c9JhoPECXJ3hcKDBUqPlO/+i80sJyfqp6Oio+cqbCpn5OQpSgXHjs6'+
  'KCEfHBshJh8cJ7Cans082KSYlI+VrVk9xqu5QiUXDg4dT0MVCgwRHig2wd04Rq6coKeXi4qPmZ6hpJ+UkaYpGiQ0Kx8dGxkY'+
  'HB8dGyXJoaO0ybmpmpGRkpustszGuM4/JxYMDBcxOBYLCw0YJkauvD1Oq5udoZSKiY6Vm6Ctp5SPoiYXHigfGxwdGRYYHhwa'+
  'Jr2gpbKxqaWdk5GQlaKtx2N3bm4yGg0JDh9BJQ0JCxIhObau6kqwmpiem42HiY6UnKm3oJCVzxwZHx8XFx0aFRYeIRcVKqia'+
  'prSrop2dlI6Rl5qeqUIsQOo7HRAKCAwaLR0NCQwXKkK1rbq8opSUm5mMh4iNlp6qsp2TnT0YGB4bFBUYFhQXIB8XGDGkm6Ko'+
  'n5mZmZSPkJialpy8KyQvMSEWDgkFCRQoHQwJDRovTq+lrK6cj46XmY6Hh4uRm6rIrJibdRoUGhkUERQTEhggJhwYKquampya'+
  'mJiVj46UmpqZl6FUKR8eHBgTDQgFBQsXHRELDhYnS7efnaGckYyOlJKKh4qOkpmtTbuhrSsWFhgUDxEXFRMYJzAhHj+lmZaW'+
  'lZaZl4+NkJqdnKKu4y4hFxMVFA8KBgQGCxcmHREQGTWzopiUlZSPjI6UkouHio+Zqk4qPq+2LBYSFBMQERcaGyRATysiPKOU'+
  'kJCSlZmblY+QlpufqtwsKCogGRIPDgsJCQgHBw4fQy0aGCL5o5ePj5OVkI2Nk5eQjIyRnLM1IilY2ywbFhYVERMWGRwmZss9'+
  'KzmtmpWRj5GXm5iUlJmamZ60NykoIh4eHRgPCwoLDA0NCwwWLrthJClRq52Wjo2TmZKLjZqnmo+Rmqe8ORoZLVAxGhQZGhUT'+
  'FxwhLNartj8zxp2Tj4+PlZqbmpmdn5+fpsYrGxgZHiQfGhMODQ0PExcbHRgTHFCkpdrjr6Ofn5aPlJybkpOlZ8idmaG0Yy8Z'+
  'FB9HVycbHyonHyAmL0+0n5+yWnWpm5aTk5SboqakoqarpqSsUSMeHR8hJSkkGxUXGhkYGyAqKCIfFxQf1p6lSThKwLiynpme'+
  'q6iZm7M74Z6boLDEWSIdML+4Oio3PzYrLzk6TbugobxT6a2hnpuanaaqpqKot7qvrK7IQC0kJi88OSwiHiAfIiUhIB0eIiMh'+
  'HBgSFSywpdElK0TLtqyamJ+jmpKYtF+nlpOZoaxnIyA8vcoxKC00KiQfHyMsz6qqwjk3zaebmJiZnJ2dnJ2ip6OdnalmKyUq'+
  'Mjs5KRwYFhodHB4cHBwZGBcZHBwaFRpErKZNKTlps6+jmJujpJmRm8Fqp5WVm6WwPx4jSLbNLCYzQzcpIyInPLafn69xScqq'+
  'm5aUmZ2dm5uir66jnJ2oxTsnJS0/Ri4jIyQfGxgZHR8rLygbEhEWHykiGg8PH8un3CIkLl3lvJ6anqSbj5SsR7mXj5CWnawy'+
  'ITW+sOsyReJaMSAcGyNCrZ+kvj4326ufm5uZl5ian6esqp+amp+3RjY6QkE6MC4uLCojHx4fKTM2KR8dHSAiIB0ZFxYWFRAM'+
  'CxAqvcwoHyo/WsmjlpOTj4uLk6GhlY6NjY+WrzUsNTsuJyguLygcFREUGydSva2tsaqlnp6fm5SPjY+UnK22sqmmrLjSSjUo'+
  'HRYUGCIvLSojHh0fKz1DSlTOutE9KiImKzAzKB0WEhEQDw0LDBhLrcctKjNHy6ORjIyMiYWIkJuZkY2MjI6b0CgjKS0lHBoe'+
  'KCkeFxITFyJwp56hqamhnJubmpiUkZKXpLfpSDw3PDgrIh0dGxcUFRsiKCovP0M4Ntiro6WnoZ+nt7+9xT0pJSclHBQPDQwL'+
  'CwwMCwkKEy+9vUNPv6+nm46KiIiFg4SJj5SUkZCPkJm3LR8dGxUPDhIaHhwYEw8QGCjNq6SfnZeUk5abmpWOjI2PmKbNPTo9'+
  'NiolIyAdFxIPDhEYHykuLzM6XMa/wL+un5qanaWsutLtfHdALiYiHhsVERESFBUWFxYTEhQXGxsbGyPPn5eZnJucnZ2Wj42N'+
  'jImHi5Shra6tqaKhqukvJyQgGhYWHCo4PDQrIx8jNrumoaGel5OVm6Olop6al5acrlI4NC4gGhkaHBsaGRUQDxIaIiktO+61'+
  'qqamqKeknZmWmJ6ptLvNRy8nIyAeHRwaFhERFBkaGxwfJCs0OzoxLjM/W2hPQUa9oZiXnJ+jp6qooJ2cmpWQkJegq7C1tq+p'+
  'qa6+311GNCceHSEpLjAyMSwnJis7Xtm7q5+cnJydnp+jop2bm5+nrLPJRS8nIR0cHR4eHBkYFxcYGh4nMUBMbdTPzc2+sqys'+
  'q62yvdxmSjovKywvLywnIyEgICImKiwtMTtCPzgzNDo/TF1oU0I9P0A9Mi0vSLuqpaWlpaaoqKSfnZqVj46PlJqepKqur66y'+
  'ucHK7T4qHx0cHh8lLDY+SFvr1M7EuKykn56dnJydn6Onq6+4t7rD+0A5LighHh4eHh4fIyUmJyovNztAR1lqXlZVX1lJQD04'+
  'LiYfHhwbGhoZGBcWFRUXFxgZIDnJsLGqpKGhpJ6cm5qXkZCTm6GrtMxWRjcwLC43OzkrJCEmMEDtxbCmnpqXlJaXmZeUkpGT'+
  'lZeanaSuxkkwKCYlJSEeHRwcGhoaGx0iLDtb08S6s62rqqqqp6OhoqWprLTA4U8+NDAvLiwqKSopKSkrLjM4PEJPf9bHv7u6'+
  'v8bY7VVCOTUyLionIx8cGRgXFxgYGhsbHBwdHiAkJys8xKqhn52bmpudnJqampiUkpOYnJ+krbvTWEQ8P0xkXkI0Li4xMzQ3'+
  'R9m3q6WhoaOmpaOhoqOjoqKjpaqxwXBEOTEuKyooKCkpKCUjJCUnKCswOUJS3MC4t7q8vby9vr26t7m8v7/D2FJCRExPUlpw'+
  '/G5z6N76VU1VZ/dvaWBZV1FSSj41LiwrKiclJCMjIiEfHx4eHh8hIiQmKCosLS4yNjk9Rui8sKyppKCgoqSjoqKin52cnJ6e'+
  'n6Clqq+3vMPBv727vsTKycrZYE5RX+jUx7++vby4t7m+xMO+u7i5ubu7ury/ydpoTkQ/PDk1MjM0NTEtKignJycnKCosLjI2'+
  'OTo6PEBDR0xb4czBvbu6uLazsrS3ubm4uLq8wcnNzczT9FVIQD07OTc1MzM1ODk3NDM0Nzc2NDU2Njk7PkA/Pj08OjQuLCss'+
  'Li4vMTQ0MjMzNDIyNj/uvrKsp6Gfnp6fnp+fn52cnJ2enqGlrLXHXkU7ODUzMTEyNDk7PDo6P0xv1L+1raikoJ6enqCio6Sn'+
  'q66xtbrAzepPPTIsKSYiICAiJCYoKistLjAyNDg5PUJNde/e4t3W629TSkM+Pj9ER0dJS01OTk1KR0dPXf7q39LNycjJyc7W'+
  '3/Dt+3VnWFlZW11VUktGQj8+PDk3NDQ1NTc3NjY1NjQxMC8wMDE1ODw9PkNJVFtddeXFt66pp6Kfnp6fnp+goaGgoKOmp6mq'+
  'rbK4xdlYSkY/Pjo8P0RRV2l2+tnTycfEvry3s6+urq6vsbW6wtRzUkhAPDgzMC4sKykoJiUjJCYnKCksLzU7P0tYYWxt7eDd'+
  '3NzW0c7Nzs7W4X5lXVdSTk5PWGj33dXNycW/vry7u7u6ubq7vsLHzNb2XE1GPzs2Mi8uLS0tLS0uLjAyMzQ2OT1DSlNbYXHs'+
  '2dTT1Nrf7nloWE9LS09SUk9NTU1OT1BTXOfGubGtq6impaWlpqanpqamp6mrra6vs7nC1PlaTEI8Ojo8P0JJTlBWXX/p6+zo'+
  '2M7KxsO/vr27vL/I2XdWSkE8ODYzMjEwLy4tLCwsLC0tLi8zNzo+R1Js3s3Ev728urm5ubu7vb7CxcfJys/U3Od7W05HQ0FB'+
  'REdMUlxrfunm6fD98vTzcWJfXWZoa2VZVE5OTEhDPTs5ODg4ODg5PD9CQ0FAQUNGSEpKSUxTZfvy5+Ha1NLQ2OXy8+Da2tzb'+
  'zb+3sa6trKurrKysra6urKurrK2urq+xtLnB0exfUklCQD9CQ0ZHR0ZERUdHRkVHS05VX/fe2trZ1dbffF9WT0pGQ0JAPj09'+
  'PT07Ojk6Ozs7PD4/QkdPY+/d0cnCv769vb6+vr29vsDCw8TFx8nN0dnf63piVk9NTEtKR0ZHSUxOT05NTU1OTUtIRUVHSUpK'+
  'SkpMTExKRkI/Pj4+Pj4+PkBDRUVGRkdJTE5NSkhJTFBWXGRsde/e2NfY19PPzczKyMfEwL28u7u6urm5urq7urq5uLe2tra2'+
  't7i6vL2+wMTIy87R19zg4eDh4uPk6vpzbWplXl1fY2VkZWhnYl1cWVNNSklJR0VERUdISElLTExNUFdaW11mefLs5t7Y1dLP'+
  'zs7R1tnb3+14Z11XUU9OTU5RVldWU1FPT09SVVdYXWd49/Hv7e70/29kW1VQTUtIRkRCQUJDQ0NDREZHSEtPWGb64tnU0c/O'+
  'zs/U2d7k7f5uZV5aVlNOTEhGRERERUZISUtOVFpfavzk2dLOy8nIyMjIyMnLzMzO0NXY2t/p93VrZGBhZWhu++PYz8rFwsC/'+
  'v76/wMHAwcLDxcbIy8zO0Nfg7PpvYVtaXF1fYGNlZm197ejr7/Pr493a2NfV09PW2+Dp8Pb6e21gW1lYWVhXVFFQT05NTU1N'+
  'Tk5OTUxLTE5PUVNVV1dWVlZVVlpjcvzs4tzZ2NXU1Nfb3d/p+ndzcW5udHVuZV5bV1RSUlRWV1lbXF1fZW98+fHt6+3v9Xxv'+
  'ZmFeXVxbWldUUU9OTEpJSEZFRUZGRkZJS01PUFNUVVheaW5ub3j47Obk5+zr5N3a2djY19TPzMrKycfDwL++vr29vb2+vr6+'+
  'vb28vLy8vLy8vL2+wcTGyMrMztPZ3uLp9HZpYl1aV1RRTk1NTE1MTExMTU5PUVFRUVJUVldXV1dVVFNTVFRTU1JSUE9PT09P'+
  'Tk5OT05PUVRWWl9pc3n88+zo5eDe3NrZ19XV1dXV09LR0NDQ0tba3uXt+nVrZmBdXFtbW11gZGRgXVpYV1ZUUlBQU1VZWllZ'+
  'WVpaV1JMSERCQT8/Pj4/QkdLTU9QVVxjbXd97+Xb08/OzMvJyMjJy8zOz9DU2Nzi5uzu7vX1+ffv8O3q5NzY1M/MyMO/vbu6'+
  'ubq5uru8vr/AwsTIyszP0dTW2uPtfnNrYV1ZVlRRUVBPUFFVWFpcW1xeX2JfXl1dX2BkZmVnZ2xva2hkYmRjZGJeXV1fY2Nk'+
  'ZGRlZGVlYmJiZ2tnYl1aWlpcXV5eXV1eXl1cWlpaWlhVU1JSVFZXV1ZUU1NTUlBPT09PT09PT09PT09NTEtLTE1OUFJVV1pd'+
  'XmBkanB7/fv69ezk3drY1tXU0dDP0dPT0s/OzczLysjGxMLAv7++vb2+v7/AwMDBwsTGx8jKzM7Q1NbY297k6uzt7Ozs6uvr'+
  '7O/0/XdzbWlhXFlXVlVTUVBPTk1MSklJSUpLTE1OUVVYWlxdYGNmZmVlZWZoZ2hmZWZmZWNfXl1eYWVrb3j68Onm4t/e3Nra'+
  '29zd3d7g5erv/3JqY19bWFZUUk9OTU1NTk5OT09PT1BRUlVYW11eXl5fYGNmaGtvdHp+/vz79e7p5eLf3t3c2tjW1dPR0M/P'+
  'z9DQz8/Pzs/Ozs3MzMzMzMzMzM3P0NLT09PT1dXV1dTV19rc3d7f4ebp7e7u8vd+dnFubGpnZGFfX15dW1pZWVlZWVlYWFlZ'+
  'WltbXFxcXV1eXl9fYGFjZGVlZmhoamtsbGxtbm9vb29vb3BwcnNxcXBxcW9ubWxsbGxsbW5ub3J0dnV0c3N0dHV2dXRycnN0'+
  'c3NzdXZ3d3V0c3N0dXV1dHR0dHV2d3h5fH79+/r5+Pf39/f39/f29PPz8/T09fX19vf4+Pn5+fr6+vr6+vv8/Q==',
  /* 쓰리 */
  '/3////7/f/9+/////n/9/n78/v19/n55/F/u1ODxaGhrb278+WHu3XJkYmzf2OF/am79ZWlldeXq5XNxXVrt7N/kbG9nevvk'+
  'Z2rcfNx3XWxt6u9ub37u73/9Xu/0+udi5vRs5mjz8Hp+be9peXtse27+43J5fd/dXt9ZYHdf1/5tYuftXPVtaWj53W9dVGnc'+
  'fm/f2v1w7/r0eGXq5X927upeW9/W+WZa/OBree5wffPj5PD0YufibfnwdPvv7WRY4FZf619cRldeZ/pT8eNgc1xvcV7nd+F1'+
  'aNbc0+DbzNvc3dfnb+Pg2Ofq1tPZ18zS083OyMjMycvSzszV6uPmbX5UTEc+Rz85NjQzLzAuLCspKikpLTY5ODo/S1Thwbi3'+
  'ta6qqqqpp6WkpKOmqaqqqqutr6+vsLW7vLe3vcfZaVVbUT41LysoJiEcGRYWFRIQGTI3Kyk4Oy5Qt6qyrp+cn6+3tbKvs7fc'+
  'Qjg1Ni4pKz7Csa+wsqylnZmXlpaTkZKWmp6jpqiuvU4sIB0bFxMQDg0LCwsLCw8qXUc3aLzZrpyWmp2UkJOfr7nJ0erZPCMc'+
  'GRkWExQaJzvsycrEsaCXj42Mi4uLjI+Rl5uen6a7SCgcFhMTEg8ODAoJCgsLDRlfrq+0qamzn5OOk5aSkZalvkwyLjJBLxwS'+
  'Dw8SFBccJTJntq2sqp2TjYqKioqMjo+QlZuhqLLdOSQaFBEREhIPDQsJCgsMDhzOqKirqKy9p5WOkJWVl5yt0TsqJSg0NSMW'+
  'Dw4PFRwmLjZPva2opJ6YkIyKiYmMkJOTlJiboa7cOSkfGRQSExQSDw0LCgsMDRMurKOlp6aztp6QjZCTlpuqzGJALSIiKSYb'+
  'FBAODREcLDs9QlfKr6KYkY2Mi4qKjI+Rk5aYmZ2tSyshHRoXFRMQDg4NDAsMDQ0QI7GenZ2dqsislo2Nj5Oaqt5QSjgoHyEh'+
  'HRcTEQ4OEh81WNrJyMWxnpGMioqLjI2Pj4+SmZ6jrnUvJR4ZFRQUEg8ODQwMDA4ODxpho52dnKG6vqGTjo6PlaDIQUA8Mikn'+
  'Ix0YFRQRDxEYIjRfxbu6taiakIyLiouNj5CRk5icoa/vOy0iGxYTERAQDw4NDAwNDhMhyaaem5qhuLCdko+NjZGewEg/OC8s'+
  'LSYcFhMRDw8SGSArP8q5t7CkmpONi4qLjI6PkZSYnKOzYzQnHhgTEA8ODQwMCwsMDBAcRq2fmpmfrKmclI6Lio6at0g4NDI1'+
  'NCQYEQ8PDxAUGBsfLGqzqqSfm5aQjIqJiYuOkZebnJ+ovEcpHBURDw8ODQwLCgoLDRYq0ayfnaKurJ+WkIyKi5OkxUIxLjdE'+
  'Mh8WEQ4NDhIYGx8oO9O1qaCbl5KOi4mJiouOlZueoKaz+y4eFQ8ODQ0NDAsKCQoNGS/GqZ+ir7iqnJONiomNl6nMQjg7T0os'+
  'HRUQDg4PFBkdIy5LxLKon5uXkY2KiYqLjpSanp+hqbxCJRgSDw4ODg0MCgkKDhovza2nrs7SrZySjImJjpmry09L4r3NNB4W'+
  'EA4OEBYaHiUvRe+/raKclo+MioqLjZGXnJ2dn6i/Nh4VDw4ODQ0LCgkKDhkqT7631UR7q5qPi4mLkJyqtbu3rarAMB0VDw0P'+
  'ExgbHiMrMTpntqack46Li42Pk5aYmJeYnq9OJxsVExIPDQsKCQkOGSc4W246LkyqmI+LiYyUn6mppqGdnrYtGhMPDxMZHh4d'+
  'HB0dIzi4oJiRjo6QlJaWlJORkpejxTIiHRsaGBQOCwkJDBQeKzk9LSMr0aGUjIqLkJukpaKem5qkVSEYExAUGh8eGxkYGBwr'+
  'z6WalZOUlpiXlJCOjpGZqNM3KycjHxoTDQoJCg4YIikuLSEdLLmckIyLj5mlpp2YlpWZry4cGRgaHiIfGRMSFBojQLOkoKCe'+
  'nZuYk46NjpKYn6/L7mVBLB8XDwwKCg4YHh8fHhkWH8+dlI+PlqKto5aOjY+XryweISszNS0fFA4OExwnPM7B322/q5+ZkY6O'+
  'kpebnqOlpKe6PSMZEg4NDhQbHRoZFxIRHWGjmZaYn7C5opOMjI+ZvikmQbqwxjAbEQ8THCcsKissLj+/qqKemZWUlpmanJ6e'+
  'n6S3QikeGhYUFBkeHxoWFBESH8ujoam0yNuymY2Nkpysake3n52pXiQXEhYhNzwuIxwZH0Orn56fp6+sn5iVlJifsNNOQT42'+
  'KR0WFBkiIRwbGBMWLbCntmlES8afj4yUqcnVwKaWk6Q3HRodKmTDPx4WFhwry6iqy0z2u6qclZWdqK2wta+qsU0pHxsXGitI'+
  'LBsWFhQbVKWpTikpPLabj4+fVDzHppiRmMcfGiVVs7BhIBQVI2G3t98xJzWynZqcoa/IuKOcnaW6PCgmLTAmHyYuIhkaHRse'+
  'S62/KyAr/Kqakpi7L0qpm5aWpDMcJdurq8QtGhUdRbO4WC8mKFulm56su762p5ycpb5VQ0RPTjomGxssQiocGxwbJ8OvSyEi'+
  'P7WimZipOzmtm5man9okKMyordIyHxkeQ7W/OyknLVaqnJ+158OtpZ6dpsZKW83IbTsqHRoldFMgFxkdIUuuxiQaJ7+hm5up'+
  'PSu/mZWbo8UqKMSfpM0vIh0jTbK+MiEjL+GtpKrHXMKnnZ2ir8rMtq2x1DcoJSQlMHM6GhMZJS1SvUUdGDKonKGsyDk/o5GW'+
  'qtBPOe2hm7QrICUrPcbANh4fMVzCsbV9TL6mn5+lsL+2p6Coxz4wLzY+LiEmOSsZFh8sLUTqMRse1aGjsr3PWLeZlKTh6b+9'+
  'q5+rMh8qTmJKSDQiHzPLzldx6GO/pJ6mr66sq6Weors/O0tPRTonGx8+PRwVHCgrPds4HR56o6S2wsfZtZqVp1Bys66rpLEv'+
  'HyzRv040LCMiOrm/PDb1vripoai3r6Kgp6ustdjyzmQ1KygfHCvXMhUTIjUtO3QuHCWunrNK1bK5rZucvUO8qa+1rsMtJ0y6'+
  '4jYxLicsz7ZcNUnKxranp7S4qaOnqairtL7F0m9GNy4mHiA7zycSFSpINj4/JBszoqDtNeK2uKecqEhDrqeztLJcKjW5s0ou'+
  'Ly4x2a/kKi7GrrO0tMbMq56jsbi1trCpreU6QFJAMy0kHy3TPRkVJ28/NDkrHimvpHMqP7q+t6OqRTa3pbHDvtc8TbCvVDM/'+
  'V1LVudg0OcOyvLy82/SuoKnBwbO2uK2sy0lf0HQ/OzQpIivZ1SEVHlXeNjAsIiPwpr4rKuO2vK2rbjHbo6a/0snm7rCnwzM2'+
  '28DEx10zM9KxvV5PbuO8qqzH6bisq62zy9q5rrxSPTs4OTMqKT9MHxYh4VknJionKN2sWCQutqy9s67cSLGep8rJu8bIratp'+
  'LTrOzGpbPSsvzrfoPERg0LGps9fAq6apq6+9v6+rtvZEQkI+NyshITZbJBQZOFksJyknJ02quC8uuqWtrqe2bbeeoLzVvsfo'+
  'vbFqKitKVjw5Ny0rSr7bPEDRu6+orL+6opykrq6trquptmhNb1k8MCslHx4nOi4YEx9ZSyspLC4/sabGOOamoampq8TLqJ6u'+
  'U03fclvdViwkLkpAMi4uL0PFx05OwrGtqKWss6idnqWrrq+tq7HbSE5kTjYpJCQmJB8eJjElGR092zQtNz9HwqeuTk+soKu4'+
  'sbvWuamyRj7V00ZAVz4tMFBVOThISEPuvcde17Wvsq+utrWnoqq3uq+srK+83XrJw+1DOTY1NDIsJiQlJio4Nh8aKczXLywz'+
  'PmG2rvw06KeluMK5vrysp7pX1Li7zMvhPztfzlQ7Oz8/Ttd1PDdbvbvI49zFs6qsusW3rKqss77Du7S1xFo9QWFtQC0oKCwu'+
  'KyMfJjw2HhwzykcrMk9r3bGvbkm1oqq+ubG2uK2tyFvTu8VqVks/P09SPjg4OT5QVj44R+LW4uPd2MS1s7rBurCtrq+zuLav'+
  'rbO9xsW/wdlRR0xFOzUyMS0qKikmKj4/Ixwtu8guK0HezrWu7TvHoqXE2ry4u7Owz0JbvsJaQz88Pk1NPDY3OT9NTT45R/ff'+
  '49zZ28u6tLrEv7WwsLCzt7SurK63uriztbzGz9bd/llHQUA8NzAxMy8rKSorM0QzICJGvkwtMk/lzrnBREK5qbXv38TBvbe+'+
  'WkjZvchaTExOa99uSENKUv7qWERGYe15bWRTTffHyOdg5Ma9vb/DwLmxr7O3ta6tr7CxtLi4tbjBztrxaWJRPzc0NDMvKygn'+
  'KC04MCIgMuhGLS8+WWzExEo/xquz4/PKwsC7v2VK7sbSUUlLTFn1aUlDTWbq8V5OV+PY5G9s/e7b1tvsed3Jw8vbzLy2uby6'+
  't7SvrK21t6+srrS5ubq9wMjZfGRPQz4/PjYvLi8vLisoJygsNDstIydDy0oxM0zPycDcR1m5rLpsYc+9vL/ZS1LWx95ORURS'+
  '5ONUREth7NjX+ldxyMDL5OPQysXI1/HnzcfM1+jhzb+9xc7Jvba2uby9urSxs7m9vbu5ur7K2NnU1OVZSUNER0M8NTQ2NjQx'+
  'Ly4tLy4sLDhDLiUtVlwxLz1NSVfTUzxYubXU/Mq/u7e1v9C/s7W+yczPxbzEelN82up5Xk1IWt9oTE1fdmzj3Wxe5MjH0t7b'+
  'zMHAyNTSyMHAydLVy8HAxc7RzcW+vsnTyby7x9DKwsfLzNj7aubvTkBAQz46NzQwLzAvLCorLjIyLCktO0M4MzpKY3nfal3d'+
  'wbvDzc3Gv76+y9rRxcHL3/je0tHS3Xxt3s3N42f91MfJ1+7gzMXFy9nay8HDzM/Mx8TGyc3Ny8rKys3Z3tzW1dzuYmHu3fVZ'+
  'V2nv5upxYfrQytLc0srKysXFzNbQycvZc11XWFdJOzY2ODQuKykpKSkoKS0tKSgvQT40OU3i1s7N1se4sLa+vbi1uby/yMvK'+
  'ydDwXFhq9m1ZUFNm4trubebNxcbHyMjCvry/xsnGv7/J2eDV0Nf3Y2Rx+nNfVVNdef1lXWBr/Oblcmvo2Njg5Ovp0sbG1ufS'+
  'xL/DyszEvbzCysjBv8HI1d/a1+xZTUlCPj88NS8uLy8uLCkoKzM6LiYpPvxBMDdWz9LW8WLNt7LB08S5ub6/w83Px8LPb1t9'+
  '2dp3UlFe9+f3ZVtu187Y6OjZzMjK1d7VzMzU3d7a1dXe7ufZ1t3j3NfY2dbX29nU1N7k39/ofW9tbWhhVk1NVmdjV09RaeHb'+
  '/Wnfy8bKy8vLxL69wsnFwcDDx8vSzsrN4fnueW5tYlFLTk5IQkNDPTo7PTo3NDM0NTUxLzQ/QDIuOV1ePjtL8+Xi2/fkxrq8'+
  'zMq+ubu+vb/ExL+/y9rd1NTgbFhUV1xYTUhJTlJQT1JaZH3s59/VzMnKycW/vr/Cwr++v8TIysnL0dzl6/xybGFWT1BVV1FN'+
  'TU9YXl1YV2bs4uz97drPzM/X1czGxsrNzcrHxcnPz8vKy83Q1NXV1drh7nlwb29kU01MTkxGQj8/PTw8Ojg3ODk3NjY4Ojw8'+
  'Ozs9Q0lMTE1RXHX8enXp1NHX39vNzM3T087Nyc3Q1M7Jy87S0tDQz9HX29rV1+Dn5eHl5un1evvy+HNueHh7dHBub/78/nx/'+
  '9/bx8vHu7Ofl5unn49/f4OHg3t/i4eHg4ePn6enn6uzq6Ort7u3t6uPf4Obj3dnY2dbT0c/Pz9DRz87P09jY2dre5+zz7vx2'+
  'amJjZG5fV1JbZltQTFVYVU5LSklNTUdBQUZFQj8/Pz5AREhHQ0BCTV1bTk1Ybfj6d2z93dfc8+3k3d7i4O/t6+PreXzs3d7m'+
  '7urf2NXX2NbPzs7Q0M/Ozc7Q1tfV1tzo7+3r9WxfXmVoX1taXWNnZ2Vqeuzm5ubg29bU1dXV0tDS1tva2dnc4+zu7e7y/Xdy'+
  'evn1/nr67Obl4t/e3NrX19jY19fY2dvf4+Tk6/9zbm5pZF9cWllaXV1ZV1ldXl5dXmBmbGlkYWVqZ2VkaGFbWFthXVdSU1ZW'+
  'V1RRTk9XWldRUldYWVtdXFlbXWVpaWJdYGl7d25rcPr07/r47OHe5eTf3Nzc2tra2tfY3N3b2dvc3N3f4uDf4ePj4OHj4+Pj'+
  '4uDf3+Hf39/j5eTk5ejr7vHz9/x9enh0cnBxcW9wcnd5fX1++/Pu8PPx7ezu7+7v8fb5/H15dnRvbWtqampqZ2ZnaW1tbWxr'+
  'bnd+dnF3/n95en18e3x7dHF2enZtbG9zdXJvbW1yeXlzcnZ7fHp6en39/P96eX38/Xt5en19fHl4en1+fXx9fg==',
  /* 포 */
  '/3//fv9/fn59fn1+fXx+e318ff96fH58/n98/n7+/n19fX//ef/5fHx5fv139315/Hz1dOdtfNDtdHF6XU333M7OaHpseOXj'+
  'XGjiWdvn/vxe9m1x6+7x43N6bu3tcOLs3fNs7mdidWttdnJwbHFwa3F6c379c+Xnd+9n79rky8rS0tDTzszMxMbL2+He7+Hb'+
  '3+Lj7vloW1hUUUtHRT8+PT09Ozs8Pj49PT9BREhJTVVibnn06N/Z19bPzMnHxMC+u7m3tbOxs7K1uLi6ubzAwcfK13piUUpB'+
  'OzcyLy4tLSwtLi4vLzEyNjk8P0VPX+7WysG9u7q5urzAx9LhcWd06M+/ta2oo6Cfnp+ipqy2yV1CNi4sKiorLS4xMjAvLiol'+
  'IB4dHR4jLz1evKidnJubmpufqrnXUjcrJiQmKC45TNu8rKajoqGfn6Kora+1wntSTUU5MC4uLSkkIR8dGxgXFxcZHigvRrqi'+
  'mZaTkI6Okpifp7VKKh8cGhgYGh4mMmu2qaGdmZeYm52dn6m1wcjoQzMuLSokHx0cGhgVFBQVFxohLUHEp5qTkI6Ni4yPlpyj'+
  'tTsjGxcUEA8RFhogLVK6qZ6ZlpWVlZWYnaWqr79NMywqJB4aGRgXFBMTFBUXGiAvR8CnmpKPjYyKio2SmJ6sTicbFhIODQ4P'+
  'FBkhMeqxo5uWlJOSkpSYnaKnsNY8LyskHhoYFxYUEhMUFhYaHyxG1q2dlY+OjYuKjJCWnKW+Lx4YFA8NDA0QFRsjNsysnpiU'+
  'kpGPkJOYnJ+nt1g1LSYeGRYWFRMSEhMWFxoeKD7etaKak5COjYyMj5SZnqrsLB8ZFQ8ODQ8RFRoiNNuuoZuWk5CPkJOXmp6m'+
  'uVk3LCIbFxUUFBISExUYGh4mN+2/qp6XkpGPjo2Ok5idpLY/KB4aFQ8PDxETFx0nPcWrn5mVko+PkJOXmp6qxEYyKB4YFRQT'+
  'EhERFBcZHCItTc6zpJuVk5GPjo6Sl5ufqtUzJR4ZEw8PDxIUGB4qRb+qnpmUkI+PkJKVmJ6qwVE1Jx0YFRMSEBARExYYGyIt'+
  'SdWvopqVk5COjo6Slpqfq+Q0Jh4YEg8PEBEUGB4pP8asn5qVkY+PkJGTl52nt+I8Kh4ZFhQSEA8QEhQWGh8qO2e0pJuXlJCO'+
  'jY6RlJicqMk9Kh8ZExAPDxASFhwlNO2zpZyXk5CPkJGSlZqhrLtlMiQcGRYSEA8PDxESFhsiLDzJqp6ZlZCOjY2PkJSYoLL4'+
  'NiYcFhIQEBARFBkgLEPGrKCalpOSkZGSlpqepq/NPSsiHRkVEhEQEBASFRkeJi9UtKScmJOPjo2OkJKWnKrHRS0fGBMREBAQ'+
  'ExgeKDrZr6Obl5SSkZGSlZmepK7FQywjHhoWEhERERESFBgdJCw/v6mempaRjo6Oj5GUmaO17zknHBYTEhEQERUbIi1Hv6qf'+
  'mZWTkZGRk5eboKm3ZDMmHxsXExIREhESFBgcIio16LCknZqVkI+PkJGTlpypvGQ1JBoWExIRERIXHCMuTLyonpmVk5GQkZOX'+
  'm6CqvUsuJR4aFRIRERISExUaHiUsPsOsop6alJGPkZKTlJmgrb1lMSIbGBYTEhIVGR0lMFW5qJ6alpOSkZKVmZyirMdALSQe'+
  'GRUTEhISEhQYHCEpMmW4qaKdmJSSkpOTlJedpq+/Ty0hHBoXFRQVGBsfJzV1uKifm5eUkpKTlpmdo67OPy4lHRgVExMSERMV'+
  'GR0hKTzWtKujnJiVlZWUlJabn6Wsv0cuJyEcGRcXGBocHyczUcGupJ6al5WVlpeZnKOuxFY2Jx4aFxUTEhIUFxodIS1C0Lms'+
  'opyZmJeWlpeanqGmrsdMNy0mHxwbGxsbHSAnL0HcuKujnZqYl5eXmZyhqbTMQiwiHRoWFBITFBYYGh8qOV3HrqSem5qYlpWX'+
  'mp2fo62/dUIzKSEeHBwbGxweIykyRte3q6Kdm5mXlpeZnJ+mr8pCLiYeGhYTExMTFBYaHyg0SMWtpJ6cmZaVlZiZm52krrza'+
  'SDIpIh8dHBwcHR8jKTFA77ytpqCdm5mYmZqcn6Stv186KyIcGRYVExMUFhkdIys4aLqrpJ+cmZiXmJqbnaGps77oQzIrJyMh'+
  'Hx8gIiUqLjpO2LyvqaSfnZycnJ2eoqivv3Y9LSUeGxgWFRUWFxkdIioySciyqqWfnZubnJ2dn6Oqr7jHdEI4MS0qKCcnKCos'+
  'LzU+T9/DuK+qpaKgn56en6OnrLPDXjwvJyEdGxoZGRkaHR8lKTFG5cG5r6qmo6Sko6OlqKutsLe+zN9jUUU8NzQyMS8vLzI4'+
  'PURQ48S5sq2ppqSjo6SmqKy0wfVENiwlHx0cHBsaHB4hJSkwQWvOwLWsqKampaKho6anqKqus7rC0mpJOzMuKygmJCQlJyot'+
  'NEBvxritp6GenZybm52fpKmzyE42KyMeGhgYFxYWGBseICYvQXvHt6yloJ6dnJqanJ2en6SpsLvQVjwvKSQgHh0cHB0eISYr'+
  'NlPItauinZqYlpWVlZibnqStv00yJx4aFRMREA8PEBQXGx4mNmO9rqWempeVlZOTlZeanaGqttdFMSkiHRoYFxcXFxkcHyYt'+
  'POq3qqGcmJSSkI+PkJKUmJyjrsJLLiMcFxMQDg0NDQ4OEBUaHyk42rGlnpqVko+Pj5CRlJicoqu7ZDYpIBwZFhQTExQVFxod'+
  'Iys4V8KvpZ6bmJWSkZCPkJCSlZibn6i35jsrIBsWEg8ODQwMDA0PERUbIS1EyKygm5eTj46Ojo+PkpaaoKq5ajYnHxsXFBIR'+
  'EBESFBcaHiUvQdu4qqCcmZWTkI+Pj4+QkpWXm5+otdU/LSMdGRUSDw4ODg4ODxATFxsfKTn3uaugm5aTkY+Pjo+Qk5aZnqez'+
  'zUQuJB0aFxQTEhESFBYZHCAoM0vMtKmhnZqXlZSTk5OUlpeanKCnrrrRTDcsJiEeHBoZGBcXGBkaHB0fIygtND5T28K3rqqm'+
  'op+enZ2cnZ2foaWpr7vTTzouJyEeHBoaGRobHB4jKTA+Z8e2rKein56dnJycnZ6foqaprbC3vcXS5WlYTEZCPjw5ODY0MzEv'+
  'Li4tLCwqKikpKCcoKiwtLzVDXtnIt6yno6GfnZycnqCjp66+60U0KiQfHRsbGxsdHyMpLzxP2r61r6yqqaipq6ytrrCytLOy'+
  'sa+uraysrKytr7S5v8ngVkc+OzYyMTEyMzQ1Nzk5ODY0MS4sKSYkIyQkIyYsND5K17eqpKCdm5iXmZudnqSuv3E9LiYfHBsa'+
  'GhobHSEnLTdFc8a4sq+tq6usrrCztLe6vb26uLa1sa6trKysrK+zusHPaEg8NjIuLi0vNDpAUt/FurOuraytr7fGaz4vJh4a'+
  'FhQTEhESFhoeJC9otaafmpWRjo+QkJGUmp+pttg9LCIdGxkYFxgZGx0gJCowPUtj1cG4tbKvraqpp6akoqCfnp6enp6go6it'+
  'tsViPC4oIh4cGxobHB4iKTJKzLSooJyZl5WVlpibn6i2+zQkGxYQDQwKCQoKCw0QFx4qPb+nm5WSjo2Li4yNj5GVnKSvxU8y'+
  'Jx8dGxkYFxgZGhwdHyIoLjQ7RXTCtq+tp5+dm5ual5aXmZucnaGrtsP6QDApIyAfHh0eHyMoLTdI372xrKiloqCgoaOlp6uv'+
  't77J41xIPTk0LywpJiMgHhwZGBYVExISEhUYGx4kN+OyqZ+Yk4+Ojo2NjY+UmZ2ktGQzJyAcGBUUFRcYGh0jKzdN2r6xq6im'+
  'paWlp6iqq6yurq6ura6trKurrrC1vMdwRDUsJyIeHBwcHB4gJi08+r2tpZ6bmZeXl5mbnqSsu/c+MCkjHx4fHyIlKjA8Ud/H'+
  'vLe1trvC1lg9LykjHxwZFxgZGhsdIis6V862qqGenp2cm52fo6ittMJ7Sz85My4tLS4vLzE0OTw9P0NLVF1i+dPGvbmxrKmk'+
  'oZ+dnJycnZ2fo6mvu9RMNislHx0bGhkaGhweISctOU/Suq6oo5+enJubnJydnqCkqKyxu8tsSTsxKyckIh8fHh8gIyYrMDxP'+
  '2b+1rqqnpaSlp6quuMpaOy0lHxsZFhUUFhgaHSMtRc22q6Odmpqbm5yepKy5zV0/MSspJycnKCotMzg8RVJnbHB++PpmVlr3'+
  'z8jGuq+ppKGfnZuam52foaauvW0+MyskHx4eHyAjJy06Tt2/s6ypqKioqauvusfaaEk7NTIzNDU3OkJSbeLRyMG/vr6+vsLH'+
  'ysvKzdLVz8rIyczNzc7X9FxPSUA7NzU0NTY3Oj9KV2zo2NHS32hPQTcvKiYiHx4dHh8jJyw1RuPBt6+sqaeoqqyusba7wcjM'+
  'zczLysnIyMnO3GZIPDQuKiYiHx8hJSouN1y/raWfnJqXlpeYmp2gpq25zWhGOzg3Nzc3Oj9KU1NRVV9uaFpRUV117d/VysC7'+
  'uLa1t7m9w851SDoyLSspJiUmKS0zPEvsxbmyrq2trrG2vcv8TT45NjQyMjQ3PEFITVFYXWBeWVRSV1xm89nLwr25trSztrq/'+
  'zPVJOS8qJiMgHh4fISQoLTZFc8q6sKyqqaioqKmsrrK2usDJ0+ZsXE5EPTcxLSooJSMhISImLTdK1LWpoJyZl5aVlpiZnJ+l'+
  'rLS/0W9JOzUwLiwpJiMiIiMkJiovO1XMtquloJ6dnJ2eoqivvd9JOC4qJyUkJSYnKCotLzM3O0BKWvPSxby4tLKxsrS4vcfY'+
  'Zko/Ozg3Nzk8Qk1h69jNycjJzM/W3eb2+fPr7fP6cmFPRTw1LywpJiYmKCotNEBjz7+5s6+vsLS5v8zjXFJOTUpISElKSkZB'+
  'PTkzLy0tLCsqKy47XsW1qqOem5mXl5ianaGmq7K901lHQT05NzUyLy0tLS8xNDhBasa1rKeinp2cnZ6fpay40FM9MywpJiUm'+
  'JykrLS8xNTo/SlZp4Mu/ubSwrq6usbe9yORRPzgyLy4uLzI2Oz9IUVxs9eri4Of1d3RwbmpiXVdRTUlFQT49PDw+Q0lQXvfd'+
  '1dLT1uJuVUtFQD89PT09Pz49Ozk1MS4rKScoKi88X8Wyq6Whn5+hpau3yWNHPjw8PUVW786/uba1t7q9vLq4trKvraupqKip'+
  'rLO+011GPTk3ODtATXLPw727u7q6u7u8vLu6u7y8vcHN9Uo7MSwoJSQkJScqLjhEXN3Jvru5uLi5u73CydLqXUo+ODMvLSws'+
  'LC4vNDpCUXnXysO/vr29vb7AxcrP2etqWU5GQD48Ozs6OTk5Ojs9QUdNV2Pv2M3JyMnP3HpZTEVBPz07ODY1NDIvLSwrLTI/'+
  'bMOyrKilpaWmp6qvt8DKzsvDvru6v8zmXEtFQ0JBSFbnxrivq6mpq62vsbS1tri6u7y+v8LM7049NC8uLzM6RFbpzMC7uLa3'+
  'ur7Hz9vg5OfyZ1FEOzQuLCkoJycpKy82P0xe/eji4OPn5N3a2dra2tvh+l5ORj47OTk8QEpXfdnMxsPBwcLGzNflfmheV1FO'+
  'TElGRkhMVmjs29PPz9DV2d/r/G5qZ2/97d/e3/JlU0dAPDo5ODk5Ojw+QERGR0ZGRkdOZ9jFu7Swr66vsbS2uLy+wsfLzc/W'+
  '3etmUUlDQUNJV/zQw7y4tbKxsbGys7Ozs7OytLe7wtBwT0M9Ojk6PD5DSExTWl9nfere1c3Iw7++wMbN3mVORD05NjQzMzQ2'+
  'Nzk6Ozw+QUVLU15z6dvTzszMz9Xe+WJYUExKSEZEREVHSk5ZaezZz8zJxsXExcbIy87W4v5hVUxGQj8/P0FFSlBZYnD15dvU'+
  'z83LysvNz9Ta4vVoWlFMSUVEQ0JEREZHSUtNUVZbY2t3+O7p6ez1+/Di183Hwb69vr/DxcfHxsXExMTFyMnLzM3P0dXY2dfS'+
  'zsrHxcXHysvMy8jFwb+/v8PJz930Z1tVUU9PUFFRUlFQTk1NTE5QVVxlbnl6cmphXFhVU1JQT01LSEVBPz8/QURITE9UVlhZ'+
  'XF9ncfbm3djV1NTU2N3m8XttZV9eXmBiYmNlZWVjYmJlamxwd3l5cm1qam1xfP329Pt8b2llZGRjYV9dWlhWVVVWV1dXWFlc'+
  'X2t88Ofl4uXq7vj3/Pj29vH18vb18/Xy9/p+e3t9+Oze1c3IxcHAv8DCxMbGxsXDwsDBwsTHys7R1tve4uTl4t/b2dfW1tbX'+
  '1tbV1dbY2+HueWheWFNPTEpIRUREREZISk1RV11mcv3v7/H7cmheWldTT01LSkhGRUVFRkdJTVNbafvn3trY19fW1tbY2tzf'+
  '5u39cGhgW1dTUVBQUlNVWFpcXmJqdvPp49/e3+Lm6Orq6+vr7O3w+XZrYlxYVlVVVldXVlZWVldaXWBmbHJ98ung3NnX19ja'+
  '3eDl6u7y+Pf59O7r5ePe3NrX1tPS0dDR0dLS0tLPz83NzMzNzM3MzMzKysjJycrMzc/S1trc3+Pp7fH6f3RrZV5bWVhaXGFn'+
  'bnZ5fXp4dG9taGVgXVpXU09NS0pISEhJSktMTU5PUlZaX2ZrbW5sa2hlY19fXl1fYWdrb29qZl9cWlpbXV5eXFpXV1hcY2/4'+
  '7ezw/3Rta2xrbGtoZmFfXl5dXFxbXFxeYWNoamxtbXV89e7r6u3t8vTy7+nm4uDg3+Df3t3b29vb29vb2trZ2dnZ2NbU0c7M'+
  'y8rJyMjHx8bGx8jKy83P0dLS0tLS0tPV19jZ2tzd3+Tn7O/1+/95c21qZ2RkYmJgXl1bWlpaXF1eXl5dW1pZWVhWVFJQTk5O'+
  'Tk5PUFFRUlJTVFRVV1hZWlxdXl5fX19eXl5eXl5dXV1cXFtaWlpbXF1gZGhrbW9xcnN1eHz//Pn18O3s6+vr6+vr6urq6+zv'+
  '8fHu6+bi397e397e3NrZ2drb3d7e3NrX1tXW2Nrc3Nzb29zd3uDj5OTj4+Tk5ubl5OHg39/g4eLh4N/f4OLm6u3u7u7u7vH3'+
  '/np2dHR0c3Bta2ppaGloZ2ViYF9fYWNmZ2hoZ2ZmZmdmZmVjYmFhYWJjY2NiYGBfX19fX19fX19hY2VnaWtsbm9wcnN0dnh5'+
  'ent6eXd1dHN0dXZ2d3d5e33++/n39/b19PHv7u7u7u7v7/Dx8vP19vf4+Pj4+Pj4+Pj5+fn6+/0=',
];
const VOICE_BUFS = [];
/* 쓸 때 편다. 목소리를 안 켜는 사람에게 시작할 때 22,000샘플을 돌릴 이유가 없다 */
function voiceBuf(b){
  const i = ((b|0) % VOICE_B64.length + VOICE_B64.length) % VOICE_B64.length;
  if(VOICE_BUFS[i]) return VOICE_BUFS[i];
  try{
    const bin = atob(VOICE_B64[i]), n = bin.length;
    const buf = ac().createBuffer(1, n, VOICE_SR);   // 16k 버퍼는 브라우저가 알아서 리샘플한다
    const out = buf.getChannelData(0);
    for(let k=0; k<n; k++){                          // G.711 μ-law 복원
      const u = ~bin.charCodeAt(k) & 0xFF;
      let t = ((u & 0x0F) << 3) + 0x84;
      t <<= (u & 0x70) >> 4;
      out[k] = ((u & 0x80) ? (0x84 - t) : (t - 0x84)) / 32768;
    }
    return (VOICE_BUFS[i] = buf);
  }catch(e){ return null; }
}
/* 목소리를 **박보다 조금 먼저** 시작한다 (2026-08-16, 귀로 정한 값).
   파형의 시작을 박에 정확히 맞춰도 사람은 목소리가 늦다고 느낀다.
   클릭은 0.8ms 만에 최대치인데 말소리는 20~80ms에 걸쳐 올라오기 때문이다 —
   귀가 "박"으로 잡는 건 파형의 시작이 아니라 소리가 커지는 지점(P-center)이다.
   실측으로 원 67ms · 투 84ms · 쓰리 21ms · 포 22ms가 걸린다.

   **단어별로 다르게 당기지 않는다.** 그러면 네 단어의 간격이 서로 달라져
   메트로놈이 흔들린다 — 늦게 들리는 것보다 나쁘다. 전부 같은 값으로 민다.
   자르기를 더 하는 방법도 있지만 그건 ㅍ·ㅌ의 파열을 깎아 발음을 뭉갠다.

   예약을 120ms(`LOOK`) 앞서 하므로 15ms 당겨도 시각이 과거로 안 간다.
   그래도 `Math.max`로 한 번 막는다 — 첫 박은 여유가 60ms뿐이다. */
const VOICE_LEAD = 0.015;
/* ★ 2.1 (2026-10-15) — **단어마다 당긴다.** 위 "단어별로 다르게 당기지 않는다"를 뒤집는다.
   사용자 제보 영상(70 BPM, 16분 파라디들)을 실측하니 목소리 시각은 박에 1ms 안으로 정확했는데
   "카운팅이 안 맞는다"고 들렸다. 원인은 단어의 **소리가 커지는 지점**이 다른 것:
   40% 도달 원 ~70ms(모음) · 투 78ms · 쓰리 19ms · 포 17ms. 같은 15ms만 당기면 원·투는 박보다
   60ms쯤 늦게 들리고 쓰리·포는 맞는다 — 16분 간격이 214ms인 템포에서 한 마디 안이 절뚝거린다.
   귀가 박으로 잡는 것이 그 지점이므로, 그걸 박에 맞추면 오히려 **들리는 간격이 고르게** 된다
   (옛 판단은 "파형 시작 간격"을 고르게 하는 것이었다). 쓰리·포는 그대로 15ms, 원·투만 그 차이만큼 더.
   최대 78ms라 예약 여유(LOOK 120ms) 안이고, 첫 박은 Math.max가 막는다. */
const VOICE_LEADS = [0.061, 0.078, 0.015, 0.015];
function voiceLead(i){ const v = VOICE_LEADS[(i|0) % VOICE_LEADS.length]; return v == null ? VOICE_LEAD : v; }
/* 목소리 한 번. **다음 박이 오면 끊는다** —
   "쓰리"가 380ms라 BPM 160을 넘으면 다음 박을 먹는다. 잘려 나가는 편이
   두 단어가 겹쳐 뭉개지는 것보다 낫다(사람도 그 템포에서는 다 못 센다).
   끊는 시각은 **당기기 전의 박**을 기준으로 한다 — 그래야 다음 박에 정확히 멎는다. */
function playVoice(b, t){
  const buf = voiceBuf(b); if(!buf) return false;
  const c = ac(), s = c.createBufferSource(), g = c.createGain();
  s.buffer = buf;
  const st = Math.max(t - voiceLead(b), c.currentTime);
  const end = t + Math.max(0.06, beatDur());
  g.gain.setValueAtTime(0.95, st);
  g.gain.setValueAtTime(0.95, Math.max(st, end - 0.03));
  g.gain.linearRampToValueAtTime(0.0001, end);
  s.connect(g).connect(bus().clk);                   // 메트로놈은 드라이 — 드럼 볼륨을 안 탄다
  s.start(st); s.stop(end + 0.02);
  releaseAfter(end, [g]);
  return true;
}

/* --- 샘플 엔진: URL만 넣으면 신스 대신 실제 녹음이 재생된다 --- */
const SAMPLE_URLS = {
  // kick:'/samples/kick.wav', snare:'/samples/snare.wav', ...
};
const BUFFERS = {};
async function loadSamples(map){
  const c = ac();
  await Promise.all(Object.entries(map).map(async ([id, url])=>{
    try{
      const res = await fetch(url);
      BUFFERS[id] = await c.decodeAudioData(await res.arrayBuffer());
    }catch(e){ console.warn('샘플 로드 실패:', id, e); }
  }));
}
function playSample(id, t, vel){
  const c = ac(), s = c.createBufferSource();
  s.buffer = BUFFERS[id];
  s.playbackRate.value = rnd(0.995, 1.005)*tuningPitch();
  const kit = (KIT === 'electro') ? KIT_ELECTRO[id] : null;
  const g = voice(kit ? (KIT_SEND[id] != null ? KIT_SEND[id] : 0.25) : (id==='kick' ? 0.05 : 0.25));
  const gv = (vel==null ? 1 : vel) * (kit ? kit.v : 1);
  const dur = s.buffer.duration / s.playbackRate.value;
  const tail=Math.min(dur,dur*tuningDecay());
  g.gain.setValueAtTime(gv, t);
  g.gain.setValueAtTime(gv, t + Math.max(0.001, tail - 0.015));
  g.gain.linearRampToValueAtTime(0.0001, t + tail);       // 끝 15ms 램프 — 샘플 끝 클릭 방지
  if(tuningTight()!==0){const tone=filt('lowpass',Math.min(c.sampleRate*0.45,12000));s.connect(tone).connect(g);}else s.connect(g);
  s.start(t);
}

/* --- 공통 트리거: 샘플이 있으면 샘플, 없으면 신스 --- */
const SOUND = {};
['kick','snare','snareXStick','snareRim','hihat','hihatOpen','hihatFoot','ride','crash','splash','china','fx','tom1','tom2','ftom','click','clickHi'].forEach(id=>{
  SOUND[id] = (t, vel)=> BUFFERS[id] ? playSample(id, t, vel) : SYNTH[id](t, vel);
});
const ART_SFX = {[ART.OPEN]:'Open', [ART.XSTICK]:'XStick', [ART.RIM]:'Rim', [ART.BELL]:'Bell'};
/* 아티큘레이션까지 반영한 단일 진입점. 소리를 내는 곳은 전부 여기를 통한다 */
function hit(id, t, art, preview=false, feelGain=1,roll=null,manualVel=null){
  const a = art|0;
  const manual=typeof manualVel==='number'&&Number.isFinite(manualVel),manualGain=manual?Math.max(1,Math.min(127,manualVel))/(127*0.8):1;
  if(playing&&!preview) statsToday().notes++;        // 미리듣기는 연습 타격 수에 넣지 않는다
  /* 표기 값이 **다른 소리**를 부르는 것들. 허용 악기표를 통과해야 하고, 그 소리가
     실제로 있어야 한다 — 없으면 조용히 원래 악기로 돌아간다(소리가 빠지면 안 된다) */
  const sfx = ART_SFX[a];
  const sid = (sfx && ART_OK[a] && ART_OK[a][id] && (SOUND[id+sfx] || BUFFERS[id+sfx] || SAMPLE_BANK.manifest?.variants[id+sfx])) ? id+sfx : id;
  ACTIVE_TUNING = tuningOf(id);
  if(id==='snare'&&a===ART.RIM&&SAMPLE_BANK.isSynth(id))ACTIVE_TUNING={...ACTIVE_TUNING,pitch:ACTIVE_TUNING.pitch+3};
  VOICE_T = t;                             // voice()가 정리 시각을 계산할 때 쓴다
  HIT_BUS = insBus(id);                    // 악기별 볼륨 — 이 타격의 소리는 전부 이 악기 게인을 지난다
  if(preview&&SAMPLE_BANK.isSynth(id))HIT_BUS=synthPreviewBus(HIT_BUS);
  const synthGain=(preview&&!roll?1:feelGain)*manualGain;
  if(synthGain!==1 && SAMPLE_BANK.isSynth(id)){
    const target=HIT_BUS,c=ac(),dry=c.createGain(),send=c.createGain();
    dry.gain.value=send.gain.value=synthGain;dry.connect(target.dry);send.connect(target.send);
    HIT_BUS={dry,send};releaseAfter(t,[dry,send]);
  }
  try {
    if(SAMPLE_BANK.isSynth(id))withArt(id,t,a,()=>SOUND[sid](t));
    else {
      const ghost=isGhost(a)||a===ART.GHOST;
      const rollDrum=roll&&['snare','tom1','tom2','ftom'].includes(id);
      const velocity=(ghost?0.25:rollDrum?0.58+[0.06,-0.03,0.03,-0.05][roll.stroke%4]:a===ART.ACCENT||id==='snare'&&a===ART.RIM?1:0.8)*manualGain;
      SAMPLE_BANK.play(sid,t,velocity,tuningOf(id),preview,ghost,preview&&!roll?1:feelGain,roll,manual);
    }
  }
  finally { VOICE_T = null; HIT_BUS = null; ACTIVE_TUNING = null; }
}
async function previewSound(id,art,measure=selMeasure,step=null){
  // Editing during the first bank load must not enqueue delayed notes. The
  // visible bank indicator already explains why audition is not ready yet.
  if(SAMPLE_BANK.state!=='ready'&&SAMPLE_BANK.state!=='synth')return;
  const revision=++PREVIEW_REVISION,c=ac();
  try{
    await resumeAudioContext(c);if(revision!==PREVIEW_REVISION||playing||PLAY_PENDING)return;
    SAMPLE_BANK.stopPreview();SAMPLE_BANK.cancelCandidate();stopSynthPreview();
    const value=art||ART.NORM, m=measures[measure];
    const events=(value>=ART.ROLL&&value<=ART.GBUZZ&&m&&step!==null)
      ? measureEvents(m).filter(e=>e.idx===step&&e.ids.some(ins=>ins.id===id)&&e.voice===byId[id].voice) : [];
    const start=events.find(e=>!e.rollRepeat), qd=m?qDurOf(m):0.5;
    const profile=e=>{const p=e?.rollProfiles?.[id];return p?{...p,gap:p.gapQ*qd}:null;};
    const manual=m&&step!==null&&typeof noteVelocity==='function'?noteVelocity(m,id,step):null;
    hit(id,c.currentTime+0.005,value,true,1,profile(start),manual);
    if(start)for(const event of events.filter(e=>e.rollRepeat)){
      const delay=(event.onset-start.onset)*qd*1000;
      setTimeout(()=>{
        if(revision!==PREVIEW_REVISION||playing||PLAY_PENDING||measures[measure]!==m||m[id]?.[step]!==value)return;
        hit(id,c.currentTime+0.005,value,true,event.rollGain||1,profile(event),manual);
      },delay);
    }
  }catch(error){console.warn('드럼 미리듣기를 시작하지 못했습니다:',error);}
}

if(Object.keys(SAMPLE_URLS).length) loadSamples(SAMPLE_URLS);
// Fetch only the selected real bank on boot; synth is an explicit user choice.
if(typeof fetch==='function')SAMPLE_BANK.restoreSources().catch(()=>{});

/* ===== 드럼 킷 선택 (2026-09-10) =====
   어쿠스틱(신스, 기본) / 일렉트로(80년대 드럼머신 원히트 샘플).
   **앱 전용이다** (2026-09-10 사용자 결정 — 웹에는 안 낸다). 샘플 데이터는
   kit-electro-data.js에 있고 build-app.sh가 www/ 사본의 KIT_ELECTRO_DATA 표식에만
   주입한다 — 웹 index.html은 빈 표라 설정 묶음이 숨고 462KB도 안 실린다.
   앱에서는 base64 임베드 — 서비스 워커가 없어 외부 파일이면 오프라인 첫 재생에서
   소리가 빠진다(8-11 목소리와 같은 이유). 전환 = BUFFERS 채우기/비우기가 전부다 —
   SOUND[id]가 호출 시점에 BUFFERS를 보므로 다른 코드는 몰라도 된다.
   v = 신스와 악기별 피크를 맞춘 보정 게인 — 실제 버스(리버브+컴프+리미터)를 지나
   OfflineAudioContext로 2패스 실측한 값이다. 리미터가 비선형이라 1패스로는 안 맞는다.
   킷 이름에 상표를 쓰지 말 것(메모리 tr505-license) — "일렉트로"가 이름이다.
   snareXStick·snareRim은 같은 rim 샘플을 나눠 쓴다(v만 다르다). */
const KIT_KEY = 'maidrum.kit';
const KIT_SEND = {kick:0.05, snare:0.30, hihat:0.10, hihatOpen:0.26, ride:0.30,
                  crash:0.5, tom1:0.22, tom2:0.22, ftom:0.22, snareXStick:0.10, snareRim:0.55};
const KIT_ELECTRO = {/*KIT_ELECTRO_DATA*/};
let KIT = 'acoustic';
if(Object.keys(KIT_ELECTRO).length){ try{ if(localStorage.getItem(KIT_KEY) === 'electro') KIT = 'electro'; }catch(e){} }   // 데이터가 없으면(웹) 늘 어쿠스틱
function kitBuf(d){ const b = atob(d), a = new Uint8Array(b.length); for(let i=0;i<b.length;i++) a[i] = b.charCodeAt(i); return a.buffer; }
function applyKit(){
  if(KIT === 'electro'){
    const c = ac();
    return Promise.all(Object.entries(KIT_ELECTRO).map(([id, s])=>
      BUFFERS[id] ? null : c.decodeAudioData(kitBuf(s.d))
        .then(b=>{ if(KIT === 'electro') BUFFERS[id] = b; })   // 디코드 중 되돌리면 버린다
        .catch(e=> console.warn('킷 샘플 디코드 실패:', id, e))
    ));
  }
  for(const id in KIT_ELECTRO) delete BUFFERS[id];
  return Promise.resolve();
}
if(KIT === 'electro') applyKit();

/* ================= 연습 기록 (2026-08-17) =================
   러닝앱 기록처럼 **오늘 하루 누적**을 잰다 (사용자 결정 — 드럼 연습은
   시작·끝이 뚜렷하지 않아서 자동 누적이 맞다). 이 기기의 localStorage에
   날짜별 한 칸만 쓰고, 날짜가 바뀌면 새로 시작한다. 어디로도 안 보낸다.
   시간·BPM은 벽시계로 잰다: 재생 중 1초 단위로 흘려 담고(statTick),
   BPM이 바뀌면 그 순간까지를 이전 BPM 몫으로 정산한다 — 스피드 트레이너가
   BPM을 올려도 평균이 시간 가중으로 맞다. 음표는 hit()이 재생 중일 때 센다. */
const STATS_KEY = 'maidrum.stats';
let STATS = null, _statT0 = 0, _statBpm = 0, _statSavedAt = 0;
function statsDayStr(){
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0')
       + '-' + String(d.getDate()).padStart(2,'0');
}
function statsToday(){
  const day = statsDayStr();
  if(!STATS || STATS.day !== day){
    let s = null;
    try{ s = JSON.parse(localStorage.getItem(STATS_KEY)); }catch(e){}
    if(s && s.day === day){ STATS = s; }
    else {
      /* **날짜가 넘어갔다.** 지난 날 기록을 이력에 옮기고 새로 시작한다.
         밤새 앱을 켜 둔 경우와, 껐다가 다음 날 다시 연 경우가 **같은 자리**를 지난다 —
         둘을 따로 처리하면 한쪽이 조용히 빠진다(러닝앱이 자주 틀리는 자리다). */
      if(s && s.day && s.ms > 0) histPut(s);
      STATS = {day, ms:0, bpmMs:0, min:0, max:0, notes:0};
    }
  }
  return STATS;
}

/* ── 날짜별 이력 (2026-08-17) ─────────────
   `maidrum.hist` = [{d:'2026-08-17', ms, n, bm, mn, mx}, …] 오래된 것이 앞.
   하루치가 60바이트 남짓이라 1년을 담아도 20KB다. **오늘 것도 여기 들어간다** —
   "언제 이력으로 옮기나"를 따로 정하면 반드시 한 번은 빠뜨린다. 재생을 멈출 때마다
   오늘 칸을 덮어쓰고, 날짜가 넘어가면 그 칸이 그대로 지난 날 기록이 된다. */
const HIST_KEY = 'maidrum.hist', HIST_MAX_DAYS = 400;
let HIST = null;
function histLoad(){
  if(HIST) return HIST;
  let h = null;
  try{ h = JSON.parse(localStorage.getItem(HIST_KEY)); }catch(e){}
  HIST = Array.isArray(h) ? h.filter(x => x && typeof x.d === 'string' && (x.ms|0) >= 0) : [];
  return HIST;
}
function histSave(){
  try{ localStorage.setItem(HIST_KEY, JSON.stringify(HIST)); }catch(e){}   // 꽉 차면 조용히 넘어간다
}
/* 하루치를 넣거나 덮어쓴다. STATS 모양({day,ms,bpmMs,…})을 받아 이력 모양으로 줄인다 */
function histPut(st){
  if(!st || !st.day) return;
  const h = histLoad();
  const rec = {d: st.day, ms: Math.round(st.ms)|0, n: st.notes|0,
               bm: st.ms > 0 ? Math.round(st.bpmMs / st.ms) : 0, mn: st.min|0, mx: st.max|0};
  const i = h.findIndex(x => x.d === st.day);
  if(i >= 0) h[i] = rec; else h.push(rec);
  h.sort((a,b)=> a.d < b.d ? -1 : a.d > b.d ? 1 : 0);
  if(h.length > HIST_MAX_DAYS) h.splice(0, h.length - HIST_MAX_DAYS);
  histSave();
}
function dayStrOf(dt){
  return dt.getFullYear() + '-' + String(dt.getMonth()+1).padStart(2,'0')
       + '-' + String(dt.getDate()).padStart(2,'0');
}
/* 오늘부터 뒤로 n일. 기록이 없는 날도 0으로 채워 돌려준다(막대가 빠지면 안 된다) */
function histDays(n){
  const map = {};
  histLoad().forEach(x => map[x.d] = x);
  const today = statsToday();
  map[today.day] = {d: today.day, ms: Math.round(today.ms)|0, n: today.notes|0,
                    bm: today.ms > 0 ? Math.round(today.bpmMs/today.ms) : 0,
                    mn: today.min|0, mx: today.max|0};
  const out = [];
  const base = new Date();
  for(let i = n-1; i >= 0; i--){
    const dt = new Date(base.getFullYear(), base.getMonth(), base.getDate() - i);
    const d = dayStrOf(dt);
    out.push(map[d] || {d, ms:0, n:0, bm:0, mn:0, mx:0});
  }
  return out;
}
/* 연속 일수 — **오늘이 아직 0이면 어제까지를 센다.** 아침에 앱을 열었다고
   어제까지의 연속이 0으로 보이면 그 숫자를 믿지 않게 된다 */
function histStreak(){
  const days = histDays(HIST_MAX_DAYS);
  let i = days.length - 1;
  if(days[i] && days[i].ms < 1000) i--;          // 오늘은 아직 — 어제부터 센다
  let n = 0;
  for(; i >= 0; i--){ if(days[i].ms >= 1000) n++; else break; }
  return n;
}
function histSum(n){
  return histDays(n).reduce((a, x)=>({ms: a.ms + x.ms, n: a.n + x.n}), {ms:0, n:0});
}
function statsSave(force){
  if(!STATS) return;
  const now = Date.now();
  if(!force && now - _statSavedAt < 4000) return;   // 재생 중 매초 쓰지 않는다
  _statSavedAt = now;
  try{ localStorage.setItem(STATS_KEY, JSON.stringify(STATS)); }catch(e){}
  if(force) histPut(STATS);        // 재생을 멈출 때 오늘 칸을 이력에 굳힌다
}
/* 지금까지 흐른 시간을 _statBpm 몫으로 정산하고 시계를 다시 잡는다 */
function statFlush(){
  if(!_statT0) return;
  const now = Date.now(), ms = now - _statT0;
  _statT0 = now;
  const st = statsToday();
  st.ms += ms;
  st.bpmMs += _statBpm * ms;
  if(!st.min || _statBpm < st.min) st.min = _statBpm;
  if(_statBpm > st.max) st.max = _statBpm;
  _statBpm = bpm;
  statsSave();
}
function statTick(){
  if(!_statT0) return;
  if(bpm !== _statBpm || Date.now() - _statT0 >= 1000) statFlush();
}
function fmtDur(ms){
  const s = Math.round(ms/1000), h = (s/3600)|0, m = ((s%3600)/60)|0, ss = s%60;
  return (h ? h + ':' + String(m).padStart(2,'0') : String(m))
       + ':' + String(ss).padStart(2,'0');
}
/* 합계용 — 주·월 합계에 초는 잡음이다("3:32:00"보다 "3시간 32분"이 읽힌다).
   하루치·인증샷의 큰 숫자는 그대로 fmtDur(분:초)를 쓴다 */
function fmtLong(ms){
  const m = Math.round(ms/60000), h = (m/60)|0, mm = m%60;
  return h ? (h + t('시간') + (mm ? ' ' + mm + t('분') : '')) : (m + t('분'));
}
function certSumRefresh(){
  const el2 = document.getElementById('certSum');
  if(!el2) return;
  const st = statsToday();
  el2.textContent = st.ms < 1000 ? t('오늘 기록 없음')
    : t('오늘') + ' ' + fmtDur(st.ms) + ' · ' + st.notes.toLocaleString() + t('타');
}

/* 연습 패널의 '오늘 기록' — 마이크 채점이 있던 자리 (2026-08-23).
   **인증샷(`statLines`)과 같은 값을 같은 순서로** 낸다. 두 곳이 어긋나면
   "미리보기가 틀렸다"가 되고, 그건 미리보기가 없느니만 못하다.
   평균 BPM은 저장해 둔 값이 아니라 `bpmMs/ms`다 — 시간 가중이라
   스피드 트레이너가 템포를 올려도 맞다(8-18장). */
function todayRefresh(){
  const el = document.getElementById('tdTime');
  if(!el) return;                              // 폰에는 연습 패널이 없다
  const st  = statsToday();
  const avg = st.ms > 0 ? Math.round(st.bpmMs / st.ms) : 0;
  const put = (id, v)=>{ const e = document.getElementById(id); if(e) e.textContent = v; };
  put('tdTime',   fmtDur(st.ms));
  put('tdNotes',  st.notes.toLocaleString());
  put('tdStreak', histStreak());
  put('tdAvg',    avg || '—');
  put('tdMax',    st.max || '—');
  put('tdMin',    st.min || '—');
}

/* ================= 시퀀서 ================= */
let curM = 0, curS = 0, nextT = 0, timer = null, playStart = 0;
let rangeStart = 0, rangeEnd = 0, preSteps = 0, practiceRun = false;
let loopCount = 0;
const playBtn = document.getElementById('playBtn');
const ICON_PLAY = '<svg class="icn" viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 5.6v12.8L19 12z" fill="currentColor"/></svg>';
const ICON_STOP = '<svg class="icn" viewBox="0 0 24 24" aria-hidden="true"><rect x="6.8" y="6.8" width="10.4" height="10.4" rx="2.6" fill="currentColor"/></svg>';
function setPlayIcon(on){
  playBtn.innerHTML = on ? ICON_STOP : ICON_PLAY;
  playBtn.setAttribute('aria-label', on ? '정지' : '재생');
  // 악보 탭 재생 알약도 같은 상태를 입는다 — 아이콘 갱신은 전부 이 함수 하나를 탄다
  const pp = document.getElementById('pillPlay');
  if(pp){ pp.innerHTML = on ? ICON_STOP : ICON_PLAY; pp.setAttribute('aria-label', on ? '정지' : '재생'); }
  window.dispatchEvent(new Event('ddakung-repeat-change'));
}


function beatDur(){ return 60/bpm; }

/* ── BPM이 가리키는 음표 (2026-08-19) ─────────────────────
   **드러머가 "6/8에 100"이라고 하면 점4분이 분당 100이다.** 4분음표가 아니다.
   여기를 4분음표로 고정해 두면 6/8이 4/4보다 3분의 1만큼 느리게 들린다 —
   실제로 그렇게 나왔고 "느리다"는 말을 들었다.

   규칙은 기보 관례 그대로다.
   - **박 길이가 모두 같으면 BPM = 그 박 하나.** 4/4는 4분, 6/8·12/8은 점4분.
     메트로놈이 분당 정확히 BPM번 친다
   - **박 길이가 섞이면(5/8=2+3, 7/8=2+2+3) BPM = 분모 음표(8분).**
     이런 박자는 8분음표가 일정하고 박이 2·3으로 묶이는 것이라, 박에 BPM을 걸면
     한 마디 안에서 템포가 흔들린다

   반환값은 **BPM 한 칸이 4분음표 몇 개인가**다. 4/4에서 1이라 예전과 같다. */
function tempoUnitQ(m){
  const g = groupsOf(m), [, den] = tsOf(m);
  /* 분모 4는 **항상 4분음표**다. 2박 3연음으로 두 박을 묶은 마디([2,2])에서
     "박 길이가 모두 같다"로 BPM이 2분음표가 되면 그 마디만 두 배 빨라진다 —
     묶기는 표기·격자의 일이지 템포의 일이 아니다 */
  if(den === 4) return 1;
  const even = g.every(v => v === g[0]);
  return (even ? g[0] : 1) * 4 / den;
}
/* 4분음표 하나의 실제 길이(초). 재생·재생선·예비박이 전부 이 잣대를 쓴다 */
function qDurOf(m){ return beatDur() / tempoUnitQ(m); }

/* 마디 하나의 이벤트를 **시간 순으로** 늘어놓는다.
   손과 발이 서로 다른 분할을 가지면 칸이 하나의 줄로 안 세어지므로,
   각 성부의 칸을 박 위치(실수)로 바꿔 합친 뒤 정렬한다.
   같은 시각에 손·발이 겹치면 둘 다 그 자리에 남는다 — 스케줄만 두 번 될 뿐 소리는 정상. */
function grooveOnset(m,b,pos){
  if(!GROOVE.bounceEnabled || GROOVE.bounce===0)return pos;
  const q=beatQ(m,b), divisions=['hand','foot'].filter(voice=>{
    const off=beatOffset(m,voice,b),n=divCells(divOf(m,b,voice));
    return INSTR.some(ins=>ins.voice===voice && m[ins.id].slice(off,off+n).some(Boolean));
  }).map(voice=>divOf(m,b,voice));
  // One time map per beat keeps simultaneous limbs together. Tuplets, mixed
  // subdivisions and compound beats already have their own spacing.
  if(!divisions.every(d=>d===1||d===2||d===4) || ![0.5,1,2,4].includes(q))return pos;
  const d=Math.max(1,...divisions);if(d===1)return pos;
  // A written eighth / sixteenth has a fixed quarter-note duration even when
  // notation groups two quarters into one display beat. Never warp a partial
  // pair across a beat boundary (e.g. eighth feel inside a half-quarter beat).
  const pair=2/GROOVE.bounceSubdivision;
  if(q<pair || Math.abs(q/pair-Math.round(q/pair))>1e-8)return pos;
  const start=beatStartQ(m,b),within=pos-start;
  const pairStart=Math.floor((within+1e-9)/pair)*pair,phase=(within-pairStart)/pair;
  const split=0.5+GROOVE.bounce/600; // 50:50 through 66.7:33.3, fixed pair endpoints.
  const warped=phase<=0.5?phase*2*split:split+(phase-0.5)*2*(1-split);
  return start+pairStart+warped*pair;
}
function grooveGainFor(m,e,id){
  if(!GROOVE.nuanceEnabled || GROOVE.nuance===0)return 1;
  // Hash score position, never audio time / loop count / Math.random. The same
  // stroke keeps its balance against explicit ghosts and accents every loop.
  let hash=2166136261;
  for(const char of id+':'+e.b+':'+e.pos.toFixed(8))hash=Math.imul(hash^char.charCodeAt(0),16777619)>>>0;
  const phase=(e.pos-beatStartQ(m,e.b))/beatQ(m,e.b);
  const shape=phase<1e-8?0.08:Math.abs(phase-0.5)<1e-8?-0.045:-0.08;
  return 1+(shape+((hash%1001)/1000-0.5)*0.08)*GROOVE.nuance/100;
}
/* A slash halves the written note into repeated strokes. Dotted notes retain
   their dotted span; buzz is a soft, dense press-roll approximation from hits. */
function rollStrokePlan(art,durationQ,value,quarterSeconds){
  const kind=rollPart(art),slashes=ROLL_SLASH[kind]||0;
  if((!slashes&&kind!==ART.BUZZ)||!(durationQ>0)||!(quarterSeconds>0))return [];
  const nominal=(value.half?2:Math.pow(2,-value.flags))*(value.dot?1.5:1);
  const interval=kind===ART.BUZZ?0.022/quarterSeconds
    :Math.pow(2,-value.flags-slashes)*(durationQ/nominal);
  const gap=Math.max(interval,0.012/quarterSeconds),out=[];
  for(let n=1;n<512&&n*gap<durationQ-1e-8;n++){
    out.push({offset:n*gap,gain:kind===ART.BUZZ?[0.58,0.74,0.52,0.69][(n-1)%4]:[0.78,0.94,0.74,0.9][(n-1)%4]});
  }
  return out;
}
function expandRollEvents(m,events){
  const repeated=[];
  for(const event of events){
    const rolls=event.ids.filter(ins=>{const v=m[ins.id]?.[event.idx]|0;return v>=ART.ROLL&&v<=ART.GBUZZ&&!tieOf(m,ins.id,event.idx);});
    if(!rolls.length)continue;
    const d=divOf(m,event.b,event.voice),q=beatQ(m,event.b),sg=divSegs(d).find(s=>event.k>=s.k0&&event.k<s.k0+s.n);
    const next=events.find(e=>e.voice===event.voice&&e.b===event.b&&e.k>event.k);
    const end=Math.min(next?next.k:divCells(d),sg.k0+sg.n),span=end-event.k;
    const value=divSegs(d).length===1?noteValue(span,d,q):noteValue(span,sg.n,q*sg.fl);
    const onsets=events.filter(e=>e.voice===event.voice&&e.b===event.b);
    if(divSegs(d).length===1&&onsets.length===1&&event.k===0&&span===divCells(d)){
      value.flags=0;value.dot=compoundBeat(m,event.b);if(q>=2){value.half=true;value.dot=false;}
    }
    const duration=(cellFrac(d,end)-cellFrac(d,event.k))*q;
    const nextOnset=next&&next.k===end?next.onset:grooveOnset(m,event.b,event.pos+duration);
    for(const ins of rolls){
      const strokes=rollStrokePlan(m[ins.id][event.idx],duration,value,qDurOf(m)),gapQ=strokes[0]?.offset||duration;
      event.rollProfiles={...event.rollProfiles,[ins.id]:{gapQ,stroke:0}};
      for(const [index,stroke] of strokes.entries()){
      const onset=event.onset+stroke.offset;
      if(onset>=nextOnset-1e-8)break;
      repeated.push({...event,pos:event.pos+stroke.offset,onset,ids:[ins],rollRepeat:true,rollGain:stroke.gain,rollProfiles:{[ins.id]:{gapQ,stroke:index+1}}});
      }
    }
  }
  return events.concat(repeated).sort((a,b)=>a.onset-b.onset);
}
function measureEvents(m){
  const ev = [];
  ['hand','foot'].forEach(voice=>{
    const ids = INSTR.filter(i=>i.voice===voice);
    for(let b=0; b<beatCount(m); b++){
      const d = divOf(m, b, voice), off = beatOffset(m, voice, b), dn = divCells(d);
      for(let k=0; k<dn; k++){
        const idx = off + k;
        if(!ids.some(i=>m[i.id][idx])) continue;   // 소리 나는 칸만 예약한다
        // pos는 **4분음표 단위**다. 박마다 길이가 다를 수 있어 박 번호로는 못 센다
        const pos=beatStartQ(m,b)+cellFrac(d,k)*beatQ(m,b);
        ev.push({pos,onset:grooveOnset(m,b,pos),voice,b,k,idx,ids});
      }
    }
  });
  ev.sort((a,b)=> a.onset - b.onset);
  return ev.some(e=>e.ids.some(ins=>{const v=m[ins.id]?.[e.idx]|0;return v>=9&&v<=16;}))?expandRollEvents(m,ev):ev;
}

let evList = null, evIdx = 0, mStartT = 0, lastClickBeat = -1;
function resetEvents(t){ evList = null; evIdx = 0; mStartT = t; lastClickBeat = -1; }

/* ── 재생선 시간표 (2026-08-14) ──────────────
   커서를 매끄럽게 움직이려면 "지금 몇 번째 마디의 몇 박째인가"를 **아무 때나**
   물을 수 있어야 한다. 그런데 `curM`/`mStartT`는 **예약기(tick)의 위치**라
   실제 시각보다 LOOK(0.12초)만큼 앞서 있다 — 그걸 그대로 읽으면 커서가 미리 간다.
   그래서 마디가 시작할 때마다 `{t0, mi}`를 남기고, 그리는 쪽은 **오디오 시계**로
   자기가 있을 칸을 찾는다. 예약기와 그리기가 서로를 안 기다린다.

   길이는 안 담는다 — BPM 슬라이더가 재생 중에 움직이면 `tick()`도 매번
   `beatDur()`를 다시 보므로, 여기서 굳혀 두면 둘이 어긋난다.

   **`next`는 여기서 같이 넣어야 한다.** 재생선은 마지막 박에서 다음 마디의 첫 박을
   향해 가는데(`playheadX`), 그 목표를 "다음 세그먼트가 들어왔는가"로 알아내면
   **예약기가 다음 마디를 예약하는 순간 목표가 바뀌어 선이 튄다** — 실측 14px,
   마디마다 한 번(2026-08-14에 실제로 잡았다). `order`는 재생을 시작할 때
   이미 다 펼쳐져 있으므로 여기서 바로 꺼내면 그 사이가 없다. */
let curSegs = [];
function nextPlayed(p){
  if(p + 1 < order.length) return order[p + 1];
  return looping ? order[0] : -1;
}
function pushSeg(mi, t0, next){
  curSegs.push({t0, mi, next, nb: beatCount(measures[mi] || {})});
  if(curSegs.length > 6) curSegs.shift();   // 뒤 두어 개만 있으면 된다
}

/* ── 연주 순서 (2026-08-13) ────────────────
   도돌이를 **펼쳐서** 실제로 칠 마디 번호를 늘어놓는다. `[0,1,2,1,2,3…]`
   시퀀서는 이 배열을 걷기만 한다 — `curM++`이 아니라 `curP++`이다.

   **왜 배열로 먼저 펼치나.** 재생 중에 도돌이를 해석하면 상태가 시퀀서 안에 섞인다.
   지금 몇 회차인지, 어느 괄호를 건너뛸지가 오디오 예약 루프 한가운데에 들어오는 것이라
   버그가 나면 소리로만 드러난다(재생은 이미 한 번 크게 사고 난 자리다).
   펼쳐 두면 **순서 자체를 눈으로 보고 시험할 수 있다.**

   규칙:
   - `rep.a`가 도돌이 시작. 없으면 구간 맨 앞에서 돌아온다(악보 관례)
   - `rep.b`에서 `times`번 될 때까지 시작으로 되돌아간다 (기본 2회)
   - `end`(1·2번 괄호)는 **그 회차의 괄호만** 친다. 1회차엔 1번, 2회차엔 2번
   - 되돌아가서 만난 `rep.a`는 회차를 초기화하지 않는다(`jumped`).
     안 그러면 시작 마디에 `rep.a`가 있을 때 영원히 1회차라 무한 반복이다

   ── 세뇨·코다·D.S. (2026-08-17) ──
   기호를 만나면 두 회차로 나뉜다. **본 회차**와, D.S./D.C.로 되돌아간 **다 카포 회차**.
   - `ds`가 있는 마디를 마치면 **세뇨 마디로**, `dc`면 **맨 앞으로** 되돌아간다.
     되돌아가기는 **곡 전체에서 한 번만** — 두 번째 ds/dc는 무시한다(무한 반복 방지)
   - 되돌아간 회차에서만: `tocoda`를 마치면 **그 뒤의 `coda` 마디로** 건너뛰고,
     `fine`을 마치면 **거기서 끝**낸다. 본 회차에서는 둘 다 그냥 지나간다(악보 표준)
   - **되돌아간 회차에서는 도돌이를 다시 안 돈다**(악보 표준 — 모든 악보 앱이 이렇다).
     1·2번 괄호는 마지막 회차 것(2번)을 친다
   - 세뇨 없는 D.S.는 맨 앞으로(D.C.처럼). 뒤에 코다가 없는 to Coda는 무시한다.
     **구간 반복이 걸려 있으면 기호도 그 구간 안에서만 찾는다** — 구간 밖으로 안 나간다

   중첩 도돌이는 여전히 안 된다 — 가장 최근 `rep.a` 하나만 기억한다.
   실제 악보에서도 중첩은 드물고 뜻이 애매하다. */
const ORDER_MAX = 4000;
function playOrder(a, b){
  const lo = Math.max(0, a|0), hi = Math.min(measures.length - 1, b|0);
  const out = [], taken = {};
  let i = lo, start = lo, pass = 1, jumped = false, guard = 0;
  let recap = false;                       // D.S./D.C.로 되돌아간 회차인가
  let navUsed = false;                     // 되돌아가기는 한 번만
  const findNav = (kind, from) => {
    for(let j = from; j <= hi; j++) if((measures[j] || {}).nav === kind) return j;
    return -1;
  };
  while(i <= hi && guard++ < ORDER_MAX && out.length < ORDER_MAX){
    const m = measures[i] || {};
    if(!recap && m.rep && m.rep.a && !jumped){ start = i; pass = 1; }
    jumped = false;
    if(m.end){
      if(!recap && m.end !== pass){ i++; continue; }   // 이번 회차의 괄호가 아니다
      if(recap && m.end === 1){ i++; continue; }        // 다 카포 회차는 2번 괄호로
    }
    out.push(i);
    /* 도돌이가 먼저다 — D.S.는 그 마디의 반복을 **다 마친 뒤에** 탄다(악보 표준).
       rep.b의 continue가 나가고, 마지막 회차에만 아래 nav 검사에 닿는다. */
    if(!recap && m.rep && m.rep.b){
      const times = Math.max(2, Math.min(8, m.rep.times || 2));
      taken[i] = (taken[i] || 0) + 1;
      if(taken[i] < times){ i = start; pass++; jumped = true; continue; }
    }
    if(recap){
      if(m.nav === 'fine') break;
      if(m.nav === 'tocoda'){
        const c = findNav('coda', i + 1);
        if(c >= 0){ i = c; continue; }
      }
    } else if(!navUsed && (m.nav === 'ds' || m.nav === 'dc')){
      navUsed = true; recap = true;
      const sg = (m.nav === 'ds') ? findNav('segno', lo) : lo;
      i = (sg >= 0) ? sg : lo;
      continue;
    }
    i++;
  }
  return out.length ? out : [lo];
}
let order = [], curP = 0;

/* 메트로놈 한 박. **재생 중 클릭은 전부 여기를 통한다** —
   마디 첫 박과 예비박 첫 박, 두 군데가 각자 소리를 고르면 언젠가 어긋난다
   (`metOn`/`cinOn`이 두 군데에 흩어져 있어서 실제로 그런 적이 있다).

   **박 번호를 받는다(0부터).** 예전엔 `accent` 참·거짓만 받았는데, 목소리가 들어오면서
   "몇 번째 박인가"를 알아야 하게 됐다. 첫 박 악센트는 `b === 0`으로 여기서 판단한다 —
   부르는 쪽이 판단해서 넘기면 두 군데가 또 갈라진다. */
const MET_KEY = 'maidrum.met';
let MET_VOICE = false;                    // false 클릭 / true 목소리
try{ MET_VOICE = localStorage.getItem(MET_KEY) === 'voice'; }catch(e){}
function metClick(t, b){
  /* 목소리는 **원·투·쓰리·포 네 개뿐**이다. 5박 이상이면 다섯째부터 클릭으로 떨어진다 —
     4로 나눈 나머지를 쓰면 5/4가 "원 투 쓰리 포 **원**"이 되어 마디가 어디서
     끊기는지 거꾸로 헷갈린다. 6/8은 2박이라 "원 투"로 정확히 맞는다.
     목소리를 못 펴는 옛 브라우저에서도 같은 길로 떨어진다 */
  /* 목소리는 **언어를 안 탄다** (2026-08-22 정정). 음원이 ElevenLabs `Dylan`으로 녹음한
     **영어 숫자 one·two·three·four**다(8-11장). 문서에 `원·투·쓰리·포`로 적혀 있는 건
     그 영어 숫자를 한글로 옮겨 적은 것 — 한국 드러머가 세는 말이 곧 영어 숫자라서다.
     한때 영어에서 클릭으로 떨어뜨리게 해 놨었는데, 그건 표기만 보고 "한국어 녹음"이라
     단정한 실수였다. **두 언어에서 그대로 쓴다.** */
  if(MET_VOICE && (b|0) < VOICE_B64.length && playVoice(b, t)) return;
  SOUND[(b|0) === 0 ? 'clickHi' : 'click'](t);
}

/* 예약 루프.
   **셋 중 가장 이른 것**을 하나씩 처리한다 — 다음 음표 / 다음 메트로놈 클릭 / 마디 끝.
   이 구조여야 하는 이유:
   - 음표만 보고 돌면 **음표 없는 마디**를 순식간에 소비해 버린다.
     그러면 빈 마디에서 메트로놈이 안 울리고, 마지막 마디가 빈 경우 재생이 일찍 끝난다
   - 마디 끝을 후보에 넣어야 마디가 **실제로 지나간 뒤에** 다음 마디로 넘어간다
   둘 다 2026-08-13 프리뷰에서 실제로 겪은 증상이다. */
/* 예비박은 **그 마디의 박 수**만큼. 3/4 곡에서 넷을 세면 첫 음이 어긋나 들린다 */
function countInBeats(){
  // 박자표는 지금 곡 전체가 하나다. 마디마다 달라지면 시작 마디를 봐야 한다.
  // 클릭 수 기준이다 — 분모 4는 4분음표 수(묶어도 넷), 분모 8은 박 수
  return clickCount(measures[0]);
}
function tick(){
  statTick();                        // 연습 기록 — BPM 변화·경과 시간을 정산한다
  const c = ac();
  const LOOK = 0.12;                 // 이만큼 앞을 미리 예약한다
  let guard = 0;
  while(guard++ < 500){
    if(preSteps > 0){                // 카운트인 — 박 단위
      if(nextT >= c.currentTime + LOOK) return;
      /* 예비박도 박 번호를 센다. 남은 수로 뒤집는다 — preIn개 중 첫 번째가 preSteps === preIn.
         **박 길이도 그 마디를 따른다** — 6/8이면 점4분 둘을 세야 곡과 안 어긋난다 */
      const pm = measures[curM] || measures[0];
      const pb = clickCount(pm) - preSteps;
      metClick(nextT, pb);
      preSteps--;
      // 다음 클릭까지의 길이. 마지막 예비박은 마디 끝까지 — 박이 시간을 다 덮으므로 같다
      nextT += qDurOf(pm) * ((preSteps > 0 ? clickQ(pm, pb + 1) : measureQ(pm)) - clickQ(pm, pb));
      if(preSteps === 0){ resetEvents(nextT); pushSeg(curM, nextT, nextPlayed(curP)); }
      continue;
    }
    /* 순서 배열은 재생을 **시작할 때 한 번** 뜬 사진이다. 그 사이에 마디가 지워지면
       가리키는 곳이 사라진다 — 옛 코드는 매 틱 `measures.length-1`을 다시 봐서
       저절로 멈췄는데, 배열로 바꾸면서 그 안전장치가 없어졌다.
       재생 중에도 도구 줄은 살아 있으니(편집 모드) 실제로 닿는 경로다. */
    const m = measures[curM];
    if(!m){ stopPlay(true); return; }
    if(!evList){ evList = measureEvents(m); evIdx = 0; }
    const bd = qDurOf(m);                      // bd = 4분음표 하나의 길이

    const tEv    = evIdx < evList.length ? mStartT + evList[evIdx].onset * bd : Infinity;
    const wantCl = metOn() && (lastClickBeat + 1 < clickCount(m));
    /* 메트로놈은 **클릭 시간표(clickQ)**를 따른다 — 분모 4는 4분음표마다(2박 3연음으로
       박을 묶어도 정박 그대로), 6/8이면 점4분마다 둘 (여섯이 아니다) */
    const tCl    = wantCl ? mStartT + clickQ(m, lastClickBeat + 1) * bd : Infinity;
    const tEnd   = mStartT + measureQ(m) * bd;

    const t = Math.min(tEv, tCl, tEnd);
    if(t >= c.currentTime + LOOK){ nextT = t; return; }   // 아직 예약할 때가 아니다

    // 메트로놈이 먼저 (같은 시각이면 클릭 → 음표 순서로 처리된다)
    if(t === tCl){
      // 마디의 첫 박이 0번. 도돌이로 되돌아와도 마디마다 다시 0부터다
      if(t >= c.currentTime - 0.01) metClick(t, lastClickBeat + 1);
      lastClickBeat++;
      continue;
    }
    if(t === tEv){
      const e = evList[evIdx];
      let any = false;
      e.ids.forEach(ins=>{
        const v = m[ins.id][e.idx]|0;
        // 붙임줄로 이어진 음은 **다시 치지 않는다** — 표기 표준 그대로다
        /* 너무 늦은 음은 **버린다** (2.1) — 메인 스레드가 밀려 예약 시각이 이미 30ms 넘게 지났으면
           지금 치는 순간 앞뒤 음과 몰려 "버벅"으로 들린다. 메트로놈 클릭(-0.01)과 같은 원칙이다 */
        if(v && !tieOf(m, ins.id, e.idx) && t >= c.currentTime - 0.03){
          const roll=e.rollProfiles?.[ins.id];
          const manual=typeof noteVelocity==='function'?noteVelocity(m,ins.id,e.idx):null;
          hit(ins.id, t, v, false, grooveGainFor(m,e,ins.id)*(e.rollGain||1),roll?{...roll,gap:roll.gapQ*qDurOf(m)}:null,manual); any = true;
          /* 앞꾸밈음 — 본음 **앞**에 여린 타를 끼운다.
             간격은 **고정 ms**다(BPM 비례가 아니다). 실제 드러머의 플램 간격은
             템포를 따라 늘어나지 않는다 — 손 높이가 정하는 값이라 거의 일정하다.
             예약은 늘 LOOK(0.12초) 앞이라 앞당겨도 미래지만, 재생 첫 음만
             오디오 시계와 붙어 있어 한 번 막아 준다. */
          const o = e.rollRepeat?0:ornOf(m, ins.id, e.idx);
          if(o){
            const lead = ORN_LEAD[o] || 0.028;
            const n = Math.max(1, Math.min(3, o|0));   // 플램 1 · 드래그 2 · 러프 3
            const gIns = ornInsOf(m, ins.id, e.idx);   // 꾸밈 악기가 다르면 그 소리로
            for(let g=0; g<n; g++){
              const gt = t - lead + g*(lead/n);
              if(gt > c.currentTime + 0.002) hit(gIns, gt, ART.GHOST, false, grooveGainFor(m,e,gIns),null,manual);
            }
          }
        }
      });
      if(!e.rollRepeat)scheduleVisual(curM, e.voice, e.b, e.k, e.pos, t);
      evIdx++;
      nextT = t + 1e-4;
      continue;
    }
    // Reaching the end of the lookahead window is not audible completion.
    // Keep the final queued roll strokes alive until the audio clock arrives.
    if(curP+1>=order.length&&!looping&&c.currentTime<tEnd){nextT=tEnd;return;}
    /* 마디가 끝났다 — **연주 순서의 다음 칸**으로. `curM++`이 아니다.
       도돌이가 걸려 있으면 여기서 마디 번호가 뒤로 돌아간다 */
    nextT = tEnd; mStartT = tEnd;
    resetEvents(tEnd);
    curP++;
    if(curP >= order.length){
      if(practiceRun) onCycleEnd(tEnd);
      if(looping){ curP = 0; }
      else { stopPlay(true); return; }
    }
    curM = order[curP];
    pushSeg(curM, tEnd, nextPlayed(curP));
  }
}
/* 메트로놈·예비박은 두 군데에 있다 —
   연습 모드의 체크박스와 독의 버튼(그냥 재생용).
   연습 중에는 연습 쪽 체크박스가 우선한다. */
let metMode = 0;                 // 0 꺼짐 / 1 메트로놈 / 2 메트로놈+예비박
/* 세 문구는 **쓸 때** t()로 옮긴다 — 표는 한국어로 둔다(열쇠가 곧 한국어다) */
const MET_TITLE = ['메트로놈 — 꺼짐. 누르면 박을 들려줍니다',
                   '메트로놈 켜짐. 한 번 더 누르면 예비박까지',
                   '메트로놈 + 예비박 — 재생 전에 한 마디를 세어 줍니다'];
function metOn(){
  if(practiceRun){ const e = document.getElementById('metOn'); return e ? e.checked : false; }
  return metMode >= 1;
}
function cinOn(){ return metMode === 2; }
(function initMetToggle(){
  const mb = document.getElementById('metBtn');
  const sync = ()=>{
    mb.classList.toggle('on', metMode >= 1);
    mb.classList.toggle('with-cin', metMode === 2);
    mb.setAttribute('aria-pressed', metMode >= 1);
    mb.title = t(MET_TITLE[metMode]);
    mb.setAttribute('aria-label', mb.title);
  };
  mb.onclick = ()=>{ metMode = (metMode + 1) % 3; sync(); };
  sync();
})();
/* 재생 커서 컬럼.
   예전엔 16분음표마다 querySelectorAll로 셀 128개를 훑어 toggle 했다.
   메인 스레드가 밀리면 아이폰에서는 오디오 렌더까지 같이 밀리므로,
   바뀐 두 컬럼만 건드린다 */
/* 성부마다 칸 수가 달라져서 "s번째 칸"이라는 전역 인덱스가 더 이상 없다.
   손과 발을 따로 잡아 두고 각자 진행시킨다 — 폴리에서는 실제로 따로 움직인다 */
let cellsByPos = null, lastCell = {hand:'', foot:''};
function cacheCells(){
  cellsByPos = {hand:{}, foot:{}};
  gridEl.querySelectorAll('.cell').forEach(c=>{
    const key = (c.dataset.measure ?? selMeasure) + ':' + c.dataset.b + ':' + c.dataset.k;
    const bag = cellsByPos[c.dataset.v];
    (bag[key] || (bag[key] = [])).push(c);
  });
  lastCell = {hand:'', foot:''};
}
function setPlayCell(voice, b, k, mi = selMeasure){
  if(!cellsByPos) cacheCells();
  const key = (b<0) ? '' : (mi + ':' + b + ':' + k);
  if(key === lastCell[voice]) return;
  const bag = cellsByPos[voice] || {};
  (bag[lastCell[voice]] || []).forEach(c=>c.classList.remove('playcol'));
  (bag[key] || []).forEach(c=>c.classList.add('playcol'));
  lastCell[voice] = key;
}
function clearPlayCells(){ setPlayCell('hand',-1,0); setPlayCell('foot',-1,0); }

/* 그리드 칸 하이라이트만 여기서 한다. **악보 커서는 더 이상 여기서 안 움직인다** —
   음표마다 setTimeout으로 옮기면 커서가 음표에서 음표로 순간이동한다(음표가 없는
   마디에서는 아예 멈춘다). 아래 `cursorLoop()`가 오디오 시계로 매 프레임 그린다. */
function scheduleVisual(mi, voice, b, k, pos, t){
  const delay = Math.max(0,(t - ac().currentTime)*1000);
  setTimeout(()=>{
    if(!playing) return;
    setPlayCell(voice, b, k, mi);
  }, delay);
}

/* ── 재생선을 매 프레임 그린다 (2026-08-14) ────
   x는 `playheadX`가 앵커 사이를 시간으로 이어 준다. 여기서 하는 일은
   "지금 어느 마디의 몇 박째인가"를 시간표에서 찾아 넘기는 것뿐이다.

   - **오디오 시계(`ac().currentTime`)를 쓴다.** `performance.now()`로 재면
     소리와 선이 서서히 벌어진다 — 둘이 다른 시계다
   - 0.2px 미만이면 안 쓴다. 폰에서 매 프레임 SVG 속성을 만지면 메인 스레드가
     밀리고, 그러면 [[오디오까지 같이 밀린다]]
   - 다음 마디 세그먼트가 아직 안 들어왔으면 마디 끝에서 **기다린다**.
     넘겨 그리면 다음 줄이 시작되기 전에 선이 먼저 날아간다 */
/* ── 출력 지연 보정 (2026-09-10) ─────────────────────────────
   `ac().currentTime`은 **샘플이 출력 장치로 넘어가는 시각**이지, 스피커에서
   나오는 시각이 아니다. 지금 들리는 소리는 `currentTime - outputLatency`에
   넘어간 것이다. iOS·데스크톱은 이 값이 10ms 안팎이라 눈에 안 띄지만
   **안드로이드 웹뷰는 100ms를 예사로 넘고 에뮬레이터는 더 크다** —
   그만큼 소리가 커서보다 늦게 들린다("박자가 밀린다").

   플랫폼 분기가 아니다. 지연이 작은 곳에서는 0이라 아무 일도 안 일어난다.
   0.5초를 넘는 값은 믿지 않는다(측정이 깨진 것) — 그때 보정하면 커서가
   화면 밖으로 튄다. */
let AUDIO_LAT = 0;
function refreshAudioLat(){
  const c = ac();
  const o = (typeof c.outputLatency === 'number' && isFinite(c.outputLatency)) ? c.outputLatency : 0;
  const b = (typeof c.baseLatency   === 'number' && isFinite(c.baseLatency))   ? c.baseLatency   : 0;
  const v = o || b;
  AUDIO_LAT = (v > 0.02 && v < 0.5) ? v : 0;
  return AUDIO_LAT;
}
let curRAF = 0, lastCurX = -1e9, lastCurTop = -1e9;
function cursorLoop(){
  curRAF = 0;
  if(!playing) return;
  curRAF = requestAnimationFrame(cursorLoop);

  const now = ac().currentTime - AUDIO_LAT;
  let i = -1;
  for(let j = curSegs.length - 1; j >= 0; j--) if(now >= curSegs[j].t0){ i = j; break; }
  if(i < 0) return;                       // 아직 예비박 — 선을 안 낸다

  const seg = curSegs[i];
  if(typeof ensureScorePage==='function'&&ensureScorePage(seg.mi)){lastCurX=-1e9;lastCurTop=-1e9;}
  const L = slotXCache[seg.mi];
  if(!L) return;
  const nx  = seg.next >= 0 ? slotXCache[seg.next] : null;
  // 같은 줄 바로 오른쪽일 때만 다음 마디 첫 박까지 잇는다
  const nextX0 = (nx && nx.top === L.top && nx.x0 > L.x0) ? nx.x0 : null;
  /* 흐른 시간은 **4분음표 단위**로 나온다. 박마다 길이가 다를 수 있으므로
     (6/8의 박은 점4분) 박 번호로 바꿔서 넘긴다. 4/4에서는 값이 같다 */
  const beat = Math.min(seg.nb, beatAtQ(measures[seg.mi], (now - seg.t0) / qDurOf(measures[seg.mi])));
  /* 이 줄이 늘어나 있으면 그 배수로 계산해야 커서가 음표 위에 선다.
     **쓰고 반드시 되돌린다** — 안 되돌리면 다음 렌더가 통째로 늘어난다 */
  const prevMul = ROW_MUL;
  ROW_MUL = L.mul || 1;
  const x = playheadX(L.x0, beat, seg.nb, nextX0, measures[seg.mi],
                      seg.next >= 0 ? measures[seg.next] : null);
  ROW_MUL = prevMul;

  if(seg.mi !== cursorLoop.mi){ cursorLoop.mi = seg.mi; scrollScoreTo(seg.mi); }

  const cur = document.getElementById('cursor');
  if(!cur) return;
  if(Math.abs(x - lastCurX) >= 0.2){
    lastCurX = x;
    cur.setAttribute('x1', x); cur.setAttribute('x2', x);
  }
  if(L.top !== lastCurTop){
    lastCurTop = L.top;
    cur.setAttribute('y1', L.top-20); cur.setAttribute('y2', L.top+4*LG+20);
    cur.setAttribute('stroke-dasharray','');
    cur.setAttribute('opacity', 0.85);
  }
}
function startCursorLoop(){
  syncCurOverlay();           // 줄바꿈·크기 변화 뒤에도 악보와 겹치게
  refreshAudioLat();          // 기기·경로가 바뀌면 값도 바뀐다 — 재생마다 다시 읽는다
  curSegs = []; lastCurX = -1e9; lastCurTop = -1e9; cursorLoop.mi = -1;
  if(!curRAF) curRAF = requestAnimationFrame(cursorLoop);
}
function stopCursorLoop(){
  if(curRAF) cancelAnimationFrame(curRAF);
  curRAF = 0; curSegs = [];
}
async function startPlay(opts){
  const request=++PLAY_REQUEST;
  if(playing)return;
  PLAY_PENDING=true;notifyAudioOutput();window.ddakungAudio.stopPreview();
  const c=ac();
  try{await resumeAudioContext(c);await SAMPLE_BANK.ready();if(c.state&&c.state!=='running')throw Error('오디오 시작이 차단되었습니다. 다시 재생을 눌러 주세요.');}
  catch(error){if(request===PLAY_REQUEST){PLAY_PENDING=false;notifyAudioOutput();window.dispatchEvent(new CustomEvent('ddakung-audio-error',{detail:error.message}));}return;}
  if(request!==PLAY_REQUEST)return;
  PLAY_PENDING=false;
  if(window.metroStop) window.metroStop();   // 메트로놈 탭 시계와 겹치면 안 된다
  if(window.ytPause) window.ytPause();       // 카피 탭 영상도 — 악보 소리와 겹치면 둘 다 안 들린다
  practiceRun = !!(opts && opts.practice);
  if(practiceRun){
    rangeStart = clampM(+document.getElementById('rngStart').value - 1);
    rangeEnd   = clampM(+document.getElementById('rngEnd').value - 1);
    if(rangeEnd < rangeStart) rangeEnd = rangeStart;
    preSteps = document.getElementById('countIn').checked ? countInBeats() : 0;
    curM = rangeStart; loopCount = 0;
  } else if(opts && opts.one != null){
    // 더블탭 — 그 마디만 (반복이 켜져 있으면 계속 돈다)
    rangeStart = rangeEnd = clampM(opts.one);
    preSteps = cinOn() ? countInBeats() : 0; curM = rangeStart;
  } else if(loopRange){
    // 그냥 재생에도 구간이 걸린다. 연습 모드의 구간(rngStart/rngEnd)과는 별개다
    rangeStart = clampM(loopRange.a); rangeEnd = clampM(loopRange.b);
    if(rangeEnd < rangeStart) rangeEnd = rangeStart;
    preSteps = cinOn() ? countInBeats() : 0; curM = rangeStart;
  } else {
    /* ── 고른 마디부터 재생 (2026-08-17) ──
       **여러 마디를 골랐으면 그 구간만, 한 마디면 거기서부터 끝까지.**
       아무것도 안 골랐으면 selMeasure가 0이라 예전(처음부터)과 완전히 같다.
       구간 반복(loopRange)이 걸려 있으면 그쪽이 먼저다 — 명시적으로 정한 값이니까. */
    rangeStart = clampM(selA());
    rangeEnd = (selA() < selB()) ? clampM(selB()) : measures.length-1;
    curM = rangeStart;
    preSteps = cinOn() ? countInBeats() : 0;
  }
  /* 도돌이를 **시작할 때 한 번** 펼친다. 재생 중에 마디 구조가 바뀌는 경로는 없다
     (녹음은 있는 마디에 음을 더할 뿐이다). 반복 재생도 같은 순서를 다시 걷는다. */
  order = playOrder(rangeStart, rangeEnd);
  curP = 0; curM = order[0];
  /* 첫 소리까지의 여유. **0.06이었는데 앞꾸밈음이 들어오면서 0.14로 올렸다** —
     드래그의 첫 타는 본음보다 55ms 앞서므로 0.06으로는 "이미 지난 시각"이 되어
     **맨 앞 음의 꾸밈음이 조용히 사라졌다**(verify-orn이 간헐적으로 잡았다).
     0.14는 예비박 없이 눌러도 사람이 못 느끼는 지연이다. */
  playing = true; curS = 0; nextT = c.currentTime + 0.14;
  _statT0 = Date.now(); _statBpm = bpm; statsToday();   // 연습 기록 시계를 잡는다
  playStart = nextT;
  resetEvents(nextT);
  startCursorLoop();
  if(preSteps === 0) pushSeg(curM, nextT, nextPlayed(curP));   // 예비박이 있으면 그게 끝날 때 넣는다
  timer = setInterval(tick, 25);
  setPlayIcon(true);notifyAudioOutput();
  const ps = document.getElementById('pStart');
  if(ps) ps.textContent = t('연습 정지');
}
function clampM(v){ return Math.max(0, Math.min(measures.length-1, isNaN(v)?0:v)); }
/* ── 앱 내 평가 요청 (2026-08-27) ─────────────────────────
   **왜 넣는가**: 리뷰가 생길 수 있는 유일한 경로다. 프로모션 코드로 받은 사람은
   평가를 못 남기고(애플이 막는다), 산 사람이 스스로 스토어에 들어가 글을 쓰는 일은
   거의 없다. 유료 앱은 리뷰 30개가 구매 200~600명 규모다.

   **언제 묻는가 — 곡이 끝까지 재생돼 스스로 멈춘 순간.**
   애플 문서가 "버튼 탭 같은 사용자 동작에 대한 응답으로 부르지 말라"고 못 박는다
   (팝업이 안 뜰 수도 있어서 사용자가 속은 기분이 된다). 자연 종료는 버튼이 아니고,
   연습을 한 판 마친 성취의 순간이라 두 조건을 같이 만족한다.

   **우리 게이트는 애플 것보다 짜다.** StoreKit이 365일 3회로 이미 막지만,
   그건 "떠도 되는 최대"지 "떠야 하는 횟수"가 아니다. 앱을 잠깐 열어 본 사람에게
   물으면 낮은 별점을 부른다 — 가치를 겪은 증거를 먼저 본다.

     · 앱에서만                      웹에서는 스토어가 없다
     · 자연 종료일 때만              버튼으로 멈춘 건 사용자 동작이다
     · 오늘 연습이 60초 이상         스쳐 간 사람은 제외
     · 연속 2일 이상 **또는** 이 앱에서 곡을 만든 적 있음
     · 마지막으로 물어본 지 120일 지남

   **뜨는지 우리는 알 수 없다.** StoreKit이 알려주지 않으므로 "물어봤다"만 적는다.
   ⚠ TestFlight에서는 아무 효과가 없다 — 시뮬레이터·개발 빌드에서 확인할 것. */
const REVIEW_KEY = 'maidrum.review.asked';
const REVIEW_GAP_MS = 120 * 24 * 60 * 60 * 1000;   // 120일

function maybeAskReview(natural){
  if(!IS_NATIVE || !natural) return;
  try{
    const last = +(localStorage.getItem(REVIEW_KEY) || 0);
    if(last && Date.now() - last < REVIEW_GAP_MS) return;
  }catch(e){ return; }                       // 저장소를 못 쓰면 조용히 접는다

  const today = statsToday();
  if(!today || today.ms < 60000) return;     // 오늘 1분은 쳐 봤어야 한다

  /* 가치를 겪은 증거 — 둘 중 하나면 된다.
     **곡 개수는 안 쓴다.** 첫 실행에 예제 곡이 깔리므로(8-24장) 모든 사용자가
     통과해 게이트가 없는 것과 같아진다. 시간은 거짓말을 안 한다. */
  let earned = false;
  try{
    earned = histStreak() >= 2                       // 이틀 연속 연습
          || histSum(30).ms >= 30 * 60 * 1000;       // 또는 30일 누적 30분
  }catch(e){ return; }
  if(!earned) return;

  /* 재생이 멈추고 화면이 정리된 **뒤에** 묻는다. 같은 프레임에 띄우면
     연습 결과를 보기도 전에 팝업이 덮는다. */
  setTimeout(()=>{
    try{ localStorage.setItem(REVIEW_KEY, String(Date.now())); }catch(e){}
    track('review-ask');
    try{
      const P = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.MaiPdf;
      if(P && P.requestReview) P.requestReview();
    }catch(e){}
  }, 1800);
}

function stopPlay(natural){
  ++PLAY_REQUEST;PLAY_PENDING=false;window.ddakungAudio.stopPreview();SAMPLE_BANK.stopAll();
  statFlush(); _statT0 = 0; statsSave(true); certSumRefresh(); todayRefresh(); histDraw();   // 연습 기록 마감
  playing = false; practiceRun = false; clearInterval(timer);
  stopCursorLoop();
  if(typeof ensureScorePage==='function')ensureScorePage(selMeasure);
  setPlayIcon(false);notifyAudioOutput();
  const ps = document.getElementById('pStart');
  if(ps) ps.textContent = t('연습 시작');
  clearPlayCells();
  const cur = document.getElementById('cursor'); if(cur) cur.setAttribute('opacity',0);
  updateEditCursor();
  maybeAskReview(natural);        // 자연 종료일 때만 — 게이트는 함수 안에 있다
}
playBtn.onclick = ()=>{ if(!playing) track('play'); playing||PLAY_PENDING ? stopPlay() : startPlay(); };
document.getElementById('loopBtn').onclick = e=>{
  looping = !looping; e.currentTarget.classList.toggle('on', looping);
  e.currentTarget.setAttribute('aria-pressed', looping);
  window.dispatchEvent(new Event('ddakung-repeat-change'));
};
document.addEventListener('keydown', e=>{
  /* INPUT만 비켜 갔더니 textarea(일기·곡 옮기기)에 친 띄어쓰기를 삼키고 재생을 걸었다 (2026-10-21) */
  if(e.code==='Space' && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && !e.target.isContentEditable){
    e.preventDefault();
    /* 메트로놈 탭에서는 독이 숨어 있다 — 여기서 곡 재생이 울리면 두 시계가 겹친다 */
    if(document.body.classList.contains('is-metro') && window.metroToggle){ window.metroToggle(); return; }
    playBtn.click();
  }
});

