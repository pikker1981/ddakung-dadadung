import './styles/ipad-workspace.css';

/** iPad web shell: keep score and input mounted together, with a separate mixer. */
export function installIpadWorkspace(): void {
  if (document.body.classList.contains('ipad-workspace')) return;
  const main = document.querySelector<HTMLElement>('body > main');
  const mixer = document.getElementById('mainMixer');
  const settings = document.getElementById('setPop');
  const settingsCard = settings?.querySelector<HTMLElement>('.popcard');
  const stage = document.getElementById('crtStage');
  const input = main?.querySelector<HTMLElement>('.crt-input-panel');
  if (!main || !mixer || !settings || !settingsCard || !stage || !input) return;
  document.body.classList.add('ipad-workspace');

  const scoreControls = stage.querySelector<HTMLElement>('.score-region-controls');
  if (scoreControls) {
    const tools = document.createElement('details'); tools.className = 'ipad-score-tools';
    const summary = document.createElement('summary'); summary.textContent = 'Score selection';
    scoreControls.before(tools); tools.append(summary, scoreControls);
    tools.addEventListener('keydown', event => {
      if (event.code === 'Space') event.stopPropagation();
    });
    // Expanding the tools shifts the score SVG. Refresh its playback overlay
    // without changing the selection, note scale or editor scroll position.
    tools.addEventListener('toggle', () => requestAnimationFrame(() => window.maiWorkspace.refreshScore()));
  }

  input.id = 'ipadInputPanel';
  const bar = input.querySelector<HTMLElement>(':scope > .bar');
  const secondary = [
    document.getElementById('rhythmTools'), document.getElementById('artRow'),
    document.getElementById('hitTargetHint'), document.getElementById('ornInsRow'),
    input.querySelector<HTMLElement>('.measure-repeat-controls'),
    input.querySelector<HTMLElement>('.editor-hint'), input.querySelector<HTMLElement>('.clipboard-controls'),
  ].filter((node): node is HTMLElement => !!node && input.contains(node));
  if (bar && secondary.length) {
    const tools = document.createElement('details');
    tools.id = 'ipadSecondaryTools'; tools.className = 'ipad-secondary-tools';
    const summary = document.createElement('summary');
    summary.textContent = 'Articulation · Tuplets · More';
    summary.setAttribute('aria-label', 'Articulation, tuplets, playback feel, bar loop and clipboard tools');
    tools.append(summary);
    const content = document.createElement('div'); content.className = 'ipad-secondary-content';
    // Move each existing row intact: legacy handlers and #artRow button selectors
    // continue to own the same nodes, including dynamically added ornament tools.
    content.append(...secondary); tools.append(content); bar.append(tools);
    tools.addEventListener('keydown', event => {
      // Space on the disclosure opens it without starting global playback.
      if (event.code === 'Space') event.stopPropagation();
    });
  }

  const mixerView = document.createElement('section');
  mixerView.id = 'ipadMixerView'; mixerView.hidden = true;
  mixerView.setAttribute('aria-labelledby', 'ipadMixerTitle');
  mixerView.innerHTML = '<header class="ipad-view-heading"><button class="btn" type="button" data-mixer-back>← 편집으로</button><h1 id="ipadMixerTitle">드럼 믹서</h1><button class="btn" type="button" data-mixer-tuning>내 드럼 만들기</button></header>';
  mixerView.append(mixer);
  main.after(mixerView);
  const entry = document.createElement('button');
  entry.type = 'button'; entry.id = 'ipadMixerButton'; entry.className = 'btn'; entry.textContent = '드럼 믹서';
  entry.setAttribute('aria-controls', mixerView.id);
  const entryRow = document.createElement('div'); entryRow.className = 'ipad-settings-mixer'; entryRow.append(entry);
  settingsCard.querySelector('header')?.after(entryRow);
  let scrollPositions: Array<{node: HTMLElement; left: number; top: number}> = [];
  let pageScroll = {left: 0, top: 0};
  let settingsScroll = 0;
  const back = mixerView.querySelector<HTMLButtonElement>('[data-mixer-back]')!;
  entry.addEventListener('click', () => {
    settingsScroll = settingsCard.scrollTop;
    settings.classList.remove('is-open');
    scrollPositions = Array.from(main.querySelectorAll<HTMLElement>('#scoreWrap,.gridWrap,.crt-input-panel,#velocityEditor')).map(node => ({node, left: node.scrollLeft, top: node.scrollTop}));
    pageScroll = {left: window.scrollX, top: window.scrollY};
    document.body.classList.add('ipad-mixer-open'); main.inert = true;
    document.querySelector<HTMLElement>('.topbar')!.inert = true;
    mixerView.hidden = false;
    window.scrollTo(0, 0); back.focus({preventScroll:true});
  });
  const returnToEditor = () => {
    if (mixerView.hidden) return;
    mixerView.hidden = true; document.body.classList.remove('ipad-mixer-open');
    main.inert = false; document.querySelector<HTMLElement>('.topbar')!.inert = false;
    requestAnimationFrame(() => {
      window.maiWorkspace.refreshLayout();
      requestAnimationFrame(() => {
        scrollPositions.forEach(({node,left,top}) => node.scrollTo(left,top));
        window.scrollTo(pageScroll.left,pageScroll.top);
        settingsCard.scrollTop = settingsScroll;
        document.getElementById('setBtn')?.focus({preventScroll:true});
      });
    });
  };
  back.addEventListener('click', returnToEditor);
  mixerView.querySelector('[data-mixer-tuning]')!.addEventListener('click', () => document.getElementById('drumTuningButton')?.click());
  document.getElementById('drumTuningDialog')?.addEventListener('close', () => {
    if (!mixerView.hidden) requestAnimationFrame(() => mixerView.querySelector<HTMLButtonElement>('[data-mixer-tuning]')?.focus({preventScroll:true}));
  });
  // The legacy settings popup has no focus management. Keep its keyboard loop
  // local, and skip it while a native tuning dialog owns focus.
  settings.setAttribute('aria-modal', 'true');
  let settingsWasOpen = false;
  new MutationObserver(() => {
    const open = settings.classList.contains('is-open');
    if (open === settingsWasOpen) return;
    settingsWasOpen = open;
    main.inert = open || !mixerView.hidden;
    if (open) requestAnimationFrame(() => entry.focus({preventScroll:true}));
    else if (mixerView.hidden) document.getElementById('setBtn')?.focus({preventScroll:true});
  }).observe(settings,{attributes:true,attributeFilter:['class']});
  document.addEventListener('keydown', event => {
    if (document.querySelector('dialog[open]')) return;
    if (settings.classList.contains('is-open') && event.key === 'Tab') {
      const items = Array.from(settings.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href],[tabindex="0"]')).filter(node => node.getClientRects().length);
      const first = items[0], last = items[items.length-1];
      if (event.shiftKey && (document.activeElement === first || !settings.contains(document.activeElement))) {event.preventDefault();last?.focus();}
      else if (!event.shiftKey && (document.activeElement === last || !settings.contains(document.activeElement))) {event.preventDefault();first?.focus();}
    }
    if (!mixerView.hidden && event.key === 'Escape') { event.preventDefault(); returnToEditor(); }
  }, true);
}

