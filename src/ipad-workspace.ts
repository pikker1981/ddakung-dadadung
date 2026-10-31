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

  const fullscreenButton = document.createElement('button');
  fullscreenButton.type = 'button'; fullscreenButton.id = 'ipadScoreFullscreen'; fullscreenButton.className = 'btn';
  fullscreenButton.textContent = '악보 전체 화면';
  fullscreenButton.setAttribute('aria-expanded', 'false');
  fullscreenButton.setAttribute('aria-controls', 'crtStage');
  stage.querySelector('.crt-score-pager')?.append(fullscreenButton);
  let editorScroll = {left: 0, top: 0};
  const setScoreFullscreen = (open: boolean) => {
    if (open) editorScroll = {left: window.scrollX, top: window.scrollY};
    document.body.classList.toggle('ipad-score-fullscreen', open);
    fullscreenButton.textContent = open ? '편집으로 돌아가기' : '악보 전체 화면';
    fullscreenButton.setAttribute('aria-expanded', String(open));
    if (open) window.scrollTo(0, 0);
    scheduleFitInput();
    requestAnimationFrame(() => {
      window.maiWorkspace.refreshLayout();
      window.maiWorkspace.refreshScore();
      fullscreenButton.focus({preventScroll:true});
      if (!open) window.scrollTo(editorScroll.left, editorScroll.top);
    });
  };
  fullscreenButton.addEventListener('click', () => setScoreFullscreen(!document.body.classList.contains('ipad-score-fullscreen')));
  fullscreenButton.addEventListener('keydown', event => { if (event.code === 'Space') event.stopPropagation(); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && document.body.classList.contains('ipad-score-fullscreen') && !document.querySelector('dialog[open],.pop.is-open')) {
      event.preventDefault(); setScoreFullscreen(false);
    }
  }, true);

  const scoreControls = stage.querySelector<HTMLElement>('.score-region-controls');
  if (scoreControls) {
    const tools = document.createElement('details'); tools.className = 'ipad-score-tools';
    const summary = document.createElement('summary'); summary.textContent = 'Score selection';
    stage.querySelector('.crt-monitor')?.before(tools); tools.append(summary, scoreControls);
    tools.addEventListener('keydown', event => {
      if (event.code === 'Space') event.stopPropagation();
    });
    // Expanding the tools shifts the score SVG. Refresh its playback overlay
    // without changing the selection, note scale or editor scroll position.
    tools.addEventListener('toggle', () => requestAnimationFrame(() => window.maiWorkspace.refreshScore()));
  }

  input.id = 'ipadInputPanel';
  const inputFrame = document.createElement('section');
  inputFrame.className = 'ipad-input-frame';
  inputFrame.setAttribute('aria-label', '리듬 입력 작업 영역');
  input.before(inputFrame); inputFrame.append(input);
  // The iPad workspace always fits one complete input measure, not stacked cards.
  window.maiWorkspace.setEditorCount(1);
  // Allocate the remaining visible height to the grid, above the fixed transport.
  // Observe real header/dock sizes rather than assuming a particular iPad model.
  let resizeFrame = 0;
  const fitInput = () => {
    resizeFrame = 0;
    const viewport = window.visualViewport;
    const bottom = (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight);
    const dock = document.querySelector<HTMLElement>('.dock');
    const dockHeight = dock?.getBoundingClientRect().height ?? 92;
    let fullscreenSizeChanged = false;
    for (const [name, value] of [
      ['--ipad-viewport-height', `${viewport?.height ?? window.innerHeight}px`],
      ['--ipad-viewport-top', `${viewport?.offsetTop ?? 0}px`],
      ['--ipad-playbar-height', `${dockHeight}px`],
    ]) {
      if (document.body.style.getPropertyValue(name) !== value) {
        document.body.style.setProperty(name, value); fullscreenSizeChanged = true;
      }
    }
    if (document.body.classList.contains('ipad-score-fullscreen')) {
      if (fullscreenSizeChanged) requestAnimationFrame(() => window.maiWorkspace.refreshScore());
      return;
    }
    if (!inputFrame.getClientRects().length) return;
    const top = Math.max(viewport?.offsetTop ?? 0, inputFrame.getBoundingClientRect().top);
    const visibleHeight = Math.max(220, Math.floor(bottom - top - dockHeight - 12));
    const scoreRoom = `${visibleHeight}px`;
    if (stage.style.getPropertyValue('--ipad-stage-room') !== scoreRoom) {
      stage.style.setProperty('--ipad-stage-room', scoreRoom);
      requestAnimationFrame(() => window.maiWorkspace.refreshScore());
    }
    const scale = Number.parseFloat(getComputedStyle(inputFrame).getPropertyValue('--ipad-input-scale')) || 0.76;
    const frameHeight = `${visibleHeight}px`;
    if (inputFrame.style.getPropertyValue('--ipad-frame-height') !== frameHeight) inputFrame.style.setProperty('--ipad-frame-height', frameHeight);
    const height = `${visibleHeight / scale}px`;
    if (input.style.getPropertyValue('--ipad-input-height') !== height) input.style.setProperty('--ipad-input-height', height);
    const width = `${(inputFrame.getBoundingClientRect().width / scale).toFixed(3)}px`;
    if (input.style.width !== width) {
      input.style.width = width;
      requestAnimationFrame(() => window.maiWorkspace.refreshLayout());
    }
    const grid = document.getElementById('gridMode');
    const card = grid?.querySelector<HTMLElement>('.measure-editor-card');
    const cell = card?.querySelector<HTMLElement>('.cell');
    const rows = card?.querySelectorAll('.rowlabel').length ?? 0;
    if (grid && card && cell && rows) {
      const overhead = card.getBoundingClientRect().height - rows * cell.getBoundingClientRect().height;
      const rowHeight = `${Math.max(10, Math.min(40, Math.floor((grid.getBoundingClientRect().height - overhead - 10) / rows / scale)))}px`;
      if (input.style.getPropertyValue('--ipad-cell-height') !== rowHeight) input.style.setProperty('--ipad-cell-height', rowHeight);
    }
  };
  const scheduleFitInput = () => {
    if (!resizeFrame) resizeFrame = requestAnimationFrame(fitInput);
  };
  const inputSizeObserver = new ResizeObserver(scheduleFitInput);
  [inputFrame, input, document.getElementById('gridMode'), document.querySelector('.topbar'), main.querySelector('.titlerow'), document.getElementById('workspaceStatus'), document.querySelector('.dock')]
    .forEach(node => { if (node) inputSizeObserver.observe(node); });
  window.addEventListener('resize', scheduleFitInput);
  window.visualViewport?.addEventListener('resize', scheduleFitInput);
  window.visualViewport?.addEventListener('scroll', scheduleFitInput);
  window.addEventListener('ddakung-editor-view-change', scheduleFitInput);
  const gridNode = document.getElementById('grid');
  if (gridNode) new MutationObserver(scheduleFitInput).observe(gridNode, {childList:true,subtree:true});
  scheduleFitInput();
  const bar = input.querySelector<HTMLElement>(':scope > .bar');
  const secondary = [
    bar?.querySelector<HTMLElement>(':scope > .chiprow'), bar?.querySelector<HTMLElement>(':scope > .tools'),
    document.getElementById('rhythmTools'), document.getElementById('artRow'),
    document.getElementById('hitTargetHint'), document.getElementById('ornInsRow'),
    input.querySelector<HTMLElement>('.measure-repeat-controls'),
    input.querySelector<HTMLElement>('.editor-hint'), input.querySelector<HTMLElement>('.clipboard-controls'),
  ].filter((node): node is HTMLElement => !!node && input.contains(node));
  if (bar && secondary.length) {
    const tools = document.createElement('details');
    tools.id = 'ipadSecondaryTools'; tools.className = 'ipad-secondary-tools';
    const summary = document.createElement('summary');
    summary.textContent = 'Input tools · Articulation · More';
    summary.setAttribute('aria-label', 'Bar controls, articulation, tuplets, playback feel, bar loop and clipboard tools');
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

  const syncSingleBarLabel = () => {
    const page = window.maiWorkspace.scorePage();
    const pager = stage.querySelector<HTMLElement>('.crt-score-pager');
    const label = pager?.querySelector('span');
    if (label) label.textContent = `${page.start + 1}${page.end > page.start ? '–' + (page.end + 1) : ''}마디 / 총 ${page.total}마디`;
    const previous = pager?.querySelector<HTMLButtonElement>('[data-score-prev]');
    const next = pager?.querySelector<HTMLButtonElement>('[data-score-next]');
    if (previous) previous.textContent = '←';
    if (next) next.textContent = '→';
    const full = document.body.classList.contains('ipad-score-fullscreen');
    previous?.setAttribute('aria-label', full ? '이전 16마디' : '이전 마디');
    next?.setAttribute('aria-label', full ? '다음 16마디' : '다음 마디');
  };
  window.addEventListener('ddakung-score-page-change', syncSingleBarLabel);
  requestAnimationFrame(() => { window.maiWorkspace.refreshScore(); syncSingleBarLabel(); });

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

