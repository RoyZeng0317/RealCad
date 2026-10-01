// 函數波產生器的波形數學：產生器輸出取樣、示波器觸發搜尋與量測（純函式，不依賴 React/three）

export type Waveform = 'sine' | 'square' | 'triangle' | 'ramp' | 'pulse' | 'noise';

export interface GenSettings {
  waveform: Waveform;
  frequency: number; // Hz
  amplitude: number; // Vpp（高阻抗負載）
  offset: number; // V
  duty: number; // %，只有 pulse 使用
  output: boolean;
  power: boolean;
}

export const OUTPUT_LIMIT = 10; // 輸出電壓上限 ±10 V，超過會削峰
export const FREQ_MIN = 0.1;
export const FREQ_MAX = 10e6;

const frac = (x: number) => x - Math.floor(x);

/** 產生器在時間 t（秒）的輸出電壓 */
export function sampleWave(s: GenSettings, t: number): number {
  if (!s.power || !s.output) return 0;
  const p = frac(t * s.frequency);
  let v: number;
  switch (s.waveform) {
    case 'sine': v = Math.sin(2 * Math.PI * p); break;
    case 'square': v = p < 0.5 ? 1 : -1; break;
    case 'triangle': v = p < 0.5 ? 4 * p - 1 : 3 - 4 * p; break;
    case 'ramp': v = 2 * p - 1; break;
    case 'pulse': v = p < s.duty / 100 ? 1 : -1; break;
    case 'noise': v = (Math.random() + Math.random() + Math.random() - 1.5) / 1.5; break;
  }
  const out = s.offset + (s.amplitude / 2) * v;
  return Math.max(-OUTPUT_LIMIT, Math.min(OUTPUT_LIMIT, out));
}

/** 一個週期的平均值（直流成分）：三用電表等直流量測用 */
export function waveMean(s: GenSettings): number {
  if (!s.power || !s.output) return 0;
  if (s.waveform === 'noise') return Math.max(-OUTPUT_LIMIT, Math.min(OUTPUT_LIMIT, s.offset));
  let sum = 0;
  const N = 200;
  for (let i = 0; i < N; i++) sum += sampleWave(s, (i + 0.5) / N / s.frequency);
  return sum / N;
}

/** 輸出電壓的範圍（最低、最高；已含 ±10 V 削峰） */
export function waveRange(s: GenSettings): [number, number] {
  if (!s.power || !s.output) return [0, 0];
  const lim = (v: number) => Math.max(-OUTPUT_LIMIT, Math.min(OUTPUT_LIMIT, v));
  return [lim(s.offset - s.amplitude / 2), lim(s.offset + s.amplitude / 2)];
}

/** 一般化的上升緣觸發：對任意訊號 v(t) 找穿越點（麵包板上量到的波形用） */
export function findTriggerFn(v: (t: number) => number, period: number, level: number, tStart: number): number | null {
  const N = 400;
  const dt = period / N;
  let prev = v(tStart);
  for (let i = 1; i <= N + 1; i++) {
    const t = tStart + i * dt;
    const x = v(t);
    if (prev < level && x >= level) return t - dt + ((level - prev) / (x - prev || 1)) * dt;
    prev = x;
  }
  return null;
}

/**
 * 從 tStart 往後找第一個「上升穿越 level」的時間點（示波器上升緣觸發）。
 * 找不到（例如觸發準位超出訊號範圍、或是雜訊）回傳 null，示波器改用自由觸發（畫面會跑動）。
 */
export function findTrigger(s: GenSettings, level: number, tStart: number): number | null {
  if (!s.power || !s.output || s.waveform === 'noise') return null;
  const period = 1 / s.frequency;
  const N = 400;
  const dt = period / N;
  let prev = sampleWave(s, tStart);
  for (let i = 1; i <= N + 1; i++) {
    const t = tStart + i * dt;
    const v = sampleWave(s, t);
    if (prev < level && v >= level) {
      // 線性內插讓觸發點不會隨取樣格點抖動
      const k = (level - prev) / (v - prev || 1);
      return t - dt + k * dt;
    }
    prev = v;
  }
  return null;
}

export interface Measurements {
  vmax: number;
  vmin: number;
  vpp: number;
  vrms: number;
  vavg: number;
  freq: number | null;
  period: number | null;
  duty: number | null; // 正脈寬 / 週期（0~1）
  rise: number | null; // 10% → 90% 上升時間
  fall: number | null; // 90% → 10% 下降時間
  pwidth: number | null; // 正脈寬
}

/** 示波器自動量測：對畫面上顯示的取樣點計算 */
export function measure(samples: number[], dt: number): Measurements {
  let vmax = -Infinity, vmin = Infinity, sum = 0, sq = 0;
  for (const v of samples) {
    if (v > vmax) vmax = v;
    if (v < vmin) vmin = v;
    sum += v;
    sq += v * v;
  }
  const n = samples.length || 1;
  const vavg = sum / n;
  // 頻率：用中間準位的穿越點間距估算（加遲滯避免雜訊）；上升緣不足兩個時改用下降緣
  const mid = (vmax + vmin) / 2;
  const hyst = (vmax - vmin) * 0.1;
  const rising: number[] = [], falling: number[] = [];
  let state: 'low' | 'high' | null = null;
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i];
    if (v < mid - hyst) { if (state === 'high') falling.push(i); state = 'low'; }
    else if (v > mid + hyst) { if (state === 'low') rising.push(i); state = 'high'; }
  }
  const edges = rising.length >= 2 ? rising : falling;
  let freq: number | null = null;
  if (edges.length >= 2 && vmax - vmin > 1e-6) {
    const span = (edges[edges.length - 1] - edges[0]) * dt;
    freq = (edges.length - 1) / span;
  }
  // 工作週期：完整週期（第一個到最後一個上升緣）內高於中間準位的時間比例
  let duty: number | null = null;
  const per = rising.length >= 2 ? rising : falling.length >= 2 ? falling : null;
  if (per) {
    let hi = 0;
    for (let i = per[0]; i < per[per.length - 1]; i++) if (samples[i] > mid) hi++;
    duty = hi / (per[per.length - 1] - per[0]);
  }
  // 上升 / 下降時間（10% ↔ 90%，線性內插穿越點）
  const lo = vmin + 0.1 * (vmax - vmin), hiL = vmin + 0.9 * (vmax - vmin);
  /** 在第 idx 個取樣附近的邊緣：往回找起點準位、往後找終點準位，兩者時間差 */
  const at = (i: number, level: number) => i - 1 + (level - samples[i - 1]) / (samples[i] - samples[i - 1] || 1);
  const edgeTime = (idx: number | undefined, up: boolean) => {
    if (idx === undefined || vmax - vmin < 1e-6) return null;
    const [l0, l1] = up ? [lo, hiL] : [hiL, lo];
    const passes = (i: number, level: number) => (up ? samples[i - 1] < level && samples[i] >= level : samples[i - 1] > level && samples[i] <= level);
    let s: number | null = null, e: number | null = null;
    for (let i = idx; i > 0; i--) if (passes(i, l0)) { s = at(i, l0); break; }
    for (let i = Math.max(1, idx); i < samples.length; i++) if (passes(i, l1)) { e = at(i, l1); break; }
    return s !== null && e !== null && e >= s ? (e - s) * dt : null;
  };
  const rise = edgeTime(rising[0], true), fall = edgeTime(falling[0], false);
  const period = freq ? 1 / freq : null;
  return {
    vmax, vmin, vpp: vmax - vmin, vrms: Math.sqrt(sq / n), vavg, freq, period, duty,
    rise, fall, pwidth: duty !== null && period ? duty * period : null,
  };
}

/** 1-2-5 檔位（示波器 VOLTS/DIV、TIME/DIV 旋鈕） */
function steps125(from: number, to: number): number[] {
  const out: number[] = [];
  for (let e = from; e <= to; e++) for (const m of [1, 2, 5]) out.push(m * 10 ** e);
  return out.map((v) => Number(v.toPrecision(3)));
}
export const TIME_DIVS = steps125(-8, 0); // 10 ns ~ 5 s
export const VOLT_DIVS = steps125(-3, 1).slice(0, -1); // 1 mV ~ 20 V → 取到 10 V
export const H_DIVS = 10;
export const V_DIVS = 8;

/** 單位格式化：1234 → "1.23 k" */
export function formatSI(value: number, unit: string, digits = 3): string {
  if (!isFinite(value)) return `-- ${unit}`;
  if (value === 0) return `0 ${unit}`;
  const prefixes: [number, string][] = [
    [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'],
  ];
  const abs = Math.abs(value);
  const [scale, p] = prefixes.find(([s]) => abs >= s * 0.9995) ?? prefixes[prefixes.length - 1];
  return `${Number((value / scale).toPrecision(digits))} ${p}${unit}`;
}
