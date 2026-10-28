/** Original CRT enclosure. Score data and SVG rendering remain owned by the notation engine. */
export function installCrtWorkspace() {
  const main = document.querySelector('main');
  const score = document.getElementById('scoreWrap');
  const panel = main?.querySelector<HTMLElement>(':scope > .panel');
  if (!main || !score || !panel || document.getElementById('crtStage')) return;
  document.body.classList.add('crt-workspace');
  const stage = document.createElement('section');
  stage.id = 'crtStage'; stage.className = 'crt-stage'; stage.setAttribute('aria-label', '악보 모니터');
  stage.innerHTML = `<div class="crt-monitor"><div class="crt-screen"></div><img class="crt-enclosure" src="/visuals/crt-enclosure.svg" alt="" aria-hidden="true"></div>`;
  score.before(stage);
  stage.querySelector('.crt-screen')!.append(score);
  const pager=document.createElement('nav');pager.className='crt-score-pager';pager.setAttribute('aria-label','악보 페이지');
  pager.innerHTML='<button type="button" class="btn" data-score-prev>← 이전 페이지</button><span role="status" aria-live="polite"></span><button type="button" class="btn" data-score-next>다음 페이지 →</button>';
  stage.prepend(pager);
  const syncPage=()=>{const p=window.maiWorkspace.scorePage();pager.hidden=!p.enabled;pager.querySelector('span')!.textContent=`${p.start+1}–${p.end+1}마디 · ${p.page} / ${p.pages}페이지`;pager.querySelector<HTMLButtonElement>('[data-score-prev]')!.disabled=p.page<=1;pager.querySelector<HTMLButtonElement>('[data-score-next]')!.disabled=p.page>=p.pages;};
  pager.querySelector('[data-score-prev]')!.addEventListener('click',()=>window.maiWorkspace.moveScorePage(-1));
  pager.querySelector('[data-score-next]')!.addEventListener('click',()=>window.maiWorkspace.moveScorePage(1));
  window.addEventListener('ddakung-score-page-change',syncPage);syncPage();
  panel.classList.add('crt-input-panel');
  const heading = document.createElement('div');
  heading.className = 'crt-panel-heading'; heading.innerHTML = '<span>리듬 입력</span><span class="crt-panel-signal" aria-hidden="true">● EDIT</span>';
  panel.prepend(heading);
  const mixer = document.getElementById('mainMixer');
  if (mixer) main.append(mixer);
  const velocity = document.getElementById('velocityEditor');
  if (velocity) main.append(velocity);
  const divider = document.createElement('div');
  divider.id = 'crtDivider'; divider.tabIndex = 0; divider.setAttribute('role', 'separator');
  divider.setAttribute('aria-orientation', 'vertical'); divider.setAttribute('aria-label', '악보와 입력 패널 너비');
  divider.title = '드래그 또는 방향키로 패널 너비 조절 · Home으로 초기화';
  divider.innerHTML = '<span aria-hidden="true">⋮</span>';
  stage.after(divider);
  const setRatio = (ratio: number) => {
    const style = getComputedStyle(main);
    const available = main.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const compact = matchMedia('(max-width:1100px)').matches;
    const stacked = matchMedia('(max-width:740px)').matches;
    const min = stacked ? 35 : Math.max(35, (compact ? 300 : 340) / available * 100);
    const max = stacked ? 67 : Math.min(67, (available - (compact ? 340 : 382)) / available * 100);
    const value = Math.max(min, Math.min(max, ratio));
    (main as HTMLElement).style.setProperty('--crt-score-share', `${value}%`);
    // The enclosure keeps the reference's 909:840 proportions as the workspace grows.
    // Sizing its stage from the column width removes the former 680px ceiling.
    const frameWidth = available * value / 100 - (compact ? 8 : 24);
    (main as HTMLElement).style.setProperty('--crt-stage-height', `${Math.ceil(Math.max(459, frameWidth * 840 / 909)+36)}px`);
    divider.setAttribute('aria-valuemin', String(Math.ceil(min)));
    divider.setAttribute('aria-valuemax', String(Math.floor(max)));
    divider.setAttribute('aria-valuenow', String(Math.round(value)));
    divider.setAttribute('aria-valuetext', `악보 ${Math.round(value)}%, 입력 ${Math.round(100 - value)}%`);
  };
  const defaultRatio = 60;
  divider.setAttribute('aria-valuemin', '35'); divider.setAttribute('aria-valuemax', '67'); setRatio(defaultRatio);
  window.addEventListener('resize', () => setRatio(Number(divider.getAttribute('aria-valuenow'))));
  let dragging = false;
  divider.addEventListener('pointerdown', event => { dragging = true; divider.setPointerCapture(event.pointerId); event.preventDefault(); });
  divider.addEventListener('pointermove', event => { if (dragging) { const bounds = main.getBoundingClientRect(); setRatio((event.clientX - bounds.left) / bounds.width * 100); } });
  divider.addEventListener('pointerup', () => { dragging = false; });
  divider.addEventListener('pointercancel', () => { dragging = false; });
  divider.addEventListener('dblclick', () => setRatio(defaultRatio));
  divider.addEventListener('keydown', event => {
    const current = Number(divider.getAttribute('aria-valuenow'));
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home') {
      setRatio(event.key === 'Home' ? defaultRatio : current + (event.key === 'ArrowRight' ? 2 : -2)); event.preventDefault();
    }
  });
  let lastWidth = 0, queued = false;
  new ResizeObserver(entries => {
    const width = Math.round(entries[0].contentRect.width);
    if (width === lastWidth || queued) return;
    lastWidth = width; queued = true;
    requestAnimationFrame(() => { queued = false; window.maiWorkspace.refreshLayout(); });
  }).observe(score);
  const wordmark = document.querySelector('.wordmark');
  if (wordmark) {
    const text = document.createElement('span'); text.className = 'crt-wordmark'; text.textContent = '따쿵따다둥';
    wordmark.append(text);
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#121211');
}
