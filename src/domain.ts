/** Compatibility types at the new workspace boundary. Original v3 normalization
 * remains in the retained persistence core, including its backward compatibility. */
export interface MaiDocument {
  v: number;
  title: string;
  bpm: number;
  measures: Record<string, unknown>[];
  [key: string]: unknown;
}
export interface VelocityNote {instrument:string;measure:number;step:number;row:number;start:number;velocity:number|null;label:string}
export interface VelocityEdit extends VelocityNote {}
export interface WorkspaceBridge {
  measureRepeat():{start:number|null;end:number|null;enabled:boolean;playing:boolean;pending:boolean;total:number;current:number;selectedStart:number;selectedEnd:number};
  playMeasureRepeat(start:number,end:number):Promise<boolean>;
  stopMeasureRepeat(clear?:boolean):void;
  scorePage():{enabled:boolean;start:number;end:number;total:number;page:number;pages:number};
  moveScorePage(direction:number):boolean;
  velocityNotes():VelocityNote[];
  setNoteVelocities(edits:VelocityEdit[]):boolean;
  commitVelocityEdit():void;
  previewVelocity(note:VelocityNote):void;
  isPlaying():boolean;
  activateCell(instrument: string, step: number, measure?: number): void;
  snapshot(): MaiDocument;
  describeCell(instrument: string, step: number, measure?: number): {label: string; pressed: boolean};
  editorView(): {count: number; start: number; end: number; total: number; selected: number};
  setEditorCount(count: number): boolean;
  moveEditorPage(direction: number): boolean;
  selectEditorMeasure(index: number): boolean;
  createNewSong(): boolean;
  isKorean(): boolean;
  storageAvailable(): boolean;
  refreshScore(): void;
  refreshLayout(): void;
  importScore(score: MaiDocument): boolean;
}
declare global {
  interface Window { maiWorkspace: WorkspaceBridge; }
}
