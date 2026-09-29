// 麵包板幾何與導通關係（純函式）：2 條 63 列端子排（a–e / f–j 各 5 孔一組相通）+ 3 條雙軌電源排
export const P = 0.045; // 孔距（放大過的 2.54 mm）
export const ROWS = 63;
export const TERM_W = 14 * P;
export const BUS_W = 4 * P;
export const GAP = 0.03;
export const STRIP_LEN = (ROWS + 2) * P;
export const STRIP_Z = 0.25; // 端子排中心（板子本地 z）
export const PLATE = { w: 2.4, d: 3.5, h: 0.1 };
export const STRIP_H = 0.08;
export const TOP_Y = PLATE.h + STRIP_H;

export type StripKind = 'bus' | 'term';
export interface Strip { kind: StripKind; x: number; w: number; index: number }

/** 由左到右：電源軌 A、端子排 1、電源軌 B、端子排 2、電源軌 C */
export const STRIPS: Strip[] = (() => {
  const kinds: StripKind[] = ['bus', 'term', 'bus', 'term', 'bus'];
  const total = 3 * BUS_W + 2 * TERM_W + 4 * GAP;
  let x = -total / 2;
  const count = { bus: 0, term: 0 };
  return kinds.map((kind) => {
    const w = kind === 'bus' ? BUS_W : TERM_W;
    const s = { kind, x: x + w / 2, w, index: count[kind]++ };
    x += w + GAP;
    return s;
  });
})();

/** 端子排：第 c 欄（0..9 = a..j）相對條帶中心的 x；中間 2P 為 IC 跨接溝 */
export const termColX = (c: number) => (c < 5 ? c - 5 : c - 4) * P;
/** 第 r 列（0..62）相對條帶中心的 z（第 1 列在遠端） */
export const rowZ = (r: number) => (r - (ROWS - 1) / 2) * P;

/** 電源軌：每 5 孔一組、組間空一格，共 10 組 50 孔 */
export const BUS_SLOTS = Array.from({ length: 50 }, (_, k) => Math.floor(k / 5) * 6 + (k % 5));
export const busZ = (slot: number) => (slot - 29) * P;
export const busRailX = (rail: 0 | 1) => (rail === 0 ? -0.5 : 0.5) * P;
export const COLS = 'abcdefghij';

export type HoleHit =
  | { kind: 'term'; strip: number; row: number; col: number }
  | { kind: 'bus'; strip: number; rail: 0 | 1; slot: number };

/** 板子本地座標 (x, z) → 最近的孔（離孔太遠回傳 null） */
export function hitHole(x: number, z: number): HoleHit | null {
  const s = STRIPS.find((st) => Math.abs(x - st.x) <= st.w / 2);
  if (!s) return null;
  const lx = x - s.x, lz = z - STRIP_Z;
  const tol = P * 0.5; // 點在孔的格子內任何位置都算這個孔
  if (s.kind === 'term') {
    const row = Math.round(lz / P + (ROWS - 1) / 2);
    if (row < 0 || row >= ROWS || Math.abs(lz - rowZ(row)) > tol) return null;
    let best = -1;
    for (let c = 0; c < 10; c++) if (Math.abs(lx - termColX(c)) <= tol) best = c;
    return best < 0 ? null : { kind: 'term', strip: s.index, row, col: best };
  }
  const rail: 0 | 1 = lx < 0 ? 0 : 1;
  if (Math.abs(lx - busRailX(rail)) > tol) return null;
  const slot = Math.round(lz / P + 29);
  if (!BUS_SLOTS.includes(slot) || Math.abs(lz - busZ(slot)) > tol) return null;
  return { kind: 'bus', strip: s.index, rail, slot };
}

/** 滑鼠提示文字：說明這個孔跟哪些孔相通 */
export function describeHit(h: HoleHit): string {
  if (h.kind === 'term') {
    const half = h.col < 5 ? 'a–e' : 'f–j';
    return `端子排 ${h.strip + 1}・第 ${h.row + 1} 列 ${COLS[h.col]}：與同列 ${half} 共 5 孔相通`;
  }
  return `電源軌 ${'ABC'[h.strip]}・${h.rail === 0 ? '+（紅）' : '−（藍）'}：整條 50 孔相通`;
}
