// 頻譜分析儀量到的訊號：
//   沒接探棒時，用 BNC T 頭直接接函數產生器輸出（輸入阻抗 50 Ω 時，產生器 50 Ω 內阻 + 50 Ω 負載 → 電壓剩一半，−6 dB，跟真機一樣）；
//   接了探棒（+ / −）就量麵包板上那兩點（沿用示波器的轉換曲線，所以二極體整流等非線性產生的諧波都看得到）
import { useBoard } from './boardStore.js';
import { useWaveLab } from './waveStore.js';
import { useSa } from './saStore.js';
import { getBench, fgDc } from './bench.js';
import { transferOf, probeValue } from './scopeLink.js';
import { sampleWave } from './waveform.js';
import { harmonicsOf, peaksInView, harmonicDb, effectiveRbw, type Harmonic } from './spectrum.js';
import type { HoleKey } from './boardModel.js';

export interface SaInput {
  harmonics: Harmonic[];
  noiseV2PerHz: number; // 產生器選 NOISE 時的白雜訊功率密度
  f0: number;
  source: string; // 給畫面顯示：量的是哪裡
}

/** 頻譜分析儀實際量的兩點；null = 直接接產生器輸出（或產生器接在麵包板上時，看產生器輸出端） */
export function saLead(): [HoleKey, HoleKey] | null {
  const { leads } = useBoard.getState();
  return leads.sa ?? leads.fg ?? null;
}

let cache: { key: unknown[]; input: SaInput } | null = null;

export function getSaInput(): SaInput {
  const gen = useWaveLab.getState().gen;
  const { leads } = useBoard.getState();
  const { z50 } = useSa.getState().sa;
  const key = [gen, getBench(), leads, z50];
  if (cache && cache.key.every((v, i) => v === key[i])) return cache.input;

  const lead = saLead();
  const on = gen.power && gen.output;
  // 直接接產生器（沒經過麵包板）：50 Ω 輸入時分壓一半
  const direct = !lead && !fgDc();
  const gain = direct && z50 ? 0.5 : 1;
  const tr = lead ? transferOf(lead[0], lead[1]) : null;
  const v = (t: number) => (tr ? probeValue(tr, sampleWave(gen, t)) : sampleWave(gen, t) * gain);
  let harmonics: Harmonic[];
  let noiseV2PerHz = 0;
  if (!on) {
    harmonics = [{ k: 0, f: 0, vpk: tr ? probeValue(tr, 0) : 0 }];
  } else if (gen.waveform === 'noise') {
    // 雜訊不是週期訊號：直流成分 = 偏移，其餘是平坦的白雜訊（產生器頻寬 10 MHz）
    const sigma = (gen.amplitude / 2) * (0.5 / 1.5) * gain;
    const slope = tr ? (probeValue(tr, gen.offset + 0.01) - probeValue(tr, gen.offset - 0.01)) / 0.02 : 1;
    harmonics = [{ k: 0, f: 0, vpk: tr ? probeValue(tr, gen.offset) : gen.offset * gain }];
    noiseV2PerHz = (sigma * slope) ** 2 / 10e6;
  } else {
    harmonics = harmonicsOf(v, gen.frequency);
  }
  const source = lead
    ? (useBoard.getState().leads.sa ? '探棒量麵包板' : '產生器輸出端（接在麵包板上）')
    : `BNC 直接接產生器（輸入 ${z50 ? '50 Ω' : '1 MΩ'}）`;
  const input = { harmonics, noiseV2PerHz, f0: gen.frequency, source };
  cache = { key, input };
  return input;
}

// ---- 面板與 3D 按鍵共用的操作（峰值搜尋、下一個峰值、快速設定）----

/** 峰值搜尋：標記放到畫面範圍內最大的諧波 */
export function peakSearch() {
  const { sa, setSa } = useSa.getState();
  const p = peaksInView(getSaInput().harmonics, sa)[0];
  if (p) setSa({ marker: p.f });
}

/** 下一個峰值：比目前標記小一階的諧波（沒有標記時等於峰值搜尋） */
export function nextPeak() {
  const { sa, setSa } = useSa.getState();
  const peaks = peaksInView(getSaInput().harmonics, sa);
  if (!peaks.length) return;
  const i = sa.marker === null ? -1 : peaks.findIndex((p) => Math.abs(p.f - sa.marker!) < 1e-6 * p.f + 1e-9);
  setSa({ marker: peaks[(i + 1) % peaks.length].f });
}

/** 快速設定：'fund' = 對準基頻（Span = 基頻）；'harm' = 從 0 Hz 看到第 10 次諧波 */
export function saPreset(kind: 'fund' | 'harm') {
  const f0 = useWaveLab.getState().gen.frequency;
  const { setSa } = useSa.getState();
  if (kind === 'fund') setSa({ center: f0, span: f0, marker: f0 });
  else setSa({ center: 5.25 * f0, span: 10.5 * f0, marker: f0 });
}

/** 標記處的讀值：取離標記最近的諧波（標記在諧波之間時讀雜訊底線附近，回傳 null） */
export function markerLevel(): { f: number; db: number } | null {
  const { sa } = useSa.getState();
  if (sa.marker === null) return null;
  const h = getSaInput().harmonics.find((x) => Math.abs(x.f - sa.marker!) <= effectiveRbw(sa) / 2);
  return h ? { f: sa.marker, db: harmonicDb(h, sa.unit) } : null;
}
