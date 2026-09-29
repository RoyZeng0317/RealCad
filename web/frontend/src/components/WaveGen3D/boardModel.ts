// 麵包板上的「孔」：字串 key、所屬導通網路（net）、在板子本地座標的位置
import * as THREE from 'three';
import {
  STRIPS, STRIP_Z, TOP_Y, PLATE, ROWS, termColX, rowZ, busZ, busRailX, BUS_SLOTS, COLS, type HoleHit,
} from './breadboardGrid.js';

export type PostName = 'Va' | 'Vb' | 'GND';
/** 孔的 key：t:端子排:列:欄、b:電源軌:軌:位置、p:接線柱 */
export type HoleKey = string;

export const POST_XS: Record<PostName, number> = { Va: 0.2, Vb: 0.55, GND: 0.9 };
export const POST_Z = -1.52;
export const POST_TOP = PLATE.h + 0.2;

export const holeKeyOf = (h: HoleHit): HoleKey =>
  h.kind === 'term' ? `t:${h.strip}:${h.row}:${h.col}` : `b:${h.strip}:${h.rail}:${h.slot}`;
export const postKey = (p: PostName): HoleKey => `p:${p}`;

const termStrip = (i: number) => STRIPS.filter((s) => s.kind === 'term')[i];
const busStrip = (i: number) => STRIPS.filter((s) => s.kind === 'bus')[i];

/** 孔所屬的導通網路：端子排每列半邊 5 孔一組、電源軌整條一組、接線柱各自一組 */
export function netOf(k: HoleKey): string {
  const [t, a, b, c] = k.split(':');
  if (t === 't') return `T${a}:${b}:${Number(c) < 5 ? 'L' : 'R'}`;
  if (t === 'b') return `B${a}:${b}`;
  return `P:${a}`;
}

/** 孔（或接線柱頂端）在麵包板本地座標的位置 */
export function holePos(k: HoleKey): THREE.Vector3 {
  const [t, a, b, c] = k.split(':');
  if (t === 't') return new THREE.Vector3(termStrip(+a).x + termColX(+c), TOP_Y, STRIP_Z + rowZ(+b));
  if (t === 'b') return new THREE.Vector3(busStrip(+a).x + busRailX(+b as 0 | 1), TOP_Y, STRIP_Z + busZ(+c));
  return new THREE.Vector3(POST_XS[a as PostName], POST_TOP, POST_Z);
}

export function isValidHole(k: HoleKey): boolean {
  const [t, a, b, c] = k.split(':');
  if (t === 't') return +a >= 0 && +a < 2 && +b >= 0 && +b < ROWS && +c >= 0 && +c < 10;
  if (t === 'b') return +a >= 0 && +a < 3 && (b === '0' || b === '1') && BUS_SLOTS.includes(+c);
  return t === 'p' && a in POST_XS;
}

/** 給人看的孔名稱，例如「端子排1 18d」「電源軌A +」「Va」 */
export function holeName(k: HoleKey): string {
  const [t, a, b, c] = k.split(':');
  if (t === 't') return `端子排${+a + 1} ${+b + 1}${COLS[+c]}`;
  if (t === 'b') return `電源軌${'ABC'[+a]} ${b === '0' ? '+' : '−'}`;
  return a === 'GND' ? 'GND 接線柱' : `${a} 接線柱`;
}
