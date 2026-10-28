import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../src/legacy/04-audio-and-sequencer.js',import.meta.url),'utf8');
const sessionCode=source.slice(source.indexOf('let ctx = null;'),source.indexOf('/* App-local drum finish.'));
function harness({supported=true,blocked=false,pending=false}={}){
  let timer,cleared=false,stopped=0;const events=[],order=[];
  const session={set type(value){if(blocked)throw Error('Unavailable');order.push(value);}};
  class AudioContext{
    state='suspended';listener=null;
    constructor(){order.push('context');}
    addEventListener(name,callback){assert.equal(name,'statechange');this.listener=callback;}
    resume(){order.push('resume');if(pending)return new Promise(()=>{});this.state='running';return Promise.resolve();}
  }
  const scope=vm.createContext({navigator:supported?{audioSession:session}:{},window:{AudioContext,dispatchEvent:e=>events.push(e.type)},Event,playing:false,stopPlay(){scope.playing=false;stopped++;},setTimeout(fn){timer=fn;return 1;},clearTimeout(){cleared=true;}});
  vm.runInContext(sessionCode,scope);
  return {scope,order,events,timeout:()=>timer(),cleared:()=>cleared,stopped:()=>stopped};
}
test('playback session is requested before context creation and user-tap resume',async()=>{
  const h=harness();await vm.runInContext('resumeAudioContext()',h.scope);
  assert.deepEqual(h.order,['playback','context','playback','resume']);assert.equal(h.cleared(),true);
});
test('unsupported or denied Audio Session API still resumes regular Web Audio',async()=>{
  for(const options of [{supported:false},{blocked:true}]){const h=harness(options);await vm.runInContext('resumeAudioContext()',h.scope);assert.equal(vm.runInContext('ctx.state',h.scope),'running');}
});
test('interruption stops stale playback and a new tap clears interrupted state',async()=>{
  const h=harness();vm.runInContext("ac();playing=true;ctx.state='interrupted';ctx.listener();",h.scope);
  assert.equal(h.stopped(),1);assert.equal(vm.runInContext('AUDIO_INTERRUPTED',h.scope),true);
  await vm.runInContext('resumeAudioContext()',h.scope);assert.equal(vm.runInContext('AUDIO_INTERRUPTED',h.scope),false);
  assert.ok(h.events.includes('ddakung-output-change'));
});
test('a suspended initial context does not stop playback that never started',()=>{
  const h=harness();vm.runInContext('ac();ctx.listener();',h.scope);assert.equal(h.stopped(),0);
});
test('resume that never settles gives a retryable error and clears its timer',async()=>{
  const h=harness({pending:true});const task=vm.runInContext('resumeAudioContext()',h.scope);h.timeout();
  await assert.rejects(task,/재생을 다시/);assert.equal(h.cleared(),true);
});
