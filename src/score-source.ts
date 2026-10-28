import './score-source.css';

type Beat = { measure: number; beat: number; x: number; y: number; width: number; height: number };
type Reference = Pick<Beat, 'measure' | 'beat'>;
type Render = { svg: string; width: number; height: number; beats: Beat[]; totalMeasures: number; page: number; pages: number; title?: string; error?: string };
const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const score = element<HTMLDivElement>('source-score');
const scroll = element<HTMLDivElement>('source-scroll');
const status = element<HTMLParagraphElement>('source-status');
const copy = element<HTMLButtonElement>('source-copy');
const previous = element<HTMLButtonElement>('source-prev');
const next = element<HTMLButtonElement>('source-next');
const input = element<HTMLInputElement>('source-file');
const source = new URLSearchParams(location.search).get('source') || '';
const validSource = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(source);
const channel = validSource ? new BroadcastChannel('ddakung-score-source:' + source) : null;
let rendered: Render | null = null;
let page = 1;
let filename = '';
let connected = false;
let loading = false;
let fileGeneration = 0;
let drag: { start: number; end: number; base: Map<string, Reference> } | null = null;
let touch: { pointer: number; x: number; y: number; index: number; ctrl: boolean } | null = null;
let selectionMode:'measure'|'beats'='beats';
let inputMode:'measure'|'beats'='measure';
document.querySelectorAll<HTMLButtonElement>('[data-source-mode]').forEach(button=>{button.onclick=()=>{inputMode=button.dataset.sourceMode as typeof inputMode;document.querySelectorAll<HTMLButtonElement>('[data-source-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));};});
element<HTMLButtonElement>('source-back').onclick=()=>send({type:'back'});
const selected = new Map<string, Reference>();
const key = (beat: Reference) => `${beat.measure}:${beat.beat}`;
const sorted = () => [...selected.values()].sort((a, b) => a.measure - b.measure || a.beat - b.beat);
const viewportWidth = () => Math.max(500, Math.floor(scroll.clientWidth - 34));
const send = (message: object) => channel?.postMessage(message);
function updateSelection() {
  score.querySelector('.selection-overlay')?.remove();
  if (rendered) {
    const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    overlay.classList.add('selection-overlay');
    overlay.setAttribute('viewBox', `0 0 ${rendered.width} ${rendered.height}`);
    overlay.setAttribute('aria-hidden', 'true');
    let boxes=rendered.beats.filter(beat=>selected.has(key(beat)));
    if(selectionMode==='measure')boxes=[...new Set(boxes.map(b=>b.measure))].map(measure=>{const parts=boxes.filter(b=>b.measure===measure),first=parts[0],x=Math.min(...parts.map(b=>b.x));return{...first,x,width:Math.max(...parts.map(b=>b.x+b.width))-x};});
    for (const beat of boxes) {
      const box = document.createElementNS(overlay.namespaceURI, 'rect');
      for (const attribute of ['x', 'y', 'width', 'height'] as const) box.setAttribute(attribute, String(beat[attribute]));
      box.setAttribute('fill', '#477fe8'); box.setAttribute('fill-opacity', '.23');
      box.setAttribute('stroke', '#285fc8'); box.setAttribute('stroke-width', '1.5');
      overlay.append(box);
    }
    score.append(overlay);
    score.querySelectorAll<HTMLButtonElement>('.source-beat').forEach((button, index) => button.setAttribute('aria-pressed', String(selected.has(key(rendered!.beats[index])))));
  }
  copy.disabled = loading || selected.size === 0;
  copy.textContent=selected.size?`선택 ${selected.size}박 복사 · Ctrl+C`:'선택 복사 · Ctrl+C';
  element('source-selection').textContent = selected.size ? selectionMode==='measure'?`${new Set([...selected.values()].map(b=>b.measure)).size}마디 전체 선택 · 박 선택 모드로 박 추가/해제`:`${selected.size}박 선택` : '선택한 박 없음';
}
function choose(index: number, ctrl: boolean) {
  ctrl=ctrl||inputMode==='beats';
  const beat = rendered?.beats[index];
  if (!beat) return;
  if (ctrl) {
    if(selectionMode==='measure')selected.clear();
    selectionMode='beats';
    if (selected.has(key(beat))) selected.delete(key(beat));
    else selected.set(key(beat), { measure: beat.measure, beat: beat.beat });
  } else {
    selectionMode='measure';
    selected.clear();
    for (const part of rendered!.beats.filter(part => part.measure === beat.measure)) selected.set(key(part), { measure: part.measure, beat: part.beat });
  }
  updateSelection();
}
function requestRender(target = page) {
  if (!filename) return;
  loading = true; copy.disabled = true;
  previous.disabled = true; next.disabled = true;
  status.textContent = '원본 악보를 표시하고 있어요…';
  send({ type: 'render-request', width: viewportWidth(), page: target });
}
function showRender(result: Render) {
  if (result.error) { status.textContent = result.error; loading = false; updateSelection(); return; }
  if (typeof result.svg !== 'string' || !Number.isFinite(result.width) || !Number.isFinite(result.height) || result.width <= 0 || result.height <= 0 || !Array.isArray(result.beats)) return;
  rendered = result; page = result.page; loading = false;
  // SVG originates only from the workspace renderer. JSON file content is never inserted as HTML.
  score.innerHTML = result.svg;
  score.style.width = `${result.width}px`;
  score.style.maxWidth = '100%';
  for (const [index, beat] of result.beats.entries()) {
    const button = document.createElement('button');
    button.className = 'source-beat'; button.type = 'button'; button.dataset.beatIndex = String(index);
    button.setAttribute('aria-label', `${beat.measure + 1}마디 ${beat.beat + 1}박`);
    button.style.left = `${beat.x / result.width * 100}%`; button.style.top = `${beat.y / result.height * 100}%`;
    button.style.width = `${beat.width / result.width * 100}%`; button.style.height = `${beat.height / result.height * 100}%`;
    button.addEventListener('click', event => { if (event.detail === 0) choose(index, event.ctrlKey || event.metaKey); });
    score.append(button);
  }
  element('source-empty').hidden = true;
  element('source-title').textContent = result.title || filename;
  element('source-page').textContent = `${result.page} / ${result.pages}`;
  previous.disabled = result.page <= 1; next.disabled = result.page >= result.pages;
  status.textContent = `${filename} · ${result.totalMeasures}마디 · 원본은 읽기 전용이에요.`;
  updateSelection();
}
channel?.addEventListener('message', event => {
  const message = event.data;
  if (!message || typeof message !== 'object') return;
  if (message.type === 'render') { connected = true; showRender(message); }
  else if (message.type === 'copied') {status.textContent = message.error || `${message.count}박을 복사했어요. 작업 악보로 돌아가 위치를 선택한 뒤 붙여넣으세요.`;if(!message.error){const back=element<HTMLButtonElement>('source-back');back.textContent=`${message.count}박 복사됨 · 작업 악보로 돌아가기`;back.focus();}}
  else if (message.type === 'error') { loading = false; status.textContent = message.error || '원본 악보를 열지 못했어요.'; updateSelection(); }
  else if (message.type === 'connected') connected = true;
  else if (message.type === 'closing') { connected = false; loading = true; copy.disabled = true; status.textContent = '작업실이 닫혔어요. 작업실에서 원본 악보 창을 다시 열어 주세요.'; }
});
input.addEventListener('change', async () => {
  const file = input.files?.[0]; input.value = '';
  if (!file) return;
  const generation = ++fileGeneration;
  if (file.size > 8 * 1024 * 1024) { status.textContent = '8MB 이하의 JSON 악보를 선택해 주세요.'; return; }
  try {
    const document = JSON.parse(await file.text());
    if (generation !== fileGeneration) return;
    if (!document || typeof document !== 'object' || Array.isArray(document)) throw new Error();
    filename = file.name; page = 1; selected.clear(); rendered = null; score.replaceChildren(); updateSelection();
    loading = true; status.textContent = '악보 파일을 확인하고 있어요…';
    send({ type: 'document', document, name: filename, width: viewportWidth() });
  } catch { if (generation === fileGeneration) status.textContent = 'JSON 악보를 읽지 못했어요. 파일 형식을 확인해 주세요.'; }
});
function copySelection() { if (!copy.disabled && selected.size) send({ type: 'copy', beats: sorted() }); }
copy.addEventListener('click', copySelection);
previous.addEventListener('click', () => requestRender(page - 1));
next.addEventListener('click', () => requestRender(page + 1));
document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') { event.preventDefault(); copySelection(); }
  if (event.key === 'Delete' || event.key === 'Backspace') event.preventDefault();
  if (event.key === 'Escape') { selected.clear(); updateSelection(); }
});
const hitIndex = (event: PointerEvent) => {
  if (!rendered) return -1;
  const bounds = score.getBoundingClientRect();
  const x = (event.clientX - bounds.left) * rendered.width / bounds.width;
  const y = (event.clientY - bounds.top) * rendered.height / bounds.height;
  return rendered.beats.findIndex(beat => x >= beat.x && x <= beat.x + beat.width && y >= beat.y && y <= beat.y + beat.height);
};
score.addEventListener('pointerdown', event => {
  if (event.button !== 0 || loading) return;
  const index = hitIndex(event); if (index < 0) return;
  if(event.pointerType==='touch'){touch={pointer:event.pointerId,x:event.clientX,y:event.clientY,index,ctrl:event.ctrlKey||event.metaKey};return;}
  event.preventDefault(); score.focus();
  const ctrl = event.ctrlKey || event.metaKey || inputMode==='beats';
  const base = ctrl&&selectionMode==='measure'?new Map<string,Reference>():new Map(selected);
  choose(index, ctrl);
  if (ctrl && event.pointerType !== 'touch') { drag = { start: index, end: index, base }; score.setPointerCapture(event.pointerId); }
});
score.addEventListener('pointermove', event => {
  if(touch&&event.pointerId===touch.pointer&&Math.hypot(event.clientX-touch.x,event.clientY-touch.y)>8)touch=null;
  if (!drag || !rendered) return;
  const index = hitIndex(event); if (index < 0 || index === drag.end) return;
  drag.end = index; selected.clear();
  for (const [key, value] of drag.base) selected.set(key, value);
  for (const beat of rendered.beats.slice(Math.min(drag.start, index), Math.max(drag.start, index) + 1)) selected.set(key(beat), { measure: beat.measure, beat: beat.beat });
  updateSelection();
});
score.addEventListener('pointerup',event=>{if(touch&&event.pointerId===touch.pointer){const pending=touch;touch=null;if(!loading&&Math.hypot(event.clientX-pending.x,event.clientY-pending.y)<=8){event.preventDefault();score.focus();choose(pending.index,pending.ctrl);}}drag=null;});
const endDrag = () => { drag = null; touch = null; };
score.addEventListener('pointercancel', endDrag); score.addEventListener('lostpointercapture', endDrag);
let resizeTimer: ReturnType<typeof setTimeout>;
let lastWidth = viewportWidth();
new ResizeObserver(() => {
  const width = viewportWidth(); if (width === lastWidth) return;
  lastWidth = width; clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (filename && !drag) requestRender(); }, 180);
}).observe(scroll);
window.addEventListener('beforeunload', () => { channel?.close(); });
if (!channel) { input.disabled = true; status.textContent = '작업실의 원본 악보 버튼으로 이 창을 열어 주세요.'; }
else {
  send({ type: 'ready', width: viewportWidth() });
  setTimeout(() => { if (!connected && !filename) status.textContent = 'JSON 악보를 열어 복사할 부분을 선택해 주세요. 작업실이 열려 있어야 해요.'; }, 2500);
}
