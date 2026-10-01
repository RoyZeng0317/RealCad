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
/** z：條帶中心（板子本地 z）；board：-1 = 主麵包板，0..15 = 4×4 麵包板矩陣的第幾片 */
export interface Strip { kind: StripKind; x: number; z: number; w: number; index: number; board: number }

// 4×4 麵包板矩陣：實驗桌右邊的側桌上，16 片標準 830 孔麵包板（每片 1 條端子排 + 左右各一條雙軌電源排）
// 2×2 麵包板組：再往右一張小側桌，4 片同樣的 830 孔麵包板（板子編號接在 4×4 後面：第 16–19 片）
export const GRID_PLATE = { w: 1.2, d: 3.15 };
const GRID_DX = 1.35, GRID_DZ = 3.3;
export interface BoardGroup { n: number; x0: number; z0: number; first: number; name: string }
export const GROUPS: BoardGroup[] = [
  { n: 4, x0: 9.0, z0: -7.6, first: 0, name: '板' },
  { n: 2, x0: 15.2, z0: -4.3, first: 16, name: '小板' },
];
export const GRID_BOARDS = GROUPS.reduce((a, g) => a + g.n * g.n, 0);
const groupOf = (g: number) => GROUPS.find((gr) => g >= gr.first && g < gr.first + gr.n * gr.n)!;
/** 第 g 片（每組由後往前、由左往右）的中心（主麵包板本地座標） */
export const gridCenter = (g: number) => {
  const gr = groupOf(g), i = g - gr.first;
  return { x: gr.x0 + (i % gr.n) * GRID_DX, z: gr.z0 + Math.floor(i / gr.n) * GRID_DZ };
};
/** 給人看的板名：4×4 是「板1–16」、2×2 是「小板1–4」 */
export const boardName = (g: number) => { const gr = groupOf(g); return `${gr.name}${g - gr.first + 1}`; };
/** 每組在主麵包板本地座標的範圍（側桌、鏡頭用） */
export const groupArea = (gr: BoardGroup) => ({
  x0: gr.x0 - GRID_PLATE.w / 2, x1: gr.x0 + (gr.n - 1) * GRID_DX + GRID_PLATE.w / 2,
  z0: gr.z0 - GRID_PLATE.d / 2, z1: gr.z0 + (gr.n - 1) * GRID_DZ + GRID_PLATE.d / 2,
});
export const GRID_AREA = groupArea(GROUPS[0]);

/** 把一排條帶由左到右排好，中心在 cx */
function layStrips(kinds: StripKind[], cx: number, z: number, board: number, count: { bus: number; term: number }): Strip[] {
  const total = kinds.reduce((a, k) => a + (k === 'bus' ? BUS_W : TERM_W), 0) + (kinds.length - 1) * GAP;
  let x = cx - total / 2;
  return kinds.map((kind) => {
    const w = kind === 'bus' ? BUS_W : TERM_W;
    const s = { kind, x: x + w / 2, z, w, index: count[kind]++, board };
    x += w + GAP;
    return s;
  });
}

/**
 * 主麵包板由左到右：電源軌 A、端子排 1、電源軌 B、端子排 2、電源軌 C（端子排 0–1、電源軌 0–2）；
 * 接著是矩陣第 g 片（0–15 = 4×4、16–19 = 2×2）：電源軌 3+2g（左）、端子排 2+g、電源軌 4+2g（右）
 */
export const STRIPS: Strip[] = (() => {
  const count = { bus: 0, term: 0 };
  const out = layStrips(['bus', 'term', 'bus', 'term', 'bus'], 0, STRIP_Z, -1, count);
  for (let g = 0; g < GRID_BOARDS; g++) {
    const c = gridCenter(g);
    out.push(...layStrips(['bus', 'term', 'bus'], c.x, c.z, g, count));
  }
  return out;
})();
export const TERM_COUNT = 2 + GRID_BOARDS;
export const BUS_COUNT = 3 + 2 * GRID_BOARDS;
/** 端子排 / 電源軌編號 → 給人看的名稱（主板：端子排1 / 電源軌A；矩陣：板3 / 板3 左軌） */
export const termLabel = (i: number) => (i < 2 ? `端子排${i + 1}` : boardName(i - 2));
export const busLabel = (i: number) => (i < 3 ? `電源軌${'ABC'[i]}` : `${boardName(Math.floor((i - 3) / 2))} ${(i - 3) % 2 ? '右' : '左'}軌`);

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
  const s = STRIPS.find((st) => Math.abs(x - st.x) <= st.w / 2 && Math.abs(z - st.z) <= STRIP_LEN / 2);
  if (!s) return null;
  const lx = x - s.x, lz = z - s.z;
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
    return `${termLabel(h.strip)}・第 ${h.row + 1} 列 ${COLS[h.col]}：與同列 ${half} 共 5 孔相通`;
  }
  return `${busLabel(h.strip)}・${h.rail === 0 ? '+（紅）' : '−（藍）'}：整條 50 孔相通`;
}
