import './domain';
import {seedIpadPreset} from './ipad-preset';
import {installIpadWorkspace} from './ipad-workspace';
import { installGridKeyboard } from './accessibility';
import { installDrumTuning } from './tuning';
import { installRhythmTools } from './rhythm-tools';
import { installImageImport } from './image-import';
import { installEditorTools } from './editor-tools';
import { installGridClipboard } from './grid-clipboard';
import { neutralizeMarketing, isVendorRoute } from './navigation';
import { installCrtWorkspace } from './crt-workspace';
import { installVelocityEditor } from './velocity-editor';
import { installMixer } from './mixer';
import { installMeasureRepeat } from './measure-repeat';
import { installScoreRegions } from './score-region-ui';
import { installInputPanelLanguage } from './input-panel-language';
import './styles/crt-workspace.css';

function loadScript(src: string): Promise<void> {
  return new Promise((resolve,reject) => {
    const script = document.createElement('script'); script.src = src;
    script.onload = () => resolve(); script.onerror = () => reject(new Error(`Cannot load ${src}`));
    document.body.append(script);
  });
}

async function boot() {
  document.body.classList.add('workspace');
  await seedIpadPreset();
  await loadScript('/legacy/muxers.js');
  await loadScript('/legacy/app.js');
  document.title = '따쿵따다둥 — 드럼 악보 작업실';
  neutralizeMarketing();
  document.addEventListener('click', event => {
    const link = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[href]');
    if(link && isVendorRoute(link.href)) event.preventDefault();
  }, true);
  const status = document.createElement('div');
  status.id = 'workspaceStatus'; status.setAttribute('role','status'); status.setAttribute('aria-live','polite');
  const ko = window.maiWorkspace.isKorean();
  const storageAvailable = window.maiWorkspace.storageAvailable();
  const storageMessage = storageAvailable
    ? (ko ? '브라우저 저장 준비됨 · 중요한 곡은 파일로도 백업하세요' : 'Browser storage ready · keep file backups')
    : (ko ? '브라우저 저장을 사용할 수 없습니다 · 지금 .ddakung.json 파일로 저장하세요' : 'Browser storage unavailable · save a .ddakung.json file now');
  status.innerHTML = `<span class="workspace-label">따쿵따다둥</span><span id="storageStatus"${storageAvailable ? '' : ' class="storage-error"'}>${storageMessage}</span>`;
  document.querySelector('.topbar')!.after(status);
  const tag = document.querySelector('.tagline');
  if(tag) tag.textContent = ko ? '드럼 악보 · 입력 · 재생' : 'Drum notation · edit · play';
  const footer = document.querySelector('footer');
  if(footer) footer.innerHTML = `<span>따쿵따다둥</span> <a href="/privacy.html">${ko ? '저장·개인정보' : 'Storage & privacy'}</a> <a href="/notices/ATTRIBUTION.txt">${ko ? '출처·라이선스' : 'Attribution & licenses'}</a>`;
  if(footer && location.protocol === 'ddakung:') footer.querySelectorAll('a').forEach(link => {
    link.target = '_blank'; link.rel = 'noopener';
  });
  const originalInfo = document.getElementById('infoBtn');
  if(originalInfo && footer) footer.prepend(originalInfo);
  window.addEventListener('mai-storage-result', ((event: CustomEvent<{ok:boolean}>) => {
    const el = document.getElementById('storageStatus')!;
    const langKo = window.maiWorkspace.isKorean();
    el.textContent = event.detail.ok
      ? (langKo ? '이 브라우저에 저장됨 · 중요한 곡은 파일로도 백업하세요' : 'Saved in this browser · back up important songs to a file')
      : (langKo ? '저장하지 못했습니다 · 지금 .ddakung.json 파일로 저장하세요' : 'Storage failed · save a .ddakung.json file now');
    el.classList.toggle('storage-error', !event.detail.ok);
  }) as EventListener);
  installGridKeyboard();
  installDrumTuning();
  installRhythmTools();
  installEditorTools();
  installGridClipboard();
  installMeasureRepeat();
  installVelocityEditor();
  installMixer();
  installImageImport();
  installCrtWorkspace();
  installScoreRegions();
  installInputPanelLanguage();
  installIpadWorkspace();
  // A new layout does not grant access to any original Studio feature.
  const media = matchMedia('(min-width: 1280px), (min-width: 1000px) and (orientation: landscape)');
  media.addEventListener('change', () => requestAnimationFrame(() => window.maiWorkspace.refreshScore()));
  requestAnimationFrame(() => window.maiWorkspace.refreshScore());
  document.documentElement.dataset.workspaceReady = 'true';
}
boot().catch(error => {
  console.error(error);
  const message = document.createElement('div');
  message.className = 'boot-error'; message.setAttribute('role','alert');
  message.textContent = '작업 공간을 열지 못했습니다. 페이지를 새로고침해 주세요. / Unable to open workspace. Reload this page.';
  document.body.prepend(message);
});
