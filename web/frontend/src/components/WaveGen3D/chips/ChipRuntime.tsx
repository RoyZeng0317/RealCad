// 麵包板 IC 執行期：每幀量 VCC / RESET、跑 ATmega328P 的程式（沿用 Arduino C 直譯器），
// 腳位輸出寫回 chipStore（電路求解會用到）；序列埠輸出只有接到 CH340 的 RXD 才會出現在電腦上
import { useFrame } from '@react-three/fiber';
import { useBoard } from '../boardStore.js';
import { getBench } from '../bench.js';
import { compile } from '../devboards/compile.js';
import { SketchRunner, MODE, type Hal } from '../devboards/sketchRun.js';
import { SketchError } from '../devboards/sketchLang.js';
import type { PinRt } from '../devboards/devStore.js';
import type { BoardPart } from '../boardParts.js';
import { useChips, chipRt } from './chipStore.js';
import { AT, CH, ARDUINO_TO_DIP, PWM_PINS } from './chipDefs.js';

interface Live { runner: SketchRunner; boot: number; flash: string; t0: number; pins: Record<number, PinRt>; serial: string; last: Map<number, number> }
const live = new Map<string, Live>();
const SERIAL_MAX = 12000;
const round = (v: number) => Math.round(v * 20) / 20;

function makeHal(part: BoardPart, L: () => Live): Hal {
  const b = () => getBench();
  const volts = (i: number) => {
    const v = b().holeV(part.pins[i]);
    const g = b().holeV(part.pins[AT.GND]) ?? 0;
    return v === null ? null : v - g;
  };
  const dip = (n: number, line: number) => {
    const i = ARDUINO_TO_DIP[n];
    if (i === undefined) throw new SketchError(`ATmega328P 沒有腳位 ${n}（D0–D13、A0–A5 = 14–19）`, line);
    return i;
  };
  const vcc = () => chipRt(useChips.getState(), part.id).vcc;
  const set = (i: number, mode: number, level: number) => { L().pins = { ...L().pins, [i]: { mode, level } }; };
  return {
    intBits: 16,
    consts: { LED_BUILTIN: 13, A0: 14, A1: 15, A2: 16, A3: 17, A4: 18, A5: 19, SDA: 18, SCL: 19 },
    pinMode(n, mode, line) {
      if (mode === MODE.INPUT_PULLDOWN) throw new SketchError('ATmega328P 沒有內建下拉電阻（INPUT_PULLDOWN）', line);
      const i = dip(n, line);
      set(i, mode, L().pins[i]?.level ?? 0);
    },
    digitalWrite(n, v, line) {
      const i = dip(n, line);
      const c = L().pins[i];
      // AVR：對輸入腳寫 HIGH 會打開內建上拉
      if (!c || c.mode !== MODE.OUTPUT) { set(i, v ? MODE.INPUT_PULLUP : MODE.INPUT, 0); return; }
      set(i, MODE.OUTPUT, v ? 1 : 0);
    },
    digitalRead(n, line) {
      const i = dip(n, line);
      const v = volts(i), c = L().pins[i];
      const last = L().last.get(i) ?? 0;
      let r = last;
      if (v === null) r = c?.mode === MODE.INPUT_PULLUP ? 1 : Math.random() < 0.5 ? 0 : 1;
      else if (v >= 0.6 * vcc()) r = 1;
      else if (v <= 0.3 * vcc()) r = 0;
      L().last.set(i, r);
      return r;
    },
    analogWrite(n, duty, line) {
      const i = dip(n, line);
      set(i, MODE.OUTPUT, PWM_PINS.includes(n) ? duty : duty >= 0.5 ? 1 : 0);
    },
    analogRead(n, line) {
      if (n < 14 && !(n >= 0 && n <= 5)) throw new SketchError(`腳位 ${n} 不能類比讀取（用 A0–A5）`, line);
      const i = dip(n < 14 ? n + 14 : n, line);
      const v = volts(i);
      const ref = (b().holeV(part.pins[AT.AVCC]) ?? 0) - (b().holeV(part.pins[AT.GND]) ?? 0);
      if (v === null || ref < 1) return Math.round(1023 * (0.3 + Math.random() * 0.4));
      return Math.max(0, Math.min(1023, Math.round((v / ref) * 1023)));
    },
    // 用到序列埠時 TXD（第 3 腳）變成輸出，閒置為高電位（UART 閒置狀態）
    print(text) {
      if (L().pins[AT.TXD]?.mode !== MODE.OUTPUT) set(AT.TXD, MODE.OUTPUT, 1);
      L().serial += text;
    },
    millis: () => performance.now() - L().t0,
  };
}

export function ChipRuntime() {
  useFrame(() => {
    const parts = useBoard.getState().parts;
    const bench = getBench();
    const cs = useChips.getState();
    const now = performance.now();
    const ids = new Set(parts.map((p) => p.id));
    for (const id of [...live.keys()]) if (!ids.has(id)) live.delete(id);
    const V = (p: BoardPart, i: number) => bench.holeV(p.pins[i]);

    for (const p of parts) {
      if (p.kind !== 'atmega' && p.kind !== 'ch340') continue;
      const r = chipRt(cs, p.id);
      const gnd = V(p, p.kind === 'atmega' ? AT.GND : CH.GND);
      const vccRaw = V(p, p.kind === 'atmega' ? AT.VCC : CH.VCC);
      const vcc = vccRaw === null || gnd === null ? 0 : round(Math.max(0, vccRaw - gnd));
      if (vcc !== r.vcc) cs.patch(p.id, { vcc }, true);
      if (p.kind === 'ch340') {
        const status = vcc >= 3.0 ? 'running' : 'off';
        if (r.status !== status) cs.patch(p.id, { status });
        continue;
      }

      // ATmega328P
      const rstV = V(p, AT.RESET);
      const inReset = vcc >= 1.8 && rstV !== null && rstV - (gnd ?? 0) < 0.3 * vcc;
      const flash = p.flash ?? '';
      const idle = vcc < 1.8 ? 'off' : inReset ? 'reset' : !flash ? 'empty' : null;
      if (idle) {
        live.delete(p.id);
        if (r.status !== idle || Object.keys(r.pins).length) cs.patch(p.id, { status: idle, pins: {} }, true);
        continue;
      }
      let l = live.get(p.id);
      if (!l || l.boot !== r.boot || l.flash !== flash) {
        const c = compile(flash, 'c');
        if (c.error) { if (r.status !== 'error') cs.patch(p.id, { status: 'error', error: c.error, pins: {} }, true); continue; }
        const holder = { current: null as unknown as Live };
        l = { runner: null as unknown as SketchRunner, boot: r.boot, flash, t0: now, pins: {}, serial: '', last: new Map() };
        holder.current = l;
        l.runner = new SketchRunner(c.ok.start(makeHal(p, () => holder.current)), now);
        live.set(p.id, l);
      }
      const state = l.runner.step(now);
      const status = state;
      const patch: Partial<typeof r> = {};
      let elec = false;
      if (r.status !== status) patch.status = status;
      if (state === 'error' && !r.error) patch.error = l.runner.error;
      if (l.pins !== r.pins) { patch.pins = l.pins; elec = true; }
      // 序列埠：ATmega TXD（第 3 腳）要接到有上電的 CH340 RXD（第 3 腳）才會送到電腦
      const txNet = bench.netOfHole(p.pins[AT.TXD]);
      const linked = parts.some((c) => c.kind === 'ch340' && chipRt(cs, c.id).vcc >= 3.0 && bench.netOfHole(c.pins[CH.RXD]) === txNet);
      if (linked !== r.txLinked) patch.txLinked = linked;
      if (l.serial) {
        if (linked) patch.serial = (r.serial + l.serial).slice(-SERIAL_MAX);
        l.serial = '';
      }
      if (Object.keys(patch).length) cs.patch(p.id, patch, elec);
    }
  });
  return null;
}
