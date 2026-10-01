// 頻譜分析儀的數學（純函式，不依賴 React / three）：
//   被量的訊號是週期訊號（產生器的波形，經過麵包板電路後仍然同週期），所以取「一個完整週期」做 FFT，
//   得到每一次諧波 k·f0 的振幅；畫面上每一條諧波依 RBW（解析頻寬）展開成高斯形狀，再加上儀器的雜訊底線。

export type SaUnit = 'dBm' | 'dBV';
export interface SaSettings {
  center: number; // 中心頻率 Hz
  span: number; // 頻寬 Hz
  ref: number; // 參考準位（畫面最上面那條線），單位跟 unit 一樣
  rbw: number; // 解析頻寬 Hz；0 = 自動
  unit: SaUnit;
  z50: boolean; // 輸入阻抗 50 Ω（true）或高阻抗 1 MΩ
  running: boolean;
  marker: number | null; // 標記的頻率
}

export const SA_FMAX = 100e6; // 量測範圍 DC ~ 100 MHz
export const DIVS = 10; // 垂直 10 格、每格 10 dB
export const DB_DIV = 10;
export const TRACE_POINTS = 601;
const DANL = -140; // 顯示平均雜訊準位 dBm/Hz（RBW 1 Hz 時）
const R = 50;

/** 第 k 次諧波：頻率與振幅（k = 0 是直流，vpk 就是直流電壓） */
export interface Harmonic { k: number; f: number; vpk: number }

// ---- FFT（radix-2，原地）----
export function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

/** 對一個週期取 M 點做 FFT，回傳各次諧波（只保留振幅大於 1 nV 的） */
export function harmonicsOf(v: (t: number) => number, f0: number, M = 4096): Harmonic[] {
  const re = new Float64Array(M), im = new Float64Array(M);
  for (let i = 0; i < M; i++) re[i] = v(i / M / f0);
  fft(re, im);
  const out: Harmonic[] = [{ k: 0, f: 0, vpk: re[0] / M }];
  for (let k = 1; k < M / 2; k++) {
    const vpk = (2 * Math.hypot(re[k], im[k])) / M;
    if (vpk > 1e-9) out.push({ k, f: k * f0, vpk });
  }
  return out;
}

/** 振幅（Vrms²）→ 畫面單位 */
export const toDb = (v2: number, unit: SaUnit) => (unit === 'dBm' ? 10 * Math.log10(v2 / R / 1e-3) : 10 * Math.log10(v2));
const rms2 = (h: Harmonic) => (h.k === 0 ? h.vpk * h.vpk : (h.vpk * h.vpk) / 2);
export const harmonicDb = (h: Harmonic, unit: SaUnit) => toDb(Math.max(rms2(h), 1e-30), unit);

const RBW_STEPS = [1, 3, 10, 30, 100, 300, 1e3, 3e3, 10e3, 30e3, 100e3, 300e3, 1e6, 3e6];
export const RBW_CHOICES = RBW_STEPS;
/** 自動 RBW：大約 Span / 300，取 1-3-10 檔位 */
export function effectiveRbw(s: SaSettings): number {
  if (s.rbw > 0) return s.rbw;
  const want = s.span / 300;
  return [...RBW_STEPS].reverse().find((r) => r <= want) ?? 1;
}
export const startFreq = (s: SaSettings) => Math.max(0, s.center - s.span / 2);
export const stopFreq = (s: SaSettings) => Math.min(SA_FMAX, startFreq(s) + s.span);

/**
 * 算畫面上的軌跡（每點的準位，單位跟設定一樣）。
 * noiseV2PerHz：輸入訊號本身的雜訊（產生器選 NOISE 時），會跟儀器雜訊底線一起顯示；rand 讓雜訊每次更新都在跳動
 */
export function buildTrace(h: Harmonic[], s: SaSettings, noiseV2PerHz = 0, noiseBw = 10e6, rand: () => number = Math.random): Float32Array {
  const rbw = effectiveRbw(s);
  const f0 = startFreq(s), f1 = stopFreq(s);
  const n = TRACE_POINTS, df = (f1 - f0) / (n - 1);
  const v2 = new Float64Array(n);
  for (const x of h) {
    if (x.f < f0 - 5 * rbw || x.f > f1 + 5 * rbw) continue;
    const p = rms2(x);
    const i0 = Math.max(0, Math.floor((x.f - 5 * rbw - f0) / df)), i1 = Math.min(n - 1, Math.ceil((x.f + 5 * rbw - f0) / df));
    for (let i = i0; i <= i1; i++) {
      const d = (2 * (f0 + i * df - x.f)) / rbw;
      v2[i] += p * 10 ** (-0.301 * d * d); // 高斯 RBW 濾波器：偏離 RBW/2 時 −3 dB
    }
  }
  const floorV2 = 1e-3 * 10 ** (DANL / 10) * rbw * R;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const f = f0 + i * df;
    const sigNoise = f <= noiseBw ? noiseV2PerHz * rbw : 0;
    // 雜訊功率是指數分布（跟真的頻譜分析儀一樣上下跳 ~5 dB）
    const noise = (floorV2 + sigNoise) * -Math.log(Math.max(1e-6, rand()));
    out[i] = toDb(v2[i] + noise, s.unit);
  }
  return out;
}

/** 範圍內的諧波由大到小（不含直流），給峰值搜尋 / 下一個峰值用 */
export function peaksInView(h: Harmonic[], s: SaSettings): Harmonic[] {
  const f0 = startFreq(s), f1 = stopFreq(s);
  return h.filter((x) => x.k > 0 && x.f >= f0 && x.f <= f1).sort((a, b) => b.vpk - a.vpk);
}

/** 總諧波失真 THD = √(V2² + V3² + …) ÷ V1（取到第 50 次諧波） */
export function thd(h: Harmonic[]): number | null {
  const v1 = h.find((x) => x.k === 1)?.vpk ?? 0;
  if (v1 < 1e-9) return null;
  let s = 0;
  for (const x of h) if (x.k >= 2 && x.k <= 50) s += x.vpk * x.vpk;
  return Math.sqrt(s) / v1;
}

export function fmtHz(f: number): string {
  const a = Math.abs(f);
  if (a >= 1e6) return `${+(f / 1e6).toPrecision(5)} MHz`;
  if (a >= 1e3) return `${+(f / 1e3).toPrecision(5)} kHz`;
  return `${+f.toPrecision(4)} Hz`;
}
