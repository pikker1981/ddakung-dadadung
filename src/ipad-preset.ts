const allowed=['ddakung.sources.v1','ddakung.tuning.v1','maidrum.insvol','ddakung.mixer.v1','ddakung.polish.v1','ddakung.groove.v1'];
/** Apply only the audio preset, once, before the retained audio core boots. */
export async function seedIpadPreset():Promise<void>{
  const marker='ddakung.ipad.seed.v1';
  try{if(localStorage.getItem(marker))return;}catch{return;}
  const response=await fetch('/private-preset.json');
  if(!response.ok)throw new Error('개인 드럼 프리셋을 불러오지 못했습니다.');
  const preset=await response.json();
  if(preset.version!==1||!preset.settings||typeof preset.settings!=='object')throw new Error('개인 프리셋 형식이 올바르지 않습니다.');
  try{
    for(const key of allowed)if(preset.settings[key]!==undefined&&localStorage.getItem(key)===null)localStorage.setItem(key,JSON.stringify(preset.settings[key]));
    if(localStorage.getItem('maidrum.lang')===null)localStorage.setItem('maidrum.lang','ko');
    localStorage.setItem(marker,'1');
  }catch{console.warn('개인 프리셋 저장 공간을 사용할 수 없습니다.');}
}
