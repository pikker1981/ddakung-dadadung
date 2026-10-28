export function installGridKeyboard(): void {
  const grid = document.getElementById('grid')!;
  let current = {instrument: '', step: 0, measure: 0};
  const decorate = () => {
    const cells = [...grid.querySelectorAll<HTMLElement>('.cell')];
    const active = cells.find(c => c.dataset.ins === current.instrument && Number(c.dataset.step) === current.step && Number(c.dataset.measure) === current.measure) || cells[0];
    for(const c of cells) {
      const {label, pressed} = window.maiWorkspace.describeCell(c.dataset.ins!, Number(c.dataset.step), Number(c.dataset.measure));
      c.setAttribute('role', 'button'); c.setAttribute('aria-label', label);
      c.setAttribute('aria-pressed', String(pressed)); c.tabIndex = c === active ? 0 : -1;
    }
  };
  grid.addEventListener('focusin', event => {
    const cell = (event.target as HTMLElement).closest<HTMLElement>('.cell');
    if(cell){
      current = {instrument: cell.dataset.ins!, step: Number(cell.dataset.step), measure: Number(cell.dataset.measure)};
      window.maiWorkspace.selectEditorMeasure(current.measure);
      decorate();
    }
  });
  grid.addEventListener('keydown', event => {
    const cell = (event.target as HTMLElement).closest<HTMLElement>('.cell');
    if(!cell) return;
    if(event.key === ' ' || event.key === 'Enter') {
      event.preventDefault(); event.stopPropagation();
      window.maiWorkspace.activateCell(cell.dataset.ins!, Number(cell.dataset.step), Number(cell.dataset.measure));
      decorate(); return;
    }
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    const all = [...grid.querySelectorAll<HTMLElement>('.cell')];
    const row = all.filter(c => c.dataset.ins === cell.dataset.ins);
    let next: HTMLElement | undefined;
    const pos = row.indexOf(cell);
    if(event.key === 'ArrowLeft') next = row[Math.max(0,pos-1)];
    if(event.key === 'ArrowRight') next = row[Math.min(row.length-1,pos+1)];
    if(event.key === 'Home') next = row[0];
    if(event.key === 'End') next = row.at(-1);
    if(event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      const inBar = all.filter(c => c.dataset.measure === cell.dataset.measure);
      const instruments = [...new Set(inBar.map(c => c.dataset.ins))];
      const i = instruments.indexOf(cell.dataset.ins) + (event.key === 'ArrowUp' ? -1 : 1);
      const targetRow = inBar.filter(c => c.dataset.ins === instruments[Math.max(0,Math.min(instruments.length-1,i))]);
      next = targetRow[Math.min(Number(cell.dataset.step),targetRow.length-1)];
    }
    next?.focus(); next?.scrollIntoView({block:'nearest',inline:'nearest'});
  });
  // Original renderer recreates cells on division/meter changes. Observe only
  // original class/content changes; our aria/tabindex updates do not retrigger it.
  let queued = false;
  const observer = new MutationObserver(() => {
    if(queued) return; queued = true;
    queueMicrotask(() => { queued = false; decorate(); });
  });
  observer.observe(grid, {subtree:true, childList:true, attributes:true, attributeFilter:['class']});
  decorate();
}
