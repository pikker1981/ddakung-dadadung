
"use strict";
/* ================= 데이터 ================= */
/* ================= 언어 (2026-08-22) =================
   **한국어 원문이 곧 열쇠다.** `t('저장')`처럼 부르고, `EN` 표에 있으면 영어로,
   없으면 **받은 것을 그대로** 돌려준다. gettext가 쓰는 방식이고, 여기서 고른 이유는 하나다 —
   **한국어에서 `t`가 항등함수라 지금 화면이 한 글자도 안 바뀐다는 게 증명된다.**
   키를 따로 두는 방식(`t('btn.save')`)이었다면 150곳을 고치면서 오타 하나가
   빈 화면을 만들 수 있었다. 여기서는 최악이 "영어로 안 바뀐 한 줄"이다.

   **선언은 여기 있어야 한다.** 부팅 때 도는 IIFE들이 `t`를 본다. 아래에 두면
   TDZ로 앱이 통째로 안 뜬다 — `STORAGE_OK`·`IS_NATIVE`에서 두 번 겪은 사고다.

   화면에 나오는 글자는 `applyLang()`이 DOM을 훑어 갈아 끼운다. 훑지 **않는** 곳:
   악보 SVG(구간 이름·가사는 사용자가 쓴 글이다) · 입력칸의 값 · 인쇄 영역. */
const LANG_KEY = 'maidrum.lang';
const LANGS = ['ko', 'en'];
let LANG = (function(){
  // 1) 주소의 ?lang=en — 검사와 시연용. 고른 것처럼 기억한다(?studio와 같은 방식)
  try{
    const m = /[?&]lang=(ko|en)\b/.exec(location.search);
    if(m){ try{ localStorage.setItem(LANG_KEY, m[1]); }catch(e){} return m[1]; }
  }catch(e){}
  // 2) 사용자가 고른 값
  try{
    const v = localStorage.getItem(LANG_KEY);
    if(LANGS.includes(v)) return v;
  }catch(e){}
  /* 3) **`file:`은 한국어다.** 검사 스크립트가 파일로 여는데, 거기서 기기 언어를 따르면
        검사기의 로케일(보통 en-US)에 따라 화면 글자가 통째로 바뀌어 **서른 개 검사가
        전부 무의미해진다.** 실제 사용자는 https나 capacitor:라 이 가지를 안 탄다.
        영어를 시험하려면 위의 `?lang=en`을 쓴다. */
  if(location.protocol === 'file:') return 'ko';
  // 4) 처음 열 때만 기기 언어를 본다. 그 뒤로는 사용자가 고른 값이 이긴다
  return /^ko\b/i.test(navigator.language || '') ? 'ko' : 'en';
})();

/* 영어 표 — **한국어 원문 → 영어.** 없는 줄은 한국어가 그대로 나온다(치명적이지 않다).
   새 문구를 넣을 때 여기 한 줄을 같이 넣는 것이 규칙이다. */
const EN = {
  /* ── 상단바 · 탭 ── */
  '스마트폰으로 그리는 드럼 악보':'Drum notation on your phone',
  '편집':'Edit', '악보':'Score', '연습':'Practice', '카피':'Transcribe',
  '저장':'Save', '열기':'Open', '설정':'Settings', '닫기':'Close', '완료':'Done',
  '시작하기':'Get started',

  /* ── 마디 도구 ── */
  '프리셋…':'Preset…', '8비트 락':'8-beat rock', '16비트 그루브':'16-beat groove', '탐 필인':'Tom fill',
  '총':'Total', '마디':'bars', '＋ 마디':'+ Bar',   // 앞뒤가 'Bars … bars'가 되지 않게
  '복제':'Duplicate', '복사':'Copy', '붙여넣기':'Paste', '비우기':'Clear', '삭제':'Delete',
  '잘라내기':'Cut', '끼워넣기':'Insert',
  '곡 목록':'Songs', '＋ 새 곡':'+ New song',

  /* ── 표기 팔레트 ── */
  '표기':'Notation', '기본':'Normal', '고스트':'Ghost', '액센트':'Accent',
  '오픈 하이햇':'Open hi-hat', '크로스 스틱':'Cross-stick', '림샷':'Rim shot',
  '플램':'Flam', '드래그':'Drag', '러프':'Ruff', '꾸밈 악기':'Grace on', '같은 악기':'Same drum',
  '오른손 (R)':'Right hand (R)', '왼손 (L)':'Left hand (L)',
  '플램 — 앞꾸밈 1타':'Flam — one grace note',
  '드래그 — 앞꾸밈 2타':'Drag — two grace notes',
  '러프 — 앞꾸밈 3타':'Ruff — three grace notes',
  '크로스 스틱 (림 클릭) — 스네어':'Cross-stick — snare only',
  '림샷 — 스네어':'Rim shot — snare only',

  /* ── 독 · 연습 ── */
  '구간 반복':'Loop', '전체 구간':'Whole song', '카운트인':'Count-in', '메트로놈':'Metronome',
  '스피드 트레이너':'Speed trainer', '사용':'On', '회마다':'every', '목표':'target',
  // 오늘 기록 카드 (2026-08-23). BPM 셋과 '총 연습 시간'은 아래 인증샷 묶음에
  // 이미 있다 — **같은 열쇠를 두 번 적지 말 것.** 뒤엣것이 이겨서 조용히 어긋난다
  '드럼 볼륨':'Drum volume', '끔':'Off',
  '메트로놈 클릭은 그대로입니다. 0이면 드럼 없이 클릭만 납니다.':'The metronome click stays as it is. At 0 you hear only the click.',
  '오늘 기록':'Today', '인증샷에 들어갑니다':'Goes on your card', '음표':'Notes',
  '연습 시작':'Start practice', '구간':'Range', '시작':'From', '끝':'To',
  '구간 반복 켜기':'Turn loop on', '전체로':'Whole song',
  '정한 마디만 돌립니다':'Loops just the bars you pick',
  '구간 반복 — 정한 마디만 돌립니다':'Loop — repeats just the bars you pick',
  '소리는':'Audio is', '녹음하지도 보내지도 않습니다.':'never recorded or sent.',
  '기기 안에서 박자만 보고 바로 버립니다.':'It is analysed on device for timing only, then discarded.',

  /* ── 연습 기록 · 인증샷 ── */
  '연습 기록':'Practice log', '이 기기에 남습니다':'stays on this device',
  '일 연속':'day streak', '오늘':'Today', '최근 7일':'Last 7 days', '최근 30일':'Last 30 days',
  '7일 음표':'Notes, 7 days',
  '연습 인증':'Practice card', '인증샷 만들기':'Make a card', '기록 보기':'View log',
  '기록 보기 · 인증샷':'View log · practice card',
  '오늘 이 기기에서 잰 기록입니다':'Measured on this device today',
  '사진 고르기':'Choose a photo', '저장 · 공유':'Save · share',
  '아직 기록이 없습니다.':'No practice logged yet.',

  /* ── 저장 팝업 ── */
  '파일 · 이미지 · 인쇄':'File · image · print',
  '.ddakung.json 파일':'.ddakung.json file', '이미지 · 인쇄':'Image · print',
  '한 줄에 8마디':'8 bars per line', '한 줄에 6마디':'6 bars per line', '한 줄에 5마디':'5 bars per line',
  '한 줄에 4마디':'4 bars per line', '한 줄에 3마디':'3 bars per line',
  '한 줄에 2마디':'2 bars per line', '한 줄에 1마디':'1 bar per line',
  '이어서':'Continuous', '구간마다 새 줄':'New line at sections', '구간 새 줄':'Section line breaks',
  '쉬는 마디 따로':'Rests bar by bar', '쉬는 마디 묶기':'Multi-bar rests',
  '6연음 3+3':'Sextuplet 3+3', '6연음 한 덩어리':'Sextuplet joined', '6연음 빔':'Sextuplet beams',
  'PNG 이미지':'PNG image', 'PDF · 인쇄':'PDF · print',
  'PNG·PDF 출력 시 한 줄에 넣을 마디 수':'Bars per line for PNG and PDF',

  /* ── 설정 ── */
  '이 기기에서만 적용됩니다':'Applies to this device only',
  '언어 · Language':'Language · 언어',
  '킥 음표 줄기':'Kick stems', '아래로 (성부 분리)':'Down (split voices)', '위로 (합치기)':'Up (merged)',
  '크래쉬 머리':'Crash notehead', '⊗ (원 두르기)':'⊗ (circled)',
  '메트로놈 소리':'Metronome sound', '클릭':'Click', '목소리':'Voice',
  '드럼 사운드':'Drum sound', '어쿠스틱':'Acoustic', '일렉트로':'Electro',
  '악보 배경':'Score background', '흰색':'White', '아이보리':'Ivory', '반전':'Inverted',
  '악보 크기':'Score size', '음표·오선이 함께 커집니다. 화면과 인쇄·PDF에 모두 적용되고, 키우면 한 줄에 마디가 덜 들어갑니다.':'Notes and staff grow together — on screen and in print / PDF. Bigger means fewer bars per line.',
  '가사·메모 글자 크기':'Lyric · note text size', '작게':'Small', '보통':'Medium', '크게':'Large',
  // ── 지면에서 빼는 것들 (2026-08-29) ──
  '마디 번호':'Bar numbers', '빈 마디 온쉼표':'Rests in empty bars',
  '마디선':'Barline', '겹세로줄':'Double bar', '마침줄':'Final bar',
  // ── 표기 값 7·8·9 (2026-08-29) ──
  '닫음':'Closed', '닫음 (하이햇 클로즈 · 심벌 초크)':'Closed (hi-hat) · choke (cymbal)',
  '라이드 벨':'Ride bell', '라이드 벨 — 라이드':'Ride bell — ride', '롤':'Roll',
  // ── 롤 사선 하나·둘 · 버즈롤 (2026-09-02) ──
  '롤 1':'Roll 1', '롤 2':'Roll 2', '롤 3':'Roll 3', '버즈':'Buzz',
  '롤 — 사선 하나':'Roll — one slash', '롤 — 사선 둘':'Roll — two slashes',
  '롤 — 사선 셋':'Roll — three slashes',
  '롤 사선 하나':'Roll, one slash', '롤 사선 둘':'Roll, two slashes',
  '롤 사선 셋':'Roll, three slashes',
  '버즈롤':'Buzz roll', '버즈롤 (z) — 눌러서 튀기는 롤':'Buzz roll (z) — multiple bounce',
  '보이기':'Show', '숨기기':'Hide',
  '손 순서 표기 (R·L) 위치':'Sticking (R·L) position',
  '음표 위':'Above the notes', '음표 아래':'Below the notes',
  '손가락도 입력':'Finger input on', '펜으로만 입력':'Pencil only',
  '악기':'Instruments', '악기 고르기 · 순서 · 이름':'Choose · reorder · rename', '악기 고르기 · 순서 · 볼륨':'Choose · order · volume',
  '여덟 개 모두 보입니다.':'All eight are showing.',
  '정보 · 라이선스':'About · licences',
  '새 소식':"What's new",
  '입력판에 보일 악기와 순서':'Which instruments show, and in what order',
  '입력판에 보일 악기 · 순서 · 볼륨':'Which instruments show · order · volume', '{ins} 볼륨':'{ins} volume',
  '기본값으로':'Reset to defaults',
  '연습기':'Practice tools', '연습기 열기':'Unlock practice tools', '구매 복원':'Restore purchase',
  '구매':'Buy', '열리는 것':'What unlocks', '지금도 무료인 것':'Free already',
  '채보 · 재생 · 구간 반복':'Notation · playback · loop',
  'PDF · PNG · 곡 파일 저장':'PDF · PNG · song files',
  '연습 기록과 인증샷':'Practice log and cards',

  /* ── 팝업 제목 · 공용 ── */
  '하이햇':'Hi-hat', '한 박 패턴을 깔아 줍니다':'Lays one beat of pattern',
  '전체':'All', '선택 구간':'Selection', '이 마디':'This bar', '이 마디 전체':'This whole bar', '이 박':'This beat',
  '박자표':'Time signature',
  /* ── 메트로놈 탭 (2026-08-28) ── */
  '분할':'Subdivision', '셔플':'Shuffle',
  '탭 템포':'Tap', '메트로놈 시작':'Start metronome', '메트로놈 정지':'Stop metronome',
  '클릭 소리':'Click sound', '우드':'Wood', '비프':'Beep', '화면 플래시':'Screen flash',
  '갭 트레이너':'Gap trainer', '자동 템포':'Auto tempo', '무음':'Muted', '마디마다':'bars each',
  '강세':'Accent', '약하게':'Soft', '뮤트':'Mute', '림':'Rim',
  '{n}박 소리':'Beat {n} sound',
  '카운팅 사각형 — 누르면 그 박의 소리를 고릅니다':'Counting pads — tap one to choose its sound',
  '박 소리 고르기':'Choose beat sound', '박자표 분자':'Meter numerator', '박자표 분모':'Meter denominator',
  '클릭 {a} · 무음 {b}':'Click {a} · mute {b}',
  '{e}마디마다 +{s} · 목표 {g}':'Every {e} bars +{s} · target {g}',
  '{b}마디':'Bar {b}',   /* '{n}박'은 본편 사전에 있다(2026-10) — 다시 넣지 말 것 */
  '겹박자(6/8·9/8·12/8)는 점4분이 한 박 — 셋잇단으로 셉니다.':
    'Compound meters (6/8·9/8·12/8) count the dotted quarter as the beat — in triplets.',
  '강세·보통·약하게 박에 적용됩니다. 고스트·림·하이햇 박은 제 소리를 냅니다.':
    'Applies to accent, normal and soft beats. Ghost, rim and hi-hat beats keep their own sound.',
  '무음 마디에도 박은 흘러갑니다 — 사각형은 계속 도니, 눈으로 박을 지키는 연습입니다.':
    'The beat keeps moving through muted bars — the pads keep counting, so your eyes hold the time.',
  '6연음':'Sextuplet',   /* '5연음'·'7연음'은 본편 사전에 있다(2026-10, quintuplet/septuplet) */
  '리듬꼴':'Rhythm figure', '리듬꼴 끄기':'Rhythm figure off', '끄기':'Off', '화면 구성':'Layout',
  '한 박(16분 네 칸)에서 칠 칸만 골라 클릭이 그 리듬을 칩니다. 켜져 있는 동안 분할 대신 적용됩니다.':
    'Pick which of the four sixteenth slots to hit — the click plays that rhythm. While on, it replaces the subdivision.',
  '마디 카운팅':'Bar counting',
  '마디 카운팅을 켜면 마디 첫 박에서 몇 번째 마디인지 목소리로 셉니다 — 1~4를 돕니다.':
    'With bar counting on, the first beat of each bar speaks which bar you are in — cycling 1 to 4.',
  '세트리스트':'Setlist', '곡 이름':'Song name', '템포':'Tempo',
  '폴리리듬':'Polyrhythm', '볼륨':'Volume', '약박 세기':'Non-accent level', '악보에서':'From score', '마디 전체':'Whole bar', '한 마디를 N등분한 둘째 클릭이 박 위에 겹칩니다 — 4/4에 3이면 3:4.':'A second click dividing the bar into N overlays the beat — 3 in 4/4 gives 3:4.',
  '화면 지연':'Visual delay', '자동 +{n}ms':'auto +{n}ms', '패드를 누르면 시작 · 정지':'Tap a pad to start · stop', '랜덤 뮤트':'Random mute', '자동 정지':'Auto stop', '마디 후':'bars', '자동 진행':'Auto-advance', '{n}곡':'{n} song(s)', '길이 {n}마디':'{n} bars',   /* '카운트인'·'마디'는 본편에 있다 */
  '한 번 더 누르면 삭제':'Tap again to delete',
  '지금 세팅을 이름 붙여 저장해 두고 탭 한 번으로 되부릅니다 — 같은 이름은 덮어씁니다. 빠르기·박자표·분할·리듬꼴·박별 소리·클릭·패닝·마디 카운팅·갭·자동 템포가 저장됩니다.':
    'Name and save the current setup, then bring it back with one tap — an existing name is overwritten. Saves tempo, meter, subdivision, rhythm figure, per-beat sounds, click, panning, bar counting, gap and auto tempo.',
  '패닝':'Panning', '왼쪽':'Left', '가운데':'Center', '오른쪽':'Right',
  '항상 화면 켬':'Keep screen on',
  '10 줄이기':'Minus 10', '1 줄이기':'Minus 1', '1 늘리기':'Plus 1', '10 늘리기':'Plus 10',
  '빠르기':'Tempo',
  // ── 마디별 박자표 (2026-09-01) ──
  '적용 범위':'Apply to', '곡 전체':'Whole song',
  '이 마디부터':'From this bar', '이 마디만':'This bar only',
  '직접 넣기':'Custom', '적용':'Apply', '묶는 방법':'Grouping',
  '1박 나누기':'Beat division', '한 박을 몇 칸으로 쪼갤지':'How many cells make one beat',
  '이 마디 나누기':'Divide this bar', '{n}박 나누기':'Divide beat {n}',
  '손':'Hands', '발':'Feet',
  '악보 표시':'Score marks', '도돌이':'Repeat', '여기서 시작':'Start here', '여기서 끝':'End here',
  '몇 번':'Times', '1·2번 괄호':'1st · 2nd endings', '기호':'Symbols',
  '한 마디 반복 (%)':'One-bar repeat (%)', '% 한 마디 반복':'% one-bar repeat',
  '첫 마디에는 반복 기호를 쓸 수 없습니다 — 앞 마디가 없습니다.':'The first bar cannot be a repeat — there is no bar before it.',
  '가사 · 메모':'Lyrics · notes', '이 마디 표시 지우기':'Clear marks in this bar',
  '제목을 고치면 이름도 같이 바뀝니다':'Renaming the title renames the song',
  '개인정보처리방침':'Privacy policy',

  /* ── 악보 탭 레일 ── */
  '괄호':'Endings', '가':'A', '가사':'Lyrics', '펜':'Pen', '지우기':'Clear',
  '지우개':'Eraser', '이 마디 펜 지우기':'Clear pen in this bar',
  '펜 메모':'Pen notes', '빨강':'Red', '파랑':'Blue', '먹색':'Ink',
  '가는 획':'Thin', '굵은 획':'Thick',
  '줄마디':'Per line', '줄간격':'Spacing', '배경':'Paper', '영상 만들기':'Make video',
  '화면과 PDF·PNG 출력에 같이 적용됩니다.':'Applies to the screen and to PDF/PNG output.',

  /* ── 피드백 줄 ── */
  '의견 보내기':'Send feedback', '오픈채팅':'Open chat', '정보':'About', '베타':'Beta',
  '고장·건의는':'Bugs and requests via', ', 이야기 나누실 건':', chat over on', '으로.':'.',

  /* ── 속성 ── */
  '곡 제목을 입력하세요':'Song title', '직접 입력':'Type your own',
  '예) 여기서 보컬 들어옴':'e.g. vocals come in here',
  '좌우 반전 — 악보를 오른쪽으로':'Mirror — score on the right',
  '되돌리기 (⌘Z)':'Undo (⌘Z)', '다시 실행 (⇧⌘Z)':'Redo (⇧⌘Z)',
  '되돌리기':'Undo', '다시 실행':'Redo',
  '위아래로 끌면 악보 높이가 바뀝니다. 더블탭하면 기본값':'Drag to resize the score. Double-tap to reset.',
  '드래그하면 폭이 바뀝니다. 더블탭하면 입력 패널을 접습니다':'Drag to resize. Double-tap to collapse the input panel.',
  '총 마디 수. −/＋는 4마디 단위, 숫자를 직접 치면 1마디 단위':'Total bars. −/＋ move by 4; type a number for single bars.',
  '화면 모드':'View mode', '좌우 반전':'Mirror',
  '4마디 줄이기':'4 bars fewer', '총 마디 수':'Total bars', '4마디 늘리기':'4 bars more',
  '마디 복사':'Copy bar', '마디 지우기':'Clear bar', '재생':'Play',
  '속도 1 낮추기':'Tempo down 1', '속도 1 높이기':'Tempo up 1',
  '두드려서 템포 맞추기':'Tap tempo', '박에 맞춰 두드리면 템포가 맞춰집니다':'Tap along to the beat to set the tempo',
  '박에 맞춰 계속 두드리세요':'Keep tapping along to the beat',
  '따쿵따다둥 시작 안내':'따쿵따다둥 — welcome', '따쿵따다둥 정보':'About 따쿵따다둥',
  '언어':'Language', 'R·L 위치':'Sticking position', 'Apple Pencil 입력':'Apple Pencil input',
  '악기 설정':'Instrument settings', '패턴 깔기':'Pattern brush', '적용 범위':'Apply to',
  '자주 쓰는 박자표':'Common time signatures', '한 마디의 박 수':'Beats per bar', '박의 단위':'Beat unit',
  '박 나누기':'Beat division', '손 나누기':'Hand division', '발 나누기':'Foot division',
  '악보 표시 도구':'Score mark tools', '지면 · 출력':'Page · export', 'PNG 저장':'Save PNG',

  /* ── JS가 만드는 짧은 글자 (칩·라벨·상태) ── */
  '없음':'None', '인트로':'Intro', '벌스':'Verse', '프리코러스':'Pre-chorus', '코러스':'Chorus',
  '브릿지':'Bridge', '간주':'Interlude', '솔로':'Solo', '아웃트로':'Outro', '코다':'Coda',
  '세뇨':'Segno', '1번':'1st', '2번':'2nd',
  '8분':'8th', '16분':'16th', '4분':'quarter', '32분':'32nd', '비움':'Clear',
  '셋잇단':'triplet', '16분셋':'16th trip', '8분음표':'eighth note', '4분음표':'quarter note',
  // ── 큰 화면 앱 안내 배너 (2026-08-25) ──
  'App Store에서 보기':'View on the App Store',
  'iPad 앱':'iPad app',
  'Android 앱':'Android app', '태블릿 앱 안내':'Tablet app', '태블릿 앱':'Tablet app',
  'Android 태블릿':'Android tablet', '따쿵따다둥 앱 안내':'따쿵따다둥 apps',
  '안내 닫기':'Dismiss',
  // ── 곡 옮기기 (2026-10-11) ──
  '전체 백업 복사':'Copy backup of all', '붙여넣기로 불러오기':'Import from paste', '곡 옮기기':'Move songs',
  '클립보드에서 가져오기':'Paste from clipboard', '다시 복사':'Copy again', '불러오기':'Import',
  '곡 백업 복사':'Copy song backup', '다른 브라우저로 열기':'Open in another browser', '카카오톡 안내':'KakaoTalk notice',
  '백업 복사됨':'Backup copied',
  '옮길 곡이 없습니다.':'There are no songs to move.',
  '붙여 넣은 글자에서 곡을 찾지 못했습니다. 백업 복사한 글자를 통째로 붙여 넣어 주세요.':'No songs found in the pasted text. Paste the whole backup text.',
  '먼저 아래 칸에 붙여 넣어 주세요.':'Paste into the box below first.',
  '클립보드를 읽지 못했습니다. 아래 칸을 길게 눌러 붙여넣기 해 주세요.':'Could not read the clipboard. Press and hold the box below and paste.',
  '저장 공간이 부족해 일부만 불러왔습니다.':'Storage is full — only some songs were imported.',
  '아이패드 앱 안내':'iPad app'
,
  // ── 2박 3연음 · 붙임줄 (2026-08-24) ──
  '8분셋':'8th trip', '취소':'Cancel', '확인':'OK', '셈여림':'Dynamics', '크레센도 · 디크레센도':'Crescendo · Diminuendo',
  '크레센도 <':'Crescendo <', '디크레센도 >':'Diminuendo >', '{n}박':'Beat {n}', '{n}박부터':'From beat {n}', '헤어핀 없음':'No hairpin', '앞과 이어서':'Join previous', '여기서 새로':'Start new here', '5연음':'quintuplet', '7연음':'septuplet', '반박씩 섞기':'Mix half beats',
  '16분+셋':'16th + trip', '셋+16분':'trip + 16th', '8분+셋':'8th + trip', '셋+8분':'trip + 8th',
  '16분+32분':'16th + 32nd', '32분+16분':'32nd + 16th', '셋+셋':'trip + trip',
  '{a}·{b}박 묶어 2박 3연음':'Merge beats {a}·{b} — quarter triplet',
  '2박 묶기 해제':'Unmerge beats',
  '{a}·{b}박 나누기':'Divide beats {a}·{b}',
  '붙임줄':'Tie',
  '붙임줄 — 앞 음과 잇기':'Tie — join to previous note',
  // 펜 토스트 (2026-08-27). 안드로이드 작업이 이 문구를 t()로 감쌌는데 영어 열쇠가
  // 없어 **영어 화면에 한글 토스트가 떴다.** verify-i18n은 정적 화면만 훑으므로
  // 비동기 토스트를 못 잡는다(8-43과 같은 자리). 'Apple Pencil'은 PEN_BRAND가
  // 치환하므로 영어 문장에도 그대로 둔다 — 안드로이드에서 'Stylus'로 바뀐다.
  'Apple Pencil로 입력했습니다. <b>손가락은 넘기기 전용</b>으로 둘까요?':
    'You drew with Apple Pencil. Make <b>finger touch scroll-only</b>?',
  '그렇게':'Do that',
  '마디의 첫 음에는 붙임줄을 걸 수 없습니다 — 앞에 이을 음이 없습니다.':
    'The first note of a bar cannot take a tie — there is no earlier note to join.',
  '점4분음표':'dotted quarter', '4분·점4분':'quarter · dotted quarter',
  '나누기':'Division', '무제':'Untitled', '방금':'just now', '지금':'open',
  '일 전':'d ago', '분 전':'m ago', '시간 전':'h ago',
  '가로 Full HD':'Landscape Full HD', '세로 쇼츠 9:16':'Vertical 9:16',
  '영상 악보 (MP4)':'Video score (MP4)', '악보 굽기 실패':'Could not render the score',
  '만드는 중 {n}%':'Rendering {n}%',
  '영상이 만들어졌습니다 — {f} ({m}MB)':'Video ready — {f} ({m}MB)',
  '영상을 만들지 못했습니다: {e}':'Could not make the video: {e}',
  '정지':'Stop', '연습 정지':'Stop practice',
  '타이밍 안정적':'Steady timing',
  '박자가 뒤로 처집니다(드래그)':'you are dragging',
  '박자를 앞으로 몰아칩니다(러시)':'you are rushing',
  '평균 BPM':'Average BPM', '최고 BPM':'Fastest BPM', '최저 BPM':'Slowest BPM',
  '총 연습 시간':'Practice time',   // 연습 패널의 좁은 칸에 들어가야 한다
  '오늘 기록 없음':'Nothing logged today',
  '오늘은 아직':'Nothing yet today', '연속 끊김':'streak broken',
  '4분음표 기준':'quarter-note beat', '기준입니다':'',
  '따쿵따다둥 베타':'따쿵따다둥 Beta',
  '따쿵따다둥 — 드럼 악보':'따쿵따다둥 — drum notation',
  '따쿵따다둥 — 스마트폰으로 그리는 드럼 악보':'따쿵따다둥 — drum notation on your phone',
  '웹에서는 모든 기능이 열려 있습니다.':'Everything is unlocked on the web.',
  '연습기가 열려 있습니다.':'Practice tools are unlocked.',
  '음표가 든 악기는 악보를 열 때 자동으로 다시 켜집니다.':
    'An instrument that has notes turns itself back on when the score opens.',
  '드러머를 위한, 쉽고 빠른 채보 도구입니다.':'A fast, simple way for drummers to write what they play.',
  '악기를 하나는 남겨 두세요.':'Keep at least one instrument.',
  '구매를 복원했습니다.':'Purchase restored.',
  '웹에서는 복원할 것이 없습니다.':'Nothing to restore on the web.',
  '웹에서는 결제가 없습니다 — 모든 기능이 이미 열려 있습니다.':
    'No payments on the web — everything is already unlocked.',
  '스토어를 여는 중…':'Opening the store…',
  '구매 내역을 확인하는 중…':'Checking your purchases…',
  '이 Apple 계정으로 구매한 내역이 없습니다.':'No purchase found for this Apple account.',
  '지금은 스토어에 닿지 못했습니다. 잠시 뒤 다시 시도해 주세요.':
    'Could not reach the store. Please try again in a moment.',
  '복원했습니다. 연습기가 열렸습니다.':'Restored — practice tools are unlocked.',
  '스피드 트레이너와 구간 반복이 잠겨 있습니다.':'Speed trainer and loop are locked.',
  '그 곡을 찾지 못했습니다.':'Could not find that song.',
  '그 곡이 손상됐습니다.':'That song is damaged.',
  '그림을 만들지 못했습니다.':'Could not make the image.',
  'PDF를 만들지 못했습니다.':'Could not make the PDF.',
  'PDF 기능을 불러오지 못했습니다.':'Could not load the PDF feature.',
  '악보 높이를 기본으로 되돌렸습니다.':'Score height reset.',
  '읽을 수 있는 파일이 아닙니다.\n악보 파일(.ddakung.json)이 맞는지 확인해 주세요.':
    'That file cannot be read.\nCheck that it is a .ddakung.json score file.',
  '따쿵따다둥에서 저장한 악보 파일이 아닙니다.\n"저장"으로 만든 .ddakung.json 파일을 골라 주세요.':
    'That is not a 따쿵따다둥 score file.\nPick a .ddakung.json made with Save.',
  '파일을 읽지 못했습니다.\niCloud에 있는 파일이면 먼저 내려받은 뒤 다시 시도해 주세요.':
    'Could not read the file.\nIf it lives in iCloud, download it first and try again.',
  '악보를 여는 중 문제가 생겼습니다. 파일이 손상됐을 수 있습니다.':
    'Something went wrong opening the score. The file may be damaged.',
  '한 마디에 담을 수 있는 획(40개)이 가득 찼습니다.':'This bar is full — 40 pen strokes maximum.',
  '이 브라우저는 영상 만들기를 지원하지 않습니다':'This browser cannot make video',
  '녹화 중 {n}%':'Recording {n}%', '녹화된 영상이 비었습니다':'The recording came out empty',
  '이 기기에서는 곡 길이만큼 실시간으로 녹화합니다':'On this device the video records in real time — it takes as long as the song',
  'PDF를 저장하지 못했습니다.':'Could not save the PDF.',
  '이 브라우저에 쓸 수 있는 영상 인코더가 없습니다':'No usable video encoder in this browser',
  '악보가 너무 길어 PNG로 담기지 않습니다. PDF로 저장해 주세요.':
    'The score is too long for a PNG. Save as PDF instead.',
  '악보 이미지를 만들지 못했습니다. PDF로 저장해 주세요.':
    'Could not make the score image. Save as PDF instead.',
  '저장 공간이 부족해 복제하지 못했습니다.':'Not enough storage to duplicate.',
  '이 브라우저는 저장이 막혀 있어 곡을 보관할 수 없습니다. 파일로 저장해 주세요.':
    'This browser blocks storage, so songs cannot be kept. Save to a file instead.',

  /* ── 숫자가 끼는 문구. `{n}`은 그대로 두고 부르는 쪽이 갈아 끼운다 ── */
  '{n}마디':'Bar {n}', '{n}마디에 적용':'Applying to bar {n}',
  '{n}마디부터 새 줄 · 한 줄에':'New line from bar {n} · bars per line',
  '한 마디 <b>{n}박</b> · 박의 길이 <b>{unit}</b>':'<b>{n}</b> beats per bar · beat is a <b>{unit}</b>',
  '8분음표 셋이 한 박입니다. 메트로놈도 그 단위로 셉니다.':
    'Three eighths make one beat — the metronome counts that way too.',
  '{n}마디 표시를 지웠습니다.':'Cleared the marks in bar {n}.',
  '{n}마디의 펜 메모를 지웠습니다.':'Cleared the pen notes in bar {n}.',
  '{n}마디에는 펜 메모가 없습니다.':'Bar {n} has no pen notes.',
  '{n}개가 보입니다 — 숨김: ':'{n} showing — hidden: ',
  '{n}개 모두 보입니다.':'All {n} are showing.',
  '{n}곡 · 자동 저장은 이 브라우저 안에만 있습니다. 중요한 곡은 파일로도 저장하세요.':
    '{n} songs · autosave lives in this browser only. Save the ones that matter to a file too.',
  '복사 {n}마디':'Copy {n} bars', '붙여넣기 {n}마디':'Paste {n} bars', '선택 {n}마디':'{n} bars selected',
  '끼워넣기 {n}마디':'Insert {n} bars',
  '{n} 작사':'Words by {n}', '{n} 작곡':'Music by {n}',
  '{n} 편곡':'Arr. {n}', '{n} 노래':'Performed by {n}',
  '곡 정보':'Song details', '곡정보':'Song info', '제목':'Title', '머리말 글자':'Header text',
  '템포 표기':'Tempo mark', '없음':'None',
  '부제':'Subtitle', '작사':'Lyrics', '작곡':'Music',
  '편곡':'Arrangement', '노래':'Performer', '저작권':'Copyright',
  '악보 머리말에 나옵니다':'Printed in the score heading',
  '악보 스타일':'Score style', '클래식':'Classic', '재즈':'Jazz', '손사보':'Handwritten',
  '단 간격 (악보 줄 사이)':'System spacing', '단 간격':'System spacing',
  '좁게':'Tight', '보통':'Normal', '넓게':'Wide',
  '곡 정보 — 작사 · 작곡 · 저작권':'Song details — words, music, copyright',
  '© 2026 이름':'© 2026 Name',
  '{n}마디 — 두 번 누르면 이 마디만 재생 · 길게 눌러 끌면 자리를 옮깁니다':
    'Bar {n} — double-tap to play just this bar · press and hold to drag it elsewhere',
  '뒤쪽 {n}마디를 지웁니다. 그중 {k}마디에 음표가 있습니다.\n계속할까요? (되돌리기 가능)':
    'Delete the last {n} bars? {k} of them contain notes.\nContinue? (You can undo.)',
  '"{name}"을(를) 지울까요?\n되돌릴 수 없습니다.':'Delete "{name}"?\nThis cannot be undone.',
  '{n}마디를 지웁니다. 그중 {k}마디에 음표가 있습니다.\n계속할까요? (되돌리기 가능)':
    'Delete {n} bars? {k} of them contain notes.\nContinue? (You can undo.)',
  '마디는 400개까지입니다.':'A song can hold up to 400 bars.',
  '시간':'h', '분':'m', '타':' hits',
  '8비트 그루브 — 예제':'8-beat groove — example',
  '{name} 사본':'{name} copy',
  '이 박자표에서는 {unit} 기준입니다':'In this time signature the beat is a {unit}',
  '메트로놈 — 꺼짐. 누르면 박을 들려줍니다':'Metronome off — tap to hear the beat',
  '메트로놈 켜짐. 한 번 더 누르면 예비박까지':'Metronome on — tap again to add a count-in',
  '메트로놈 + 예비박 — 재생 전에 한 마디를 세어 줍니다':
    'Metronome + count-in — counts one bar before playing',
  '{n}박 나누기 — 손 {h} · 발 {f}':'Beat {n} division — hands {h} · feet {f}',
  '{ins}에 한 박 패턴 깔기':'Brush one beat of {ins}',
  '{ins}에 패턴 깔기':'Pattern brush for {ins}',
  '{n}마디 — 두 번 누르면 이 마디만 재생':'Bar {n} — double-tap to play just this bar',
  '{ins} 숨기기':'Hide {ins}', '{ins} 보이기':'Show {ins}',
  '{ins} 위로':'Move {ins} up', '{ins} 아래로':'Move {ins} down',
  '{list}번째 16분':'16ths {list}',
  '{ins} 이름 바꾸기':'Rename {ins}', '기본 이름: {ins}':'Default name: {ins}',
  '{ins}에 음표가 있습니다 — 숨겨도 지워지지 않습니다.':
    '{ins} has notes — hiding it does not delete them.',
  /* ── 카피 모드 (2026-10-16) ── */
  '유튜브 링크를 붙여넣으세요':'Paste a YouTube link', '유튜브 링크':'YouTube link',
  '유튜브 링크를 붙여넣으면 여기서 재생됩니다.':'Paste a YouTube link and it plays here.',
  '속도를 줄여 들으면서 아래 그리드에 그리세요.':'Slow it down and write it on the grid below.',
  'YouTube에서 열기':'Open in YouTube', '5초 뒤로':'Back 5 s', '2초 뒤로':'Back 2 s',
  '재생 속도':'Playback speed', '일시정지':'Pause',
  '지금 위치를 반복 시작점으로':'Set loop start here', '지금 위치를 반복 끝점으로':'Set loop end here',
  '유튜브 링크를 알아볼 수 없습니다.':'That doesn\'t look like a YouTube link.',
  '이 영상은 다른 앱에서 재생하지 못하게 막혀 있습니다.':'The owner blocks this video from playing in other apps.',
  '재생할 수 없는 영상입니다.':'This video can\'t be played.',
  '플레이어를 열 수 없습니다.':'The player couldn\'t start.',
  '인터넷에 연결되어 있지 않습니다.':'You\'re offline.',
  '끝점(B)은 시작점(A)보다 뒤여야 합니다.':'The end (B) must come after the start (A).',
  'A와 B를 먼저 찍으세요.':'Set A and B first.', '영상 바꾸기':'Change video', '반복 지점 지우기':'Clear loop points',
  /* ── 라이브러리 · PC 스튜디오 (2026-10-20) ── */
  '총 {n}마디':'{n} bars',
  '라이브러리':'Library',
  '라이브러리 (L)':'Library (L)',
  '책갈피':'Bookmark',
  '책갈피 (B) — 고른 마디에 꽂거나 뺍니다':'Bookmark (B) — add or remove on the selected bar',
  '곡 제목 · 책갈피 찾기':'Search titles and bookmarks',
  '정렬':'Sort',
  '최근 수정순':'Recently edited',
  '최근 연 순':'Recently opened',
  '제목순':'Title',
  '마디 많은 순':'Most bars',
  '라이브러리 닫기 (Esc)':'Close library (Esc)',
  '라이브러리 보기':'Library views',
  '즐겨찾기':'Favorites',
  '최근 악보':'Recent',
  '파일 열기':'Open file',
  '여기에 놓으면 새 곡으로 들어옵니다':'Drop here to add as new songs',
  '.ddakung.json 악보 파일 · 여러 개를 한 번에':'.ddakung.json score files · several at once',
  'PC 스튜디오':'PC studio',
  '큰 화면에서 쓰는 드럼 악보 스튜디오입니다. 지금은 테스터에게만 열려 있습니다 — 받은 코드를 넣어 주세요.':'The drum notation studio for big screens. It is open to testers for now — enter the code you received.',
  '테스터 코드':'Tester code',
  '무료 버전으로':'Free version',
  '{n}곡 · 이 브라우저 안에 저장됩니다. 중요한 곡은 파일로도 저장하세요.':'{n} songs · saved in this browser only. Save important songs as files too.',
  '{n}곡 · 이 기기 안에 저장됩니다. 중요한 곡은 파일로도 저장하세요.':'{n} songs · saved on this device. Save important songs as files too.',
  '전체 악보':'All scores',
  '최근에 연 순서 · {n}곡까지':'By last opened · up to {n}',
  '찾는 곡이 없습니다':'No matching songs',
  '제목이나 책갈피 이름의 일부만 넣어도 찾습니다.':'Part of a title or bookmark name is enough.',
  '즐겨찾기가 비어 있습니다':'No favorites yet',
  '카드 오른쪽 위의 별을 누르면 자주 쓰는 곡이 여기 모입니다.':'Tap the star on a card to keep your go-to songs here.',
  '아직 곡이 없습니다':'No songs yet',
  '＋ 새 곡으로 시작하거나 .ddakung.json 파일을 이 창에 끌어다 놓으세요.':'Start with + New song, or drop .ddakung.json files onto this window.',
  '지금 열린 곡':'Open now',
  '이 마디로 열기':'Open at this bar',
  '책갈피 전부 보기':'Show all bookmarks',
  '{n}개':'{n}',
  '찾는 책갈피가 없습니다':'No matching bookmarks',
  '곡 제목이나 책갈피 이름의 일부만 넣어도 찾습니다.':'Part of a song title or bookmark name is enough.',
  '책갈피가 없습니다':'No bookmarks yet',
  '편집 화면에서 마디를 고르고 「책갈피」(키보드 B)를 누르면 여기 모입니다. 연습할 자리로 바로 갑니다.':'Pick a bar in the editor and press Bookmark (key B) — it lands here, one click from the spot you practice.',
  '곡 열기':'Open song',
  '이동':'Go',
  '책갈피 빼기':'Remove bookmark',
  '이름 (예: 후렴 · 필인 연습)':'Name (e.g. Chorus · fill practice)',
  '책갈피 이름':'Bookmark name',
  '저장 공간이 부족해 책갈피를 고치지 못했습니다.':'Storage is full — the bookmark wasn\'t changed.',
  '{n}마디 책갈피를 뺐습니다.':'Removed the bookmark at bar {n}.',
  '<b>{n}마디</b>에 책갈피를 꽂았습니다.':'Bookmarked <b>bar {n}</b>.',
  '악보 파일(.ddakung.json)만 넣을 수 있습니다.':'Only score files (.ddakung.json) can be added.',
  '<b>{n}곡</b>을 라이브러리에 넣었습니다.':'Added <b>{n} songs</b> to the library.',
  '넣은 곡이 없습니다.':'No songs were added.',
  '악보 파일이 아니어서 건너뜀: {n}개':'Skipped (not a score file): {n}',
  '저장 공간이 차서 일부를 못 넣었습니다.':'Storage is full — some were not added.',
  '코드가 맞지 않습니다.':'That code isn\'t right.',
  '이 브라우저는 저장이 막혀 있어 코드를 기억할 수 없습니다.':'This browser blocks storage, so the code can\'t be remembered.',
  /* ── 악보 보기 · 메모 (2026-10-20) ── */
  '악보 보기':'Score view',
  '악보 보기 · 메모':'View score · notes',
  '이 마디에서 악보 보기':'View from this bar',
  '메모 {n}':'{n} notes',
  '← 라이브러리':'← Library',
  '라이브러리로 (Esc)':'Back to library (Esc)',
  '메모 도구':'Note tools',
  '보기':'View',
  '보기 (V)':'View (V)',
  '펜 (P)':'Pen (P)',
  '형광펜':'Highlighter',
  '형광펜 (H)':'Highlighter (H)',
  '글 메모':'Text note',
  '글 메모 (T) — 누른 자리에 씁니다':'Text note (T) — writes where you click',
  '지우개 (E) — 누르거나 문지르면 지웁니다':'Eraser (E) — click or rub to erase',
  '굵게':'Thick',
  '메모 숨기기':'Hide notes',
  '메모 모두 지우기':'Clear all notes',
  '축소':'Zoom out',
  '축소 (⌘−)':'Zoom out (⌘−)',
  '확대':'Zoom in',
  '확대 (⌘+)':'Zoom in (⌘+)',
  '화면 폭에 맞추기 (⌘0)':'Fit to width (⌘0)',
  '▶ 재생':'▶ Play',
  '■ 정지':'■ Stop',
  '재생 (Space)':'Play (Space)',
  '인쇄':'Print',
  '메모까지 같이 인쇄 · PDF로 저장':'Print with notes · save as PDF',
  '편집하기':'Edit',
  '메모를 쓰고 Enter':'Type a note, then Enter',
  '{p}쪽':'{p} pages',
  '메모 {n}개':'{n} notes',
  '초록':'Green',
  '노랑':'Yellow',
  '연두':'Lime',
  '분홍':'Pink',
  '하늘':'Sky',
  '지울 메모가 없습니다.':'There are no notes to clear.',
  '이 곡의 메모 {n}개를 모두 지울까요?\n되돌리기(⌘Z)로 다시 살릴 수 있습니다.':'Clear all {n} notes in this song?\nUndo (⌘Z) brings them back.',
  '모두 지우기':'Clear all',
  '한 마디에 담을 수 있는 메모(80개)가 가득 찼습니다.':'This bar already holds the maximum of 80 notes.',
  /* ── 열기 방식 · 라이브러리에 저장 (2026-10-20) ── */
  '라이브러리로 돌아가기':'Back to library', '라이브러리로 돌아가기 (Esc)':'Back to library (Esc)',
  '라이브러리에 저장':'Save to library',
  '전체화면 보기':'Full-screen view',
  '편집에서 열기':'Open in editor',
  '전체화면 보기 · 편집에서 열기':'Full-screen view · open in editor',
  '이 마디에서 열기':'Open at this bar',
  '이 마디에서 전체화면 보기':'Full-screen view from this bar',
  '이 마디에서 편집':'Edit at this bar',
  '여는 방식':'How to open',
  '{n}마디부터':'From bar {n}',
  '어떻게 열까요?':'How do you want to open it?',
  '라이브러리 열기':'Open library',
  '<b>{name}</b>을(를) 라이브러리에 저장했습니다.':'Saved <b>{name}</b> to the library.',
  '제목을 넣으면 라이브러리에서 찾기 쉽습니다.':'Add a title to find it easily in the library.',
  '저장 공간이 부족해 라이브러리에 넣지 못했습니다.':'Storage is full — it couldn\'t be saved to the library.',
  /* ── 연습 기록장 · 일기장 (2026-10-21) ── */
  '기록':'Logs',
  '연습 기록장':'Practice log',
  '일기장':'Diary',
  '연습할 때마다 한 줄':'One line per session',
  '날짜':'Date',
  '시각':'Time',
  '연습 시간':'Practice time',
  '기분':'Mood',
  '힘듦':'Rough',
  '별로':'Meh',
  '좋음':'Good',
  '최고':'Great',
  '한 단어(선택)':'One word (optional)',
  '기분 한 단어':'Mood in a word',
  '연습한 악보':'Scores practiced',
  '라이브러리에서 악보 붙이기':'Attach a score from the library',
  '＋ 라이브러리에서 악보 붙이기':'+ Attach a score from the library',
  '메모':'Note',
  '예: 16비트 100까지 깨끗하게. 왼손 고스트가 커짐':'e.g. Clean 16ths up to 100. Left-hand ghosts getting loud',
  '저장 (⌘Enter)':'Save (⌘Enter)',
  '연습 기록 고치기':'Edit practice entry',
  '주':'Week',
  '월':'Month',
  '연':'Year',
  '이전':'Previous',
  '다음':'Next',
  '＋ 연습 기록':'+ Log practice',
  '적은 연습 시간':'Logged practice',
  '연습한 날':'Days practiced',
  '기분 평균':'Average mood',
  '앱이 잰 재생 시간':'Playback time measured by the app',
  '이 날 기록 더하기':'Add an entry for this day',
  '고치기':'Edit',
  '이번 주 기록이 없습니다':'No entries this week',
  '이 달 기록이 없습니다':'No entries this month',
  '이 날은 기록이 없습니다':'No entries on this day',
  '연습을 마치면 「＋ 연습 기록」으로 한 줄 남겨 보세요. 시간은 앱이 잰 값으로 채워 둡니다.':'After practicing, leave a line with “+ Log practice”. The time is prefilled from what the app measured.',
  '빼기':'Remove',
  '날짜를 골라 주세요.':'Pick a date.',
  '시간·기분·메모·악보 중 하나는 적어 주세요.':'Fill in at least one of time, mood, note or score.',
  '저장 공간이 부족해 기록하지 못했습니다.':'Storage is full — the entry wasn\'t saved.',
  '{d} 연습을 적었습니다.':'Logged practice for {d}.',
  '이 연습 기록을 지울까요?':'Delete this practice entry?',
  '오늘 일기':'Today\'s entry',
  '찾는 일기가 없습니다.':'No matching entries.',
  '아직 쓴 일기가 없습니다.':'No diary entries yet.',
  '오늘 연습은 어땠나요. 짧게 적어도 됩니다.':'How was practice today? A few words is enough.',
  '악보 붙이기':'Attach a score',
  '이 날 일기 지우기':'Delete this day\'s entry',
  '저장됨':'Saved',
  '라이브러리에 없는 곡입니다':'Not in the library',
  '라이브러리에 없는 곡입니다. 지운 곡일 수 있습니다.':'That score isn\'t in the library — it may have been deleted.',
  '{d} 일기를 지울까요?':'Delete the diary entry for {d}?',
  '저장 공간이 부족해 일기를 저장하지 못했습니다.':'Storage is full — the diary entry wasn\'t saved.',
  '연습 기록·일기 {n}개를 합쳤습니다.':'Merged {n} practice and diary entries.',
};

/* 긴 문단은 **통째로** 갈아 끼운다. `<b>`가 섞인 문장을 조각내어 옮기면
   "이라, 기능이" 같은 토막이 열쇠가 되고, 영어는 어순이 달라 조각이 안 맞는다.
   그래서 문단에는 `data-i18n-html="열쇠"`를 달고 여기서 통째로 찾는다. */
const EN_HTML = {
  'promo.pad':'<b>Have a tablet? 따쿵따다둥</b> — side-by-side score and grid, speed trainer, pen notes. iPad · Android tablets.',
  'store.lead':'On a tablet, the app gives you more room.',
  'store.body':'<b>Side-by-side score</b> · <b>speed trainer</b> · <b>loop a section</b> · <b>pen notes</b>.<br>' +
    'Buy once and keep it. No subscription.',
  'store.fine':'Tablet-only app. On a phone, just keep using this site.',
  'intro.lead':'A fast, simple way for drummers to write what they play.',
  'intro.whatsnew':'<b>New in 2.1</b><br>' +
    '<b>Library</b> — your saved scores as cards · favourites, recent and bookmarks · pen, highlighter and text notes in full-screen view · ' +
    'practice log and diary.<br>' +
    '<b>Metronome</b> — starts the moment you touch it · bigger play button and setlist · in Basic, tap any pad to start and stop · ' +
    'visual delay compensation for Bluetooth earphones · fixed a hand-picked time signature snapping back.<br>' +
    '<b>Drum volume</b> (overall and per instrument, clicks unchanged) · <b>score size</b> 90–150% · <b>⊗ crash</b> noteheads (settings) · ' +
    'voice-count timing · fixed stutter on dense scores · fixed blank PDFs on Android.',
  'intro.prev':'Previously — the drummer metronome (2.0) · tap tempo · mixed half beats · back-to-back hairpins · Mac save panel and video · ' +
    'dynamics and hairpins · quintuplets and septuplets · ruffs and grace-note instruments · ' +
    'per-bar time signatures · cross-stick and rim shot · video score (MP4) · Apple Pencil notes · R·L sticking.',
  'intro.beta':'This is a <b>beta</b>, so features may change or disappear without notice.',
  'intro.save':'<b>Your score is saved automatically on this device.</b><br> Refresh or close the ' +
    'tab and it opens right back up. But it lives <b>inside this browser only</b> — change device ' +
    'or clear browser data and it is gone. For scores you want to keep, use <b>Save</b> to download ' +
    'a file.',
  'intro.early':'Thanks for trying it early. Tell me what breaks or what you wish it did, and ' +
    'it goes into the next version.',
  'practice.hint':'Pick a range and press <b>Start practice</b> — it loops just those bars. Turn on ' +
    'the speed trainer and the tempo climbs on its own every pass.<br>Your <b>practice time builds ' +
    'up</b> while it runs. The numbers above are exactly what goes on your practice card.',
  'feedback.tip':'Bugs and requests via <b>Send feedback</b>; chat over on <b>Open chat</b>.',
  'hist.fine':'Time builds up while playback or practice runs. It stays on this device — clearing ' +
    'browser data clears it.',
  'cert.fine':'Pick a photo and it goes on the photo; without one it uses the score card. Photo and ' +
    'stats <b>never leave your device</b> — only the finished image is saved.',
  'save.file':'Reopens for further editing. Use this for scores you want to keep.',
  'save.perline':'A line with very dense bars (32nds and the like) narrows on its own.',
  'save.secbreak':'When on, a bar carrying a <b>section name</b> always starts a new line.',
  'set.langnote':'Only the interface text changes. Your scores, song titles and any instrument ' +
    'names you renamed stay exactly as they are.',
  'set.crash':'With ⊗, crash notes stand apart from the ride (x) at a glance. Sound and saved files stay the same.',
  'set.stems':'Bars where hands and feet divide the beat differently cannot merge, and split ' +
    'automatically.',
  'set.met':'The voice counts <b>one · two · three · four</b>. Either way the first beat is accented.',
  'set.kit':'Only the playback sound changes. <b>The score stays the same.</b>',
  'set.paper':'PNG follows the background you pick. <b>Printing is always on white paper</b> — it ' +
    'saves ink, and inverted would print nothing at all.',
  'set.textsize':'Size of the lyrics and notes written under each bar. Print, PNG and video follow ' +
    'it too. Larger text <b>opens up the gap between systems</b> so nothing collides.',
  'set.gap':'Applies to both the screen and print. <b>Tight</b> fits more systems on a page.',
  'set.stick':'Pick <b>R·L</b> in the notation row and tap a note. Hand instruments only — never feet.',
  'set.pen':'<b>Pencil only</b> makes fingers page-turn only — your hand can rest on the screen ' +
    'while you write. The pencil can drag across cells to fill them.',
  'roster.fine':'Hiding an instrument never deletes its notes.',
  'pro.fine':'Buy once, keep it. Not a subscription.',
  'pro.restore':'Changed devices? Press <b>Restore purchase</b>. Same Apple account, no second charge.',
  'info.privacy':'<b>Your score never leaves your device.</b><br> There are no accounts, and ' +
    'nothing you write is sent to a server or stored there. Autosave lives inside this browser ' +
    'only — use <b>Save</b> to download a file for anything you want to keep.',
  'info.lic':'Music symbols — Bravura © Steinberg Media Technologies GmbH, SIL Open Font License 1.1' +
    '<br> Typeface — Pretendard © Hyung-Jin Kil (orioncactus), SIL Open Font License 1.1' +
    '<br> Metronome typeface — Freesentation © The Freesentation Authors, SIL Open Font License 1.1',
  'pro.li1':'<b>Speed trainer</b> — BPM steps up on its own every few passes',
  'pro.li2':'<b>Loop</b> — pick the bars you cannot play and run them over and over',
  'ts.note':'5/8 and 7/8 group differently from song to song. The grouping is the beat, and beams ' +
    'follow it.',
  'mark.dyn':'Marks of the same kind on neighbouring bars join into one line. Select several bars first ' +
    'to set them all at once. For two hairpins back to back, pick <b>Start new here</b> on the first bar ' +
    'of the second one. Playback volume does not change.',
  'div.note':'3 = triplets across the beat, 6 = triplets on every eighth, 5·7 = quintuplets and ' +
    'septuplets. 2+3 = two 16ths, then a 16th triplet on the second half; 2+4 = two 16ths, then four 32nds. Set hands and feet ' +
    'differently for polyrhythm.',
  'mark.nav':'Playback follows the symbols — D.S. jumps to the segno, D.C. to the top, and on the ' +
    'way back to Coda and Fine take effect.',
  'rail.pen':'Draw with the pencil (or mouse); <b>scroll with your finger</b>.<br> Strokes belong to ' +
    'the bar you drew them on and follow it into print, PNG and video.',
  'rail.paper':'Applies to the screen and to PDF/PNG output.',
  'mark.rpt':'Use % for a bar that repeats the one before. If the bar is empty, the previous bar\'s notes are copied in, and the score shows only the sign.',
  'save.multirest':'When on, <b>consecutive empty bars</b> fold into one bar showing the count (multi-bar rest). A bar with a section name or symbols ends the group.',
  'save.sext':'Choose whether the <b>secondary beam</b> of a sextuplet breaks 3+3 or runs through all six notes. The 6 stays either way.',
  'rail.linebreak':'A bar marked ↵ starts a new line, and lines fold by that number until the next ↵. None follows the setting above.',
  'rail.mp4':'The score scrolls past a fixed playhead. No audio. Repeats and symbols are not ' +
    'expanded — bars run in order.',
  'png.hint':'You can also <b>press and hold</b> the image to add it to Photos.',
  'metro.acc':'Tap a pad to choose its sound — <b>accent · ghost · rim · hi-hat</b> and more.',
  'kakao.bar':'<b>You are inside KakaoTalk.</b> Songs made here stay inside KakaoTalk only, and file saving is blocked. Move them to Chrome or Samsung Internet.',
};

function t(s){
  if(LANG !== 'en' || typeof s !== 'string') return s;
  return Object.prototype.hasOwnProperty.call(EN, s) ? EN[s] : s;
}

/* ── 화면 글자 갈아 끼우기 ────────────────────────────
   원문을 노드마다 기억해 두고 `t()`를 다시 먹인다. 그래서 **왕복이 정확하다** —
   영어로 갔다가 한국어로 돌아오면 원래 글자 그대로다.

   "우리가 마지막에 넣은 값"도 같이 기억한다. 지금 값이 그것과 다르면 **남이 고친 것**이므로
   그 값을 새 원문으로 삼는다 — 안 그러면 JS가 갈아 끼운 글자를 옛 원문으로 되돌려 버린다.

   훑지 않는 곳: `svg`(악보 — 구간 이름·가사는 **사용자가 쓴 글**이다) · `#printArea` ·
   `script`/`style`/`textarea` · `data-no-i18n`이 붙은 가지. */
const _i18nKo  = new WeakMap();   // 노드 → 원문
const _i18nSet = new WeakMap();   // 노드 → 우리가 마지막에 넣은 값
const _i18nAttr = new WeakMap();  // 요소 → {속성: {ko, set}}
const I18N_ATTRS = ['placeholder', 'title', 'aria-label', 'aria-valuetext'];
const I18N_SKIP_TAG = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'SVG', 'CANVAS']);

/* 앞뒤 공백은 **떼어 놓고** 가운데만 옮긴다. HTML의 들여쓰기가 그대로 텍스트 노드에
   들어오므로("\n      마디\n    "), 통째로 열쇠를 삼으면 사전이 영영 안 맞는다.
   옮긴 뒤 원래 공백을 도로 붙여야 줄바꿈·띄어쓰기가 안 무너진다. */
const I18N_WS = /^(\s*)([\s\S]*?)(\s*)$/;
function i18nText(n){
  const cur = n.nodeValue;
  if(!cur || !cur.trim()) return;
  if(_i18nSet.get(n) !== cur) _i18nKo.set(n, cur);
  const ko = _i18nKo.get(n);
  const m = I18N_WS.exec(ko);
  const out = m ? (m[1] + t(m[2]) + m[3]) : t(ko);
  if(out !== cur) n.nodeValue = out;
  _i18nSet.set(n, n.nodeValue);
}
function i18nAttrs(el){
  let box = _i18nAttr.get(el);
  for(const a of I18N_ATTRS){
    if(!el.hasAttribute(a)) continue;
    const cur = el.getAttribute(a);
    if(!box){ box = {}; _i18nAttr.set(el, box); }
    const rec = box[a] || (box[a] = {ko: cur, set: null});
    if(rec.set !== cur) rec.ko = cur;
    const out = t(rec.ko);
    if(out !== cur) el.setAttribute(a, out);
    rec.set = el.getAttribute(a);
  }
}
const _i18nHtml = new WeakMap();   // 요소 → 원문 innerHTML
function i18nBlock(el){
  const key = el.getAttribute('data-i18n-html');
  if(!_i18nHtml.has(el)) _i18nHtml.set(el, el.innerHTML);
  const ko = _i18nHtml.get(el);
  const en = EN_HTML[key];
  const want = (LANG === 'en' && en) ? en : ko;
  if(el.innerHTML !== want) el.innerHTML = want;
}
function applyLang(root){
  const start = root || document.body;
  if(!start) return;
  const w = document.createTreeWalker(start, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode(n){
      if(n.nodeType === 1){
        if(I18N_SKIP_TAG.has(n.nodeName.toUpperCase())) return NodeFilter.FILTER_REJECT;
        if(n.id === 'printArea') return NodeFilter.FILTER_REJECT;
        if(n.hasAttribute && n.hasAttribute('data-no-i18n')) return NodeFilter.FILTER_REJECT;
        // 통째로 바꾸는 문단은 속성만 손보고 안쪽은 걷지 않는다
        if(n.hasAttribute && n.hasAttribute('data-i18n-html')){
          i18nAttrs(n); i18nBlock(n); return NodeFilter.FILTER_REJECT;
        }
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  if(start.nodeType === 1) i18nAttrs(start);
  let n;
  while((n = w.nextNode())){
    if(n.nodeType === 1) i18nAttrs(n);
    else i18nText(n);
  }
  document.documentElement.lang = LANG;
}
/* 고른 언어에 알약을 맞춘다. 설정 서랍이 아직 안 만들어진 시점에도 불릴 수 있어
   요소가 없으면 조용히 빠진다 — 부팅 끝에서 한 번, 언어를 바꿀 때마다 한 번 돈다. */
function refreshLangUI(){
  const box = document.getElementById('langScope');
  if(box) box.querySelectorAll('button').forEach(b=>
    b.classList.toggle('sel', b.dataset.lang === LANG));
}
function setLang(v){
  if(!LANGS.includes(v) || v === LANG) return;
  LANG = v;
  try{ localStorage.setItem(LANG_KEY, v); }catch(e){}
  applyLang();
  if(typeof refreshLangUI === 'function') refreshLangUI();
  /* 악기 이름은 `INSTR`에 굳어 있다 — 로스터를 다시 만들어야 입력판·악보가 새 이름을 쓴다 */
  if(typeof rebuildRoster === 'function') rebuildRoster();
  if(typeof buildGrid === 'function') buildGrid();
  if(typeof renderScore === 'function') renderScore();
  if(typeof refreshAll === 'function') refreshAll();
  if(typeof track === 'function') track('lang-' + v);
}

/* 악기는 **두 겹이다** (2026-08-16).
   `CATALOG` — 앱이 그릴 줄도 낼 줄도 아는 악기 **전부**. 절대 줄지 않는다.
   `INSTR`   — 지금 **입력판에 보이는** 로스터. CATALOG의 부분집합이고 순서·이름이 바뀐다.

   **이 둘을 가르는 게 핵심이다.** 저장·불러오기·칸 길이 계산은 전부 CATALOG로 돈다.
   `INSTR`로 돌면 라이드를 숨긴 순간 `normalizeMeasures`가 라이드 행을 안 읽어
   **파일을 열었다 저장하는 것만으로 음표가 사라진다.** 숨기는 건 그림의 문제지
   데이터의 문제가 아니다 — 데이터는 언제나 CATALOG 전부를 들고 있는다.
   `setDiv`도 마찬가지다. 숨긴 악기의 배열만 안 늘리면 길이가 어긋나 곧바로 터진다. */
const CATALOG = [
  // Three staff half-steps keep neighboring cymbal glyphs (including ⊗/ghosts) apart.
  {id:'fx', name:'이펙트·스택', head:'x', pos:-11, voice:'hand'},
  {id:'china', name:'차이나', head:'x', pos:-8, voice:'hand'},
  {id:'splash', name:'스플래시', head:'x', pos:-5, voice:'hand'},
  {id:'crash', name:'크래쉬', head:'x', pos:-2, voice:'hand'},
  {id:'hihat', name:'하이햇',     head:'x', pos:-1, voice:'hand'},
  {id:'ride',  name:'라이드',     head:'x', pos: 0, voice:'hand'},
  {id:'tom1',  name:'하이탐',    head:'n', pos: 1, voice:'hand'},
  {id:'tom2',  name:'미드탐',    head:'n', pos: 2, voice:'hand'},
  {id:'snare', name:'스네어',     head:'n', pos: 3, voice:'hand'},
  {id:'ftom',  name:'플로어탐',   head:'n', pos: 5, voice:'hand'},
  {id:'kick',  name:'킥',        head:'n', pos: 7, voice:'foot'},
  /* 풋 하이햇 (2026-08-18). pos 9 = 오선 아래 첫 칸(D). 표준 드럼 키의 자리다
     — 덧줄은 필요 없다(덧줄은 pos ≤ -2, 크래쉬 위에만 긋는다).
     **기본은 숨김**(`DEFAULT_OFF`) — 여덟 줄짜리 폰 입력판을 모두에게 늘리지 않는다.
     음표가 든 악보를 열면 `syncRosterToNotes`가 알아서 켠다. */
  {id:'hihatFoot', name:'풋 하이햇', head:'x', pos: 9, voice:'foot'},
];
const CAT_BY_ID = Object.fromEntries(CATALOG.map(i=>[i.id,i]));
const CAT_ORDER = CATALOG.map(i=>i.id);
let INSTR = CATALOG.slice();
let byId  = Object.fromEntries(INSTR.map(i=>[i.id,i]));   // **카탈로그 전부**가 들어 있다 (숨겨도 조회된다)
let HAND_INS = INSTR.filter(i => i.voice === 'hand');
let FOOT_INS = INSTR.filter(i => i.voice === 'foot');

/* 로스터 설정은 **기기에 남는다.** 곡 파일에 안 붙이는 이유가 있다 —
   같은 사람은 어느 곡을 열든 자기 키트 그대로여야 하고, 남의 파일을 열었다고
   그 사람 취향이 내 입력판을 갈아엎으면 안 된다.
   그 대신 **음표가 든 악기는 무조건 켠다**(`syncRosterToNotes`). 그래야 라이드를 숨겨 둔
   사람이 라이드가 든 남의 악보를 열어도 빠짐없이 보인다. 이 한 줄이 기기 설정의 값을 지킨다. */
const ROSTER_KEY = 'maidrum.roster';
/* 카탈로그에 새로 더한 악기 중 **기본으로 숨길** 것.
   옛 설정에 그 id가 아예 없을 때만 먹는다(아래 `rosterLoad`) — 사용자가 한 번 켜면
   그 뒤로는 저장된 설정이 이긴다. */
const DEFAULT_OFF = ['hihatFoot'];
let rosterOff   = new Set(DEFAULT_OFF);   // 숨긴 악기 id
let rosterOrder = CAT_ORDER.slice();  // 입력판 줄 순서
let rosterNames = {};                 // id → 사용자가 바꾼 이름
/* 악기 이름의 영어판. 사전(`EN`)에 넣지 않고 따로 둔 이유: 이 이름들은 **사용자가
   덮어쓸 수 있는 값**이라 다른 화면 글자와 성격이 다르다. 여기 한 곳만 보면 된다. */
const INS_EN = {
  splash:'Splash', china:'China', fx:'Effect / stack',
  crash:'Crash', hihat:'Hi-hat', ride:'Ride', tom1:'High tom', tom2:'Mid tom',
  snare:'Snare', ftom:'Floor tom', kick:'Kick', hihatFoot:'Hi-hat (foot)',
};
function insName(c){ return (LANG === 'en' && INS_EN[c.id]) ? INS_EN[c.id] : c.name; }

function rebuildRoster(){
  // 순서 배열을 먼저 성하게 만든다 — 모르는 id·중복은 버리고, 빠진 악기는 뒤에 붙인다.
  // (카탈로그에 악기를 더하면 옛 설정에는 그 id가 없다. 그때 조용히 사라지면 안 된다)
  const seen = new Set(), ord = [];
  rosterOrder.forEach(id=>{ if(CAT_BY_ID[id] && !seen.has(id)){ seen.add(id); ord.push(id); } });
  CAT_ORDER.forEach(id=>{ if(!seen.has(id)){ seen.add(id); ord.push(id); } });
  rosterOrder = ord;
  if(rosterOff.size >= CATALOG.length) rosterOff.delete(ord[0]);   // 전부 숨기는 건 막는다
  const disp = {};
  CATALOG.forEach(c=>{
    const nm = rosterNames[c.id];
    /* **사용자가 바꾼 이름이 항상 이긴다** — 영어로 보든 한국어로 보든.
       자기가 "탐 10″"을 "랙탐"이라 적어 놨는데 언어를 바꿨다고 그게 사라지면 안 된다.
       안 바꿨으면 카탈로그 이름을 언어에 맞게 옮긴다(`insName`). */
    const shown = nm || insName(c);
    disp[c.id] = (shown !== c.name) ? Object.assign({}, c, {name: shown}) : c;
  });
  byId = disp;
  INSTR = ord.filter(id=>!rosterOff.has(id)).map(id=>disp[id]);
  HAND_INS = INSTR.filter(i=>i.voice==='hand');
  FOOT_INS = INSTR.filter(i=>i.voice==='foot');
}
function rosterLoad(){
  try{
    const d = JSON.parse(localStorage.getItem(ROSTER_KEY) || 'null');
    if(d && typeof d === 'object'){
      if(Array.isArray(d.order)) rosterOrder = d.order.filter(x=>typeof x === 'string');
      if(Array.isArray(d.off))   rosterOff   = new Set(d.off.filter(x=>CAT_BY_ID[x]));
      /* 저장된 설정이 **모르는 악기**는 기본값을 따른다. 옛 설정에는 새 id가 없어서
         그냥 두면 앱을 열자마자 입력판에 줄이 하나 늘어난다 — 켜는 건 사용자가 정할 일이다.
         `order`·`off` 어디에도 없으면 그 설정이 만들어질 때 없던 악기다. */
      const known = new Set([...(Array.isArray(d.order) ? d.order : []),
                             ...(Array.isArray(d.off)   ? d.off   : [])]);
      DEFAULT_OFF.forEach(id=>{ if(!known.has(id)) rosterOff.add(id); });
      if(d.names && typeof d.names === 'object'){
        rosterNames = {};
        Object.keys(d.names).forEach(k=>{
          if(CAT_BY_ID[k] && typeof d.names[k] === 'string' && d.names[k].trim())
            rosterNames[k] = d.names[k].trim().slice(0, 12);
        });
      }
    }
  }catch(e){}
  rebuildRoster();
}
function rosterSave(){
  try{
    localStorage.setItem(ROSTER_KEY, JSON.stringify(
      {order: rosterOrder, off: [...rosterOff], names: rosterNames}));
  }catch(e){}
}
/* 음표가 든 악기는 켠다. 켠 게 있으면 true. */
function syncRosterToNotes(){
  if(!rosterOff.size) return false;
  let on = false;
  [...rosterOff].forEach(id=>{
    if(measures.some(m => (m[id]||[]).some(v=>v))){ rosterOff.delete(id); on = true; }
  });
  if(on){ rebuildRoster(); rosterSave(); }
  return on;
}
rosterLoad();

/* 셀 값 = 아티큘레이션 코드.
   0 없음 / 1 보통 / 2 고스트 / 3 액센트 / 4 오픈(하이햇 전용)
   / 5 크로스 스틱 / 6 림샷 (둘 다 스네어 전용).
   불리언이던 v1 파일은 true가 그대로 truthy라 열리지만 loadDoc()에서 1로 정규화한다. */
const ART = {OFF:0, NORM:1, GHOST:2, ACCENT:3, OPEN:4, XSTICK:5, RIM:6,
             CLOSED:7, BELL:8, ROLL:9, ROLL1:10, ROLL2:11, BUZZ:12,
             GROLL1:13, GROLL2:14, GROLL3:15, GBUZZ:16};
const ART_MAX = ART.GBUZZ;                 // 이 위는 "모르는 값" — 1로 접는다
/* 고스트 + 롤 (2026-09-12 드러머 제보 "고스트노트에 롤 표기가 안 돼요").
   표기 값은 칸에 하나라 고스트(2)와 롤(9~12)이 서로를 밀어냈다. 둘을 합친 값 13~16을 연다 —
   괄호 머리에 사선·z가 같이 붙는다(고스트 롤은 실제로 흔한 표기다).
   옛 앱은 13~16을 모르는 값으로 보고 1로 접는다 — 음표는 남는다(전방 호환 규칙 그대로).
   판정은 아래 두 함수로만 한다 — `=== ART.GHOST` 직접 비교를 새로 쓰지 말 것. */
const GHOST_ROLL = {[ART.ROLL1]:ART.GROLL1, [ART.ROLL2]:ART.GROLL2, [ART.ROLL]:ART.GROLL3, [ART.BUZZ]:ART.GBUZZ};
const ROLL_OF_GHOST = {[ART.GROLL1]:ART.ROLL1, [ART.GROLL2]:ART.ROLL2, [ART.GROLL3]:ART.ROLL, [ART.GBUZZ]:ART.BUZZ};
function isGhost(v){ return v === ART.GHOST || (v >= ART.GROLL1 && v <= ART.GBUZZ); }
function rollPart(v){ return ROLL_OF_GHOST[v] || v; }   // 합친 값이면 롤 쪽 값, 아니면 그대로
/* 트레모로 사선의 개수는 **얼마나 잘게 쪼개 치는가**를 말한다 —
   하나=8분, 둘=16분, 셋=32분. 9(사선 셋)를 먼저 열었기 때문에 하나·둘이 10·11로
   뒤에 붙었다. **번호 순서와 사선 수가 안 맞는다** — 값을 다시 매기면 옛 악보가
   바뀌므로 그대로 둔다. 팔레트에서만 1·2·3 순서로 보여 준다. */
const ROLL_SLASH = {[ART.ROLL1]:1, [ART.ROLL2]:2, [ART.ROLL]:3};
/* 표기 값 중 **악기를 가리는 것들**. 값 → 허용 악기표.
   5·6은 2026-08-18에 열었다(크로스 스틱 / 림샷). 원래 플램·드래그 자리로 비워 뒀는데
   그건 별도 데이터(`m.orn`)로 갔으므로 여기가 비어 있었다.
   둘 다 **스네어 전용**이다 — 같은 드럼을 다르게 치는 것이라 악기 줄을 늘리지 않는다.
     크로스 스틱(림 클릭) : 스네어 줄에 **x 머리**. 표준이고 드러머 확인도 받았다
     림샷                : 보통 머리를 **원으로 감싼다**(Stone·Gardner Read 계열 표준).
                           스템 사선은 일부러 안 쓴다 — 연주 중에 놓치기 쉽다는 게 정설이다 */
/* 2026-09-12 드러머 제보(STY): ○·＋를 **풋 하이햇**과 **스네어·탐**에도 연다.
   풋 하이햇의 ○ = 페달을 밟았다 떼는 스플래시. 스네어·탐 위의 ＋ = 손이 탐에 가 있는 동안
   발로 하이햇을 닫는 자리 — 차트 관례상 그 음 위에 ＋를 적는다(하이햇 줄에는 음이 없다).
   소리는 안 바뀐다(ART_SFX가 hihat 계열만 안다) — 요청도 표시였다. */
const OPEN_OK   = {hihat:true, hihatFoot:true, snare:true, tom1:true, tom2:true, ftom:true};
const XSTICK_OK = {snare:true};
const RIM_OK    = {snare:true};
/* 7·8·9는 2026-08-29에 열었다 (사용자 요청 3·5번).
     닫음(+) : 드럼 키에서 `+`는 원래 **"닫음 / 뮤트" 하나**다 — 하이햇에 붙으면
               클로즈, 심벌에 붙으면 초크다. 값을 둘로 가르지 않은 이유가 이것이다.
               한 악기에 두 뜻이 겹칠 일이 없으므로 표기가 헷갈리지 않는다
     라이드 벨: **머리를 다이아몬드로** 바꾼다(표준). 라이드 전용
     롤       : 스템을 가로지르는 사선 셋. 손 악기 전부
   ※ 소리는 아직 안 바꾼다 — 요청도 "표시"였다. 초크의 감쇠는 다음 판.

   10·11·12는 2026-09-02에 열었다 (사용자 요청).
     사선 하나·둘 : 셋과 같은 트레모로 표기다. 사선 수가 곧 쪼개는 정도라
                    셋만 있으면 그 뜻 자체가 안 보인다
     버즈롤(z)    : 스템에 **z**. 눌러서 여러 번 튀기는 롤(프레스 롤)의 표준 표기고,
                    **사선 셋과 다른 주법**이다 — 사선은 잰 롤(더블 스트로크),
                    z는 안 잰 롤이다. 그래서 값을 따로 둔다.
                    셋 다 손 악기 전부에 붙는다(심벌 롤이 실제로 쓰인다) */
const CLOSED_OK = {hihat:true, crash:true, splash:true, china:true, fx:true, ride:true, hihatFoot:true, snare:true, tom1:true, tom2:true, ftom:true};
const BELL_OK   = {ride:true};
const ART_OK = {[ART.OPEN]:OPEN_OK, [ART.XSTICK]:XSTICK_OK, [ART.RIM]:RIM_OK,
                [ART.CLOSED]:CLOSED_OK, [ART.BELL]:BELL_OK};
function artFor(insId, a){
  const ok = ART_OK[a];
  return (ok && !ok[insId]) ? ART.NORM : a;
}

/* ================= 박 나누기 (v3) =================
   16분 고정 그리드를 버린다. 드러머 요청 4번(3연음)이 직접 원인이다.

   **분할은 박마다, 성부마다 따로 정한다.**
     m.div[b] = {h:4, f:4}   h = 손(hand), f = 발(foot)
   그래서 악기 행의 배열 길이가 성부에 따라 다르다 — 손 악기 7개는 sum(div[].h),
   킥은 sum(div[].f). `INSTR[].voice`가 어느 쪽인지 알려 준다.

   왜 성부별인가: 손 셋잇단 위에 발 4분, 셔플 라이드 위에 스트레이트 킥 —
   드럼에서 실제로 나오는 폴리는 전부 손과 발 사이에서 생긴다.
   렌더러가 이미 `drawVoiceBeat`로 성부를 나눠 그리므로 비용이 거의 0이다.

   **여전히 못 하는 것**: 같은 손 안의 3 대 4 (라이드 셋잇단 + 스네어 16분).
   손 악기가 스템·빔을 공유해서 한 박에 두 리듬을 그릴 방법이 없다.
   풀려면 라이드/하이햇을 3번째 성부로 올려야 하고, 그때도 마이그레이션은 필요 없다.

   `ts`(박자표)는 지금 항상 [4,4]다. 필드를 미리 넣어 두는 이유는 나중에 6/8을
   붙일 때 **두 번째 저장 포맷 마이그레이션이 생기지 않게** 하기 위해서다. */
const VK = {hand:'h', foot:'f'};
const DIV_OK = [2,3,4,6,8];          // 8분 / 8분셋잇단 / 16분 / 16분셋잇단 / 32분
const DIV_UI = [2,3,4,5,6,7,8];      // 화면에 내놓는 값. 32분은 2026-08-14에, 5·7연음은 1.8(2026-10-07)에 열었다
/* ── 섞어 나누기 (1.8, 2026-10-07 드러머 요청 두 번 — 10-04 카톡·10-06) ──
   한 박을 **반박 둘**로 가르고 반쪽마다 다른 분할을 쓴다. 앞 반박 16분 둘 + 뒤 반박
   16분 셋잇단(2+3)이 요청 원문이다. 6연음으로 흉내 내면 앞 두 음이 1/4→1/3박으로 틀어진다.
   **코드 = 앞 칸 수 × 10 + 뒤 칸 수.** 정수라서 저장(`d.h|0`)·비교·`normDiv`가 그대로 받는다.
     23 = 16분 2 + 16분셋 3   32 = 16분셋 3 + 16분 2
     13 = 8분 1 + 16분셋 3    31 = 16분셋 3 + 8분 1
     24 = 16분 2 + 32분 4      42 = 32분 4 + 16분 2      (1.9)
     33 = 16분셋 3 + 16분셋 3                             (1.9)
   칸 수는 `divCells`, 박 안 자리는 `cellFrac`로만 구한다 — `k/d`를 새로 쓰지 말 것.
   옛 앱은 이 값을 모르는 분할로 보고 기본값(16분)으로 접는다(5·7연음도 같다).
   ── 1.9 (2026-10-08): 24·42·33을 더했다. **조각 등분이 1·2·3·4 안에 있으면 그리기·재생·입력판이
   손 안 대고 받는다** — 조각 등분 4는 q=0.5에서 꼬리 셋(32분)이 된다(`noteValue`).
   33은 시간이 6연음과 같다. 다른 것은 표기 — 숫자 3이 반박마다 하나씩, 2차 빔이 반박에서 끊긴다
   (6연음은 숫자 6 하나). 드럼 교재에서 둘 다 쓰여 같이 연다 */
const DIV_MIX = {23:[2,3], 32:[3,2], 13:[1,3], 31:[3,1], 24:[2,4], 42:[4,2], 33:[3,3]};
const DIV_MIX_UI = [23, 32, 13, 31, 24, 42, 33];
function divParts(d){ return DIV_MIX[d] || null; }
function divCells(d){ const p = DIV_MIX[d]; return p ? p[0] + p[1] : d; }
/* 칸 k의 박 안 자리(0~1). 섞은 박은 반박마다 따로 등분한다 */
function cellFrac(d, k){
  const p = DIV_MIX[d];
  if(!p) return k / d;
  return k < p[0] ? 0.5 * k / p[0] : 0.5 + 0.5 * (k - p[0]) / p[1];
}
/* 박을 그리기 단위(조각)로 나눈다. 보통 박은 조각 하나, 섞은 박은 반박 둘.
   n = 칸 수, k0 = 첫 칸, f0·fl = 박 안 시작·길이(0~1), div = 조각 안 등분 수 */
function divSegs(d){
  const p = DIV_MIX[d];
  if(!p) return [{k0:0, n:d, f0:0, fl:1, div:d}];
  return [{k0:0, n:p[0], f0:0, fl:0.5, div:p[0]}, {k0:p[0], n:p[1], f0:0.5, fl:0.5, div:p[1]}];
}
function divLabel(d){ const p = DIV_MIX[d]; return p ? p[0] + '+' + p[1] : String(d); }
const DIV_CYCLE = [4,3,6];           // 박 머리를 탭했을 때 도는 순서
const BEATS = 4;                     // 기본값. 박자표가 없거나 깨졌을 때만 쓴다

/* ================= 박자표 (2026-08-19) =================
   **핵심 결정: 마디는 "박"으로 나뉘고, 박마다 길이가 다를 수 있다.**

   지금까지 한 마디는 늘 4박이었고 한 박은 늘 4분음표였다. 그래서 `div`(한 박을
   몇 칸으로 쪼개나)만으로 모든 리듬이 표현됐다. 박자표를 열려면 그 위에 하나를
   더 얹어야 한다 — **박마다 길이가 다르다**는 것.

     4/4   → 박 넷, 각각 4분음표          groups [1,1,1,1]
     3/4   → 박 셋                        groups [1,1,1]
     6/8   → 박 **둘**, 각각 점4분음표    groups [3,3]
     12/8  → 박 넷, 각각 점4분음표        groups [3,3,3,3]
     5/8   → 박 둘 (2+3 또는 3+2)         groups [2,3]
     7/8   → 박 셋 (2+2+3 등)             groups [2,2,3]

   `groups[b]`는 그 박이 **분모 단위 몇 개**인가다. 6/8의 박 하나는 8분음표 셋.

   ── 왜 6/8을 "8분음표 여섯 박"으로 안 세나
   드러머가 6/8을 그렇게 세지 않는다. 둘로 센다. 그리고 기보에서도 8분음표 셋을
   **한 빔으로 묶는다** — 여섯 박으로 모델링하면 빔이 여섯 조각으로 부서진다.
   점4분 두 박 × div=3으로 두면 **지금 셋잇단을 그리는 코드가 그대로** 3개 묶음을
   그려 준다. 새로 짤 렌더러가 없다. 셋잇단 괄호만 끄면 된다.

   ── 꼬리(빔) 수는 왜 안 고쳐도 되나
   `noteValue`의 `UNIT_FLAGS`는 "한 박을 d칸으로 쪼갠 칸 하나의 꼬리 수"다.
   점4분을 3칸으로 쪼개면 8분음표 → 꼬리 1. 4분을 3칸으로 쪼개도(셋잇단) 꼬리 1.
   **같다.** 그래서 표를 손대지 않는다. 다른 건 괄호뿐이다.

   ── 분모는 2의 거듭제곱만
   7분음표라는 음표가 없다. 4/7은 표기할 수 없다(현대음악의 "비유리 박자"를
   빼면). 7박을 원하면 7/8이나 7/4다.

   ── 저장 포맷
   `m.ts`는 v3부터 있던 필드다. `m.grp`(묶음)는 **기본값과 다를 때만** 담는다 —
   5/8을 3+2로 묶는 사람만 한 줄이 늘어난다. */
const TS_DEN_OK = [4, 8];
const TS_NUM_MAX = 16;

/* 묶음의 기본값. 분모가 8이면 셋씩 묶고, 셋으로 안 떨어지면 앞을 2로 채운다.
   5/8 → [2,3], 7/8 → [2,2,3], 8/8 → [2,2,2,2] (3+3+2를 쓰는 사람은 직접 고른다) */
function defaultGroups(num, den){
  const n = Math.max(1, Math.min(TS_NUM_MAX, num|0));
  if(den !== 8) return new Array(n).fill(1);
  if(n % 3 === 0) return new Array(n/3).fill(3);
  const g = [];
  let rest = n;
  while(rest > 3){ g.push(2); rest -= 2; }
  if(rest > 0) g.push(rest);              // 2 또는 3이 남는다
  return g;
}
function tsOf(m){
  const t = m && m.ts;
  const num = Math.max(1, Math.min(TS_NUM_MAX, (t && t[0]|0) || BEATS));
  const den = (t && TS_DEN_OK.includes(t[1]|0)) ? (t[1]|0) : 4;
  return [num, den];
}
/* 묶음이 담겨 있으면 쓰고, 합이 안 맞으면 기본값으로 되돌린다 —
   남의 파일이나 다음 버전이 만든 파일을 열어도 마디가 깨지지 않게 */
function groupsOf(m){
  const [num, den] = tsOf(m);
  const g = m && m.grp;
  if(Array.isArray(g) && g.length){
    const arr = g.map(v=>v|0);
    if(arr.every(v=>v>=1&&v<=4) && arr.reduce((a,b)=>a+b,0) === num) return arr;
  }
  return defaultGroups(num, den);
}
/* 이 박의 길이 — **4분음표 단위**다. BPM이 4분음표 기준이라 여기에 맞춘다.
   4/4에서는 늘 1이라 기존 계산과 글자 그대로 같아진다. */
function beatQ(m, b){
  const [, den] = tsOf(m);
  return (groupsOf(m)[b] || 1) * 4 / den;
}
function beatStartQ(m, b){
  const g = groupsOf(m), [, den] = tsOf(m);
  let q = 0;
  for(let i=0; i<b && i<g.length; i++) q += g[i] * 4 / den;
  return q;
}
function measureQ(m){
  const [num, den] = tsOf(m);
  return num * 4 / den;
}
/* 곡 전체가 4분음표 몇 개 길이인가. **마디당 4박으로 굳히면 안 된다** —
   2026-09-01에 마디별 박자표를 열면서, 이걸 4로 곱해 두었던 영상 길이 계산이
   섞인 박자 곡에서 어긋났다. 길이를 재는 곳은 전부 이걸 쓴다. */
function songQ(list){
  return (list || measures).reduce((a, m) => a + measureQ(m), 0);
}
/* 4분음표 단위 위치 → 소수 박 번호. 재생선이 쓴다 */
function beatAtQ(m, q){
  const g = groupsOf(m), [, den] = tsOf(m);
  let acc = 0;
  for(let b=0; b<g.length; b++){
    const w = g[b] * 4 / den;
    if(q < acc + w) return b + (q - acc) / w;
    acc += w;
  }
  return g.length;
}
/* 점4분 박인가 — 6/8·9/8·12/8의 박, 그리고 5/8·7/8의 3짜리 묶음.
   여기서는 3칸·6칸이 **셋잇단이 아니라 그냥 8분·16분**이다 */
function compoundBeat(m, b){
  return tsOf(m)[1] === 8 && (groupsOf(m)[b] || 1) === 3;
}
/* 두 박을 묶은 박인가 — 2박 3연음(4분음표 셋)의 자리다 (2026-08-24).
   분모 4에서만 있다. `grp` 값 2 = 4분음표 두 개짜리 박. 6/8의 점4분 박(den 8)과
   구별해야 한다 — 그쪽은 compoundBeat고, 3칸이 셋잇단이 **아니다**. */
function mergedBeat(m, b){
  return tsOf(m)[1] === 4 && (groupsOf(m)[b] || 1) >= 2;
}
/* 그리드 박 머리·목소리 메트로놈이 부르는 **표시용 박 번호**(1부터).
   묶은 박이 있으면 뒤 박의 번호가 밀린다 — [2,1,1]이면 1·3·4박이다.
   분모 8은 예전대로 순번이다(6/8은 "원 투"). 4/4 비묶음에서는 b+1과 같다. */
function beatNoOf(m, b){ return tsOf(m)[1] === 4 ? Math.round(beatStartQ(m, b)) + 1 : b + 1; }
/* ── 메트로놈 클릭 시간표 (2026-08-24) ──
   **분모 4에서는 박 묶음과 무관하게 4분음표마다 친다.** 2박 3연음으로 두 박을 묶으면
   `beatCount`가 줄어드는데, 메트로놈이 그걸 따라가면 2·4박 클릭이 사라진다 —
   실기기에서 사용자가 바로 잡았다. 묶기는 표기·격자의 일이지 **정박의 일이 아니다.**
   분모 8은 예전대로 박(점4분·묶음)마다다 — 6/8을 여덟으로 세면 그게 틀린 것이다.
   k는 클릭 번호(0부터)이자 목소리 번호다 — 분모 4에서는 곧 4분음표 순번이라
   "원 투 쓰리 포"가 정박에 붙는다. */
function clickCount(m){ return tsOf(m)[1] === 4 ? Math.round(measureQ(m)) : beatCount(m); }
function clickQ(m, k){ return tsOf(m)[1] === 4 ? k : beatStartQ(m, k); }
/* 이 박에 허용되는 분할. 점4분 박을 4로 쪼개면 표기할 음표가 없다
   (4분음표 4잇단이 되는데 드럼 악보에서 쓸 일이 없고 그릴 수도 없다) */
function divsFor(m, b){
  if(compoundBeat(m, b)) return [3, 6];
  /* 섞어 나누기는 **4분음표 한 박**에서만 — 반박이 8분음표여야 2·3이 16분·16분셋이 된다.
     묶은 박(2박 3연음 자리)·점4분 박은 반박의 뜻이 달라 받지 않는다 */
  if(mergedBeat(m, b) || beatQ(m, b) !== 1) return DIV_UI;
  return DIV_UI.concat(DIV_MIX_UI);
}
/* 기본 분할. **분모가 기준 칸이다** — 8분음표 박자표면 8분 격자로 연다.
   5/8은 다섯 칸, 6/8은 여섯 칸, 12/8은 열두 칸. 4분음표 박자표는 지금까지처럼
   16분(4)으로 연다 — 드럼에서 제일 자주 쓰는 격자다.
   더 잘게 쓰고 싶으면 박 머리를 눌러 바꾼다(divPop). */
function defaultDivFor(m, b){
  if(tsOf(m)[1] !== 8) return 4;
  return (groupsOf(m)[b] || 1) === 3 ? 3 : 2;
}

/* ── 스템 통합 표기 (2026-08-15) ─────────────
   손·발을 한 성부로 합쳐 **전부 위 스템**으로 그린다. 킥이 아래로 안 내려가고
   같은 자리의 하이햇·스네어와 한 스템에 매달린다. 드러머 절반 이상이 이렇게 읽는다.

   **기기 설정이다 — 곡에 안 담는다.** 합치든 나누든 소리도 데이터도 완전히 같고
   그림만 달라진다. 그러면 이건 악보의 내용이 아니라 "내가 어떻게 읽고 싶은가"이고,
   그런 건 읽는 사람이 정하는 게 맞다(라이트/다크와 같은 성격).
   덕분에 **저장 포맷이 안 바뀐다** — 남에게 보낸 악보는 그 사람 설정대로 보인다.
   나중에 학원 기능에서 "이 악보는 이렇게 읽어라"가 필요해지면 그때 곡별을 얹으면 된다.

   **선언을 여기 위쪽에 둔다.** `paint()`가 부팅 때 바로 도는데 아래에 두면
   TDZ 오류로 앱이 통째로 안 뜬다 — `STORAGE_OK`에서 실제로 겪은 사고다. */
/* ── 지면에서 빼는 것들 (2026-08-29 사용자 요청 9·12) ──────────
   둘 다 **기기 설정**이다. 화면에선 보고 인쇄만 깨끗하게 뽑는 쓰임이 많아
   곡에 붙이면 오히려 불편하다. 기본값은 켜짐 — 옛 악보가 한 픽셀도 안 변한다. */
const BARNUM_KEY = 'maidrum.barnum';
let SHOW_BARNUM = (function(){
  try{ return localStorage.getItem(BARNUM_KEY) !== 'off'; }catch(e){ return true; }
})();
const MREST_KEY = 'maidrum.mrest';
let SHOW_MREST = (function(){
  try{ return localStorage.getItem(MREST_KEY) !== 'off'; }catch(e){ return true; }
})();

/* 크래쉬 ⊗ (2.1) — paint()가 부팅 때 바로 도므로 데이터 구역 위쪽에 둔다(MERGE_STEMS와 같은 TDZ 이유) */
const CRASH_KEY = 'maidrum.crash';
let CRASH_RING = (function(){
  try{ return localStorage.getItem(CRASH_KEY) !== 'x'; }catch(e){ return true; }
})();

const STEMS_KEY = 'maidrum.stems';
let MERGE_STEMS = (function(){
  try{ return localStorage.getItem(STEMS_KEY) === 'merge'; }catch(e){ return false; }
})();

/* ── 악보 배경색 (2026-08-15) ────────────────
   악보 카드의 종이색과 **잉크색**을 같이 바꾼다. 기기 설정이고 데이터는 안 건드린다.

   **잉크가 JS 상수라서 CSS만으로는 안 된다.** `paint()`가 색을 SVG 속성에 리터럴로
   박는데, PNG는 그 SVG를 blob으로 만들어 캔버스에 그리므로 **바깥 CSS가 안 따라간다.**
   그래서 `INK`를 `let`으로 두고 여기서 갈아 끼운다.

   `흰색`은 지금 쓰던 값 그대로다(#F3F0F8). 실제로는 아주 옅은 라일락인데,
   어두운 UI 옆에서 진짜 흰색(#FFF)은 눈이 부시다 — 디자인 시스템 값이라 안 건드렸다.
   즉 **기본값에서는 예전과 한 픽셀도 안 다르다.**

   **인쇄는 항상 흰 종이·검은 잉크다.** 종이는 이미 하얗고, 배경을 칠하면 잉크만 버린다.
   반전으로 두고 PDF를 뽑으면 글자가 안 보이는 사고가 나므로 `pdfBtn`이 강제로 되돌린다.
   PNG는 이미지라 배경이 필요하고 공유용이므로 **고른 색을 그대로 따른다.** */
const PAPERS = {
  white:  {name:'흰색',     paper:'#F3F0F8', ink:'#14121A'},
  ivory:  {name:'아이보리', paper:'#FAF3E2', ink:'#1B1608'},
  invert: {name:'반전',     paper:'#14121A', ink:'#EDEBF2'},
};
const PAPER_KEY = 'maidrum.paper';
let PAPER = (function(){
  try{ const v = localStorage.getItem(PAPER_KEY); return PAPERS[v] ? v : 'white'; }
  catch(e){ return 'white'; }
})();
let INK = PAPERS[PAPER].ink;
/* 종이색을 화면에 반영한다. `renderScore()`는 부르는 쪽에서 — 부팅 때는 아직 없다 */
function applyPaper(){
  const p = PAPERS[PAPER] || PAPERS.white;
  INK = p.ink;
  const r = document.documentElement.style;
  r.setProperty('--paper', p.paper);
  r.setProperty('--paper-ink', p.ink);
}
applyPaper();

/* 손 순서 표기(R·L)의 위치 — 기기 설정. 위에 붙이는 사람과 아래에 붙이는 사람이
   갈려서(드러머 확인, 2026-08-17) 종이 배경처럼 이 기기에서 고른다 */
/* 단 간격 — 기기 설정 (2026-08-28 사용자 요청 "악보 줄간격도 조절할 수 있으면").
   곡 데이터가 아니라 그림이라 배경색·R·L 위치와 같은 자리다.
   값은 SYS_H(150)에 더해지는 px. 좁게 하면 A4 한 장에 단이 더 들어간다 —
   linesPerPage가 같은 값을 나눠서 페이지 수도 저절로 맞는다.
   좁게 −18이 하한이다: 발 성부가 깊은 악보는 MARK_Y.extra가 이미 벌려 놓는데,
   그보다 더 좁히면 아래 잉크가 다음 단 구간 상자에 물린다(8-18 실측의 재래). */
const LINEGAP_KEY = 'maidrum.linegap';
const LINE_GAPS = {tight:-18, normal:0, wide:30};
let LINE_GAP_K = (function(){
  try{ const v = localStorage.getItem(LINEGAP_KEY); return LINE_GAPS[v] !== undefined ? v : 'normal'; }
  catch(e){ return 'normal'; }
})();
function lineGap(){ return LINE_GAPS[LINE_GAP_K] || 0; }

/* 구간 새 줄 — 기기 설정 (2026-09-07 사용자 요청 "PDF처럼 A·B 구간이 줄 첫 마디에 왔으면").
   켜면 구간 이름(sec)이 붙은 마디에서 줄을 새로 시작한다. 곡 데이터가 아니라 배치라
   줄간격과 같은 자리(기기 설정). 기본 꺼짐 — 옛 악보의 렌더가 한 자도 안 바뀐다. */
const SECBREAK_KEY = 'maidrum.secbreak';
let SEC_BREAK = (function(){
  try{ return localStorage.getItem(SECBREAK_KEY) === 'on'; }catch(e){ return false; }
})();
/* 줄 나누기 두 경로(auto·고정)가 같은 물음을 쓴다 — "이 마디 앞에서 줄을 끊어야 하나" */
function secBreakAt(mi){ return SEC_BREAK && !!(measures[mi] && measures[mi].sec); }
/* ── 마디별 새 줄 (2026-09-12, 드러머 제보 "첫 줄 6마디·다음 줄 4마디가 되어야 함") ──
   `m.ln = N`(1~8): 이 마디는 **무조건 줄 첫머리**고, 이 줄부터 다음 표식까지 한 줄에 N마디.
   줄마디 숫자(전체)는 표식이 없는 곳의 기본값으로 남는다. 곡 데이터에 들어가므로
   저장·PDF·화면이 같은 줄을 본다. 구간 새 줄(기기 설정)과 달리 **악보에 붙는다.**
   표식이 없는 옛 악보는 lnEff가 전부 perLine이라 바이트 하나 안 바뀐다. */
function lineBreakAt(mi){ return secBreakAt(mi) || !!(measures[mi] && measures[mi].ln); }
/* ── 쉬는 마디 묶기 — 멀티레스트 (2026-09-12 드러머 제보) ──
   연달아 비어 있는 마디를 한 칸(H자 막대 + 마디 수)으로 접는다. 기기 설정(기본 꺼짐) —
   옛 악보의 빈 마디 자리표시(요청 12)가 갑자기 접히면 안 되므로. 화면·PDF 같이 적용.
   묶이는 조건: 음표·%·도돌이·괄호·기호·가사·마디선 종류·펜 메모가 전부 없다.
   구간 이름·새 줄 표식은 **첫 마디에만** 허용(그 칸에 그려진다). 박자표가 바뀌는 자리와
   줄 끊김(구간 새 줄·새 줄 표식)에서는 묶음이 끊긴다.
   그리기 단위(칸)와 마디 번호가 갈리므로 paint 안에서만 `units`로 다룬다 — rows·페이지·
   재생선 캐시는 여전히 마디 번호를 본다(캐시는 칸을 n등분해서 마디마다 채운다). */
/* 6연음 빔 — 'joined'(한 덩어리, 기본) · 'split'(3+3). 기기 설정 */
const SEXT_KEY = 'maidrum.sext';
let SEXT_SPLIT = (function(){
  try{ return localStorage.getItem(SEXT_KEY) === 'split'; }catch(e){ return false; }
})();
const MULTIREST_KEY = 'maidrum.multirest';
let MULTI_REST = (function(){
  try{ return localStorage.getItem(MULTIREST_KEY) === 'on'; }catch(e){ return false; }
})();
function mrestPlain(m, first){
  return !!m && !measureHasNotes(m) && !m.rpt && !m.rep && !m.end && !m.nav && !m.text && !m.bar && !m.ink
         && !m.dyn && !m.hp && (first || (!m.sec && !m.ln));
}
function mrestRun(i, to){                 // i에서 시작하는 묶음의 마디 수(1이면 보통 마디)
  if(!MULTI_REST || !mrestPlain(measures[i], true)) return 1;
  let n = 1;
  while(i + n < to && mrestPlain(measures[i+n], false) && !tsChangesAt(i+n) && !lineBreakAt(i+n)) n++;
  return n;
}
/* 멀티레스트 그리기 — 셋째 줄 위 굵은 가로 막대(0.5sp) + 양 끝 세로 획, 숫자는 오선 위 */
function drawMultiRest(mx, top, w, n){
  const y = top + 2*LG, x1 = mx + Math.min(18, w*0.18), x2 = mx + w - Math.min(18, w*0.18);
  SVGT.appendChild(el('rect',{x:x1, y:y-2.25, width:x2-x1, height:4.5, fill:INK}));
  [x1, x2].forEach(x => SVGT.appendChild(el('line',{x1:x, y1:y-LG*0.9, x2:x, y2:y+LG*0.9,
    stroke:INK, 'stroke-width':1.6})));
  const t = el('text',{x:(x1+x2)/2, y:top-8, 'font-size':13, 'font-weight':'700', fill:INK,
    'text-anchor':'middle', 'font-family':ST.font});
  t.textContent = n;
  SVGT.appendChild(t);
}
function lnEffTable(perLine){          // [mi] => 그 마디가 속한 줄의 마디 수
  const eff = []; let cur = perLine;
  for(let i=0; i<measures.length; i++){ if(measures[i] && measures[i].ln) cur = measures[i].ln; eff[i] = cur; }
  return eff;
}
/* 설계 폭의 마디 수 — 줄마디와 표식 중 제일 큰 값. 첫 줄 6·나머지 4면 6마디 폭이 지면이고
   4마디 줄은 그 폭으로 늘어난다(인쇄 악보의 단은 늘 같은 폭이다). paint와 페이지 예산이 같이 본다 */
function designPerLine(perLine){
  let d = Math.max(1, perLine|0);
  for(const m of measures) if(m && m.ln > d) d = m.ln;
  return d;
}

const STICK_KEY = 'maidrum.stickpos';
let STICK_POS = (function(){
  try{ return localStorage.getItem(STICK_KEY) === 'above' ? 'above' : 'below'; }
  catch(e){ return 'below'; }
})();

/* 가사·메모 글자 크기 — 기기 설정 (2026-08-18, 사용자 제보 "좀 작은 것 같다").
   **기본을 12로 올렸다.** 원래 10이었는데, 만든 사람이 작다고 느끼면 남도 그렇다.
   데이터가 아니라 그림이라 배경색·R·L 위치와 같은 자리에 둔다 — 남에게 보낸 악보는
   그 사람 설정대로 보인다. 10은 **옛 기준값**이라 아래 여백 계산의 기준으로도 쓴다. */
const TEXT_KEY = 'maidrum.textsize';
const TEXT_SIZES = {s:10, m:12, l:15};
const TEXT_BASE_PX = 10;                    // 예전 크기. 여백 차이를 이 값 기준으로 잰다
let TEXT_SIZE = (function(){
  try{ const v = localStorage.getItem(TEXT_KEY); return TEXT_SIZES[v] ? v : 'm'; }
  catch(e){ return 'm'; }
})();
const textPx = ()=> TEXT_SIZES[TEXT_SIZE] || TEXT_SIZES.m;

/* ── 악보 크기 (2.1, 2026-10-15 — "어르신들 레슨 때 안 보이신다") ──
   기기 설정. 화면·인쇄·PDF·PNG 전부. 구현은 **그림을 키우는 게 아니라 설계 폭을 줄이는 것**이다:
   - 화면 auto: paint에 카드 폭/Z를 주고 SVG를 카드 폭으로 띄운다 → Z배
   - 고정 배치(악보 탭·세로 패드·인쇄): 줄의 설계 폭(fullW·줄 나누기 base·페이지 예산)을 /Z →
     한 줄에 마디가 덜 들어가고, 종이 폭에 맞춰 늘어나며 Z배가 된다
   음표 크기·간격 규칙(간격표·충돌 최소)은 하나도 안 건드린다 — 100%면 예전과 바이트 동일.
   영상(oneRow)과 인증샷(noZoom)은 안 탄다 — 자기 캔버스 크기가 따로 있다. */
const ZOOM_KEY = 'maidrum.zoom';
const ZOOMS = [90, 100, 115, 130, 150];
let SCORE_ZOOM = (function(){
  try{ const v = +localStorage.getItem(ZOOM_KEY); return ZOOMS.includes(v) ? v : 100; }
  catch(e){ return 100; }
})();
const zoomF = ()=> (SCORE_ZOOM || 100) / 100;

/* ── Apple Pencil (2026-08-17) ─────────────────────────────
   아이패드에서 채보하는 사람은 펜과 손가락을 **다른 도구로** 쓴다 —
   펜은 찍는 것, 손가락은 넘기는 것. 브라우저는 둘을 같은 포인터로 주지만
   `pointerType`으로 갈린다.

   두 가지가 갈린다.
   1) **펜은 즉시 찍고 끌어서 칠한다.** 손가락은 스크롤일 수 있어 `pointerup`까지
      미루지만(TAP_SLOP), 펜은 스크롤 도구가 아니라 미룰 이유가 없다. 그래서
      마우스와 같은 길로 보낸다 — 8비트 하이햇을 한 줄로 쭉 긋는 게 이걸로 된다.
   2) **`PEN_ONLY`면 손가락은 입력하지 않는다.** 펜으로 그리는 동안 손이 그리드에
      닿는 걸 막는다. TAP_SLOP은 움직이는 손가락만 걸러서, 가만히 짚은 손은 탭이 된다.

   기본값은 끔이다. 켜는 건 사용자가 정한다 — 펜을 처음 쓰면 한 번 물어본다.
   묻고 나면 다시 묻지 않는다(`PEN_ASKED`). 손가락만 쓰는 사람에게는 이 설정이
   아예 보이지 않는다(`PEN_SEEN`). */
const PEN_ONLY_KEY = 'maidrum.penonly';
const PEN_SEEN_KEY = 'maidrum.penseen';
let PEN_ONLY = false, PEN_SEEN = false, PEN_ASKED = false;
try{
  PEN_ONLY = localStorage.getItem(PEN_ONLY_KEY) === '1';
  PEN_SEEN = localStorage.getItem(PEN_SEEN_KEY) === '1';
  PEN_ASKED = PEN_SEEN;          // 이미 본 적 있으면 물어본 적도 있는 것으로 친다
}catch(e){}

function beatCount(m){ return groupsOf(m).length; }
function divOf(m, b, voice){
  const d = m && m.div && m.div[b];
  const v = d ? d[VK[voice]] : 0;
  /* 이 박이 받을 수 있는 값만 통과시킨다. 6/8 마디에 16분(4)이 적힌 파일이
     들어와도 3으로 접힌다 — 데이터가 아니라 표기가 불가능한 조합이라서 */
  return divsFor(m, b).includes(v) ? v : defaultDivFor(m, b);
}
/* 성부 v의 박 b가 시작하는 배열 인덱스 */
function beatOffset(m, voice, b){
  let n = 0;
  for(let i=0; i<b; i++) n += divCells(divOf(m, i, voice));
  return n;
}
function voiceLen(m, voice){ return beatOffset(m, voice, beatCount(m)); }
function idxAt(m, voice, b, k){ return beatOffset(m, voice, b) + k; }
/* 배열 인덱스 → {b, k} */
function locOf(m, voice, idx){
  let n = 0;
  for(let b=0; b<beatCount(m); b++){
    const d = divOf(m, b, voice), c = divCells(d);
    if(idx < n + c) return {b, k: idx - n, d};
    n += c;
  }
  const b = beatCount(m) - 1, d = divOf(m, b, voice);
  return {b, k: divCells(d)-1, d};
}
/* 마디 시작부터 몇 박째인지(실수). **재생 시각과 x좌표가 전부 여기서 나온다.** */
function beatPosOf(m, voice, idx){
  const l = locOf(m, voice, idx);
  return l.b + cellFrac(l.d, l.k);
}
/* 곡 전체의 박자표. **마디마다 담기지만 UI는 곡 하나로 다룬다** —
   곡 중간에 박자가 바뀌는 것은 줄 나누기·폭 계산까지 건드려야 해서 다음 단계다.
   여기 값은 "새 마디를 만들면 무엇이 되나"를 정한다. */
let SONG_TS = [4, 4], SONG_GRP = null;

/* ── 악보 요소 (v4 자리, 2026-08-13) ──────────
   **필드를 먼저 확정하고 기능은 나눠 올린다.** v3에서 `ts`를 미리 박아 둔 덕에
   셋잇단이 마이그레이션 없이 들어왔다. 같은 수를 한 번 더 쓴다.

     m.sec  구간 이름 / m.rep 도돌이 {a,b,times} / m.end 괄호 1·2
     m.nav  기호 / m.text 가사·메모

   **비어 있으면 필드를 아예 안 만든다.** 400마디에 빈 객체가 다섯 개씩 붙으면
   지금 12.8KB인 32마디가 배로 뛴다. */
const SECTIONS = ['인트로','벌스','프리코러스','코러스','브릿지','간주','솔로','아웃트로','코다'];
const NAV_OK   = ['segno','coda','tocoda','ds','dc','fine'];
/* ── 셈여림 · 헤어핀 (1.8, 2026-10-07 — 08-29 요청 5-b·6, 10-06 재요청) ──
     m.dyn  'pp'…'ff'   그 마디 dynB박(0이면 생략)에 셈여림 기호
     m.hp   '<' | '>'   크레센도·디크레센도. **같은 기호가 이어진 마디는 하나로** 그린다 —
                        구간을 따로 담지 않아 마디 복사·삭제·박자표 바꾸기가 저절로 따라간다
     m.hpB  시작 박     구간 첫 마디에서만 뜻이 있다(0이면 생략)
     m.hpS  1           **여기서 새 헤어핀** — 앞 마디가 같은 기호여도 잇지 않는다 (1.9, 2026-10-08).
                        없으면 1.8과 같다(이어 그린다). 옛 앱은 모르는 키라 버리고 이어 그린다
   **표기만이다 — 소리는 안 바뀐다**(요청이 표시였다). 기본이면 열쇠를 아예 안 만든다.
   옛 앱은 모르는 키라 조용히 버린다 — 음표는 그대로다 */
const DYN_OK   = ['pp','p','mp','mf','f','ff'];
const HP_OK    = ['<','>'];
/* Bravura dynamicPiano·Mezzo·Forte (U+E520~E522) 아웃라인 — REST_GLYPH와 같은 방법·배율(36/em).
   글자를 글꼴로 안 쓰는 이유: 기기마다 이탤릭 세리프가 달라 "앱 티"가 나는 자리다 */
const DYN_GLYPH = {
  p: {adv:13.14, d:'M9.86 -9.86C8.75 -9.86 7.96 -9.5 7.31 -8.93C6.8 -8.5 6.7 -8.21 6.55 -8.21C6.37 -8.21 6.48 -8.46 6.16 -9.07C5.9 -9.5 5.36 -9.83 4.43 -9.83C2.3 -9.83 1.15 -8.32 0.04 -6.26C-0.14 -5.94 -0.22 -5.76 -0.22 -5.58C-0.22 -5.33 -0.04 -5.18 0.18 -5.18C0.43 -5.18 0.58 -5.4 0.76 -5.72C1.8 -7.52 2.52 -8.46 3.17 -8.46C3.46 -8.46 3.56 -8.28 3.56 -8.03C3.56 -7.74 3.46 -7.38 3.35 -7.13L-1.08 3.85C-1.19 4.14 -1.26 4.21 -1.62 4.21L-2.74 4.21C-3.06 4.21 -3.2 4.36 -3.2 4.68C-3.2 4.97 -3.06 5.11 -2.77 5.11L4.18 5.11C4.5 5.11 4.64 4.97 4.64 4.64C4.64 4.36 4.5 4.21 4.21 4.21L2.77 4.21C2.56 4.21 2.45 4.21 2.45 4.1C2.45 4.07 2.48 3.96 2.52 3.85L4.14 -0.18C4.21 -0.36 4.28 -0.61 4.46 -0.61C4.64 -0.61 4.75 -0.25 5.33 0.04C5.83 0.29 6.3 0.36 6.91 0.36C10.37 0.36 13.18 -3.24 13.18 -6.66C13.18 -8.75 11.88 -9.86 9.86 -9.86ZM8.89 -8.53C9.5 -8.53 9.72 -7.99 9.72 -7.2C9.72 -5.44 7.81 -0.86 6.08 -0.86C5.47 -0.86 5.18 -1.26 5.18 -2.02C5.18 -2.77 5.47 -3.49 5.87 -4.5L6.59 -6.26C7.09 -7.49 8.03 -8.53 8.89 -8.53Z'},
  m: {adv:15.73, d:'M13.21 -9.86C12.17 -9.86 11.34 -9.36 10.76 -8.75C10.4 -8.39 10.37 -8.24 10.22 -8.24C10.04 -8.24 10.15 -8.53 9.94 -9C9.72 -9.47 9.25 -9.86 8.35 -9.86C7.31 -9.86 6.48 -9.36 5.9 -8.75C5.54 -8.39 5.51 -8.24 5.36 -8.24C5.18 -8.24 5.29 -8.5 5.08 -9C4.86 -9.47 4.36 -9.83 3.67 -9.83C1.76 -9.83 0.65 -8.28 -0.47 -6.26C-0.65 -5.94 -0.72 -5.76 -0.72 -5.58C-0.72 -5.33 -0.54 -5.18 -0.32 -5.18C-0.07 -5.18 0.04 -5.36 0.22 -5.65C1.3 -7.49 2.02 -8.46 2.66 -8.46C2.95 -8.46 3.06 -8.28 3.06 -8.03C3.06 -7.74 2.95 -7.38 2.84 -7.13L0.22 -0.61C0.14 -0.43 0.11 -0.32 0.11 -0.22C0.11 -0.07 0.22 0 0.5 0L2.27 0C2.59 0 2.7 -0.07 2.84 -0.43L5.18 -6.26C5.62 -7.31 6.37 -8.06 7.16 -8.06C7.6 -8.06 7.7 -7.85 7.7 -7.56C7.7 -7.13 7.56 -6.73 7.34 -6.23C7.34 -6.19 7.31 -6.19 5.08 -0.61C5 -0.43 4.97 -0.32 4.97 -0.22C4.97 -0.07 5.08 0 5.36 0L7.13 0C7.45 0 7.56 -0.07 7.7 -0.43L10.04 -6.26C10.48 -7.31 11.23 -8.06 12.02 -8.06C12.46 -8.06 12.56 -7.85 12.56 -7.56C12.56 -6.3 10.33 -2.59 10.33 -1.08C10.33 -0.14 10.91 0.36 11.95 0.36C13.32 0.36 14.58 -0.65 15.73 -2.56C15.95 -2.92 16.06 -3.13 16.06 -3.31C16.06 -3.53 15.91 -3.64 15.73 -3.64C15.48 -3.64 15.37 -3.46 15.19 -3.17C14.51 -2.09 13.82 -1.22 13.36 -1.22C13.14 -1.22 13.07 -1.33 13.07 -1.55C13.07 -2.81 15.16 -5.94 15.16 -7.92C15.16 -8.82 14.69 -9.86 13.21 -9.86Z'},
  f: {adv:13.1, d:'M0.58 -9.5C0.18 -9.5 0 -9.32 0 -8.93C0 -8.57 0.18 -8.39 0.54 -8.39L2.63 -8.39C2.84 -8.39 2.92 -8.39 2.92 -8.24C2.92 -8.17 2.88 -8.06 2.84 -7.88L0.58 0C-0.43 3.53 -1.08 4.68 -2.52 4.68C-2.99 4.68 -3.17 4.54 -3.17 4.36C-3.17 4.07 -2.84 4.25 -2.3 3.89C-1.87 3.6 -1.58 3.13 -1.58 2.56C-1.58 1.62 -2.23 1.08 -3.2 1.08C-4.28 1.08 -5.08 1.94 -5.08 3.06C-5.08 4.64 -3.89 5.47 -2.38 5.47C0.36 5.47 2.05 3.64 4.03 -0.43C5.08 -2.63 5.87 -4.86 6.73 -7.92L6.77 -7.96C6.77 -8.06 7.06 -8.39 7.24 -8.39L9.58 -8.39C9.97 -8.39 10.15 -8.57 10.15 -8.96C10.15 -9.32 9.97 -9.5 9.61 -9.5L7.45 -9.5C7.2 -9.5 7.09 -9.5 7.09 -9.68C7.09 -9.79 7.13 -9.9 7.16 -10.12C7.88 -13.25 8.68 -15.16 10.48 -15.16C10.76 -15.16 11.05 -15.08 11.05 -14.87C11.05 -14.65 10.87 -14.69 10.48 -14.51C10.01 -14.29 9.72 -13.79 9.72 -13.14C9.72 -12.13 10.44 -11.63 11.34 -11.63C12.28 -11.63 13.1 -12.24 13.1 -13.57C13.1 -14.9 12.28 -15.98 10.01 -15.98C6.52 -15.98 4.57 -13.5 3.38 -10.04C3.2 -9.5 3.17 -9.5 2.66 -9.5Z'}
};

/* 인자를 안 주면 **곡의 박자표를 따른다** — 6/8 곡에서 마디를 더하면 6/8 마디가 나온다.
   ts와 grp를 div보다 먼저 세워야 한다: `normDiv`가 박 수를 알아야 배열을 만든다 */
function emptyMeasure(div, ts, grp){
  const m = {ts: (ts || SONG_TS).slice(0, 2)};
  const g = (grp !== undefined) ? grp : SONG_GRP;
  if(g && g.length) m.grp = g.slice();
  m.div = normDiv(div, m);
  CATALOG.forEach(i => m[i.id] = new Array(voiceLen(m, i.voice)).fill(0));   // 숨긴 악기도 자리를 갖는다
  return m;
}

/* 한 박의 분할을 바꾼다. 4칸에 찍힌 걸 3칸으로 옮길 방법이 없으므로 **그 박은 지워진다.**
   지워진 음이 있었는지 알려 준다 — 되돌리기 안내를 띄울지 판단하는 데 쓴다. */
/* Safe tuplet edits preserve every occupied onset and its metadata. Compare
   rational positions by cross multiplication; never round a note to a new slot.
   Note lengths are still inferred by the existing notation engine. */
function tupletSlotRatio(d, k){
  const p = divParts(d);
  return !p ? [k, d] : k < p[0] ? [k, 2*p[0]] : [p[1]+k-p[0], 2*p[1]];
}
function tupletRows(m, voice){
  const ids = CATALOG.filter(i=>i.voice === voice).map(i=>i.id);
  const rows = ids.map(id=>({field:id, row:m[id]}));
  if(voice === 'hand' && m.stick) rows.push({field:'stick', row:m.stick});
  for(const key of ['orn','ornIns','tie','vel']){
    for(const id of ids) if(m[key] && m[key][id]) rows.push({field:key+'.'+id, row:m[key][id]});
  }
  return rows.filter(r=>Array.isArray(r.row));
}
function inspectTupletBeat(m, beat, voice, division){
  const from = divOf(m, beat, voice), target = {beat,voice,from,to:division,changed:from !== division,slots:[]};
  if(!divsFor(m, beat).includes(division)) return {...target, reason:'unsupported-division', conflict:true};
  if(!target.changed) return {...target,conflict:false};
  const offset = beatOffset(m, voice, beat), rows = tupletRows(m, voice);
  target.mapping = Array.from({length:divCells(from)}, (_,k)=>{
    const [a,b] = tupletSlotRatio(from,k);
    for(let j=0;j<divCells(division);j++){
      const [c,d] = tupletSlotRatio(division,j);
      if(a*d === c*b) return j;
    }
    const fields = rows.filter(r=>r.row[offset+k]).map(r=>r.field);
    if(fields.length) target.slots.push({slot:k,fraction:a/b,fields});
    return -1;
  });
  return {...target,conflict:target.slots.length > 0};
}
function preserveTupletBeat(m, target){
  const {beat,voice,from,to,mapping} = target;
  if(!target.changed || target.conflict) return;
  const offset = beatOffset(m,voice,beat);
  for(const {row} of tupletRows(m,voice)){
    const replacement = new Array(divCells(to)).fill(0);
    for(let k=0;k<divCells(from);k++) if(mapping[k] >= 0) replacement[mapping[k]] = row[offset+k] || 0;
    row.splice(offset,divCells(from),...replacement);
  }
  m.div[beat][VK[voice]] = to;
}
function setDiv(m, b, voice, d){
  if(!divsFor(m, b).includes(d)) return false;   // 점4분 박은 3·6만 받는다
  if(divOf(m, b, voice) === d) return false;
  const from = beatOffset(m, voice, b), old = divCells(divOf(m, b, voice));
  const dc = divCells(d);                         // 섞어 나누기(23 등)는 코드와 칸 수가 다르다
  let lost = false;
  // **CATALOG로 돈다.** 숨긴 악기의 배열만 안 늘리면 길이가 어긋나 바로 터진다
  CATALOG.filter(i=>i.voice===voice).forEach(i=>{
    const arr = m[i.id];
    const cut = arr.splice(from, old, ...new Array(dc).fill(0));
    if(cut.some(v=>v)) lost = true;
  });
  // 손 순서(R·L)도 손 성부 길이를 따라간다 — 같이 안 자르면 인덱스가 통째로 밀린다
  if(voice === 'hand' && m.stick){
    m.stick.splice(from, old, ...new Array(dc).fill(0));
    if(!m.stick.some(v=>v)) delete m.stick;
  }
  // 앞꾸밈음도 같은 이유로 악기별 행을 같이 자른다
  if(voice === 'hand' && m.orn){
    for(const id in m.orn){
      m.orn[id].splice(from, old, ...new Array(dc).fill(0));
      if(!m.orn[id].some(v=>v)) delete m.orn[id];
    }
    if(!Object.keys(m.orn).length) delete m.orn;
  }
  if(voice === 'hand' && m.ornIns){
    for(const id in m.ornIns) m.ornIns[id].splice(from, old, ...new Array(dc).fill(0));
    pruneOrnIns(m);
  }
  // 붙임줄도 그 성부의 악기 행을 같이 자른다 — 안 자르면 인덱스가 통째로 밀린다
  if(m.tie){
    CATALOG.filter(i=>i.voice===voice).forEach(i=>{
      if(!m.tie || !m.tie[i.id]) return;
      m.tie[i.id].splice(from, old, ...new Array(dc).fill(0));
      if(!m.tie[i.id].some(v=>v)) delete m.tie[i.id];
    });
    if(m.tie && !Object.keys(m.tie).length) delete m.tie;
  }
  if(m.vel){ for(const i of CATALOG.filter(i=>i.voice===voice)){ const row=m.vel[i.id]; if(row) row.splice(from,old,...new Array(dc).fill(0)); } pruneVelocity(m); }
  m.div[b][VK[voice]] = d;
  return lost ? 'lost' : true;
}
/* ── 2박 묶기 / 해제 (2026-08-24) — 2박 3연음의 자리 ──
   4/4의 이웃한 두 박(각 4분음표)을 `grp` 값 2 하나로 합친다. 묶은 박을 3으로
   나누면 그게 4분음표 셋잇단이다. **마디 구조라 손·발이 같이 영향을 받는다** —
   묶은 뒤 발은 그 박 안에서 2칸(4분)·4칸(8분)으로 따로 찍는다.
   나누기(setDiv)와 같은 정책: 옮길 방법이 없으므로 **그 자리의 음은 지워지고**,
   지워진 게 있으면 'lost'를 돌려줘 되돌리기 토스트를 띄운다. */
function setBeatMerge(m, b, on){
  if(tsOf(m)[1] !== 4) return false;
  const g = groupsOf(m).slice();
  if(on){ if(!(g[b] === 1 && g[b+1] === 1)) return false; }
  else  { if(g[b] !== 2) return false; }
  let lost = false;
  ['hand','foot'].forEach(voice=>{
    const from = beatOffset(m, voice, b);
    const oldCnt = on ? divCells(divOf(m, b, voice)) + divCells(divOf(m, b+1, voice)) : divCells(divOf(m, b, voice));
    /* 묶으면 손은 3칸(셋잇단 — 이 기능의 용건), 발은 2칸(4분 그대로).
       풀면 두 박 다 기본 16분(4칸씩)이다 */
    const newCnt = on ? (voice === 'hand' ? 3 : 2) : 8;
    // CATALOG로 돈다 — 숨긴 악기의 배열만 안 맞추면 길이가 어긋나 터진다 (setDiv와 같다)
    CATALOG.filter(i=>i.voice===voice).forEach(i=>{
      const cut = m[i.id].splice(from, oldCnt, ...new Array(newCnt).fill(0));
      if(cut.some(v=>v)) lost = true;
    });
    if(voice === 'hand'){
      if(m.stick){
        m.stick.splice(from, oldCnt, ...new Array(newCnt).fill(0));
        if(!m.stick.some(v=>v)) delete m.stick;
      }
      if(m.orn){
        for(const id in m.orn){
          m.orn[id].splice(from, oldCnt, ...new Array(newCnt).fill(0));
          if(!m.orn[id].some(v=>v)) delete m.orn[id];
        }
        if(m.orn && !Object.keys(m.orn).length) delete m.orn;
      }
      if(m.ornIns){
        for(const id in m.ornIns) m.ornIns[id].splice(from, oldCnt, ...new Array(newCnt).fill(0));
        pruneOrnIns(m);
      }
    }
    if(m.vel){ for(const i of CATALOG.filter(i=>i.voice===voice)){ const row=m.vel[i.id]; if(row) row.splice(from,oldCnt,...new Array(newCnt).fill(0)); } pruneVelocity(m); }
    if(m.tie){
      CATALOG.filter(i=>i.voice===voice).forEach(i=>{
        if(!m.tie || !m.tie[i.id]) return;
        m.tie[i.id].splice(from, oldCnt, ...new Array(newCnt).fill(0));
        if(!m.tie[i.id].some(v=>v)) delete m.tie[i.id];
      });
      if(m.tie && !Object.keys(m.tie).length) delete m.tie;
    }
  });
  if(on){ g.splice(b, 2, 2); m.div.splice(b, 2, {h:3, f:2}); }
  else  { g.splice(b, 1, 1, 1); m.div.splice(b, 1, {h:4, f:4}, {h:4, f:4}); }
  if(g.every(v=>v===1)) delete m.grp; else m.grp = g;
  return lost ? 'lost' : true;
}
let measures = [emptyMeasure()];
let selMeasure = 0;
let bpm = 100, looping = true, playing = false;
let selArt = ART.NORM;                     // 표기 팔레트에서 고른 값
let selStick = 0;                          // R·L 모드 (0=끔, 1=R, 2=L) — 켜져 있으면 탭이 글자를 적는다
let selTie = 0;                            // 붙임줄 모드 (0=끔, 1=켬) — 탭한 음을 같은 악기의 앞 음과 잇는다
/* 앞꾸밈음 모드 (0=끔, 1=플램, 2=드래그) — 2026-08-17.
   **표기 값(ART)과 섞지 않는다.** 액센트 플램·고스트 드래그를 적어야 하고(사용자 결정),
   ART를 건드리면 이미 검증된 소리·표기 비교 코드를 전부 다시 손대야 한다.
   그래서 R·L처럼 별도 데이터 + 모드 방식이다. 다만 **꾸밈음은 칸이 아니라 음표의 것**이라
   악기별로 담는다: `m.orn = {악기id: [0|1|2, …]}` (손 성부 길이). */
let selOrn = 0;
let selOrnIns = '';                         // 꾸밈 악기 — ''이면 본음과 같은 악기 (2026-10-02)
const ORN_LEAD = {1: 0.028, 2: 0.055, 3: 0.082};     // 앞꾸밈 첫 타가 본음보다 얼마나 앞서나(초)
/* 붙임줄 (2026-08-24). `m.tie = {악기id: [0|1 × 그 성부 길이]}` —
   값 1 = 이 칸의 음이 **같은 악기의 바로 앞 온셋**과 이어져 있다(그 마디 안에서).
   이어진 음은 다시 치지 않는다 — 그리기는 곡선, 재생은 건너뛴다.
   R·L·앞꾸밈음과 같은 전방 호환: 옛 버전은 모르는 키라 조용히 버리고 음표는 남는다. */
/* Explicit MIDI velocity is optional; null preserves the original articulation sound. */
function noteVelocity(m, id, step){
  const value=m?.vel?.[id]?.[step];
  return m?.[id]?.[step] && Number.isInteger(value) && value>=1 && value<=127 ? value : null;
}
function pruneVelocity(m){
  if(!m?.vel) return;
  for(const id of Object.keys(m.vel)){
    const row=m.vel[id];
    if(!Array.isArray(row)||!m[id]){delete m.vel[id];continue;}
    row.length=m[id].length;
    for(let s=0;s<row.length;s++) if(!m[id][s]||!Number.isInteger(row[s])||row[s]<1||row[s]>127) row[s]=0;
    if(!row.some(Boolean)) delete m.vel[id];
  }
  if(!Object.keys(m.vel).length) delete m.vel;
}
function tieOf(m, insId, s){
  return (m && m.tie && m.tie[insId] && m.tie[insId][s]) ? 1 : 0;
}
function ornOf(m, insId, s){
  const r = m && m.orn && m.orn[insId];
  return r ? (r[s]|0) : 0;
}
/* 꾸밈음을 치는 악기 (2026-10-02, 드러머 제보 — "꾸밈음이 다른 위치에도 찍혀야 한다").
   `m.ornIns = {악기id: [0|손악기id, …]}` — orn과 같은 모양이고 꾸밈음이 있는 칸만 산다.
   비어 있으면 본음과 같은 악기. 옛 버전은 이 키를 몰라 무시한다 → 같은 악기 꾸밈음으로 보인다 */
function ornInsOf(m, insId, s){
  const r = m && m.ornIns && m.ornIns[insId];
  const g = r ? r[s] : 0;
  return (g && byId[g] && byId[g].voice === 'hand' && g !== insId) ? g : insId;
}
function setOrnIns(m, insId, s, g){
  if(g){
    if(!m.ornIns) m.ornIns = {};
    if(!m.ornIns[insId]) m.ornIns[insId] = new Array(voiceLen(m, 'hand')).fill(0);
    m.ornIns[insId][s] = g;
  } else if(m.ornIns && m.ornIns[insId]){
    m.ornIns[insId][s] = 0;
  }
  pruneOrnIns(m);
}
/* 꾸밈음이 없는 칸의 꾸밈 악기는 유령이다 — 지운다. 빈 행·빈 키도 같이 */
function pruneOrnIns(m){
  if(!m || !m.ornIns) return;
  for(const id in m.ornIns){
    const row = m.ornIns[id], o = m.orn && m.orn[id];
    for(let i=0; i<row.length; i++) if(!(o && o[i])) row[i] = 0;
    if(!row.some(v=>v)) delete m.ornIns[id];
  }
  if(!Object.keys(m.ornIns).length) delete m.ornIns;
}
/* 이 박(손 분할)에 꾸밈음이 하나라도 있나 — 박 폭을 넓힐지 판단한다 */
function ornInBeat(m, b){
  if(!m || !m.orn) return 0;
  const off = beatOffset(m, 'hand', b), d = divCells(divOf(m, b, 'hand'));
  let max = 0;
  for(const id in m.orn){
    const row = m.orn[id]; if(!row) continue;
    for(let k=0; k<d; k++){ const v = row[off+k]|0; if(v > max) max = v; }
  }
  return max;
}

/* ================= 실행 취소 ================= */
/* _cur 는 "마지막으로 커밋된 시점의 상태". 변경을 마친 뒤 commit()을 부르면
   _cur(=변경 직전 상태)가 히스토리로 밀려나고 _cur가 현재 상태로 갱신된다. */
/* ================= 곡 정보 (머리말) — 2026-08-27 =================
   상용 악보에는 제목만 있지 않다. 작사·작곡·편곡·노래·저작권이 지면에 박혀야
   남에게 건넬 수 있는 종이가 된다. 제목은 예전부터 **곡 이름**(라이브러리 표시,
   파일 이름)이라 `titleInput`에 그대로 두고, 나머지만 여기 모은다.

   되돌리기 스냅샷과 저장 포맷에 같이 들어간다 — 제목만 되살아나고 작곡가가
   안 돌아오면 그게 더 이상하다. */
const META_KEYS = ['sub','artist','lyricist','composer','arranger','copyright'];
let songMeta = metaClean(null);
function metaClean(o){
  const m = {};
  META_KEYS.forEach(k => m[k] = String((o && o[k]) || '').replace(/\s+/g,' ').trim().slice(0, 80));
  return m;
}
function metaEmpty(m){ return META_KEYS.every(k => !m[k]); }

/* ================= 악보 스타일 (2026-08-27) =================
   재즈 차트와 손사보는 **다른 글꼴을 쓴 악보**가 아니라 다른 손으로 그린 악보다.
   우리는 음표를 글꼴 글리프가 아니라 SVG 도형으로 그리므로, 글꼴을 사 오는 대신
   **그리는 값 자체를 스타일마다 달리 잡는다** — 머리 기울기·크기, 선 두께, 흔들림.

   글자만 글꼴을 탄다. **새 글꼴을 번들하지 않는다**(2026-08-27 사용자 결정) —
   아이패드·맥에 이미 있는 필기체(Noteworthy·Bradley Hand·Chalkboard SE)를 부른다.
   ⚠ 그래서 **한글 가사·구간 이름은 필기체가 안 된다.** 시스템에 한글 필기체가
   없어서다. 한글까지 손글씨로 가려면 OFL 글꼴을 수백KB~1MB 싣는 결정이 따로 필요하다.

   ★★ **오선은 어느 스타일에서도 곧고 두께가 같다.** 손사보라고 오선을 물결치게
   그렸다가 되돌렸다(2026-08-27 사용자 지적) — 오선은 자로 그은 격자고, 손으로
   베낀 악보에서도 오선지는 인쇄된 것을 쓴다. **손맛은 음표에만** 있어야 한다:
   머리를 조금씩 어긋나게 놓고, 기울기를 흔들고, 줄기를 살짝 기울인다.
   `staff`는 세 스타일 모두 1이다 — 이 값을 스타일마다 다르게 두지 말 것.

   ★ `classic`의 값은 **전부 예전 하드코딩 값과 한 글자도 같다.** 그래야 옛 악보가
   한 픽셀도 안 움직인다(verify-render-same.js가 이 조건을 바이트로 잰다).
   숫자를 고칠 때는 classic만은 건드리지 말 것. */
const SERIF = 'Georgia,"Times New Roman",serif';
const SCORE_STYLES = {
  /* 값의 근거: design-review-0903/engraving-standards.md §17 (1sp = LG 9px).
     stem 0.12sp=1.1 · beam 0.5sp=4.5 · 머리 세로 반지름 0.5sp=4.5 · 기울기 -22°.
     예전 값(stem 1.6 · beam 3.6)은 스템이 굵고 빔이 얇아 굵기 위계가 뒤집혀 있었다 —
     "화면용"으로 읽히는 가장 큰 원인(2026-09-03 점검, 2026-09-10 적용).
     verify-render-same의 비교 기준은 이 커밋 이후 판이다. */
  classic: {label:'클래식', font:SERIF, italic:false,
            headRx:5.4, headRy:4.5, ghostRx:4.1, ghostRy:3.1, tilt:-22,
            stem:1.1, beam:4.5, staff:1, hollow:1.7, xw:1.8, xwg:1.4, jitter:0},
  /* 재즈 차트 — 머리를 더 눕히고 빔을 두껍게. 기호는 이탤릭(Real Book의 손맛) */
  jazz:    {label:'재즈', font:SERIF, italic:true,
            headRx:5.8, headRy:3.7, ghostRx:4.4, ghostRy:2.9, tilt:-27,
            stem:1.5, beam:5.0, staff:1, hollow:1.6, xw:1.9, xwg:1.5, jitter:.35},
  /* 손사보 — 머리를 둥글고 크게, 선을 굵게, 그리고 **살짝 삐뚤게**.
     흔들림이 이 스타일의 전부다. 없으면 그냥 굵은 클래식이다 */
  hand:    {label:'손사보', font:'Noteworthy,"Bradley Hand","Chalkboard SE","Segoe Print","Comic Sans MS",' + SERIF,
            italic:false,
            headRx:5.7, headRy:4.8, ghostRx:4.3, ghostRy:3.4, tilt:-11,
            stem:2.2, beam:5.4, staff:1, hollow:2.1, xw:2.3, xwg:1.8, jitter:1.5},
};
let scoreStyle = 'classic';
/* 머리말 글자 크기 — 스타일처럼 곡 데이터다. '보통'=1이면 예전 값 그대로라 옛 악보는 안 움직인다 */
const HEAD_SIZES = {small:.85, normal:1, large:1.2};
let headSize = 'normal';
/* 템포 표기(♩ = 120). **BPM은 예전부터 곡에 저장되고 있었다** — 그리기만 없었다.
   기본은 꺼짐이라 옛 악보는 안 변한다. 채보에 따라 BPM을 안 쓰기도 한다. */
let showTempo = false;
let ST = SCORE_STYLES.classic;
function setScoreStyle(k, quiet){
  if(typeof k !== 'string' || !Object.hasOwn(SCORE_STYLES, k)) k = 'classic';
  if(k === scoreStyle && ST === SCORE_STYLES[k]) { if(!quiet) return; }
  scoreStyle = k; ST = SCORE_STYLES[k];
  const box = document.getElementById('styleScope');
  if(box) box.querySelectorAll('button').forEach(b =>
    b.classList.toggle('sel', b.dataset.style === k));
  if(!quiet && typeof renderScore === 'function') renderScore();
}
/* 결정적 흔들림 — **좌표에서 뽑는다.** Math.random을 쓰면 다시 그릴 때마다 그림이
   떨리고(재생 중에는 초당 몇 번씩 다시 그린다) 인쇄가 화면과 달라진다.
   같은 자리는 늘 같게 흔들린다. classic·jazz는 amp가 0이라 정확히 0을 돌려준다. */
function jit(a, b, amp){
  if(!amp) return 0;
  const h = Math.sin(a*12.9898 + b*78.233) * 43758.5453;
  return +(((h - Math.floor(h)) - 0.5) * 2 * amp).toFixed(2);
}

const META_EL = {sub:'mSub', artist:'mArtist', lyricist:'mLyricist',
                 composer:'mComposer', arranger:'mArranger', copyright:'mCopyright'};
/* 곡을 열거나 되돌릴 때 입력칸을 값에 맞춘다. 팝업이 닫혀 있어도 부른다 —
   다음에 열었을 때 옛 곡의 작곡가가 남아 있으면 안 된다. */
function syncMetaUI(){
  META_KEYS.forEach(k=>{
    const e = document.getElementById(META_EL[k]);
    if(e && e.value !== songMeta[k]) e.value = songMeta[k];
  });
  const b = document.querySelector('#railL [data-tool="info"]');
  if(b) b.classList.toggle('has', !metaEmpty(songMeta));
  const mT = document.getElementById('mTitle'), tE = document.getElementById('titleInput');
  if(mT && tE && mT.value !== tE.value) mT.value = tE.value;
  const hb = document.getElementById('headSizeScope');
  if(hb) hb.querySelectorAll('button').forEach(x=> x.classList.toggle('sel', x.dataset.hsize === headSize));
  const tb = document.getElementById('tempoScope');
  if(tb) tb.querySelectorAll('button').forEach(x=>
    x.classList.toggle('sel', (x.dataset.tempo === 'on') === showTempo));
}

(function initSongInfo(){
  const pop = document.getElementById('songPop');
  if(!pop) return;
  const close = ()=> pop.classList.remove('is-open');
  document.getElementById('songClose').onclick = close;
  pop.addEventListener('click', e=>{ if(e.target === pop) close(); });
  document.addEventListener('keydown', e=>{
    if(e.key === 'Escape' && pop.classList.contains('is-open')) close();
  });
  /* 타이핑 한 덩어리를 되돌리기 **한 단계**로 묶는다 — 제목 입력과 같은 700ms 규칙.
     글자마다 commit()하면 되돌리기 80칸이 이름 한 줄로 다 찬다. */
  let tm = 0;
  META_KEYS.forEach(k=>{
    const e = document.getElementById(META_EL[k]);
    if(!e) return;
    e.addEventListener('input', ()=>{
      songMeta[k] = e.value.replace(/\s+/g,' ').slice(0, 80);
      renderScore();                       // 고친 자리가 악보에 바로 보여야 한다
      syncMetaUI();
      clearTimeout(tm); tm = setTimeout(commit, 700);
    });
    e.addEventListener('blur', ()=>{
      const v = songMeta[k].trim();
      if(v === songMeta[k]) return;
      songMeta[k] = v; e.value = v; renderScore(); commit();
    });
  });
  /* 스타일은 곡 데이터라 여기 산다 — 설정(기기 취향)이 아니다.
     고르면 **바로 다시 그린다.** 팝업을 닫아야 보이면 무엇을 고른 건지 모른다. */
  const box = document.getElementById('styleScope');
  if(box) box.addEventListener('click', e=>{
    const b2 = e.target.closest('button'); if(!b2) return;
    setScoreStyle(b2.dataset.style);
    commit();
  });
  /* 제목 — 편집 탭의 제목칸과 같은 값이다. input을 그대로 쏘면
     제목의 700ms 되돌리기 묶음·렌더를 한 길로 탄다 */
  const mT = document.getElementById('mTitle'), tE = document.getElementById('titleInput');
  if(mT && tE) mT.addEventListener('input', ()=>{
    tE.value = mT.value;
    tE.dispatchEvent(new Event('input', {bubbles:true}));
  });
  /* 머리말 글자 크기 — 스타일과 같은 이유로 여기 산다. 고르면 바로 다시 그린다 */
  /* 템포 표기 — 스타일·머리말 크기와 같은 곡 데이터라 여기 산다 */
  const tbox = document.getElementById('tempoScope');
  if(tbox) tbox.addEventListener('click', e=>{
    const b2 = e.target.closest('button'); if(!b2) return;
    const want = (b2.dataset.tempo === 'on');
    if(want === showTempo) return;
    showTempo = want;
    syncMetaUI(); renderScore(); commit();
  });
  const hbox = document.getElementById('headSizeScope');
  if(hbox) hbox.addEventListener('click', e=>{
    const b2 = e.target.closest('button'); if(!b2 || b2.dataset.hsize === headSize) return;
    headSize = b2.dataset.hsize;
    syncMetaUI(); renderScore(); commit();
  });
})();

const HIST_MAX = 80;
let histPast = [], histFuture = [], _cur = null;
function snapshot(){
  /* 곡 정보가 다 비면 `meta`를 아예 안 넣는다 — 옛 악보의 스냅샷 문자열이
     한 글자도 안 달라져서 `commit()`의 같음 비교가 예전과 똑같이 돈다. */
  const o = {m:measures, t:(document.getElementById('titleInput')||{}).value || ''};
  if(!metaEmpty(songMeta)) o.meta = songMeta;
  if(scoreStyle !== 'classic') o.st = scoreStyle;      // 기본값은 안 싣는다
  if(headSize !== 'normal') o.hs = headSize;
  if(showTempo) o.tp = 1;
  return JSON.stringify(o);
}
function commit(){
  if(_cur === null){ _cur = snapshot(); return; }
  const now = snapshot();
  if(now === _cur) return;
  histPast.push(_cur);
  if(histPast.length > HIST_MAX) histPast.shift();
  histFuture.length = 0;
  _cur = now;
  refreshUndoBtns();
  // 모든 변경이 여기를 지난다 — 자동 저장 훅은 이 한 곳이면 충분하다.
  // (BPM은 snapshot에 안 들어가서 commit을 안 타므로 슬라이더에서 따로 부른다)
  autosaveSoon();
}
function applySnapshot(s){
  const d = JSON.parse(s);
  measures = d.m;
  const te = document.getElementById('titleInput');
  if(te) te.value = d.t;
  songMeta = metaClean(d.meta);
  headSize = d.hs || 'normal';
  showTempo = !!d.tp;
  if(typeof syncMetaUI === 'function') syncMetaUI();
  setScoreStyle(d.st || 'classic', true);
  selMeasure = Math.max(0, Math.min(selMeasure, measures.length-1));
  selEnd = Math.max(0, Math.min(selEnd, measures.length-1));
  if(loopRange){
    loopRange.a = Math.max(0, Math.min(loopRange.a, measures.length-1));
    loopRange.b = Math.max(0, Math.min(loopRange.b, measures.length-1));
    if(typeof refreshRangeBtn === 'function') refreshRangeBtn();
  }
  clampCursor();
  refreshChips(); buildGrid(); renderScore(); refreshStepDots(); updateEditCursor();
  autosaveSoon();     // 되돌리기·다시하기도 저장된 상태를 바꾼다
}
function undo(){
  if(!histPast.length) return;
  histFuture.push(_cur);
  _cur = histPast.pop();
  applySnapshot(_cur); refreshUndoBtns();
}
function redo(){
  if(!histFuture.length) return;
  histPast.push(_cur);
  _cur = histFuture.pop();
  applySnapshot(_cur); refreshUndoBtns();
}
function refreshUndoBtns(){
  const u = document.getElementById('undoBtn'), r = document.getElementById('redoBtn');
  if(u) u.disabled = !histPast.length;
  if(r) r.disabled = !histFuture.length;
}

