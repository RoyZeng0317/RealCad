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
  // 頻率：用中間準位的上升穿越點間距估算，至少要看到兩個完整週期的穿越點
  const mid = (vmax + vmin) / 2;
  const hyst = (vmax - vmin) * 0.1;
  const crossings: number[] = [];
  let armed = false;
  for (let i = 1; i < samples.length; i++) {
    if (samples[i] < mid - hyst) armed = true;
    if (armed && samples[i - 1] < mid && samples[i] >= mid) {
      crossings.push(i);
      armed = false;
    }
  }
  let freq: number | null = null;
  if (crossings.length >= 2 && vmax - vmin > 1e-6) {
    const span = (crossings[crossings.length - 1] - crossings[0]) * dt;
    freq = (crossings.length - 1) / span;
  }
  return { vmax, vmin, vpp: vmax - vmin, vrms: Math.sqrt(sq / n), vavg, freq };
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
