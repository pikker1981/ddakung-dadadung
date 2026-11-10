import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import vm from 'node:vm';

const source=await readFile(new URL('../src/pencil-hybrid-core.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const module={exports:{}};
vm.runInNewContext(compiled,{module,exports:module.exports});
const core=module.exports;

test('guided stroke maps to one lane and the correct time cell',()=>{
  const result=core.classifyPencilStroke({points:[{x:12,y:42},{x:14,y:43}],width:160,height:120,stepCount:16,lanes:[{instrument:'hihat',top:0,bottom:1/3},{instrument:'snare',top:1/3,bottom:2/3},{instrument:'kick',top:2/3,bottom:1}]});
  assert.equal(result.length,1);
  assert.equal(result[0].instrument,'snare');
  assert.equal(result[0].step,1);
  assert.equal(result[0].source,'web-pencil');
});

test('long stroke creates a bounded run of cells and ignores out-of-range points',()=>{
  const result=core.classifyPencilStroke({points:[{x:-10,y:90},{x:150,y:92}],width:160,height:120,stepCount:8,lanes:[{instrument:'hihat',top:0,bottom:1/3},{instrument:'snare',top:1/3,bottom:2/3},{instrument:'kick',top:2/3,bottom:1}]});
  assert.equal(JSON.stringify(result.map(item=>item.step)),JSON.stringify([0,1,2,3,4,5,6,7]));
  assert.ok(result.every(item=>item.instrument==='kick'));
});

test('candidate dedupe keeps the first occurrence for an identical cell',()=>{
  const input=[{measure:0,instrument:'snare',step:2,id:'a'},{measure:0,instrument:'snare',step:2,id:'b'},{measure:0,instrument:'kick',step:2,id:'c'}];
  assert.equal(JSON.stringify(core.dedupePencilCandidates(input).map(item=>item.id)),JSON.stringify(['a','c']));
});

test('native bridge envelope is versioned and explicit',()=>{
  assert.equal(JSON.stringify(core.makePencilEnvelope('open','measure-2','x')),JSON.stringify({v:1,id:'x',cmd:'open',documentId:'measure-2'}));
});

const bridge=await readFile(new URL('../src/legacy/workspace-bridge.js',import.meta.url),'utf8');
test('workspace bridge exposes the guarded apply path',()=>{
  assert.match(bridge,/applyPencilCandidates\(candidates\)/);
  assert.match(bridge,/setCell\(item\.id,item\.step,item\.value,item\.measure\)/);
  assert.match(bridge,/commit\(\);renderScore\(\);refreshGrid\(\);refreshStepDots\(\)/);
});
