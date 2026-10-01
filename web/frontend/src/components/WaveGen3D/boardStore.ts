// 麵包板上的零件與操作狀態：工具、放置流程（兩點/一點）、選取、三用電表量測點、零件溫度
import { create } from 'zustand';
import { type HoleKey, netOf, isValidHole, holePos, holeKeyOf } from './boardModel.js';
import { hitHole } from './breadboardGrid.js';
import { type BoardPart, type PartKind, type DiodeModel, type LedColor, type CapModel, type BjtModel, WIRE_COLORS } from './boardParts.js';
import { dipPins, ATMEGA_EXAMPLE } from './chips/chipDefs.js';

export type Tool = 'select' | 'probe' | 'resistor' | 'diode' | 'led' | 'ldo' | 'wire' | 'atmega' | 'ch340' | 'pot' | 'cap' | 'ind' | 'bjt' | 'erase' | LeadKind;
/** 儀器接到麵包板的線：函數產生器輸出（紅 +、黑 −）、示波器 CH1 / CH2 探棒（探針、接地夾） */
export type LeadKind = 'fg' | 'ch1' | 'ch2' | 'sa';
export type Leads = Record<LeadKind, [HoleKey, HoleKey] | null>;
export const LEAD_NAME: Record<LeadKind, string> = { fg: '函數產生器輸出線', ch1: '示波器 CH1 探棒', ch2: '示波器 CH2 探棒', sa: '頻譜分析儀紅黑測試線' };

interface BoardState {
  parts: BoardPart[];
  tool: Tool;
  pending: HoleKey | null; // 兩點放置的第一點
  selectedId: string | null;
  dmm: HoleKey | null; // 三用電表紅棒位置
  dmmBlack: HoleKey | null; // 三用電表黑棒位置（預設插在 GND 接線柱）
  probeSide: 'red' | 'black'; // 三用電表工具下一次點擊要放哪一支探棒
  leads: Leads; // null = 沒接到麵包板（產生器直接接示波器 CH1、CH2 探棒夾在電源負載上）
  leadEnd: 0 | 1 | null; // 只重接某一端：0 = + 端、1 = − 端；null = 兩端依序接
  resistorValue: number;
  diodeModel: DiodeModel;
  ledColor: LedColor;
  wireColor: string;
  ldoDir: 1 | -1; // LT1117 從第 1 腳往下（+1）或往上（−1）排列（可變電阻、電晶體也用這個方向）
  potValue: number;
  capModel: CapModel;
  indValue: number;
  bjtModel: BjtModel;
  temps: Record<string, number>; // 零件溫度（由 3D 熱模型每 0.25 s 回寫）
  tsd: Record<string, boolean>; // LT1117 熱關斷中
  message: string;
  hoverHole: HoleKey | null; // 滑鼠目前指到的孔 / 接線柱 / 排針（拖曳零件用）
  drag: DragState | null;

  setTool: (t: Tool) => void;
  setParam: (patch: Partial<Pick<BoardState, 'resistorValue' | 'diodeModel' | 'ledColor' | 'wireColor' | 'ldoDir' | 'probeSide' | 'potValue' | 'capModel' | 'indValue' | 'bjtModel'>>) => void;
  /** 改已經放好的零件（可變電阻轉旋鈕、換阻值 / 型號） */
  updatePart: (id: string, patch: Partial<Pick<BoardPart, 'value' | 'pos' | 'capModel' | 'bjtModel'>>) => void;
  clickHole: (k: HoleKey) => void;
  selectPart: (id: string | null) => void;
  removePart: (id: string) => void;
  replacePart: (id: string) => void;
  setThermal: (temps: Record<string, number>, tsd: Record<string, boolean>, burnt: string[]) => void;
  clearBoard: () => void;
  loadParts: (parts: BoardPart[]) => void;
  setMessage: (m: string) => void;
  setLead: (k: LeadKind, pins: [HoleKey, HoleKey] | null) => void;
  /** 開始接線：end 省略 = 先點 + 端再點 − 端；0 / 1 = 只重接那一端 */
  startLead: (k: LeadKind, end?: 0 | 1) => void;
  setHoverHole: (k: HoleKey | null) => void;
  startDrag: (id: string, grab: number) => void;
  markDragMoved: () => void;
  endDrag: (commit: boolean) => void;
}

/** 拖曳中的零件：grab = 抓住的是第幾隻腳；pins = 預覽位置；valid = 放開時能不能放 */
export interface DragState { id: string; grab: number; pins: HoleKey[]; valid: boolean; moved: boolean; reason: string }

/** 檢查零件能不能放在這些孔上，回傳錯誤訊息（空字串 = 可以） */
export function placementError(parts: BoardPart[], part: BoardPart, pins: HoleKey[]): string {
  if (pins.some((h) => !isValidHole(h))) return '超出麵包板範圍';
  const occ = occupied(parts.filter((p) => p.id !== part.id));
  if (pins.some((h) => !h.startsWith('p:') && occ.has(h))) return '目標孔已經插了其他零件';
  if (part.kind === 'wire') return pins[0] === pins[1] ? '杜邦線兩端不能插同一個孔' : '';
  if (pins.some((h) => h.startsWith('p:') || h.startsWith('h:'))) return '零件腳只能插在麵包板的孔';
  if (pins.length === 2 && netOf(pins[0]) === netOf(pins[1])) return '兩隻腳會在同一組相通的孔裡（短路）';
  return '';
}

/** 依滑鼠目前指到的孔，算出拖曳中零件的新腳位 */
function dragTarget(parts: BoardPart[], d: DragState, hover: HoleKey | null): { pins: HoleKey[]; reason: string } | null {
  const part = parts.find((p) => p.id === d.id);
  if (!part || !hover) return null;
  if (part.kind === 'wire') {
    // 杜邦線：只移動抓住的那一端
    const pins = [...part.pins];
    pins[d.grab] = hover;
    return { pins, reason: placementError(parts, part, pins) };
  }
  if (!/^[tb]:/.test(hover)) return null;
  // 其他零件：整顆平移，每隻腳都要剛好落在孔上
  const delta = holePos(hover).sub(holePos(part.pins[d.grab]));
  const pins: HoleKey[] = [];
  for (const h of part.pins) {
    const p = holePos(h).add(delta);
    const hit = hitHole(p.x, p.z);
    if (!hit) return null;
    pins.push(holeKeyOf(hit));
  }
  return { pins, reason: placementError(parts, part, pins) };
}


let seq = 0;
const newId = (k: PartKind) => `${k}-${Date.now().toString(36)}-${seq++}`;

/** 被零件腳佔用的孔（接線柱可以接很多條線，不算） */
export function occupied(parts: BoardPart[]): Map<HoleKey, string> {
  const m = new Map<HoleKey, string>();
  for (const p of parts) for (const h of p.pins) if (!h.startsWith('p:')) m.set(h, p.id);
  return m;
}

/** LT1117 從第 1 腳沿同一欄往下（或往上）兩列放第 2、3 腳；只能放在端子排 */
export function ldoPins(k: HoleKey, dir: 1 | -1 = 1): HoleKey[] | null {
  const [t, s, r, c] = k.split(':');
  if (t !== 't') return null;
  const pins = [0, 1, 2].map((d) => `t:${s}:${+r + d * dir}:${c}`);
  return pins.every(isValidHole) ? pins : null;
}

export const useBoard = create<BoardState>((set, get) => ({
  parts: [],
  tool: 'select',
  pending: null,
  selectedId: null,
  dmm: null,
  dmmBlack: 'p:GND',
  probeSide: 'red',
  leads: { fg: null, ch1: null, ch2: null, sa: null },
  leadEnd: null,
  resistorValue: 330,
  diodeModel: '1N4007',
  ledColor: 'red',
  wireColor: WIRE_COLORS[0],
  ldoDir: 1,
  potValue: 10e3,
  capModel: '100u50',
  indValue: 1e-3,
  bjtModel: '2N3904',
  temps: {},
  tsd: {},
  message: '',
  hoverHole: null,
  drag: null,

  setTool: (tool) => set({ tool, pending: null, message: '', leadEnd: null }),
  setParam: (patch) => set(patch),
  updatePart: (id, patch) => set((s) => ({ parts: s.parts.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
  setMessage: (message) => set({ message }),
  setLead: (k, pins) => set((s) => ({ leads: { ...s.leads, [k]: pins } })),
  startLead: (k, end) => set((s) => ({ tool: k, pending: null, message: '', leadEnd: end !== undefined && s.leads[k] ? end : null })),
  setHoverHole: (hoverHole) => {
    const s = get();
    if (s.hoverHole === hoverHole) return;
    if (!s.drag) { set({ hoverHole }); return; }
    const t = dragTarget(s.parts, s.drag, hoverHole);
    set({
      hoverHole,
      drag: t ? { ...s.drag, pins: t.pins, valid: !t.reason, reason: t.reason } : { ...s.drag, valid: false, reason: '請拖到麵包板的孔上' },
    });
  },
  startDrag: (id, grab) => {
    const part = get().parts.find((p) => p.id === id);
    if (!part) return;
    set({ drag: { id, grab, pins: part.pins, valid: true, moved: false, reason: '' }, selectedId: id });
  },
  markDragMoved: () => { const d = get().drag; if (d && !d.moved) set({ drag: { ...d, moved: true } }); },
  endDrag: (commit) => {
    const { drag, parts } = get();
    if (!drag) return;
    const changed = drag.pins.some((h, i) => h !== parts.find((p) => p.id === drag.id)?.pins[i]);
    if (commit && drag.moved && drag.valid && changed) {
      set({ parts: parts.map((p) => (p.id === drag.id ? { ...p, pins: drag.pins } : p)), drag: null, message: '' });
    } else {
      set({ drag: null, message: commit && drag.moved && !drag.valid ? `沒有移動：${drag.reason || '位置不合法'}` : '' });
    }
  },

  clickHole: (k) => {
    const s = get();
    if (s.tool === 'select') {
      const id = occupied(s.parts).get(k) ?? null;
      set({ selectedId: id });
      return;
    }
    // 三用電表：紅棒、黑棒輪流放（也可以在左側指定下一次放哪一支）
    if (s.tool === 'probe') {
      set(s.probeSide === 'red' ? { dmm: k, probeSide: 'black', message: '' } : { dmmBlack: k, probeSide: 'red', message: '' });
      return;
    }
    // 儀器的線：第一下是 + 端（紅線 / 探針），第二下是 − 端（黑線 / 接地夾）；夾在孔上，不佔用孔
    if (s.tool === 'fg' || s.tool === 'ch1' || s.tool === 'ch2' || s.tool === 'sa') {
      const cur = s.leads[s.tool];
      if (s.leadEnd !== null && cur) {
        const pins: [HoleKey, HoleKey] = s.leadEnd === 0 ? [k, cur[1]] : [cur[0], k];
        if (pins[0] === pins[1]) { set({ message: '+ 端和 − 端不能夾在同一個孔' }); return; }
        set({ leads: { ...s.leads, [s.tool]: pins }, tool: 'select', leadEnd: null, message: '' });
        return;
      }
      if (!s.pending) { set({ pending: k, message: '' }); return; }
      if (s.pending === k) { set({ pending: null }); return; }
      set({ leads: { ...s.leads, [s.tool]: [s.pending, k] }, pending: null, tool: 'select', message: '' });
      return;
    }
    // 刪除模式：點到的孔插著哪個零件（或杜邦線）就刪掉它
    if (s.tool === 'erase') {
      const id = occupied(s.parts).get(k);
      if (id) set({ parts: s.parts.filter((p) => p.id !== id), selectedId: null, message: '' });
      return;
    }

    const occ = occupied(s.parts);
    if (!k.startsWith('p:') && occ.has(k)) { set({ message: '這個孔已經插了零件腳' }); return; }
    if (s.tool !== 'wire' && (k.startsWith('p:') || k.startsWith('h:'))) { set({ message: '零件腳不能直接插在接線柱或開發板排針上，請用杜邦線連接' }); return; }

    // DIP IC：點的那一列放第 1 腳，跨在端子排中間的溝上（e / f 欄）
    if (s.tool === 'atmega' || s.tool === 'ch340') {
      const n = s.tool === 'atmega' ? 28 : 16;
      const pins = dipPins(k, n);
      if (!pins) { set({ message: `${s.tool === 'atmega' ? 'ATmega328P' : 'CH340G'} 要放在端子排，從點的那一列往下需要 ${n / 2} 列空位（會跨在 e / f 欄中間的溝上）` }); return; }
      if (pins.some((p) => occ.has(p))) { set({ message: 'IC 要佔用的孔已經有其他零件' }); return; }
      const part: BoardPart = { id: newId(s.tool), kind: s.tool, pins, gen: 0, ...(s.tool === 'atmega' ? { code: ATMEGA_EXAMPLE } : {}) };
      set({ parts: [...s.parts, part], selectedId: part.id, message: '' });
      return;
    }
    if (s.tool === 'ldo' || s.tool === 'pot' || s.tool === 'bjt') {
      const name = s.tool === 'ldo' ? 'LT1117' : s.tool === 'pot' ? '可變電阻' : '電晶體';
      const pins = ldoPins(k, s.ldoDir);
      if (!pins) { set({ message: `${name}要放在端子排，而且排列方向上還要有 2 列空位` }); return; }
      if (pins.some((p) => occ.has(p))) { set({ message: `${name}的第 2、3 腳位置已經有零件` }); return; }
      const part: BoardPart =
        s.tool === 'pot' ? { id: newId('pot'), kind: 'pot', pins, value: s.potValue, pos: 0.5, gen: 0 }
        : s.tool === 'bjt' ? { id: newId('bjt'), kind: 'bjt', pins, bjtModel: s.bjtModel, gen: 0 }
        : { id: newId('ldo'), kind: 'ldo', pins, gen: 0 };
      set({ parts: [...s.parts, part], selectedId: part.id, message: '' });
      return;
    }

    // 兩點零件：電阻、二極體、LED、電解電容、電感、跳線
    if (!s.pending) { set({ pending: k, message: '' }); return; }
    if (s.pending === k) { set({ pending: null }); return; }
    if (s.tool !== 'wire' && netOf(s.pending) === netOf(k)) {
      set({ message: '兩隻腳插在同一組相通的孔裡會被短路，請換一個孔' });
      return;
    }
    const pins = [s.pending, k];
    const part: BoardPart =
      s.tool === 'resistor' ? { id: newId('resistor'), kind: 'resistor', pins, value: s.resistorValue, gen: 0 }
      : s.tool === 'diode' ? { id: newId('diode'), kind: 'diode', pins, model: s.diodeModel, gen: 0 }
      : s.tool === 'led' ? { id: newId('led'), kind: 'led', pins, ledColor: s.ledColor, gen: 0 }
      : s.tool === 'cap' ? { id: newId('cap'), kind: 'cap', pins, capModel: s.capModel, gen: 0 }
      : s.tool === 'ind' ? { id: newId('ind'), kind: 'ind', pins, value: s.indValue, gen: 0 }
      : { id: newId('wire'), kind: 'wire', pins, color: s.wireColor, gen: 0 };
    set({ parts: [...s.parts, part], pending: null, selectedId: part.kind === 'wire' ? s.selectedId : part.id, message: '' });
  },

  selectPart: (selectedId) => set({ selectedId }),
  removePart: (id) => set((s) => ({ parts: s.parts.filter((p) => p.id !== id), selectedId: null })),
  replacePart: (id) => set((s) => ({
    parts: s.parts.map((p) => (p.id === id ? { ...p, burnt: false, gen: p.gen + 1 } : p)),
  })),
  setThermal: (temps, tsd, burnt) => set((s) => ({
    temps,
    tsd,
    parts: burnt.length ? s.parts.map((p) => (burnt.includes(p.id) ? { ...p, burnt: true } : p)) : s.parts,
  })),
  clearBoard: () => set({ parts: [], selectedId: null, pending: null, dmm: null, dmmBlack: 'p:GND', probeSide: 'red', leads: { fg: null, ch1: null, ch2: null, sa: null }, temps: {}, tsd: {} }),
  loadParts: (parts) => set({ parts, selectedId: null, pending: null }),
}));
