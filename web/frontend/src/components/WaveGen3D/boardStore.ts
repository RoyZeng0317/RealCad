// 麵包板上的零件與操作狀態：工具、放置流程（兩點/一點）、選取、三用電表量測點、零件溫度
import { create } from 'zustand';
import { type HoleKey, netOf, isValidHole } from './boardModel.js';
import { type BoardPart, type PartKind, type DiodeModel, WIRE_COLORS } from './boardParts.js';

export type Tool = 'select' | 'probe' | 'resistor' | 'diode' | 'ldo' | 'wire';

interface BoardState {
  parts: BoardPart[];
  tool: Tool;
  pending: HoleKey | null; // 兩點放置的第一點
  selectedId: string | null;
  dmm: HoleKey | null; // 三用電表紅棒位置（黑棒固定接 GND）
  resistorValue: number;
  diodeModel: DiodeModel;
  wireColor: string;
  ldoDir: 1 | -1; // LT1117 從第 1 腳往下（+1）或往上（−1）排列
  temps: Record<string, number>; // 零件溫度（由 3D 熱模型每 0.25 s 回寫）
  tsd: Record<string, boolean>; // LT1117 熱關斷中
  message: string;

  setTool: (t: Tool) => void;
  setParam: (patch: Partial<Pick<BoardState, 'resistorValue' | 'diodeModel' | 'wireColor' | 'ldoDir'>>) => void;
  clickHole: (k: HoleKey) => void;
  selectPart: (id: string | null) => void;
  removePart: (id: string) => void;
  replacePart: (id: string) => void;
  setThermal: (temps: Record<string, number>, tsd: Record<string, boolean>, burnt: string[]) => void;
  clearBoard: () => void;
  loadParts: (parts: BoardPart[]) => void;
  setMessage: (m: string) => void;
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
  resistorValue: 330,
  diodeModel: '1N4007',
  wireColor: WIRE_COLORS[0],
  ldoDir: 1,
  temps: {},
  tsd: {},
  message: '',

  setTool: (tool) => set({ tool, pending: null, message: '' }),
  setParam: (patch) => set(patch),
  setMessage: (message) => set({ message }),

  clickHole: (k) => {
    const s = get();
    if (s.tool === 'select') {
      const id = occupied(s.parts).get(k) ?? null;
      set({ selectedId: id });
      return;
    }
    if (s.tool === 'probe') { set({ dmm: k, message: '' }); return; }

    const occ = occupied(s.parts);
    if (!k.startsWith('p:') && occ.has(k)) { set({ message: '這個孔已經插了零件腳' }); return; }
    if (s.tool !== 'wire' && k.startsWith('p:')) { set({ message: '零件腳不能直接插在接線柱，請用跳線連接' }); return; }

    if (s.tool === 'ldo') {
      const pins = ldoPins(k, s.ldoDir);
      if (!pins) { set({ message: 'LT1117 要放在端子排，而且排列方向上還要有 2 列空位' }); return; }
      if (pins.some((p) => occ.has(p))) { set({ message: 'LT1117 的第 2、3 腳位置已經有零件' }); return; }
      const part: BoardPart = { id: newId('ldo'), kind: 'ldo', pins, gen: 0 };
      set({ parts: [...s.parts, part], selectedId: part.id, message: '' });
      return;
    }

    // 兩點零件：電阻、二極體、跳線
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
  clearBoard: () => set({ parts: [], selectedId: null, pending: null, dmm: null, temps: {}, tsd: {} }),
  loadParts: (parts) => set({ parts, selectedId: null, pending: null }),
}));
