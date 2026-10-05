// 麵包板零件定義：電阻（色碼）、1N4001–1N4007、LT1117-3.3（TO-220）、ATmega328P／CH340G（DIP）、跳線
// 類比零件：可變電阻（1k/10k/100k）、電解電容（100µF/50V、47µF/25V）、電感、電晶體 2N3904 / 2N3906
// 變壓器（小型信號 / 隔離變壓器，4 腳跨在中間溝槽兩側：左排一次側、右排二次側）
// 中心抽頭電源變壓器 6 V / 12 V / 24 V（一次側插市電 110 V，二次側 3 條線：兩端 + 中間 COM）
// 光敏電阻 LDR（GL55xx，照度越亮阻值越小）、電池（9 V / AA / 2×AA / CR2032 / 18650）
import type { HoleKey } from './boardModel.js';

export type PartKind = 'resistor' | 'diode' | 'led' | 'ldo' | 'wire' | 'atmega' | 'ch340' | 'pot' | 'cap' | 'ind' | 'bjt' | 'xfmr' | 'ctx' | 'ldr' | 'batt';

export interface BoardPart {
  id: string;
  kind: PartKind;
  pins: HoleKey[]; // 電阻 [a,b]、二極體 [陽極,陰極]、LDO [1 GND, 2 VOUT, 3 VIN]、跳線 [a,b]、可變電阻 [1, W, 3]、電解電容 [+, −]、電晶體 [E, B, C]、變壓器 [P1, P2, S1, S2]、中心抽頭變壓器 [A 端, COM, B 端]、光敏電阻 [a, b]、電池 [+, −]
  value?: number; // 電阻 Ω；可變電阻總阻值 Ω；電感 H
  pos?: number; // 可變電阻的旋鈕位置 0（腳 1 端）~ 1（腳 3 端）
  capModel?: CapModel;
  bjtModel?: BjtModel;
  xfmrModel?: XfmrModel;
  ctxModel?: CtxModel;
  plugged?: boolean; // 中心抽頭變壓器：插頭有沒有插上市電（預設插上）
  ldrModel?: LdrModel;
  lux?: number; // 光敏電阻受光照度（lux）
  battModel?: BattModel;
  rot?: number; // 電晶體本體朝向：0~3，每格 90°（預設 1）
  model?: DiodeModel;
  ledColor?: LedColor;
  color?: string; // 跳線顏色
  code?: string; // ATmega328P：編輯中的程式
  flash?: string; // ATmega328P：已經燒進 Flash 的程式（斷電不會消失）
  burnt?: boolean;
  gen: number; // 更換零件時 +1（讓溫度重新從室溫開始）
}

// 1N400x 系列：差別只在反向耐壓 PIV
export const DIODE_MODELS = ['1N4001', '1N4002', '1N4003', '1N4004', '1N4005', '1N4006', '1N4007'] as const;
export type DiodeModel = (typeof DIODE_MODELS)[number];
export const DIODE_PIV: Record<DiodeModel, number> = {
  '1N4001': 50, '1N4002': 100, '1N4003': 200, '1N4004': 400, '1N4005': 600, '1N4006': 800, '1N4007': 1000,
};

// 5 mm LED：Vf 為 20 mA 時的順向電壓；牛頓法用的理想因子依 Vf 縮放，讓各色 LED 都落在指數模型的有效範圍
export const LED_COLORS = ['red', 'yellow', 'green', 'blue', 'white'] as const;
export type LedColor = (typeof LED_COLORS)[number];
export const LED_SPEC: Record<LedColor, { name: string; vf: number; hex: string }> = {
  red: { name: '紅', vf: 2.0, hex: '#ff2a1a' },
  yellow: { name: '黃', vf: 2.1, hex: '#ffc21a' },
  green: { name: '綠', vf: 2.2, hex: '#2aff4a' },
  blue: { name: '藍', vf: 3.1, hex: '#2a7aff' },
  white: { name: '白', vf: 3.2, hex: '#f4f7ff' },
};
export const ledModel = (c: LedColor) => ({ nvt: LED_SPEC[c].vf / 32, is: 0.02 / Math.exp(32), bv: 5 });
export const LED_IMAX = 0.03; // 連續最大電流 30 mA

// E12 系列 10 Ω ~ 1 MΩ
export const RESISTOR_VALUES: number[] = [1, 2, 3, 4, 5].flatMap((e) =>
  [1, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2].map((m) => Number((m * 10 ** e).toPrecision(2))),
).concat([1e6]);

export const RESISTOR_RATING = 0.25; // W（1/4 W 碳膜電阻）
export const R_MIN = 0.1, R_MAX = 10e6; // 可輸入的電阻範圍

/**
 * 解析使用者輸入的電阻值：330、4.7k、4k7、2.2 kΩ、1M、0.5、1R5（= 1.5 Ω）；大小寫都可以
 * 回傳 Ω，看不懂或超出範圍回傳 null
 */
export function parseOhm(text: string): number | null {
  const t = text.trim().replace(/\s+/g, '').replace(/(ohms?|Ω|歐姆|欧姆)$/i, '');
  const mult: Record<string, number> = { r: 1, k: 1e3, m: 1e6 };
  let v: number;
  let m = /^(\d+(?:\.\d+)?)([rkm])?$/i.exec(t);
  if (m) v = Number(m[1]) * (m[2] ? mult[m[2].toLowerCase()] : 1);
  else if ((m = /^(\d+)([rkm])(\d+)$/i.exec(t))) v = Number(`${m[1]}.${m[3]}`) * mult[m[2].toLowerCase()]; // 4k7 寫法
  else return null;
  // M 在電子業是 mega；避免把 1m 當成 milli
  return isFinite(v) && v >= R_MIN && v <= R_MAX ? Number(v.toPrecision(6)) : null;
}

export const WIRE_COLORS = ['#d42a2a', '#1b1d20', '#2a6fd4', '#2aa84a', '#e0b010', '#e07a1a', '#f2f2f2'];

// 4 環色碼：第 1、2 位數、倍率、誤差（金 5%）
const BAND = ['#111111', '#7a4a1e', '#d42020', '#f08a1a', '#f2d21a', '#2aa84a', '#2a56d4', '#8a3ad4', '#8a8a8a', '#f5f5f5'];
export function colorBands(ohms: number): string[] {
  const exp = Math.floor(Math.log10(ohms)) - 1;
  const two = Math.round(ohms / 10 ** exp);
  const d1 = Math.floor(two / 10), d2 = two % 10;
  const mult = exp >= 0 ? BAND[exp] : exp === -1 ? '#c9a24a' : '#c0c0c0';
  return [BAND[d1], BAND[d2], mult, '#c9a24a'];
}

// ---- 可變電阻（3 腳，中間是滑動端 W）----
export const POT_VALUES = [1e3, 10e3, 100e3];
export const POT_RATING = 0.5; // W
export const POT_END_R = 0.5; // 轉到底時滑動端與端腳之間仍有的接觸電阻 Ω

// ---- 電解電容（有極性：腳 1 是 +，長腳；外殼白色條紋那邊是 −）----
export const CAP_MODELS = {
  '100u50': { c: 100e-6, v: 50, name: '100 µF / 50 V', d: 8, h: 11.5, color: '#1d3f8a' },
  '47u25': { c: 47e-6, v: 25, name: '47 µF / 25 V', d: 6.3, h: 11, color: '#121418' },
} as const;
export type CapModel = keyof typeof CAP_MODELS;
export const CAP_MODEL_IDS = Object.keys(CAP_MODELS) as CapModel[];
export const CAP_REVERSE_MAX = 1; // 反接超過 1 V 就會損壞

// ---- 電感（色碼電感 / 工字電感；直流電阻 DCR 隨電感量變大）----
export const IND_VALUES = [100e-6, 1e-3, 10e-3];
export const indDcr = (l: number) => Number((0.03 + 300 * l ** 0.8).toPrecision(2)); // 100 µH ≈ 0.2 Ω、1 mH ≈ 1.2 Ω、10 mH ≈ 7.6 Ω
export const IND_IMAX = 0.5; // A

// ---- 電晶體（TO-92，平面朝自己時腳位由左到右：2N3904 / 2N3906 / S9013 / S9012 是 E、B、C；BC547 是 C、B、E）----
// pins 永遠存成 [E, B, C]（電路意義）；放置時依 pinout 決定第一下點的孔是 E 還是 C
// Ebers-Moll 參數（取自常見 SPICE 模型、BF 取典型 hFE）；pMax / icMax 為額定功率 / 集極電流
// S9013 / S9012：常見的中功率對管（IC 500 mA），腳位一樣是 E、B、C
export const BJT_MODELS = {
  '2N3904': { pol: 1 as const, is: 6.73e-15, bf: 200, br: 0.74, name: '2N3904（NPN）', pMax: 0.625, icMax: 0.2 },
  '2N3906': { pol: -1 as const, is: 1.41e-15, bf: 180, br: 4.98, name: '2N3906（PNP）', pMax: 0.625, icMax: 0.2 },
  S9013: { pol: 1 as const, is: 3.4e-14, bf: 144, br: 3.4, name: 'S9013（NPN）', pMax: 0.625, icMax: 0.5 },
  S9012: { pol: -1 as const, is: 3.0e-14, bf: 144, br: 4.0, name: 'S9012（PNP）', pMax: 0.625, icMax: 0.5 },
  // BC547B（歐規小信號 NPN）：hFE 200–450、IC 100 mA、500 mW；腳位跟 2N3904 相反
  BC547: { pol: 1 as const, is: 7.05e-15, bf: 290, br: 7.7, name: 'BC547（NPN）', pMax: 0.5, icMax: 0.1, pinout: 'CBE' as const },
};
export type BjtPinout = 'EBC' | 'CBE';
/** 平面朝自己、由左到右的腳位排列 */
export const bjtPinout = (m: BjtModel): BjtPinout => ('pinout' in BJT_MODELS[m] ? (BJT_MODELS[m] as { pinout: BjtPinout }).pinout : 'EBC');
export type BjtModel = keyof typeof BJT_MODELS;
export const BJT_MODEL_IDS = Object.keys(BJT_MODELS) as BjtModel[];
export const BJT_PMAX = 0.625, BJT_ICMAX = 0.2; // W、A（2N3904 / 2N3906；各型號的額定值在 BJT_MODELS 的 pMax / icMax）

// ---- 變壓器（耦合電感：一次側 P1–P2、二次側 S1–S2；圓點（同名端）在 P1、S1）----
// n = Np / Ns（匝數比）；一次側電感 L1 = 1 H，二次側 L2 = L1 / n²，耦合係數 k = 0.999（漏感 0.1%）
// 線圈電阻：一次側 10 Ω、二次側依匝數比縮小；只能傳交流（直流時線圈就是一顆小電阻，二次側沒有電壓）
export const XFMR_MODELS = {
  '1:1': { n: 1, name: '1 : 1（隔離）' },
  '2:1': { n: 2, name: '2 : 1（降壓）' },
  '4:1': { n: 4, name: '4 : 1（降壓）' },
  '10:1': { n: 10, name: '10 : 1（降壓）' },
  '1:2': { n: 0.5, name: '1 : 2（升壓）' },
};
export type XfmrModel = keyof typeof XFMR_MODELS;
export const XFMR_MODEL_IDS = Object.keys(XFMR_MODELS) as XfmrModel[];
export const XFMR_L1 = 1, XFMR_K = 0.999, XFMR_R1 = 10;
export const XFMR_IMAX = 0.3; // A（一次側或二次側電流超過就是過載）
export function xfmrParams(m: XfmrModel) {
  const n = XFMR_MODELS[m].n;
  return { n, l1: XFMR_L1, l2: XFMR_L1 / (n * n), k: XFMR_K, r1: XFMR_R1, r2: Math.max(0.1, XFMR_R1 / (n * n)) };
}

// ---- 中心抽頭電源變壓器（一次側 110 V / 60 Hz 市電，二次側 A–COM–B）----
// 「6 V」= A 到 B 6 V rms（額定負載時），A–COM、COM–B 各 3 V；A、B 對 COM 反相（全波整流用）
// 空載電壓比額定高約 10%（小型變壓器的電壓調整率）：線圈電阻一半在一次側、一半在二次側
// 一次側電感 20 H（激磁電流約 15 mA），耦合係數 0.998
export const CTX_MODELS = {
  '6': { vs: 6, name: '6 V（3-0-3 V）' },
  '12': { vs: 12, name: '12 V（6-0-6 V）' },
  '24': { vs: 24, name: '24 V（12-0-12 V）' },
};
export type CtxModel = keyof typeof CTX_MODELS;
export const CTX_MODEL_IDS = Object.keys(CTX_MODELS) as CtxModel[];
export const CTX_IRATED = 0.5; // A（二次側額定電流）
export const MAINS_VRMS = 110, MAINS_F = 60; // 台灣市電
export function ctxParams(m: CtxModel) {
  const vs = CTX_MODELS[m].vs;
  const a = (1.1 * vs) / 2 / MAINS_VRMS; // 半繞組 / 一次側 匝數比（空載）
  const l1 = 20, regR = (0.1 * vs) / CTX_IRATED; // 兩端看進去的等效電阻 = 10% 調整率
  return { vs, a, l1, lh: l1 * a * a, k: 0.998, rh: regR / 4, r1: regR / 2 / (4 * a * a) };
}

// ---- 光敏電阻（CdS，GL55xx 系列）：R = 1 / (1/R暗 + (lux/10)^γ / R10)；R10 = 10 lux 時的阻值 ----
export const LDR_MODELS = {
  GL5516: { r10: 7.5e3, gamma: 0.5, dark: 0.5e6, name: 'GL5516（5–10 kΩ）' },
  GL5528: { r10: 15e3, gamma: 0.7, dark: 1e6, name: 'GL5528（10–20 kΩ）' },
  GL5537: { r10: 25e3, gamma: 0.8, dark: 2e6, name: 'GL5537（20–30 kΩ）' },
};
export type LdrModel = keyof typeof LDR_MODELS;
export const LDR_MODEL_IDS = Object.keys(LDR_MODELS) as LdrModel[];
export const LDR_PMAX = 0.1; // W
export const LUX_MIN = 0.1, LUX_MAX = 10000;
export function ldrOhm(m: LdrModel, lux: number) {
  const q = LDR_MODELS[m];
  return 1 / (1 / q.dark + Math.pow(Math.max(0, lux) / 10, q.gamma) / q.r10);
}
/** 常見照度（給按鈕用） */
export const LUX_PRESETS: [number, string][] = [[0.1, '全黑'], [1, '夜晚'], [10, '昏暗'], [100, '室內'], [500, '辦公室'], [10000, '陽光']];

// ---- 電池（理想電壓源 + 內阻）：+ 腳紅線、− 腳黑線 ----
export const BATT_MODELS = {
  '9V': { v: 9, r: 1.5, name: '9 V 方型電池', color: '#2a2d33', size: [26.5, 17.5, 48.5] },
  AA: { v: 1.5, r: 0.15, name: 'AA 1.5 V', color: '#c9a227', size: [14.5, 14.5, 50.5] },
  '2AA': { v: 3, r: 0.3, name: '2 × AA 電池盒 3 V', color: '#1b1d20', size: [31, 16, 58] },
  CR2032: { v: 3, r: 15, name: 'CR2032 鈕扣 3 V', color: '#c9ced4', size: [20, 3.2, 20] },
  '18650': { v: 3.7, r: 0.05, name: '18650 鋰電 3.7 V', color: '#2a6fd4', size: [18.5, 18.5, 65] },
};
export type BattModel = keyof typeof BATT_MODELS;
export const BATT_MODEL_IDS = Object.keys(BATT_MODELS) as BattModel[];

// 熱模型參數：穩態溫升 = P × Rth，燒毀溫度
export const THERMAL: Record<Exclude<PartKind, 'wire'>, { rth: number; tau: number; burn: number }> = {
  resistor: { rth: 280, tau: 4, burn: 330 }, // 1/4 W：約 1 W 以上會燒
  diode: { rth: 60, tau: 5, burn: 260 }, // 1N400x：約 4 W 以上會燒
  led: { rth: 1200, tau: 1.5, burn: 300 }, // 5 mm LED：約 0.23 W（~100 mA）以上會燒
  ldo: { rth: 50, tau: 8, burn: Infinity }, // TO-220 無散熱片：150 °C 熱關斷，不會燒
  atmega: { rth: 60, tau: 10, burn: Infinity }, // DIP-28
  ch340: { rth: 80, tau: 8, burn: Infinity },
  pot: { rth: 110, tau: 6, burn: 280 }, // 0.5 W：約 2.3 W 以上會燒
  cap: { rth: 1, tau: 1, burn: Infinity }, // 電容不發熱；過壓 / 反接由電路判斷損壞
  ind: { rth: 60, tau: 6, burn: 250 }, // 電流流過 DCR 發熱
  bjt: { rth: 200, tau: 3, burn: 200 }, // TO-92：約 0.9 W 以上會燒
  xfmr: { rth: 30, tau: 15, burn: 200 }, // 線圈銅損發熱：約 6 W 以上會燒
  ctx: { rth: 25, tau: 20, burn: 180 }, // 電源變壓器：約 6 W 銅損以上會燒（二次側短路就會）
  ldr: { rth: 1500, tau: 3, burn: 260 }, // 光敏電阻：約 0.15 W 以上會燒
  batt: { rth: 25, tau: 15, burn: 120 }, // 電池：短路時內阻發熱，太燙會漏液 / 鼓包（當開路）
};
export const LDO_TSD_ON = 150, LDO_TSD_OFF = 130; // 熱關斷 / 恢復溫度
export const LDO_VIN_MAX = 15; // 超過就損壞

export function partLabel(p: BoardPart): string {
  if (p.kind === 'resistor') return `電阻 ${fmtOhm(p.value!)}`;
  if (p.kind === 'diode') return `二極體 ${p.model}`;
  if (p.kind === 'led') return `${LED_SPEC[p.ledColor ?? 'red'].name}色 LED`;
  if (p.kind === 'ldo') return 'LT1117-3.3 穩壓 IC';
  if (p.kind === 'atmega') return 'ATmega328P-PU';
  if (p.kind === 'ch340') return 'CH340G USB 轉序列';
  if (p.kind === 'pot') return `可變電阻 ${fmtOhm(p.value!)}`;
  if (p.kind === 'cap') return `電解電容 ${CAP_MODELS[p.capModel ?? '100u50'].name}`;
  if (p.kind === 'ind') return `電感 ${fmtHenry(p.value!)}`;
  if (p.kind === 'bjt') return `電晶體 ${BJT_MODELS[p.bjtModel ?? '2N3904'].name}`;
  if (p.kind === 'xfmr') return `變壓器 ${XFMR_MODELS[p.xfmrModel ?? '2:1'].name}`;
  if (p.kind === 'ctx') return `中心抽頭變壓器 ${CTX_MODELS[p.ctxModel ?? '12'].name}`;
  if (p.kind === 'ldr') return `光敏電阻 ${LDR_MODELS[p.ldrModel ?? 'GL5528'].name}`;
  if (p.kind === 'batt') return `電池 ${BATT_MODELS[p.battModel ?? '9V'].name}`;
  return '杜邦線';
}

export function fmtOhm(r: number): string {
  if (r >= 1e6) return `${+(r / 1e6).toPrecision(3)} MΩ`;
  if (r >= 1e3) return `${+(r / 1e3).toPrecision(3)} kΩ`;
  return `${+r.toPrecision(3)} Ω`;
}

export function fmtHenry(l: number): string {
  if (l >= 1) return `${+l.toPrecision(3)} H`;
  if (l >= 1e-3) return `${+(l * 1e3).toPrecision(3)} mH`;
  return `${+(l * 1e6).toPrecision(3)} µH`;
}
