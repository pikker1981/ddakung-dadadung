import './styles/audio-status.css';

export function installAudioStatus():void{
  const api=window.ddakungAudio as typeof window.ddakungAudio&{outputStatus():{state:string;playing:boolean;pending:boolean;interrupted:boolean}};
  const text=document.createElement('p');text.id='audioOutputStatus';text.setAttribute('role','status');text.setAttribute('aria-live','polite');
  document.querySelector('.dock')?.before(text);
  let error='';
  function update(){
    const output=api.outputStatus(),samples=api.status();
    if(output.pending)error='';
    const loading=samples.sourceLoading||samples.sampleState==='loading';
    text.textContent=error|| (samples.sampleState==='error'?`소리 준비 실패: ${samples.sampleError}`:
      output.interrupted?'오디오가 중단됐어요. 아래 재생 버튼을 눌러 다시 시작하세요.':
      output.pending?(loading?`드럼 소리 준비 중 ${Math.round(samples.sampleProgress*100)}% · 한 번 더 누르면 취소`:'오디오 시작 중…'):
      output.playing?'소리 재생 중':loading?`드럼 소리 준비 중 ${Math.round(samples.sampleProgress*100)}%`:
      '소리 준비됨 · 아래 재생 버튼으로 시작');
    text.classList.toggle('audio-error',!!error||samples.sampleState==='error'||output.interrupted);
    document.getElementById('playBtn')?.setAttribute('aria-busy',String(output.pending));
  }
  window.addEventListener('ddakung-output-change',update);
  window.addEventListener('ddakung-samples-change',update);
  window.addEventListener('ddakung-audio-error',event=>{error=(event as CustomEvent<string>).detail;update();});
  update();
}
