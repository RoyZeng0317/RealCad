// 專案狀態：名稱、檔案 handle（支援的瀏覽器可以直接覆寫原檔）、是否有未儲存變更、復原/重做、提示訊息
import { create } from 'zustand';
import { useWaveLab } from '../waveStore.js';
import { usePsuLab } from '../psuStore.js';
import { useBoard } from '../boardStore.js';
import { useDev } from '../devboards/devStore.js';
import { DEV_KINDS, type DevKind } from '../devboards/boardDefs.js';
import { useFpga } from '../devboards/fpga/fpgaStore.js';
import type { BoardPart } from '../boardParts.js';

/** 復原/重做的快照：麵包板零件與開發板擺放（儀器旋鈕與程式碼不列入，程式碼編輯器有自己的復原） */
interface Snap { parts: BoardPart[]; dev: Record<DevKind, { present: boolean; usb: boolean }> }

interface ProjectState {
  name: string;
  handle: FileSystemFileHandle | null;
  dirty: boolean;
  undo: Snap[];
  redo: Snap[];
  toast: { text: string; kind: 'ok' | 'err' } | null;
  dialog: { title: string; body: string } | null;
  setName: (n: string) => void;
  setToast: (text: string, kind?: 'ok' | 'err') => void;
  setDialog: (d: ProjectState['dialog']) => void;
}

export const useProject = create<ProjectState>((set) => ({
  name: '未命名專案',
  handle: null,
  dirty: false,
  undo: [],
  redo: [],
  toast: null,
  dialog: null,
  setName: (name) => set({ name, dirty: true }),
  setToast: (text, kind = 'ok') => {
    set({ toast: { text, kind } });
    setTimeout(() => { if (useProject.getState().toast?.text === text) set({ toast: null }); }, 3000);
  },
  setDialog: (dialog) => set({ dialog }),
}));

const snap = (): Snap => ({
  parts: useBoard.getState().parts,
  dev: Object.fromEntries(DEV_KINDS.map((k) => {
    const c = useDev.getState().conf[k];
    return [k, { present: c.present, usb: c.usb }];
  })) as Snap['dev'],
});
// 燒毀、溫度這類模擬造成的變化不算編輯
const shape = (s: Snap) => JSON.stringify([s.parts.map((p) => [p.id, p.kind, p.pins, p.value, p.model, p.ledColor, p.color]), s.dev]);

let applying = false;
let suspended = 0;
let pending = false;
let lastShape = '';
let lastSnap: Snap | null = null; // 最近一次「穩定」的擺放狀態（下一次編輯前的樣子）

const settle = () => { lastSnap = snap(); lastShape = shape(lastSnap); };

/** 開檔、新專案等大量改寫 store 時暫停「未儲存」與復原紀錄 */
export function withoutTracking(fn: () => void) {
  suspended++;
  try { fn(); } finally { suspended--; settle(); }
}

function applySnap(s: Snap) {
  applying = true;
  useBoard.setState({ parts: s.parts, selectedId: null, pending: null });
  useDev.setState((d) => {
    const conf = { ...d.conf }, rt = { ...d.rt };
    for (const k of DEV_KINDS) {
      if (conf[k].present !== s.dev[k].present || conf[k].usb !== s.dev[k].usb) {
        conf[k] = { ...conf[k], ...s.dev[k] };
        rt[k] = { ...rt[k], pins: {}, running: true, tripped: false, bootNonce: rt[k].bootNonce + 1 };
      }
    }
    return { conf, rt, selected: null };
  });
  settle();
  applying = false;
  useProject.setState({ dirty: true });
}

export function undo() {
  const { undo: u, redo: r } = useProject.getState();
  const prev = u[u.length - 1];
  if (!prev) return;
  useProject.setState({ undo: u.slice(0, -1), redo: [...r, snap()] });
  applySnap(prev);
}
export function redo() {
  const { undo: u, redo: r } = useProject.getState();
  const next = r[r.length - 1];
  if (!next) return;
  useProject.setState({ redo: r.slice(0, -1), undo: [...u, snap()] });
  applySnap(next);
}

/** 訂閱各 store：有編輯就標記未儲存；麵包板/開發板擺放的變化記進復原堆疊（同一輪事件裡的多次變化合併成一步） */
export function startTracking(): () => void {
  settle();
  const markDirty = () => { if (!suspended && !applying && !useProject.getState().dirty) useProject.setState({ dirty: true }); };
  const onLayout = () => {
    if (suspended || applying) return;
    if (shape(snap()) === lastShape) return; // 只是燒毀/溫度之類的模擬變化
    markDirty();
    if (pending) return;
    pending = true;
    const before = lastSnap;
    queueMicrotask(() => {
      pending = false;
      if (before) useProject.setState((p) => ({ undo: [...p.undo.slice(-99), before], redo: [] }));
      settle();
    });
  };
  const unsubs = [
    useBoard.subscribe((s, p) => {
      if (s.parts !== p.parts) {
        onLayout();
        // ATmega 的程式碼 / Flash 改變不算擺放變化（不進復原堆疊），但要標記未儲存
        const code = (x: typeof s.parts) => x.map((q) => (q.code ?? '') + '\u0000' + (q.flash ?? '')).join('\u0001');
        if (code(s.parts) !== code(p.parts)) markDirty();
      }
      if (s.dmm !== p.dmm) markDirty();
    }),
    useDev.subscribe((s, p) => {
      if (s.conf === p.conf) return;
      if (DEV_KINDS.some((k) => s.conf[k].present !== p.conf[k].present || s.conf[k].usb !== p.conf[k].usb)) onLayout();
      else markDirty();
    }),
    useWaveLab.subscribe((s, p) => { if (s.gen !== p.gen || s.scope !== p.scope) markDirty(); }),
    usePsuLab.subscribe((s, p) => { if (s.psu !== p.psu || s.loadIdx !== p.loadIdx) markDirty(); }),
    useFpga.subscribe((s, p) => {
      if (s.files !== p.files || s.top !== p.top || s.slowHz !== p.slowHz || s.sw !== p.sw || s.epc !== p.epc
        || s.slides !== p.slides || s.sdCard !== p.sdCard || s.tfCard !== p.tfCard || s.speaker !== p.speaker) markDirty();
    }),
  ];
  const beforeUnload = (e: BeforeUnloadEvent) => { if (useProject.getState().dirty) { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', beforeUnload);
  return () => { unsubs.forEach((u) => u()); window.removeEventListener('beforeunload', beforeUnload); };
}
