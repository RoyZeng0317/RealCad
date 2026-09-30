// FPGA 執行期：每幀把開關 / 按鍵 / 排針輸入送進電路、推進時脈，輸出寫到 LED、七段顯示器與 J1 排針
//   CLK_SEL（低頻）照實際時間跑；CLK_50MHz 在每幀的時間預算內能跑多少就跑多少（顯示實際模擬速度）
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { HdlSim, type WatchStat } from './hdlSim.js';
import { HdlError } from './verilogLang.js';
import { useFpga } from './fpgaStore.js';
import { setTone } from './fpgaAudio.js';
import type { Image, PinBit } from './fpgaBuild.js';
import { IO_PINS } from './fpgaBoard.js';
import { DEV_BOARDS } from '../boardDefs.js';
import { useDev, isPowered } from '../devStore.js';
import { MODE } from '../sketchRun.js';
import { getBench } from '../../bench.js';

/** 3D 模型每幀直接讀這裡（不經過 React 重繪）：0..1 = 那一幀裡高電位的比例 */
export const fpgaLive = {
  led: new Float32Array(8),
  seg: [new Float32Array(8).fill(1), new Float32Array(8).fill(1)],
  configured: false,
  spkHz: 0, // 喇叭頻率（3D 振膜抖動用）
};

const BUDGET_MS = 6;
const CHUNK = 256;

interface Live {
  img: Image; sim: HdlSim; nonce: number;
  clk50: number; clkSlow: number; slowAcc: number;
  inputs: PinBit[]; outputs: PinBit[];
  acc: Float64Array; samples: number;
  lastIn: Map<number, number>;
  cycles: number; ticks: number; rateT0: number; rateC0: number; rate: number;
  spk: { realT: number } | null; // 喇叭頻率量測區間
}

const k = 'fpga' as const;
const d = DEV_BOARDS.fpga;
const gndId = d.pins.find((p) => p.kind === 'GND')!.id;
const ioIndex = new Map(IO_PINS.map((p, i) => [p, i]));

function create(img: Image, nonce: number): Live {
  const sim = new HdlSim(img.design);
  const clkOf = (kind: string) => img.bits.find((b) => b.res?.kind === kind && img.design.ports[b.port].width === 1)?.sig ?? -1;
  const clk50 = clkOf('clk50'), clkSlow = clkOf('clkslow');
  const inputs = img.bits.filter((b) => b.dir === 'input' && b.sig !== clk50 && b.sig !== clkSlow);
  const outputs = img.bits.filter((b) => b.dir === 'output');
  const spk = outputs.find((b) => b.res?.kind === 'spk');
  if (spk) sim.watch = { sig: spk.sig, div: 2 ** spk.off, last: 0, stats: new Map() };
  return {
    spk: spk ? { realT: 0 } : null,
    img, sim, nonce, clk50, clkSlow, slowAcc: 0, inputs, outputs, acc: new Float64Array(outputs.length), samples: 0,
    lastIn: new Map(), cycles: 0, ticks: 0, rateT0: performance.now(), rateC0: 0, rate: 0,
  };
}

/** 讀一隻輸入腳現在的邏輯值 */
type Board = { sw: number; keys: number; reset: boolean; slides: number; sdCard: boolean; tfCard: boolean };
function readInput(b: PinBit, s: Board, l: Live): number {
  const r = b.res;
  if (!r) return 0;
  if (r.kind === 'sw') return (s.sw >> r.index) & 1;
  if (r.kind === 'key') return (s.keys >> r.index) & 1 ? 0 : 1; // 按下 = 0
  if (r.kind === 'rst') return s.reset ? 0 : 1;
  if (r.kind === 'slide') return (s.slides >> r.index) & 1;
  // 記憶卡：CD 有插卡 = 0；DAT0（MISO）有上拉電阻，卡片內容尚未模擬所以固定讀到 1
  if (r.kind === 'sd' || r.kind === 'tf') return r.index === 4 ? ((r.kind === 'sd' ? s.sdCard : s.tfCard) ? 0 : 1) : 1;
  if (r.kind === 'io') {
    const bench = getBench();
    const v = bench.holeV(`h:${k}:IO${r.index}`);
    const g = bench.sol.nodeV[bench.netOfHole(`h:${k}:${gndId}`)] ?? 0;
    const last = l.lastIn.get(b.pin) ?? 0;
    const x = v === null ? last : v - g >= d.vih ? 1 : v - g <= d.vil ? 0 : last;
    l.lastIn.set(b.pin, x);
    return x;
  }
  return r.dir === 'out' ? 1 : 0;
}

export function FpgaRuntime() {
  const live = useRef<Live | null>(null);
  const wasOn = useRef(false);
  const lastStats = useRef(0);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1);
    const dev = useDev.getState();
    const on = isPowered(dev, k);
    const fs = useFpga.getState();
    if (on !== wasOn.current) { wasOn.current = on; fs.powerChange(on); }
    const st = useFpga.getState();

    if (!on || !st.sram || st.runtimeError) {
      live.current = null;
      fpgaLive.spkHz = 0;
      setTone(0);
      if (st.spkHz) st.patch({ spkHz: 0 });
      fpgaLive.configured = false;
      fpgaLive.led.fill(0);
      fpgaLive.seg.forEach((s) => s.fill(1)); // 未設定時 I/O 是高阻抗 + 弱上拉：共陽極七段不亮
      const rt = dev.rt[k];
      const status = !on ? 'off' : st.runtimeError ? 'error' : 'stopped';
      if (rt.status !== status || Object.keys(rt.pins).length) dev.patchRt(k, { status, pins: {} });
      return;
    }
    let l = live.current;
    if (!l || l.nonce !== st.nonce || l.img !== st.sram) {
      try { l = live.current = create(st.sram, st.nonce); }
      catch (e) { useFpga.getState().patch({ runtimeError: e instanceof Error ? e.message : String(e) }); return; }
      dev.patchRt(k, { status: 'running', pins: {} });
    }
    const L = l;
    const { sim } = L;
    try {
      // 輸入
      const byPort = new Map<number, number>();
      for (const b of L.inputs) {
        const v = readInput(b, st, L);
        byPort.set(b.sig, (byPort.get(b.sig) ?? 0) + v * 2 ** b.off);
      }
      let changed = false;
      for (const [sig, v] of byPort) if (sim.v[sig] !== v) { sim.set(sig, v); changed = true; }
      if (changed) sim.propagate();

      L.acc.fill(0);
      L.samples = 0;
      const sample = () => {
        for (let i = 0; i < L.outputs.length; i++) { const b = L.outputs[i]; L.acc[i] += Math.floor(sim.v[b.sig] / 2 ** b.off) % 2; }
        L.samples++;
      };
      // 低頻時脈：照實際時間
      if (L.clkSlow >= 0) {
        L.slowAcc += dt * st.slowHz;
        const n = Math.min(Math.floor(L.slowAcc), 4000);
        L.slowAcc -= Math.floor(L.slowAcc);
        for (let i = 0; i < n; i++) { sim.clock(L.clkSlow, 1); L.ticks++; if (n < 64 || i % 16 === 0) sample(); }
      }
      // 50 MHz：時間預算內盡量跑
      if (L.clk50 >= 0) {
        const t0 = performance.now();
        do { sim.clock(L.clk50, CHUNK); L.cycles += CHUNK; sample(); } while (performance.now() - t0 < BUDGET_MS);
      }
      sample();
      // 喇叭：模擬時間內切換了幾次 → 頻率（切換 2 次 = 1 個週期）
      if (L.spk && sim.watch) {
        L.spk.realT += dt;
        // 取切換最多的那個時脈：頻率 = (切換次數 − 1) / 2 ÷ 第一次到最後一次切換經過的模擬時間
        let best: WatchStat | null = null, bestSig = -1;
        for (const [sig, s] of sim.watch.stats) if (!best || s.n > best.n) { best = s; bestSig = sig; }
        const n = best?.n ?? 0;
        const fclk = bestSig === L.clk50 ? 50e6 : st.slowHz;
        if (best && n >= 3 && best.lastAt > best.first && (n >= 16 || L.spk.realT > 1)) {
          fpgaLive.spkHz = ((n - 1) / 2) * fclk / (best.lastAt - best.first);
          sim.watch.stats.clear();
          L.spk.realT = 0;
        } else if (fpgaLive.spkHz > 0) {
          // 超過 3 個週期都沒再切換 → 停止發聲
          const since = best ? best.cyc - (n ? best.lastAt : 0) : 0;
          if (since > (3 * fclk) / fpgaLive.spkHz) { fpgaLive.spkHz = 0; sim.watch.stats.clear(); L.spk.realT = 0; }
        } else if (L.spk.realT > 30) { sim.watch.stats.clear(); L.spk.realT = 0; }
      } else fpgaLive.spkHz = 0;
    } catch (e) {
      useFpga.getState().patch({ runtimeError: e instanceof HdlError ? `${e.message}${e.line ? `（第 ${e.line} 行）` : ''}` : String(e) });
      return;
    }

    // 輸出
    fpgaLive.configured = true;
    fpgaLive.led.fill(0);
    fpgaLive.seg.forEach((s) => s.fill(1));
    const pins: Record<string, { mode: number; level: number }> = {};
    L.outputs.forEach((b, i) => {
      const lv = L.acc[i] / L.samples;
      const r = b.res;
      if (!r) return;
      if (r.kind === 'led') fpgaLive.led[r.index] = lv;
      else if (r.kind === 'seg0') fpgaLive.seg[0][r.index] = lv;
      else if (r.kind === 'seg1') fpgaLive.seg[1][r.index] = lv;
      else if (r.kind === 'io') pins[`IO${r.index}`] = { mode: MODE.OUTPUT, level: Math.round(lv * 64) / 64 };
    });
    for (const b of L.inputs) {
      const i = ioIndex.get(b.pin);
      if (i !== undefined && !pins[`IO${i}`]) pins[`IO${i}`] = { mode: MODE.INPUT, level: 0 };
    }
    const rt = useDev.getState().rt[k];
    const dead = new Set(rt.dead);
    for (const id of dead) delete pins[id];
    if (JSON.stringify(pins) !== JSON.stringify(rt.pins)) useDev.getState().patchRt(k, { pins });

    setTone(st.speaker ? fpgaLive.spkHz : 0);
    const hz = Math.round(fpgaLive.spkHz);
    if (Math.abs(hz - st.spkHz) > Math.max(1, st.spkHz * 0.02)) useFpga.getState().patch({ spkHz: hz });

    // 模擬速度（每 0.5 秒更新一次）
    const now = performance.now();
    if (now - lastStats.current > 500) {
      L.rate = ((L.cycles - L.rateC0) / (now - L.rateT0)) * 1000;
      L.rateT0 = now; L.rateC0 = L.cycles;
      lastStats.current = now;
      useFpga.getState().patch({ stats: { rate: L.rate, cycles: L.cycles, slowTicks: L.ticks } });
    }
  });
  return null;
}
