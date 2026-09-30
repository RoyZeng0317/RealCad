// 開發板狀態：哪些板子在桌上、USB 供電、程式碼（存檔內容）與執行期狀態（腳位模式/輸出、序列埠、錯誤、燒毀的腳）
import { create } from 'zustand';
import { DEV_BOARDS, DEV_KINDS, type DevKind } from './boardDefs.js';
import { compile } from './sketchRun.js';
import { useBoard } from '../boardStore.js';

export interface DevConf { present: boolean; usb: boolean; code: string }
export interface PinRt { mode: number; level: number } // level：0..1（PWM 為工作週期）
export interface Issue { key: string; pin?: string; msg: string; severity: 'error' | 'warn' }
export interface DevRt {
  status: 'off' | 'running' | 'sleeping' | 'done' | 'error' | 'stopped';
  pins: Record<string, PinRt>;
  serial: string;
  issues: Issue[];
  dead: string[]; // 被燒毀的腳位（變成高阻抗）
  tripped: boolean; // USB 保險絲跳脫
  compileError: { msg: string; line: number } | null;
  runtimeError: { msg: string; line: number } | null;
  bootNonce: number; // 每次重新開機 +1，DevRuntime 看到就重建直譯器
  running: boolean; // 使用者是否要求執行（停止鍵會設成 false）
}

const freshRt = (): DevRt => ({
  status: 'off', pins: {}, serial: '', issues: [], dead: [], tripped: false,
  compileError: null, runtimeError: null, bootNonce: 0, running: true,
});

interface DevState {
  conf: Record<DevKind, DevConf>;
  rt: Record<DevKind, DevRt>;
  selected: DevKind | null;
  codeTab: DevKind;

  setPresent: (k: DevKind, present: boolean) => void;
  setUsb: (k: DevKind, usb: boolean) => void;
  setCode: (k: DevKind, code: string) => void;
  upload: (k: DevKind) => boolean;
  stop: (k: DevKind) => void;
  reboot: (k: DevKind) => void;
  select: (k: DevKind | null) => void;
  setCodeTab: (k: DevKind) => void;
  clearSerial: (k: DevKind) => void;
  repair: (k: DevKind) => void;
  patchRt: (k: DevKind, patch: Partial<DevRt>) => void;
  setPin: (k: DevKind, id: string, pin: PinRt) => void;
  loadConf: (conf: Record<DevKind, DevConf>) => void;
}

const defaultConf = (): Record<DevKind, DevConf> =>
  Object.fromEntries(DEV_KINDS.map((k) => [k, { present: false, usb: true, code: DEV_BOARDS[k].example }])) as Record<DevKind, DevConf>;

export const isPowered = (s: { conf: Record<DevKind, DevConf>; rt: Record<DevKind, DevRt> }, k: DevKind) =>
  s.conf[k].present && s.conf[k].usb && !s.rt[k].tripped;

export const useDev = create<DevState>((set, get) => ({
  conf: defaultConf(),
  rt: Object.fromEntries(DEV_KINDS.map((k) => [k, freshRt()])) as Record<DevKind, DevRt>,
  selected: null,
  codeTab: 'uno',

  setPresent: (k, present) => {
    if (!present) {
      // 板子拿走時，接在它排針上的杜邦線也一起移除
      const b = useBoard.getState();
      b.loadParts(b.parts.filter((p) => !p.pins.some((h) => h.startsWith(`h:${k}:`))));
    }
    set((s) => ({
      conf: { ...s.conf, [k]: { ...s.conf[k], present } },
      rt: { ...s.rt, [k]: { ...freshRt(), bootNonce: s.rt[k].bootNonce + 1 } },
      selected: present ? k : s.selected === k ? null : s.selected,
      codeTab: present ? k : s.codeTab,
    }));
  },
  setUsb: (k, usb) => set((s) => ({
    conf: { ...s.conf, [k]: { ...s.conf[k], usb } },
    // 拔掉再插回 USB = 重新開機，也會重設跳脫的保險絲
    rt: { ...s.rt, [k]: { ...s.rt[k], tripped: false, pins: {}, bootNonce: s.rt[k].bootNonce + 1, running: true, runtimeError: null } },
  })),
  setCode: (k, code) => set((s) => ({ conf: { ...s.conf, [k]: { ...s.conf[k], code } } })),
  upload: (k) => {
    const c = compile(get().conf[k].code);
    if (c.error) { get().patchRt(k, { compileError: c.error }); return false; }
    set((s) => ({ rt: { ...s.rt, [k]: { ...s.rt[k], compileError: null, runtimeError: null, pins: {}, running: true, bootNonce: s.rt[k].bootNonce + 1, serial: s.rt[k].serial + '\n--- 上傳完成，重新開機 ---\n' } } }));
    return true;
  },
  stop: (k) => set((s) => ({ rt: { ...s.rt, [k]: { ...s.rt[k], running: false, status: 'stopped', pins: {} } } })),
  reboot: (k) => set((s) => ({ rt: { ...s.rt, [k]: { ...s.rt[k], pins: {}, running: true, runtimeError: null, bootNonce: s.rt[k].bootNonce + 1 } } })),
  select: (selected) => set({ selected }),
  setCodeTab: (codeTab) => set({ codeTab }),
  clearSerial: (k) => get().patchRt(k, { serial: '' }),
  repair: (k) => set((s) => ({ rt: { ...s.rt, [k]: { ...freshRt(), bootNonce: s.rt[k].bootNonce + 1 } } })),
  patchRt: (k, patch) => set((s) => ({ rt: { ...s.rt, [k]: { ...s.rt[k], ...patch } } })),
  setPin: (k, id, pin) => set((s) => ({ rt: { ...s.rt, [k]: { ...s.rt[k], pins: { ...s.rt[k].pins, [id]: pin } } } })),
  loadConf: (conf) => set((s) => ({
    conf,
    rt: Object.fromEntries(DEV_KINDS.map((k) => [k, { ...freshRt(), bootNonce: s.rt[k].bootNonce + 1 }])) as Record<DevKind, DevRt>,
    selected: null,
  })),
}));
