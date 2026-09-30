// 麵包板 IC 的執行期狀態（依零件 id）：電源、腳位輸出、序列埠、上傳（經 CH340 用 avrdude 燒錄的流程）
//   程式碼（code）與燒進 Flash 的程式（flash）存在零件本身，跟著專案檔一起存
import { create } from 'zustand';
import { useBoard } from '../boardStore.js';
import { getBench } from '../bench.js';
import { compile } from '../devboards/compile.js';
import type { PinRt } from '../devboards/devStore.js';
import type { BoardPart } from '../boardParts.js';
import { AT, CH } from './chipDefs.js';

export interface ChipRt {
  vcc: number; // 電源腳對 GND 腳的電壓（上一次求解）
  status: 'off' | 'reset' | 'empty' | 'running' | 'sleeping' | 'done' | 'error';
  pins: Record<number, PinRt>; // DIP 腳位索引 → 模式與輸出
  serial: string;
  error: { msg: string; line: number } | null;
  log: string[]; // 上傳訊息
  progress: number | null;
  dtrLow: boolean; // CH340 的 DTR# 正在拉低（上傳時的自動重置脈衝）
  txLinked: boolean; // ATmega 的 TXD 有沒有接到 CH340 的 RXD（沒接序列埠就看不到輸出）
  boot: number; // 每次上傳完成 +1，執行期看到就重新開始跑程式
}

export const freshChip = (): ChipRt => ({
  vcc: 0, status: 'off', pins: {}, serial: '', error: null, log: [], progress: null, dtrLow: false, txLinked: false, boot: 0,
});

interface ChipState {
  rt: Record<string, ChipRt>;
  elec: number; // 影響電路的狀態（腳位、DTR、電源）改變時 +1，給電路求解快取用
  tab: string | null; // 下方「程式碼 / 序列埠」分頁目前顯示的 IC（null = 開發板）
  patch: (id: string, p: Partial<ChipRt>, elec?: boolean) => void;
  setTab: (id: string | null) => void;
  setCode: (id: string, code: string) => void;
  upload: (id: string) => void;
}

const EMPTY = freshChip(); // 固定的預設值（給 React 選擇器用，不能每次產生新物件）
export const chipRt = (s: { rt: Record<string, ChipRt> }, id: string): ChipRt => s.rt[id] ?? EMPTY;
let timer: ReturnType<typeof setInterval> | null = null;

/** 上傳前的接線檢查：回傳用的 CH340、錯誤或警告（訊息仿 avrdude） */
export function uploadCheck(parts: BoardPart[], id: string): { ch?: BoardPart; errors: string[]; warns: string[] } {
  const b = getBench();
  const at = parts.find((p) => p.id === id);
  const errors: string[] = [], warns: string[] = [];
  if (!at) return { errors: ['找不到這顆 ATmega328P'], warns };
  const net = (p: BoardPart, i: number) => b.netOfHole(p.pins[i]);
  const V = (p: BoardPart, i: number) => b.holeV(p.pins[i]);
  const powered = (p: BoardPart, vcc: number, gnd: number, min: number) => (V(p, vcc) ?? 0) - (V(p, gnd) ?? 0) >= min;
  const chs = parts.filter((p) => p.kind === 'ch340');
  if (!chs.length) return { errors: ['avrdude: ser_open(): can\'t open device：麵包板上沒有 CH340（USB 轉序列 IC），電腦找不到序列埠'], warns };
  const live = chs.filter((c) => powered(c, CH.VCC, CH.GND, 3.0));
  if (!live.length) return { errors: ['avrdude: ser_open(): can\'t open device：CH340 沒有上電（第 16 腳 VCC 接 5 V、第 1 腳 GND 接地）'], warns };
  if (!powered(at, AT.VCC, AT.GND, 2.7)) errors.push('avrdude: stk500_recv(): programmer is not responding：ATmega328P 沒有上電（第 7 腳 VCC 接 5 V、第 8 腳 GND 接地）');
  // 找 TX/RX 交叉接對的那顆 CH340
  const ch = live.find((c) => net(c, CH.TXD) === net(at, AT.RXD) && net(c, CH.RXD) === net(at, AT.TXD))
    ?? live.find((c) => net(c, CH.TXD) === net(at, AT.TXD) || net(c, CH.RXD) === net(at, AT.RXD));
  if (!ch) {
    errors.push('avrdude: stk500_getsync(): not in sync：CH340 的 TXD（第 2 腳）要接 ATmega 第 2 腳 RXD，CH340 的 RXD（第 3 腳）要接 ATmega 第 3 腳 TXD');
    return { errors, warns };
  }
  if (net(ch, CH.TXD) === net(at, AT.TXD) || net(ch, CH.RXD) === net(at, AT.RXD)) {
    errors.push('avrdude: stk500_getsync(): not in sync：TX / RX 接反了（TXD 要接對方的 RXD，交叉接）');
  }
  if (net(ch, CH.GND) !== net(at, AT.GND)) errors.push('avrdude: stk500_getsync(): not in sync：CH340 與 ATmega328P 沒有共地（兩顆的 GND 要接在一起）');
  if (net(at, AT.GND2) !== net(at, AT.GND)) warns.push('第 22 腳 GND 沒接地（兩個 GND 腳都要接）');
  if (net(at, AT.AVCC) !== net(at, AT.VCC)) warns.push('第 20 腳 AVCC 沒接到 VCC（類比電路沒電，analogRead 不準）');
  if (net(ch, CH.DTR) !== net(at, AT.RESET)) warns.push('沒有把 CH340 的 DTR#（第 13 腳）接到 RESET（第 1 腳）：實際晶片要在上傳時手動按重置，模擬中直接重置');
  return { ch, errors, warns };
}

export const useChips = create<ChipState>((set, get) => ({
  rt: {},
  elec: 0,
  tab: null,
  patch: (id, p, elec = false) => set((s) => ({ rt: { ...s.rt, [id]: { ...chipRt(s, id), ...p } }, elec: elec ? s.elec + 1 : s.elec })),
  setTab: (tab) => set({ tab }),
  setCode: (id, code) => useBoard.setState((s) => ({ parts: s.parts.map((p) => (p.id === id ? { ...p, code } : p)) })),

  upload: (id) => {
    const cur = chipRt(get(), id);
    if (cur.progress !== null) return;
    const part = useBoard.getState().parts.find((p) => p.id === id);
    if (!part) return;
    const code = part.code ?? '';
    const c = compile(code, 'c');
    if (c.error) { get().patch(id, { error: c.error, log: [`編譯錯誤（第 ${c.error.line} 行）：${c.error.msg}`] }); return; }
    const bytes = 444 + code.replace(/\/\/.*$/gm, '').replace(/\s+/g, '').length * 6;
    const log = [`草稿碼使用了 ${bytes} bytes（${Math.round((bytes / 32256) * 100)}%）的程式儲存空間，上限 32256 bytes`];
    const chk = uploadCheck(useBoard.getState().parts, id);
    if (chk.errors.length) { get().patch(id, { error: null, log: [...log, ...chk.errors.map((e) => `✖ ${e}`), '上傳失敗'] }); return; }
    log.push(...chk.warns.map((w) => `⚠ ${w}`), 'avrdude: AVR device initialized and ready to accept instructions', 'avrdude: Device signature = 0x1e950f (probably m328p)');
    // DTR# 拉低一下：接到 RESET 的話晶片就會被重置（跟真的 Arduino 一樣）
    const chId = chk.ch!.id;
    get().patch(chId, { dtrLow: true }, true);
    setTimeout(() => get().patch(chId, { dtrLow: false }, true), 150);
    get().patch(id, { error: null, progress: 0, log });
    let step = 0;
    if (timer) clearInterval(timer);
    timer = setInterval(() => {
      step++;
      if (step < 15) { get().patch(id, { progress: step / 15 }); return; }
      clearInterval(timer!);
      timer = null;
      useBoard.setState((s) => ({ parts: s.parts.map((p) => (p.id === id ? { ...p, flash: code } : p)) }));
      const r = chipRt(get(), id);
      get().patch(id, {
        progress: null, boot: r.boot + 1, serial: r.serial + '\n--- 上傳完成，重新執行 ---\n',
        log: [...r.log, `avrdude: writing flash (${bytes} bytes)`, `avrdude: ${bytes} bytes of flash verified`, 'avrdude done.  Thank you.', '✔ 上傳完成'],
      });
    }, 100);
  },
}));
